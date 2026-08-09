// Andy 工作台 Service Worker — PWA 离线支持
// 所有缓存路径基于 self.registration.scope 计算，可同时工作于：
//   - 公网根路径（https://tech-taylor.taila3ecd9.ts.net/）
//   - GitHub Pages 子路径（https://tele-switc.github.io/andy-web-workbench/）
// 策略：
//   - 页面导航（HTML）：network-first，离线回退缓存
//   - 静态资源：cache-first
//   - 跨域 / API：不拦截
const CACHE_NAME = 'andy-workbench-v5';

const scopeUrl = new URL(self.registration ? self.registration.scope : './', self.location.href);
const SCOPE = scopeUrl.pathname.endsWith('/') ? scopeUrl.pathname : scopeUrl.pathname + '/';

const STATIC_ASSETS = [
  SCOPE,
  SCOPE + 'index.html',
  SCOPE + 'manifest.json',
  SCOPE + 'favicon.svg',
  SCOPE + 'icon-192.png',
  SCOPE + 'icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 同源 API 与跨域请求：不拦截
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith(SCOPE + 'api/')) return;

  // 导航请求（HTML）：network-first
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(SCOPE + 'index.html', copy));
          return res;
        })
        .catch(() => caches.match(SCOPE + 'index.html').then((c) => c || caches.match(SCOPE)))
    );
    return;
  }

  // 静态资源：cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      return cached || fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});
