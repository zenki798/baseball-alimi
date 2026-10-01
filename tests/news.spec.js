const { test, expect } = require('@playwright/test');
const { open, collectErrors, FIX } = require('./helpers');

/* 뉴스 — 가짜 자료 10건 (KBO 8 · 해외야구 1 · 대표·아마 2 — 한 기사가 여러 갈래일 수 있다) */

test('10건이 최신순, 출처와 상대 시각(한국 시각 기준)', async ({ page }) => {
  const errors = collectErrors(page);
  const calls = await open(page, { hash: '#news' });
  const items = page.locator('#newsList .news-item');
  await expect(items).toHaveCount(10);
  expect(await items.locator('.t').allTextContents()).toEqual(FIX.NEWS.map((n) => n.title));
  const time = (id) => page.locator(`.news-item[data-id="${id}"] time`);
  await expect(time('n1')).toHaveText('30분 전');
  await expect(time('n2')).toHaveText('2시간 전');
  await expect(time('n3')).toHaveText('14시간 전');
  await expect(time('n7')).toHaveText('어제');
  await expect(time('n8')).toHaveText('2일 전');
  await expect(time('n1')).toHaveAttribute('title', '10월 2일 11:30');
  await expect(page.locator('.news-item[data-id="n1"] .src')).toHaveText('테스트일보');
  await expect(page.locator('#newsCount')).toHaveText('기사 10건');
  expect(errors).toEqual([]);
  expect(calls.unexpected).toEqual([]);
});

test('갈래 칩: 건수와 거르기 (해외야구·대표·아마)', async ({ page }) => {
  await open(page, { hash: '#news' });
  const chip = (key) => page.locator(`#newsTopics button[data-topic="${key}"]`);
  await expect(chip('all')).toHaveText('전체 10');
  await expect(chip('kbo')).toHaveText('KBO 8');
  await expect(chip('abroad')).toHaveText('해외야구 1');
  await expect(chip('national')).toHaveText('대표·아마 2');
  await chip('abroad').click();
  await expect(chip('abroad')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.locator('#newsList .news-item .t').allTextContents()).toEqual(['메이저리그 디비전시리즈 개막']);
  await expect(page.locator('#newsCount')).toHaveText('해외야구 — 기사 1건');
  await chip('national').click();
  expect(await page.locator('#newsList .news-item .t').allTextContents()).toEqual(['U-18 야구 대표팀, 아시아 정상', 'KBO 신인 드래프트, 고교야구 최대어 지명']);
});

test('구단 거르기·검색·빈 결과 안내', async ({ page }) => {
  await open(page, { hash: '#news' });
  await page.locator('#newsTeam').selectOption('kia');
  await expect(page.locator('#newsList .news-item')).toHaveCount(2);
  await expect(page.locator('#newsCount')).toHaveText('KIA — 기사 2건');
  await page.locator('#newsSearch').fill('호수비');
  await expect(page.locator('#newsList .news-item')).toHaveCount(1);
  await page.locator('#newsSearch').fill('없는 낱말');
  await expect(page.locator('#newsList .news-item')).toHaveCount(0);
  await expect(page.locator('#newsList')).toContainText('조건에 맞는 기사가 없습니다');
  /* 칩 건수도 구단·검색 조건을 따른다 */
  await page.locator('#newsSearch').fill('');
  await expect(page.locator('#newsTopics button[data-topic="all"]')).toHaveText('전체 2');
});

test('기사는 원문 주소로 새 탭, 다른 창이 앱을 건드리지 못하게(noopener)', async ({ page }) => {
  await open(page, { hash: '#news' });
  const first = page.locator('#newsList .news-item').first();
  await expect(first).toHaveAttribute('href', 'https://news.example.com/article/n1');
  await expect(first).toHaveAttribute('target', '_blank');
  await expect(first).toHaveAttribute('rel', 'noopener noreferrer');
});

test('제목·요약에 든 HTML 은 글자로만 보인다 (스크립트가 돌지 않는다)', async ({ page }) => {
  await open(page, { hash: '#news' });
  const item = page.locator('.news-item[data-id="n9"]');
  await expect(item.locator('.t')).toHaveText('<img src=x onerror="window.__xss=1">위험한 제목');
  await expect(item.locator('.s')).toHaveText('<b>굵게</b> 요약도 글자로만');
  await expect(page.locator('#newsList img')).toHaveCount(0);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
});

test('"내 팀만" 칩으로 켜고 끈다', async ({ page }) => {
  await open(page, { hash: '#news', myTeam: 'kia' });
  const mine = page.locator('#newsMine');
  await expect(mine).toBeVisible();
  await mine.click();
  await expect(mine).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#newsList .news-item')).toHaveCount(2);
  await expect(page.locator('#newsTeam')).toHaveValue('kia');
  await mine.click();
  await expect(page.locator('#newsList .news-item')).toHaveCount(10);
});

test('열 때는 늘 "전체"로 시작한다 (고른 갈래를 저장하지 않는다)', async ({ page }) => {
  await open(page, { hash: '#news' });
  await page.locator('#newsTopics button[data-topic="abroad"]').click();
  await page.reload();
  await expect(page.locator('#newsTopics button[data-topic="all"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#newsList .news-item')).toHaveCount(10);
});

test('요약이 없는 기사는 요약 줄을 그리지 않는다, 안내 문구', async ({ page }) => {
  await open(page, { hash: '#news' });
  await expect(page.locator('.news-item[data-id="n8"] .s')).toHaveCount(0);
  await expect(page.locator('#view-news')).toContainText('기사 저작권은 각 언론사에 있습니다');
  await expect(page.locator('#view-news')).toContainText('사흘이 지난 기사는 목록에서 빠집니다');
});
