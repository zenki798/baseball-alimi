const { test, expect } = require('@playwright/test');
const { open, collectErrors, FIX } = require('./helpers');

/* 순위 화면 — 가짜 자료(fixtures/data.js): 10월 1일 기준, NC·롯데 공동 6위, kt 1위 확정 */

test.describe('순위표', () => {
  test('10개 구단이 순위대로, 숫자는 자료 그대로 (승률·게임차·공동 순위)', async ({ page }) => {
    const errors = collectErrors(page);
    const calls = await open(page);
    const rows = page.locator('#standingsTable tbody tr');
    await expect(rows).toHaveCount(10);
    expect(await rows.evaluateAll((trs) => trs.map((tr) => tr.getAttribute('data-team'))))
      .toEqual(['kt', 'samsung', 'lg', 'kia', 'doosan', 'nc', 'lotte', 'ssg', 'hanwha', 'kiwoom']);
    await expect(rows.nth(0).locator('td.rank')).toHaveText('1');
    await expect(rows.nth(0).locator('td.pct')).toHaveText('0.598');
    await expect(rows.nth(0).locator('td.gb')).toHaveText('-');
    await expect(rows.nth(1).locator('td.gb')).toHaveText('1.5');
    await expect(rows.nth(4).locator('td.gb')).toHaveText('10.5');
    await expect(page.locator('tr[data-team="nc"] td.rank')).toHaveText('6');
    await expect(page.locator('tr[data-team="lotte"] td.rank')).toHaveText('6');
    await expect(page.locator('tr[data-team="ssg"] td.rank')).toHaveText('8');
    /* 경기·승·패·무 */
    const kia = page.locator('tr[data-team="kia"] td');
    await expect(kia.nth(2)).toHaveText('134');
    await expect(kia.nth(3)).toHaveText('70');
    await expect(kia.nth(4)).toHaveText('62');
    await expect(kia.nth(5)).toHaveText('2');
    expect(errors).toEqual([]);
    expect(calls.unexpected).toEqual([]);
    expect(calls.photos).toEqual([]);   // 순위 화면은 사진을 받지 않는다
  });

  test('가을야구권(1~5위)·5위 경계·진출 여부 배지 (1위 확정·PS·탈락, 미정은 배지 없음)', async ({ page }) => {
    await open(page);
    const rows = page.locator('#standingsTable tbody tr');
    for (let i = 0; i < 10; i++) {
      if (i < 5) await expect(rows.nth(i)).toHaveClass(/\bps\b/);
      else await expect(rows.nth(i)).not.toHaveClass(/\bps\b/);
    }
    await expect(rows.nth(4)).toHaveClass(/\bcut\b/);
    await expect(page.locator('tr[data-team="kt"] .badge-st')).toHaveText('1위 확정');
    await expect(page.locator('tr[data-team="samsung"] .badge-st')).toHaveText('PS');
    await expect(page.locator('tr[data-team="ssg"] .badge-st')).toHaveText('탈락');
    await expect(page.locator('tr[data-team="nc"] .badge-st')).toHaveCount(0);
  });

  test('연속 기록과 최근 5경기 (KIA: 오래된 것부터 승·승·패)', async ({ page }) => {
    await open(page);
    const streak = (team) => page.locator(`tr[data-team="${team}"] td`).nth(8);
    await expect(streak('kt')).toHaveText('3연승');
    await expect(streak('ssg')).toHaveText('1무');
    await expect(streak('hanwha')).toHaveText('4연패');
    expect(await page.locator('tr[data-team="kia"] .form .res').allTextContents()).toEqual(['승', '승', '패']);
    /* 경기 결과가 없는 구단은 "-" */
    await expect(page.locator('tr[data-team="kt"] .form .res')).toHaveCount(3);
    await expect(page.locator('tr[data-team="ssg"] .form .res')).toHaveCount(1);
  });

  test('기준일과 출처: "10월 1일 (목) 경기까지", 위키백과 링크는 새 탭', async ({ page }) => {
    await open(page);
    await expect(page.locator('#standingsAsOf')).toHaveText('10월 1일 (목) 경기까지');
    const src = page.locator('a[href="https://en.wikipedia.org/wiki/2026_KBO_League_season"]');
    await expect(src).toHaveAttribute('target', '_blank');
    await expect(src).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(page.locator('#view-standings')).toContainText('CC BY-SA 4.0');
  });

  test('줄을 누르면 그 구단 화면으로 간다', async ({ page }) => {
    await open(page);
    await page.locator('tr[data-team="samsung"] td.pct').click();
    await expect(page).toHaveURL(/#team\/samsung$/);
    await expect(page.locator('#teamHero h2')).toHaveText('삼성 라이온즈');
  });
});

test.describe('경기 결과', () => {
  test('가장 최근 날짜의 경기: 원정 왼쪽·홈 오른쪽, 홈 팀 표시, 잠실 LG–두산은 홈을 쓰지 않는다', async ({ page }) => {
    await open(page);
    await expect(page.locator('#gamesDay')).toHaveText('10월 1일 (목)');
    await expect(page.locator('#gamesList .game')).toHaveCount(5);
    const kia = page.locator('.game[data-game="2026-10-01-kia-kt"]');
    await expect(kia.locator('.side').first()).toContainText('KT');      // kt 가 원정
    await expect(kia.locator('.side').last()).toContainText('KIA');      // KIA 홈 (광주)
    await expect(kia.locator('.score')).toHaveText('5 : 3');
    await expect(kia.locator('.side').first()).toHaveClass(/win/);
    await expect(kia.locator('.where')).toHaveText('광주 · KIA 홈');
    const derby = page.locator('.game[data-game="2026-10-01-doosan-lg"]');
    await expect(derby.locator('.where')).toHaveText('잠실 · 무승부');
    await expect(derby.locator('.score')).toHaveText('4 : 4');
  });

  test('날짜 넘기기: ‹ 이전 날짜, 끝에서는 버튼이 꺼진다', async ({ page }) => {
    await open(page);
    const prev = page.getByRole('button', { name: '이전 날짜' });
    const next = page.getByRole('button', { name: '다음 날짜' });
    await expect(next).toBeDisabled();
    await prev.click();
    await expect(page.locator('#gamesDay')).toHaveText('9월 30일 (수)');
    await expect(page.locator('#gamesList .game')).toHaveCount(3);
    await prev.click();
    await expect(page.locator('#gamesDay')).toHaveText('9월 29일 (화)');
    await expect(page.locator('#gamesList .game')).toHaveCount(1);
    await expect(page.getByRole('button', { name: '이전 날짜' })).toBeDisabled();
    await page.getByRole('button', { name: '다음 날짜' }).click();
    await expect(page.locator('#gamesDay')).toHaveText('9월 30일 (수)');
  });
});

test.describe('자료가 없거나 깨졌을 때', () => {
  test('자료 파일이 없어도 네 화면이 모두 뜨고 안내가 나온다', async ({ page }) => {
    const errors = collectErrors(page, { allow404: true });
    await open(page, { live: '404', players: '404' });
    await expect(page.locator('html')).toHaveAttribute('data-data', 'none');
    await expect(page.locator('#view-standings')).toContainText('순위 자료가 아직 없습니다');
    await expect(page.locator('#gamesCard')).toContainText('아직 모은 경기 결과가 없습니다');
    await expect(page.locator('#freshness')).toHaveText('아직 수집된 자료가 없습니다.');
    await page.goto('/#team/kia');
    await expect(page.locator('#teamHero')).toContainText('순위 자료가 아직 없습니다');
    await expect(page.locator('#rosterCard')).toContainText('선수 명단이 아직 없습니다');
    await page.goto('/#players');
    await expect(page.locator('#view-players')).toContainText('선수 명단이 아직 없습니다');
    await page.goto('/#news');
    await expect(page.locator('#view-news')).toContainText('뉴스 자료가 아직 없습니다');
    expect(errors).toEqual([]);
  });

  test('자료 파일이 깨져 있어도(문법 오류) 화면은 살아 있다', async ({ page }) => {
    const errors = collectErrors(page);
    await open(page, { liveScript: 'window.BaseballLive = { "version": 1, 깨진' });
    await expect(page.locator('#view-standings')).toContainText('순위 자료가 아직 없습니다');
    await expect(page.locator('#myTeamBtn')).toBeVisible();
    /* 깨진 자료 파일의 문법 오류 하나만 난다 — 앱 코드는 예외 없이 돈다 */
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/SyntaxError|Unexpected|Invalid/);
  });
});

test.describe('바닥글', () => {
  test('마지막 수집 시각(한국 시각)·출처·라이선스·비공식 안내', async ({ page }) => {
    await open(page);
    await expect(page.locator('#freshness')).toHaveText('마지막 수집: 10월 2일 11:50 (10분 전)');
    await expect(page.locator('#freshness')).not.toHaveClass(/warn/);
    const foot = page.locator('#foot');
    await expect(foot).toContainText('CC BY-SA 4.0');
    await expect(foot).toContainText('테스트일보·가상스포츠·예시통신 RSS');
    await expect(foot).toContainText('KBO·각 구단과 관계없는 개인 프로젝트');
  });

  test('수집이 6시간 넘게 멈추면 경고한다', async ({ page }) => {
    const live = FIX.buildLive();
    live.generatedAt = '2026-10-01T19:00:00.000Z';   // 8시간 전
    await open(page, { live });
    await expect(page.locator('#freshness')).toHaveClass(/warn/);
    await expect(page.locator('#freshness')).toContainText('자료 갱신이 늦어지고 있습니다');
  });
});
