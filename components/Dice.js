import React from 'react';

// Раскладка точек на грани (позиции внутри грани-квадрата).
const DOTS = {
  1: ['center'],
  2: ['top-left', 'bottom-right'],
  3: ['top-left', 'center', 'bottom-right'],
  4: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
  5: ['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right'],
  6: ['top-left', 'top-right', 'mid-left', 'mid-right', 'bottom-left', 'bottom-right'],
};

const DOT_POS = {
  'center': 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
  'top-left': 'top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2',
  'top-right': 'top-1/4 right-1/4 translate-x-1/2 -translate-y-1/2',
  'bottom-left': 'bottom-1/4 left-1/4 -translate-x-1/2 translate-y-1/2',
  'bottom-right': 'bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2',
  'mid-left': 'top-1/2 left-1/4 -translate-x-1/2 -translate-y-1/2',
  'mid-right': 'top-1/2 right-1/4 -translate-x-1/2 -translate-y-1/2',
};

// Одна грань куба: квадрат с точками нужного значения.
const Face = ({ face, value }) =>
  React.createElement(
    'div',
    { className: `dice-face dice-face--${face}` },
    DOTS[value] && DOTS[value].map((pos) =>
      React.createElement('div', {
        key: pos,
        className: `absolute w-[16%] h-[16%] bg-slate-900 rounded-full ${DOT_POS[pos]}`,
      })
    )
  );

// Кубик — настоящий 3D-объект из шести граней (см. style.css). В покое
// развёрнут гранью со значением `value` к зрителю; при isRolling крутится.
export const DiceIcon = ({ value, isSelected, onClick, onDragStart, onDoubleClick, isRolling }) => {
  // Пустая ячейка (костей меньше пяти) — плоский пунктирный слот.
  if (value === 0) {
    return React.createElement('div', {
      className: 'w-full aspect-square bg-slate-700/50 border-2 border-dashed border-slate-600 rounded-lg',
    });
  }

  const cubeClasses = `dice-cube${isRolling ? ' dice-rolling-3d' : ''}${isSelected ? ' is-selected' : ''}`;

  return React.createElement(
    'div',
    {
      className: 'dice-3d-wrap w-full aspect-square' + (onClick ? ' cursor-pointer' : ''),
      onClick: onClick,
      onDoubleClick: onDoubleClick,
      draggable: !!onDragStart,
      onDragStart: onDragStart,
    },
    React.createElement(
      'div',
      { className: cubeClasses, 'data-value': value },
      React.createElement(Face, { face: 'front', value: 1 }),
      React.createElement(Face, { face: 'back', value: 6 }),
      React.createElement(Face, { face: 'right', value: 3 }),
      React.createElement(Face, { face: 'left', value: 4 }),
      React.createElement(Face, { face: 'top', value: 2 }),
      React.createElement(Face, { face: 'bottom', value: 5 })
    )
  );
};

export const SmallDiceIcon = ({ value, isFlying }) => {
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
      'mid-right': 'top-1/2 right-1/4 -translate-x-1/2 -translate-y-1/2',
  }
  
  const flyClass = isFlying ? ' dice-fly-in' : '';

  return React.createElement(
    'div',
    { className: `w-8 h-8 sm:w-10 sm:h-10 bg-slate-300 rounded shadow-sm flex items-center justify-center relative border border-slate-400${flyClass}` },
    value > 0 && dots[value] && dots[value].map(pos => 
      React.createElement('div', { key: pos, className: `absolute w-2 h-2 bg-slate-900 rounded-full ${dotClasses[pos]}` })
    )
  );
};
