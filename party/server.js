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

const STORAGE_KEY = '***';
const PRESENCE_TICK_MS = 10000;   // как часто sweeping-аларм проверяет presence
const OFFLINE_AFTER_MS = 45000;   // нет PING дольше — игрок считается offline
const SEEN_CAP = 5000;            // потолок карты дедупликации интентов

// Действия, которые может слать только хост (hostId в состоянии).
const ADMIN_ACTIONS = new Set([
    'START_OFFICIAL_GAME',
    'NEW_GAME',
    'KICK_PLAYER',
    'PROMOTE_TO_HOST',
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

    // --- загрузка авторитетного состояния (ленивая, однократная) ---
    async ensureLoaded() {
        if (this.game) return;
        if (!this._loading) {
            this._loading = (async () => {
                try {
                    const stored = await this.ctx.storage.get(STORAGE_KEY);
                    this.game = stored || createInitialState();
                } catch (e) {
                    this.game = createInitialState();
                }
            })();
        }
        await this._loading;
    }

    // --- персистентность: fire-and-forget, не блокируем рассылку ---
    persist() {
        if (!this.game) return;
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
        const next = gameReducer(this.game, action);
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
        return changed;
    }

    // --- планируем следующий sweeping-аларм ---
    schedulePresenceTick() {
        try {
            this.ctx.storage.setAlarm(Date.now() + PRESENCE_TICK_MS);
        } catch (e) {
            console.error('[room] setAlarm failed', e);
        }
    }

    // --- DO стартовал (первый запрос или аларм) ---
    async onStart() {
        await this.ensureLoaded();
        this.schedulePresenceTick();
    }

    // --- срабатывание аларма: sweeping presence + перепланировать ---
    async onAlarm() {
        await this.ensureLoaded();
        this.sweepPresence();
        this.schedulePresenceTick();
    }

    // --- новое WebSocket-соединение ---
    async onConnect(connection) {
        await this.ensureLoaded();
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

        const sessionId = data.sessionId;

        switch (data.type) {
            case 'HELLO': {
                if (!sessionId) return;
                this.connSession.set(connection.id, sessionId);
                this.touch(sessionId);
                const action = {
                    type: 'PLAYER_JOIN',
                    payload: {
                        playerName: data.playerName || 'Игрок',
                        sessionId,
                        asSpectator: !!data.asSpectator,
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
                if (!sessionId || !data.action || typeof data.action.type !== 'string') return;
                this.touch(sessionId);
                if (this.isDuplicate(sessionId, data.msgId)) return; // повтор — игнор

                const actionType = data.action.type;

                // Админ-действия — только от текущего хоста.
                if (ADMIN_ACTIONS.has(actionType)) {
                    const host = this.game.players.find(
                        (p) => p.id === this.game.hostId && p.sessionId === sessionId
                    );
                    if (!host) {
                        try {
                            connection.send(JSON.stringify({
                                type: 'ERROR',
                                error: 'Только хост может это сделать',
                                sessionId,
                            }));
                        } catch (e) { /* ignore */ }
                        return;
                    }
                }

                // Игрок, чей ход, может слать только свои действия — но редьюсер
                // сам защищает порядок хода; здесь не дублируем.
                this.applyAction(data.action);
                break;
            }

            case 'PLAYER_LEAVE': {
                if (!sessionId) return;
                this.touch(sessionId);
                this.applyAction({ type: 'PLAYER_LEAVE', payload: { sessionId } });
                this.presence.delete(sessionId);
                break;
            }

            case 'PING': {
                if (!sessionId) return;
                this.touch(sessionId);
                break;
            }

            case 'REQUEST_STATE': {
                if (!sessionId) return;
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
            await this.ensureLoaded();
            const claimed = (this.game?.players || []).filter((p) => p.isClaimed);
            const host = (this.game?.players || []).find((p) => p.id === this.game?.hostId);
            return Response.json(
                {
                    exists: claimed.length > 0,
                    hostName: host?.name || null,
                    playerCount: claimed.length,
                },
                { headers: this.corsHeaders() }
            );
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

        const response = await routePartykitRequest(request, { ...env, ctx }, {
            Main: TysiachaRoom,
        });
        return withCors(response || new Response('Not Found', { status: 404 }));
    },
};
