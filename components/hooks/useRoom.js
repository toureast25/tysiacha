// Клиентский транспорт к PartyServer-комнате (замена useMqtt.js).
//
// Нативный WebSocket на wss://<host>/parties/main/<room> — без внешних
// npm-зависимостей, чтобы клиент оставался чистой статикой на GitHub Pages.
// (PartyServer обслуживает /parties/:server/:room; binding называется Main.)
//
// Ответственности:
//   - установить соединение с авто-переподключением (экспоненциальный backoff + джиттер);
//   - при коннекте: HELLO (вход/переподключение) + REQUEST_STATE + сброс очереди интентов;
//   - heartbeat PING, чтобы сервер держал статус 'online';
//   - отправка интентов с монотонным msgId (дедупликация на сервере);
//   - приём SET_STATE -> dispatch.
//
// Роли «хост» здесь нет: сервер — единственный источник истины.

import React from 'react';
import { partykitConfig } from '../../utils/config.js';

const HEARTBEAT_MS = 10000;      // как часто шлём PING
const RECONNECT_BASE_MS = 500;   // база backoff
const RECONNECT_MAX_MS = 15000;  // потолок backoff

const buildRoomUrl = (roomCode) => {
    const { host, useTls } = partykitConfig;
    const proto = useTls ? 'wss' : 'ws';
    const code = String(roomCode || 'LOCAL').toUpperCase();
    return `${proto}://${host}/parties/main/${code}`;
};

export const useRoom = ({
    roomCode,
    playerName,
    isLocalMode,
    mySessionId,
    dispatch,
    asSpectator = false,
}) => {
    const [connectionStatus, setConnectionStatus] = React.useState(
        isLocalMode ? 'connected' : 'connecting'
    );

    const wsRef = React.useRef(null);
    const reconnectAttemptRef = React.useRef(0);
    const reconnectTimerRef = React.useRef(null);
    const heartbeatTimerRef = React.useRef(null);
    const msgIdRef = React.useRef(0);          // монотонный счётчик интентов
    const queueRef = React.useRef([]);          // интенты, не отправленные пока offline
    const closedByUsRef = React.useRef(false);
    const mountedRef = React.useRef(true);

    // Отправка одного сообщения, если открыто; иначе в очередь.
    const rawSend = React.useCallback((obj) => {
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
            try { ws.send(JSON.stringify(obj)); return true; }
            catch (e) { return false; }
        }
        return false;
    }, []);

    // Публичный API для Game.js: отправить игровое действие.
    const sendAction = React.useCallback((action) => {
        if (isLocalMode) return; // локальный режим обрабатывается выше, не здесь
        const msgId = ++msgIdRef.current;
        const envelope = { type: 'INTENT', action, sessionId: mySessionId, msgId };
        if (!rawSend(envelope)) {
            // Не открыто — кладём в очередь; уйдём с тем же msgId при сбросе.
            queueRef.current.push(envelope);
        }
    }, [isLocalMode, mySessionId, rawSend]);

    // Явный выход (кнопка «выйти»): шлём PLAYER_LEAVE сразу, минуя очередь.
    const sendLeave = React.useCallback(() => {
        if (isLocalMode) return;
        rawSend({ type: 'PLAYER_LEAVE', sessionId: mySessionId });
    }, [isLocalMode, mySessionId, rawSend]);

    React.useEffect(() => {
        if (isLocalMode) {
            setConnectionStatus('connected');
            return;
        }

        mountedRef.current = true;
        closedByUsRef.current = false;

        const clearTimers = () => {
            if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
            if (heartbeatTimerRef.current) { clearInterval(heartbeatTimerRef.current); heartbeatTimerRef.current = null; }
        };

        const scheduleReconnect = () => {
            if (!mountedRef.current || closedByUsRef.current) return;
            const attempt = reconnectAttemptRef.current++;
            const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, attempt), RECONNECT_MAX_MS);
            const jitter = Math.random() * 0.3 * delay;
            setConnectionStatus('reconnecting');
            reconnectTimerRef.current = setTimeout(connect, delay + jitter);
        };

        const connect = () => {
            if (!mountedRef.current || closedByUsRef.current) return;
            let ws;
            try {
                ws = new WebSocket(buildRoomUrl(roomCode));
            } catch (e) {
                setConnectionStatus('error');
                scheduleReconnect();
                return;
            }
            wsRef.current = ws;

            ws.onopen = () => {
                if (!mountedRef.current) { try { ws.close(); } catch (e) {} return; }
                reconnectAttemptRef.current = 0;
                setConnectionStatus('connected');

                // Вход/переподключение + запрос актуального снапшота.
                // asSpectator обязателен: без него сервер всегда впускает как игрока.
                rawSend({ type: 'HELLO', sessionId: mySessionId, playerName, asSpectator });
                rawSend({ type: 'REQUEST_STATE', sessionId: mySessionId });

                // Сброс накопленных интентов (те же msgId — сервер отсечёт повторы).
                const q = queueRef.current;
                queueRef.current = [];
                for (const env of q) {
                    try { ws.send(JSON.stringify(env)); } catch (e) { break; }
                }

                // Heartbeat.
                if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
                heartbeatTimerRef.current = setInterval(() => {
                    rawSend({ type: 'PING', sessionId: mySessionId });
                }, HEARTBEAT_MS);
            };

            ws.onmessage = (ev) => {
                let data;
                try { data = JSON.parse(ev.data); } catch (e) { return; }
                if (data.type === 'SET_STATE' && data.payload) {
                    dispatch({ type: 'SET_STATE', payload: data.payload });
                } else if (data.type === 'ERROR') {
                    console.warn('[room] server error', data.error);
                }
            };

            ws.onerror = () => {
                // onclose отработает переподключение; здесь только лог.
            };

            ws.onclose = () => {
                if (heartbeatTimerRef.current) { clearInterval(heartbeatTimerRef.current); heartbeatTimerRef.current = null; }
                if (!mountedRef.current || closedByUsRef.current) return;
                scheduleReconnect();
            };
        };

        connect();

        return () => {
            mountedRef.current = false;
            closedByUsRef.current = true;
            clearTimers();
            if (wsRef.current) {
                try { wsRef.current.close(); } catch (e) {}
                wsRef.current = null;
            }
        };
    }, [roomCode, playerName, isLocalMode, mySessionId, dispatch, rawSend, asSpectator]);

    return { connectionStatus, sendAction, sendLeave };
};
