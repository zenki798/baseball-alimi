const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { open, collectErrors, FILE_URL, mockData, playerId } = require('./helpers');

/*
 * 사용자는 index.html 을 더블클릭(file://)해서 연다. 이때 ES 모듈은 막히고 localStorage 도 막힐 수 있다.
 * 로컬 서버에서만 통과하고 끝내지 않는다 (AGENTS.md 규칙 1).
 */

test('file:// 로 열어도 네 화면이 모두 뜬다 (가짜 자료)', async ({ page }) => {
  const errors = collectErrors(page);
  const calls = await open(page, { url: FILE_URL });
  await expect(page.locator('#standingsTable tbody tr')).toHaveCount(10);
  await page.locator('.tab[data-view="teams"]').click();
  await expect(page.locator('#teamHero h2')).toHaveText('kt wiz');
  await expect(page.locator('#teamHero img.tl')).toHaveJSProperty('complete', true);
  await page.locator('.tab[data-view="players"]').click();
  await expect(page.locator('#playerCount')).toHaveText('선수 260명');
  await page.locator('.tab[data-view="news"]').click();
  await expect(page.locator('#newsList .news-item')).toHaveCount(10);
  expect(errors).toEqual([]);
  expect(calls.unexpected).toEqual([]);
});

test('file:// 에서도 선수 사진이 뜨고 크게 볼 수 있다', async ({ page }) => {
  const calls = await open(page, { url: FILE_URL, hash: '#player/' + playerId('가람') });
  await expect(page.locator('#personPhoto')).toBeVisible();
  await page.locator('#photoZoom').click();
  await expect(page.locator('#lightbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#lightbox')).toBeHidden();
  expect(calls.photos.length).toBeGreaterThan(0);
});

test('저장소의 실제 자료 파일로 file:// 를 열어도 예외가 없다 (값이 아니라 구조만 본다)', async ({ page }) => {
  const errors = collectErrors(page);
  /* 자료 파일은 가로채지 않는다 — 디스크의 data/live.js·players.js 를 그대로 읽는다. 바깥 요청만 막는다 */
  await page.route(/^https?:\/\//, (route) => route.abort());
  await page.goto(FILE_URL);
  await expect(page.locator('html')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('html')).toHaveAttribute('data-data', 'full');
  await expect(page.locator('#standingsTable tbody tr')).toHaveCount(10);
  await page.goto(FILE_URL + '#news');
  await expect(page.locator('#newsList .news-item').first()).toBeVisible();
  await page.goto(FILE_URL + '#team/kia');
  await expect(page.locator('#rosterGrid .person-btn').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('localStorage 를 못 써도 화면이 죽지 않고, 내 팀 고르기는 이번 화면에서 된다', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('localStorage blocked'); } });
  });
  const errors = collectErrors(page);
  await open(page, { url: FILE_URL });
  await expect(page.locator('#standingsTable tbody tr')).toHaveCount(10);
  await page.locator('#myTeamBtn').click();
  await page.locator('#teamSheetList button[data-team="nc"]').click();
  await expect(page.locator('tr[data-team="nc"]')).toHaveClass(/\bmine\b/);
  expect(errors).toEqual([]);
});

test('ES 모듈을 쓰지 않는다 — 더블클릭(file://)하면 모듈은 막힌다', async () => {
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  expect(html).not.toMatch(/type=["']module["']/);
  for (const f of ['app.js', 'store.js', 'teams.js']) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    expect(src, f).not.toMatch(/^\s*(import|export)\s/m);
  }
  /* 화면이 읽는 자료는 fetch 가 아니라 <script src> 로 싣는다 (file:// 에서 fetch 는 막힌다) */
  expect(fs.readFileSync(path.join(root, 'app.js'), 'utf8')).not.toMatch(/\bfetch\(/);
});

test('mockData 없이 자료 파일이 아예 없어도 file:// 에서 뜬다', async ({ page }) => {
  const errors = collectErrors(page, { allow404: true });
  await mockData(page, { live: '404', players: '404' });
  await page.goto(FILE_URL);
  await expect(page.locator('html')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#view-standings')).toContainText('순위 자료가 아직 없습니다');
  expect(errors).toEqual([]);
});
