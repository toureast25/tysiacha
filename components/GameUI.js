// 
import React from 'react';
import RulesModal from './RulesModal.js';
import SpectatorsModal from './SpectatorsModal.js';
import { DiceIcon, SmallDiceIcon } from './Dice.js';
import { calculateTotalScore, getPlayerBarrelStatus } from '../utils/gameLogic.js';

const GameUI = ({
  // state
  gameState, myPlayerId, isSpectator, roomCode, mySessionId,
  // ui state
  isScoreboardExpanded, isSpectatorsModalOpen, showRules, isDragOver,
  // ui handlers
  setIsScoreboardExpanded, setIsSpectatorsModalOpen, setShowRules, setIsDragOver,
  // game handlers
  handleStartOfficialGame, handleRollDice, handleToggleDieSelection, handleKeepDice, handleBankScore, handleSkipTurn, handleNewGame, handleJoinRequest, handleJoinGame, handleLeaveGame, handleDragStart, handleDrop, handleDieDoubleClick,
}) => {
  const PlayerStatus = ({ player }) => {
    if (!player.isClaimed || player.isSpectator) return null;
    const statusMap = {
        online: { text: 'онлайн', color: 'text-green-400' },
        away: { text: 'отошел', color: 'text-yellow-400' },
        disconnected: { text: 'отключен', color: 'text-red-500' },
        offline: { text: 'подключается', color: 'text-gray-400' },
    };
    const { text, color } = statusMap[player.status] || statusMap.offline;
    return React.createElement('span', { className: `text-xs ${color}` }, `(${text})`);
  };

  const isMyTurn = myPlayerId === gameState.currentPlayerIndex && !isSpectator;
  const isHost = myPlayerId === gameState.hostId;
  const claimedPlayerCount = gameState.players.filter(p => p.isClaimed && !p.isSpectator).length;
  const rollButtonText = (gameState.keptDiceThisTurn.length >= 5 ? 5 : 5 - gameState.keptDiceThisTurn.length) === 5 
    ? 'Бросить все' : `Бросить ${5 - gameState.keptDiceThisTurn.length}`;
  
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const isCurrentPlayerInactive = currentPlayer && (currentPlayer.status === 'away' || currentPlayer.status === 'disconnected');
  const showSkipButton = !isMyTurn && isCurrentPlayerInactive && !gameState.isGameOver && (Date.now() - gameState.turnStartTime > 30000);
  const canJoin = myPlayerId === null && !isSpectator;
  const availableSlotsForJoin = gameState.players.filter(p => !p.isClaimed && !p.isSpectator).length;
  const isAwaitingApproval = myPlayerId === null && gameState.joinRequests && gameState.joinRequests.some(r => r.sessionId === mySessionId);

  let displayMessage = gameState.gameMessage;
  const myBarrelStatus = isMyTurn ? getPlayerBarrelStatus(currentPlayer) : null;

  if (gameState.isGameOver && !canJoin) {
      const hostPlayer = gameState.players.find(p => p.id === gameState.hostId);
      const hostName = hostPlayer ? hostPlayer.name : 'хост';
      displayMessage = `${gameState.gameMessage} Ожидание, пока ${hostName} начнет новую игру.`;
  } else if (isMyTurn && gameState.isGameStarted) {
      if (!currentPlayer.hasEnteredGame) displayMessage = "Ваш ход. Вам нужно набрать 50+ очков, чтобы войти в игру.";
      else if (myBarrelStatus === '200-300') displayMessage = "Вы на бочке! Нужно набрать очков, чтобы стало 300 или больше.";
      else if (myBarrelStatus === '700-800') displayMessage = "Вы на бочке! Нужно набрать очков, чтобы стало 800 или больше.";
  }

  const JoinRequestManager = () => {
    if (!isHost || !gameState.joinRequests || gameState.joinRequests.length === 0) return null;
    
    return React.createElement('div', { className: 'absolute top-24 left-1/2 -translate-x-1/2 w-full max-w-md p-4 bg-slate-700 border-2 border-yellow-400 rounded-lg shadow-lg z-20 animate-pulse' },
        React.createElement('h3', { className: 'text-lg font-bold text-yellow-300 mb-2 text-center' }, 'Запросы на присоединение'),
        React.createElement('ul', { className: 'space-y-2' },
            gameState.joinRequests.map(req => React.createElement('li', { key: req.sessionId, className: 'flex items-center justify-between p-2 bg-slate-800 rounded' },
                React.createElement('span', { className: 'text-white' }, req.name),
                React.createElement('div', { className: 'flex gap-2' },
                    React.createElement('button', { onClick: () => handleJoinRequest(req.sessionId, true), className: 'px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm font-bold' }, 'Принять'),
                    React.createElement('button', { onClick: () => handleJoinRequest(req.sessionId, false), className: 'px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm font-bold' }, 'Отклонить')
                )
            ))
        )
    );
  };

  const AwaitingApprovalScreen = () => {
    return React.createElement('div', { className: 'text-center' },
        React.createElement('h3', { className: 'font-ruslan text-3xl text-yellow-300' }, 'Ожидание подтверждения'),
        React.createElement('p', { className: 'mt-4 text-lg' }, 'Ваш запрос на присоединение к игре отправлен хосту.'),
        React.createElement('div', { className: 'mt-6 w-16 h-16 border-4 border-t-transparent border-yellow-300 rounded-full animate-spin mx-auto' })
    );
  };
  
  return React.createElement(
    React.Fragment,
    null,
    showRules && React.createElement(RulesModal, { onClose: () => setShowRules(false) }),
    isSpectatorsModalOpen && React.createElement(SpectatorsModal, { spectators: gameState.spectators, onClose: () => setIsSpectatorsModalOpen(false) }),
    React.createElement(
      'div', { className: "w-full h-full flex flex-col p-4 text-white overflow-hidden" },
      React.createElement('header', { className: `flex justify-between items-center mb-4 flex-shrink-0 z-50` },
        React.createElement('div', { className: "p-2 bg-black/50 rounded-lg text-sm" }, React.createElement('p', { className: "font-mono" }, `КОД: ${roomCode}`)),
        React.createElement('h1', { onClick: () => setShowRules(true), className: "font-ruslan text-4xl text-yellow-300 cursor-pointer hover:text-yellow-200 transition-colors", title: "Показать правила" }, 'ТЫСЯЧА'),
        React.createElement('button', { onClick: handleLeaveGame, className: "px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-bold" }, isSpectator || canJoin ? 'В лобби' : 'Выйти')
      ),
      React.createElement('div', { className: "flex-grow flex flex-col lg:grid lg:grid-cols-4 gap-4 min-h-0" },
        React.createElement('aside', { className: `bg-slate-800/80 p-4 border border-slate-700 flex flex-col transition-all duration-500 ease-in-out lg:col-span-1 rounded-xl ${isScoreboardExpanded ? 'fixed inset-x-4 top-20 bottom-4 z-40 lg:relative lg:inset-auto lg:z-auto' : 'flex-shrink-0'}` },
          React.createElement('div', { className: "flex justify-between items-center mb-4 flex-shrink-0" },
            React.createElement('h2', { className: "font-ruslan text-3xl text-yellow-300 flex items-baseline" },
              'Игроки',
              gameState.spectators.length > 0 && React.createElement('button', { onClick: () => setIsSpectatorsModalOpen(true), className: "text-lg ml-2 font-normal font-['Roboto_Condensed'] text-blue-400 hover:text-blue-300 hover:underline" }, `(Зрители: ${gameState.spectators.length})`)
            ),
            React.createElement('button', { onClick: () => setIsScoreboardExpanded(!isScoreboardExpanded), className: "p-1 rounded-full hover:bg-slate-700/50 lg:hidden ml-auto z-50" }, 
              React.createElement('svg', { xmlns: "http://www.w3.org/2000/svg", className: `h-6 w-6 text-yellow-300 transition-transform duration-300 ${isScoreboardExpanded ? 'rotate-180' : ''}`, fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2 },
                React.createElement('path', { strokeLinecap: "round", strokeLinejoin: "round", d: "M19 9l-7 7-7-7" })
              )
            )
          ),
          React.createElement('div', { className: "flex-grow overflow-y-auto relative" },
            React.createElement('table', { className: "w-full text-sm text-left text-gray-300" },
              React.createElement('thead', { className: "text-xs text-yellow-300 uppercase bg-slate-800 sticky top-0 z-10" },
                React.createElement('tr', null, 
                  gameState.players.map(player => {
                    const isHostPlayer = player.id === gameState.hostId;
                    const barrelStatus = getPlayerBarrelStatus(player);
                    return React.createElement('th', { key: `player-header-${player.id}`, scope: "col", className: `h-16 px-0 py-0 text-center align-middle transition-all duration-300 relative ${player.id === gameState.currentPlayerIndex && gameState.isGameStarted && !gameState.isGameOver && player.isClaimed ? 'bg-yellow-400 text-slate-900' : 'bg-slate-700/50'} ${player.id === myPlayerId ? 'outline outline-2 outline-blue-400' : ''}`},
                      !player.isClaimed
                        ? React.createElement('div', { className: "flex flex-col items-center justify-center h-full py-2 text-gray-500" }, React.createElement('span', { className: "text-lg" }, `Место ${player.id + 1}`), React.createElement('span', { className: "text-xs italic" }, '(свободно)'))
                        : React.createElement('div', { className: "flex flex-col items-center justify-center h-full py-2" },
                            React.createElement('div', { className: "flex items-center justify-center" },
                              isHostPlayer && React.createElement('svg', { xmlns: "http://www.w3.org/2000/svg", className: "h-4 w-4 mr-1 text-yellow-400", viewBox: "0 0 20 20", fill: "currentColor" }, React.createElement('path', { d: "M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" })),
                              React.createElement('span', { className: "px-1" }, player.name)
                            ),
                            !player.hasEnteredGame && gameState.isGameStarted && React.createElement('span', { className: "text-xs font-normal text-cyan-300 italic" }, '(старт)'),
                            barrelStatus && React.createElement('span', { className: "text-xs font-normal text-orange-400 italic" }, '(на бочке)'),
                            barrelStatus && player.barrelBolts > 0 && React.createElement('span', { className: 'text-xs font-bold text-red-500 ml-1' }, '/'.repeat(player.barrelBolts)),
                            React.createElement(PlayerStatus, { player: player })
                          )
                    );
                  })
                )
              ),
              React.createElement('tbody', { className: `lg:table-row-group ${isScoreboardExpanded ? '' : 'hidden'}` },
                (() => {
                  const maxRounds = gameState.players.reduce((max, p) => Math.max(max, p.scores.length), 0);
                  if (maxRounds === 0) return React.createElement('tr', null, React.createElement('td', { colSpan: gameState.players.length, className: "py-4 px-2 text-center text-gray-400 italic" }, 'Очков не записано.'));
                  
                  return Array.from({ length: maxRounds }).map((_, i) => 
                    React.createElement('tr', { key: `round-row-${i}`, className: "border-b border-slate-700 hover:bg-slate-700/30" },
                      gameState.players.map(player =>
                        React.createElement('td', { key: `cell-${player.id}-${i}`, className: "py-2 px-2 text-center font-mono" },
                           player.scores[i] !== undefined ? player.scores[i] : React.createElement('span', { className: "text-slate-500" }, '-')
                        )
                      )
                    )
                  );
                })()
              ),
              React.createElement('tfoot', { className: "sticky bottom-0 bg-slate-800 font-bold text-white border-t-2 border-slate-500" },
                 React.createElement('tr', null, gameState.players.map((player) => 
                   React.createElement('td', { key: `total-score-${player.id}`, className: `h-10 px-2 text-center text-lg font-mono align-middle transition-colors duration-300 ${player.id === gameState.currentPlayerIndex && gameState.isGameStarted && !gameState.isGameOver && player.isClaimed ? 'bg-yellow-400/80 text-slate-900' : 'bg-slate-900/50'} ${player.id === myPlayerId ? 'outline outline-2 outline-blue-400' : ''}` }, 
                     calculateTotalScore(player)
                   )
                 ))
              )
            )
          )
        ),
        React.createElement('main', { className: `relative flex-grow lg:col-span-3 bg-slate-900/70 rounded-xl border-2 flex flex-col justify-between min-h-0 p-4 transition-all duration-300 ${isDragOver && isMyTurn ? 'border-green-400 shadow-2xl shadow-green-400/20' : 'border-slate-600'} ${isScoreboardExpanded ? 'opacity-0 pointer-events-none lg:opacity-100 lg:pointer-events-auto' : 'opacity-100'}`, onDragOver: (e) => {e.preventDefault(); setIsDragOver(true);}, onDrop: handleDrop, onDragLeave: () => setIsDragOver(false) },
          React.createElement(JoinRequestManager, null),
          React.createElement('div', { className: "w-full" },
            React.createElement('div', { className: `w-full p-3 mb-4 text-center rounded-lg ${gameState.isGameOver ? 'bg-green-600' : 'bg-slate-800'} border border-slate-600 flex items-center justify-center min-h-[72px]` },
              React.createElement('p', { className: "text-lg font-semibold" }, displayMessage)
            ),
            React.createElement('div', { className: "w-full flex justify-center md:justify-end" },
              React.createElement('div', { className: "p-3 rounded-lg bg-black/40 border border-slate-700 w-full md:w-auto md:min-w-[300px]" },
                React.createElement('p', { className: "text-xs text-gray-400 mb-2 text-center uppercase tracking-wider" }, 'Отложено'),
                React.createElement('div', { className: "flex gap-2 flex-wrap justify-center min-h-[40px] items-center" },
                  gameState.keptDiceThisTurn.length > 0
                    ? gameState.keptDiceThisTurn.map((value, i) => React.createElement(SmallDiceIcon, { key: `kept-${i}`, value: value }))
                    : React.createElement('span', { className: "text-slate-500 italic" }, 'Пусто')
                )
              )
            )
          ),
          React.createElement('div', { className: "flex-grow w-full flex flex-col items-center justify-center pt-3 pb-6" },
            React.createElement('div', { className: "w-full sm:max-w-[480px] flex items-center justify-between min-h-[80px]" },
              gameState.diceOnBoard.map((value, i) => React.createElement(DiceIcon, { key: `board-${i}`, value: value, isSelected: gameState.selectedDiceIndices.includes(i), onClick: isMyTurn ? () => handleToggleDieSelection(i) : null, onDragStart: isMyTurn ? (e) => handleDragStart(e, i) : null, onDoubleClick: isMyTurn ? () => handleDieDoubleClick(i) : null })),
              Array.from({ length: 5 - gameState.diceOnBoard.length }).map((_, i) => React.createElement(DiceIcon, { key: `placeholder-${i}`, value: 0 }))
            )
          ),
          React.createElement('div', { className: "w-full" },
             showSkipButton && React.createElement('div', {className: 'text-center mb-2'}, React.createElement('button', {onClick: handleSkipTurn, className: 'px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg font-bold animate-pulse'}, `Пропустить ход ${currentPlayer.name}`)),
            React.createElement('div', { className: "text-center mb-4" },
              React.createElement('p', { className: "text-xl" }, 'Очки за ход: ', React.createElement('span', { className: "font-ruslan text-5xl text-green-400" }, gameState.currentTurnScore + gameState.potentialScore))
            ),
            React.createElement('div', { className: "max-w-2xl mx-auto w-full" },
              isAwaitingApproval
                ? React.createElement(AwaitingApprovalScreen, null)
                : canJoin
                  ? React.createElement('button', { onClick: handleJoinGame, disabled: availableSlotsForJoin === 0, className: "w-full py-4 bg-green-600 hover:bg-green-700 rounded-lg text-2xl font-bold uppercase tracking-wider transition-all duration-300 transform hover:scale-105 shadow-lg disabled:bg-gray-500 disabled:cursor-not-allowed" }, availableSlotsForJoin > 0 ? `Войти в игру (${availableSlotsForJoin} мест)` : 'Нет свободных мест')
                  : gameState.isGameOver
                    ? (isHost && React.createElement('button', { onClick: handleNewGame, className: "w-full py-4 bg-blue-600 hover:bg-blue-700 rounded-lg text-2xl font-bold uppercase" }, 'Новая Игра'))
                    : !gameState.isGameStarted 
                      ? (isHost
                          ? React.createElement('button', { onClick: handleStartOfficialGame, disabled: claimedPlayerCount < 2, className: "w-full py-4 bg-blue-600 hover:bg-blue-700 rounded-lg text-2xl font-bold uppercase disabled:bg-gray-500" }, 'Начать игру')
                          : React.createElement('div', { className: "text-center text-lg text-gray-400" }, 'Ожидание начала игры от хоста...')
                        )
                      : React.createElement('div', { className: "grid grid-cols-1 md:grid-cols-2 gap-4" },
                          React.createElement('button', { onClick: handleRollDice, disabled: !isMyTurn || !gameState.canRoll, className: "w-full py-3 bg-green-600 hover:bg-green-700 rounded-lg text-xl font-bold uppercase disabled:bg-gray-500" }, rollButtonText),
                          React.createElement('button', { onClick: handleBankScore, disabled: !isMyTurn || !gameState.canBank, className: "w-full py-3 bg-yellow-500 hover:bg-yellow-600 text-slate-900 rounded-lg text-xl font-bold uppercase disabled:bg-gray-500" }, 'Записать')
                        )
            )
          )
        )
      )
    )
  );
};

export default GameUI;