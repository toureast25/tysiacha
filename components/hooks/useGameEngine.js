// hooks/useGameEngine.js
import React from 'react';
import {
  createInitialState,
  analyzeDice,
  validateSelection,
  calculateTotalScore,
  getPlayerBarrelStatus,
  findNextHost,
} from '../../utils/gameLogic.js';

// ====================================================================================
// РЕДЬЮСЕР, ИСПОЛНЯЕМЫЙ НА ВСЕХ КЛИЕНТАХ
// Принимает состояние и ДЕТЕРМИНИРОВАННЫЙ "приказ" от хоста.
// Не содержит случайных чисел или сложной логики принятия решений.
// ====================================================================================
const gameReducer = (state, action) => {
    if (!state || !action || !action.type) return state;
    const { type, payload } = action;

    switch (type) {
        case 'SET_FULL_STATE':
            return payload;

        case 'PLAYER_JOINED': {
            const { joinIndex, player, newHostId, message } = payload;
            const newPlayers = state.players.map((p, i) => i === joinIndex ? player : p);
            return { ...state, players: newPlayers, hostId: newHostId, gameMessage: message };
        }
        case 'PLAYER_LEFT': {
            const { playerIndex, newPlayersList, newHostId, finalStateChanges, message } = payload;
            return { ...state, ...finalStateChanges, players: newPlayersList, hostId: newHostId, gameMessage: message };
        }
        case 'SPECTATOR_JOINED': {
            const { spectator, message } = payload;
            return { ...state, spectators: [...state.spectators, spectator], gameMessage: message };
        }
        case 'SPECTATOR_LEFT': {
            return { ...state, spectators: state.spectators.filter(s => s.id !== payload.sessionId) };
        }
        case 'JOIN_REQUEST_ADDED': {
            return { ...state, joinRequests: [...state.joinRequests, payload.request] };
        }
        case 'JOIN_REQUEST_RESOLVED': {
            const { requestSessionId, accepted, changes } = payload;
            const remainingRequests = state.joinRequests.filter(r => r.sessionId !== requestSessionId);
            return { ...state, ...changes, joinRequests: remainingRequests };
        }
        case 'GAME_STARTED': {
            return { ...state, isGameStarted: true, canRoll: true, gameMessage: payload.message, turnStartTime: Date.now() };
        }
        case 'NEW_GAME_CREATED': {
            return { ...createInitialState(), ...payload };
        }
        case 'DICE_ROLLED': {
            const { newDice, isHotDiceRoll } = payload;
            return { ...state, diceOnBoard: newDice, keptDiceThisTurn: isHotDiceRoll ? [] : state.keptDiceThisTurn, diceKeptFromThisRoll: [], scoreFromPreviousRolls: state.currentTurnScore, gameMessage: `${state.players[state.currentPlayerIndex].name} бросает...`, canRoll: false, canBank: true, selectedDiceIndices: [], canKeep: false, potentialScore: 0 };
        }
        case 'DICE_KEPT': {
            const { newTurnScore, scoreAdded, newKeptDiceThisTurn, newDiceOnBoard, isHotDice, combinedDiceAfterKeep } = payload;
            return {
                ...state,
                currentTurnScore: newTurnScore,
                keptDiceThisTurn: newKeptDiceThisTurn,
                diceKeptFromThisRoll: isHotDice ? [] : combinedDiceAfterKeep,
                diceOnBoard: newDiceOnBoard,
                gameMessage: `+${scoreAdded}! Очки за ход: ${newTurnScore}. ${isHotDice ? 'Все кости сыграли!' : 'Бросайте снова или запишите.'}`,
                canRoll: true,
                canBank: true,
                selectedDiceIndices: [],
                canKeep: false,
                potentialScore: 0
            };
        }
        case 'TURN_CHANGED': {
            const { nextPlayerIndex, newPlayers, message } = payload;
            return { ...createInitialState(), players: newPlayers, spectators: state.spectators, leavers: state.leavers, hostId: state.hostId, isGameStarted: true, currentPlayerIndex: nextPlayerIndex, diceOnBoard: payload.diceForBolt || [], gameMessage: message, turnStartTime: Date.now(), canRoll: true };
        }
        case 'GAME_OVER': {
            return { ...createInitialState(), players: payload.players, spectators: state.spectators, leavers: state.leavers, hostId: state.hostId, isGameOver: true, gameMessage: payload.message };
        }
        case 'UPDATE_PLAYER_STATUS': {
            const { updatedPlayers, newHostId } = payload;
            return { ...state, players: updatedPlayers, hostId: newHostId ?? state.hostId };
        }
        case 'TOGGLE_DIE_SELECTION_LOCAL': {
             // Это действие не приходит от хоста, оно чисто для UI
            if (state.isGameOver || state.diceOnBoard.length === 0) return state;
            const { index } = payload;
            const newSelectedIndices = state.selectedDiceIndices.includes(index)
                ? state.selectedDiceIndices.filter(i => i !== index)
                : [...state.selectedDiceIndices, index];
            const selectedValues = newSelectedIndices.map(i => state.diceOnBoard[i]);
            let validation = validateSelection(selectedValues);
            if (!validation.isValid && selectedValues.length > 0) {
                const combinedValidation = validateSelection([...state.diceKeptFromThisRoll, ...selectedValues]);
                if (combinedValidation.isValid) {
                    validation = { isValid: true, score: combinedValidation.score - validateSelection(state.diceKeptFromThisRoll).score };
                }
            }
            return {
                ...state,
                selectedDiceIndices: newSelectedIndices,
                canKeep: validation.isValid,
                potentialScore: validation.score > 0 ? validation.score : 0,
                gameMessage: validation.isValid ? `Выбрано +${validation.score}.` : `Выберите корректную комбинацию.`
            };
        }
        default:
            return state;
    }
};


// ====================================================================================
// ЛОГИКА, ИСПОЛНЯЕМАЯ ТОЛЬКО НА ХОСТЕ
// Принимает "запрос" от клиента, выполняет всю логику с RNG и проверками,
// и возвращает массив детерминированных "приказов" для рассылки всем.
// ====================================================================================
const hostActionHandler = (state, action) => {
    if (!state || !action || !action.type) return [];
    const { type, payload, senderId } = action;
    const player = state.players.find(p => p.sessionId === senderId);
    const playerIndex = player ? player.id : -1;
    
    // --- Валидация действий ---
    const isCurrentPlayerAction = ['rollDice', 'keepDice', 'bankScore'].includes(type);
    if (isCurrentPlayerAction && playerIndex !== state.currentPlayerIndex) {
        console.warn(`Action ${type} from non-current player ${senderId} ignored.`);
        return [];
    }
    
    const findNextActivePlayer = (startIndex, players) => {
        let nextIndex = (startIndex + 1) % players.length;
        while (nextIndex !== startIndex) {
            if (players[nextIndex].isClaimed && !players[nextIndex].isSpectator) return nextIndex;
            nextIndex = (nextIndex + 1) % players.length;
        }
        const firstActive = players.findIndex(p => p.isClaimed && !p.isSpectator);
        return firstActive !== -1 ? firstActive : startIndex;
    };

    switch (type) {
        case 'joinGame': {
            const { name, sessionId } = payload;
            if (state.players.some(p => p.sessionId === sessionId) || state.spectators.some(s => s.id === sessionId)) return [];

            const joinIndex = state.players.findIndex(p => !p.isClaimed);
            if (joinIndex === -1) {
                return [{ type: 'SPECTATOR_JOINED', payload: { spectator: { name, id: sessionId }, message: `${name} присоединился как зритель.` } }];
            }
            
            const newPlayer = { ...state.players[joinIndex], name, isClaimed: true, status: 'online', sessionId, scores: [], hasEnteredGame: false, lastSeen: Date.now() };
            const newPlayersList = state.players.map((p, i) => i === joinIndex ? newPlayer : p);
            const newHostId = state.hostId === null ? (findNextHost(newPlayersList) ?? joinIndex) : state.hostId;
            
            return [{ type: 'PLAYER_JOINED', payload: { joinIndex, player: newPlayer, newHostId, message: `${name} присоединился.` } }];
        }
        
        case 'leaveGame': {
            const { sessionId } = payload;
            const isLeavingSpectator = state.spectators.some(s => s.id === sessionId);
            if (isLeavingSpectator) {
                return [{ type: 'SPECTATOR_LEFT', payload: { sessionId } }];
            }

            const pIndex = state.players.findIndex(p => p.sessionId === sessionId);
            if (pIndex === -1) return [];
            const playerToRemove = state.players[pIndex];
            if (!playerToRemove.isClaimed) return [];
            
            let newPlayersList = state.players.map(p => p.id === pIndex ? { ...createInitialState().players[0], id: p.id, name: `Игрок ${p.id + 1}` } : p);
            const newHostId = findNextHost(newPlayersList);
            let finalStateChanges = {};
            let message = `${playerToRemove.name} вышел.`;
            
            const remainingPlayersCount = newPlayersList.filter(p => p.isClaimed && !p.isSpectator).length;
            if (state.isGameStarted && !state.isGameOver && remainingPlayersCount < 2) {
                finalStateChanges = { isGameOver: true };
                message = "Недостаточно игроков, игра окончена.";
            } else if (state.currentPlayerIndex === pIndex) {
                const nextPlayerIndex = findNextActivePlayer(state.currentPlayerIndex - 1, newPlayersList);
                const turnChangePayload = { nextPlayerIndex, newPlayers: newPlayersList, message: `${playerToRemove.name} вышел. Ход ${newPlayersList[nextPlayerIndex].name}.` };
                return [{type: 'TURN_CHANGED', payload: turnChangePayload}]
            }
            
            return [{ type: 'PLAYER_LEFT', payload: { playerIndex: pIndex, newPlayersList, newHostId, finalStateChanges, message } }];
        }

        case 'rollDice': {
            if (!state.canRoll || state.isGameOver || !state.isGameStarted) return [];
            
            const isHotDiceRoll = state.keptDiceThisTurn.length >= 5;
            const diceToRollCount = isHotDiceRoll ? 5 : 5 - state.keptDiceThisTurn.length;
            const newDice = Array.from({ length: diceToRollCount }, () => Math.floor(Math.random() * 6) + 1);

            const { scoringGroups } = analyzeDice(newDice);
            if (scoringGroups.reduce((s, g) => s + g.score, 0) === 0) { // BOLT
                const currentPlayer = state.players[state.currentPlayerIndex];
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
                const newPlayers = state.players.map((p, i) => i === state.currentPlayerIndex ? updatedPlayer : p);
                const nextPlayerIndex = findNextActivePlayer(state.currentPlayerIndex, newPlayers);
                const nextPlayer = newPlayers[nextPlayerIndex];
                let gameMessage = `${currentPlayer.name} получает болт! Ход ${nextPlayer.name}.`;
                if (!nextPlayer.hasEnteredGame) gameMessage += ` Ему нужно 50+ для входа.`;
                return [{ type: 'TURN_CHANGED', payload: { nextPlayerIndex, newPlayers: newPlayers.map(p => ({ ...p, justResetFromBarrel: false })), message: gameMessage, diceForBolt: newDice } }];
            } else {
                return [{ type: 'DICE_ROLLED', payload: { newDice, isHotDiceRoll } }];
            }
        }
        
        case 'keepDice': {
            const { indices } = payload;
            if (!indices) return [];
            const combinedDice = [...state.diceKeptFromThisRoll, ...indices.map(i => state.diceOnBoard[i])];
            const validation = validateSelection(combinedDice);
            if (!validation.isValid) return []; // Игнорируем невалидный keep

            const newTurnScore = state.scoreFromPreviousRolls + validation.score;
            const scoreAdded = newTurnScore - state.currentTurnScore;
            const newKeptDiceThisTurn = [...state.keptDiceThisTurn, ...indices.map(i => state.diceOnBoard[i])];
            const newDiceOnBoard = state.diceOnBoard.filter((_, i) => !indices.includes(i));
            const isHotDice = newDiceOnBoard.length === 0;

            return [{ type: 'DICE_KEPT', payload: { newTurnScore, scoreAdded, newKeptDiceThisTurn, newDiceOnBoard, isHotDice, combinedDiceAfterKeep: combinedDice } }];
        }
        
        case 'bankScore': {
            if (!state.canBank || state.isGameOver) return [];
            const selectedValues = state.selectedDiceIndices.map(i => state.diceOnBoard[i]);
            const validation = validateSelection([...state.diceKeptFromThisRoll, ...selectedValues]);
            const finalTurnScore = (state.selectedDiceIndices.length > 0 && validation.isValid) 
                ? state.scoreFromPreviousRolls + validation.score 
                : state.currentTurnScore + state.potentialScore;

            const currentPlayer = state.players[state.currentPlayerIndex];
            
            const getBoltOrders = (playerForBolt, barrelStatus, customMsg) => {
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
                const newPlayers = state.players.map((p, i) => i === state.currentPlayerIndex ? updatedPlayer : p);
                const nextIdx = findNextActivePlayer(state.currentPlayerIndex, newPlayers);
                const nextPlayer = newPlayers[nextIdx];
                let msg = customMsg || `${playerForBolt.name} получает болт. Ход ${nextPlayer.name}.`;
                if (!nextPlayer.hasEnteredGame) msg += ` Ему нужно 50+ для входа.`;
                return [{ type: 'TURN_CHANGED', payload: { nextPlayerIndex: nextIdx, newPlayers: newPlayers.map(p => ({...p, justResetFromBarrel: false})), message: msg } }];
            };

            if (finalTurnScore === 0) return getBoltOrders(currentPlayer);
            if (!currentPlayer.hasEnteredGame && finalTurnScore < 50) {
                const customMsg = `${currentPlayer.name} не набрал 50 для входа. Болт! Ход ${state.players[findNextActivePlayer(state.currentPlayerIndex, state.players)].name}.`;
                return getBoltOrders(currentPlayer, null, customMsg);
            }

            const barrelStatus = getPlayerBarrelStatus(currentPlayer);
            const totalBefore = calculateTotalScore(currentPlayer);
            const failedBarrel = (barrelStatus === '200-300' && totalBefore + finalTurnScore < 300) || (barrelStatus === '700-800' && totalBefore + finalTurnScore < 800);
            if (failedBarrel) return getBoltOrders(currentPlayer, barrelStatus);
            
            let playersAfterTurn = state.players.map((p, i) => i === state.currentPlayerIndex ? { ...p, scores: [...p.scores, finalTurnScore], hasEnteredGame: true, barrelBolts: 0 } : p);
            const newTotal = calculateTotalScore(playersAfterTurn[state.currentPlayerIndex]);
            const newBarrel = (newTotal >= 200 && newTotal < 300) ? '200-300' : (newTotal >= 700 && newTotal < 800) ? '700-800' : null;
            let penaltyMsgs = [];

            let playersWithPenalties = playersAfterTurn.map((p, i) => {
                if (i === state.currentPlayerIndex || !p.isClaimed) return p;
                const oldTotal = calculateTotalScore(state.players[i]);
                const otherBarrel = getPlayerBarrelStatus(state.players[i]);
                if (newBarrel && otherBarrel === newBarrel) {
                    penaltyMsgs.push(`${p.name} сбит с бочки.`);
                    return { ...p, scores: [...p.scores, (newBarrel === '200-300' ? 150 : 650) - oldTotal] };
                }
                if (totalBefore < oldTotal && newTotal >= oldTotal && oldTotal >= 100) {
                    const scoreAfterPenalty = oldTotal - 50;
                    const wouldLandOnBarrel = (scoreAfterPenalty >= 200 && scoreAfterPenalty < 300) || (scoreAfterPenalty >= 700 && scoreAfterPenalty < 800);
                    if (!wouldLandOnBarrel && !p.justResetFromBarrel) {
                        penaltyMsgs.push(`${p.name} получает штраф -50.`);
                        return { ...p, scores: [...p.scores, -50] };
                    }
                }
                return p;
            });
            
            if (newTotal >= 1000) {
                return [{ type: 'GAME_OVER', payload: { players: playersWithPenalties.map(p => ({...p, justResetFromBarrel: false})), message: `${currentPlayer.name} победил, набрав ${newTotal}!` } }];
            }

            const nextIdx = findNextActivePlayer(state.currentPlayerIndex, playersWithPenalties);
            const nextPlayer = playersWithPenalties[nextIdx];
            let msg = `${currentPlayer.name} записал ${finalTurnScore}. ${penaltyMsgs.join(' ')} Ход ${nextPlayer.name}.`;
            if (!nextPlayer.hasEnteredGame) msg += ` Ему нужно 50+ для входа.`;
            else if (getPlayerBarrelStatus(nextPlayer)) msg += ` Он(а) на бочке.`;
            
            return [{ type: 'TURN_CHANGED', payload: { nextPlayerIndex: nextIdx, newPlayers: playersWithPenalties.map(p => ({...p, justResetFromBarrel: false})), message: msg } }];
        }

        case 'presenceUpdate': {
            const { senderId } = payload;
            const playerIdx = state.players.findIndex(p => p.sessionId === senderId);
            if (playerIdx !== -1 && state.players[playerIdx].isClaimed) {
                const updatedPlayers = [...state.players];
                updatedPlayers[playerIdx] = { ...updatedPlayers[playerIdx], lastSeen: Date.now(), status: 'online' };
                return [{ type: 'UPDATE_PLAYER_STATUS', payload: { updatedPlayers } }];
            }
            return [];
        }

        // --- Действия, которые может выполнять только хост ---
        case 'startOfficialGame':
        case 'newGame':
        case 'skipTurn':
        case 'kickPlayer':
        case 'joinRequest':
        case 'resolveJoinRequest':
        case 'host_checkStatus': {
            // Эти действия не требуют сложной логики, просто преобразуем их в приказы
            // (Логика уже инкапсулирована в `applyAction` из старой версии, перенесем ее в `gameReducer`)
            // Этот блок - заглушка, т.к. реальная логика будет в `gameReducer`
            // Здесь мы просто генерируем приказ, чтобы все клиенты выполнили одно и то же
             if (senderId !== state.players[state.hostId].sessionId) return [];
            // Временный проброс, пока не рефакторим всё
            return [{ type: 'TEMP_PASS_THROUGH', originalAction: action }];
        }
        
        default:
            return [];
    }
};


const useGameEngine = (lastReceivedState, lastReceivedAction, lastReceivedSyncRequest, publishState, publishAction, playerName, mySessionId) => {
  const [gameState, setGameState] = React.useState(null);
  const gameStateRef = React.useRef(gameState);
  
  React.useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const myPlayerId = React.useMemo(() => {
    return gameState?.players.find(p => p.sessionId === mySessionId)?.id ?? null;
  }, [gameState, mySessionId]);

  const isSpectator = React.useMemo(() => {
    return gameState?.spectators.some(s => s.id === mySessionId) ?? false;
  }, [gameState, mySessionId]);

  const isHost = gameState && myPlayerId !== null && myPlayerId === gameState.hostId;

  // --- Обработка входящих данных ---

  // 1. Обработка "приказов" от хоста (основной путь обновления)
  React.useEffect(() => {
    if (lastReceivedAction) {
        setGameState(currentState => gameReducer(currentState, lastReceivedAction));
    }
  }, [lastReceivedAction]);

  // 2. Обработка "запросов" от клиентов (только для хоста)
  React.useEffect(() => {
      if (lastReceivedAction && isHost) {
          const orders = hostActionHandler(gameStateRef.current, lastReceivedAction);
          orders.forEach(order => {
              publishAction(order.type, order.payload);
          });
      }
  }, [lastReceivedAction, isHost, publishAction]);


  // 3. Обработка полного состояния (для синхронизации)
  React.useEffect(() => {
    if (!lastReceivedState) return;
    
    // Новая комната
    if (lastReceivedState.isInitial) {
      const initialState = createInitialState();
      initialState.players[0] = { ...initialState.players[0], name: playerName, isClaimed: true, status: 'online', sessionId: mySessionId, lastSeen: Date.now() };
      initialState.hostId = 0;
      initialState.gameMessage = `${playerName} создал(а) игру. Ожидание...`;
      const stateToPublish = { ...initialState, version: 1, senderId: mySessionId };
      setGameState(stateToPublish);
      publishState(stateToPublish);
      return;
    }
    
    const currentState = gameStateRef.current;
    if (!currentState || lastReceivedState.version > currentState.version) {
        setGameState(lastReceivedState);
    }

  }, [lastReceivedState, playerName, mySessionId, publishState]);

  // 4. Обработка запросов на синхронизацию (только для хоста)
  React.useEffect(() => {
      if (lastReceivedSyncRequest && isHost && gameStateRef.current) {
          publishState({ ...gameStateRef.current, senderId: mySessionId });
      }
  }, [lastReceivedSyncRequest, isHost, publishState]);


  // --- Функция, которую UI вызывает для совершения действий ---
  const requestGameAction = (type, payload = {}) => {
      // 'toggleDieSelection' - единственное чисто локальное действие для отзывчивости
      if (type === 'toggleDieSelection') {
          setGameState(currentState => gameReducer(currentState, {type: 'TOGGLE_DIE_SELECTION_LOCAL', payload}));
          return;
      }
      // Все остальные действия отправляются как "запросы"
      publishAction(type, payload);
  };
  
  // --- Обработчики для UI ---
  const handleJoinGame = () => {
    if (!gameStateRef.current || myPlayerId !== null || isSpectator) return;
    requestGameAction('joinGame', { name: playerName, sessionId: mySessionId });
  };

  const handleLeaveGame = () => {
    requestGameAction('leaveGame', { sessionId: mySessionId });
  };
  
  const handleJoinRequest = (requestSessionId, accepted) => {
    if (isHost) {
        requestGameAction('resolveJoinRequest', { requestSessionId, accepted });
    }
  };

  return { gameState, myPlayerId, isSpectator, requestGameAction, handleJoinGame, handleLeaveGame, handleJoinRequest };
};

export default useGameEngine;