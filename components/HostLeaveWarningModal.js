
import React from 'react';

const HostLeaveWarningModal = ({ onClose }) => {
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
        className: "relative w-full max-w-md bg-slate-800 text-gray-300 rounded-2xl shadow-2xl border-2 border-yellow-500 flex flex-col p-6 animate-bounce-short",
        onClick: e => e.stopPropagation()
      },
      React.createElement(
        'header',
        { className: "flex items-center justify-between mb-4" },
        React.createElement('h2', { className: "font-ruslan text-3xl text-yellow-500" }, 'Нельзя выйти'),
        React.createElement(
          'button',
          {
            onClick: onClose,
            className: "text-gray-400 hover:text-white transition-colors p-1 rounded-full bg-slate-700 hover:bg-slate-600",
            'aria-label': "Закрыть"
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
        { className: "mb-6" },
        React.createElement('div', { className: "flex justify-center mb-4" },
             React.createElement('svg', { xmlns: "http://www.w3.org/2000/svg", className: "h-16 w-16 text-yellow-500", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 1.5 },
                React.createElement('path', { strokeLinecap: "round", strokeLinejoin: "round", d: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" })
             )
        ),
        React.createElement('p', { className: "text-lg text-center mb-2" }, 
            'Вы являетесь ',
            React.createElement('strong', { className: 'text-white' }, 'Хостом'),
            ' этой комнаты.'
        ),
        React.createElement('p', { className: "text-center text-gray-400" }, 
            'Пока в игре есть другие участники, вы не можете просто так выйти. Пожалуйста, передайте права Хоста другому игроку.'
        ),
        React.createElement('div', { className: "mt-4 p-3 bg-slate-700/50 rounded-lg text-sm" },
            React.createElement('p', { className: "text-center" }, 'Нажмите на имя игрока в списке → "Назначить хостом"')
        )
      ),
      React.createElement(
        'footer',
        { className: "flex justify-center" },
        React.createElement('button', { onClick: onClose, className: "w-full py-3 bg-slate-600 hover:bg-slate-700 rounded-lg font-bold text-white transition-colors" }, 'Понятно')
      )
    )
  );
};

export default HostLeaveWarningModal;
