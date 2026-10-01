const { test, expect } = require('@playwright/test');
const { open, collectErrors, KEY } = require('./helpers');

/* 내 팀 — 고르면 순위표에서 강조하고 첫 화면에 요약 카드를 보여 준다. 이 기기(localStorage)에만 남는다 */

async function pick(page, id) {
  await page.locator('#myTeamBtn').click();
  await expect(page.locator('#teamSheet')).toBeVisible();
  await page.locator(`#teamSheetList button[data-team="${id}"]`).click();
  await expect(page.locator('#teamSheet')).toBeHidden();
}

test('처음에는 고르라는 안내, 고르면 머리띠·순위표 강조·내 팀 카드', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  await expect(page.locator('#myTeamValue')).toHaveText('고르기');
  await expect(page.locator('#pickTeamBtn')).toBeVisible();

  await pick(page, 'kia');
  await expect(page.locator('#myTeamValue')).toHaveText('KIA');
  await expect(page.locator('#myTeamValue img.tl')).toHaveAttribute('src', 'icons/teams/kia.svg');
  await expect(page.locator('tr[data-team="kia"]')).toHaveClass(/\bmine\b/);
  await expect(page.locator('tr[data-team="kia"] .badge-mine')).toHaveText('내 팀');
  const card = page.locator('#myTeamCard');
  await expect(card).toContainText('KIA 타이거즈');
  await expect(card.locator('.rank')).toHaveText('4위');
  await expect(card).toContainText('70승 2무 62패');
  await expect(card).toContainText('9.0 경기 뒤');       // 1위와
  await expect(card).toContainText('6.0 경기 앞');       // 6위(NC)와 — 가을야구 안정권
  await expect(card).toContainText('10경기');            // 남은 경기 (144 - 134)
  await expect(card.locator('.tg-row')).toHaveCount(3);  // 최근 경기 3
  await expect(card.locator('.tg-row').first()).toContainText('KT전');
  expect(errors).toEqual([]);
});

test('1위 팀은 "2위와 … 앞", 5위 밖 팀은 "5위와 … 뒤"', async ({ page }) => {
  await open(page);
  await pick(page, 'kt');
  await expect(page.locator('#myTeamCard')).toContainText('2위와');
  await expect(page.locator('#myTeamCard')).toContainText('1.5 경기 앞');
  await pick(page, 'nc');
  const card = page.locator('#myTeamCard');
  await expect(card).toContainText('5위와');
  await expect(card).toContainText('4.5 경기 뒤');
  await expect(card.locator('.tile .v.down').first()).toBeVisible();
});

test('새로고침해도 유지되고, 깨진 저장값은 무시한다', async ({ page }) => {
  await open(page);
  await pick(page, 'lg');
  await page.reload();
  await expect(page.locator('#myTeamValue')).toHaveText('LG');
  await expect(page.locator('tr[data-team="lg"]')).toHaveClass(/\bmine\b/);

  await page.evaluate((k) => localStorage.setItem(k, '<script>없는팀'), KEY.myTeam);
  await page.reload();
  await expect(page.locator('#myTeamValue')).toHaveText('고르기');
  await expect(page.locator('#standingsTable tr.mine')).toHaveCount(0);
});

test('"선택 안 함" 으로 지운다', async ({ page }) => {
  await open(page);
  await pick(page, 'doosan');
  await page.locator('#myTeamBtn').click();
  await expect(page.locator('#teamSheetList button[data-team="doosan"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#teamSheetList button.none').click();
  await expect(page.locator('#myTeamValue')).toHaveText('고르기');
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY.myTeam)).toBeNull();
});

test('고르기 창: Esc·바깥 누르기로 닫히고, 닫히면 버튼으로 초점이 돌아온다', async ({ page }) => {
  await open(page);
  await page.locator('#myTeamBtn').click();
  await expect(page.locator('#teamSheet')).toBeVisible();
  /* 지금 고른 항목에 초점이 간다 — 아직 안 골랐으면 "선택 안 함" */
  await expect(page.locator('#teamSheetList button.none')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#teamSheetList button.none')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#teamSheet')).toBeHidden();
  await expect(page.locator('#myTeamBtn')).toBeFocused();

  await page.locator('#myTeamBtn').click();
  await page.locator('#sheetBackdrop').click({ position: { x: 10, y: 10 } });
  await expect(page.locator('#teamSheet')).toBeHidden();
  await expect(page.locator('#myTeamValue')).toHaveText('고르기');
});

test('첫 화면의 "내 팀 고르기" 버튼으로도 고른다', async ({ page }) => {
  await open(page);
  await page.locator('#pickTeamBtn').click();
  await page.locator('#teamSheetList button[data-team="hanwha"]').click();
  await expect(page.locator('#myTeamCard')).toContainText('한화 이글스');
  await expect(page.locator('#myTeamCard .rank')).toHaveText('9위');
});
