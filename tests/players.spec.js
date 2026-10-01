const { test, expect } = require('@playwright/test');
const { open, collectErrors, playerId } = require('./helpers');

/* 선수 — 가짜 자료: 구단마다 26명(260명). 이름이 붙은 가상 선수: KIA 가람(투수 11, 주장, 사진 있음)·나래(내야 7)·다온(외야 124, 문서 없음), LG 나래(포수 27) */

const PHOTO = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/aa/Garam.jpg/330px-Garam.jpg';
const LARGE = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/aa/Garam.jpg/960px-Garam.jpg';

test.describe('선수 찾기', () => {
  test('전체 수, 이름·초성·등번호로 찾기, 없으면 안내', async ({ page }) => {
    const errors = collectErrors(page);
    await open(page, { hash: '#players' });
    const cards = page.locator('#peopleList .person-card');
    await expect(page.locator('#playerCount')).toHaveText('선수 260명');
    await page.locator('#playerSearch').fill('가람');
    await expect(cards).toHaveCount(1);
    await expect(page.locator('#playerCount')).toHaveText('선수 260명 중 1명');
    await expect(cards.first()).toContainText('KIA · 투수 · 만 24세 · 우투좌타');
    await page.locator('#playerSearch').fill('ㄱㄹ');
    await expect(cards).toHaveCount(1);
    await expect(cards.first().locator('.nm')).toContainText('가람');
    await page.locator('#playerSearch').fill('7');
    await expect(cards).toHaveCount(11);   // 구단마다 투수 7번 + KIA 나래 7번
    expect(await cards.locator('.no').allTextContents()).toEqual(Array(11).fill('7'));
    await page.locator('#playerSearch').fill('없는선수');
    await expect(cards).toHaveCount(0);
    await expect(page.locator('#peopleList')).toContainText('찾는 선수가 없습니다');
    expect(errors).toEqual([]);
  });

  test('구단·포지션 거르기와 함께, 같은 이름은 구단 순서대로', async ({ page }) => {
    await open(page, { hash: '#players' });
    const cards = page.locator('#peopleList .person-card');
    await page.locator('#playerSearch').fill('나래');
    await expect(cards).toHaveCount(2);
    expect(await cards.locator('.sub').allTextContents()).toEqual([expect.stringContaining('KIA'), expect.stringContaining('LG')]);
    await page.locator('#playerTeam').selectOption('lg');
    await expect(cards).toHaveCount(1);
    await page.locator('#playerSearch').fill('');
    await expect(page.locator('#playerCount')).toHaveText('선수 260명 중 26명');
    await page.locator('#playerPos button[data-pos="C"]').click();
    await expect(cards).toHaveCount(3);
    await expect(page.locator('#playerPos button[data-pos="C"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('"더 보기"는 60명씩 더 그린다', async ({ page }) => {
    await open(page, { hash: '#players' });
    const cards = page.locator('#peopleList .person-card');
    await expect(cards).toHaveCount(60);
    for (const n of [120, 180, 240, 260]) {
      await page.locator('#morePeople').click();
      await expect(cards).toHaveCount(n);
    }
    await expect(page.locator('#morePeople')).toBeHidden();
  });

  test('팀 화면 링크(#players?team=nc)로 열면 그 구단만', async ({ page }) => {
    await open(page, { hash: '#players?team=nc' });
    await expect(page.locator('#playerTeam')).toHaveValue('nc');
    await expect(page.locator('#playerCount')).toHaveText('선수 260명 중 26명');
  });

  test('목록 화면에서는 사진을 받지 않는다 (상세에서만)', async ({ page }) => {
    const calls = await open(page, { hash: '#players' });
    await page.locator('#playerSearch').fill('가람');
    await expect(page.locator('#peopleList .person-card')).toHaveCount(1);
    expect(calls.photos).toEqual([]);
  });
});

test.describe('선수 상세', () => {
  test('등번호·구단·포지션·프로필 (만 나이는 생일 하루 전이라 24세)', async ({ page }) => {
    const errors = collectErrors(page);
    const calls = await open(page, { hash: '#player/' + playerId('가람') });
    await expect(page.locator('#personName')).toHaveText('가람');
    const hero = page.locator('#personHero');
    await expect(hero.locator('.sub')).toContainText('KIA 타이거즈');
    await expect(hero.locator('.sub')).toContainText('· 투수');
    await expect(hero.locator('.tag.cap')).toHaveText('주장');
    const facts = page.locator('#personFacts');
    await expect(facts).toContainText('2001년 10월 3일');
    await expect(facts).toContainText('만 24세');
    await expect(facts).toContainText('우투좌타');
    await expect(facts).toContainText('185cm · 88kg');
    await expect(facts).toContainText('2020년 1차 지명(KIA 타이거즈)');
    await expect(page.locator('#view-players')).toContainText('테스트 상무 (2022년 ~ 2023년)');
    await expect(page.locator('#view-players')).toContainText('2025년 테스트상');
    /* 프로필 출처 문단의 링크 (기록 카드에도 같은 문서 링크가 있다) */
    const wiki = page.locator('#view-players .note.box a', { hasText: '위키백과 「가람 (야구 선수)」' });
    await expect(wiki).toHaveAttribute('href', 'https://ko.wikipedia.org/wiki/' + encodeURIComponent('가람_(야구_선수)'));
    await expect(wiki).toHaveAttribute('rel', 'noopener noreferrer');
    expect(errors).toEqual([]);
    expect(calls.unexpected).toEqual([]);
  });

  test('얼굴 사진과 저작자 표기 (사진·작성자·라이선스·원본 링크)', async ({ page }) => {
    const calls = await open(page, { hash: '#player/' + playerId('가람') });
    await expect(page.locator('#personPhoto')).toHaveAttribute('src', PHOTO);
    await expect(page.locator('#personPhoto')).toHaveAttribute('alt', '가람 사진 — 가람(2025년)');
    await expect(page.locator('#personHero .photo .no-badge')).toHaveText('11');
    await expect(page.locator('#photoCredit')).toHaveText('사진: 테스트 작가 · CC BY 3.0 · 위키미디어 공용 · 가람(2025년)');
    await expect(page.locator('#photoCredit a', { hasText: 'CC BY 3.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/3.0');
    await expect(page.locator('#photoCredit a', { hasText: '위키미디어 공용' })).toHaveAttribute('href', 'https://commons.wikimedia.org/wiki/File:Garam.jpg');
    await expect.poll(() => calls.photos).toContain(PHOTO);
  });

  test('사진을 누르면 크게 — 큰 사진으로 바뀌고 저작자 표기도, Esc·뒤로 가기·사진 누르기로 닫힌다', async ({ page }) => {
    const calls = await open(page, { hash: '#player/' + playerId('가람') });
    const box = page.locator('#lightbox');
    await page.locator('#photoZoom').click();
    await expect(box).toBeVisible();
    await expect(page.locator('#lightboxImg')).toHaveAttribute('src', LARGE);
    await expect(page.locator('#lightboxCredit')).toHaveText('사진: 테스트 작가 · CC BY 3.0 · 위키미디어 공용');
    await expect(page.locator('#lightboxClose')).toBeFocused();
    expect(calls.photos).toContain(LARGE);

    await page.keyboard.press('Escape');
    await expect(box).toBeHidden();
    await expect(page.locator('#photoZoom')).toBeFocused();

    /* 휴대폰 뒤로 가기: 사진만 닫히고 선수 화면에 남는다 */
    await page.locator('#photoZoom').click();
    await expect(box).toBeVisible();
    await page.goBack();
    await expect(box).toBeHidden();
    await expect(page).toHaveURL(new RegExp('#player/' + playerId('가람') + '$'));
    await expect(page.locator('#personName')).toHaveText('가람');

    await page.locator('#photoZoom').click();
    await page.locator('#lightboxImg').click();
    await expect(box).toBeHidden();
    /* ✕ 로 닫아도 선수 화면 그대로 — 열 때 더한 기록을 닫을 때 되돌린다 */
    await page.locator('#photoZoom').click();
    await page.locator('#lightboxClose').click();
    await expect(box).toBeHidden();
    await expect(page.locator('#personName')).toHaveText('가람');
    await expect(page).toHaveURL(new RegExp('#player/' + playerId('가람') + '$'));
  });

  test('사진을 못 받으면 등번호로 바뀌고 표기도 빠진다', async ({ page }) => {
    await open(page, { hash: '#player/' + playerId('가람'), failPhotos: true });
    await expect(page.locator('#personHero .big-no')).toHaveText('11');
    await expect(page.locator('#personPhoto')).toHaveCount(0);
    await expect(page.locator('#photoCredit')).toHaveCount(0);
  });

  test('사진이 없는 선수는 등번호와 안내, 위키 문서가 없는 선수는 명단 정보만', async ({ page }) => {
    await open(page, { hash: '#player/' + playerId('나래', 'kia') });
    await expect(page.locator('#personHero .big-no')).toHaveText('7');
    await expect(page.locator('#photoZoom')).toHaveCount(0);
    await expect(page.locator('#view-players')).toContainText('자유 이용 사진이 없는 선수는 사진 대신 등번호');
    await page.goto('/#player/' + playerId('다온'));
    await expect(page.locator('#personHero .big-no')).toHaveText('124');
    await expect(page.locator('#personHero .tag')).toHaveText('육성선수');
    await expect(page.locator('#personFacts')).toHaveCount(0);
    await expect(page.locator('#view-players')).toContainText('위키백과에 이 선수의 문서(정보 상자)가 아직 없어');
  });

  test('관련 뉴스: 이름이 나온 기사만, 동명이인(나래)은 소속 구단도 함께 나와야 한다', async ({ page }) => {
    await open(page, { hash: '#player/' + playerId('가람') });
    expect(await page.locator('#personNews .news-item .t').allTextContents()).toEqual(['가람, 결승타로 KIA 3연승 이끌어']);
    await page.goto('/#player/' + playerId('나래', 'kia'));
    expect(await page.locator('#personNews .news-item .t').allTextContents()).toEqual(['KIA 나래, 호수비로 실점 막아']);
    await page.goto('/#player/' + playerId('나래', 'lg'));
    expect(await page.locator('#personNews .news-item .t').allTextContents()).toEqual(['LG 나래, 시즌 첫 홈런']);
  });

  test('없는 선수 주소는 안내와 목록 링크', async ({ page }) => {
    await open(page, { hash: '#player/nope-123' });
    await expect(page.locator('#view-players')).toContainText('선수를 찾을 수 없습니다');
    await page.locator('#view-players .back').click();
    await expect(page).toHaveURL(/#players$/);
  });
});
