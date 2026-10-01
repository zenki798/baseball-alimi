const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { open, collectErrors, horizontalOverflow, playerId } = require('./helpers');

/* 화면 배치 — 휴대폰(Pixel 5)·넓은 화면 두 환경에서 돈다. 가로로 넘치거나 겹치면 실패한다 */

const HASHES = ['#standings', '#team/kia', '#team/hanwha', '#players', 'PLAYER', '#news'];

for (const h of HASHES) {
  test(`가로로 넘치지 않는다: ${h}`, async ({ page }) => {
    const hash = h === 'PLAYER' ? '#player/' + playerId('가람') : h;
    await open(page, { hash });
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  });
}

test('휴대폰은 탭 막대가 화면 아래에 붙고, 넓은 화면은 머리띠 안에 있다', async ({ page }, testInfo) => {
  await open(page);
  const tabs = await page.locator('.tabs').boundingBox();
  const vh = page.viewportSize().height;
  if (testInfo.project.name === 'mobile-chromium') {
    expect(Math.round(tabs.y + tabs.height)).toBeGreaterThanOrEqual(vh - 1);
  } else {
    expect(tabs.y).toBeLessThan(60);
  }
  await expect(page.locator('.tab[aria-current="page"]')).toHaveAttribute('data-view', 'standings');
});

test('320px 아주 좁은 화면에서도 제목과 내 팀 단추가 겹치지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await open(page);
  const brand = await page.locator('.brand').boundingBox();
  const btn = await page.locator('#myTeamBtn').boundingBox();
  expect(brand.x + brand.width).toBeLessThanOrEqual(btn.x);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  const lines = await page.locator('#myTeamBtn').evaluate((el) => Math.round(el.getBoundingClientRect().height));
  expect(lines).toBeLessThan(48);   // "내 팀" 글자가 두 줄로 꺾이지 않는다
});

test('제목은 "야구알리미" — 머리띠·탭 제목·설치 이름이 같고, 공개 파일에는 사람 이름이 없다', async ({ page }) => {
  await open(page);
  await expect(page.locator('#brandName')).toHaveText('야구알리미');
  await expect(page.locator('#brandFor')).toBeHidden();
  await expect(page).toHaveTitle('순위 — 야구알리미');
  await page.locator('.tab[data-view="news"]').click();
  await expect(page).toHaveTitle('뉴스 — 야구알리미');
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.webmanifest'), 'utf8'));
  expect(manifest.name).toBe('야구알리미');
});

test('제목 뒤 이름 붙이기: 이 기기에만 저장되고, 새로고침해도 남고, 비우면 빠진다', async ({ page }) => {
  await open(page);
  await page.locator('#myTeamBtn').click();
  await page.locator('#ownerInput').fill('  테스트  ');
  await page.locator('#ownerSave').click();
  await expect(page.locator('#teamSheet')).toBeHidden();
  await expect(page.locator('#brandFor')).toHaveText('for 테스트');
  await expect(page).toHaveTitle('순위 — 야구알리미 for 테스트');
  await expect(page.locator('#toast')).toContainText('이 기기에만');
  await page.reload();
  await expect(page.locator('#brandFor')).toHaveText('for 테스트');
  /* 창을 다시 열면 지금 이름이 들어 있다 → 지우고 저장하면 뺀다 */
  await page.locator('#myTeamBtn').click();
  await expect(page.locator('#ownerInput')).toHaveValue('테스트');
  await page.locator('#ownerInput').fill('');
  await page.locator('#ownerInput').press('Enter');
  await expect(page.locator('#brandFor')).toBeHidden();
  await expect(page).toHaveTitle('순위 — 야구알리미');
});

test('붙인 이름은 글자로만 들어가고(태그 무시) 20자로 자른다', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.BaseballApp.setOwner('<img src=x onerror=alert(1)>가나다라마바사아자차카타파하가나다라마바사'));
  const text = await page.locator('#brandFor').textContent();
  expect(text.startsWith('for ')).toBe(true);
  expect(text.length).toBeLessThanOrEqual(4 + 20);
  expect(text).not.toContain('<');
  await expect(page.locator('.brand img')).toHaveCount(0);
});

test('어두운 모드에서도 뜬다 (배경이 어둡고 예외 없음)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  const errors = collectErrors(page);
  await open(page);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(11, 18, 32)');
  await expect(page.locator('#standingsTable tbody tr')).toHaveCount(10);
  expect(errors).toEqual([]);
});

test('구단 엠블럼 9개가 실제로 그려지고, 한화는 작은 자리에서 색 배지', async ({ page }) => {
  await open(page);
  const logos = page.locator('#standingsTable img.tl');
  await expect(logos).toHaveCount(9);
  await expect.poll(() => logos.evaluateAll((imgs) => imgs.filter((i) => i.complete && i.naturalWidth > 0).length)).toBe(9);
  await expect(page.locator('tr[data-team="hanwha"] .tb')).toHaveText('한화');
});

test('엠블럼 파일을 못 읽으면 색 배지로 바꾼다', async ({ page }) => {
  await page.route(/\/icons\/teams\/kia\.svg$/, (route) => route.fulfill({ status: 404, body: '' }));
  const errors = collectErrors(page, { allow404: true });
  await open(page);
  await expect(page.locator('tr[data-team="kia"] .tb')).toHaveText('KIA');
  await expect(page.locator('tr[data-team="kia"] img.tl')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('뒤로 가기: 화면 사이를 오가면 이전 화면으로 돌아간다 (앱 모드의 안드로이드 뒤로 가기)', async ({ page }) => {
  await open(page);
  await page.locator('.tab[data-view="teams"]').click();
  await expect(page).toHaveURL(/#teams$/);
  await page.locator('#teamChips .chip', { hasText: 'LG' }).click();
  await expect(page.locator('#teamHero h2')).toHaveText('LG 트윈스');
  await page.goBack();
  await expect(page.locator('#teamHero h2')).toHaveText('kt wiz');
  await page.goBack();
  await expect(page.locator('#standingsTable')).toBeVisible();
});
