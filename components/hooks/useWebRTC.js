// hooks/useWebRTC.js
import React from 'react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const useWebRTC = (onSignal, onData, onConnect, onDisconnect) => {
  const peersRef = React.useRef({});

  const createPeer = React.useCallback((peerId, initiator) => {
    if (peersRef.current[peerId]) {
      console.warn(`[WebRTC] Peer connection to ${peerId} already exists.`);
      return;
    }

    const peer = new RTCPeerConnection(ICE_SERVERS);
    peersRef.current[peerId] = { connection: peer, dataChannel: null };

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        onSignal(peerId, { type: 'candidate', candidate: event.candidate });
      }
    };

    peer.onconnectionstatechange = () => {
      const state = peer.connectionState;
      if (state === 'connected') {
        onConnect(peerId);
      } else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
        onDisconnect(peerId);
        if (peersRef.current[peerId]) {
            peersRef.current[peerId].connection.close();
            delete peersRef.current[peerId];
        }
      }
    };

    if (initiator) {
      const dataChannel = peer.createDataChannel('game-data');
      setupDataChannel(dataChannel, peerId);
      peersRef.current[peerId].dataChannel = dataChannel;
      
      peer.createOffer()
        .then(offer => peer.setLocalDescription(offer))
        .then(() => onSignal(peerId, { type: 'offer', sdp: peer.localDescription }))
        .catch(e => console.error('[WebRTC] Error creating offer:', e));
    } else {
      peer.ondatachannel = (event) => {
        const dataChannel = event.channel;
        setupDataChannel(dataChannel, peerId);
        peersRef.current[peerId].dataChannel = dataChannel;
      };
    }
    return peer;
  }, [onSignal, onData, onConnect, onDisconnect]);

  const setupDataChannel = React.useCallback((channel, peerId) => {
    channel.onopen = () => console.log(`[WebRTC] Data channel with ${peerId} is open.`);
    channel.onclose = () => console.log(`[WebRTC] Data channel with ${peerId} is closed.`);
    channel.onmessage = (event) => onData(JSON.parse(event.data));
  }, [onData]);

  const handleIncomingSignal = React.useCallback((fromId, signal) => {
    let peer = peersRef.current[fromId]?.connection;
    if (!peer && signal.type === 'offer') {
      peer = createPeer(fromId, false);
    }
    if (!peer) {
        console.error(`[WebRTC] Received signal for non-existent peer: ${fromId}`, signal);
        return;
    }

    if (signal.type === 'offer') {
      peer.setRemoteDescription(new RTCSessionDescription(signal.sdp))
        .then(() => peer.createAnswer())
        .then(answer => peer.setLocalDescription(answer))
        .then(() => onSignal(fromId, { type: 'answer', sdp: peer.localDescription }))
        .catch(e => console.error('[WebRTC] Error handling offer:', e));
    } else if (signal.type === 'answer') {
      peer.setRemoteDescription(new RTCSessionDescription(signal.sdp))
        .catch(e => console.error('[WebRTC] Error handling answer:', e));
    } else if (signal.type === 'candidate') {
      peer.addIceCandidate(new RTCIceCandidate(signal.candidate))
        .catch(e => console.error('[WebRTC] Error adding ICE candidate:', e));
    }
  }, [createPeer, onSignal]);

  const send = React.useCallback((peerId, data) => {
    const peer = peersRef.current[peerId];
    if (peer && peer.dataChannel && peer.dataChannel.readyState === 'open') {
      peer.dataChannel.send(JSON.stringify(data));
      return true;
    }
    return false;
  }, []);

  const broadcast = React.useCallback((data) => {
    Object.keys(peersRef.current).forEach(peerId => {
      send(peerId, data);
    });
  }, [send]);

  const closeConnection = React.useCallback((peerId) => {
    if (peersRef.current[peerId]) {
      peersRef.current[peerId].connection.close();
      delete peersRef.current[peerId];
      console.log(`[WebRTC] Connection with ${peerId} closed.`);
    }
  }, []);
  
  const getPeers = React.useCallback(() => {
    return Object.keys(peersRef.current);
  }, []);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      Object.keys(peersRef.current).forEach(peerId => {
        peersRef.current[peerId].connection.close();
      });
      peersRef.current = {};
    };
  }, []);

  return { connect: createPeer, handleIncomingSignal, send, broadcast, closeConnection, getPeers };
};

export default useWebRTC;