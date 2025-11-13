// hooks/useMqtt.js
import React from 'react';
import { MQTT_BROKER_URL, MQTT_TOPIC_PREFIX } from '../../constants.js';

const useMqtt = (roomCode, playerName, mySessionId) => {
  const [connectionStatus, setConnectionStatus] = React.useState('connecting');
  const [lastReceivedState, setLastReceivedState] = React.useState(null);
  const [lastReceivedAction, setLastReceivedAction] = React.useState(null);
  const [lastReceivedSyncRequest, setLastReceivedSyncRequest] = React.useState(null);

  const mqttClientRef = React.useRef(null);
  const isStateReceivedRef = React.useRef(false);
  
  const lastReceivedStateRef = React.useRef(lastReceivedState);
  React.useEffect(() => {
    lastReceivedStateRef.current = lastReceivedState;
  }, [lastReceivedState]);

  const topic = `${MQTT_TOPIC_PREFIX}/${roomCode}`;
  const presenceTopic = `${topic}/presence`;
  const actionsTopic = `${topic}/actions`;
  const syncTopic = `${topic}/sync`; // Новая тема для запроса состояния

  const publishState = React.useCallback((stateToPublish) => {
    if (mqttClientRef.current && mqttClientRef.current.connected) {
      mqttClientRef.current.publish(topic, JSON.stringify(stateToPublish), { retain: true });
    }
  }, [topic]);

  const publishAction = React.useCallback((actionType, payload) => {
      if (mqttClientRef.current && mqttClientRef.current.connected) {
          const action = {
              type: actionType,
              payload: payload,
              senderId: mySessionId,
              timestamp: Date.now()
          };
          mqttClientRef.current.publish(actionsTopic, JSON.stringify(action));
      }
  }, [actionsTopic, mySessionId]);


  React.useEffect(() => {
    const connectOptions = {
      clientId: `tysiacha-pwa-${mySessionId}`,
      clean: true,
      connectTimeout: 8000,
      reconnectPeriod: 5000,
      keepalive: 30,
    };
    const client = mqtt.connect(MQTT_BROKER_URL, connectOptions);
    mqttClientRef.current = client;
    isStateReceivedRef.current = false;

    client.on('connect', () => {
      setConnectionStatus('connected');
      client.subscribe(topic);
      client.subscribe(actionsTopic);
      client.subscribe(presenceTopic);
      client.subscribe(syncTopic); // Подписываемся на тему синхронизации

      // Запрашиваем полный "снимок" состояния при подключении
      client.publish(syncTopic, JSON.stringify({ senderId: mySessionId, type: 'requestState' }));

      // Если в течение 2 секунд не придет состояние, значит, это новая комната.
      setTimeout(() => {
        if (!isStateReceivedRef.current) {
          setLastReceivedState({ isInitial: true });
        }
      }, 2000);
    });

    client.on('message', (receivedTopic, message) => {
      const messageString = message.toString();
      try {
        const payload = JSON.parse(messageString);

        if (receivedTopic === topic) {
          if (payload.senderId === mySessionId && !payload.isInitial) return;
          isStateReceivedRef.current = true;
          setLastReceivedState(currentState => {
            if (currentState && payload.version <= currentState.version) {
              return currentState;
            }
            return payload;
          });
        } else if (receivedTopic === actionsTopic) {
          // Ключевое изменение: НЕ фильтруем свои же сообщения.
          // Хост тоже должен получать свои "приказы", чтобы его состояние обновлялось.
          setLastReceivedAction(payload);
        
        } else if (receivedTopic === presenceTopic) {
          if (payload.senderId === mySessionId) return;
          setLastReceivedAction({ type: 'presenceUpdate', payload });
        } else if (receivedTopic === syncTopic) {
          // Получили запрос на синхронизацию
          setLastReceivedSyncRequest(payload);
        }
      } catch (e) {
        console.error(`Error parsing message on topic ${receivedTopic}:`, e);
      }
    });

    client.on('error', (err) => {
        console.error('MQTT Connection Error:', err);
        setConnectionStatus('error');
    });
    client.on('offline', () => setConnectionStatus('reconnecting'));
    client.on('reconnect', () => setConnectionStatus('reconnecting'));

    const heartbeatInterval = setInterval(() => {
      if (client.connected && lastReceivedStateRef.current) {
        const me = lastReceivedStateRef.current.players?.find(p => p.sessionId === mySessionId);
        if (me && me.isClaimed && !me.isSpectator) {
          client.publish(presenceTopic, JSON.stringify({ playerId: me.id, senderId: mySessionId }));
        }
      }
    }, 5000);

    return () => {
      clearInterval(heartbeatInterval);
      if (client) {
        client.end(true);
      }
    };
  }, [roomCode, mySessionId, topic, presenceTopic, actionsTopic, syncTopic]);

  return { connectionStatus, lastReceivedState, lastReceivedAction, lastReceivedSyncRequest, publishState, publishAction };
};

export default useMqtt;