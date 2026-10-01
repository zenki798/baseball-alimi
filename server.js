/* 개발용 정적 파일 서버 (npm start → http://localhost:4211)
   테스트(playwright.config.js)도 이 서버를 띄운다. 다른 작업 폴더의 서버와 포트가 겹치지 않게 4211(작업11)을 쓴다 —
   겹치면 reuseExistingServer 때문에 다른 앱을 대상으로 테스트가 돈다. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 4211;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

/* 배포(GitHub Pages)에 올리는 것과 같은 범위만 내준다. 테스트·스크립트·설정 파일은 내주지 않는다 */
const ALLOWED = /^(index\.html|styles\.css|teams\.js|store\.js|app\.js|sw\.js|manifest\.webmanifest|data\/[\w-]+\.js|icons\/[\w-]+\.png|icons\/teams\/[\w-]+\.(?:svg|png))$/;

http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0]);
  } catch (e) {
    res.writeHead(400).end('Bad Request');
    return;
  }
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep) || !ALLOWED.test(rel)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not Found');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}).listen(PORT, () => {
  console.log('http://localhost:' + PORT);
});
