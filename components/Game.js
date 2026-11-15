import React from 'react';
import GameUI from './GameUI.js';
import { createLocalGameState } from '../utils/gameLogic.js';
import { useGameEngine } from './hooks/useGameEngine.js';
import { useRoom } from './hooks/useRoom.js';
import { getDeviceId } from '../utils/deviceId.js';

const Game = ({ roomCode, playerName, initialMode, localConfig, asSpectator = false, onExit }) => {
  const isLocalMode = initialMode === 'local';

  // 1. Prepare Initial State for Hooks
  const initialLocalState = React.useMemo(() => {
      if (isLocalMode) {
           return createLocalGameState(localConfig?.playerCount || 2);
      }
      return null;
  }, [isLocalMode, localConfig]);

  // 2. Init Game Engine Hook
  // В онлайн-режиме состояние приходит с сервера (SET_STATE); локально — из initialLocalState.
  const { gameState, dispatch } = useGameEngine(initialLocalState, isLocalMode, localConfig);

  // 3. Local Identity State
  const [myPlayerId, setMyPlayerId] = React.useState(null);
  const [isSpectator, setIsSpectator] = React.useState(false);

  // Идентичность живёт в localStorage, а не sessionStorage: sessionStorage
  // умирает при закрытии всех вкладок, и при возврате игрок получал новый
  // sessionId -> сервер не узнавал его и в начатой партии делал зрителем,
  // оставляя настоящий слот занятым офлайн-игроком. localStorage переживает
  // закрытие браузера, поэтому возврат = reconnect в свой же слот.
  const mySessionIdRef = React.useRef(localStorage.getItem('tysiacha-sessionId') || `sid_${Math.random().toString(36).substr(2, 9)}`);
  // Личность устройства: стабильный id, генерится один раз и живёт вечно.
  // sessionId — токен живого соединения (может меняться при каждой вкладке),
  // deviceId — то, по чему сервер узнаёт вернувшегося игрока и возвращает
  // его в свой слот вместо понижения в зрители. Держится в localStorage +
  // cookie + sessionStorage сразу (см. utils/deviceId.js), чтобы пережить
  // чистку любого одного хранилища.
  const deviceIdRef = React.useRef(getDeviceId());
  const wakeLockRef = React.useRef(null);

  // 4. Init Network Hook (PartyKit room). Сервер — единственный источник истины.
  const { connectionStatus, sendAction: sendRoomAction, sendLeave } = useRoom({
      roomCode,
      playerName,
      isLocalMode,
      mySessionId: mySessionIdRef.current,
      deviceId: deviceIdRef.current,
      dispatch,
      asSpectator: asSpectator && !isLocalMode,
  });

  // --- WAKE LOCK ---
  React.useEffect(() => {
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator) {
        try {
          const lock = await navigator.wakeLock.request('screen');
          wakeLockRef.current = lock;
          lock.addEventListener('release', () => {});
        } catch (err) { console.warn('Wake Lock error:', err); }
      }
    };
    const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible' && (!wakeLockRef.current || wakeLockRef.current.released)) requestWakeLock();
    };
    requestWakeLock();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        if (wakeLockRef.current) wakeLockRef.current.release().catch(() => {});
    };
  }, []);

  // --- SELF IDENTITY & SESSION STORAGE ---
  React.useEffect(() => {
    if (isLocalMode) return;

    localStorage.setItem('tysiacha-sessionId', mySessionIdRef.current);
    if (gameState) {
        const me = gameState.players.find(p => p.sessionId === mySessionIdRef.current);
        setMyPlayerId(me ? me.id : null);
        setIsSpectator(gameState.spectators.some(s => s.id === mySessionIdRef.current));
    }
  }, [gameState, isLocalMode]);

  // --- ACTION HANDLER ---
  // Локально — сразу в редьюсер. Онлайн — интент на сервер; сервер применит
  // редьюсер авторитетно и разошлёт снапшот всем (включая нас).
  const sendAction = (action) => {
      if (isLocalMode) {
          dispatch(action);
      } else {
          sendRoomAction(action);
      }
  };

  const manualRetry = () => {
      window.location.reload();
  };

  const [isScoreboardExpanded, setIsScoreboardExpanded] = React.useState(false);
  const [isSpectatorsModalOpen, setIsSpectatorsModalOpen] = React.useState(false);
  const [showRules, setShowRules] = React.useState(false);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [kickConfirmState, setKickConfirmState] = React.useState({ isOpen: false, player: null });
  const [promoteConfirmState, setPromoteConfirmState] = React.useState({ isOpen: false, player: null });
  const [showHostBlockModal, setShowHostBlockModal] = React.useState(false);

  // --- RENDER LOADING/ERROR STATES ---
  if (!gameState) {
      return React.createElement('div', { className: "text-center w-full p-8" },
        React.createElement('h2', { className: `font-ruslan text-4xl mb-4 ${connectionStatus === 'error' ? 'text-red-500' : 'text-title-yellow'}` },
            connectionStatus === 'error' ? 'Ошибка сети' : (connectionStatus === 'connected' ? 'Синхронизация...' : 'Подключение...')
        ),
        connectionStatus === 'error' && React.createElement('p', { className: "text-lg mb-6 max-w-md mx-auto" }, 'Не удалось подключиться к серверу игры. Попробуйте офлайн режим.'),
        connectionStatus === 'connected' && React.createElement('p', { className: "text-lg mb-6 max-w-md mx-auto" }, 'Ждем данные от сервера...'),
        (connectionStatus === 'connecting' || connectionStatus === 'reconnecting' || connectionStatus === 'connected') && React.createElement('div', { className: "w-8 h-8 border-4 border-t-transparent border-title-yellow rounded-full animate-spin mx-auto" }),
        React.createElement('div', { className: 'flex justify-center gap-4 mt-8' },
            React.createElement('button', { onClick: onExit, className: "px-4 py-2 bg-slate-700 hover:bg-slate-700 rounded" }, "В меню"),
            connectionStatus === 'error' && React.createElement('button', { onClick: manualRetry, className: "px-4 py-2 bg-green-600 hover:bg-green-700 rounded" }, "Повторить")
        )
      );
  }

  // --- RENDER JOIN ERROR (NAME TAKEN) ---
  const joinError = gameState.joinErrors?.[mySessionIdRef.current];
  if (joinError) {
      return React.createElement('div', { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm" },
          React.createElement('div', { className: "bg-slate-800 p-8 rounded-xl border border-red-500 max-w-md text-center shadow-2xl" },
              React.createElement('h2', { className: "text-3xl font-ruslan text-red-500 mb-4" }, "Ошибка входа"),
              React.createElement('p', { className: "text-white text-lg mb-6" }, joinError),
              React.createElement('button', {
                  onClick: onExit,
                  className: "px-6 py-3 bg-slate-600 hover:bg-slate-700 text-white rounded-lg font-bold transition-colors"
              }, "Вернуться в меню")
          )
      );
  }

  const isMyTurn = isLocalMode ? true : (myPlayerId === gameState.currentPlayerIndex && !isSpectator);
  // «Хост» теперь только про админ-права (старт/новая игра/кик/промоут), а не про авторитет.
  const isHost = isLocalMode ? true : (myPlayerId !== null && myPlayerId === gameState.hostId);

  const handleLeaveGame = () => {
        if (!isLocalMode) {
             // Если я хост и в игре есть другие люди — выход блокируем (надо передать права).
             const activePlayersCount = gameState.players.filter(p => p.isClaimed && !p.isSpectator).length;
             if (isHost && activePlayersCount > 1) {
                 setShowHostBlockModal(true);
                 return;
             }

             // Явный выход: сервер метит offline и сохраняет слот/очки для перезахода.
             sendLeave();
             setTimeout(() => onExit(), 150);
        } else {
             onExit();
        }
    };

  const uiProps = {
    roomCode: isLocalMode ? 'LOCAL' : roomCode,
    gameState,
    myPlayerId: isLocalMode ? gameState.currentPlayerIndex : myPlayerId,
    isSpectator,
    isMyTurn,
    isHost: isHost,
    // Зритель (или незанятый) может ЗАПРОСИТЬся в игру, пока не запросил.
    canJoin: !isLocalMode && myPlayerId === null &&
             !(gameState.joinRequests || []).some(r => r.sessionId === mySessionIdRef.current),
    isAwaitingApproval: !isLocalMode && myPlayerId === null &&
             (gameState.joinRequests || []).some(r => r.sessionId === mySessionIdRef.current),
    showRules,
    isSpectatorsModalOpen,
    isScoreboardExpanded,
    isDragOver,
    displayMessage: gameState.gameMessage,
    rollButtonText: (gameState.keptDiceThisTurn.length >= 5 ? 5 : 5 - gameState.keptDiceThisTurn.length) === 5 ? 'Бросить все' : `Бросить ${5 - gameState.keptDiceThisTurn.length}`,
    showSkipButton: false,
    claimedPlayerCount: gameState.players.filter(p => p.isClaimed && !p.isSpectator).length,
    availableSlotsForJoin: isLocalMode ? 0 : gameState.players.filter(p => !p.isClaimed && !p.isSpectator).length,
    currentPlayer: gameState.players[gameState.currentPlayerIndex],
    kickConfirmState,
    promoteConfirmState,
    showHostBlockModal,
    onLeaveGame: handleLeaveGame,
    onCloseHostBlockModal: () => setShowHostBlockModal(false),
    onSetShowRules: setShowRules,
    onSetIsSpectatorsModalOpen: setIsSpectatorsModalOpen,
    onSetIsScoreboardExpanded: setIsScoreboardExpanded,
    onSetIsDragOver: setIsDragOver,
    onRollDice: () => sendAction({ type: 'ROLL_DICE' }),
    onBankScore: () => sendAction({ type: 'BANK_SCORE' }),
    onSkipTurn: () => sendAction({ type: 'SKIP_TURN' }),
    onNewGame: () => {
        if (isLocalMode) {
             const newState = createLocalGameState(localConfig?.playerCount || 2);
             dispatch({ type: 'SET_STATE', payload: newState });
        } else {
            sendAction({ type: 'NEW_GAME' });
        }
    },
    onStartOfficialGame: () => sendAction({ type: 'START_OFFICIAL_GAME' }),
    // Зритель НЕ занимает слот сам — он просится в игру, одобряет админ.
    onJoinGame: () => sendAction({ type: 'REQUEST_JOIN', payload: { sessionId: mySessionIdRef.current } }),
    // Админ (хост) принимает/отклоняет запрос зрителя.
    onJoinRequest: (sessionId, approve) => sendAction(
        approve
            ? { type: 'APPROVE_JOIN', payload: { sessionId } }
            : { type: 'REJECT_JOIN', payload: { sessionId } }
    ),
    onToggleDieSelection: (index) => sendAction({ type: 'TOGGLE_DIE_SELECTION', payload: { index } }),
    onDragStart: (e, index) => { e.dataTransfer.setData('application/json', JSON.stringify([index])); },
    onDrop: (e) => {
        e.preventDefault();
        setIsDragOver(false);
        try {
            const indices = JSON.parse(e.dataTransfer.getData('application/json'));
            sendAction({ type: 'KEEP_DICE', payload: { indices } });
        } catch(e){}
    },
    onDieDoubleClick: (index) => sendAction({ type: 'KEEP_DICE', payload: { indices: [index] } }),
    // Kick handlers
    onInitiateKick: (player) => setKickConfirmState({ isOpen: true, player }),
    onConfirmKick: () => {
      if (kickConfirmState.player) sendAction({ type: 'KICK_PLAYER', payload: { playerId: kickConfirmState.player.id } });
      setKickConfirmState({ isOpen: false, player: null });
    },
    onCancelKick: () => setKickConfirmState({ isOpen: false, player: null }),
    // Promote handlers
    onInitiatePromote: (player) => setPromoteConfirmState({ isOpen: true, player }),
    onConfirmPromote: () => {
      if (promoteConfirmState.player) sendAction({ type: 'PROMOTE_TO_HOST', payload: { playerId: promoteConfirmState.player.id } });
      setPromoteConfirmState({ isOpen: false, player: null });
    },
    onCancelPromote: () => setPromoteConfirmState({ isOpen: false, player: null }),
  };

  return React.createElement(GameUI, uiProps);
};

export default Game;
