// PartyServer-комната «Тысяча» — ЕДИНСТВЕННЫЙ источник истины для игры.
//
// PartyServer — преемник PartyKit (хостинг partykit.dev закрыт 23.10.2026,
// вместе с `npx partykit deploy`). Та же авторитарная модель «сервер-комната»,
// но как обычный Cloudflare Worker + Durable Object на НАШЕМ аккаунте Cloudflare;
// деплой через `wrangler`. Клиент — чистая статика на GitHub Pages.
//
// Модель: сервер хранит авторитетное состояние, клиенты шлют только интенты,
// сервер применяет gameReducer и рассылает полный снапшот всем. Роли «хост»
// для авторитета нет (один инстанс DO на комнату => нет split-brain). hostId
// остаётся только для админ-действий (старт / новая игра / кик / промоут).
//
// Клиентский протокол (JSON поверх WebSocket /parties/main/<room>):
//   -> { type: 'HELLO', sessionId, playerName, asSpectator }    // вход/переподключение
//   -> { type: 'INTENT', action, sessionId, msgId }             // игровое действие
//   -> { type: 'PLAYER_LEAVE', sessionId }
//   -> { type: 'PING', sessionId }                               // heartbeat
//   -> { type: 'REQUEST_STATE', sessionId }
//   <- { type: 'SET_STATE', payload }                            // снапшот всем
//   <- { type: 'CHECK_RESULT', exists, hostName, playerCount }   // ответ на GET ?check=1
//   <- { type: 'ERROR', error, sessionId }
//
// Состояние персистится в DO storage, чтобы переживать перезапуск инстанса.
//
// ВАЖНО: hibernation ВЫКЛЮЧЕН (мы не ставим static options.hibernate = true).
// Игровые presence/dedup-карты живут в памяти инстанса; при hibernate onMessage
// может вызываться без них. Комнат мало (2-5 игроков), надёжность важнее.

// @ts-ignore — общий редьюсер переиспользуется и на сервере, и на клиенте.
import { gameReducer } from '../utils/gameReducer.js';
// @ts-ignore
import { createInitialState } from '../utils/gameLogic.js';
import { Server, routePartykitRequest } from 'partyserver';

// Ключ хранилища состояния комнаты. Смена ключа = сброс всех комнат: DO
// читают новый ключ, ничего не находят и стартуют с пустого состояния, а
// старые данные под прежним ключом становятся недостижимыми.
const STORAGE_KEY = '***';
// Поколение состояния. Увеличь STATE_EPOCH (или смени STORAGE_KEY), чтобы
// принудительно сбросить ВСЕ комнаты, включая тёплые инстансы DO, которые
// иначе держат старое состояние в памяти и не перечитывают storage.
const EPOCH_KEY = '***';
const STATE_EPOCH = 2;
const PRESENCE_TICK_MS = 10000;   // как часто sweeping-аларм проверяет presence
const OFFLINE_AFTER_MS = 45000;   // нет PING дольше — игрок считается offline
const SEEN_CAP = 5000;            // потолок карты дедупликации интентов
const MAX_SPECTATORS = 20;        // потолок зрителей: без него флуд соединений раздувает снапшот
const MAX_JOIN_REQUESTS = 10;     // потолок заявок на вход
// Комната без подключений и без активности дольше этого срока считается мёртвой
// и при холодном пробуждении сбрасывается в чистое состояние.
const ROOM_TTL_MS = 60 * 60 * 1000; // 1 час

// Действия, которые может слать только хост (hostId в состоянии).
const ADMIN_ACTIONS = new Set([
    'START_OFFICIAL_GAME',
    'NEW_GAME',
    'KICK_PLAYER',
    'PROMOTE_TO_HOST',
    'APPROVE_JOIN',
    'REJECT_JOIN',
]);

// Действия, которые может слать только текущий игрок.
const GAMEPLAY_ACTIONS = new Set([
    'ROLL_DICE',
    'TOGGLE_DIE_SELECTION',
    'KEEP_DICE',
    'BANK_SCORE',
    'SKIP_TURN',
]);

export class TysiachaRoom extends Server {
    /** @type {any} авторитетное игровое состояние (не this.state — это статус DO). */
    game = null;
    /** @type {Map<string, number>} sessionId -> lastSeen (мс). */
    presence = new Map();
    /** @type {Map<string, string>} connectionId -> sessionId. */
    connSession = new Map();
    /** @type {Map<string, number>} "sessionId:msgId" -> ts (дедуп интентов). */
    seen = new Map();
    /** @type {Promise<void>|null} однократная загрузка состояния из storage. */
    _loading = null;
    /** @type {number|null} поколение состояния, загруженное в this.game. */
    _loadedEpoch = null;

    // --- загрузка авторитетного состояния (ленивая, однократная) ---
    async ensureLoaded() {
        // Тёплый инстанс держит this.game в памяти и обычно не перечитывает
        // storage. Если поколение кода сменилось (сброс) — заставляем перечитать:
        // storage под новым STORAGE_KEY пуст => комната стартует с нуля.
        if (this.game && this._loadedEpoch === STATE_EPOCH) return;
        if (!this._loading) {
            this._loading = (async () => {
                try {
                    const storedEpoch = await this.ctx.storage.get(EPOCH_KEY);
                    let stored = null;
                    if (storedEpoch === STATE_EPOCH) {
                        stored = await this.ctx.storage.get(STORAGE_KEY);
                    } else {
                        // Поколение сменилось (или комната новая): игнорируем
                        // старое состояние, стартуем пусто и запоминаем поколение.
                        stored = null;
                        try { await this.ctx.storage.put(EPOCH_KEY, STATE_EPOCH); } catch (e) { /* ignore */ }
                    }
                    this.game = stored || createInitialState();
                    // Защита от испорченного снапшота в хранилище: состояние должно
                    // быть объектом с массивом игроков, иначе комната служит мусором
                    // всем новым клиентам.
                    if (!this.game || typeof this.game !== 'object' || !Array.isArray(this.game.players)) {
                        this.game = createInitialState();
                    }
                    // Бэкфилл полей, добавленных после создания комнаты:
                    // старые снапшоты из DO-хранилища их не содержат.
                    if (typeof this.game.rollNonce !== 'number') this.game.rollNonce = 0;
                    if (!Array.isArray(this.game.spectators)) this.game.spectators = [];
                    if (!Array.isArray(this.game.joinRequests)) this.game.joinRequests = [];
                    if (typeof this.game.joinErrors !== 'object' || !this.game.joinErrors) this.game.joinErrors = {};
                    this._loadedEpoch = STATE_EPOCH;
                } catch (e) {
                    this.game = createInitialState();
                    this._loadedEpoch = STATE_EPOCH;
                }
            })();
        }
        await this._loading;
    }

    // --- персистентность: fire-and-forget, не блокируем рассылку ---
    persist() {
        if (!this.game) return;
        // Штамп последней активности — для авто-очистки мёртвых комнат.
        this.game.lastActivityTs = Date.now();
        Promise.resolve(this.ctx.storage.put(STORAGE_KEY, this.game)).catch((e) => {
            console.error('[room] storage.put failed', e);
        });
    }

    // --- рассылка полного снапшота всем (кроме excludeConnId) ---
    broadcastState(excludeConnId) {
        if (!this.game) return;
        const msg = JSON.stringify({ type: 'SET_STATE', payload: this.game });
        try {
            this.broadcast(msg, excludeConnId ? [excludeConnId] : []);
        } catch (e) {
            console.error('[room] broadcast failed', e);
        }
    }

    // --- применение интента через общий редьюсер + персист + рассылка ---
    applyAction(action) {
        if (!action || !action.payload) action = { ...action, payload: {} };
        let next;
        try {
            next = gameReducer(this.game, action);
        } catch (e) {
            // Кривой payload от клиента не должен ронять комнату.
            console.error('[room] reducer failed', action && action.type, e);
            return false;
        }
        if (next === this.game) return false; // редьюсер ничего не изменил
        this.game = next;
        this.persist();
        this.broadcastState();
        return true;
    }

    // --- проверка, что интент не дубликат (по sessionId:msgId) ---
    isDuplicate(sessionId, msgId) {
        if (msgId === undefined || msgId === null) return false;
        const key = `${sessionId}:${msgId}`;
        if (this.seen.has(key)) return true;
        this.seen.set(key, Date.now());
        if (this.seen.size > SEEN_CAP) {
            // сбрасываем самые старые, чтобы карта не росла бесконечно
            const cutoff = Date.now() - 120000;
            for (const [k, ts] of this.seen) {
                if (ts < cutoff) this.seen.delete(k);
            }
        }
        return false;
    }

    // --- найти id соединения по sessionId ---
    connIdForSession(sessionId) {
        for (const [connId, sid] of this.connSession) {
            if (sid === sessionId) return connId;
        }
        return null;
    }

    // --- presence: пометить сессию живой ---
    touch(sessionId) {
        if (!sessionId) return;
        this.presence.set(sessionId, Date.now());
    }

    // --- presence: прогнать offline-игроков (нет PING дольше OFFLINE_AFTER_MS) ---
    sweepPresence() {
        if (!this.game) return;
        const now = Date.now();
        let changed = false;
        for (const p of this.game.players) {
            if (!p.isClaimed || p.status !== 'online' || !p.sessionId) continue;
            const last = this.presence.get(p.sessionId);
            if (last && now - last > OFFLINE_AFTER_MS) {
                this.applyAction({ type: 'PLAYER_DISCONNECT', payload: { sessionId: p.sessionId } });
                this.presence.delete(p.sessionId);
                changed = true;
            }
        }
        // Зрители: выметаем «призраков» — от кого давно нет PING (закрыли
        // вкладку без PLAYER_LEAVE). Иначе один человек мог числиться в
        // зрителях дважды: старый слот висел, новый вход добавлял второй.
        for (const s of (this.game.spectators || [])) {
            const last = this.presence.get(s.id);
            if (!last || now - last > OFFLINE_AFTER_MS) {
                this.applyAction({ type: 'PLAYER_LEAVE', payload: { sessionId: s.id } });
                if (last) this.presence.delete(s.id);
                changed = true;
            }
        }
        // Если ход застрял на offline-игроке — передаём ход. Иначе партия
        // встаёт навсегда: передать ход может только текущий игрок.
        const stuckIdx = this.game.currentPlayerIndex;
        const stuck = (this.game.players || [])[stuckIdx];
        if (stuck && stuck.isClaimed && stuck.status !== 'online') {
            this.applyAction({ type: 'SKIP_TURN' });
            changed = true;
        }
        return changed;
    }

    // Есть ли живые WebSocket-подключения прямо сейчас. Пока их нет — комната
    // никого не обслуживает и будить себя каждые 10 с не обязана (это жрёт
    // дневную квоту Durable Objects).
    hasLiveConnections() {
        return this.connSession.size > 0;
    }

    // --- планируем следующий sweeping-аларм (только пока есть кому отвечать) ---
    schedulePresenceTick() {
        // Без живых подключений аларм не ставим: DO выгрузится, запросы перестанут
        // течь. При следующем заходе onStart/onConnect перезапланирует тик.
        if (!this.hasLiveConnections()) return;
        try {
            this.ctx.storage.setAlarm(Date.now() + PRESENCE_TICK_MS);
        } catch (e) {
            console.error('[room] setAlarm failed', e);
        }
    }

    // --- DO стартовал (первый запрос или аларм) ---
    async onStart() {
        await this.ensureLoaded();
        await this.maybeExpireDeadRoom();
        this.schedulePresenceTick();
    }

    // --- срабатывание аларма: sweeping presence + перепланировать (если живы) ---
    async onAlarm() {
        await this.ensureLoaded();
        this.sweepPresence();
        // Перепланируем только при живых подключениях; иначе комната засыпает.
        this.schedulePresenceTick();
    }

    // --- ленивая авто-очистка мёртвых комнат при холодном пробуждении ---
    // Комната без подключений, в которую не заходили дольше ROOM_TTL_MS, считается
    // мёртвой: сбрасываем её состояние в чистое, чтобы не копить мусор в storage.
    // Дешёвая проверка по lastActivityTs; срабатывает только на onStart (холодный
    // старт), поэтому не тратит квоту на пустых комнат.
    async maybeExpireDeadRoom() {
        if (this.hasLiveConnections()) return;
        if (!this.game) return;
        const last = this.game.lastActivityTs || this.game.createdAt || 0;
        if (last && Date.now() - last > ROOM_TTL_MS) {
            this.game = createInitialState();
            this.persist();
        }
    }

    // --- новое WebSocket-соединение ---
    async onConnect(connection) {
        await this.ensureLoaded();
        // Заход игрока — активность: оживляет комнату, близкую к авто-очистке.
        if (this.game) this.game.lastActivityTs = Date.now();
        this.schedulePresenceTick();
        // Снапшот новому подключению — сразу, чтобы успел отрисоваться.
        if (this.game) {
            try {
                connection.send(JSON.stringify({ type: 'SET_STATE', payload: this.game }));
            } catch (e) { /* connection мог закрыться */ }
        }
    }

    // --- сообщение от клиента. ВНИМАНИЕ: в PartyServer аргументы ПЕРЕСТАВЛЕНЫ
    //     относительно PartyKit: сначала connection, потом message. ---
    async onMessage(connection, message) {
        await this.ensureLoaded();

        let data;
        try { data = JSON.parse(message); } catch (e) { return; }
        if (!data || typeof data.type !== 'string') return;

        // HELLO — единственное сообщение, которое задаёт идентичность.
        // Всё остальное авторизуется по сессии, привязанной к СОЕДИНЕНИЮ:
        // sessionId из тела больше не является доверенным (иначе любой сокет
        // действовал от имени любого игрока, скопировав его sessionId).
        const connSid = this.connSession.get(connection.id);
        const bodySid = data.sessionId;
        const reject = (error) => {
            try {
                connection.send(JSON.stringify({ type: 'ERROR', error, sessionId: connSid || bodySid }));
            } catch (e) { /* ignore */ }
        };

        if (data.type !== 'HELLO' && !connSid) {
            reject('Сначала HELLO');
            return;
        }
        if (connSid && bodySid && bodySid !== connSid) {
            reject('Несоответствие сессии');
            return;
        }
        const sessionId = connSid || bodySid;

        switch (data.type) {
            case 'HELLO': {
                if (!bodySid) return;
                this.connSession.set(connection.id, bodySid);
                this.touch(bodySid);

                // Зритель/игрок решается на сервере:
                //  - вернувшийся игрок (его sessionId стоит на заявленном слоте)
                //    остаётся игроком, даже если клиент прислал asSpectator — иначе
                //    после реконнекта одобренный игрок откатывался в зрители;
                //  - новый участник в начатой партии — зритель;
                //  - в лобби — как прислал клиент.
                // Возврат узнаётся по устройству, а не только по сессии:
                // sessionId меняется при каждой вкладке, deviceId стабилен.
                // Если на заявленном слоте стоит этот deviceId (или этот
                // sessionId) — это вернувшийся игрок, а не новый зритель.
                const bodyDev = typeof data.deviceId === 'string' ? data.deviceId : null;
                const reconnectSlot = (this.game.players || []).some(
                    (p) => p.isClaimed && (
                        p.sessionId === bodySid ||
                        (bodyDev && p.deviceId === bodyDev)
                    )
                );
                let asSpectator;
                if (reconnectSlot) asSpectator = false;
                else if (this.game.isGameStarted) asSpectator = true;
                else asSpectator = !!data.asSpectator;

                if (asSpectator) {
                    const specs = this.game.spectators || [];
                    const already = specs.some((s) => s.id === bodySid);
                    if (!already && specs.length >= MAX_SPECTATORS) {
                        reject('Комната переполнена зрителями');
                        return;
                    }
                }

                const action = {
                    type: 'PLAYER_JOIN',
                    payload: {
                        playerName: data.playerName || 'Игрок',
                        sessionId: bodySid,
                        deviceId: typeof data.deviceId === 'string' ? data.deviceId : null,
                        asSpectator,
                    },
                };
                // применяем (если игрок реально изменился) и всегда шлём снапшот этому клиенту
                this.applyAction(action);
                try {
                    connection.send(JSON.stringify({ type: 'SET_STATE', payload: this.game }));
                } catch (e) { /* ignore */ }
                break;
            }

            case 'INTENT': {
                if (!data.action || typeof data.action.type !== 'string') return;
                this.touch(sessionId);
                if (this.isDuplicate(sessionId, data.msgId)) return; // повтор — игнор

                const actionType = data.action.type;

                // SET_STATE — это приёмник снапшота на клиенте, а не интент.
                // Сервер сам готовит снапшоты; разрешать клиенту подменять ими
                // авторитетное состояние нельзя.
                if (actionType === 'SET_STATE') {
                    reject('Недопустимое действие');
                    return;
                }

                // Админ-действия — только от текущего хоста.
                if (ADMIN_ACTIONS.has(actionType)) {
                    const host = this.game.players.find(
                        (p) => p.id === this.game.hostId && p.sessionId === sessionId
                    );
                    if (!host) {
                        reject('Только хост может это сделать');
                        return;
                    }
                }

                // Гейт по идентичности. Редьюсер защищает ПОРЯДОК хода, но не
                // знает, КТО прислал интент — поэтому без этой проверки любой
                // клиент (зритель, кикнутый, не-текущий игрок) мог кидать кости
                // и передавать ход. Это blocker: новый игрок теперь по умолчанию
                // зритель и обязан НЕ иметь возможности мутировать партию.
                if (GAMEPLAY_ACTIONS.has(actionType)) {
                    const cur = this.game.players[this.game.currentPlayerIndex];
                    const isCurrent =
                        cur && cur.isClaimed && !cur.isSpectator && cur.sessionId === sessionId;
                    if (!isCurrent) {
                        reject('Сейчас не ваш ход');
                        return;
                    }
                }

                // Запрос на вступление в игру — только от зрителя.
                if (actionType === 'REQUEST_JOIN') {
                    const isSpec = (this.game.spectators || []).some((s) => s.id === sessionId);
                    if (!isSpec) return;
                    if ((this.game.joinRequests || []).length >= MAX_JOIN_REQUESTS) return;
                }

                this.applyAction(data.action);
                break;
            }

            case 'PLAYER_LEAVE': {
                this.touch(sessionId);
                this.applyAction({ type: 'PLAYER_LEAVE', payload: { sessionId } });
                this.presence.delete(sessionId);
                break;
            }

            case 'PING': {
                this.touch(sessionId);
                // Отвечаем PONG: при простое трафик иначе идёт только клиент→сервер,
                // и промежуточные звенья рвут «тихое» соединение (~60с, код 1006).
                try {
                    connection.send(JSON.stringify({ type: 'PONG' }));
                } catch (e) { /* ignore */ }
                break;
            }

            case 'REQUEST_STATE': {
                this.touch(sessionId);
                try {
                    connection.send(JSON.stringify({ type: 'SET_STATE', payload: this.game }));
                } catch (e) { /* ignore */ }
                break;
            }

            default:
                break;
        }
    }

    // --- соединение закрылось ---
    async onClose(connection, code) {
        const sessionId = this.connSession.get(connection.id);
        this.connSession.delete(connection.id);
        if (!sessionId) return;
        // Не считаем игрока offline мгновенно: он мог переподключиться.
        // presence-аларм переведёт в offline, если PING не вернётся.
        // Но если это был явный выход — клиент уже послал PLAYER_LEAVE.
    }

    // --- HTTP: проверка занятости комнаты (?check=1) для лобби ---
    // CORS обязателен: лобби на github.io делает fetch на workers.dev
    // (кросс-домен). Без этих заголовков браузер блокирует чтение ответа,
    // и это выглядит как «ошибка сети».
    corsHeaders() {
        return {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400',
        };
    }

    async onRequest(request) {
        // Preflight для кросс-доменных fetch из лобби.
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: this.corsHeaders() });
        }

        const url = new URL(request.url);
        if (url.searchParams.get('check') === '1') {
            try {
                await this.ensureLoaded();
                // Состояние могло быть испорчено (см. защиту в ensureLoaded) —
                // на любой не-массив отвечаем безопасными значениями, а не падаем.
                const players = Array.isArray(this.game?.players) ? this.game.players : [];
                const claimed = players.filter((p) => p && p.isClaimed);
                const host = players.find((p) => p && p.id === this.game?.hostId);
                const body = {
                    exists: claimed.length > 0,
                    hostName: host?.name || null,
                    playerCount: claimed.length,
                };
                return Response.json(body, { headers: this.corsHeaders() });
            } catch (e) {
                console.error('[room] check failed', e);
                return Response.json(
                    { exists: false, hostName: null, playerCount: 0 },
                    { headers: this.corsHeaders() }
                );
            }
        }
        return new Response('Tysiacha PartyServer room', {
            status: 200,
            headers: this.corsHeaders(),
        });
    }
}

// CORS-заголовки для кросс-доменных fetch из лобби (github.io -> workers.dev).
// Ставим на финальном ответе воркера: PartyServer пересобирает ответ DO и
// терял заголовки, выставленные внутри onRequest.
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
};

function withCors(response) {
    if (!response) return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
    // WebSocket-апгрейд: Cloudflare несёт соединение в response.webSocket.
    // Пересборка через new Response(body) это поле ТЕРЯЕТ и ломает апгрейд
    // (клиент получает код 1006). WS не под CORS, поэтому отдаём как есть.
    if (response.webSocket) return response;
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

// --- Worker entry: маршрутизирует /parties/main/<room> в DO выше. ---
// Binding в wrangler.jsonc должен называться `Main` (kebab => "main"),
// тогда клиенты ходят на /parties/main/<room> без изменений.
export default {
    async fetch(request, env, ctx) {
        // Preflight для кросс-доменных fetch из лобби — отвечаем на уровне воркера.
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: CORS_HEADERS });
        }

        try {
            // Валидация кода комнаты до маршрутизации: PartyServer падает
            // с 500 и текстом внутренней ошибки на аномальных именах
            // (например, 10 000 символов), а имя комнаты задаёт клиент.
            const url = new URL(request.url);
            const m = url.pathname.match(/^\/parties\/main\/([^/]+)\/?$/i);
            if (m) {
                let room = m[1];
                try { room = decodeURIComponent(room); } catch (e) { room = ''; }
                if (!/^[A-Za-z0-9_-]{1,64}$/.test(room)) {
                    return new Response('Bad Room', { status: 404, headers: CORS_HEADERS });
                }
            }
            const response = await routePartykitRequest(request, { ...env, ctx }, {
                Main: TysiachaRoom,
            });
            return withCors(response || new Response('Not Found', { status: 404 }));
        } catch (e) {
            // Различаем причины сбоя, чтобы клиент показал конкретное сообщение,
            // а не глухое «ошибка сети». Стек-трейс наружу не утекает.
            const msg = (e && e.message) || '';
            const isQuota = /Durable Objects free tier|Exceeded allowed volume|over.{0,20}quota/i.test(msg);
            console.error('[worker] route failed', msg || e);
            if (isQuota) {
                return new Response(JSON.stringify({ reason: 'quota' }), {
                    status: 429,
                    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
                });
            }
            return new Response(JSON.stringify({ reason: 'server' }), {
                status: 503,
                headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            });
        }
    },
};
