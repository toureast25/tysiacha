// Конфигурация подключения к PartyServer-комнате.
//
// Хост сервера комнат задаётся через переменную окружения при сборке:
//   VITE_PARTYKIT_HOST=<имя-воркера>.<ваш-аккаунт>.workers.dev
// (см. DEPLOY.md). Секретов здесь нет — авторитетный сервер хранит всё своё
// состояние сам, браузеру нужен только публичный адрес комнаты.

export const partykitConfig = {
    // Публичный хост PartyServer-воркера (без схемы).
    // GitHub Pages раздаёт исходники напрямую (importmap + CDN), где
    // import.meta.env не определён, поэтому fallback = реальный задеплоенный хост.
    host: (import.meta.env && import.meta.env.VITE_PARTYKIT_HOST)
        || 'tysiacha.tysiacha.workers.dev',
    useTls: true,
};
