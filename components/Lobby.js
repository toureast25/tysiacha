
import React from 'react';
import { initClientPeer, connectToHost } from '../utils/mqttUtils.js';

const Lobby = ({ onStartGame, initialRoomCode }) => {
  const [roomCode, setRoomCode] = React.useState('');
  const [playerName, setPlayerName] = React.useState('');
  const [roomStatus, setRoomStatus] = React.useState(null); // { status: 'loading' | 'found' | 'not_found' | 'uncertain', message?: string }
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    const savedName = localStorage.getItem('tysiacha-playerName');
    if (savedName) {
      setPlayerName(savedName);
    }
    if (initialRoomCode) {
      setRoomCode(initialRoomCode);
    } else {
      generateRoomCode();
    }
  }, [initialRoomCode]);

  const generateRoomCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; 
    let result = '';
    for (let i = 0; i < 5; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setRoomCode(result);
    setRoomStatus(null); 
  };

  const checkRoom = React.useCallback(async () => {
    const code = roomCode.trim().toUpperCase();
    // Strict length check prevents trying to connect to typos like 'CE3VVDDD'
    if (code.length !== 5) return;

    setIsLoading(true);
    setRoomStatus({ status: 'loading' });

    try {
        const peer = initClientPeer();
        let isDestroyed = false;
        let isFound = false;
        
        peer.on('open', () => {
            if (isDestroyed) return;
            const conn = connectToHost(peer, code);
            
            // Тайм-аут на поиск комнаты
            const timeout = setTimeout(() => {
                if (!isFound && !isDestroyed) {
                    setRoomStatus({ status: 'uncertain', message: 'Хост не отвечает (попробуйте войти)' });
                    conn.close();
                    peer.destroy();
                    isDestroyed = true;
                    setIsLoading(false);
                }
            }, 5000); // 5 секунд

            conn.on('open', () => {
                isFound = true;
                clearTimeout(timeout);
                if (!isDestroyed) {
                    setRoomStatus({ status: 'found', message: 'Комната найдена!' });
                    setTimeout(() => {
                        conn.close();
                        peer.destroy();
                        isDestroyed = true;
                        setIsLoading(false);
                    }, 200);
                }
            });
            
            conn.on('error', (err) => {
                 // Connection-specific errors don't mean ID is invalid, just connection failed
            });

            peer.on('error', (err) => {
                clearTimeout(timeout);
                if (!isDestroyed) {
                     // 'peer-unavailable' - это ЕДИНСТВЕННЫЙ гарант того, что комнаты нет.
                     if (err.type === 'peer-unavailable') {
                        setRoomStatus({ status: 'not_found', message: 'Комната свободна' });
                     } else {
                        // Suppress console warning for expected connection errors during check
                        if (err.type !== 'peer-unavailable') console.warn('Peer Check Warning:', err.type);
                        setRoomStatus({ status: 'uncertain', message: 'Ошибка связи (попробуйте войти)' });
                     }
                     peer.destroy();
                     isDestroyed = true;
                     setIsLoading(false);
                }
            });
        });

        peer.on('error', (err) => {
             // Init error
             if (!isDestroyed) {
                 setIsLoading(false);
                 setRoomStatus({ status: 'uncertain', message: 'Ошибка P2P' });
                 isDestroyed = true;
             }
        });

    } catch (e) {
        console.error(e);
        setRoomStatus({ status: 'uncertain', message: 'Ошибка инициализации' });
        setIsLoading(false);
    }
  }, [roomCode]);

  // Reset status on typing
  React.useEffect(() => {
      if (roomCode.length === 5) {
          const timer = setTimeout(() => {
             setRoomStatus(null); 
          }, 500);
          return () => clearTimeout(timer);
      }
  }, [roomCode]);


  const handleStart = () => {
    const finalRoomCode = roomCode.trim().toUpperCase();
    const finalPlayerName = playerName.trim();
    
    if (finalRoomCode.length === 5 && finalPlayerName.length > 2) {
      localStorage.setItem('tysiacha-playerName', finalPlayerName);
      
      let mode = 'join'; // Default safe assumption
      
      if (roomStatus?.status === 'not_found') {
          mode = 'create';
      } else if (roomStatus?.status === 'found') {
          mode = 'join';
      } else if (roomStatus === null) {
          mode = 'join'; 
      }
      
      onStartGame(finalRoomCode, finalPlayerName, mode);
    }
  };
  
  const RoomStatusInfo = () => {
    if (!roomCode || roomCode.trim().length < 5) return React.createElement('div', { className: "text-sm text-gray-400 mt-2 min-h-[20px]" }, 'Код должен быть из 5 символов');
    
    if (isLoading || roomStatus?.status === 'loading') {
         return React.createElement('div', { className: "text-sm text-gray-400 mt-2 min-h-[20px] flex items-center justify-center" }, 
            React.createElement('div', { className: "flex items-center" },
                React.createElement('div', {className: "w-4 h-4 border-2 border-t-transparent border-title-yellow rounded-full animate-spin mr-2"}), 
                'Проверка комнаты...'
            )
        );
    }

    if (roomStatus?.status === 'found') {
        return React.createElement('div', { className: "text-sm text-green-400 mt-2 min-h-[20px] flex items-center justify-center font-bold" }, 
             'Комната найдена! Вы войдете как игрок.'
        );
    }
    
    if (roomStatus?.status === 'not_found') {
        return React.createElement('div', { className: "text-sm text-blue-300 mt-2 min-h-[20px] flex items-center justify-center" }, 
             'Комната свободна. Вы создадите игру.'
        );
    }

    if (roomStatus?.status === 'uncertain') {
        return React.createElement('div', { className: "text-sm text-yellow-400 mt-2 min-h-[20px] flex items-center justify-center" }, 
             roomStatus.message || 'Статус неизвестен'
        );
    }
    
    return React.createElement('div', { className: "text-sm text-gray-500 mt-2 min-h-[20px]" }, 'Нажмите "Проверить" или "Играть"');
  }

  let buttonText = 'Войти';
  if (roomStatus?.status === 'not_found') buttonText = 'Создать игру';
  if (roomStatus?.status === 'uncertain') buttonText = 'Попробовать войти';

  const isButtonDisabled = roomCode.trim().length !== 5 || playerName.trim().length < 3 || isLoading;

  return React.createElement(
    'div',
    { className: "w-full max-w-md p-6 sm:p-8 bg-slate-800/80 backdrop-blur-md rounded-xl shadow-2xl border border-slate-700 text-center" },
    React.createElement('h2', { className: "font-ruslan text-2xl sm:text-4xl lg:text-5xl text-title-yellow mb-4 sm:mb-6" }, 'Вход в игру'),
    React.createElement(
      'div',
      { className: "space-y-4 sm:space-y-6" },
      React.createElement(
        'div',
        null,
        React.createElement(
          'label',
          { htmlFor: "playerName", className: "block text-lg font-semibold text-gray-300 mb-2" },
          'Ваше имя'
        ),
        React.createElement('input', {
          id: "playerName",
          type: "text",
          value: playerName,
          onChange: (e) => setPlayerName(e.target.value),
          placeholder: "Введите имя",
          className: "w-full p-3 text-center bg-slate-900 border-2 border-slate-600 rounded-lg text-xl font-semibold text-white focus:outline-none focus:border-highlight transition-colors"
        })
      ),
      React.createElement(
        'div',
        null,
        React.createElement(
          'label',
          { htmlFor: "roomCode", className: "block text-lg font-semibold text-gray-300 mb-2" },
          'Код комнаты'
        ),
        React.createElement(
            'div',
            { className: 'relative flex items-center' },
            React.createElement('input', {
              id: "roomCode",
              type: "text",
              value: roomCode,
              onChange: (e) => setRoomCode(e.target.value.toUpperCase().slice(0, 5)),
              onBlur: checkRoom, 
              placeholder: "5 символов",
              maxLength: 5,
              className: "w-full p-3 pr-12 text-center bg-slate-900 border-2 border-slate-600 rounded-lg text-2xl font-mono tracking-widest text-white focus:outline-none focus:border-highlight transition-colors"
            }),
            React.createElement(
                'button',
                {
                    onClick: generateRoomCode,
                    className: "absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-title-yellow transition-colors focus:outline-none",
                    'aria-label': "Сгенерировать новый код",
                    title: "Сгенерировать новый код"
                },
                React.createElement(
                    'svg',
                    { xmlns: "http://www.w3.org/2000/svg", className: "h-6 w-6", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2 },
                    React.createElement('path', { strokeLinecap: "round", strokeLinejoin: "round", d: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" })
                )
            )
        ),
        React.createElement(RoomStatusInfo, null)
      ),
      React.createElement(
        'div',
        { className: "flex gap-3" },
        React.createElement(
            'button',
            {
              onClick: checkRoom,
              disabled: isButtonDisabled,
              className: "flex-1 py-3 bg-slate-600 hover:bg-slate-700 rounded-lg font-bold transition-all disabled:bg-gray-500 disabled:cursor-not-allowed"
            },
            "Проверить"
        ),
        React.createElement(
            'button',
            {
              onClick: handleStart,
              className: "flex-[2] py-3 bg-green-600 hover:bg-green-700 rounded-lg text-xl font-bold uppercase tracking-wider transition-all duration-300 transform hover:scale-105 shadow-lg disabled:bg-gray-500 disabled:cursor-not-allowed",
              disabled: isButtonDisabled
            },
            buttonText
        )
      )
    )
  );
};

export default Lobby;
