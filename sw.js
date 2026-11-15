const CACHE_NAME = 'tysiacha-cache-v1.25.0'; // Increment cache version
const urlsToCache = [
  '.', // Кэшируем корневую директорию (эквивалент '/')
  'index.html',
  'style.css',
  'manifest.json',
  'index.js',
  'constants.js',
  'utils/gameLogic.js',
  'utils/gameReducer.js',
  'utils/roomApi.js',
  'utils/config.js',
  'utils/deviceId.js',
  'components/App.js',
  'components/Lobby.js',
  'components/Game.js',
  'components/GameUI.js',
  'components/Dice.js',
  'components/RulesModal.js',
  'components/SpectatorsModal.js',
  'components/KickConfirmModal.js',
  'components/PromoteConfirmModal.js',
  'components/HostLeaveWarningModal.js',
  'components/PlayerContextMenu.js',
  'components/hooks/useGameEngine.js',
  'components/hooks/useRoom.js'
];

self.addEventListener('install', event => {
  self.skipWaiting(); // Немедленно активируем новый Service Worker
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        // Use addAll with a catch to prevent installation failure if one resource fails
        const cachePromises = urlsToCache.map(urlToCache => {
            return cache.add(urlToCache).catch(reason => {
                console.log(`[SW] Caching failed for ${urlToCache}: ${reason}`);
            });
        });
        return Promise.all(cachePromises);
      })
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') {
    return;
  }

  // Игнорируем запросы к сторонним доменам (CDN, PartyKit), чтобы избежать ошибок CORS.
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

  // Для скриптов и стилей — network-first: всегда пробуем сеть, чтобы
  // свежие правки были видны сразу после перезагрузки, а кэш служит
  // офлайн-запаской. Раньше был cache-first, из-за чего браузер неделями
  // отдавал старую версию, пока не сменишь CACHE_NAME.
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Успешный ответ кладём/обновляем в кэш (для офлайна).
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() =>
        // Сеть недоступна — отдаём из кэша, если есть.
        caches.match(event.request).then(cachedResponse =>
          cachedResponse || Response.error()
        )
      )
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
