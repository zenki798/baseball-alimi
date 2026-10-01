const { test, expect } = require('@playwright/test');
const { open, FIX, FILE_URL } = require('./helpers');

/*
 * 열어 둔 화면의 자동 갱신 — 휴대폰 배터리를 닳게 하지 않는 것이 조건이다(작업4 에서 사용자가 정한 규칙을 따른다).
 * - 백그라운드에서 타이머를 돌리지 않는다. 화면이 "다시 보일 때"만, 마지막으로 받은 지 10분이 지났을 때만 묻는다.
 * - 인터넷이 끊겼거나 file:// 이면 묻지 않는다.
 */

function setVisibility(page, state) {
  return page.evaluate((s) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => s === 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}
const later = (min) => new Date(new Date(FIX.NOW).getTime() + min * 60000);

test('10분이 안 지났으면 다시 보여도 묻지 않고, 지났으면 한 번 묻는다', async ({ page }) => {
  const calls = await open(page);
  expect(calls.live).toHaveLength(1);
  await setVisibility(page, 'hidden');
  await page.clock.setFixedTime(later(5));
  await setVisibility(page, 'visible');
  await page.waitForTimeout(300);
  expect(calls.live).toHaveLength(1);

  await setVisibility(page, 'hidden');
  await page.clock.setFixedTime(later(11));
  await setVisibility(page, 'visible');
  await expect.poll(() => calls.live.length).toBe(2);
  /* 조용히 받는다 — 바뀐 게 없으면 알림도 없다 */
  await expect(page.locator('#toast')).toBeHidden();
});

test('숨겨질 때는 묻지 않는다 (백그라운드 요청 없음)', async ({ page }) => {
  const calls = await open(page);
  await page.clock.setFixedTime(later(30));
  await setVisibility(page, 'hidden');
  await page.waitForTimeout(300);
  expect(calls.live).toHaveLength(1);
});

test('인터넷이 끊겼으면 묻지 않는다', async ({ page, context }) => {
  const calls = await open(page);
  await context.setOffline(true);
  await page.clock.setFixedTime(later(30));
  await setVisibility(page, 'visible');
  await page.waitForTimeout(300);
  expect(calls.live).toHaveLength(1);
  await context.setOffline(false);
});

test('file:// 로 열었으면 묻지 않는다 (물을 서버가 없다)', async ({ page }) => {
  const calls = await open(page, { url: FILE_URL });
  await page.clock.setFixedTime(later(30));
  await setVisibility(page, 'visible');
  await page.waitForTimeout(300);
  expect(calls.live).toHaveLength(1);
});

test('끝없이 도는 애니메이션이 없다 (화면을 계속 다시 그리지 않게)', async ({ page }) => {
  await open(page);
  const infinite = await page.evaluate(() => document.getAnimations().filter((a) => {
    const t = a.effect && a.effect.getTiming && a.effect.getTiming();
    return t && t.iterations === Infinity;
  }).length);
  expect(infinite).toBe(0);
});
