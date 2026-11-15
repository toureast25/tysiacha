// Устойчивый идентификатор устройства для статического клиента (GitHub Pages).
//
// Задача: чтобы игрок, закрывший браузер и зашедший снова (новая вкладка,
// новое окно, перезапуск браузера, PWA), оставался тем же человеком и сервер
// возвращал его в свой слот, а не понижал в зрители.
//
// localStorage — основное хранилище, но его могут почистить (очистка данных
// сайта, приватный режим). Поэтому держим id в нескольких местах сразу и при
// чтении берём то, что выжило. Если ни в одном нет — генерируем новый и
// прописываем во все.
//
// Честные ограничения (без аккаунта/бэкенда их не обойти в статике):
//  - разные браузеры на одном устройстве НЕ разделяют id (разные хранилища);
//  - режим инкогнито стирает всё при закрытии — там id будет новый;
//  - полная очистка данных сайта + cookies одновременно даёт новый id.
// Для обычного «закрыл и вернулся на том же браузере» id держится надёжно.

const KEY = 'tysiacha-deviceId';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // год

function genId() {
    return `dev_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
}

function readCookie() {
    try {
        const m = document.cookie.match(new RegExp('(?:^|; )' + KEY + '=([^;]*)'));
        return m ? decodeURIComponent(m[1]) : null;
    } catch (e) {
        return null;
    }
}

function writeCookie(value) {
    try {
        document.cookie = `${KEY}=${encodeURIComponent(value)}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax`;
    } catch (e) { /* cookies могут быть заблокированы — не критично */ }
}

function safeGet(store, key) {
    try { return store.getItem(key); } catch (e) { return null; }
}

function safeSet(store, key, value) {
    try { store.setItem(key, value); } catch (e) { /* приватный режим / квота */ }
}

// Возвращает стабильный deviceId этого устройства, гарантированно непустой.
export function getDeviceId() {
    let id = null;
    try {
        id = safeGet(localStorage, KEY)
          || safeGet(sessionStorage, KEY)
          || readCookie();
    } catch (e) {
        id = null;
    }
    if (!id) id = genId();
    // Прописываем во все хранилища — переживёт чистку любого одного.
    try {
        safeSet(localStorage, KEY, id);
        safeSet(sessionStorage, KEY, id);
        writeCookie(id);
    } catch (e) { /* ignore */ }
    return id;
}
