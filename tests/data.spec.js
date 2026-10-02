const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const P = require('../scripts/parsers.js');
const C = require('../scripts/collect.js');
const T = require('../teams.js');
const { open, FIX } = require('./helpers');

/*
 * 자료 계약 (AGENTS.md 5절) — 화면(store.js)과 수집기(collect.js)가 같은 모양을 쓰는지.
 * 저장소에 들어 있는 실제 자료 파일도 여기서 검사한다. GitHub Actions 에서는 방금 모은 자료로 바꾼 뒤
 * 이 검사를 돌리므로, 망가진 자료는 배포되지 않는다.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (f, name) => C.parseDataScript(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'), name);

test('저장소의 실제 자료 파일이 계약을 지킨다 (live.js·players.js·stats.js)', () => {
  const live = read('live.js', 'BaseballLive');
  const players = read('players.js', 'BaseballPlayers');
  const stats = read('stats.js', 'BaseballStats');
  expect(live, 'data/live.js 를 읽지 못함').not.toBeNull();
  expect(players, 'data/players.js 를 읽지 못함').not.toBeNull();
  expect(stats, 'data/stats.js 를 읽지 못함').not.toBeNull();
  expect(P.validateLive(live)).toEqual([]);
  expect(P.validatePlayers(players)).toEqual([]);
  expect(P.validateStats(stats)).toEqual([]);
  expect(live.standings && live.standings.rows).toHaveLength(10);
  /* 기록은 명단에 있는 선수 문서만 */
  const wikis = new Set(players.profiles.map((p) => p.wiki));
  expect(stats.players.filter((s) => !wikis.has(s.wiki)).map((s) => s.wiki)).toEqual([]);
});

test('실제 자료에 담지 않기로 한 것이 없다 — 기자 이메일·기사 본문 길이·신상 항목', () => {
  const text = fs.readFileSync(path.join(ROOT, 'data', 'live.js'), 'utf8') + fs.readFileSync(path.join(ROOT, 'data', 'players.js'), 'utf8');
  expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  for (const key of ['"birthplace"', '"salary"', '"contract"', '"realName"', '"출신지"', '"연봉"', '"계약금"']) expect(text).not.toContain(key);
  const live = read('live.js', 'BaseballLive');
  for (const n of live.news) expect(n.summary.length, n.id).toBeLessThanOrEqual(200);
  const players = read('players.js', 'BaseballPlayers');
  for (const p of players.profiles) if (p.photo) expect(p.photo.license, p.wiki).toMatch(P.FREE_LICENSE);
});

test('가짜 자료(테스트용)도 같은 계약을 지킨다', () => {
  expect(P.validateLive(FIX.buildLive())).toEqual([]);
  expect(P.validatePlayers(FIX.buildPlayers())).toEqual([]);
  expect(P.validateStats(FIX.buildStats())).toEqual([]);
  for (const kind of ['set', 'live', 'done']) expect(P.validateLive(FIX.buildLivePs(kind)), kind).toEqual([]);
});

test('teams.js 가을야구 방식: 와일드카드 → 준PO → PO → KS, 기다리는 순위 4·3·2·1, 최대 경기 2·5·5·7', () => {
  expect(T.POSTSEASON.map((r) => [r.key, r.top, r.bestOf])).toEqual([['wc', 4, 2], ['spo', 3, 5], ['po', 2, 5], ['ks', 1, 7]]);
  expect(T.POSTSEASON[0].low).toBe(5);
  expect(T.POSTSEASON_CUT).toBe(5);
});

test('teams.js: 10개 구단, id·색·위키 이름·명단 틀·구장 토큰·엠블럼 파일', () => {
  expect(T.TEAMS).toHaveLength(10);
  expect(new Set(T.TEAMS.map((t) => t.id)).size).toBe(10);
  for (const t of T.TEAMS) {
    expect(t.color, t.id).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(t.wikiEn.length, t.id).toBeGreaterThan(0);
    expect(t.roster, t.id).toMatch(/^틀:.+ 명단$/);
    expect(t.homeTokens.length, t.id).toBeGreaterThan(0);
    expect(() => new RegExp(t.alias), t.id).not.toThrow();
    expect(fs.existsSync(path.join(ROOT, t.logo)), t.logo).toBe(true);
  }
  expect(T.TEAMS.filter((t) => t.logoWide).map((t) => t.id)).toEqual(['hanwha']);
  /* 엠블럼 출처 표에 10개 파일이 다 있다 */
  const readme = fs.readFileSync(path.join(ROOT, 'icons', 'teams', 'README.md'), 'utf8');
  for (const t of T.TEAMS) expect(readme, t.logo).toContain('`' + path.basename(t.logo) + '`');
});

test('엠블럼 SVG 에 스크립트·이벤트 속성·바깥 주소가 없다', () => {
  for (const t of T.TEAMS.filter((x) => x.logo.endsWith('.svg'))) {
    const svg = fs.readFileSync(path.join(ROOT, t.logo), 'utf8');
    expect(svg, t.logo).not.toMatch(/<script|foreignObject|\son[a-z]+\s*=/i);
    const refs = svg.match(/(?:xlink:)?href\s*=\s*["']https?:\/\/[^"']+/gi) || [];
    expect(refs.filter((r) => !/w3\.org|creativecommons|inkscape|sodipodi|purl\.org/.test(r)), t.logo).toEqual([]);
  }
});

test.describe('store.js — 화면 쪽 계산', () => {
  test('표시 형식: 승률·게임차·연속·만 나이(생일 전날)·상대 시각·초성', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const F = Baseball.fmt;
      return {
        pct: [F.pct(0.5), F.pct(0), F.pct(1)],
        gb: [F.gb(0), F.gb(1.5), F.gb(10), F.gb(2.25)],
        streak: [F.streak({ type: 'W', n: 3 }), F.streak({ type: 'L', n: 2 }), F.streak({ type: 'D', n: 1 }), F.streak(null)],
        age: [F.age('2001-10-03'), F.age('2001-10-02'), F.age('잘못된 값')],
        rel: [F.rel('2026-10-02T02:59:40.000Z'), F.rel('2026-10-01T03:00:00.000Z')],
        day: F.day('2026-10-02'),
        cho: Baseball.chosung('김도영'),
      };
    });
    expect(r).toEqual({
      pct: ['0.500', '0.000', '1.000'],
      gb: ['-', '1.5', '10.0', '2.5'],
      streak: ['3연승', '2연패', '1무', '-'],
      age: [24, 25, null],
      rel: ['방금', '어제'],
      day: '10월 2일 (금)',
      cho: 'ㄱㄷㅇ',
    });
  });

  test('5위와의 거리·남은 경기·구단 입장의 경기 결과', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => ({
      kia: Baseball.cutDistance('kia'),
      nc: Baseball.cutDistance('nc'),
      rem: Baseball.remaining('kia'),
      games: Baseball.teamGames('kia', 2).map((g) => [g.date, g.opp, g.my, g.their, g.result, g.venue]),
      derby: Baseball.teamGames('lg', 1).map((g) => [g.result, g.venue]),
    }));
    expect(r).toEqual({
      kia: { inside: true, vs: 6, gap: 6 },
      nc: { inside: false, vs: 5, gap: -4.5 },
      rem: 10,
      games: [['2026-10-01', 'kt', 3, 5, 'L', '홈'], ['2026-09-30', 'kt', 2, 1, 'W', '홈']],
      derby: [['D', '']],
    });
  });

  test('가을야구 계산: 남은 경기로 본 최종 순위 범위, 위키 표시를 먼저 믿는 진출 확정·탈락·시드', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => ({
      phase: Baseball.phase(), final: Baseball.isFinal(), bracket: Baseball.bracket(),
      ranges: Baseball.ranges(),
      race: ['kt', 'kia', 'doosan', 'nc', 'ssg'].map((id) => Baseball.race(id)),
    }));
    expect(r).toMatchObject({ phase: 'race', final: false, bracket: null });
    /* 계산만으로는 kt 가 1위를 확정하지 못했다(4위까지 내려갈 수 있다) — 위키의 "Clinched first place" 를 믿는다 */
    expect(r.ranges.kt).toEqual({ best: 1, worst: 4 });
    expect(r.race).toEqual([
      { team: 'kt', rank: 1, status: 'in', seed: 1, best: 1, worst: 1 },
      { team: 'kia', rank: 4, status: 'in', seed: null, best: 2, worst: 5 },
      { team: 'doosan', rank: 5, status: 'race', seed: null, best: 2, worst: 8 },
      { team: 'nc', rank: 6, status: 'race', seed: null, best: 3, worst: 9 },
      { team: 'ssg', rank: 8, status: 'out', seed: null, best: 6, worst: 9 },
    ]);
  });

  test('가을야구 계산: 위키 표시가 없어도 계산으로 확정·탈락, 다섯 팀이 확정되면 나머지는 탈락', async ({ page }) => {
    const live = FIX.buildLive();
    /* 위키 표시를 모두 지우고 팀마다 8경기를 더 치른 것으로(4승 4패) — 남은 경기 2 */
    live.standings.rows.forEach((x) => { x.status = null; x.games += 8; x.win += 4; x.loss += 4; });
    await open(page, { live });
    expect(await page.evaluate(() => ['kt', 'samsung', 'lg', 'kia', 'doosan', 'nc', 'lotte', 'ssg', 'hanwha', 'kiwoom'].map((id) => Baseball.race(id).status)))
      .toEqual(['in', 'in', 'in', 'in', 'in', 'out', 'out', 'out', 'out', 'out']);
    /* 위키가 다섯 팀 확정을 먼저 적으면 계산과 상관없이 나머지는 탈락 */
    const live2 = FIX.buildLive();
    live2.standings.rows.find((x) => x.team === 'doosan').status = 'in';
    await open(page, { live: live2 });
    expect(await page.evaluate(() => ['nc', 'lotte'].map((id) => Baseball.race(id).status))).toEqual(['out', 'out']);
  });

  test('가을야구 계산: 최종 순위에 같은 승률이 있으면 그 자리 시드는 비워 둔다(순위 결정전)', async ({ page }) => {
    const live = FIX.buildLivePs('set');
    const rows = live.standings.rows;
    rows.find((x) => x.team === 'doosan').rank = rows.find((x) => x.team === 'kia').rank;   // 4위 공동
    await open(page, { live, now: '2026-10-05T03:00:00Z' });
    expect(await page.evaluate(() => Baseball.bracket().rounds[0].sides.map((s) => s.team))).toEqual([null, null]);
    await expect(page.locator('#psBracket > li[data-round="wc"] .ps-side .tbd')).toHaveText(['미정', '미정']);
  });

  test('자료가 망가진 줄(모르는 구단·주소 없는 기사)은 화면에 내지 않는다', async ({ page }) => {
    const live = FIX.buildLive();
    live.games.push({ id: 'x', date: '2026-10-01', stadium: '광주', home: null, t1: 'nope', s1: 1, t2: 'kia', s2: 0 });
    live.news.push({ id: 'bad', title: '주소가 이상한 기사', summary: '', url: 'javascript:alert(1)', source: '테스트', publishedAt: '2026-10-02T02:00:00.000Z', topics: ['kbo'], teams: [] });
    await open(page, { live });
    const r = await page.evaluate(() => ({ games: Baseball.games().length, bad: Baseball.news().some((n) => n.id === 'bad') }));
    expect(r).toEqual({ games: 9, bad: false });
  });
});
