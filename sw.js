/* 서비스 워커 — 앱 설치 조건을 채우고, 인터넷이 끊겨도 마지막으로 받은 순위·뉴스가 뜨게 한다.
   네트워크 우선: 순위·뉴스는 수시로 바뀌므로 연결이 있으면 늘 새로 받고, 없을 때만 캐시를 쓴다.
   다른 출처(언론사·위키백과) 요청은 건드리지 않는다. 캐시할 파일 목록을 바꾸면 CACHE 이름(버전)을 올린다. */
const CACHE = 'baseball-alimi-v3';
const SHELL = [
  './', 'index.html', 'styles.css', 'teams.js', 'store.js', 'app.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  /* 구단 엠블럼 — 인터넷이 끊겨도 순위표에 로고가 보이게 */
  ...['kia.svg', 'kt.svg', 'lg.svg', 'nc.svg', 'ssg.png', 'doosan.svg', 'lotte.svg', 'samsung.svg', 'kiwoom.png', 'hanwha.png'].map(f => 'icons/teams/' + f),
];
/* 수집 자료는 아직 없을 수도 있다. 없다고 설치가 실패하면 안 되므로 따로 담는다 */
const OPTIONAL = ['data/live.js', 'data/players.js', 'data/stats.js'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL).then(() => Promise.all(OPTIONAL.map(u => c.add(u).catch(() => {})))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  /* 수집 자료는 브라우저 HTTP 캐시(Pages 10분)도 거치지 않고 서버에 확인한다 */
  const isData = /\/data\/[^/]+\.js$/.test(url.pathname);
  /* ?t=… 로 새로 받을 때마다 캐시 항목이 쌓이지 않게 주소 뒤를 떼고 저장한다 */
  const key = url.origin + url.pathname;
  event.respondWith(
    fetch(req, isData ? { cache: 'no-cache' } : undefined)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(key, copy));
        }
        return res;
      })
      .catch(() => caches.match(key)
        .then(hit => hit || (req.mode === 'navigate' ? caches.match(url.origin + url.pathname.replace(/[^/]*$/, '')) : undefined))
        .then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : undefined))
        .then(hit => hit || Response.error()))
  );
});
