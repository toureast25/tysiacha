// Проверка занятости комнаты через HTTP-эндпоинт PartyServer-сервера (?check=1).
// Замена MQTT-пинг-понга (PING_HOST/PONG_HOST) из старого mqttUtils.js.
//
// Возвращает различимую причину сбоя (reason), чтобы UI показал конкретное
// сообщение вместо глухого «ошибка сети»:
//   'quota'   — исчерпана дневная квота Durable Objects (сервер жив, но не пускает);
//   'server'  — сервер вернул 5xx (внутренняя ошибка);
//   'offline' — запрос вообще не дошёл (нет интернета / хост недоступен);
//   'unknown' — прочий HTTP-успех без данных.

import { partykitConfig } from './config.js';

const checkUrl = (roomCode) => {
    const proto = partykitConfig.useTls ? 'https' : 'http';
    const code = String(roomCode || '').toUpperCase();
    return `${proto}://${partykitConfig.host}/parties/main/${code}?check=1`;
};

// Классификация HTTP-ответа в причину. Общий для проверки комнаты и зонда.
const classify = (res) => {
    if (res.status === 429) return 'quota';
    if (res.status >= 500) return 'server';
    return null;
};

export const checkRoomAvailability = async (roomCode) => {
    try {
        const res = await fetch(checkUrl(roomCode), { method: 'GET' });
        const reason = classify(res);
        if (reason) return { exists: false, error: true, reason };
        if (!res.ok) return { exists: false, error: true, reason: 'unknown' };
        const data = await res.json();
        return { exists: !!data.exists, hostName: data.hostName || null };
    } catch (e) {
        return { exists: false, error: true, reason: 'offline' };
    }
};

// Лёгкий зонд «жив ли сервер и почему не пускает» — без привязки к комнате.
// Используется транспортом при сбое WebSocket, чтобы понять причину.
export const probeServerReason = async () => {
    try {
        const res = await fetch(checkUrl('PROBE'), { method: 'GET' });
        return classify(res) || 'unknown';
    } catch (e) {
        return 'offline';
    }
};
