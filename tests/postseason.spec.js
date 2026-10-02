const { test, expect } = require('@playwright/test');
const { open, collectErrors, horizontalOverflow, FIX } = require('./helpers');

/*
 * 가을야구 화면 — 정규시즌 중(레이스) · 정규시즌 끝(대진) · 진행 중 · 우승 · 다음 해 겨울.
 * 가짜 자료: 정규시즌 중은 fixtures/data.js 기본(kt 1위 확정, 4팀 진출 확정, 5위 두산을 NC·롯데가 쫓음),
 * 정규시즌 뒤는 buildLivePs('set'|'live'|'done') — 가상 경기다.
 */

const ids = (loc) => loc.evaluateAll((els) => els.map((e) => e.getAttribute('data-team') || e.getAttribute('data-round')));

test.describe('정규시즌 중 — 가을야구 레이스', () => {
  test('1~5위 자리와 시작 라운드, 확정·경쟁, 최종 순위로 가능한 범위, 진출선 밖 경쟁 팀과 탈락 팀', async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    await open(page);
    const card = page.locator('#psCard');
    await expect(card).toHaveAttribute('data-phase', 'race');
    await expect(card.locator('h2')).toHaveText('가을야구 레이스');
    await expect(page.locator('#psPhase')).toHaveText('진출 확정 4팀 · 남은 자리 1');
    const slots = page.locator('#psLadder > li');
    expect(await ids(slots)).toEqual(['kt', 'samsung', 'lg', 'kia', 'doosan']);
    await expect(slots.nth(0).locator('.slot-sub')).toHaveText('한국시리즈 직행 · 1위 확정');
    await expect(slots.nth(3).locator('.slot-sub')).toHaveText('와일드카드 · 1승 안고 홈 · 2~5위 가능');
    await expect(slots.nth(4).locator('.slot-sub')).toHaveText('와일드카드 · 2승 필요 · 2~8위 가능');
    expect(await slots.locator('.ps-chip').allTextContents()).toEqual(['확정', '확정', '확정', '확정', '경쟁']);
    expect(await ids(page.locator('#psChasers > li'))).toEqual(['nc', 'lotte']);
    await expect(page.locator('#psChasers > li[data-team="nc"] .slot-sub')).toHaveText('5위와 4.5 경기 뒤 · 남은 10경기 · 최고 3위');
    await expect(page.locator('#psOut')).toHaveText('탈락SSG · 한화 · 키움');
    /* 휴대폰에서 정규시즌 중에는 순위표가 먼저 */
    const ps = await card.boundingBox();
    const table = await page.locator('#standingsTable').boundingBox();
    if (testInfo.project.name === 'mobile-chromium') expect(ps.y).toBeGreaterThan(table.y);
    else expect(ps.x).toBeGreaterThan(table.x + table.width - 1);
    expect(errors).toEqual([]);
  });

  test('내 팀 한 줄: 경쟁 중이면 5위와의 거리·남은 경기, 확정·탈락이면 그 말', async ({ page }) => {
    await open(page, { myTeam: 'nc' });
    await expect(page.locator('#myTeamPs')).toHaveText('가을야구 경쟁 중 · 5위와 4.5 경기 뒤 · 남은 10경기');
    await expect(page.locator('#psChasers > li[data-team="nc"]')).toHaveClass(/\bmine\b/);
    await page.goto('/#team/kt');
    await expect(page.locator('#teamPs')).toHaveText('가을야구 진출 확정 · 정규시즌 1위 확정 (한국시리즈 직행)');
    await page.goto('/#team/doosan');
    await expect(page.locator('#teamPs')).toHaveText('가을야구 경쟁 중 · 6위와 4.5 경기 앞 · 남은 10경기');
  });
});

test.describe('정규시즌 뒤 — 대진', () => {
  test('가을야구 전: 최종 순위로 짠 대진, 순위표는 "최종 순위"와 시드 배지, 휴대폰에서는 대진이 순위표 위', async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    await open(page, { live: FIX.buildLivePs('set'), myTeam: 'kia', now: '2026-10-05T03:00:00Z' });
    const card = page.locator('#psCard');
    await expect(card).toHaveAttribute('data-phase', 'set');
    await expect(card.locator('h2')).toHaveText('2026 가을야구');
    await expect(page.locator('#psPhase')).toHaveText('정규시즌 끝 · 와일드카드 결정전부터');
    const rounds = page.locator('#psBracket > li');
    expect(await ids(rounds)).toEqual(['wc', 'spo', 'po', 'ks']);
    await expect(rounds.nth(0)).toHaveClass(/\bcurrent\b/);
    expect(await rounds.nth(0).locator('.ps-side').evaluateAll((els) => els.map((e) => e.textContent))).toEqual(['4위KIA', '5위두산']);
    await expect(rounds.nth(0).locator('.ps-round-head .meta')).toHaveText('최대 2경기 · 4위 1승 안고 시작');
    await expect(rounds.nth(0).locator('.ps-sum')).toHaveText('KIA(4위)는 한 번만 이기거나 비겨도, 두산(5위)는 두 번 다 이겨야 올라갑니다');
    await expect(rounds.nth(1).locator('.ps-round-head .meta')).toHaveText('5전 3선승');
    await expect(rounds.nth(1).locator('.ps-side').nth(1)).toHaveText('WC 승자');
    await expect(rounds.nth(3).locator('.ps-round-head .meta')).toHaveText('7전 4선승');
    await expect(rounds.nth(3).locator('.ps-side').nth(0)).toHaveText('1위KT');
    /* 순위표 */
    await expect(page.locator('#view-standings h2', { hasText: '정규시즌 최종 순위' })).toHaveText('2026 정규시즌 최종 순위');
    await expect(page.locator('#standingsAsOf')).toHaveText('144경기 모두 끝남');
    const badge = (t) => page.locator(`tr[data-team="${t}"] .badge-st`);
    for (const [t, text] of [['kt', 'KS 직행'], ['samsung', 'PO 직행'], ['lg', '준PO'], ['kia', 'WC'], ['doosan', 'WC'], ['nc', '탈락']]) await expect(badge(t), t).toHaveText(text);
    /* 내 팀: 시작 라운드와 상대, 끝난 시즌에는 진출선까지·남은 경기 칸을 내지 않는다 */
    await expect(page.locator('#myTeamPs')).toHaveText('정규시즌 4위 · 와일드카드 결정전 · 상대 두산');
    await expect(page.locator('#myTeamCard')).not.toContainText('남은 경기');
    await expect(page.locator('#myTeamCard')).not.toContainText('가을야구 안정권');
    const ps = await card.boundingBox();
    const table = await page.locator('#standingsTable').boundingBox();
    if (testInfo.project.name === 'mobile-chromium') expect(ps.y).toBeLessThan(table.y);
    else expect(ps.x).toBeGreaterThan(table.x + table.width - 1);
    expect(errors).toEqual([]);
  });

  test('진행 중: 끝난 라운드(접힌 경기)·진행 중 라운드(구장·투수)·남은 라운드, 내 팀·탈락 팀 한 줄', async ({ page }) => {
    const errors = collectErrors(page);
    await open(page, { live: FIX.buildLivePs('live'), myTeam: 'doosan', now: '2026-10-10T14:00:00Z' });
    await expect(page.locator('#psCard')).toHaveAttribute('data-phase', 'ps');
    await expect(page.locator('#psPhase')).toHaveText('준플레이오프 진행 중');
    const wc = page.locator('#psBracket > li[data-round="wc"]');
    await expect(wc).toHaveAttribute('data-state', 'done');
    await expect(wc.locator('.ps-state')).toHaveText('끝');
    await expect(wc.locator('.ps-sum')).toHaveText('두산 진출 (2승 0패)');
    await expect(wc.locator('.ps-side.win .nm')).toHaveText('두산');
    await expect(wc.locator('.ps-side.lose .nm')).toHaveText('KIA');
    await expect(wc.locator('details.ps-more summary')).toHaveText('경기 결과 2경기');
    await expect(wc.locator('.ps-game').first()).toBeHidden();
    const spo = page.locator('#psBracket > li[data-round="spo"]');
    await expect(spo).toHaveClass(/\bcurrent\b/);
    await expect(spo.locator('.ps-state')).toHaveText('진행 중');
    await expect(spo.locator('.ps-sum')).toHaveText('1승 1패 동률');
    await expect(spo.locator('.ps-side .w')).toHaveText(['1', '1']);
    const g1 = spo.locator('.ps-game').first();
    await expect(g1.locator('.n')).toHaveText('1차전');
    await expect(g1.locator('.d')).toHaveText('10/9');
    await expect(g1.locator('.sc .t')).toHaveText(['두산', 'LG']);   // 원정 왼쪽, 홈 오른쪽
    await expect(g1.locator('.sc .t.win')).toHaveText('LG');
    await expect(g1.locator('.sc b')).toHaveText('2 : 6');
    await expect(g1.locator('.sub')).toHaveText('잠실야구장 · 승 LG투수1 · 패 두산투수4');
    await expect(page.locator('#psBracket > li[data-round="po"] .ps-side').nth(1)).toHaveText('준PO 승자');
    await expect(page.locator('#psBracket > li[data-round="po"]')).toHaveAttribute('data-state', 'wait');
    await expect(page.locator('#myTeamPs')).toHaveText('준플레이오프 진행 중 · LG 상대 1승 1패');
    await expect(page.locator('#psBracket .ps-side.mine')).toHaveCount(2);   // 와일드카드·준PO 두 곳의 두산
    await page.goto('/#team/kia');
    await expect(page.locator('#teamPs')).toHaveText('와일드카드 결정전에서 탈락 (두산 상대 0승 2패)');
    await page.goto('/#team/samsung');
    await expect(page.locator('#teamPs')).toHaveText('정규시즌 2위 · 플레이오프 · 준플레이오프 승자를 기다립니다');
    expect(errors).toEqual([]);
  });

  test('우승: 우승 배너(상대·승패·MVP), 순위표의 "우승" 배지, 준우승·우승 한 줄, 와일드카드 어드밴티지 표시', async ({ page }) => {
    const errors = collectErrors(page);
    await open(page, { live: FIX.buildLivePs('done'), myTeam: 'samsung', now: '2026-11-01T03:00:00Z' });
    await expect(page.locator('#psCard')).toHaveAttribute('data-phase', 'done');
    await expect(page.locator('#psPhase')).toHaveText('우승 KT');
    const champ = page.locator('#psChampion');
    await expect(champ.locator('.k')).toHaveText('2026 한국시리즈 우승');
    await expect(champ.locator('.v')).toHaveText('kt wiz');
    await expect(champ.locator('.s')).toHaveText('삼성 상대 4승 2패 · 시리즈 MVP KT내야수2');
    await expect(page.locator('tr[data-team="kt"] .badge-st')).toHaveText('우승');
    await expect(page.locator('tr[data-team="samsung"] .badge-st')).toHaveText('PO 직행');
    await expect(page.locator('#psBracket > li[data-round="ks"] .ps-sum')).toHaveText('KT 우승 (4승 2패)');
    await expect(page.locator('#psBracket > li[data-round="wc"] .ps-sum')).toHaveText('KIA 진출 (1승 0패 · 1승 어드밴티지)');
    await expect(page.locator('#psBracket > li.current')).toHaveCount(0);
    await expect(page.locator('#myTeamPs')).toHaveText('2026 한국시리즈 준우승 (KT 상대 2승 4패)');
    await page.goto('/#team/kt');
    await expect(page.locator('#teamPs')).toHaveText('2026 한국시리즈 우승! (삼성 상대 4승 2패)');
    await page.goto('/#team/nc');
    await expect(page.locator('#teamPs')).toHaveText('2026 가을야구에 나가지 못했습니다 (정규시즌 6위)');
    expect(errors).toEqual([]);
  });

  test('출처: 위키백과 문서 링크(새 탭)와 연합뉴스 전적', async ({ page }) => {
    await open(page, { live: FIX.buildLivePs('done'), now: '2026-11-01T03:00:00Z' });
    const link = page.locator('#psCard .note a', { hasText: '2026년 KBO 포스트시즌' });
    await expect(link).toHaveAttribute('href', /^https:\/\/ko\.wikipedia\.org\/wiki\//);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(page.locator('#psCard')).toContainText('연합뉴스 전적 기사 제목');
    await expect(page.locator('#foot')).toContainText('가을야구 대진 — 위키백과(한국어)');
  });

  test('다음 해 겨울(새 시즌 개막 전): 지난 시즌 결과를 그대로 보여 주고, 새 시즌은 개막 뒤 저절로 바뀐다고 알린다', async ({ page }) => {
    await open(page, { live: FIX.buildLivePs('done'), now: '2027-01-15T03:00:00Z' });
    await expect(page.locator('#seasonLabel')).toHaveText('2026 KBO');
    await expect(page.locator('#psChampion')).toBeVisible();
    await expect(page.locator('#offseasonNote')).toHaveText('2027 시즌 순위는 개막 뒤 첫 경기 결과가 나오면 저절로 바뀝니다. 그때까지 2026 시즌 기록을 보여 드립니다.');
  });

  test('대진의 글자(투수·MVP·구장)는 글자로만 들어간다', async ({ page }) => {
    const live = FIX.buildLivePs('done');
    live.postseason.mvp = '<img src=x onerror="window.__xss=1">';
    live.postseason.rounds[3].games[0].venue = '<b>구장</b>';
    await open(page, { live, now: '2026-11-01T03:00:00Z' });
    await expect(page.locator('#psChampion .s')).toContainText('<img src=x');
    const ks = page.locator('#psBracket > li[data-round="ks"]');
    await ks.locator('details summary').click();
    await expect(ks.locator('.ps-game').first().locator('.sub')).toContainText('<b>구장</b>');
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    await expect(page.locator('#psCard img:not(.tl)')).toHaveCount(0);
    await expect(page.locator('#psCard b', { hasText: '구장' })).toHaveCount(0);
  });

  test('대진 자료가 망가져 있어도(모르는 구단·라운드 빠짐) 화면은 뜬다', async ({ page }) => {
    const errors = collectErrors(page);
    const live = FIX.buildLivePs('live');
    live.postseason.rounds[0].sides[0].team = 'nope';
    live.postseason.rounds.pop();
    live.postseason.rounds[1].games.push({ n: 3, date: '2026-10-11', t1: 'nope', s1: 1, t2: 'lg', s2: 0 });
    await open(page, { live, now: '2026-10-10T14:00:00Z' });
    await expect(page.locator('#psBracket > li')).toHaveCount(4);
    await expect(page.locator('#psBracket > li[data-round="spo"] .ps-game')).toHaveCount(2);
    expect(errors).toEqual([]);
  });
});

for (const kind of ['race', 'set', 'live', 'done']) {
  test(`가로로 넘치지 않는다 — 가을야구 ${kind} (320px 포함)`, async ({ page }) => {
    await open(page, { live: kind === 'race' ? undefined : FIX.buildLivePs(kind), myTeam: 'doosan', now: kind === 'race' ? undefined : '2026-10-10T14:00:00Z' });
    await expect(page.locator('#psCard')).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    await page.setViewportSize({ width: 320, height: 640 });
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  });
}
