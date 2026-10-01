const { test, expect } = require('@playwright/test');
const { open, collectErrors, playerId } = require('./helpers');

/* 팀 화면 — 가짜 자료: KIA 4위 70승 2무 62패, 최근 3경기(패·승·승), 선수 26명(투수 12·포수 3·내야수 6·외야수 5) */

test('구단 칩 10개(엠블럼), 고른 구단 머리: 이름·연고지·구장·순위·성적', async ({ page }) => {
  const errors = collectErrors(page);
  const calls = await open(page, { hash: '#team/kia' });
  await expect(page.locator('#teamChips .chip')).toHaveCount(10);
  await expect(page.locator('#teamChips .chip[aria-current="page"]')).toHaveText('KIA');
  await expect(page.locator('#teamChips .chip img.tl')).toHaveCount(9);   // 한화는 작은 자리에서 색 배지
  const hero = page.locator('#teamHero');
  await expect(hero.locator('h2')).toHaveText('KIA 타이거즈');
  await expect(hero.locator('img.tl')).toHaveAttribute('src', 'icons/teams/kia.svg');
  await expect(hero.locator('.sub')).toHaveText('광주 · 광주-기아 챔피언스 필드');
  await expect(hero.locator('.rank-pill')).toHaveText('4위');
  await expect(hero).toContainText('70승 2무 62패');
  await expect(hero).toContainText('0.530');
  await expect(hero).toContainText('9.0 경기 뒤');
  await expect(hero).toContainText('6.0 경기 앞');
  await expect(hero).toContainText('가을야구(포스트시즌) 진출이 확정됐습니다');
  expect(errors).toEqual([]);
  expect(calls.unexpected).toEqual([]);
});

test('홈·원정 성적, 탈락 팀 안내, 한화는 큰 글자 로고', async ({ page }) => {
  await open(page, { hash: '#team/samsung' });
  await expect(page.locator('#teamHero .split')).toContainText('39승 2무 27패');
  await expect(page.locator('#teamHero .split')).toContainText('38승 1무 27패');
  await page.goto('/#team/hanwha');
  await expect(page.locator('#teamHero')).toContainText('가을야구(포스트시즌) 진출이 무산됐습니다');
  await expect(page.locator('#teamHero img.tl.wide')).toHaveAttribute('src', 'icons/teams/hanwha.png');
});

test('칩을 누르면 다른 구단으로, #teams 만 열면 1위 구단(내 팀이 있으면 내 팀)', async ({ page }) => {
  await open(page, { hash: '#teams' });
  await expect(page.locator('#teamHero h2')).toHaveText('kt wiz');
  await page.locator('#teamChips .chip', { hasText: '삼성' }).click();
  await expect(page).toHaveURL(/#team\/samsung$/);
  await expect(page.locator('#teamHero h2')).toHaveText('삼성 라이온즈');
});

test('#teams 는 내 팀이 있으면 내 팀', async ({ page }) => {
  await open(page, { hash: '#teams', myTeam: 'lg' });
  await expect(page.locator('#teamHero h2')).toHaveText('LG 트윈스');
});

test('최근 경기: 최신순, 승패·상대·홈·점수', async ({ page }) => {
  await open(page, { hash: '#team/kia' });
  const rows = page.locator('#recentList .tg-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0).locator('.d')).toHaveText('10/1');
  await expect(rows.nth(0).locator('.res')).toHaveText('패');
  await expect(rows.nth(0).locator('.vs')).toContainText('KT전');
  await expect(rows.nth(0).locator('.venue')).toHaveText('홈');
  await expect(rows.nth(0).locator('.sc')).toHaveText('3 : 5');
  await expect(rows.nth(1).locator('.res')).toHaveText('승');
  await expect(rows.nth(2).locator('.sc')).toHaveText('9 : 8');
});

test('선수단: 포지션별 수, 누르면 바뀌고, 주장·육성 표시, 선수를 누르면 상세', async ({ page }) => {
  await open(page, { hash: '#team/kia' });
  const seg = page.locator('#rosterCard .seg button');
  expect(await seg.allTextContents()).toEqual(['투수 12', '포수 3', '내야수 6', '외야수 5']);
  await expect(seg.first()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#rosterGrid .person-btn')).toHaveCount(12);
  await expect(page.locator('#rosterGrid .person-btn', { hasText: '가람' }).locator('.tag.cap')).toHaveText('주장');
  await seg.nth(1).click();
  await expect(page.locator('#rosterGrid .person-btn')).toHaveCount(3);
  await seg.nth(3).click();
  await expect(page.locator('#rosterGrid .person-btn', { hasText: '다온' }).locator('.tag')).toHaveText('육성');
  await seg.nth(0).click();
  await page.locator('#rosterGrid .person-btn', { hasText: '가람' }).click();
  await expect(page).toHaveURL(new RegExp('#player/' + playerId('가람') + '$'));
  await expect(page.locator('#personName')).toHaveText('가람');
});

test('코칭스태프·군 복무, 감독 이름을 누르면 감독 화면', async ({ page }) => {
  await open(page, { hash: '#team/kia' });
  await expect(page.locator('#managerLink')).toHaveText('KIA감독');
  await expect(page.locator('#view-teams .mgr-line')).toContainText('No.70');
  await expect(page.locator('#view-teams .staff .p', { hasText: 'KIA수석코치' }).locator('.role')).toHaveText('수석');
  await expect(page.locator('#rosterCard details summary')).toHaveText('군 복무 중 2명');
  await page.locator('#managerLink').click();
  await expect(page.locator('#personName')).toHaveText('KIA감독');
  await expect(page.locator('#personHero .sub')).toContainText('감독');
  await expect(page.locator('.back')).toHaveText('← KIA 팀 화면');
  await expect(page.locator('#personFacts')).toContainText('만 51세');
});

test('팀 뉴스: 그 구단 기사만, "더 보기"는 뉴스 화면의 구단 거르기로', async ({ page }) => {
  await open(page, { hash: '#team/kia' });
  const card = page.locator('#view-teams section.card', { hasText: 'KIA 뉴스' });
  expect(await card.locator('.news-item .t').allTextContents()).toEqual(['가람, 결승타로 KIA 3연승 이끌어', 'KIA 나래, 호수비로 실점 막아']);
  await card.locator('a.more').click();
  await expect(page).toHaveURL(/#news\?team=kia$/);
  await expect(page.locator('#newsTeam')).toHaveValue('kia');
  await expect(page.locator('#newsCount')).toHaveText('KIA — 기사 2건');
});

test('명단 출처는 한국어 위키백과 틀 문서', async ({ page }) => {
  await open(page, { hash: '#team/kia' });
  const link = page.locator('#rosterCard a', { hasText: '틀:KIA 타이거즈 명단' });
  await expect(link).toHaveAttribute('href', /^https:\/\/ko\.wikipedia\.org\/wiki\//);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(page.locator('#rosterCard')).toContainText('구단 소속 선수 전체');
});
