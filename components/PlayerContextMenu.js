
import React from 'react';

const PlayerContextMenu = ({ player, position, onClose, onAction }) => {
  const [menuPosition, setMenuPosition] = React.useState(position);
  const menuRef = React.useRef(null);

  React.useEffect(() => {
    if (menuRef.current) {
      const menuRect = menuRef.current.getBoundingClientRect();
      let newX = position.x;
      let newY = position.y;

      if (position.x + menuRect.width > window.innerWidth) {
        newX = window.innerWidth - menuRect.width - 10;
      }
      if (position.y + menuRect.height > window.innerHeight) {
        newY = window.innerHeight - menuRect.height - 10;
      }
      setMenuPosition({ x: newX, y: newY });
    }
  }, [position]);
  
  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  if (!player) return null;

  return React.createElement(
    'div',
    {
      ref: menuRef,
      className: "fixed z-50 w-56 bg-slate-700 border border-slate-600 rounded-md shadow-lg py-1 flex flex-col",
      style: { top: `${menuPosition.y}px`, left: `${menuPosition.x}px` },
      role: "menu",
      'aria-orientation': "vertical",
      'aria-labelledby': `menu-button-${player.id}`
    },
    React.createElement(
      'button',
      {
        onClick: () => onAction('promote', player),
        className: "w-full text-left px-4 py-3 text-sm text-yellow-400 hover:bg-slate-600 hover:text-yellow-300 flex items-center gap-3 border-b border-slate-600 last:border-0 transition-colors",
        role: "menuitem"
      },
      React.createElement('svg', { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", viewBox: "0 0 20 20", fill: "currentColor" },
        React.createElement('path', { d: "M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" })
      ),
      'Назначить хостом'
    ),
    React.createElement(
      'button',
      {
        onClick: () => onAction('kick', player),
        className: "w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-slate-600 hover:text-red-300 flex items-center gap-3 transition-colors",
        role: "menuitem"
      },
      React.createElement('svg', { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", viewBox: "0 0 20 20", fill: "currentColor" },
        React.createElement('path', { fillRule: "evenodd", d: "M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z", clipRule: "evenodd" })
      ),
      'Выгнать игрока'
    )
  );
};

export default PlayerContextMenu;
