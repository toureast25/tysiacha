import React from 'react';
import ReactDOM from 'react-dom/client';

const { useState, useEffect, useCallback, useReducer } = React;

// --- Компонент RulesModal ---
const RulesModal = ({ onClose }) => {
  return React.createElement(
    'div',
    {
      className: "fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm",
      onClick: onClose,
      'aria-modal': "true",
      role: "dialog"
    },
    React.createElement(
      'div',
      {
        className: "relative w-full max-w-2xl max-h-[90vh] bg-slate-800 text-gray-300 rounded-2xl shadow-2xl border border-slate-600 flex flex-col",
        onClick: e => e.stopPropagation()
      },
      React.createElement(
        'header',
        { className: "flex items-center justify-between p-4 border-b border-slate-700 flex-shrink-0" },
        React.createElement('h2', { className: "font-ruslan text-3xl text-yellow-300" }, 'Правила Игры "Тысяча"'),
        React.createElement(
          'button',
          {
            onClick: onClose,
            className: "text-gray-400 hover:text-white transition-colors p-1 rounded-full bg-slate-700 hover:bg-slate-600",
            'aria-label': "Закрыть правила"
          },
          React.createElement(
            'svg',
            { xmlns: "http://www.w3.org/2000/svg", className: "h-6 w-6", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2 },
            React.createElement('path', { strokeLinecap: "round", strokeLinejoin: "round", d: "M6 18L18 6M6 6l12 12" })
          )
        )
      ),
      React.createElement(
        'main',
        { className: "p-6 overflow-y-auto space-y-6" },
        React.createElement(
          'section',
          null,
          React.createElement('h3', { className: "text-xl font-bold text-yellow-400 mb-2" }, '1. Цель игры'),
          React.createElement('p', null, 'Первый игрок, набравший 1000 или более очков по итогам завершенного раунда, объявляется победителем.')
        ),
        React.createElement(
          'section',
          null,
          React.createElement('h3', { className: "text-xl font-bold text-yellow-400 mb-2" }, '2. Ход игрока'),
          React.createElement(
            'ul',
            { className: "list-disc list-inside space-y-1" },
            React.createElement('li', null, 'В начале своего хода вы бросаете 5 костей.'),
            React.createElement('li', null, 'После каждого броска вы обязаны отложить хотя бы одну очковую кость или комбинацию.'),
            React.createElement(
              'li',
              null,
              'После этого у вас есть выбор:',
              React.createElement(
                'ul',
                { className: "list-['-_'] list-inside ml-6 mt-1" },
                React.createElement('li', null, 'Записать: Завершить ход и добавить набранные очки к общему счёту.'),
                React.createElement('li', null, 'Бросить снова: Бросить оставшиеся кости, чтобы набрать больше очков.')
              )
            ),
            React.createElement('li', null, 'Ход продолжается до тех пор, пока вы не решите записать счёт или не получите "Болт".')
          )
        ),
        React.createElement(
          'section',
          null,
          React.createElement('h3', { className: "text-xl font-bold text-yellow-400 mb-2" }, '3. Подсчет очков'),
          React.createElement('p', { className: "mb-2 italic text-gray-400" }, 'Важно: Комбинация засчитывается, только если все её кости выпали в одном броске.'),
          React.createElement(
            'div',
            { className: "grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4" },
            React.createElement(
              'div',
              null,
              React.createElement('h4', { className: "font-semibold text-lg text-white mb-1" }, 'Одиночные кости'),
              React.createElement('p', null, React.createElement('span', { className: "font-mono font-bold text-lg" }, '1'), ' = 10 очков'),
              React.createElement('p', null, React.createElement('span', { className: "font-mono font-bold text-lg" }, '5'), ' = 5 очков')
            ),
            React.createElement(
              'div',
              null,
              React.createElement('h4', { className: "font-semibold text-lg text-white mb-1" }, 'Стрит (за 1 бросок)'),
              React.createElement('p', null, React.createElement('span', { className: "font-mono font-bold text-lg" }, '1-2-3-4-5'), ' = 125 очков')
            ),
            React.createElement(
              'div',
              null,
              React.createElement('h4', { className: "font-semibold text-lg text-white mb-1" }, 'Три одинаковых'),
              React.createElement('p', null, React.createElement('span', { className: "font-mono font-bold text-lg" }, '1,1,1'), ' = 100'),
              React.createElement('p', null, React.createElement('span', { className: "font-mono font-bold text-lg" }, '2,2,2'), ' = 20'),
              React.createElement('p', null, React.createElement('span', { className: "font-mono font-bold text-lg" }, '3,3,3'), ' = 30'),
              React.createElement('p', null, React.createElement('span', { className: "font-mono font-bold text-lg" }, '4,4,4'), ' = 40'),
              React.createElement('p', null, React.createElement('span', { className: "font-mono font-bold text-lg" }, '5,5,5'), ' = 50'),
              React.createElement('p', null, React.createElement('span', { className: "font-mono font-bold text-lg" }, '6,6,6'), ' = 60')
            ),
            React.createElement(
              'div',
              null,
              React.createElement('h4', { className: "font-semibold text-lg text-white mb-1" }, 'Четыре одинаковых'),
              React.createElement('p', null, React.createElement('span', { className: "font-mono font-bold text-lg" }, '1,1,1,1'), ' = 200'),
              React.createElement('p', null, React.createElement('span', { className: "font-mono font-bold text-lg" }, '2,2,2,2'), ' = 40'),
              React.createElement('p', null, React.createElement('span', { className: "font-mono font-bold text-lg" }, '3,3,3,3'), ' = 60'),
              React.createElement('p', null, React.createElement('span', { className: "font-mono font-bold text-lg" }, '4,4,4,4'), ' = 80'),
              React.createElement('p', null, React.createElement('span', { className: "font-mono font-bold text-lg" }, '5,5,5,5'), ' = 100'),
              React.createElement('p', null, React.createElement('span', { className: "font-mono font-bold text-lg" }, '6,6,6,6'), ' = 120')
            ),
            React.createElement(
              'div',
              null,
              React.createElement('h4', { className: "font-semibold text-lg text-white mb-1" }, 'Пять одинаковых'),
              React.createElement('p', null, React.createElement('span', { className: "font-mono font-bold text-lg" }, '1,1,1,1,1'), ' = 1000'),
              React.createElement('p', null, React.createElement('span', { className: "font-mono font-bold text-lg" }, '2,2,2,2,2'), ' = 200'),
              React.createElement('p', null, React.createElement('span', { className: "font-mono font-bold text-lg" }, '3,3,3,3,3'), ' = 300'),
              React.createElement('p', null, React.createElement('span', { className: "font-mono font-bold text-lg" }, '4,4,4,4,4'), ' = 400'),
              React.createElement('p', null, React.createElement('span', { className: "font-mono font-bold text-lg" }, '5,5,5,5,5'), ' = 500'),
              React.createElement('p', null, React.createElement('span', { className: "font-mono font-bold text-lg" }, '6,6,6,6,6'), ' = 600')
            )
          )
        ),
        React.createElement(
          'section',
          null,
          React.createElement('h3', { className: "text-xl font-bold text-yellow-400 mb-2" }, '4. Особые ситуации'),
          React.createElement(
            'dl',
            null,
            React.createElement('dt', { className: "font-semibold text-lg text-white" }, 'Болт'),
            React.createElement(
              'dd',
              { className: "ml-4 mb-2" },
              'Вы получаете "Болт" (отмечается как / в таблице), если:',
              React.createElement(
                'ul',
                { className: "list-disc list-inside mt-1" },
                React.createElement('li', null, 'Ваш бросок не принес ни одной очковой кости или комбинации.'),
                React.createElement('li', null, 'Вы решили записать счёт, набрав 0 очков за ход.')
              ),
              'При получении "Болта" все очки, набранные в текущем ходу, сгорают, и ход переходит к следующему игроку.'
            ),
            React.createElement('dt', { className: "font-semibold text-lg text-white" }, 'Горячие кости (Hot Dice)'),
            React.createElement('dd', { className: "ml-4" }, 'Если вы смогли отложить все 5 костей, вы можете сделать новый бросок всеми 5 костями, продолжая свой ход. Накопленные очки при этом сохраняются.')
          )
        ),
        React.createElement(
          'section',
          null,
          React.createElement('h3', { className: "text-xl font-bold text-yellow-400 mb-2" }, '5. Управление'),
          React.createElement(
            'ul',
            { className: "list-disc list-inside space-y-1" },
            React.createElement('li', null, 'Выбор костей: Кликайте на кости, чтобы выбрать их для комбинации.'),
            React.createElement('li', null, 'Отложить: Перетащите выбранные кости в зону игрового поля или сделайте двойной клик по одной из них.'),
            React.createElement('li', null, 'Ответственность игрока: Игра не подсказывает комбинации. Вы сами должны их находить и правильно откладывать.'),
            React.createElement('li', null, 'Дополнение комбинации: Если вы отложили часть комбинации (например, 3 шестерки из 4-х выпавших), вы можете до-отложить оставшуюся кость в рамках того же броска.')
          )
        )
      )
    )
  );
};


// --- Компонент Lobby ---
const Lobby = ({ onStartGame }) => {
  const [roomCode, setRoomCode] = useState('');
  const [playerCount, setPlayerCount] = useState(2);
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    if (!isJoining) {
      generateRoomCode();
    }
  }, [isJoining]);

  const generateRoomCode = () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    setRoomCode(code);
  };

  const handleStart = () => {
    const finalRoomCode = roomCode.trim();
    if (finalRoomCode.length >= 4) {
      onStartGame(finalRoomCode, playerCount);
    }
  };

  return React.createElement(
    'div',
    { className: "w-full max-w-md p-8 bg-slate-800/80 backdrop-blur-md rounded-xl shadow-2xl border border-slate-700 text-center" },
    React.createElement('h2', { className: "font-ruslan text-5xl text-yellow-300 mb-6" }, isJoining ? 'Присоединиться' : 'Создать Игру'),
    React.createElement(
      'div',
      { className: "space-y-6" },
      React.createElement(
        'div',
        null,
        React.createElement(
          'label',
          { htmlFor: "roomCode", className: "block text-lg font-semibold text-gray-300 mb-2" },
          isJoining ? 'Введите код комнаты' : 'Код вашей комнаты'
        ),
        React.createElement('input', {
          id: "roomCode",
          type: "text",
          value: roomCode,
          onChange: (e) => setRoomCode(e.target.value.toUpperCase()),
          readOnly: !isJoining,
          className: "w-full p-3 text-center bg-slate-900 border-2 border-slate-600 rounded-lg text-2xl font-mono tracking-widest text-white focus:outline-none focus:border-yellow-400 transition-colors"
        }),
        !isJoining && React.createElement('p', { className: "text-sm text-gray-400 mt-2" }, 'Поделитесь этим кодом с друзьями')
      ),
      React.createElement(
        'div',
        null,
        React.createElement(
          'label',
          { htmlFor: "playerCount", className: "block text-lg font-semibold text-gray-300 mb-2" },
          'Количество игроков'
        ),
        React.createElement(
          'div',
          { className: "flex items-center justify-center space-x-4" },
          [2, 3, 4, 5].map(num =>
            React.createElement(
              'button',
              {
                key: num,
                onClick: () => setPlayerCount(num),
                className: `w-12 h-12 text-xl font-bold rounded-full transition-all ${playerCount === num ? 'bg-yellow-400 text-slate-900 scale-110' : 'bg-slate-700 text-white hover:bg-slate-600'}`
              },
              num
            )
          )
        )
      ),
      React.createElement(
        'button',
        {
          onClick: handleStart,
          className: "w-full py-3 bg-green-600 hover:bg-green-700 rounded-lg text-xl font-bold uppercase tracking-wider transition-all duration-300 transform hover:scale-105 shadow-lg disabled:bg-gray-500 disabled:cursor-not-allowed",
          disabled: roomCode.trim().length < 4
        },
        isJoining ? 'Войти' : 'Начать игру'
      ),
      React.createElement(
        'div',
        { className: "relative flex py-2 items-center" },
        React.createElement('div', { className: "flex-grow border-t border-gray-600" }),
        React.createElement('span', { className: "flex-shrink mx-4 text-gray-400" }, 'ИЛИ'),
        React.createElement('div', { className: "flex-grow border-t border-gray-600" })
      ),
      React.createElement(
        'button',
        {
          onClick: () => setIsJoining(!isJoining),
          className: "w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-xl font-bold uppercase tracking-wider transition-all duration-300 transform hover:scale-105 shadow-lg"
        },
        isJoining ? 'Создать свою игру' : 'Присоединиться к игре'
      )
    )
  );
};


// --- Компонент Game ---

// Утилиты игровой логики
const analyzeDice = (dice) => {
    const scoringGroups = [];
    const usedIndices = new Set();
    const counts = {}; // Store indices for each die value

    dice.forEach((d, i) => {
        if (!counts[d]) counts[d] = [];
        counts[d].push(i);
    });

    // Check for street (1-2-3-4-5)
    const isStreet = [1, 2, 3, 4, 5].every(val => counts[val] && counts[val].length > 0);
    if (isStreet && dice.length === 5) {
        return {
            scoringGroups: [{ value: dice, score: 125, indices: dice.map((_, i) => i) }]
        };
    }
    
    // Five-of-a-kind
    for (let i = 1; i <= 6; i++) {
        if (counts[i] && counts[i].length >= 5) {
            const groupIndices = counts[i].slice(0, 5);
            scoringGroups.push({
                value: Array(5).fill(i),
                score: i === 1 ? 1000 : i * 100,
                indices: groupIndices,
            });
            groupIndices.forEach(idx => usedIndices.add(idx));
        }
    }

    // Four-of-a-kind
    for (let i = 1; i <= 6; i++) {
        const availableIndices = counts[i]?.filter(idx => !usedIndices.has(idx)) || [];
        if (availableIndices.length >= 4) {
            const groupIndices = availableIndices.slice(0, 4);
            scoringGroups.push({
                value: Array(4).fill(i),
                score: i === 1 ? 200 : i * 20,
                indices: groupIndices,
            });
            groupIndices.forEach(idx => usedIndices.add(idx));
        }
    }
    
    // Three-of-a-kind
    for (let i = 1; i <= 6; i++) {
        const availableIndices = counts[i]?.filter(idx => !usedIndices.has(idx)) || [];
        if (availableIndices.length >= 3) {
            const groupIndices = availableIndices.slice(0, 3);
            scoringGroups.push({
                value: Array(3).fill(i),
                score: i === 1 ? 100 : i * 10,
                indices: groupIndices,
            });
            groupIndices.forEach(idx => usedIndices.add(idx));
        }
    }

    // Individual 1s and 5s
    if (counts[1]) {
        counts[1].forEach(idx => {
            if (!usedIndices.has(idx)) {
                scoringGroups.push({ value: [1], score: 10, indices: [idx] });
            }
        });
    }
    if (counts[5]) {
        counts[5].forEach(idx => {
            if (!usedIndices.has(idx)) {
                scoringGroups.push({ value: [5], score: 5, indices: [idx] });
            }
        });
    }

    return { scoringGroups };
}

const validateSelection = (dice) => {
    if (dice.length === 0) {
        return { isValid: false, score: 0, values: [] };
    }

    const { scoringGroups } = analyzeDice(dice);
    const usedDiceCount = scoringGroups.reduce((count, group) => count + group.value.length, 0);

    if (usedDiceCount < dice.length) {
        return { isValid: false, score: 0, values: [] };
    }
    
    const totalScore = scoringGroups.reduce((sum, group) => sum + group.score, 0);

    return {
        isValid: true,
        score: totalScore,
        values: dice,
    };
};

const calculateTotalScore = (player) => {
    if (!player || !player.scores) return 0;
    return player.scores
        .filter(s => typeof s === 'number')
        .reduce((sum, s) => sum + s, 0);
};

// Вспомогательные компоненты для костей
const DiceIcon = ({ value, isSelected, onClick, onDragStart, onDoubleClick }) => {
  const dots = {
    1: ['center'],
    2: ['top-left', 'bottom-right'],
    3: ['top-left', 'center', 'bottom-right'],
    4: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
    5: ['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right'],
    6: ['top-left', 'top-right', 'mid-left', 'mid-right', 'bottom-left', 'bottom-right'],
  };

  const dotClasses = {
      'center': 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
      'top-left': 'top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2',
      'top-right': 'top-1/4 right-1/4 translate-x-1/2 -translate-y-1/2',
      'bottom-left': 'bottom-1/4 left-1/4 -translate-x-1/2 translate-y-1/2',
      'bottom-right': 'bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2',
      'mid-left': 'top-1/2 left-1/4 -translate-x-1/2 -translate-y-1/2',
      'mid-right': 'top-1/2 right-1/4 translate-x-1/2 -translate-y-1/2',
  }
  
  const baseClasses = "w-16 sm:w-20 aspect-square bg-slate-200 rounded-lg shadow-md flex items-center justify-center relative border-2 transition-all duration-200 flex-shrink-0";
  
  let stateClasses = "border-slate-400";
  if (onClick) {
      stateClasses += " cursor-pointer";
  }

  if (isSelected) {
      stateClasses = "border-yellow-400 scale-105 shadow-lg shadow-yellow-400/50 cursor-pointer";
  }
  
  if (value === 0) {
      return React.createElement('div', { className: `${baseClasses} bg-slate-700/50 border-slate-600 border-dashed` });
  }

  return React.createElement(
    'div',
    {
      className: `${baseClasses} ${stateClasses}`,
      onClick: onClick,
      onDoubleClick: onDoubleClick,
      draggable: !!onDragStart,
      onDragStart: onDragStart
    },
    value > 0 && dots[value] && dots[value].map(pos => 
      React.createElement('div', { key: pos, className: `absolute w-[18%] h-[18%] bg-slate-900 rounded-full ${dotClasses[pos]}` })
    )
  );
};

const SmallDiceIcon = ({ value }) => {
  const dots = {
    1: ['center'],
    2: ['top-left', 'bottom-right'],
    3: ['top-left', 'center', 'bottom-right'],
    4: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
    5: ['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right'],
    6: ['top-left', 'top-right', 'mid-left', 'mid-right', 'bottom-left', 'bottom-right'],
  };

  const dotClasses = {
      'center': 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
      'top-left': 'top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2',
      'top-right': 'top-1/4 right-1/4 translate-x-1/2 -translate-y-1/2',
      'bottom-left': 'bottom-1/4 left-1/4 -translate-x-1/2 translate-y-1/2',
      'bottom-right': 'bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2',
      'mid-left': 'top-1/2 left-1/4 -translate-x-1/2 -translate-y-1/2',
      'mid-right': 'top-1/2 right-1/4 translate-x-1/2 -translate-y-1/2',
  }
  
  return React.createElement(
    'div',
    { className: "w-10 h-10 bg-slate-300 rounded shadow-sm flex items-center justify-center relative border border-slate-400" },
    value > 0 && dots[value] && dots[value].map(pos => 
      React.createElement('div', { key: pos, className: `absolute w-2 h-2 bg-slate-900 rounded-full ${dotClasses[pos]}` })
    )
  );
};

const Game = ({ roomCode, playerCount, onExit }) => {
  const [isScoreboardExpanded, setIsScoreboardExpanded] = useState(false);
  const [showRules, setShowRules] = useState(false);

  const createInitialState = (pCount) => {
    return {
      players: Array.from({ length: pCount }, (_, i) => ({ id: i, name: `Игрок ${i + 1}`, scores: [] })),
      currentPlayerIndex: 0,
      diceOnBoard: [],
      keptDiceThisTurn: [],
      diceKeptFromThisRoll: [],
      selectedDiceIndices: new Set(),
      scoreFromPreviousRolls: 0,
      currentTurnScore: 0,
      potentialScore: 0,
      gameMessage: `Ход Игрока 1. Бросайте кости!`,
      isGameOver: false,
      canRoll: true,
      canBank: false,
      canKeep: false,
    };
  }
  
  const gameReducer = (state, action) => {
    switch (action.type) {
      case 'ROLL_DICE': {
        if (!state.canRoll || state.isGameOver) return state;

        const isHotDiceRoll = state.keptDiceThisTurn.length >= 5;
        const diceToRollCount = isHotDiceRoll ? 5 : 5 - state.keptDiceThisTurn.length;
        const newDice = Array.from({ length: diceToRollCount }, () => Math.floor(Math.random() * 6) + 1);
        const { scoringGroups } = analyzeDice(newDice);
        const rollScore = scoringGroups.reduce((sum, group) => sum + group.score, 0);


        if (rollScore === 0) {
          // BOLT!
          const newPlayers = state.players.map((player, index) => {
              if (index === state.currentPlayerIndex) {
                  return { ...player, scores: [...player.scores, '/'] };
              }
              return player;
          });
          const nextPlayerIndex = (state.currentPlayerIndex + 1) % playerCount;
          return {
            ...createInitialState(playerCount),
            players: newPlayers,
            currentPlayerIndex: nextPlayerIndex,
            diceOnBoard: newDice,
            gameMessage: `Болт! Очки сгорели. Ход Игрока ${nextPlayerIndex + 1}.`,
          };
        }
        
        const newScoreFromPreviousRolls = state.currentTurnScore;
        
        return {
          ...state,
          diceOnBoard: newDice,
          keptDiceThisTurn: isHotDiceRoll ? [] : state.keptDiceThisTurn,
          diceKeptFromThisRoll: [],
          scoreFromPreviousRolls: newScoreFromPreviousRolls,
          gameMessage: `Ваш бросок. Выберите и перетащите очковые кости.`,
          canRoll: false,
          canBank: true,
          selectedDiceIndices: new Set(),
          canKeep: false,
          potentialScore: 0,
        };
      }

      case 'TOGGLE_DIE_SELECTION': {
        if (state.isGameOver || state.diceOnBoard.length === 0) return state;

        const { index } = action.payload;
        const newSelectedIndices = new Set(state.selectedDiceIndices);
        if (newSelectedIndices.has(index)) {
            newSelectedIndices.delete(index);
        } else {
            newSelectedIndices.add(index);
        }
        
        const selectedValues = Array.from(newSelectedIndices).map(i => state.diceOnBoard[i]);
        
        let validation = validateSelection(selectedValues);
        
        if (!validation.isValid && selectedValues.length > 0) {
            const combinedValidation = validateSelection([...state.diceKeptFromThisRoll, ...selectedValues]);
            if (combinedValidation.isValid) {
                const currentRollScore = validateSelection(state.diceKeptFromThisRoll).score;
                validation = {
                    isValid: true,
                    score: combinedValidation.score - currentRollScore,
                    values: selectedValues
                };
            }
        }

        return {
            ...state,
            selectedDiceIndices: newSelectedIndices,
            canKeep: validation.isValid,
            potentialScore: validation.score > 0 ? validation.score : 0,
            gameMessage: validation.isValid 
                ? `Выбрано +${validation.score}. Перетащите или дважды кликните, чтобы отложить.`
                : `Выберите корректную комбинацию.`,
        };
      }
      
      case 'KEEP_DICE': {
          if (state.isGameOver) return state;

          const { indices } = action.payload;
          const newlySelectedValues = indices.map(i => state.diceOnBoard[i]);
          const combinedDiceForValidation = [...state.diceKeptFromThisRoll, ...newlySelectedValues];
          const validation = validateSelection(combinedDiceForValidation);

          if (!validation.isValid) {
              return {
                  ...state,
                  gameMessage: "Неверный выбор. Эта кость не образует очковую комбинацию."
              }
          };

          const scoreOfThisRoll = validation.score;
          const newTurnScore = state.scoreFromPreviousRolls + scoreOfThisRoll;
          const scoreAdded = newTurnScore - state.currentTurnScore;
          const newKeptDiceThisTurn = [...state.keptDiceThisTurn, ...newlySelectedValues];
          const newDiceKeptFromThisRoll = combinedDiceForValidation;
          const newDiceOnBoard = state.diceOnBoard.filter((_, i) => !indices.includes(i));
          const allDiceScored = newDiceOnBoard.length === 0;
          
          if(allDiceScored) {
             return {
              ...state,
              currentTurnScore: newTurnScore,
              keptDiceThisTurn: newKeptDiceThisTurn,
              diceKeptFromThisRoll: newDiceKeptFromThisRoll,
              diceOnBoard: [],
              gameMessage: `+${scoreAdded}! Очки за ход: ${newTurnScore}. Все кости сыграли! Бросайте снова.`,
              canRoll: true,
              canBank: true,
              selectedDiceIndices: new Set(),
              canKeep: false,
              potentialScore: 0,
             }
          }

          return {
              ...state,
              currentTurnScore: newTurnScore,
              keptDiceThisTurn: newKeptDiceThisTurn,
              diceKeptFromThisRoll: newDiceKeptFromThisRoll,
              diceOnBoard: newDiceOnBoard,
              gameMessage: `+${scoreAdded}! Очки за ход: ${newTurnScore}. Бросайте снова или запишите.`,
              canRoll: true,
              canBank: true,
              selectedDiceIndices: new Set(),
              canKeep: false,
              potentialScore: 0,
          };
      }

      case 'BANK_SCORE': {
        if (!state.canBank || state.isGameOver) return state;
        
        let finalTurnScore = state.currentTurnScore;
        if (state.canKeep && state.potentialScore > 0) {
            finalTurnScore += state.potentialScore;
        }
        
        if (finalTurnScore === 0) {
          const currentPlayerName = state.players[state.currentPlayerIndex].name;
          const newPlayersWithBolt = state.players.map((player, index) => {
            if (index === state.currentPlayerIndex) {
              return { ...player, scores: [...player.scores, '/'] };
            }
            return player;
          });
          const nextPlayerIndex = (state.currentPlayerIndex + 1) % playerCount;
          return {
            ...createInitialState(playerCount),
            players: newPlayersWithBolt,
            currentPlayerIndex: nextPlayerIndex,
            gameMessage: `${currentPlayerName} получает болт. Ход Игрока ${nextPlayerIndex + 1}.`
          };
        }

        const newPlayers = state.players.map((player, index) => {
            if (index === state.currentPlayerIndex) {
                return {
                    ...player,
                    scores: [...player.scores, finalTurnScore],
                };
            }
            return player;
        });
        
        const currentPlayer = newPlayers[state.currentPlayerIndex];
        const totalScore = calculateTotalScore(currentPlayer);
        
        if (totalScore >= 1000) {
          return {
            ...createInitialState(playerCount),
            players: newPlayers,
            isGameOver: true,
            gameMessage: `${currentPlayer.name} победил, набрав ${totalScore} очков!`,
          };
        }

        const nextPlayerIndex = (state.currentPlayerIndex + 1) % playerCount;
        return {
          ...createInitialState(playerCount),
          players: newPlayers,
          currentPlayerIndex: nextPlayerIndex,
          gameMessage: `${currentPlayer.name} записал ${finalTurnScore} очков. Ход Игрока ${nextPlayerIndex + 1}.`
        };
      }

      case 'NEW_GAME':
        return createInitialState(playerCount);
      
      default:
        return state;
    }
  };

  const [state, dispatch] = useReducer(gameReducer, createInitialState(playerCount));
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragStart = (e, index) => {
    if (state.selectedDiceIndices.size > 0 && state.selectedDiceIndices.has(index)) {
      e.dataTransfer.setData('text/plain', 'selection');
      e.dataTransfer.effectAllowed = 'move';
    } else {
      const singleDieIndex = JSON.stringify([index]);
      e.dataTransfer.setData('application/json', singleDieIndex);
      e.dataTransfer.setData('text/plain', 'group');
      e.dataTransfer.effectAllowed = 'move';
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const type = e.dataTransfer.getData('text/plain');

    if (type === 'selection' && state.canKeep) {
      dispatch({ type: 'KEEP_DICE', payload: { indices: Array.from(state.selectedDiceIndices) } });
    } else if (type === 'group') {
      try {
        const indicesString = e.dataTransfer.getData('application/json');
        const indices = JSON.parse(indicesString);
        if (Array.isArray(indices)) {
            dispatch({ type: 'KEEP_DICE', payload: { indices } });
        }
      } catch (error) {
        console.error("Failed to parse dropped dice group:", error);
      }
    }
  };

  const handleDieDoubleClick = (index) => {
    if (state.isGameOver || state.diceOnBoard.length === 0) return;

    if (state.selectedDiceIndices.size > 0 && state.selectedDiceIndices.has(index)) {
        dispatch({ type: 'KEEP_DICE', payload: { indices: Array.from(state.selectedDiceIndices) } });
    } else {
        dispatch({ type: 'KEEP_DICE', payload: { indices: [index] } });
    }
  };

  const isHotDiceRoll = state.keptDiceThisTurn.length >= 5;
  const diceToRollCount = isHotDiceRoll ? 5 : 5 - state.keptDiceThisTurn.length;
  const rollButtonText = diceToRollCount === 5 ? 'Бросить все' : `Бросить ${diceToRollCount}`;

  const totalDiceSlots = 5;
  const placeholdersToRender = totalDiceSlots - state.diceOnBoard.length;

  return React.createElement(
    React.Fragment,
    null,
    showRules && React.createElement(RulesModal, { onClose: () => setShowRules(false) }),
    React.createElement(
      'div',
      { className: "w-full h-full flex flex-col p-4 text-white overflow-hidden" },
      React.createElement(
        'header',
        { className: "flex justify-between items-center mb-4 flex-shrink-0" },
        React.createElement(
          'div',
          { className: "p-2 bg-black/50 rounded-lg text-sm" },
          React.createElement('p', { className: "font-mono" }, `КОД КОМНАТЫ: ${roomCode}`)
        ),
        React.createElement(
          'h1',
          {
            onClick: () => setShowRules(true),
            className: "font-ruslan text-4xl text-yellow-300 cursor-pointer hover:text-yellow-200 transition-colors",
            title: "Показать правила"
          },
          'ТЫСЯЧА'
        ),
        React.createElement(
          'button',
          { onClick: onExit, className: "px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-bold" },
          'Выйти'
        )
      ),
      React.createElement(
        'div',
        { className: "flex-grow flex flex-col lg:grid lg:grid-cols-4 gap-4 min-h-0" },
        React.createElement(
          'aside',
          { className: `lg:col-span-1 bg-slate-800/80 p-4 rounded-xl border border-slate-700 flex flex-col transition-all duration-500 ease-in-out ${isScoreboardExpanded ? 'h-full' : 'flex-shrink-0'}` },
          React.createElement(
              'div',
              { className: "flex justify-between items-center mb-4 flex-shrink-0" },
              React.createElement('h2', { className: "font-ruslan text-3xl text-yellow-300" }, 'Игроки'),
              React.createElement(
                  'button',
                  {
                      onClick: () => setIsScoreboardExpanded(!isScoreboardExpanded),
                      className: "p-1 rounded-full hover:bg-slate-700/50 lg:hidden",
                      'aria-label': isScoreboardExpanded ? "Свернуть таблицу" : "Развернуть таблицу",
                      'aria-expanded': isScoreboardExpanded
                  },
                  React.createElement(
                      'svg',
                      { xmlns: "http://www.w3.org/2000/svg", className: `h-6 w-6 text-yellow-300 transition-transform duration-300 ${isScoreboardExpanded ? 'rotate-180' : ''}`, fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2 },
                      React.createElement('path', { strokeLinecap: "round", strokeLinejoin: "round", d: "M19 9l-7 7-7-7" })
                  )
              )
          ),
          React.createElement(
            'div',
            { className: "flex-grow overflow-y-auto relative" },
            React.createElement(
              'table',
              { className: "w-full text-sm text-left text-gray-300" },
              React.createElement(
                'thead',
                { className: "text-xs text-yellow-300 uppercase bg-slate-800 sticky top-0 z-10" },
                React.createElement(
                  'tr',
                  null,
                  state.players.map((player, index) =>
                    React.createElement(
                      'th',
                      {
                        key: player.id,
                        scope: "col",
                        className: `h-10 px-2 text-center align-middle transition-colors duration-300 ${index === state.currentPlayerIndex && !state.isGameOver ? 'bg-yellow-400 text-slate-900' : 'bg-slate-700/50'}`
                      },
                      player.name
                    )
                  )
                )
              ),
              React.createElement(
                'tbody',
                { className: isScoreboardExpanded ? '' : 'hidden lg:table-row-group' },
                (() => {
                  const maxRounds = state.players.reduce((max, p) => Math.max(max, p.scores.length), 0);
                  if (maxRounds === 0) {
                    return React.createElement(
                      'tr',
                      null,
                      React.createElement(
                        'td',
                        { colSpan: playerCount, className: "py-4 px-2 text-center text-gray-400 italic" },
                        'Еще не было записано очков.'
                      )
                    );
                  }
                  const rows = [];
                  for (let i = 0; i < maxRounds; i++) {
                    rows.push(
                      React.createElement(
                        'tr',
                        { key: i, className: "border-b border-slate-700 hover:bg-slate-700/30" },
                        state.players.map(player =>
                          React.createElement(
                            'td',
                            { key: `${player.id}-${i}`, className: "py-2 px-2 text-center font-mono" },
                            player.scores[i] !== undefined ? player.scores[i] : React.createElement('span', { className: "text-slate-500" }, '-')
                          )
                        )
                      )
                    );
                  }
                  return rows;
                })()
              ),
              React.createElement(
                'tfoot',
                { className: "sticky bottom-0 bg-slate-800 font-bold text-white border-t-2 border-slate-500" },
                React.createElement(
                  'tr',
                  null,
                  state.players.map((player, index) =>
                    React.createElement(
                      'td',
                      {
                        key: player.id,
                        className: `h-10 px-2 text-center text-lg font-mono align-middle transition-colors duration-300 ${index === state.currentPlayerIndex && !state.isGameOver ? 'bg-yellow-400/80 text-slate-900' : 'bg-slate-900/50'}`
                      },
                      calculateTotalScore(player)
                    )
                  )
                )
              )
            )
          )
        ),
        React.createElement(
          'main',
          {
            className: `relative flex-grow lg:col-span-3 bg-slate-900/70 rounded-xl border-2 flex flex-col justify-between transition-all duration-300 min-h-0 ${isDragOver ? 'border-green-400 shadow-2xl shadow-green-400/20' : 'border-slate-600'} p-4`,
            onDragOver: handleDragOver,
            onDrop: handleDrop,
            onDragLeave: handleDragLeave
          },
          React.createElement(
            'div',
            { className: "w-full" },
            React.createElement(
              'div',
              { className: `w-full p-3 mb-4 text-center rounded-lg ${state.isGameOver ? 'bg-green-600' : 'bg-slate-800'} border border-slate-600 flex items-center justify-center min-h-[72px]` },
              React.createElement('p', { className: "text-lg font-semibold" }, state.gameMessage)
            ),
            React.createElement(
              'div',
              { className: "w-full flex justify-center md:justify-end" },
              React.createElement(
                'div',
                { className: "p-3 rounded-lg bg-black/40 border border-slate-700 w-full md:w-auto md:min-w-[300px]" },
                React.createElement('p', { className: "text-xs text-gray-400 mb-2 text-center uppercase tracking-wider" }, 'Отложено'),
                React.createElement(
                  'div',
                  { className: "flex gap-2 flex-wrap justify-center min-h-[40px] items-center" },
                  state.keptDiceThisTurn.length > 0
                    ? state.keptDiceThisTurn.map((value, i) => React.createElement(SmallDiceIcon, { key: `kept-${i}`, value: value }))
                    : React.createElement('span', { className: "text-slate-500 italic" }, 'Пусто')
                )
              )
            )
          ),
          React.createElement(
            'div',
            { className: "flex-grow w-full flex flex-col items-center justify-center pt-3 pb-6" },
            React.createElement(
              'div',
              { className: "w-full sm:max-w-[480px] flex items-center justify-between min-h-[80px]" },
              state.diceOnBoard.map((value, i) =>
                React.createElement(DiceIcon, {
                  key: `board-${i}`,
                  value: value,
                  isSelected: state.selectedDiceIndices.has(i),
                  onClick: () => dispatch({ type: 'TOGGLE_DIE_SELECTION', payload: { index: i } }),
                  onDragStart: (e) => handleDragStart(e, i),
                  onDoubleClick: () => handleDieDoubleClick(i)
                })
              ),
              Array.from({ length: placeholdersToRender }).map((_, i) =>
                React.createElement(DiceIcon, { key: `placeholder-${i}`, value: 0 })
              )
            )
          ),
          React.createElement(
            'div',
            { className: "w-full" },
            React.createElement(
              'div',
              { className: "text-center mb-4" },
              React.createElement(
                'p',
                { className: "text-xl" },
                'Очки за ход: ',
                React.createElement('span', { className: "font-ruslan text-5xl text-green-400" }, state.currentTurnScore + state.potentialScore)
              )
            ),
            React.createElement(
              'div',
              { className: "max-w-2xl mx-auto" },
              state.isGameOver
                ? React.createElement(
                    'button',
                    {
                      onClick: () => dispatch({ type: 'NEW_GAME' }),
                      className: "w-full py-4 bg-blue-600 hover:bg-blue-700 rounded-lg text-2xl font-bold uppercase tracking-wider transition-all duration-300 transform hover:scale-105 shadow-lg"
                    },
                    'Новая Игра'
                  )
                : React.createElement(
                    'div',
                    { className: "grid grid-cols-2 gap-4" },
                    React.createElement(
                      'button',
                      {
                        onClick: () => dispatch({ type: 'ROLL_DICE' }),
                        disabled: !state.canRoll,
                        className: "w-full py-3 bg-green-600 hover:bg-green-700 rounded-lg text-xl font-bold uppercase tracking-wider transition-all duration-300 transform hover:scale-105 shadow-lg disabled:bg-gray-500 disabled:cursor-not-allowed disabled:scale-100"
                      },
                      rollButtonText
                    ),
                    React.createElement(
                      'button',
                      {
                        onClick: () => dispatch({ type: 'BANK_SCORE' }),
                        disabled: !state.canBank,
                        className: "w-full py-3 bg-yellow-500 hover:bg-yellow-600 text-slate-900 rounded-lg text-xl font-bold uppercase tracking-wider transition-all duration-300 transform hover:scale-105 shadow-lg disabled:bg-gray-500 disabled:cursor-not-allowed disabled:scale-100"
                      },
                      'Записать'
                    )
                  )
            )
          )
        )
      )
    )
  );
};


// --- Компонент App ---
const App = () => {
  const [screen, setScreen] = useState('LOBBY');
  const [roomCode, setRoomCode] = useState('');
  const [playerCount, setPlayerCount] = useState(2);

  const handleStartGame = useCallback((code, players) => {
    setRoomCode(code);
    setPlayerCount(players);
    setScreen('GAME');
  }, []);

  const handleExitGame = useCallback(() => {
    setRoomCode('');
    setScreen('LOBBY');
  }, []);

  const renderScreen = () => {
    switch (screen) {
      case 'GAME':
        return React.createElement(Game, { roomCode: roomCode, playerCount: playerCount, onExit: handleExitGame });
      case 'LOBBY':
      default:
        return React.createElement(Lobby, { onStartGame: handleStartGame });
    }
  };

  return React.createElement(
    'main',
    {
      className: "w-screen h-screen bg-cover bg-center bg-no-repeat text-white",
      style: { backgroundImage: "url('https://images.unsplash.com/photo-1585501374353-8199cf8e1324?q=80&w=1920&auto=format&fit=crop')" }
    },
    React.createElement(
      'div',
      { className: "w-full h-full bg-black/70 backdrop-blur-sm flex items-center justify-center" },
      renderScreen()
    )
  );
};


// --- Точка входа в приложение ---
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Не удалось найти корневой элемент для монтирования");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  React.createElement(
    React.StrictMode,
    null,
    React.createElement(App)
  )
);