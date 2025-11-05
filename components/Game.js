// 
import React from 'react';
import { useGameEngine } from '../hooks/useGameEngine.js';
import GameUI from './GameUI.js';

const Game = ({ roomCode, playerName, onExit }) => {
  const [isScoreboardExpanded, setIsScoreboardExpanded] = React.useState(false);
  const [isSpectatorsModalOpen, setIsSpectatorsModalOpen] = React.useState(false);
  const [showRules, setShowRules] = React.useState(false);
  const [isDragOver, setIsDragOver] = React.useState(false);

  const engine = useGameEngine({ roomCode, playerName, onExit });

  if (engine.connectionStatus !== 'connected' || !engine.gameState) {
    return React.createElement('div', { className: "text-center" }, 
      React.createElement('h2', { className: "font-ruslan text-4xl text-yellow-300 mb-4" }, 'Подключение...'),
      React.createElement('p', { className: "text-lg" }, 
        engine.connectionStatus === 'connecting' ? 'Устанавливаем связь с сервером...' : 
        engine.connectionStatus === 'reconnecting' ? 'Потеряна связь, переподключаемся...' :
        engine.connectionStatus === 'error' ? 'Ошибка подключения. Попробуйте обновить страницу.' :
        'Загрузка игровой комнаты...'
      )
    );
  }

  const handleDragStart = (e, index) => {
    if (engine.gameState.selectedDiceIndices.length > 0 && engine.gameState.selectedDiceIndices.includes(index)) {
      e.dataTransfer.setData('text/plain', 'selection');
    } else {
      e.dataTransfer.setData('application/json', JSON.stringify([index]));
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (engine.myPlayerId !== engine.gameState.currentPlayerIndex) return;
    const type = e.dataTransfer.getData('text/plain');
    if (type === 'selection' && engine.gameState.canKeep) {
      engine.handleKeepDice(engine.gameState.selectedDiceIndices);
    } else {
      try {
        const indices = JSON.parse(e.dataTransfer.getData('application/json'));
        if (Array.isArray(indices)) engine.handleKeepDice(indices);
      } catch (error) { console.error("Drop error:", error); }
    }
  };

  const handleDieDoubleClick = (index) => {
    if (engine.myPlayerId !== engine.gameState.currentPlayerIndex) return;
    if (engine.gameState.selectedDiceIndices.length > 0 && engine.gameState.selectedDiceIndices.includes(index)) {
        if(engine.gameState.canKeep) engine.handleKeepDice(engine.gameState.selectedDiceIndices);
    } else {
        engine.handleKeepDice([index]);
    }
  };

  return React.createElement(GameUI, {
    ...engine,
    roomCode, // pass it down explicitly
    isScoreboardExpanded,
    isSpectatorsModalOpen,
    showRules,
    isDragOver,
    setIsScoreboardExpanded,
    setIsSpectatorsModalOpen,
    setShowRules,
    setIsDragOver,
    handleDragStart,
    handleDrop,
    handleDieDoubleClick,
  });
};

export default Game;