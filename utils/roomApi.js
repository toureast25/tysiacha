// Проверка занятости комнаты через HTTP-эндпоинт PartyServer-сервера (?check=1).
// Замена MQTT-пинг-понга (PING_HOST/PONG_HOST) из старого mqttUtils.js.

import { partykitConfig } from './config.js';

export const checkRoomAvailability = async (roomCode) => {
    const proto = partykitConfig.useTls ? 'https' : 'http';
    const code = String(roomCode || '').toUpperCase();
    const url = `${proto}://${partykitConfig.host}/parties/main/${code}?check=1`;
    try {
        const res = await fetch(url, { method: 'GET' });
        if (!res.ok) return { exists: false, error: true };
        const data = await res.json();
        return { exists: !!data.exists, hostName: data.hostName || null };
    } catch (e) {
        return { exists: false, error: true };
    }
};
