// 
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './components/App.js';

// --- Регистрация Service Worker для PWA ---

// !!! ВАЖНО: Установите 'false' перед публикацией на сервере (production) !!!
const IS_DEVELOPMENT_MODE = true; 

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    let swPath = 'sw.js';

    if (IS_DEVELOPMENT_MODE) {
      // В режиме разработки добавляем уникальный параметр, чтобы обойти HTTP-кэш браузера для sw.js
      swPath = `sw.js?t=${new Date().getTime()}`;
      console.log('DEV MODE: Service Worker cache will be bypassed on reload.');
    }

    navigator.serviceWorker.register(swPath).then(registration => {
      console.log('ServiceWorker registration successful with scope: ', registration.scope);
    }, err => {
      console.log('ServiceWorker registration failed: ', err);
    });
  });
}


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