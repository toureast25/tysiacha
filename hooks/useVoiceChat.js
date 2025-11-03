import React from 'react';
import { MQTT_TOPIC_PREFIX } from '../constants.js';

const { useState, useEffect, useRef, useCallback } = React;

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const useVoiceChat = (mqttClient, myPlayerId, players, roomCode) => {
  const [isVoiceConnected, setIsVoiceConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [speakingPeers, setSpeakingPeers] = useState(new Set());

  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const audioContextRef = useRef(null);
  const analysersRef = useRef({});
  const animationFrameRef = useRef(null);

  const voiceTopic = `${MQTT_TOPIC_PREFIX}/${roomCode}/voice-signal`;

  const cleanupPeerConnection = useCallback((peerId) => {
    if (peerConnectionsRef.current[peerId]) {
      peerConnectionsRef.current[peerId].close();
      delete peerConnectionsRef.current[peerId];
    }
    const audioEl = document.getElementById(`audio-${peerId}`);
    if (audioEl) audioEl.remove();

    if (analysersRef.current[peerId]) {
      delete analysersRef.current[peerId];
    }
  }, []);

  const disconnectFromVoice = useCallback(() => {
    console.log("Disconnecting from voice chat...");
    if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    Object.keys(peerConnectionsRef.current).forEach(peerId => {
      cleanupPeerConnection(peerId);
    });
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (mqttClient && mqttClient.connected) {
      mqttClient.unsubscribe(voiceTopic);
    }

    setIsVoiceConnected(false);
    setSpeakingPeers(new Set());
    console.log("Voice chat disconnected.");
  }, [mqttClient, voiceTopic, cleanupPeerConnection]);

  const handleSignalMessage = useCallback(async (message) => {
    if (myPlayerId === null) return;

    try {
      const { from, signal } = JSON.parse(message.toString());
      if (from === myPlayerId) return; // Ignore own signals

      const pc = peerConnectionsRef.current[from];
      if (!pc) {
          console.warn(`Received signal from unknown peer: ${from}`);
          return;
      }
      
      if (signal.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        mqttClient.publish(voiceTopic, JSON.stringify({ from: myPlayerId, to: from, signal: pc.localDescription }));
      } else if (signal.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
      } else if (signal.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    } catch (error) {
      console.error('Error handling signal message:', error);
    }
  }, [myPlayerId, mqttClient, voiceTopic]);

  const createPeerConnection = useCallback((peerId) => {
    if (peerConnectionsRef.current[peerId]) {
      return peerConnectionsRef.current[peerId];
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionsRef.current[peerId] = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        mqttClient.publish(voiceTopic, JSON.stringify({ from: myPlayerId, to: peerId, signal: { candidate: event.candidate } }));
      }
    };

    pc.ontrack = (event) => {
      const audioContainer = document.getElementById('audio-container');
      let audioEl = document.getElementById(`audio-${peerId}`);
      if (!audioEl) {
        audioEl = document.createElement('audio');
        audioEl.id = `audio-${peerId}`;
        audioEl.autoplay = true;
        audioContainer.appendChild(audioEl);
      }
      audioEl.srcObject = event.streams[0];
      
       // Setup speaking detection
       if (audioContextRef.current) {
            const source = audioContextRef.current.createMediaStreamSource(event.streams[0]);
            const analyser = audioContextRef.current.createAnalyser();
            analyser.fftSize = 512;
            analyser.smoothingTimeConstant = 0.5;
            source.connect(analyser);
            analysersRef.current[peerId] = analyser;
       }
    };

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current));
    }

    pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'closed') {
            console.warn(`Peer connection with ${peerId} failed/disconnected.`);
            cleanupPeerConnection(peerId);
        }
    };

    return pc;
  }, [myPlayerId, mqttClient, voiceTopic, cleanupPeerConnection]);
  
  const detectSpeaking = useCallback(() => {
    const speaking = new Set();
    Object.entries(analysersRef.current).forEach(([peerId, analyser]) => {
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (const amplitude of dataArray) {
        sum += amplitude * amplitude;
      }
      const volume = Math.sqrt(sum / dataArray.length);
      if (volume > 20) { // Threshold for speaking
        speaking.add(parseInt(peerId, 10));
      }
    });

    setSpeakingPeers(prev => {
        if (prev.size === speaking.size && [...prev].every(value => speaking.has(value))) {
            return prev; // No change, avoid re-render
        }
        return speaking;
    });

    animationFrameRef.current = requestAnimationFrame(detectSpeaking);
  }, []);


  const connectToVoice = useCallback(async () => {
    if (isVoiceConnected || myPlayerId === null || !players) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      
      if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }

      mqttClient.subscribe(voiceTopic);
      mqttClient.on('message', (topic, message) => {
        if (topic === voiceTopic) {
          handleSignalMessage(message);
        }
      });
      setIsVoiceConnected(true);
      
      animationFrameRef.current = requestAnimationFrame(detectSpeaking);

      console.log("Voice chat connected. Creating peer connections...");
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Не удалось получить доступ к микрофону. Проверьте разрешения в настройках браузера.');
    }
  }, [isVoiceConnected, myPlayerId, players, mqttClient, voiceTopic, handleSignalMessage, detectSpeaking]);

  useEffect(() => {
    if (isVoiceConnected && players && myPlayerId !== null) {
      const activePlayerIds = players
        .filter(p => p.isClaimed && !p.isSpectator && p.id !== myPlayerId)
        .map(p => p.id);
      
      // Create new connections
      activePlayerIds.forEach(async (peerId) => {
        if (!peerConnectionsRef.current[peerId]) {
          console.log(`Creating offer for player ${peerId}`);
          const pc = createPeerConnection(peerId);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          mqttClient.publish(voiceTopic, JSON.stringify({ from: myPlayerId, to: peerId, signal: pc.localDescription }));
        }
      });

      // Cleanup old connections
      Object.keys(peerConnectionsRef.current).forEach(existingPeerId => {
        if (!activePlayerIds.includes(parseInt(existingPeerId, 10))) {
          console.log(`Cleaning up connection for left player ${existingPeerId}`);
          cleanupPeerConnection(existingPeerId);
        }
      });
    }
  }, [isVoiceConnected, players, myPlayerId, createPeerConnection, mqttClient, voiceTopic, cleanupPeerConnection]);


  useEffect(() => {
    // Main cleanup on component unmount
    return () => {
      disconnectFromVoice();
    };
  }, [disconnectFromVoice]);

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const enabled = !isMuted;
      localStreamRef.current.getAudioTracks()[0].enabled = enabled;
      setIsMuted(!enabled);
    }
  }, [isMuted]);

  return { isVoiceConnected, isMuted, speakingPeers, connectToVoice, disconnectFromVoice, toggleMute };
};

export default useVoiceChat;
