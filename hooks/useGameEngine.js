// 
import React from 'react';
import { MQTT_BROKER_URL, MQTT_TOPIC_PREFIX } from '../constants.js';
import { analyzeDice, validateSelection, calculateTotalScore, createInitialState, findNextHost, getPlayerBarrelStatus } from '../utils/gameLogic.js';

export const useGameEngine = ({ roomCode, playerName, onExit }) => {
  const [gameState, setGameState] = React.useState(null);
  const [myPlayerId, setMyPlayerId] = React.useState(null);
  const [isSpectator, setIsSpectator] = React.useState(false);
  const [connectionStatus, setConnectionStatus] = React.useState('connecting');
  
  const mqttClientRef = React.useRef(null);
  const isStateReceivedRef = React.useRef(false);
  const lastSeenTimestampsRef = React.useRef({});
  const gameStateRef = React.useRef(null);
  const mySessionIdRef = React.useRef(sessionStorage.getItem('tysiacha-sessionId') || `sid_${Math.random().toString(36).substr(2, 9)}`);

  React.useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  React.useEffect(() => {
    if (!sessionStorage.getItem('tysiacha-sessionId')) {
      sessionStorage.setItem('tysiacha-sessionId', mySessionIdRef.current);
    }
  }, []);

  const topic = `${MQTT_TOPIC_PREFIX}/${roomCode}`;
  const presenceTopic = `${topic}/presence`;
  
  React.useEffect(() => {
    if (myPlayerId !== null) {
        const sessionData = { roomCode, playerName, myPlayerId };
        localStorage.setItem('tysiacha-session', JSON.stringify(sessionData));
        if (!isSpectator) {
          localStorage.setItem('tysiacha-lastRoom', roomCode);
        }
    }
  }, [myPlayerId, roomCode, playerName, isSpectator]);

  const publishState = React.useCallback((newState, isOptimisticUpdate = false) => {
    if (mqttClientRef.current && mqttClientRef.current.connected) {
      const currentVersion = gameStateRef.current?.version || 0;
      const { senderId, ...stateWithoutSender } = newState; 
      
      const finalState = {
        ...stateWithoutSender,
        version: currentVersion + 1,
        senderId: mySessionIdRef.current,
      };

      if (isOptimisticUpdate && (myPlayerId !== null || isSpectator)) {
        setGameState(finalState);
      }
      
      mqttClientRef.current.publish(topic, JSON.stringify(finalState), { retain: true });
    }
  }, [topic, myPlayerId, isSpectator]);

  const findNextActivePlayer = React.useCallback((startIndex, players) => {
      let nextIndex = (startIndex + 1) % players.length;
      while (nextIndex !== startIndex) {
          if (players[nextIndex].isClaimed && !players[nextIndex].isSpectator) {
              return nextIndex;
          }
          nextIndex = (nextIndex + 1) % players.length;
      }
      const firstActive = players.findIndex(p => p.isClaimed && !p.isSpectator);
      return firstActive !== -1 ? firstActive : startIndex;
  }, []);


  React.useEffect(() => {
    const client = mqtt.connect(MQTT_BROKER_URL);
    mqttClientRef.current = client;
    isStateReceivedRef.current = false;

    client.on('connect', () => {
      setConnectionStatus('connected');
      client.subscribe(topic);
      client.subscribe(presenceTopic);

      setTimeout(() => {
        if (!isStateReceivedRef.current) {
            const initialState = createInitialState();
            initialState.players[0] = {
                ...initialState.players[0],
                name: playerName,
                isClaimed: true,
                status: 'online',
                sessionId: mySessionIdRef.current,
            };
            setMyPlayerId(0);
            initialState.gameMessage = `${playerName} создал(а) игру. Ожидание других игроков...`;
            const stateWithVersion = { ...initialState, version: 1, turnStartTime: Date.now() };
            setGameState(stateWithVersion);
            client.publish(topic, JSON.stringify(stateWithVersion), { retain: true });
        }
      }, 1500);
    });
    
    client.on('message', (receivedTopic, message) => {
        if (receivedTopic === topic) {
            isStateReceivedRef.current = true;
            try {
                const receivedState = JSON.parse(message.toString());
                
                setGameState(currentState => {
                    // Игнорируем старые или идентичные состояния
                    if (currentState && receivedState.version <= currentState.version) {
                        return currentState;
                    }

                    const myNewData = receivedState.players.find(p => p.sessionId === mySessionIdRef.current);
                    const iAmNowASpectator = receivedState.spectators.some(s => s.id === mySessionIdRef.current);
                    
                    if(isSpectator && !iAmNowASpectator) {
                        if(!myNewData) {
                            const myRequest = currentState?.joinRequests?.find(r => r.sessionId === mySessionIdRef.current);
                            if(myRequest) {
                                alert('Хост отклонил ваш запрос или время ожидания истекло. Вы переведены в зрители.');
                            }
                        }
                    }

                    if (myNewData) {
                        setMyPlayerId(myNewData.id);
                        setIsSpectator(false);
                    } else if (iAmNowASpectator) {
                        setMyPlayerId(null);
                        setIsSpectator(true);
                    } else {
                         // Проверяем, был ли я в игре до этого состояния
                        const iWasInTheGameBefore = currentState ? (
                            currentState.players.some(p => p.sessionId === mySessionIdRef.current) ||
                            currentState.spectators.some(s => s.id === mySessionIdRef.current) ||
                            currentState.joinRequests?.some(r => r.sessionId === mySessionIdRef.current)
                        ) : (myPlayerId !== null || isSpectator);

                        // Если я был в игре, но в новом состоянии меня нет - значит, меня выгнали или я вышел
                        if (iWasInTheGameBefore) {
                           const isStillWaiting = receivedState.joinRequests?.some(r => r.sessionId === mySessionIdRef.current);
                           // Если я не в списке ожидания, значит, точно пора выходить
                           if (!isStillWaiting) {
                               onExit();
                           }
                        }
                    }
                    return receivedState;
                });
            } catch (e) { console.error('Error parsing game state:', e); }
        }
        if (receivedTopic === presenceTopic) {
             try {
                const { playerId } = JSON.parse(message.toString());
                lastSeenTimestampsRef.current[playerId] = Date.now();
            } catch (e) { /* ignore parse error */ }
        }
    });

    const heartbeatInterval = setInterval(() => {
        if (client.connected && myPlayerId !== null && !isSpectator) {
            client.publish(presenceTopic, JSON.stringify({ playerId: myPlayerId }));
        }
    }, 5000);

    const statusCheckInterval = setInterval(() => {
        const localGameState = gameStateRef.current;
        if (!localGameState || isSpectator || myPlayerId !== localGameState.hostId) { // Only host checks status
            return;
        }

        const now = Date.now();
        let needsUpdate = false;
        const activePlayersCountBeforeUpdate = localGameState.players.filter(p => p.isClaimed && !p.isSpectator).length;

        const newPlayers = localGameState.players.map(p => {
            const playerCopy = {...p};
            if (!playerCopy.isClaimed || playerCopy.isSpectator) return playerCopy;
            
            const lastSeen = lastSeenTimestampsRef.current[playerCopy.id] || (playerCopy.status === 'online' ? now : 0);
            
            if (now - lastSeen > 600000) { // 10 minutes timeout
                 if (playerCopy.isClaimed) {
                    needsUpdate = true;
                    return { ...playerCopy, isClaimed: false, status: 'offline' };
                 }
                 return playerCopy;
            }

            let newStatus = playerCopy.status;
            if (now - lastSeen > 15000) newStatus = 'disconnected'; // 15 seconds
            else if (now - lastSeen > 7000) newStatus = 'away'; // 7 seconds
            else newStatus = 'online';

            if (newStatus !== playerCopy.status) {
                needsUpdate = true;
                playerCopy.status = newStatus;
            }
            return playerCopy;
        });

        if (needsUpdate) {
            let newState = { ...localGameState, players: newPlayers };
            let newHostId = localGameState.hostId;
            const currentHost = newPlayers.find(p => p.id === localGameState.hostId);
    
            if (!currentHost || !currentHost.isClaimed || currentHost.isSpectator || currentHost.status !== 'online') {
                newHostId = findNextHost(newPlayers);
                newState.hostId = newHostId;
            }
            
            const remainingPlayersAfterUpdate = newPlayers.filter(p => p.isClaimed && !p.isSpectator);
            
            if (remainingPlayersAfterUpdate.length < 2 && activePlayersCountBeforeUpdate >= 2 && !localGameState.isGameOver) {
                 publishState({
                    ...newState,
                    isGameOver: true,
                    gameMessage: remainingPlayersAfterUpdate.length === 1 
                        ? `${remainingPlayersAfterUpdate[0].name} победил, так как все остальные игроки вышли!`
                        : 'Все игроки вышли. Игра окончена.',
                });
                return;
            }
            publishState(newState);
        }
    }, 5000);

    client.on('error', () => setConnectionStatus('error'));
    client.on('offline', () => setConnectionStatus('reconnecting'));
    client.on('reconnect', () => setConnectionStatus('reconnecting'));

    return () => {
      clearInterval(heartbeatInterval);
      clearInterval(statusCheckInterval);
      if (client) client.end();
    };
  }, [roomCode, playerName, onExit, findNextActivePlayer, publishState]);


  // --- Game Logic Actions ---
  const createAction = (handler) => React.useCallback((...args) => {
    const state = gameStateRef.current;
    if (state) {
      handler(state, ...args);
    }
  }, [publishState, findNextActivePlayer]);

  const handleStartOfficialGame = createAction((state) => {
    if (myPlayerId !== state.hostId || state.isGameStarted) return;

    const claimedPlayerCount = state.players.filter(p => p.isClaimed && !p.isSpectator).length;
    if (claimedPlayerCount < 2) {
        publishState({ ...state, gameMessage: "Нужно как минимум 2 игрока, чтобы начать." });
        return;
    }
    
    const firstPlayer = state.players[state.currentPlayerIndex];
    let gameMessage = `Игра началась! Ход ${firstPlayer.name}.`;
    if (!firstPlayer.hasEnteredGame) {
        gameMessage += ` Ему нужно 50+ для входа.`;
    }

    publishState({
        ...state,
        isGameStarted: true,
        canRoll: true,
        gameMessage: gameMessage,
        turnStartTime: Date.now(),
    });
  });

  const handleRollDice = createAction((state) => {
    if (!state.canRoll || state.isGameOver || !state.isGameStarted) return;

    const isHotDiceRoll = state.keptDiceThisTurn.length >= 5;
    const diceToRollCount = isHotDiceRoll ? 5 : 5 - state.keptDiceThisTurn.length;
    const newDice = Array.from({ length: diceToRollCount }, () => Math.floor(Math.random() * 6) + 1);
    const { scoringGroups } = analyzeDice(newDice);

    if (scoringGroups.length === 0) { // BOLT!
      const currentPlayerForBolt = state.players[state.currentPlayerIndex];
      let updatedPlayer = {
        ...currentPlayerForBolt,
        scores: [...currentPlayerForBolt.scores, '/'],
      };

      const barrelStatus = getPlayerBarrelStatus(currentPlayerForBolt);
      if (barrelStatus) {
        const newBarrelBolts = (updatedPlayer.barrelBolts || 0) + 1;
        updatedPlayer.barrelBolts = newBarrelBolts;
        if (newBarrelBolts >= 3) {
          const totalScore = calculateTotalScore(currentPlayerForBolt);
          let penalty = (barrelStatus === '200-300') ? (150 - totalScore) : (650 - totalScore);
          updatedPlayer.scores.push(penalty);
          updatedPlayer.barrelBolts = 0;
        }
      }
      
      const newPlayers = state.players.map((p, i) => i === state.currentPlayerIndex ? updatedPlayer : p);
      const nextPlayerIndex = findNextActivePlayer(state.currentPlayerIndex, newPlayers);
      const nextPlayer = newPlayers[nextPlayerIndex];

      let gameMessage = `${state.players[state.currentPlayerIndex].name} получает болт! Ход ${nextPlayer.name}.`;
      if (!nextPlayer.hasEnteredGame) gameMessage += ` Ему нужно 50+ для входа.`;

      publishState({ ...createInitialState(), players: newPlayers, spectators: state.spectators, leavers: state.leavers, hostId: state.hostId, isGameStarted: true, currentPlayerIndex: nextPlayerIndex, diceOnBoard: newDice, gameMessage: gameMessage, turnStartTime: Date.now(), canRoll: true }, true);
      return;
    }
    
    publishState({ ...state, diceOnBoard: newDice, keptDiceThisTurn: isHotDiceRoll ? [] : state.keptDiceThisTurn, diceKeptFromThisRoll: [], scoreFromPreviousRolls: state.currentTurnScore, gameMessage: `Ваш бросок. Выберите и перетащите очковые кости.`, canRoll: false, canBank: true, selectedDiceIndices: [], canKeep: false, potentialScore: 0 }, true);
  });
  
  const handleToggleDieSelection = createAction((state, index) => {
    if (state.isGameOver || state.diceOnBoard.length === 0) return;
    
    const newSelectedIndices = state.selectedDiceIndices.includes(index)
        ? state.selectedDiceIndices.filter(i => i !== index)
        : [...state.selectedDiceIndices, index];
    
    const selectedValues = newSelectedIndices.map(i => state.diceOnBoard[i]);
    
    let validation = validateSelection(selectedValues);
    if (!validation.isValid && selectedValues.length > 0) {
        const combinedValidation = validateSelection([...state.diceKeptFromThisRoll, ...selectedValues]);
        if (combinedValidation.isValid) {
            const currentRollScore = validateSelection(state.diceKeptFromThisRoll).score;
            validation = { isValid: true, score: combinedValidation.score - currentRollScore, values: selectedValues };
        }
    }

    publishState({ ...state, selectedDiceIndices: newSelectedIndices, canKeep: validation.isValid, potentialScore: validation.score > 0 ? validation.score : 0, gameMessage: validation.isValid ? `Выбрано +${validation.score}. Перетащите или дважды кликните, чтобы отложить.` : `Выберите корректную комбинацию.` }, true);
  });

  const handleKeepDice = createAction((state, indices) => {
    if (state.isGameOver) return;

    const newlySelectedValues = indices.map(i => state.diceOnBoard[i]);
    const combinedDiceForValidation = [...state.diceKeptFromThisRoll, ...newlySelectedValues];
    const validation = validateSelection(combinedDiceForValidation);

    if (!validation.isValid) {
        publishState({ ...state, gameMessage: "Неверный выбор. Эта кость не образует очковую комбинацию." }, true);
        return;
    }

    const scoreOfThisRoll = validation.score;
    const newTurnScore = state.scoreFromPreviousRolls + scoreOfThisRoll;
    const scoreAdded = newTurnScore - state.currentTurnScore;
    const newKeptDiceThisTurn = [...state.keptDiceThisTurn, ...newlySelectedValues];
    const newDiceOnBoard = state.diceOnBoard.filter((_, i) => !indices.includes(i));

    let newState;
    if (newDiceOnBoard.length === 0) { // Hot Dice
       newState = { ...state, currentTurnScore: newTurnScore, keptDiceThisTurn: newKeptDiceThisTurn, diceKeptFromThisRoll: [], diceOnBoard: [], gameMessage: `+${scoreAdded}! Очки за ход: ${newTurnScore}. Все кости сыграли! Бросайте снова.`, canRoll: true, canBank: true, selectedDiceIndices: [], canKeep: false, potentialScore: 0 };
    } else {
        newState = { ...state, currentTurnScore: newTurnScore, keptDiceThisTurn: newKeptDiceThisTurn, diceKeptFromThisRoll: combinedDiceForValidation, diceOnBoard: newDiceOnBoard, gameMessage: `+${scoreAdded}! Очки за ход: ${newTurnScore}. Бросайте снова или запишите.`, canRoll: true, canBank: true, selectedDiceIndices: [], canKeep: false, potentialScore: 0 };
    }
    publishState(newState, true);
  });
  
  const handleBankScore = createAction((state) => {
    if (!state.canBank || state.isGameOver) return;
    
    let finalTurnScore = state.currentTurnScore + state.potentialScore;
    const selectedValues = state.selectedDiceIndices.map(i => state.diceOnBoard[i]);
    const validation = validateSelection([...state.diceKeptFromThisRoll, ...selectedValues]);
    if(state.selectedDiceIndices.length > 0 && validation.isValid){
        finalTurnScore = state.scoreFromPreviousRolls + validation.score;
    }
    
    const currentPlayer = state.players[state.currentPlayerIndex];
    
    if (finalTurnScore === 0) {
      // This logic path for Bolt is a fallback, main one is in handleRollDice
      const updatedPlayer = { ...currentPlayer, scores: [...currentPlayer.scores, '/'] };
      const newPlayers = state.players.map((p, i) => i === state.currentPlayerIndex ? updatedPlayer : p);
      const nextIdx = findNextActivePlayer(state.currentPlayerIndex, newPlayers);
      const msg = `${currentPlayer.name} получает болт. Ход ${newPlayers[nextIdx].name}.`;
      publishState({ ...createInitialState(), players: newPlayers, spectators: state.spectators, leavers: state.leavers, hostId: state.hostId, isGameStarted: true, canRoll: true, currentPlayerIndex: nextIdx, gameMessage: msg, turnStartTime: Date.now() }, true);
      return;
    }

    if (!currentPlayer.hasEnteredGame && finalTurnScore < 50) {
        const nextPlayerIndex = findNextActivePlayer(state.currentPlayerIndex, state.players);
        let msg = `${currentPlayer.name} не набрал(а) 50 очков для входа. Ход ${state.players[nextPlayerIndex].name}.`;
        publishState({ ...createInitialState(), players: state.players, spectators: state.spectators, leavers: state.leavers, hostId: state.hostId, isGameStarted: true, canRoll: true, currentPlayerIndex: nextPlayerIndex, gameMessage: msg, turnStartTime: Date.now() }, true);
        return;
    }
    
    const totalScoreBeforeTurn = calculateTotalScore(currentPlayer);
    const barrelStatus = getPlayerBarrelStatus(currentPlayer);
    let turnFailedBarrel = false;

    if (barrelStatus === '200-300' && (totalScoreBeforeTurn + finalTurnScore < 300)) turnFailedBarrel = true;
    if (barrelStatus === '700-800' && (totalScoreBeforeTurn + finalTurnScore < 800)) turnFailedBarrel = true;

    if (turnFailedBarrel) {
        let updatedPlayer = { ...currentPlayer, scores: [...currentPlayer.scores, '/'] };
        const newBarrelBolts = (updatedPlayer.barrelBolts || 0) + 1;
        updatedPlayer.barrelBolts = newBarrelBolts;
        if (newBarrelBolts >= 3) {
            const totalScore = calculateTotalScore(currentPlayer);
            let penalty = (barrelStatus === '200-300') ? (150 - totalScore) : (650 - totalScore);
            updatedPlayer.scores.push(penalty);
            updatedPlayer.barrelBolts = 0;
        }
        const newPlayers = state.players.map((p, i) => i === state.currentPlayerIndex ? updatedPlayer : p);
        const nextIdx = findNextActivePlayer(state.currentPlayerIndex, newPlayers);
        const msg = `${currentPlayer.name} не смог(ла) сойти с бочки. Очки сгорели. Ход ${newPlayers[nextIdx].name}.`;
        publishState({ ...createInitialState(), players: newPlayers, spectators: state.spectators, leavers: state.leavers, hostId: state.hostId, isGameStarted: true, canRoll: true, currentPlayerIndex: nextIdx, gameMessage: msg, turnStartTime: Date.now() }, true);
        return;
    }
    
    let playersAfterTurn = state.players.map((p, i) => (i === state.currentPlayerIndex) ? { ...p, scores: [...p.scores, finalTurnScore], hasEnteredGame: true, barrelBolts: 0 } : p);

    const currentPlayerNewTotal = calculateTotalScore(playersAfterTurn[state.currentPlayerIndex]);
    let penaltyMessages = [];

    const newBarrelStatus = (currentPlayerNewTotal >= 200 && currentPlayerNewTotal < 300) ? '200-300' : (currentPlayerNewTotal >= 700 && currentPlayerNewTotal < 800) ? '700-800' : null;

    let playersWithPenalties = playersAfterTurn.map((p, i) => {
        if (i === state.currentPlayerIndex || !p.isClaimed || p.isSpectator) return p;

        const otherPlayerOldTotal = calculateTotalScore(p);
        let penaltiesToAdd = [];

        if (newBarrelStatus && getPlayerBarrelStatus(p) === newBarrelStatus) {
            penaltyMessages.push(`${p.name} сбит с бочки.`);
            let penaltyAmount = (newBarrelStatus === '200-300') ? (150 - otherPlayerOldTotal) : (650 - otherPlayerOldTotal);
            penaltiesToAdd.push(penaltyAmount);
        }
        
        if (currentPlayerNewTotal >= otherPlayerOldTotal && otherPlayerOldTotal >= 100) {
            const isGettingBarrelPenalty = penaltiesToAdd.length > 0;
            const newTotalWithBarrelPenalty = otherPlayerOldTotal + (isGettingBarrelPenalty ? penaltiesToAdd[0] : 0);
            // Не штрафуем за обгон, если из-за штрафа с бочки очки сравнялись
            if (currentPlayerNewTotal !== newTotalWithBarrelPenalty) {
              penaltyMessages.push(`${p.name} получает штраф -50.`);
              penaltiesToAdd.push(-50);
            }
        }
        
        return penaltiesToAdd.length > 0 ? { ...p, scores: [...p.scores, ...penaltiesToAdd] } : p;
    });

    if (calculateTotalScore(playersWithPenalties[state.currentPlayerIndex]) >= 1000) {
      let winMessage = `${currentPlayer.name} победил!`;
      if (penaltyMessages.length > 0) winMessage += " " + [...new Set(penaltyMessages)].join(" ");
      publishState({ ...createInitialState(), players: playersWithPenalties, spectators: state.spectators, leavers: state.leavers, hostId: state.hostId, isGameOver: true, gameMessage: winMessage }, true);
      return;
    }

    const nextPlayerIndex = findNextActivePlayer(state.currentPlayerIndex, playersWithPenalties);
    const nextPlayer = playersWithPenalties[nextPlayerIndex];
    let bankMessage = `${currentPlayer.name} записал ${finalTurnScore}. Ход ${nextPlayer.name}.`;
    if (penaltyMessages.length > 0) bankMessage += " " + [...new Set(penaltyMessages)].join(" ");
    
    if (!nextPlayer.hasEnteredGame) bankMessage += ` Ему нужно 50+ для входа.`;
    else if (getPlayerBarrelStatus(nextPlayer)) bankMessage += ` Он(а) на бочке.`;

    publishState({ ...createInitialState(), players: playersWithPenalties, spectators: state.spectators, leavers: state.leavers, hostId: state.hostId, isGameStarted: true, canRoll: true, currentPlayerIndex: nextPlayerIndex, gameMessage: bankMessage, turnStartTime: Date.now() }, true);
  });

  const handleSkipTurn = createAction((state) => {
    if(state.isGameOver || myPlayerId === state.currentPlayerIndex) return;
    
    const currentPlayer = state.players[state.currentPlayerIndex];
    if(currentPlayer.status === 'online') return;

    const newPlayers = state.players.map((p, i) => i === state.currentPlayerIndex ? { ...p, scores: [...p.scores, '/'] } : p);
    const nextIdx = findNextActivePlayer(state.currentPlayerIndex, newPlayers);
    let msg = `${currentPlayer.name} пропустил ход. Ход ${newPlayers[nextIdx].name}.`;
    publishState({ ...createInitialState(), players: newPlayers, spectators: state.spectators, leavers: state.leavers, hostId: state.hostId, isGameStarted: true, canRoll: true, currentPlayerIndex: nextIdx, gameMessage: msg, turnStartTime: Date.now() });
  });

  const handleNewGame = createAction((state) => {
      if (myPlayerId !== state.hostId) return;
      const newPlayers = Array.from({ length: 5 }, (_, id) => {
          const oldPlayer = state.players.find(p => p && p.id === id && p.isClaimed && !p.isSpectator);
          return oldPlayer 
            ? { ...createInitialState().players[0], id, name: oldPlayer.name, isClaimed: true, status: oldPlayer.status, sessionId: oldPlayer.sessionId }
            : { ...createInitialState().players[0], id, name: `Игрок ${id + 1}` };
      });

      const claimedCount = newPlayers.filter(p => p.isClaimed).length;
      const hostName = newPlayers.find(p => p.id === state.hostId)?.name || 'Хост';
      
      const gameMessage = claimedCount < 2 
          ? `${hostName} создал(а) новую игру. Ожидание других игроков...`
          : `Новая игра! Ожидание начала от хоста.`;

      publishState({ ...createInitialState(), players: newPlayers, spectators: state.spectators, hostId: state.hostId, currentPlayerIndex: state.hostId, gameMessage });
  });

  const handleJoinRequest = createAction((state, requestSessionId, accepted) => {
    if (myPlayerId !== state.hostId) return;

    const request = (state.joinRequests || []).find(r => r.sessionId === requestSessionId);
    if (!request) return;

    const remainingRequests = (state.joinRequests || []).filter(r => r.sessionId !== requestSessionId);
    let newState = { ...state, joinRequests: remainingRequests };

    if (accepted) {
        let joinIndex = newState.players.findIndex(p => !p.isClaimed);
        if (joinIndex !== -1) {
            const restoredScore = newState.leavers?.[request.name] || 0;
            const newLeavers = { ...newState.leavers };
            if (restoredScore > 0) delete newLeavers[request.name];
            const newPlayers = newState.players.map((p, i) => i === joinIndex ? { ...p, name: request.name, isClaimed: true, scores: restoredScore > 0 ? [restoredScore] : [], status: 'online', sessionId: request.sessionId, hasEnteredGame: restoredScore > 0 } : p );
            newState = { ...newState, players: newPlayers, leavers: newLeavers, gameMessage: `${request.name} присоединился к игре.` };
        } else {
            newState = { ...newState, spectators: [...newState.spectators, { name: request.name, id: request.sessionId }], gameMessage: `Для ${request.name} не нашлось места, он стал зрителем.` };
        }
    } else {
        newState = { ...newState, spectators: [...(newState.spectators || []), { name: request.name, id: request.sessionId }], gameMessage: `Хост отклонил запрос ${request.name}.` };
    }
    publishState(newState);
  });
  
  React.useEffect(() => {
    const isHost = myPlayerId === gameState?.hostId;
    if (isHost && gameState?.joinRequests?.length > 0) {
      const now = Date.now();
      const timeout = 30000;
      gameState.joinRequests.forEach(req => {
        if (now - req.timestamp > timeout) {
          handleJoinRequest(req.sessionId, false);
        }
      });
    }
  }, [gameState, myPlayerId, handleJoinRequest]);

  const handleJoinGame = createAction((state) => {
    if (myPlayerId !== null || isSpectator || state.joinRequests.some(r => r.sessionId === mySessionIdRef.current)) return;
  
    if (state.players.filter(p => !p.isClaimed).length === 0) {
      if (window.confirm("Нет свободных мест. Хотите присоединиться в качестве зрителя?")) {
        publishState({ ...state, spectators: [...state.spectators, { name: playerName, id: mySessionIdRef.current }] });
        setIsSpectator(true);
      }
      return;
    }

    if (state.isGameStarted && !state.isGameOver) {
        publishState({ ...state, joinRequests: [...(state.joinRequests || []), { name: playerName, sessionId: mySessionIdRef.current, timestamp: Date.now() }], gameMessage: `${playerName} хочет присоединиться. Ожидание хоста.` }, true);
    } else {
        let joinIndex = state.players.findIndex(p => !p.isClaimed);
        if (joinIndex === -1) return;

        const restoredScore = state.leavers?.[playerName] || 0;
        const newLeavers = { ...state.leavers };
        if (restoredScore > 0) delete newLeavers[playerName];

        const newPlayer = { ...state.players[joinIndex], name: playerName, isClaimed: true, scores: restoredScore > 0 ? [restoredScore] : [], status: 'online', sessionId: mySessionIdRef.current, hasEnteredGame: restoredScore > 0 };
        const newPlayers = state.players.map((p, i) => i === joinIndex ? newPlayer : p);

        let newHostId = state.hostId === null ? findNextHost(newPlayers) ?? joinIndex : state.hostId;
        const claimedCount = newPlayers.filter(p => p.isClaimed && !p.isSpectator).length;
        
        const optimisticState = { ...state, players: newPlayers, leavers: newLeavers, hostId: newHostId, gameMessage: claimedCount < 2 ? `Ожидание игроков...` : `Готовы к игре! Хост может начинать.` };
        setMyPlayerId(joinIndex);
        setGameState(optimisticState); // Immediate optimistic update
        publishState(optimisticState, false); // Publish without re-setting state
    }
  });

  const handleLeaveGame = createAction((state) => {
    if (isSpectator) {
      publishState({...state, spectators: state.spectators.filter(s => s.id !== mySessionIdRef.current)});
      onExit();
      return;
    }
    if (myPlayerId === null) {
      onExit();
      return;
    }
      
    const me = state.players.find(p => p.id === myPlayerId);
    if (!me) return onExit();

    const totalScore = calculateTotalScore(me);
    const newLeavers = (totalScore > 0) ? { ...state.leavers, [me.name]: totalScore } : state.leavers;
    
    let newPlayers = state.players.map(p => p.id === myPlayerId ? { ...createInitialState().players[0], id: myPlayerId, name: `Игрок ${myPlayerId + 1}` } : p);
    
    // Re-assign IDs and compact list if needed, but simple replacement is safer for now.
    
    let newHostId = state.hostId;
    const hostPlayer = newPlayers.find(p => p.id === state.hostId);
    if (!hostPlayer || !hostPlayer.isClaimed) {
        newHostId = findNextHost(newPlayers);
    }

    const remainingActive = newPlayers.filter(p => p.isClaimed && !p.isSpectator);
    const wasGameInProgress = state.isGameStarted && !state.isGameOver;

    let finalState;
    if (wasGameInProgress && remainingActive.length < 2 && state.players.filter(p => p.isClaimed && !p.isSpectator).length >= 2) {
        finalState = { ...state, players: newPlayers, leavers: newLeavers, hostId: newHostId, isGameOver: true, gameMessage: remainingActive.length === 1 ? `${remainingActive[0].name} победил!` : 'Все вышли.' };
    } else {
        let newCurrentPlayerIndex = state.currentPlayerIndex;
        // If the leaving player was the current player, advance the turn
        if (wasGameInProgress && state.currentPlayerIndex === myPlayerId) {
            newCurrentPlayerIndex = findNextActivePlayer(state.currentPlayerIndex, newPlayers);
            const cleanTurn = createInitialState();
            finalState = { ...state, ...cleanTurn, players: newPlayers, leavers: newLeavers, hostId: newHostId, isGameStarted: true, canRoll: true, currentPlayerIndex: newCurrentPlayerIndex, gameMessage: `${me.name} покинул игру. Ход ${newPlayers[newCurrentPlayerIndex].name}.`, turnStartTime: Date.now() };
        } else {
            finalState = { ...state, players: newPlayers, leavers: newLeavers, hostId: newHostId, gameMessage: `${me.name} покинул игру.` };
        }
    }
    
    publishState(finalState);
    onExit();
  });

  return {
    gameState, myPlayerId, isSpectator, connectionStatus, mySessionId: mySessionIdRef.current,
    handleStartOfficialGame, handleRollDice, handleToggleDieSelection, handleKeepDice, handleBankScore,
    handleSkipTurn, handleNewGame, handleJoinRequest, handleJoinGame, handleLeaveGame
  };
};