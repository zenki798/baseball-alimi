const path = require('path');
const { pathToFileURL } = require('url');
const { expect } = require('@playwright/test');
const FIX = require('./fixtures/data');

/*
 * 테스트 도우미
 * - 자료 파일(data/live.js·data/players.js)은 늘 가짜 자료(fixtures/data.js)로 바꿔 끼운다. 실제 자료는 매일 바뀌어
 *   값으로 검증할 수 없다. 실제 자료 파일이 계약을 지키는지는 data.spec.js 가 따로 본다.
 * - 바깥(localhost 가 아닌 곳)으로 나가는 요청은 막고 calls.unexpected 에 적는다. 이 앱이 화면에서 부르는 바깥 서버는
 *   선수 상세의 얼굴 사진(위키미디어)뿐이다 — 가짜 그림으로 답하고 calls.photos 에 적는다.
 * - file:// 요청도 route 로 가로챌 수 있다(Playwright 1.63, 2026-10-02 확인) — 더블클릭 시험도 같은 가짜 자료로 한다.
 * - 시계는 NOW(2026-10-02 12:00 한국 시각)로 고정한다.
 */

const FILE_URL = pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;
/* 1×1 투명 PNG — 사진 대용 (작업8 테스트에서 쓰던 것) */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const KEY = { myTeam: 'baseball-alimi.myTeam', installDismissed: 'baseball-alimi.installDismissed' };

/**
 * @param {import('@playwright/test').Page|import('@playwright/test').BrowserContext} target
 * @param {object} [opt]
 * @param {object|null|'404'} [opt.live]     live 자료 (null·'404' 면 파일이 없는 것처럼)
 * @param {object|null|'404'} [opt.players]  players 자료
 * @param {string} [opt.liveScript]          live.js 본문을 통째로 바꾼다
 * @param {boolean} [opt.failPhotos]         사진 요청을 실패시킨다
 */
async function mockData(target, opt = {}) {
  const calls = { live: [], players: [], photos: [], unexpected: [] };
  await target.route(/^https?:\/\/(?!localhost[:/])/, (route) => {
    calls.unexpected.push(route.request().url());
    return route.abort();
  });
  /* 선수 사진 — 뒤에 등록한 route 가 먼저 적용된다 */
  await target.route(/^https:\/\/(upload|thumb)\.wikimedia\.org\//, (route) => {
    calls.photos.push(route.request().url());
    if (opt.failPhotos) return route.abort('internetdisconnected');
    return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
  });
  const serve = (name, value, script) => async (route) => {
    calls[name].push(route.request().url());
    if (value === null || value === '404') return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not Found' });
    return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: script() });
  };
  const live = opt.live === undefined ? FIX.buildLive() : opt.live;
  const players = opt.players === undefined ? FIX.buildPlayers() : opt.players;
  await target.route(/\/data\/live\.js(\?.*)?$/, serve('live', live, () => opt.liveScript || FIX.liveScript(live)));
  await target.route(/\/data\/players\.js(\?.*)?$/, serve('players', players, () => FIX.playersScript(players)));
  return calls;
}

/* 콘솔 에러·페이지 예외를 모은다. 자료 파일을 일부러 없앤 시험의 404 는 opt.allow404 로 넘긴다 */
function collectErrors(page, opt = {}) {
  const errors = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (opt.allow404 && /404|ERR_FILE_NOT_FOUND|Failed to load resource/.test(m.text())) return;
    errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function waitReady(page) {
  await expect(page.locator('html')).toHaveAttribute('data-state', 'ready');
}

/**
 * 가짜 자료를 끼우고 연다.
 * @param {import('@playwright/test').Page} page
 * @param {object} [opt]  mockData 의 것 + { url, hash, now, myTeam, context, wait }
 */
async function open(page, opt = {}) {
  await page.clock.setFixedTime(new Date(opt.now || FIX.NOW));
  if (opt.myTeam) {
    await page.addInitScript(([k, id]) => {
      try { if (!sessionStorage.getItem('__seeded')) { localStorage.setItem(k, id); sessionStorage.setItem('__seeded', '1'); } } catch (e) { /* 막힌 저장소 시험 */ }
    }, [KEY.myTeam, opt.myTeam]);
  }
  const calls = await mockData(opt.context || page, opt);
  await page.goto((opt.url || '/') + (opt.hash || ''));
  if (opt.wait !== false) await waitReady(page);
  return calls;
}

/* 가짜 자료에서 이름으로 선수 id 를 찾는다 (구단을 주면 그 구단에서) */
function playerId(name, team) {
  const pl = FIX.buildPlayers();
  for (const t of Object.keys(pl.rosters)) {
    if (team && t !== team) continue;
    const p = pl.rosters[t].players.find((x) => x.name === name);
    if (p) return p.id;
  }
  throw new Error('가짜 자료에 없는 선수: ' + name);
}

/* 페이지 가로 넘침(가로 스크롤) */
async function horizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

module.exports = { FIX, FILE_URL, KEY, mockData, collectErrors, waitReady, open, playerId, horizontalOverflow };
