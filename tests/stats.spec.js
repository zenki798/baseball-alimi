const { test, expect } = require('@playwright/test');
const { open, collectErrors, playerId, FILE_URL } = require('./helpers');

/*
 * 선수 화면의 "기록" 카드 — 지난 시즌까지는 위키백과 통산 기록 표(data/stats.js), 올 시즌은 KBO 공식 기록 링크.
 * 가짜 자료: 가람(투수, KBO 투수 12345), KIA 나래(타자, KBO 타자 54321), LG 나래(타격·투구 둘 다), 다온(문서 없음 → 기록 없음)
 */

test('투수: 연도별 표·가장 최근 시즌 강조·통산·KBO 공식 기록 링크', async ({ page }) => {
  const errors = collectErrors(page);
  const calls = await open(page, { hash: '#player/' + playerId('가람') });
  const table = page.locator('#statTable');
  await expect(table).toHaveAttribute('data-kind', 'pit');
  expect(await table.locator('thead th').allTextContents()).toEqual(['연도', '팀', '경기', '평균자책점', '승', '패', '세이브', '홀드', '이닝', '탈삼진', '볼넷']);
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await expect(table.locator('tbody tr.latest th')).toHaveText('2025');
  await expect(table.locator('tbody tr.latest td').nth(2)).toHaveText('2.95');
  await expect(table.locator('tfoot th')).toHaveText('통산');
  await expect(table.locator('tfoot td').first()).toHaveText('2시즌');
  const link = page.locator('#statsCard .official a');
  await expect(link).toHaveCount(1);
  await expect(link).toHaveText('KBO 공식 기록 ↗');
  await expect(link).toHaveAttribute('href', 'https://www.koreabaseball.com/Record/Player/PitcherDetail/Total.aspx?playerId=12345');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.locator('#statsCard')).toContainText('2025 시즌까지');
  await expect(page.locator('#statsCard')).toContainText('올 시즌(2026) 기록은 KBO 공식 기록실에서');
  await expect(page.locator('#statsCard')).toContainText('자동으로 모으지 않습니다');
  expect(errors).toEqual([]);
  expect(calls.unexpected).toEqual([]);
});

test('타자: 타격 표와 KBO 타자 기록 링크, 통산 줄이 없으면 그리지 않는다', async ({ page }) => {
  await open(page, { hash: '#player/' + playerId('나래', 'kia') });
  const table = page.locator('#statTable');
  await expect(table).toHaveAttribute('data-kind', 'bat');
  expect(await table.locator('thead th').allTextContents()).toEqual(['연도', '팀', '경기', '타율', '안타', '홈런', '타점', '득점', '도루', '볼넷', '삼진']);
  await expect(table.locator('tfoot')).toHaveCount(0);
  await expect(page.locator('#statsCard .official a')).toHaveAttribute('href', 'https://www.koreabaseball.com/Record/Player/HitterDetail/Total.aspx?playerId=54321');
});

test('타격·투구 기록이 둘 다 있으면 골라 본다 (포수는 타격이 먼저), 링크도 둘', async ({ page }) => {
  await open(page, { hash: '#player/' + playerId('나래', 'lg') });
  const seg = page.locator('#statsCard .seg button');
  expect(await seg.allTextContents()).toEqual(['타격', '투구']);
  await expect(seg.first()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#statTable')).toHaveAttribute('data-kind', 'bat');
  await seg.nth(1).click();
  await expect(page.locator('#statTable')).toHaveAttribute('data-kind', 'pit');
  expect(await page.locator('#statsCard .official a').allTextContents()).toEqual(['KBO 공식 기록(타자) ↗', 'KBO 공식 기록(투수) ↗']);
});

test('기록 표도 KBO 번호도 없는 선수: 안내와 네이버 검색 링크', async ({ page }) => {
  await open(page, { hash: '#player/' + playerId('다온') });
  await expect(page.locator('#statsNone')).toHaveText('위키백과에 이 선수의 연도별 기록 표가 아직 없습니다.');
  const search = page.locator('#statsSearch');
  await expect(search).toHaveAttribute('href', 'https://search.naver.com/search.naver?query=' + encodeURIComponent('다온 KIA 야구 기록'));
  await expect(search).toHaveAttribute('rel', 'noopener noreferrer');
});

test('기록 파일은 선수 화면을 처음 열 때 한 번만 싣는다 (첫 화면을 무겁게 하지 않는다)', async ({ page }) => {
  const calls = await open(page, { hash: '#players' });
  await page.locator('#playerSearch').fill('가람');
  await expect(page.locator('#peopleList .person-card')).toHaveCount(1);
  expect(calls.stats).toEqual([]);
  await page.locator('#peopleList .person-card').click();
  await expect(page.locator('#statTable')).toBeVisible();
  expect(calls.stats).toHaveLength(1);
  await page.goto('/#player/' + playerId('나래', 'kia'));
  await expect(page.locator('#statTable')).toHaveAttribute('data-kind', 'bat');
  expect(calls.stats).toHaveLength(1);
});

test('기록 파일을 못 받으면 안내하고, 공식 기록 찾기 링크는 그대로 둔다', async ({ page }) => {
  const errors = collectErrors(page, { allow404: true });
  await open(page, { hash: '#player/' + playerId('가람'), stats: '404' });
  await expect(page.locator('#statsCard')).toContainText('연도별 기록을 불러오지 못했습니다');
  await expect(page.locator('#statsSearch')).toBeVisible();
  expect(errors).toEqual([]);
});

test('감독 화면에는 기록 카드가 없다 (선수 시절 기록이 지금 기록처럼 보인다)', async ({ page }) => {
  await open(page, { hash: '#team/kia' });
  await page.locator('#managerLink').click();
  await expect(page.locator('#personName')).toHaveText('KIA감독');
  await expect(page.locator('#statsCard')).toHaveCount(0);
});

test('file:// 로 열어도 기록 표가 뜬다', async ({ page }) => {
  await open(page, { url: FILE_URL, hash: '#player/' + playerId('가람') });
  await expect(page.locator('#statTable tbody tr')).toHaveCount(2);
});
