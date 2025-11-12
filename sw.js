const CACHE_NAME = 'tysiacha-cache-v6';
const urlsToCache = [
  '.', // Кэшируем корневую директорию (эквивалент '/')
  'index.html',
  'style.css',
  'manifest.json',
  'index.js',
  'constants.js',
  'utils/gameLogic.js',
  'components/App.js',
  'components/Lobby.js',
  'components/Game.js',
  'components/GameUI.js',
  'components/Dice.js',
  'components/RulesModal.js',
  'components/SpectatorsModal.js',
  'components/KickConfirmModal.js',
  'components/PlayerContextMenu.js'
];

self.addEventListener('install', event => {
  self.skipWaiting(); // Немедленно активируем новый Service Worker
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Игнорируем запросы к сторонним доменам (CDN), чтобы избежать ошибок CORS.
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    return; // Позволяем браузеру выполнить запрос напрямую, минуя Service Worker.
  }

  // Для навигационных запросов (переход по страницам) пробуем сеть, если не вышло - отдаем кэш
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('index.html')) // Отдаем index.html при сбое
    );
    return;
  }

  // Для всех остальных запросов (скрипты, стили) сначала ищем в кэше
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then(networkResponse => {
        // Если запрос успешен, клонируем ответ и сохраняем в кэш на будущее
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      });
    })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            // Удаляем старые кэши
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Захватываем контроль над открытыми страницами
  );
});
