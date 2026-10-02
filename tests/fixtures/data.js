/* 테스트용 가짜 자료 — data/live.js · data/players.js 와 같은 모양(AGENTS.md 5절 계약)
 *
 * - 선수·감독은 모두 가상 인물이다(가람·나래·다온, "KIA투수3" 등). 실제 선수에게 가짜 기록을 붙이지 않는다 (AGENTS.md 규칙 2).
 * - 기사 출처도 가상 이름(테스트일보·가상스포츠·예시통신)이다. 실제 언론사가 쓰지 않은 기사를 그 언론사 것처럼 보이게 하지 않는다.
 * - 순위는 리그 전체 승 = 패가 되게 짰다. 실제 검사(validateLive·validatePlayers)를 통과해야 한다(data.spec.js).
 * - 시각은 NOW(2026-10-02 금요일 12:00 한국 시각)에 맞춰 고정한다. 화면의 "30분 전"·"어제"·만 나이가 이 시각 기준이다.
 */
'use strict';

const { TEAMS, POSTSEASON: T_POSTSEASON } = require('../../teams.js');
const P = require('../../scripts/parsers.js');
const { dataScript } = require('../../scripts/collect.js');

const NOW = '2026-10-02T03:00:00.000Z';

function split(n) { return [Math.ceil(n / 2), Math.floor(n / 2)]; }

/* [구단, 승, 패, 무, 연속, 진출 여부] — NC·롯데는 승률이 같아 공동 6위 */
const RAW = [
  ['kt', 79, 53, 2, { type: 'W', n: 3 }, 'ks'],
  ['samsung', 77, 54, 3, { type: 'W', n: 1 }, 'in'],
  ['lg', 73, 59, 2, { type: 'L', n: 2 }, 'in'],
  ['kia', 70, 62, 2, { type: 'L', n: 1 }, 'in'],
  ['doosan', 68, 63, 3, { type: 'W', n: 2 }, null],   // 5위 자리는 아직 NC·롯데와 다툰다
  ['nc', 64, 68, 2, { type: 'L', n: 3 }, null],
  ['lotte', 64, 68, 2, { type: 'W', n: 1 }, null],
  ['ssg', 59, 72, 3, { type: 'D', n: 1 }, 'out'],
  ['hanwha', 56, 76, 2, { type: 'L', n: 4 }, 'out'],
  ['kiwoom', 49, 84, 1, { type: 'W', n: 1 }, 'out'],
];

function standingsRows(raw) {
  return P.computeStandings((raw || RAW).map(([team, win, loss, draw, streak, status]) => {
    const [hw, aw] = split(win), [hl, al] = split(loss), [hd, ad] = split(draw);
    return {
      team, games: win + loss + draw, win, loss, draw, streak,
      home: { w: hw, d: hd, l: hl }, away: { w: aw, d: ad, l: al }, status,
    };
  }));
}

const SRC = 'https://news.example.com/';

const GAMES = [
  { id: '2026-10-01-kia-kt', date: '2026-10-01', stadium: '광주', home: 'kia', t1: 'kt', s1: 5, t2: 'kia', s2: 3 },
  { id: '2026-10-01-doosan-lg', date: '2026-10-01', stadium: '잠실', home: null, t1: 'doosan', s1: 4, t2: 'lg', s2: 4 },
  { id: '2026-10-01-hanwha-samsung', date: '2026-10-01', stadium: '대구', home: 'samsung', t1: 'samsung', s1: 7, t2: 'hanwha', s2: 2 },
  { id: '2026-10-01-kiwoom-lotte', date: '2026-10-01', stadium: '부산', home: 'lotte', t1: 'lotte', s1: 6, t2: 'kiwoom', s2: 1 },
  { id: '2026-10-01-nc-ssg', date: '2026-10-01', stadium: '창원', home: 'nc', t1: 'ssg', s1: 3, t2: 'nc', s2: 1 },
  { id: '2026-09-30-kia-kt', date: '2026-09-30', stadium: '광주', home: 'kia', t1: 'kia', s1: 2, t2: 'kt', s2: 1 },
  { id: '2026-09-30-doosan-lg', date: '2026-09-30', stadium: '잠실', home: null, t1: 'lg', s1: 8, t2: 'doosan', s2: 0 },
  { id: '2026-09-30-hanwha-samsung', date: '2026-09-30', stadium: '대구', home: 'samsung', t1: 'hanwha', s1: 5, t2: 'samsung', s2: 4 },
  { id: '2026-09-29-kia-kt', date: '2026-09-29', stadium: '광주', home: 'kia', t1: 'kia', s1: 9, t2: 'kt', s2: 8 },
].map((g, i) => Object.assign({ source: SRC + 'game/' + (i + 1) }, g));

function news(id, title, summary, source, at, topics, teams) {
  return { id, title, summary, url: SRC + 'article/' + id, source, publishedAt: at, topics, teams };
}

/* 최신순. 시각 옆 주석은 NOW(10월 2일 12:00) 기준으로 화면에 나와야 하는 말 */
const NEWS = [
  news('n1', '가람, 결승타로 KIA 3연승 이끌어', 'KIA 타이거즈 가람이 9회 결승타를 때렸다.', '테스트일보', '2026-10-02T02:30:00.000Z', ['kbo'], ['kia']),   // 30분 전
  news('n2', 'kt 위즈, 정규시즌 1위 확정', '가상의 요약입니다. kt 위즈가 1위를 확정했다.', '가상스포츠', '2026-10-02T01:00:00.000Z', ['kbo'], ['kt']),   // 2시간 전
  news('n3', 'LG 나래, 시즌 첫 홈런', 'LG 트윈스 포수 나래가 홈런을 쳤다.', '예시통신', '2026-10-01T13:00:00.000Z', ['kbo'], ['lg']),                   // 14시간 전
  news('n4', '나래 이름만 나오는 다른 기사', '구단 이름 없이 이름만 나온다.', '테스트일보', '2026-10-01T12:00:00.000Z', ['kbo'], []),
  news('n5', 'KIA 나래, 호수비로 실점 막아', 'KIA 내야수 나래가 호수비를 했다.', '가상스포츠', '2026-10-01T11:00:00.000Z', ['kbo'], ['kia']),
  news('n6', '메이저리그 디비전시리즈 개막', 'MLB 가을야구가 시작됐다.', '예시통신', '2026-10-01T10:00:00.000Z', ['abroad'], []),
  news('n7', 'U-18 야구 대표팀, 아시아 정상', '청소년 대표팀이 우승했다.', '테스트일보', '2026-09-30T23:00:00.000Z', ['national'], []),            // 어제 (10월 1일 08:00)
  news('n8', '삼성-한화 맞대결 정리', '', '가상스포츠', '2026-09-30T09:00:00.000Z', ['kbo'], ['samsung', 'hanwha']),                                     // 2일 전
  news('n9', '<img src=x onerror="window.__xss=1">위험한 제목', '<b>굵게</b> 요약도 글자로만', '예시통신', '2026-09-30T08:00:00.000Z', ['kbo'], ['ssg']),
  news('n10', 'KBO 신인 드래프트, 고교야구 최대어 지명', '고교야구 최대어가 1순위로 지명됐다.', '테스트일보', '2026-09-30T07:00:00.000Z', ['kbo', 'national'], ['kiwoom']),
];

/* 늘 새 복사본을 돌려준다. 한 테스트가 고친 자료(기사 덧붙이기 등)가 같은 작업자의 다른 테스트에 남으면 안 된다
   (2026-10-02 data.spec 이 덧붙인 기사가 news.spec 에 나타났다) */
const copy = (v) => JSON.parse(JSON.stringify(v));

function buildLive() {
  return copy({
    version: 1,
    season: 2026,
    generatedAt: '2026-10-02T02:50:00.000Z',   // 10분 전 수집
    standings: {
      asOf: '2026-10-01',
      fetchedAt: '2026-10-02T02:50:00.000Z',
      source: { name: '위키백과(영문) 「2026 KBO League season」', url: 'https://en.wikipedia.org/wiki/2026_KBO_League_season', license: 'CC BY-SA 4.0', revision: '2026-10-01T14:00:00Z' },
      rows: standingsRows(),
    },
    games: GAMES,
    news: NEWS,
    sources: { news: ['테스트일보', '가상스포츠', '예시통신'], games: '테스트 전적' },
  });
}

/* 구단마다 투수 12·포수 3·내야수 6·외야수 5 = 26명 (명단 검사 기준 25명 이상) */
const COUNTS = { P: 12, C: 3, IF: 6, OF: 5 };
const LABEL = { P: '투수', C: '포수', IF: '내야수', OF: '외야수' };

/* 이름을 붙여 따로 검사하는 가상 선수 */
const SPECIAL = {
  kia: {
    P: [{ i: 0, number: 11, name: '가람', wiki: '가람 (야구 선수)', note: '주장' }],
    IF: [{ i: 0, number: 7, name: '나래', wiki: '나래 (1998년)', note: '' }],
    OF: [{ i: 4, number: 124, name: '다온', wiki: null, note: '' }],
  },
  lg: {
    C: [{ i: 0, number: 27, name: '나래', wiki: '나래 (2000년)', note: '' }],
  },
};

function rosterFor(t, ti) {
  const players = [];
  let base = 1;
  Object.keys(COUNTS).forEach(pos => {
    for (let i = 0; i < COUNTS[pos]; i++) {
      const sp = ((SPECIAL[t.id] || {})[pos] || []).find(s => s.i === i);
      const p = sp
        ? { number: sp.number, name: sp.name, wiki: sp.wiki, pos, note: sp.note }
        : { number: base + i, name: t.short + LABEL[pos] + (i + 1), wiki: null, pos, note: '' };
      p.id = t.id + '-' + P.hashId(p.wiki || p.name);
      if (p.number >= 100) p.dev = true;
      players.push(p);
    }
    base += 20;
  });
  return {
    asOf: '2026-09-17T06:58:57Z',
    source: { name: '위키백과(한국어) 「' + t.roster + '」', url: 'https://ko.wikipedia.org/wiki/' + encodeURIComponent(t.roster.replace(/ /g, '_')), license: 'CC BY-SA 4.0' },
    manager: { number: 70 + (ti % 10), name: t.short + '감독', wiki: t.id === 'kia' ? 'KIA감독 (야구인)' : null },
    coaches: [
      { number: 80, name: t.short + '수석코치', wiki: null, role: '수석' },
      { number: 81, name: t.short + '타격코치', wiki: null, role: '타격' },
    ],
    players,
    military: t.id === 'kia' ? [{ name: '군복무선수1', wiki: null }, { name: '군복무선수2', wiki: null }] : [],
  };
}

const PROFILES = [
  {
    wiki: '가람 (야구 선수)', born: '2001-10-03', height: 185, weight: 88, throws: '우', bats: '좌', positions: ['투수'],
    nationality: '대한민국', proYear: 2020, draft: '2020년 1차 지명(KIA 타이거즈)',
    career: ['KIA 타이거즈 (2020년 ~ 현재)', '테스트 상무 (2022년 ~ 2023년)'], titles: ['2025년 테스트상'],
    photo: {
      file: '가람 선수.jpg', caption: '가람(2025년)',
      thumb: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/aa/Garam.jpg/330px-Garam.jpg', width: 330, height: 440,
      page: 'https://commons.wikimedia.org/wiki/File:Garam.jpg', author: '테스트 작가', license: 'CC BY 3.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/3.0',
      large: { url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/aa/Garam.jpg/960px-Garam.jpg', width: 960, height: 1280 },
    },
  },
  {
    wiki: '나래 (1998년)', born: '1998-01-15', height: 178, weight: 76, throws: '우', bats: '우', positions: ['유격수', '2루수'],
    nationality: '대한민국', proYear: 2017, draft: null, career: ['KIA 타이거즈 (2017년 ~ 현재)'], titles: [],
  },
  {
    wiki: '나래 (2000년)', born: '2000-05-05', height: 181, weight: 90, throws: '우', bats: '우', positions: ['포수'],
    nationality: '대한민국', proYear: 2019, draft: null, career: ['LG 트윈스 (2019년 ~ 현재)'], titles: [],
  },
  {
    wiki: 'KIA감독 (야구인)', born: '1975-03-03', height: 183, weight: 90, throws: '우', bats: '우', positions: ['내야수'],
    nationality: '대한민국', proYear: 1998, draft: null, career: ['KIA 타이거즈 감독 (2024년 ~ 현재)'], titles: [],
  },
];

function buildPlayers() {
  const rosters = {};
  TEAMS.forEach((t, i) => { rosters[t.id] = rosterFor(t, i); });
  return copy({ version: 1, generatedAt: '2026-10-02T00:00:00.000Z', rosters, profiles: PROFILES });
}

/* 연도별 기록 (data/stats.js 모양) — 가상 선수: 가람(투수), KIA 나래(타자), LG 나래(타격·투구 둘 다). 다온은 위키 문서가 없어 기록도 없다 */
const BAT = ['year', 'team', 'g', 'avg', 'h', 'hr', 'rbi', 'r', 'sb', 'bb', 'so'];
const PIT = ['year', 'team', 'g', 'era', 'w', 'l', 'sv', 'hld', 'ip', 'k', 'bb'];
const STATS = {
  version: 1, generatedAt: '2026-10-02T00:00:00.000Z', latestSeason: 2025,
  players: [
    {
      wiki: '가람 (야구 선수)', kbo: { hitter: null, pitcher: '12345' },
      pit: {
        cols: PIT,
        rows: [['2024', 'KIA', '30', '3.50', '8', '6', '0', '1', '120⅓', '110', '40'], ['2025', 'KIA', '28', '2.95', '12', '5', '0', '0', '150', '140', '35']],
        total: ['통산', '', '58', '3.20', '20', '11', '0', '1', '270⅓', '250', '75'], seasons: '2시즌',
      },
    },
    {
      wiki: '나래 (1998년)', kbo: { hitter: '54321', pitcher: null },
      bat: { cols: BAT, rows: [['2025', 'KIA', '120', '0.290', '130', '10', '60', '70', '15', '40', '80']], total: null, seasons: null },
    },
    {
      wiki: '나래 (2000년)', kbo: { hitter: '22222', pitcher: '33333' },
      bat: { cols: BAT, rows: [['2025', 'LG', '90', '0.250', '70', '5', '30', '25', '1', '20', '50']], total: null, seasons: null },
      pit: { cols: PIT, rows: [['2025', 'LG', '2', '0.00', '0', '0', '0', '0', '2', '1', '0']], total: null, seasons: null },
    },
  ],
};
function buildStats() { return copy(STATS); }

/* ---------- 가을야구 견본 ----------
 * 정규시즌 최종 순위: 모든 팀 144경기, 리그 전체 승 = 패 = 704, 무 32. 1~5위 kt·삼성·LG·KIA·두산 (승률이 모두 달라 시드가 정해진다).
 * 가을야구 경기는 지어낸 가상 경기다 — 점수도, 투수·MVP 이름("KT투수1")도 가상이다.
 */
const RAW_FINAL = [
  ['kt', 83, 57, 4, { type: 'W', n: 2 }, 'ks'],
  ['samsung', 81, 60, 3, { type: 'L', n: 1 }, 'po'],
  ['lg', 77, 65, 2, { type: 'W', n: 1 }, 'spo'],
  ['kia', 74, 67, 3, { type: 'W', n: 4 }, 'wc'],
  ['doosan', 72, 68, 4, { type: 'L', n: 2 }, 'wc'],
  ['nc', 70, 71, 3, { type: 'W', n: 1 }, 'out'],
  ['lotte', 68, 73, 3, { type: 'L', n: 3 }, 'out'],
  ['ssg', 64, 77, 3, { type: 'W', n: 2 }, 'out'],
  ['hanwha', 60, 81, 3, { type: 'L', n: 1 }, 'out'],
  ['kiwoom', 55, 85, 4, { type: 'D', n: 1 }, 'out'],
];

/* [몇 차전, 날짜, 원정, 원정 점수, 홈, 홈 점수, 승리 투수, 패전 투수, 세이브] */
const PS_GAMES = {
  /* 진행 중(10월 10일 밤): 5위 두산이 와일드카드 두 경기를 다 이겨 올라갔고, 준플레이오프는 LG 와 1승 1패 */
  live: {
    wc: [[1, '2026-10-06', 'doosan', 5, 'kia', 3, '두산투수1', 'KIA투수1'], [2, '2026-10-07', 'doosan', 4, 'kia', 2, '두산투수2', 'KIA투수2', '두산투수3']],
    spo: [[1, '2026-10-09', 'doosan', 2, 'lg', 6, 'LG투수1', '두산투수4'], [2, '2026-10-10', 'doosan', 3, 'lg', 1, '두산투수1', 'LG투수2']],
  },
  /* 끝: 4위 KIA 가 와일드카드 1차전을 이겨 바로 올라가고(1승 안고 시작), 준PO LG 3승 1패, PO 삼성 3승 2패, KS kt 4승 2패 우승 */
  done: {
    wc: [[1, '2026-10-06', 'doosan', 1, 'kia', 4, 'KIA투수1', '두산투수1']],
    spo: [
      [1, '2026-10-08', 'kia', 2, 'lg', 5, 'LG투수1', 'KIA투수2'], [2, '2026-10-09', 'kia', 6, 'lg', 3, 'KIA투수3', 'LG투수2'],
      [3, '2026-10-11', 'lg', 4, 'kia', 1, 'LG투수3', 'KIA투수1'], [4, '2026-10-12', 'lg', 7, 'kia', 6, 'LG투수4', 'KIA투수4', 'LG투수5'],
    ],
    po: [
      [1, '2026-10-15', 'lg', 3, 'samsung', 8, '삼성투수1', 'LG투수1'], [2, '2026-10-16', 'lg', 5, 'samsung', 2, 'LG투수2', '삼성투수2'],
      [3, '2026-10-18', 'samsung', 4, 'lg', 3, '삼성투수3', 'LG투수3', '삼성투수4'], [4, '2026-10-19', 'samsung', 0, 'lg', 2, 'LG투수4', '삼성투수1'],
      [5, '2026-10-21', 'lg', 1, 'samsung', 6, '삼성투수2', 'LG투수1'],
    ],
    ks: [
      [1, '2026-10-24', 'samsung', 2, 'kt', 7, 'KT투수1', '삼성투수1'], [2, '2026-10-25', 'samsung', 3, 'kt', 4, 'KT투수2', '삼성투수2', 'KT투수3'],
      [3, '2026-10-27', 'kt', 1, 'samsung', 5, '삼성투수3', 'KT투수4'], [4, '2026-10-28', 'kt', 9, 'samsung', 2, 'KT투수1', '삼성투수4'],
      [5, '2026-10-29', 'kt', 3, 'samsung', 4, '삼성투수2', 'KT투수2'], [6, '2026-10-31', 'samsung', 1, 'kt', 3, 'KT투수5', '삼성투수1', 'KT투수3'],
    ],
  },
};

/** 가을야구 자료 (live.postseason 모양) — 수집기와 같은 조립 함수(P.buildPostseason)로 만들어 계약을 그대로 지킨다 */
function postseasonFor(kind) {
  const rows = standingsRows(RAW_FINAL);
  const stadium = id => TEAMS.find(t => t.id === id).stadium;
  const rounds = T_POSTSEASON.map(d => ({
    key: d.key,
    sides: [{ team: null, seed: null, wins: 0 }, { team: null, seed: null, wins: 0 }],
    winner: null,
    games: ((PS_GAMES[kind] || {})[d.key] || []).map(([n, date, away, as, home, hs, wp, lp, sv]) => ({
      n, date, t1: away, s1: as, t2: home, s2: hs, home, venue: stadium(home), wp, lp, sv: sv || null, src: 'wiki',
    })),
  }));
  const ps = P.buildPostseason({
    season: 2026, standings: { final: true, rows }, today: '2026-12-31',
    prev: { season: 2026, rounds, qualified: ['kt', 'samsung', 'lg', 'kia', 'doosan'], mvp: kind === 'done' ? 'KT내야수2' : null },
  });
  ps.fetchedAt = '2026-11-01T00:00:00.000Z';
  ps.sources = [{ name: '위키백과(한국어) 「2026년 KBO 포스트시즌」', url: 'https://ko.wikipedia.org/wiki/' + encodeURIComponent('2026년_KBO_포스트시즌'), license: 'CC BY-SA 4.0', revision: '2026-10-31T15:00:00Z' }];
  return ps;
}

/** 정규시즌이 끝난 뒤의 live 자료. kind: 'set'(가을야구 전 — 대진 자료 없음) · 'live'(진행 중) · 'done'(우승팀 확정) */
function buildLivePs(kind) {
  const live = buildLive();
  live.standings.rows = standingsRows(RAW_FINAL);
  live.standings.asOf = '2026-10-04';
  live.standings.final = true;
  if (kind !== 'set') live.postseason = postseasonFor(kind);
  return copy(live);
}

function liveScript(live) { return dataScript('BaseballLive', live || buildLive(), '테스트 자료'); }
function playersScript(players) { return dataScript('BaseballPlayers', players || buildPlayers(), '테스트 자료'); }
function statsScript(stats) { return dataScript('BaseballStats', stats || buildStats(), '테스트 자료'); }

module.exports = {
  NOW, buildLive, buildPlayers, buildStats, liveScript, playersScript, statsScript, GAMES, NEWS, PROFILES, COUNTS,
  buildLivePs, postseasonFor, RAW_FINAL, PS_GAMES, standingsRows,
};
