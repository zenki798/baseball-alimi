/* 테스트용 가짜 자료 — data/live.js · data/players.js 와 같은 모양(AGENTS.md 5절 계약)
 *
 * - 선수·감독은 모두 가상 인물이다(가람·나래·다온, "KIA투수3" 등). 실제 선수에게 가짜 기록을 붙이지 않는다 (AGENTS.md 규칙 2).
 * - 기사 출처도 가상 이름(테스트일보·가상스포츠·예시통신)이다. 실제 언론사가 쓰지 않은 기사를 그 언론사 것처럼 보이게 하지 않는다.
 * - 순위는 리그 전체 승 = 패가 되게 짰다. 실제 검사(validateLive·validatePlayers)를 통과해야 한다(data.spec.js).
 * - 시각은 NOW(2026-10-02 금요일 12:00 한국 시각)에 맞춰 고정한다. 화면의 "30분 전"·"어제"·만 나이가 이 시각 기준이다.
 */
'use strict';

const { TEAMS } = require('../../teams.js');
const P = require('../../scripts/parsers.js');
const { dataScript } = require('../../scripts/collect.js');

const NOW = '2026-10-02T03:00:00.000Z';

function split(n) { return [Math.ceil(n / 2), Math.floor(n / 2)]; }

/* [구단, 승, 패, 무, 연속, 진출 여부] — NC·롯데는 승률이 같아 공동 6위 */
const RAW = [
  ['kt', 79, 53, 2, { type: 'W', n: 3 }, 'first'],
  ['samsung', 77, 54, 3, { type: 'W', n: 1 }, 'in'],
  ['lg', 73, 59, 2, { type: 'L', n: 2 }, 'in'],
  ['kia', 70, 62, 2, { type: 'L', n: 1 }, 'in'],
  ['doosan', 68, 63, 3, { type: 'W', n: 2 }, 'in'],
  ['nc', 64, 68, 2, { type: 'L', n: 3 }, null],
  ['lotte', 64, 68, 2, { type: 'W', n: 1 }, null],
  ['ssg', 59, 72, 3, { type: 'D', n: 1 }, 'out'],
  ['hanwha', 56, 76, 2, { type: 'L', n: 4 }, 'out'],
  ['kiwoom', 49, 84, 1, { type: 'W', n: 1 }, 'out'],
];

function standingsRows() {
  return P.computeStandings(RAW.map(([team, win, loss, draw, streak, status]) => {
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

function liveScript(live) { return dataScript('BaseballLive', live || buildLive(), '테스트 자료'); }
function playersScript(players) { return dataScript('BaseballPlayers', players || buildPlayers(), '테스트 자료'); }

module.exports = { NOW, buildLive, buildPlayers, liveScript, playersScript, GAMES, NEWS, PROFILES, COUNTS };
