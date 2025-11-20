
// --- P2P NETWORK UTILITIES ---
import { PEER_PREFIX } from '../constants.js';

const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
];

// Генерирует полный ID пира на основе кода комнаты
export const getRoomPeerId = (roomCode) => {
    return `${PEER_PREFIX}${roomCode.toUpperCase()}`;
};

// Инициализация Хоста (Сервера)
export const initHostPeer = (roomCode) => {
    if (!window.Peer) {
        console.error("PeerJS library not loaded");
        throw new Error("PeerJS library not loaded");
    }

    const peerId = getRoomPeerId(roomCode);
    console.log('[P2P] Initializing Host with ID:', peerId);
    
    const peer = new window.Peer(peerId, {
        debug: 1, // Errors only
        config: {
            'iceServers': iceServers
        }
    });
    
    return peer;
};

// Инициализация Клиента (Случайный ID)
export const initClientPeer = () => {
    if (!window.Peer) {
        console.error("PeerJS library not loaded");
        throw new Error("PeerJS library not loaded");
    }

    console.log('[P2P] Initializing Client');
    const peer = new window.Peer(null, { // Random ID
        debug: 0, // Suppress "Could not connect to peer" errors in console
        config: {
            'iceServers': iceServers
        }
    });
    return peer;
};

// Подключение к Хосту
export const connectToHost = (peer, roomCode, metadata = {}) => {
    const hostId = getRoomPeerId(roomCode);
    console.log('[P2P] Connecting to Host:', hostId);
    
    const conn = peer.connect(hostId, {
        reliable: true, // Use TCP-like reliability
        metadata: metadata
    });
    
    return conn;
};
