const { test, expect } = require('@playwright/test');
const P = require('../scripts/parsers.js');
const C = require('../scripts/collect.js');
const W = require('./fixtures/wiki.js');
const FIX = require('./fixtures/data.js');

/*
 * 가을야구 수집 — 정규시즌 끝 판정, 순위표의 진출 여부 칸, 한국어 위키 「포스트시즌」·「한국시리즈」 문서, 연합뉴스 PS 전적,
 * 해마다 시즌 넘기기. 견본 문서는 2025·2026 실제 문서(2026-10-02 받음)의 모양을 따르고, 경기·사람은 지어냈다.
 * 2025 실제 문서로는 따로 확인했다: 와일드카드 4위 삼성 1승 1패로 진출, 준PO 삼성 3-1, PO 한화 3-2, KS LG 4-1, MVP (AGENTS.md 4절).
 */

const G = W.gameSection;
const FINAL = { final: true, rows: FIX.standingsRows(FIX.RAW_FINAL) };
const Q5 = ['kt', 'samsung', 'lg', 'kia', 'doosan'];
const sec = (kind, round) => (FIX.PS_GAMES[kind][round] || []).map((g) => G(g));

function rss(items) {
  return '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>t</title>' +
    items.map((i) => '<item><title><![CDATA[' + i.title + ']]></title><link>https://news.example.com/a/' + encodeURIComponent(i.title).slice(0, 40) + '</link>' +
      '<pubDate>' + i.date + '</pubDate><description><![CDATA[' + (i.desc || '') + ']]></description></item>').join('') +
    '</channel></rss>';
}
const FEED = { source: '테스트통신', url: 'https://news.example.com/rss', games: true };

test.describe('정규시즌 끝 · 진출 여부', () => {
  test('진출 여부 칸 → ks·po·spo·wc·in·out (시즌 중 표기와 시즌 뒤 표기 모두)', () => {
    const cases = {
      'Korean Series': 'ks', 'Clinched first place': 'ks', Playoff: 'po', 'Semi-playoff': 'spo', 'Semi-Playoffs': 'spo',
      'Wild Card': 'wc', Wildcard: 'wc', Qualified: 'in', 'Clinched playoff berth': 'in', 'Clinched postseason berth': 'in',
      'Did not qualify': 'out', Eliminated: 'out', '': null, TBD: null,
    };
    for (const [k, v] of Object.entries(cases)) expect(P.statusOf(k), k).toBe(v);
  });

  test('최종 순위표: "as of" 대신 "final" 문장, 홈·원정 한 칸, 시즌 뒤 진출 여부', () => {
    const st = P.parseStandings(W.FINAL_STANDINGS);
    expect(st.problems).toEqual([]);
    expect(st.final).toBe(true);
    expect(st.asOf).toBeNull();
    expect(Object.fromEntries(st.rows.map((r) => [r.team, r.status]))).toEqual({
      kt: 'ks', samsung: 'po', lg: 'spo', kia: 'wc', doosan: 'wc', nc: 'out', lotte: 'out', ssg: 'out', hanwha: 'out', kiwoom: 'out',
    });
    expect(st.rows[0]).toMatchObject({ games: 144, win: 83, loss: 57, draw: 4, home: { w: 42, d: 2, l: 29 }, away: { w: 41, d: 2, l: 28 } });
  });

  test('"final" 문장이 없어도 모든 팀이 144경기를 치렀으면 최종, 시즌 중 표는 최종이 아니다', () => {
    const st = P.parseStandings(W.FINAL_STANDINGS.replace('These are the final 2026 KBO League regular season standings.', ''));
    expect(st.final).toBe(true);
    expect(st.problems).toEqual([]);
    expect(P.parseStandings(W.STANDINGS).final).toBe(false);
  });

  test('buildLive: 최종 표의 기준일은 그 판을 고친 날(한국 날짜), 문서를 아직 못 받아도 최종 순위로 대진', () => {
    const live = C.buildLive({ season: 2026, wikiText: W.FINAL_STANDINGS, wikiRevision: '2026-10-04T16:30:00Z', feeds: [], prev: null, now: new Date('2026-10-05T03:00:00Z') });
    expect(live.standings.asOf).toBe('2026-10-05');   // 16:30 UTC = 다음 날 01:30 한국
    expect(live.standings.final).toBe(true);
    expect(P.validateLive(live)).toEqual([]);
    expect(live.postseason.rounds.map((r) => r.sides.map((s) => s.team))).toEqual([['kia', 'doosan'], ['lg', null], ['samsung', null], ['kt', null]]);
    expect(live.postseason.rounds[0].sides.map((s) => s.seed)).toEqual([4, 5]);
  });
});

test.describe('한국어 위키 「포스트시즌」·「한국시리즈」 문서', () => {
  test('경기 전 문서: 진출팀 다섯(설명 문단의 다른 구단은 아니다), 자리 표시(5위팀·??일·0:0)는 경기로 세지 않는다', () => {
    const text = W.psArticle({
      season: 2026, qualified: Q5,
      wc: [1, 2].map((n) => W.placeholderSection(n, '정규 시즌 5위팀', '정규 시즌 4위팀', 2026)),
      spo: [1, 2, 3, 4, 5].map((n) => W.placeholderSection(n, '와일드카드 결정전 승리팀', '정규 시즌 3위팀', 2026)),
      po: [1, 2, 3, 4, 5].map((n) => W.placeholderSection(n, '준플레이오프 승리팀', '정규 시즌 2위팀', 2026)),
    });
    const ps = P.parsePostseason(text, null, 2026, '2026-10-05');
    expect(ps.qualified).toEqual(Q5);
    expect(ps.rounds.map((r) => r.games.length)).toEqual([0, 0, 0, 0]);
    expect(ps.rounds.map((r) => r.sides.map((s) => s.team))).toEqual([[null, null], [null, null], [null, null], [null, null]]);
    expect(ps.rounds.map((r) => r.sides[0].seed)).toEqual([4, 3, 2, 1]);
    /* 정규시즌이 끝나기 전이면 대진에 팀을 채우지 않는다 */
    const built = P.buildPostseason({ season: 2026, psText: text, ksText: null, standings: { final: false, rows: FINAL.rows }, today: '2026-10-02' });
    expect(built.rounds[0].sides.map((s) => s.team)).toEqual([null, null]);
    expect(built.qualified).toEqual(Q5);
    expect(P.validatePostseason(built)).toEqual([]);
  });

  test('진행 중 문서: 이긴 팀 표시(◄)가 있는 경기만 — 날짜 줄 주석·구장·투수 링크, 5위가 두 번 이겨 올라감', () => {
    const text = W.psArticle({
      season: 2026, qualified: Q5,
      bracket: [[['kia', 4, 0], ['doosan', 5, 2, true]], [['lg', 3, 1], ['doosan', 5, 0]], [['samsung', 2], [null]], [['kt', 1], [null]]],
      wc: [G([1, '2026-10-06', 'doosan', 5, 'kia', 3, '두산투수일', 'KIA투수일', null, { ref: true }]), G([2, '2026-10-07', 'doosan', 4, 'kia', 2, '두산투수이', 'KIA투수이', '두산투수삼'])],
      spo: [
        G([1, '2026-10-09', 'doosan', 2, 'lg', 6, 'LG투수일', '두산투수사']),
        G([2, '2026-10-10', 'doosan', 3, 'lg', 1, '두산투수일', 'LG투수이', null, { noMark: true }]),   // 경기 중에 점수만 고쳐 둔 칸
        W.placeholderSection(3, '와일드카드 결정전 승리팀', '정규 시즌 3위팀', 2026),
      ],
    });
    const ps = P.buildPostseason({ season: 2026, psText: text, ksText: null, standings: FINAL, today: '2026-10-10' });
    expect(P.validatePostseason(ps)).toEqual([]);
    const [wc, spo, po, ks] = ps.rounds;
    expect(wc.winner).toBe('doosan');
    expect(wc.sides).toEqual([{ team: 'kia', seed: 4, wins: 0 }, { team: 'doosan', seed: 5, wins: 2 }]);
    expect(wc.games[0]).toEqual({
      n: 1, date: '2026-10-06', t1: 'doosan', s1: 5, t2: 'kia', s2: 3, home: 'kia', venue: '광주-기아 챔피언스 필드',
      wp: '두산투수일', lp: 'KIA투수일', sv: null, src: 'wiki',
    });
    expect(wc.games[1].sv).toBe('두산투수삼');
    expect(spo.games.map((g) => g.n)).toEqual([1]);
    expect(spo.sides).toEqual([{ team: 'lg', seed: 3, wins: 1 }, { team: 'doosan', seed: 5, wins: 0 }]);
    expect(spo.winner).toBeNull();
    expect(po.sides).toEqual([{ team: 'samsung', seed: 2, wins: 0 }, { team: null, seed: null, wins: 0 }]);
    expect(ks.sides[0].team).toBe('kt');
    expect(ps.champion).toBeNull();
  });

  test('대진표가 비어 있어도 경기 기록과 최종 순위로: 4위는 1승만 하면 올라가고, 다음 라운드 도전자는 앞 라운드 승자', () => {
    const text = W.psArticle({ season: 2026, qualified: [], wc: sec('done', 'wc'), spo: sec('done', 'spo').slice(0, 1) });
    const ps = P.buildPostseason({ season: 2026, psText: text, ksText: null, standings: FINAL, today: '2026-10-08' });
    expect(ps.rounds[0]).toMatchObject({ winner: 'kia', sides: [{ team: 'kia', seed: 4, wins: 1 }, { team: 'doosan', seed: 5, wins: 0 }] });
    expect(ps.rounds[1].sides).toEqual([{ team: 'lg', seed: 3, wins: 1 }, { team: 'kia', seed: 4, wins: 0 }]);
    expect(ps.rounds[2].sides[0]).toEqual({ team: 'samsung', seed: 2, wins: 0 });
  });

  test('끝난 가을야구: 한국시리즈 문서의 "한국시리즈 경기" 절·정보 상자 MVP, 요약 절은 경기로 읽지 않는다', () => {
    const psText = W.psArticle({
      season: 2026, qualified: Q5,
      bracket: [[['kia', 4, 1, true], ['doosan', 5, 0]], [['lg', 3, 3, true], ['kia', 4, 1]], [['samsung', 2, 3, true], ['lg', 3, 2]], [['kt', 1, 4, true], ['samsung', 2, 2]]],
      wc: sec('done', 'wc'), spo: sec('done', 'spo'), po: sec('done', 'po'),
    });
    const ksText = W.ksArticle({ season: 2026, champion: 'kt', runnerUp: 'samsung', wins: [4, 2], mvp: 'KT내야이', games: sec('done', 'ks') });
    const ps = P.buildPostseason({ season: 2026, psText, ksText, standings: FINAL, today: '2026-11-01' });
    expect(P.validatePostseason(ps)).toEqual([]);
    expect(ps.rounds.map((r) => r.winner)).toEqual(['kia', 'lg', 'samsung', 'kt']);
    expect(ps.rounds.map((r) => r.games.length)).toEqual([1, 4, 5, 6]);
    expect(ps.rounds[3].sides).toEqual([{ team: 'kt', seed: 1, wins: 4 }, { team: 'samsung', seed: 2, wins: 2 }]);
    expect(ps.champion).toBe('kt');
    expect(ps.mvp).toBe('KT내야이');
  });

  test('한국시리즈 경기 기록이 아직 없어도 정보 상자에 우승 팀·승수가 채워지면 우승으로 (승수도 상자에서)', () => {
    const psText = W.psArticle({
      season: 2026, qualified: Q5,
      bracket: [[['kia', 4, 1, true], ['doosan', 5, 0]], [['lg', 3, 3, true], ['kia', 4, 1]], [['samsung', 2, 3, true], ['lg', 3, 2]], [['kt', 1, ''], ['samsung', 2, '']]],
    });
    const ksText = W.ksArticle({ season: 2026, champion: 'kt', runnerUp: 'samsung', wins: [4, 1], mvp: 'KT내야이', games: [] });
    const ps = P.buildPostseason({ season: 2026, psText, ksText, standings: FINAL, today: '2026-11-01' });
    expect(ps.rounds.map((r) => r.winner)).toEqual(['kia', 'lg', 'samsung', 'kt']);
    expect(ps.rounds[1].sides.map((s) => s.wins)).toEqual([3, 1]);   // 경기 기록이 없으면 대진표 승수
    expect(ps.rounds[3].sides).toEqual([{ team: 'kt', seed: 1, wins: 4 }, { team: 'samsung', seed: 2, wins: 1 }]);
    expect(ps.champion).toBe('kt');
    expect(P.validatePostseason(ps)).toEqual([]);
  });

  test('무승부(가을야구는 15회까지 하고 비길 수 있다)도 경기로 센다 — 단 그날 지나서, 0:0 자리 표시는 아니다', () => {
    const text = W.psArticle({
      season: 2026, qualified: [],
      wc: [G([1, '2026-10-06', 'doosan', 5, 'kia', 3]), G([2, '2026-10-07', 'doosan', 4, 'kia', 4])],
    });
    /* 경기 날(7일)에는 비긴 점수가 중계 중 편집일 수 있어 세지 않는다 */
    expect(P.parsePostseason(text, null, 2026, '2026-10-07').rounds[0].games.map((x) => x.n)).toEqual([1]);
    const ps = P.buildPostseason({ season: 2026, psText: text, ksText: null, standings: FINAL, today: '2026-10-08' });
    const wc = ps.rounds[0];
    expect(wc.games.map((x) => [x.n, x.s1, x.s2])).toEqual([[1, 5, 3], [2, 4, 4]]);
    expect(wc.winner).toBe('kia');   // 4위는 비기기만 해도 올라간다
    expect(wc.sides.map((s) => s.wins)).toEqual([0, 1]);
    expect(P.validatePostseason(ps)).toEqual([]);
    /* 팀만 채워 둔 0:0 은 지난 날짜여도 경기가 아니다 */
    const blank = W.psArticle({ season: 2026, qualified: [], wc: [G([1, '2026-10-06', 'doosan', 0, 'kia', 0])] });
    expect(P.parsePostseason(blank, null, 2026, '2026-10-08').rounds[0].games).toEqual([]);
  });

  test('미리 적어 둔 앞날 경기, 지난해 날짜를 베껴 둔 칸은 세지 않는다', () => {
    const text = W.psArticle({ season: 2026, qualified: [], wc: [G([1, '2026-10-06', 'doosan', 5, 'kia', 3]), G([2, '2026-10-07', 'kia', 4, 'doosan', 1])] });
    expect(P.parsePostseason(text, null, 2026, '2026-10-06').rounds[0].games.map((g) => g.n)).toEqual([1]);
    const copied = W.psArticle({ season: 2026, qualified: [], wc: [G([1, '2025-10-06', 'doosan', 5, 'kia', 3])] });
    expect(P.parsePostseason(copied, null, 2026, '2026-10-10').rounds[0].games).toEqual([]);
  });
});

test.describe('와일드카드 규칙 · 연합뉴스 전적 · 지난 자료', () => {
  const news = (stage, n, date, t1, s1, t2, s2) => ({ stage, n, date, t1, s1, t2, s2, home: null, source: 'https://news.example.com/' + stage + n });
  const wc = (games) => P.buildPostseason({ season: 2026, psText: null, ksText: null, standings: FINAL, newsGames: games, today: '2026-10-08' }).rounds[0];

  test('와일드카드: 5위가 1차전을 이기면 2차전으로, 2차전은 5위가 또 이겨야 진출(비기면 4위), 4위는 1승이면 끝', () => {
    expect(wc([news('wc', 1, '2026-10-06', 'doosan', 3, 'kia', 1)]).winner).toBeNull();
    expect(wc([news('wc', 1, '2026-10-06', 'doosan', 3, 'kia', 1), news('wc', 2, '2026-10-07', 'kia', 2, 'doosan', 2)]).winner).toBe('kia');
    expect(wc([news('wc', 1, '2026-10-06', 'doosan', 3, 'kia', 1), news('wc', 2, '2026-10-07', 'doosan', 5, 'kia', 4)]).winner).toBe('doosan');
    expect(wc([news('wc', 1, '2026-10-06', 'kia', 6, 'doosan', 0)]).winner).toBe('kia');
  });

  test('같은 경기가 위키와 연합뉴스에 다 있으면 위키 · 위키에 아직 없는 경기는 연합뉴스로 · 시리즈 팀이 아닌 경기는 버린다', () => {
    const text = W.psArticle({ season: 2026, qualified: [], wc: [G([1, '2026-10-06', 'doosan', 5, 'kia', 3, '두산투수일', 'KIA투수일'])] });
    const ps = P.buildPostseason({
      season: 2026, psText: text, ksText: null, standings: FINAL, today: '2026-10-09',
      newsGames: [
        news('wc', 1, '2026-10-06', 'doosan', 5, 'kia', 2),   // 점수가 다르게 나간 속보 — 위키가 이긴다
        news('wc', 2, '2026-10-07', 'doosan', 4, 'kia', 2),
        news('spo', 1, '2026-10-09', 'lg', 6, 'doosan', 2),
        news('po', 1, '2026-10-09', 'nc', 1, 'lg', 0),
      ],
    });
    const [r0, r1, r2] = ps.rounds;
    expect(r0.games.map((g) => [g.n, g.s2, g.src])).toEqual([[1, 3, 'wiki'], [2, 2, 'news']]);
    expect(r0.winner).toBe('doosan');
    expect(r1.sides).toEqual([{ team: 'lg', seed: 3, wins: 1 }, { team: 'doosan', seed: 5, wins: 0 }]);
    expect(r1.games[0]).toMatchObject({ src: 'news', url: 'https://news.example.com/spo1', home: null });
    expect(r2.games).toEqual([]);
    expect(P.validatePostseason(ps)).toEqual([]);
  });

  test('이번에 위키를 못 받으면 지난 대진(승자·MVP 포함)을 그대로 쓴다, 다른 시즌의 지난 자료는 쓰지 않는다', () => {
    const prev = FIX.postseasonFor('done');
    const again = P.buildPostseason({ season: 2026, psText: null, ksText: null, standings: FINAL, prev, today: '2026-11-02' });
    expect(again.champion).toBe('kt');
    expect(again.rounds.map((r) => r.games.length)).toEqual([1, 4, 5, 6]);
    expect(again.mvp).toBe('KT내야수2');
    expect(P.buildPostseason({ season: 2027, psText: null, ksText: null, standings: null, prev, today: '2027-03-25' })).toBeNull();
  });

  test('검사: 진 팀이 다음 라운드에 · 우승팀이 KS 승자와 다름 · 승자가 두 팀에 없음 · 다른 해 경기', () => {
    const ok = FIX.postseasonFor('done');
    expect(P.validatePostseason(ok)).toEqual([]);
    const bad = (fn) => { const x = JSON.parse(JSON.stringify(ok)); fn(x); return P.validatePostseason(x).join(' / '); };
    expect(bad((x) => { x.champion = 'samsung'; })).toContain('우승팀이 한국시리즈 승자와 다름');
    expect(bad((x) => { x.rounds[1].sides[1].team = 'doosan'; })).toMatch(/wc 에서 진 팀이 다음 라운드에 있음.*spo 경기 팀이 시리즈 팀이 아님/);
    expect(bad((x) => { x.rounds[3].winner = 'nc'; x.champion = 'nc'; })).toContain('ks 승자가 두 팀에 없음');
    expect(bad((x) => { x.rounds[0].games[0].date = '2025-10-06'; })).toContain('wc 경기 날짜 이상');
    expect(bad((x) => { x.rounds[2].bestOf = 7; })).toContain('po 최대 경기 수 이상');
    /* live 전체 검사: 가을야구 시즌이 순위표 시즌과 다르면 안 된다 */
    const live = FIX.buildLivePs('done');
    live.postseason.season = 2025;
    expect(P.validateLive(live).join()).toContain('포스트시즌: 시즌이 순위표 시즌과 다름');
  });
});

test.describe('연합뉴스 포스트시즌 전적 제목', () => {
  const at = '2026-10-10T13:30:00Z';
  test('라운드·몇 차전을 읽고, "N차전"을 더블헤더로 보지 않는다 (준PO·PO 는 실제 제목 모양)', () => {
    expect(P.parseGameTitle('[프로야구 준PO 2차전 전적] kt 2-0 키움', at, '')).toEqual({
      id: '2026-10-10-kiwoom-kt-spo2', stage: 'spo', n: 2, date: '2026-10-10', stadium: null, home: null, t1: 'kt', s1: 2, t2: 'kiwoom', s2: 0,
    });
    expect(P.parseGameTitle('[프로야구 PO 1차전 전적] 삼성 9-8 한화', at, '')).toMatchObject({ stage: 'po', n: 1 });
    expect(P.parseGameTitle('[프로야구 와일드카드 결정전 1차전 전적] NC 4-1 삼성', at, '')).toMatchObject({ stage: 'wc', n: 1, t1: 'nc' });
    expect(P.parseGameTitle('[프로야구 WC 2차전 전적] 삼성 3-0 NC', at, '')).toMatchObject({ stage: 'wc', n: 2 });
    expect(P.parseGameTitle('[프로야구 한국시리즈 3차전 전적] 한화 7-3 LG', at, '')).toMatchObject({ stage: 'ks', n: 3 });
    expect(P.parseGameTitle('[프로야구 KS 5차전 전적] LG 4-1 한화', at, '')).toMatchObject({ stage: 'ks', n: 5 });
    /* 정규시즌 제목은 그대로 */
    const reg = P.parseGameTitle('[프로야구 광주전적] kt 7-5 KIA', '2026-10-01T12:00:00Z', '▲ 광주전적(1일)');
    expect(reg.stage).toBeUndefined();
    expect(reg.id).toBe('2026-10-01-kia-kt');
  });

  test('buildLive: PS 전적은 정규시즌 경기 목록이 아니라 가을야구 대진으로 간다', () => {
    const feeds = [{
      feed: FEED,
      xml: rss([
        { title: '[프로야구 WC 1차전 전적] 두산 5-3 KIA', date: 'Tue, 06 Oct 2026 22:10:00 +0900' },
        { title: '[프로야구 잠실전적] LG 3-2 두산', date: 'Sun, 04 Oct 2026 21:40:00 +0900', desc: '▲ 잠실전적(4일)' },
      ]),
    }];
    const live = C.buildLive({ season: 2026, wikiText: W.FINAL_STANDINGS, wikiRevision: '2026-10-05T01:00:00Z', feeds, prev: null, now: new Date('2026-10-06T14:00:00Z') });
    expect(live.games.map((g) => g.id)).toEqual(['2026-10-04-doosan-lg']);
    expect(live.postseason.rounds[0].games).toEqual([{
      n: 1, date: '2026-10-06', t1: 'doosan', s1: 5, t2: 'kia', s2: 3, home: null, venue: null, wp: null, lp: null, sv: null, src: 'news',
      url: expect.stringMatching(/^https:\/\/news\.example\.com\//),
    }]);
    expect(live.postseason.rounds[0].winner).toBeNull();
    expect(P.validateLive(live)).toEqual([]);
    /* 다음 실행: 피드에서 그 기사가 빠져도 지난 자료에서 이어진다. 라운드를 안 밝힌 "PS" 제목은 두 팀이 다 있는 라운드로 */
    const feeds2 = [{ feed: FEED, xml: rss([{ title: '[프로야구 PS 2차전 전적] 두산 4-2 KIA', date: 'Wed, 07 Oct 2026 22:05:00 +0900' }]) }];
    const next = C.buildLive({ season: 2026, wikiText: W.FINAL_STANDINGS, wikiRevision: '2026-10-05T01:00:00Z', feeds: feeds2, prev: live, now: new Date('2026-10-07T14:00:00Z') });
    expect(next.games.map((g) => g.id)).toEqual(['2026-10-04-doosan-lg']);
    expect(next.postseason.rounds[0].games.map((g) => g.n)).toEqual([1, 2]);
    expect(next.postseason.rounds[0].winner).toBe('doosan');
    expect(next.postseason.rounds[1].sides.map((s) => s.team)).toEqual(['lg', 'doosan']);
  });
});

test.describe('해마다 시즌 넘기기', () => {
  test('chooseSeason: 올해 문서에 경기를 치른 순위표가 있으면 올해, 개막 전이면 지난해, 못 받으면 보던 시즌', () => {
    const zero = W.STANDINGS.replace(/\|\| 134 \|\| \d+ \|\| \d+ \|\| \d+/g, '|| 0 || 0 || 0 || 0');
    expect(P.chooseSeason(W.STANDINGS, new Date('2026-10-02T03:00:00Z'), 2026)).toBe(2026);
    expect(P.chooseSeason(null, new Date('2027-01-15T03:00:00Z'), 2026)).toBe(2026);            // 2027 문서가 아직 없다
    expect(P.chooseSeason(zero, new Date('2027-03-10T03:00:00Z'), 2026)).toBe(2026);            // 문서는 있지만 개막 전(경기 0)
    expect(P.chooseSeason(W.STANDINGS, new Date('2027-03-25T03:00:00Z'), 2026)).toBe(2027);     // 개막했다 → 새 시즌
    expect(P.chooseSeason(undefined, new Date('2027-03-25T03:00:00Z'), 2026)).toBe(2026);       // 받기 실패 → 보던 시즌
    expect(P.chooseSeason(undefined, new Date('2027-01-15T03:00:00Z'), null)).toBe(2026);       // 지난 자료도 없으면 1~2월은 지난해
  });

  test('buildLive: 새 시즌으로 넘어가면 지난 시즌 순위·경기·가을야구는 버리고 뉴스는 이어 간다', () => {
    const prev = FIX.buildLivePs('done');
    prev.news = [Object.assign({}, prev.news[0], { id: 'keep', publishedAt: '2027-03-24T10:00:00.000Z' })];
    const live = C.buildLive({ season: 2027, wikiText: W.STANDINGS, wikiRevision: '2027-03-24T14:00:00Z', feeds: [], prev, now: new Date('2027-03-25T03:00:00Z') });
    expect(live.season).toBe(2027);
    expect(live.postseason).toBeUndefined();
    expect(live.games).toEqual([]);
    expect(live.news.map((n) => n.id)).toEqual(['keep']);
  });

  test('wantPostseason: 남은 경기 20 이하·정규시즌 끝·진행 중이면 받고, 우승팀이 정해진 뒤에는 하루 한 번', () => {
    const rows = (n) => ({ final: false, rows: Array.from({ length: 10 }, () => ({ games: n })) });
    const now = new Date('2026-11-05T03:00:00Z');
    expect(C.wantPostseason(rows(100), null, now)).toBe(false);
    expect(C.wantPostseason(rows(124), null, now)).toBe(true);
    expect(C.wantPostseason({ final: true, rows: [] }, null, now)).toBe(true);
    expect(C.wantPostseason(null, null, now)).toBe(false);
    expect(C.wantPostseason(null, { champion: null }, now)).toBe(true);
    expect(C.wantPostseason(null, { champion: 'kt', fetchedAt: '2026-11-05T00:00:00Z' }, now)).toBe(false);
    expect(C.wantPostseason(null, { champion: 'kt', fetchedAt: '2026-11-03T00:00:00Z' }, now)).toBe(true);
  });
});
