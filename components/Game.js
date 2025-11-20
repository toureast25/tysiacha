
import React from 'react';
import GameUI from './GameUI.js';
import { initHostPeer, initClientPeer, connectToHost } from '../utils/mqttUtils.js'; // PeerJS utils
import {
  createInitialState,
  analyzeDice,
  validateSelection,
  calculateTotalScore,
  getPlayerBarrelStatus,
  findNextHost,
} from '../utils/gameLogic.js';

// --- GAME REDUCER (Shared logic) ---
function gameReducer(state, action) {
  if (action.type === 'SET_STATE') {
      if (!action.payload) return state;
      return action.payload;
  }
  
  const newState = { ...state, version: (state.version || 1) + 1 };
  
  switch (action.type) {
    case 'PLAYER_JOIN': {
        const { playerName, sessionId, asSpectator } = action.payload;
        if (newState.players.some(p => p.sessionId === sessionId) || newState.spectators.some(s => s.id === sessionId)) {
             return state;
        }
        if (asSpectator) {
            return { ...newState, spectators: [...newState.spectators, { name: playerName, id: sessionId }] };
        }
        const joinIndex = newState.players.findIndex(p => !p.isClaimed);
        if (joinIndex === -1) return newState;

        const restoredScore = newState.leavers?.[playerName] || 0;
        const newLeavers = { ...newState.leavers };
        if (restoredScore > 0) delete newLeavers[playerName];

        const newPlayers = newState.players.map((p, i) => 
            i === joinIndex 
            ? { ...p, name: playerName, isClaimed: true, scores: restoredScore > 0 ? [restoredScore] : [], status: 'online', sessionId, hasEnteredGame: restoredScore > 0, lastSeen: Date.now() } 
            : p
        );
        return { ...newState, players: newPlayers, leavers: newLeavers, gameMessage: `${playerName} присоединился.` };
    }
    
    case 'PLAYER_LEAVE': {
      const { sessionId } = action.payload;
      if (newState.spectators.some(s => s.id === sessionId)) {
           return {...newState, spectators: newState.spectators.filter(s => s.id !== sessionId)};
      }
      const playerIndex = newState.players.findIndex(p => p.sessionId === sessionId);
      if (playerIndex === -1) return newState;
      
      const playerToRemove = newState.players[playerIndex];
      if (!playerToRemove.isClaimed) return newState;

      const totalScore = calculateTotalScore(playerToRemove);
      const newLeavers = totalScore > 0 ? { ...newState.leavers, [playerToRemove.name]: totalScore } : newState.leavers;
      
      let newPlayers = newState.players.map(p => p.sessionId === sessionId ? { ...createInitialState().players[0], id: p.id, name: `Игрок ${p.id + 1}` } : p);
      const gameWasInProgress = !newState.isGameOver && newState.isGameStarted;
      let newCurrentPlayerIndex = newState.currentPlayerIndex;

      if (gameWasInProgress && newState.currentPlayerIndex === playerIndex) {
          newCurrentPlayerIndex = findNextActivePlayer(newState.currentPlayerIndex, newPlayers);
      }
      
      const remainingPlayers = newPlayers.filter(p => p.isClaimed && !p.isSpectator);
      if (gameWasInProgress && remainingPlayers.length < 2) {
        return { ...newState, players: newPlayers, leavers: newLeavers, isGameOver: true, gameMessage: 'Игра окончена (недостаточно игроков).' };
      }
      
      let message = `${playerToRemove.name} вышел.`;
      if (gameWasInProgress && newState.currentPlayerIndex === playerIndex) {
          message += ` Ход ${newPlayers[newCurrentPlayerIndex].name}.`;
      }
      return { ...newState, players: newPlayers, leavers: newLeavers, gameMessage: message, currentPlayerIndex: newCurrentPlayerIndex };
    }
    
    case 'TOGGLE_DIE_SELECTION': {
        if (newState.isGameOver || newState.diceOnBoard.length === 0) return state;
        const { index } = action.payload;
        const newSelectedIndices = newState.selectedDiceIndices.includes(index)
            ? newState.selectedDiceIndices.filter(i => i !== index)
            : [...newState.selectedDiceIndices, index];

        const selectedValues = newSelectedIndices.map(i => newState.diceOnBoard[i]);
        let validation = validateSelection(selectedValues);
        if (!validation.isValid && selectedValues.length > 0) {
            const combinedValidation = validateSelection([...newState.diceKeptFromThisRoll, ...selectedValues]);
            if (combinedValidation.isValid) {
                validation = { isValid: true, score: combinedValidation.score - validateSelection(newState.diceKeptFromThisRoll).score };
            }
        }
        return {
            ...newState,
            selectedDiceIndices: newSelectedIndices,
            canKeep: validation.isValid,
            potentialScore: validation.score > 0 ? validation.score : 0,
            gameMessage: validation.isValid ? `Выбрано +${validation.score}. Можно отложить.` : `Выберите корректную комбинацию.`
        };
    }
    
    case 'KEEP_DICE': {
        const { indices } = action.payload;
        const combinedDice = [...newState.diceKeptFromThisRoll, ...indices.map(i => newState.diceOnBoard[i])];
        const validation = validateSelection(combinedDice);
        if (!validation.isValid) return newState;
        const newTurnScore = newState.scoreFromPreviousRolls + validation.score;
        const scoreAdded = newTurnScore - newState.currentTurnScore;
        const newKeptDiceThisTurn = [...newState.keptDiceThisTurn, ...indices.map(i => newState.diceOnBoard[i])];
        const newDiceOnBoard = newState.diceOnBoard.filter((_, i) => !indices.includes(i));
        const isHotDice = newDiceOnBoard.length === 0;

        return {
            ...newState,
            currentTurnScore: newTurnScore,
            keptDiceThisTurn: newKeptDiceThisTurn,
            diceKeptFromThisRoll: isHotDice ? [] : combinedDice,
            diceOnBoard: newDiceOnBoard,
            gameMessage: `+${scoreAdded}! Очки за ход: ${newTurnScore}. ${isHotDice ? 'Все кости сыграли! Горячие кости!' : 'Бросайте снова или запишите.'}`,
            canRoll: true,
            canBank: true,
            selectedDiceIndices: [],
            canKeep: false,
            potentialScore: 0
        };
    }
    
    case 'ROLL_DICE': {
        if (!newState.canRoll || newState.isGameOver || !newState.isGameStarted) return state;
        const isHotDiceRoll = newState.keptDiceThisTurn.length >= 5;
        const diceToRollCount = isHotDiceRoll ? 5 : 5 - newState.keptDiceThisTurn.length;
        const newDice = Array.from({ length: diceToRollCount }, () => Math.floor(Math.random() * 6) + 1);
        const { scoringGroups } = analyzeDice(newDice);

        if (scoringGroups.reduce((s, g) => s + g.score, 0) === 0) { // BOLT
            const currentPlayer = newState.players[newState.currentPlayerIndex];
            let updatedPlayer = { ...currentPlayer, scores: [...currentPlayer.scores, '/'] };
            const barrelStatus = getPlayerBarrelStatus(currentPlayer);
            if (barrelStatus) {
                updatedPlayer.barrelBolts = (updatedPlayer.barrelBolts || 0) + 1;
                if (updatedPlayer.barrelBolts >= 3) {
                    const totalScore = calculateTotalScore(currentPlayer);
                    updatedPlayer.scores.push((barrelStatus === '200-300' ? 150 : 650) - totalScore);
                    updatedPlayer.barrelBolts = 0;
                    updatedPlayer.justResetFromBarrel = true;
                }
            }
            const newPlayers = newState.players.map((p, i) => i === newState.currentPlayerIndex ? updatedPlayer : p);
            const nextPlayerIndex = findNextActivePlayer(newState.currentPlayerIndex, newPlayers);
            const nextPlayer = newPlayers[nextPlayerIndex];
            let gameMessage = `${currentPlayer.name} получает болт! Ход ${nextPlayer.name}.`;
            return { ...createInitialState(), players: newPlayers.map(p => ({ ...p, justResetFromBarrel: false })), spectators: newState.spectators, leavers: newState.leavers, hostId: newState.hostId, isGameStarted: true, currentPlayerIndex: nextPlayerIndex, diceOnBoard: newDice, gameMessage, turnStartTime: Date.now(), canRoll: true };
        } else {
            return {
                ...newState,
                diceOnBoard: newDice,
                keptDiceThisTurn: isHotDiceRoll ? [] : newState.keptDiceThisTurn,
                diceKeptFromThisRoll: [],
                scoreFromPreviousRolls: newState.currentTurnScore,
                gameMessage: `Ваш бросок. Выберите очковые кости.`,
                canRoll: false,
                canBank: true,
                selectedDiceIndices: [],
                canKeep: false,
                potentialScore: 0
            };
        }
    }
    
    case 'BANK_SCORE': {
        if (!newState.canBank || newState.isGameOver) return state;
        const finalTurnScore = newState.currentTurnScore + newState.potentialScore;
        const currentPlayer = newState.players[newState.currentPlayerIndex];
        
        const getBoltState = (playerForBolt, barrelStatus) => {
          let updatedPlayer = { ...playerForBolt, scores: [...playerForBolt.scores, '/'] };
          if (barrelStatus) {
            updatedPlayer.barrelBolts = (updatedPlayer.barrelBolts || 0) + 1;
            if (updatedPlayer.barrelBolts >= 3) {
              const totalScore = calculateTotalScore(playerForBolt);
              updatedPlayer.scores.push((barrelStatus === '200-300' ? 150 : 650) - totalScore);
              updatedPlayer.barrelBolts = 0;
              updatedPlayer.justResetFromBarrel = true;
            }
          }
          const newPlayers = newState.players.map((p, i) => i === newState.currentPlayerIndex ? updatedPlayer : p);
          const nextIdx = findNextActivePlayer(newState.currentPlayerIndex, newPlayers);
          const nextPlayer = newPlayers[nextIdx];
          let msg = `${playerForBolt.name} получает болт. Ход ${nextPlayer.name}.`;
          return { ...createInitialState(), players: newPlayers.map(p => ({...p, justResetFromBarrel: false})), spectators: newState.spectators, leavers: newState.leavers, hostId: newState.hostId, isGameStarted: true, canRoll: true, currentPlayerIndex: nextIdx, gameMessage: msg, turnStartTime: Date.now() };
        };

        if (finalTurnScore === 0 && newState.keptDiceThisTurn.length > 0) {
            return getBoltState(currentPlayer);
        }
        if (!currentPlayer.hasEnteredGame && finalTurnScore < 50) {
            const nextIdx = findNextActivePlayer(newState.currentPlayerIndex, newState.players);
            return { ...createInitialState(), players: newState.players, spectators: newState.spectators, leavers: newState.leavers, hostId: newState.hostId, isGameStarted: true, canRoll: true, currentPlayerIndex: nextIdx, gameMessage: `${currentPlayer.name} не набрал 50 для входа.`, turnStartTime: Date.now() };
        }
        const barrelStatus = getPlayerBarrelStatus(currentPlayer);
        const totalBefore = calculateTotalScore(currentPlayer);
        const failedBarrel = (barrelStatus === '200-300' && totalBefore + finalTurnScore < 300) || (barrelStatus === '700-800' && totalBefore + finalTurnScore < 800);
        if (failedBarrel) {
            return getBoltState(currentPlayer, barrelStatus);
        }
        
        let playersAfterTurn = newState.players.map((p, i) => i === newState.currentPlayerIndex ? { ...p, scores: [...p.scores, finalTurnScore], hasEnteredGame: true, barrelBolts: 0 } : p);
        const newTotal = calculateTotalScore(playersAfterTurn[newState.currentPlayerIndex]);
        const newBarrel = (newTotal >= 200 && newTotal < 300) ? '200-300' : (newTotal >= 700 && newTotal < 800) ? '700-800' : null;
        let penaltyMsgs = [];

        let playersWithPenalties = playersAfterTurn.map((p, i) => {
            if (i === newState.currentPlayerIndex || !p.isClaimed) return p;
            const oldTotal = calculateTotalScore(newState.players[i]);
            const otherBarrel = getPlayerBarrelStatus(newState.players[i]);
            if (newBarrel && otherBarrel === newBarrel) {
                penaltyMsgs.push(`${p.name} сбит с бочки.`);
                return { ...p, scores: [...p.scores, (newBarrel === '200-300' ? 150 : 650) - oldTotal] };
            }
            if (totalBefore < oldTotal && newTotal >= oldTotal && oldTotal >= 100) {
                const scoreAfterPenalty = oldTotal - 50;
                const wouldLandOnBarrel = (scoreAfterPenalty >= 200 && scoreAfterPenalty < 300) || (scoreAfterPenalty >= 700 && scoreAfterPenalty < 800);
                if (!wouldLandOnBarrel && !p.justResetFromBarrel) {
                    penaltyMsgs.push(`${p.name} штраф -50.`);
                    return { ...p, scores: [...p.scores, -50] };
                }
            }
            return p;
        });
        if (newTotal >= 1000) {
            return { ...createInitialState(), players: playersWithPenalties, isGameOver: true, gameMessage: `${currentPlayer.name} победил, набрав ${newTotal}!` };
        }
        const nextIdx = findNextActivePlayer(newState.currentPlayerIndex, playersWithPenalties);
        let msg = `${currentPlayer.name} записал ${finalTurnScore}. ${penaltyMsgs.join(' ')} Ход ${playersWithPenalties[nextIdx].name}.`;
        return { ...createInitialState(), players: playersWithPenalties.map(p => ({...p, justResetFromBarrel: false})), spectators: newState.spectators, leavers: newState.leavers, hostId: newState.hostId, isGameStarted: true, canRoll: true, currentPlayerIndex: nextIdx, gameMessage: msg, turnStartTime: Date.now() };
    }
    
    case 'START_OFFICIAL_GAME': {
        const firstPlayer = newState.players[newState.currentPlayerIndex];
        return { ...newState, isGameStarted: true, canRoll: true, gameMessage: `Игра началась! Ход ${firstPlayer.name}.`, turnStartTime: Date.now() };
    }
    
    case 'NEW_GAME': {
      const newPlayers = Array.from({ length: 5 }, (_, index) => {
        const oldPlayer = newState.players[index];
        if (oldPlayer && oldPlayer.isClaimed) {
          return { ...oldPlayer, scores: [], hasEnteredGame: false, barrelBolts: 0, justResetFromBarrel: false };
        }
        return { ...createInitialState().players[0], id: index, name: `Игрок ${index + 1}` };
      });
      return { ...createInitialState(), players: newPlayers, spectators: newState.spectators, hostId: newState.hostId, currentPlayerIndex: newState.hostId, gameMessage: 'Новая игра. Ожидание старта.' };
    }

    case 'SKIP_TURN': {
      const currentPlayer = newState.players[newState.currentPlayerIndex];
      const newPlayers = newState.players.map((p, i) => i === newState.currentPlayerIndex ? { ...p, scores: [...p.scores, '/'] } : p);
      const nextIdx = findNextActivePlayer(newState.currentPlayerIndex, newPlayers);
      const msg = `${currentPlayer.name} пропустил ход. Ход ${newPlayers[nextIdx].name}.`;
      return { ...createInitialState(), players: newPlayers.map(p => ({...p, justResetFromBarrel: false})), spectators: newState.spectators, leavers: newState.leavers, hostId: newState.hostId, isGameStarted: true, canRoll: true, currentPlayerIndex: nextIdx, gameMessage: msg, turnStartTime: Date.now() };
    }

    case 'KICK_PLAYER': {
        const { playerId } = action.payload;
        const playerToKick = newState.players.find(p => p.id === playerId);
        if (!playerToKick) return state;
        let newPlayers = newState.players.map(p => p.id === playerId ? { ...createInitialState().players[0], id: p.id, name: `Игрок ${p.id + 1}` } : p);
        let newCurrentPlayerIndex = newState.currentPlayerIndex;
        if(newState.currentPlayerIndex === playerId) {
             newCurrentPlayerIndex = findNextActivePlayer(newState.currentPlayerIndex, newPlayers);
        }
        return { ...newState, players: newPlayers, currentPlayerIndex: newCurrentPlayerIndex, gameMessage: `${playerToKick.name} был исключен.` };
    }

    default:
      return state;
  }
}

const findNextActivePlayer = (startIndex, players) => {
    let nextIndex = (startIndex + 1) % players.length;
    while (nextIndex !== startIndex) {
        if (players[nextIndex].isClaimed && !players[nextIndex].isSpectator) {
            return nextIndex;
        }
        nextIndex = (nextIndex + 1) % players.length;
    }
    return startIndex;
};

// --- GAME COMPONENT ---

const Game = ({ roomCode, playerName, initialMode, onExit }) => {
  const [gameState, dispatch] = React.useReducer(gameReducer, null);
  const [myPlayerId, setMyPlayerId] = React.useState(null);
  const [isSpectator, setIsSpectator] = React.useState(false);
  const [connectionStatus, setConnectionStatus] = React.useState('connecting'); // connecting, connected, error, error_busy, retrying
  const [isHost, setIsHost] = React.useState(initialMode === 'create');
  const [retryCount, setRetryCount] = React.useState(0);

  const mySessionIdRef = React.useRef(sessionStorage.getItem('tysiacha-sessionId') || `sid_${Math.random().toString(36).substr(2, 9)}`);
  const peerRef = React.useRef(null);
  const connectionsRef = React.useRef([]);
  const hostConnRef = React.useRef(null);
  const isCleanedUp = React.useRef(false);
  const wakeLockRef = React.useRef(null);

  React.useEffect(() => {
    sessionStorage.setItem('tysiacha-sessionId', mySessionIdRef.current);
    return () => { isCleanedUp.current = true; };
  }, []);
  
  // --- WAKE LOCK ---
  React.useEffect(() => {
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator) {
        try {
          const lock = await navigator.wakeLock.request('screen');
          wakeLockRef.current = lock;
          console.log('Wake Lock active');
          lock.addEventListener('release', () => {
              console.log('Wake Lock released');
          });
        } catch (err) {
          console.warn('Wake Lock error:', err);
        }
      }
    };
    
    const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible' && (!wakeLockRef.current || wakeLockRef.current.released)) {
            requestWakeLock();
        }
    };

    requestWakeLock();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        if (wakeLockRef.current) wakeLockRef.current.release().catch(() => {});
    };
  }, []);

  // --- HOST SETUP with RETRY ---
  const initializeHost = (retriesLeft = 5) => {
    if (peerRef.current) {
        peerRef.current.destroy();
        peerRef.current = null;
    }

    try {
        const peer = initHostPeer(roomCode);
        peerRef.current = peer;

        peer.on('open', (id) => {
            if (isCleanedUp.current) return;
            console.log('HOST: Session started with ID', id);
            setIsHost(true);
            setConnectionStatus('connected');
            
            const savedState = localStorage.getItem(`tysiacha-state-${roomCode}`);
            let initialState;
            if (savedState) {
                try {
                    initialState = JSON.parse(savedState);
                } catch (e) { initialState = createInitialState(); }
            } else {
                initialState = createInitialState();
                initialState.hostId = 0;
                initialState.players[0] = { 
                    ...initialState.players[0], 
                    name: playerName, 
                    isClaimed: true, 
                    sessionId: mySessionIdRef.current, 
                    status: 'online' 
                };
                initialState.gameMessage = `${playerName} создал(а) игру.`;
            }
            dispatch({ type: 'SET_STATE', payload: initialState });
        });

        peer.on('connection', (conn) => {
            connectionsRef.current.push(conn);
            conn.on('open', () => {
                if (gameState) conn.send({ type: 'SET_STATE', payload: gameState });
            });
            conn.on('data', (action) => {
                if (action.type) dispatch({ ...action, _senderId: conn.metadata?.sessionId });
            });
            conn.on('close', () => {
                connectionsRef.current = connectionsRef.current.filter(c => c !== conn);
            });
        });

        peer.on('error', (err) => {
            console.error('HOST Error:', err);
            if (err.type === 'unavailable-id') {
                // The ID is taken. This can happen if the previous session is ghosting on the server.
                // We need to destroy this instance (which is now invalid) and try again.
                if (peerRef.current) peerRef.current.destroy();

                if (retriesLeft > 0 && !isCleanedUp.current) {
                    const delay = 2000; // Wait 2s for server to potentially clear old ID
                    console.log(`Host ID taken, retrying in ${delay}ms... (${retriesLeft} left)`);
                    setConnectionStatus('retrying');
                    
                    setTimeout(() => {
                        if (!isCleanedUp.current) initializeHost(retriesLeft - 1);
                    }, delay);
                } else {
                    if (!isCleanedUp.current) setConnectionStatus('error_busy');
                }
            } else {
                if (!isCleanedUp.current && connectionStatus !== 'retrying') setConnectionStatus('error');
            }
        });
    } catch (e) {
        console.error(e);
        setConnectionStatus('error');
    }
  };

  // --- CLIENT SETUP ---
  const initializeClient = (retries = 3) => {
      if (peerRef.current) peerRef.current.destroy();
      
      try {
          const peer = initClientPeer();
          peerRef.current = peer;
          let connectionTimeout;

          peer.on('open', () => {
              if (isCleanedUp.current) return;
              const conn = connectToHost(peer, roomCode, { sessionId: mySessionIdRef.current, name: playerName });
              hostConnRef.current = conn;

              // Timeout if host doesn't answer
              connectionTimeout = setTimeout(() => {
                  if (connectionStatus !== 'connected' && !isCleanedUp.current) {
                      console.warn('Connection timed out');
                      setConnectionStatus('error_timeout');
                      conn.close();
                  }
              }, 6000);

              conn.on('open', () => {
                  clearTimeout(connectionTimeout);
                  if (isCleanedUp.current) return;
                  console.log('CLIENT: Connected to Host');
                  setConnectionStatus('connected');
                  conn.send({ type: 'PLAYER_JOIN', payload: { playerName, sessionId: mySessionIdRef.current } });
              });

              conn.on('data', (action) => {
                  if (action.type === 'SET_STATE') {
                      dispatch({ type: 'SET_STATE', payload: action.payload });
                  }
              });

              conn.on('close', () => {
                  console.log('CLIENT: Disconnected from Host');
                  if (!isCleanedUp.current) setConnectionStatus('reconnecting');
              });
              
              conn.on('error', () => {
                   if (!isCleanedUp.current) setConnectionStatus('error');
              });
          });
          
          peer.on('error', (err) => {
              // If Host ID is unavailable, it might be starting up. Retry.
              if (err.type === 'peer-unavailable') {
                  if (retries > 0 && !isCleanedUp.current) {
                       console.log(`Host not found yet, retrying... (${retries} left)`);
                       setTimeout(() => {
                           if(!isCleanedUp.current) {
                               initializeClient(retries - 1);
                           }
                       }, 2000);
                       return;
                  }
              }
              console.error('CLIENT Peer Error:', err);
              if (!isCleanedUp.current) setConnectionStatus('error');
          });
      } catch(e) {
          console.error(e);
          setConnectionStatus('error');
      }
  };

  // --- INITIALIZATION ---
  React.useEffect(() => {
      isCleanedUp.current = false;
      if (initialMode === 'create') {
          initializeHost(5); // Start with 5 retries for Host to handle ghosting
      } else {
          initializeClient(3); // Start with retries for Client too
      }

      return () => {
          isCleanedUp.current = true;
          if (peerRef.current) peerRef.current.destroy();
      };
  }, [roomCode, initialMode, retryCount]); // Retry count allows manual retry

  // --- HOST: BROADCAST ---
  React.useEffect(() => {
      if (isHost && gameState && connectionsRef.current) {
          localStorage.setItem(`tysiacha-state-${roomCode}`, JSON.stringify(gameState));
          connectionsRef.current.forEach(conn => {
              if (conn.open) conn.send({ type: 'SET_STATE', payload: gameState });
          });
      }
  }, [gameState, isHost, roomCode]);

  // --- SELF IDENTITY ---
  React.useEffect(() => {
      if (gameState) {
          const me = gameState.players.find(p => p.sessionId === mySessionIdRef.current);
          setMyPlayerId(me ? me.id : null);
          setIsSpectator(gameState.spectators.some(s => s.id === mySessionIdRef.current));
          
          if (me) {
            localStorage.setItem('tysiacha-session', JSON.stringify({ 
                roomCode, 
                playerName,
                mode: isHost ? 'create' : 'join' // Save mode for reload
            }));
          }
      }
  }, [gameState, isHost]);

  const sendAction = (action) => {
      if (isHost) {
          dispatch(action);
      } else if (hostConnRef.current && hostConnRef.current.open) {
          hostConnRef.current.send(action);
      }
  };
  
  const manualRetry = () => {
      setConnectionStatus('connecting');
      setRetryCount(prev => prev + 1);
  };

  const [isScoreboardExpanded, setIsScoreboardExpanded] = React.useState(false);
  const [isSpectatorsModalOpen, setIsSpectatorsModalOpen] = React.useState(false);
  const [showRules, setShowRules] = React.useState(false);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [kickConfirmState, setKickConfirmState] = React.useState({ isOpen: false, player: null });

  if (connectionStatus !== 'connected' && !gameState) {
      let errorMsg = '';
      let subMsg = '';
      if (connectionStatus === 'error_busy') {
          errorMsg = 'Код комнаты занят';
          subMsg = 'Не удалось создать игру, так как этот код используется. Если вы перезагрузили страницу, подождите 10 секунд и нажмите "Повторить".';
      } else if (connectionStatus === 'error_timeout') {
          errorMsg = 'Хост не отвечает';
          subMsg = 'Не удалось подключиться к хосту. Возможно, он вышел из игры или у него проблемы с сетью.';
      } else if (connectionStatus === 'error') {
          errorMsg = 'Ошибка подключения';
          subMsg = 'Не удалось найти комнату или проблемы с P2P соединением. Проверьте код.';
      } else if (connectionStatus === 'retrying') {
          errorMsg = 'Переподключение...';
          subMsg = 'Освобождаем код комнаты после перезагрузки...';
      }

      return React.createElement('div', { className: "text-center w-full p-8" }, 
        React.createElement('h2', { className: `font-ruslan text-4xl mb-4 ${connectionStatus.startsWith('error') ? 'text-red-500' : 'text-title-yellow'}` }, 
            connectionStatus.startsWith('error') ? errorMsg : (connectionStatus === 'retrying' ? errorMsg : 'Подключение...')
        ),
        (connectionStatus.startsWith('error') || connectionStatus === 'retrying') && React.createElement('p', { className: "text-lg mb-6 max-w-md mx-auto" }, subMsg),
        
        (connectionStatus === 'connecting' || connectionStatus === 'retrying') && React.createElement('div', { className: "w-8 h-8 border-4 border-t-transparent border-title-yellow rounded-full animate-spin mx-auto" }),
        
        React.createElement('div', { className: 'flex justify-center gap-4 mt-8' },
            React.createElement('button', { onClick: onExit, className: "px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded" }, "Вернуться в меню"),
            connectionStatus.startsWith('error') && React.createElement('button', { onClick: manualRetry, className: "px-4 py-2 bg-green-600 hover:bg-green-700 rounded" }, "Повторить")
        )
      );
  }

  if (!gameState) return null;

  const isMyTurn = myPlayerId === gameState.currentPlayerIndex && !isSpectator;
  const isGameHost = myPlayerId === gameState.hostId; 
  
  const uiProps = {
    roomCode,
    gameState,
    myPlayerId,
    isSpectator,
    isMyTurn,
    isHost: isGameHost,
    canJoin: myPlayerId === null && !isSpectator,
    isAwaitingApproval: false,
    showRules,
    isSpectatorsModalOpen,
    isScoreboardExpanded,
    isDragOver,
    displayMessage: gameState.gameMessage,
    rollButtonText: (gameState.keptDiceThisTurn.length >= 5 ? 5 : 5 - gameState.keptDiceThisTurn.length) === 5 ? 'Бросить все' : `Бросить ${5 - gameState.keptDiceThisTurn.length}`,
    showSkipButton: false,
    claimedPlayerCount: gameState.players.filter(p => p.isClaimed && !p.isSpectator).length,
    availableSlotsForJoin: gameState.players.filter(p => !p.isClaimed && !p.isSpectator).length,
    currentPlayer: gameState.players[gameState.currentPlayerIndex],
    kickConfirmState,
    onLeaveGame: () => { sendAction({ type: 'PLAYER_LEAVE', payload: { sessionId: mySessionIdRef.current } }); onExit(); },
    onSetShowRules: setShowRules,
    onSetIsSpectatorsModalOpen: setIsSpectatorsModalOpen,
    onSetIsScoreboardExpanded: setIsScoreboardExpanded,
    onSetIsDragOver: setIsDragOver,
    onRollDice: () => sendAction({ type: 'ROLL_DICE' }),
    onBankScore: () => sendAction({ type: 'BANK_SCORE' }),
    onSkipTurn: () => sendAction({ type: 'SKIP_TURN' }),
    onNewGame: () => sendAction({ type: 'NEW_GAME' }),
    onStartOfficialGame: () => sendAction({ type: 'START_OFFICIAL_GAME' }),
    onJoinGame: () => sendAction({ type: 'PLAYER_JOIN', payload: { playerName, sessionId: mySessionIdRef.current } }),
    onJoinRequest: () => {}, 
    onToggleDieSelection: (index) => dispatch({ type: 'TOGGLE_DIE_SELECTION', payload: { index } }),
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
    onInitiateKick: (player) => setKickConfirmState({ isOpen: true, player }),
    onConfirmKick: () => {
      if (kickConfirmState.player) sendAction({ type: 'KICK_PLAYER', payload: { playerId: kickConfirmState.player.id } });
      setKickConfirmState({ isOpen: false, player: null });
    },
    onCancelKick: () => setKickConfirmState({ isOpen: false, player: null }),
  };

  return React.createElement(GameUI, uiProps);
};

export default Game;
