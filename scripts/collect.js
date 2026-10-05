#!/usr/bin/env node
'use strict';
/* ===========================================================
   수집기 — GitHub Actions 가 주기적으로 실행한다 (이 PC 에서는 `npm run collect`)
   ---------------------------------------------------------
   만드는 것
     data/live.js     순위표·경기 결과·뉴스·가을야구 대진 (실행할 때마다. 가을야구는 정규시즌 막바지부터)
     data/players.js  구단별 명단·선수 프로필     (20시간에 한 번 — 하루에 한 번이면 충분하다)
     data/stats.js    선수 연도별 기록            (명단과 함께)

   시즌은 해마다 저절로 넘어간다: 올해 시즌 문서에 경기를 치른 순위표가 생기면 올해, 그 전에는 지난해 (P.chooseSeason).
   이 PC 에서 특정 시즌을 시험하려면 SEASON=2025 처럼 준다.

   왜 이런 구조인가 (AGENTS.md 4절)
   1. 브라우저에서 위키백과·RSS 를 직접 부르면 CORS 에 막히고, 열 때마다 남의 서버를 두드린다.
      그래서 서버 측(Actions 러너)에서 모아 정적 파일로 떨어뜨린다.
   2. JSON 이 아니라 .js 파일로 쓴다. index.html 을 더블클릭(file://)하면 fetch 는 막히지만 <script src> 는 된다.
   3. 외부 라이브러리를 쓰지 않는다. Node 내장 fetch 만 쓴다.
   4. KBO 공식 사이트·네이버 스포츠는 쓰지 않는다. robots.txt 로 자동 수집을 금지한다
      (KBO: "본 사이트의 데이터를 사전 승인 없이 자동 수집·크롤링·복제하는 행위를 금지합니다", 2026-10-01 확인).

   실패해도 사이트가 비지 않게
   - 출처 하나가 죽어도 나머지로 계속한다. 순위표·명단은 검사(validate)에 걸리면 지난 것을 그대로 쓴다.
   - 경기 결과·뉴스는 지난 파일과 합친다(피드는 하루치 정도만 담고 있다). 지난 파일은 저장소 사본과,
     PREV_BASE_URL(배포된 사이트 주소)을 주면 그쪽 것까지 읽어 합친다.
   - 쓰기 전에 전체를 검사하고, 걸리면 쓰지 않고 종료 코드 1 로 끝낸다 (기존 파일이 그대로 남는다).
   =========================================================== */

const fs = require('fs');
const path = require('path');
const P = require('./parsers.js');
const { TEAMS, SEASON_GAMES } = require('../teams.js');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const LIVE_FILE = 'live.js';
const PLAYERS_FILE = 'players.js';
const STATS_FILE = 'stats.js';   // 연도별 기록 — 선수 화면을 열 때만 싣는다(첫 화면을 무겁게 하지 않게)

/* 위키미디어 API 이용 규칙: 누가 부르는지 알 수 있는 User-Agent 를 단다(연락처는 저장소 주소). 요청은 하나씩 차례로. */
const UA = 'baseball-alimi/0.1 (+https://github.com/zenki798/baseball-alimi; personal, non-commercial)';
const TIMEOUT_MS = 20000;
const PLAYERS_MAX_AGE_H = 20;
const WIKI_BATCH = 50;          // 한 번에 받는 문서 수 (위키 API 상한)
const WIKI_PAUSE_MS = 300;      // 위키 요청 사이 쉬는 시간
const PS_FETCH_FROM_LEFT = 20;  // 팀당 남은 경기가 이만큼 이하로 줄면 가을야구 문서를 받기 시작한다 (9월 무렵)
const PS_DONE_REFRESH_H = 24;   // 우승팀이 정해진 뒤에는 가을야구 문서를 하루 한 번만 받는다

/* 2026-10-01 실제로 받아 내용까지 확인한 피드만 넣었다 (AGENTS.md 4절 표). 추측으로 넣지 않는다.
 * games: 이 피드의 "[프로야구 ○○전적]" 제목에서 경기 결과를 읽는다 (연합뉴스만 이 모양을 쓴다). */
const FEEDS = [
  { source: '연합뉴스', url: 'https://www.yna.co.kr/rss/sports.xml', games: true },
  { source: '뉴시스', url: 'https://newsis.com/RSS/sports.xml' },
  { source: '조선일보', url: 'https://www.chosun.com/arc/outboundfeeds/rss/category/sports/?outputType=xml' },
  { source: '경향신문', url: 'https://www.khan.co.kr/rss/rssdata/kh_sports.xml' },
  { source: 'SBS', url: 'https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=09' },
  { source: '일간스포츠', url: 'https://isplus.com/rss/' },
  { source: '동아일보', url: 'https://rss.donga.com/sports.xml' },
  { source: '한겨레', url: 'https://www.hani.co.kr/rss/sports/' },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const maxlagWait = attempt => (Number(process.env.COLLECT_MAXLAG_MS) || 5000) * (attempt + 1);
const retryMs = () => Number(process.env.COLLECT_RETRY_MS) || 3000;

function why(e) {
  if (!e) return '알 수 없음';
  const c = e.cause && (e.cause.code || e.cause.message);
  return (e.message || String(e)) + (c ? ' (' + c + ')' : '');
}

/* ---------- 받기 ---------- */

async function fetchOnce(url, accept) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA, Accept: accept || '*/*' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

/** 끊기거나 5xx 면 잠깐 쉬고 한 번 더. 4xx 는 다시 받아도 같으므로 바로 실패 */
async function download(url, accept) {
  try {
    return await fetchOnce(url, accept);
  } catch (e) {
    if (/^HTTP 4/.test(e.message)) throw e;
    await sleep(retryMs());
    return fetchOnce(url, accept);
  }
}

/** XML 선언의 글자 인코딩대로 읽는다 (EUC-KR 피드 대비) */
function decodeXml(buf) {
  const head = buf.slice(0, 200).toString('latin1');
  const enc = (head.match(/encoding=["']([^"']+)/i) || [])[1];
  if (enc && !/utf-?8/i.test(enc)) {
    try { return new TextDecoder(enc).decode(buf); } catch (e) { /* 모르는 인코딩이면 UTF-8 로 */ }
  }
  return buf.toString('utf8');
}

async function wikiQuery(host, params) {
  const u = new URL('https://' + host + '/w/api.php');
  /* maxlag 는 위키백과에만 단다. 위키데이터는 검색 서버(WDQS) 지연까지 더해 계산해서 늘 5초를 넘는다(2026-10-02 측정 6.5초).
     위키데이터에는 하루 몇 번 읽기만 하므로 지연 조건 없이 묻는다 */
  const lag = host === 'www.wikidata.org' ? {} : { maxlag: '5' };
  u.search = new URLSearchParams(Object.assign({ format: 'json', formatversion: '2' }, lag, params)).toString();
  /* maxlag: 위키 DB 복제가 5초 넘게 밀리면 API 가 잠깐 거절한다(2026-10-02 실제로 세 번 연속 겪음). 5·10·15·20초 쉬며 다시 묻는다 */
  for (let attempt = 0; attempt < 5; attempt++) {
    const j = JSON.parse((await download(u.toString(), 'application/json')).toString('utf8'));
    if (j.error && j.error.code === 'maxlag') { await sleep(maxlagWait(attempt)); continue; }
    if (j.error) throw new Error('위키 API ' + j.error.code + ': ' + j.error.info);
    return j;
  }
  throw new Error('위키 API 가 계속 바쁘다(maxlag)');
}

/**
 * 문서 여러 개를 받아 { 요청한 제목 → { title, content, timestamp } } 로. 없는 문서는 빠진다.
 * section0: 첫 부분(정보 상자가 있는 곳)만 — 선수 문서 전체를 받지 않는다.
 */
async function wikiPages(host, titles, section0) {
  const out = new Map();
  const uniq = Array.from(new Set(titles.filter(Boolean)));
  for (let i = 0; i < uniq.length; i += WIKI_BATCH) {
    const batch = uniq.slice(i, i + WIKI_BATCH);
    const params = { action: 'query', prop: 'revisions', rvprop: 'content|timestamp', rvslots: 'main', redirects: '1', titles: batch.join('|') };
    if (section0) params.rvsection = '0';
    let cont = {};
    const alias = new Map();
    const pages = new Map();
    do {
      const j = await wikiQuery(host, Object.assign({}, params, cont));
      const q = j.query || {};
      (q.normalized || []).concat(q.redirects || []).forEach(n => alias.set(n.from, n.to));
      (q.pages || []).forEach(p => {
        if (!p.missing && p.revisions && p.revisions[0]) {
          pages.set(p.title, { title: p.title, content: p.revisions[0].slots.main.content, timestamp: p.revisions[0].timestamp });
        }
      });
      cont = j.continue || null;
      if (cont) await sleep(WIKI_PAUSE_MS);
    } while (cont);
    batch.forEach(t => {
      let cur = t;
      for (let k = 0; k < 5 && alias.has(cur); k++) cur = alias.get(cur);
      if (pages.has(cur)) out.set(t, pages.get(cur));
    });
    if (i + WIKI_BATCH < uniq.length) await sleep(WIKI_PAUSE_MS);
  }
  return out;
}

const wikiUrl = (host, title) => 'https://' + host + '/wiki/' + encodeURIComponent(title.replace(/ /g, '_'));

/**
 * 정보 상자에 사진이 없는 선수 문서 → 위키데이터의 "대표 사진"(P18) 파일 이름. Map(문서 제목 → 파일 이름)
 * 2026-10-02 시험: 사진 없는 590명 중 12명을 더 찾았다(주로 외국인 선수 — 영어권 문서의 사진).
 */
async function wikidataImages(titles) {
  const out = new Map();
  const qid = new Map();   // 위키데이터 항목 → 요청한 문서 제목
  const uniq = Array.from(new Set(titles.filter(Boolean)));
  for (let i = 0; i < uniq.length; i += WIKI_BATCH) {
    const batch = uniq.slice(i, i + WIKI_BATCH);
    const j = await wikiQuery('ko.wikipedia.org', { action: 'query', prop: 'pageprops', ppprop: 'wikibase_item', redirects: '1', titles: batch.join('|') });
    const q = j.query || {};
    const alias = new Map();
    (q.normalized || []).concat(q.redirects || []).forEach(n => alias.set(n.from, n.to));
    const item = new Map((q.pages || []).filter(p => p.pageprops && p.pageprops.wikibase_item).map(p => [p.title, p.pageprops.wikibase_item]));
    batch.forEach(t => {
      let cur = t;
      for (let k = 0; k < 5 && alias.has(cur); k++) cur = alias.get(cur);
      if (item.has(cur)) qid.set(item.get(cur), t);
    });
    await sleep(WIKI_PAUSE_MS);
  }
  const ids = Array.from(qid.keys());
  for (let i = 0; i < ids.length; i += WIKI_BATCH) {
    const j = await wikiQuery('www.wikidata.org', { action: 'wbgetentities', ids: ids.slice(i, i + WIKI_BATCH).join('|'), props: 'claims' });
    Object.keys(j.entities || {}).forEach(id => {
      const claims = ((j.entities[id].claims || {}).P18 || []).filter(c => c.rank !== 'deprecated' && c.mainsnak && c.mainsnak.datavalue);
      const best = claims.find(c => c.rank === 'preferred') || claims[0];
      const file = best ? P.photoFileName(String(best.mainsnak.datavalue.value)) : null;
      if (file && qid.has(id)) out.set(qid.get(id), file);
    });
    if (i + WIKI_BATCH < ids.length) await sleep(WIKI_PAUSE_MS);
  }
  return out;
}

/**
 * 사진 파일들의 라이선스·작성자·썸네일 주소 → Map(파일 이름 → 사진 정보 | null).
 * 한국어 위키 API 에 물으면 위키미디어 공용(Commons) 파일도 함께 답한다. 썸네일 폭 330 은 위키미디어가
 * 미리 만들어 두는 표준 폭 가운데 하나다(임의 폭은 거절되거나 느릴 수 있다).
 */
async function wikiImageInfo(host, files) {
  const out = new Map();
  const uniq = Array.from(new Set(files.filter(Boolean)));
  for (let i = 0; i < uniq.length; i += WIKI_BATCH) {
    const batch = uniq.slice(i, i + WIKI_BATCH);
    const j = await wikiQuery(host, {
      action: 'query', prop: 'imageinfo', iiprop: 'url|mime|size|extmetadata', iiurlwidth: '330',
      iiextmetadatafilter: 'Artist|Credit|LicenseShortName|LicenseUrl|AttributionRequired',
      titles: batch.map(f => 'File:' + f).join('|'),
    });
    const q = j.query || {};
    const alias = new Map();
    (q.normalized || []).concat(q.redirects || []).forEach(n => alias.set(n.from, n.to));
    const pages = new Map((q.pages || []).map(p => [p.title, p]));
    batch.forEach(f => {
      let cur = 'File:' + f;
      for (let k = 0; k < 5 && alias.has(cur); k++) cur = alias.get(cur);
      out.set(f, P.parseImageInfo(pages.get(cur)));
    });
    if (i + WIKI_BATCH < uniq.length) await sleep(WIKI_PAUSE_MS);
  }
  /* 누르면 크게 보는 사진(960px, 역시 표준 폭). 원본이 그보다 작으면 위키 API 가 원본 주소를 준다.
     못 받으면 확대 화면은 작은 사진(330px)을 그대로 키워 보여 준다 */
  const usable = uniq.filter(f => out.get(f));
  for (let i = 0; i < usable.length; i += WIKI_BATCH) {
    const batch = usable.slice(i, i + WIKI_BATCH);
    try {
      await sleep(WIKI_PAUSE_MS);
      const j = await wikiQuery(host, { action: 'query', prop: 'imageinfo', iiprop: 'url|size', iiurlwidth: '960', titles: batch.map(f => 'File:' + f).join('|') });
      const q = j.query || {};
      const alias = new Map();
      (q.normalized || []).concat(q.redirects || []).forEach(n => alias.set(n.from, n.to));
      const pages = new Map((q.pages || []).map(p => [p.title, p]));
      batch.forEach(f => {
        let cur = 'File:' + f;
        for (let k = 0; k < 5 && alias.has(cur); k++) cur = alias.get(cur);
        const large = P.parseImageSize(pages.get(cur));
        if (large) out.get(f).large = large;
      });
    } catch (e) {
      console.warn('  큰 사진 주소를 못 받음 (작은 사진으로 확대한다): ' + why(e));
    }
  }
  return out;
}

/* ---------- 지난 자료 ---------- */

/** "window.X = {...};" 파일에서 자료만 꺼낸다 */
function parseDataScript(text, name) {
  const m = String(text).match(new RegExp('window\\.' + name + '\\s*=\\s*([\\s\\S]*?);\\s*$'));
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch (e) { return null; }
}

function readLocal(file, name) {
  try { return parseDataScript(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'), name); } catch (e) { return null; }
}

async function readRemote(base, file, name) {
  if (!base) return null;
  try {
    const url = base.replace(/\/+$/, '') + '/data/' + file + '?t=' + Date.now();
    return parseDataScript((await fetchOnce(url, 'text/javascript')).toString('utf8'), name);
  } catch (e) {
    console.warn('  지난 자료(배포본)를 못 읽음: ' + why(e));
    return null;
  }
}

const newer = (a, b) => (!a ? b : !b ? a : (a.generatedAt || '') >= (b.generatedAt || '') ? a : b);

/* ---------- 조립 (네트워크 없음 — 테스트가 직접 부른다) ---------- */

/** 순위표: 이번에 읽은 것이 검사를 통과하고 지난 것보다 오래되지 않았을 때만 바꾼다 */
function pickStandings(fresh, prev, log) {
  if (fresh) {
    const problems = fresh.problems.concat(P.validateStandings(fresh));
    if (!problems.length) {
      if (prev && prev.asOf && prev.asOf > fresh.asOf) {
        log('  순위표: 위키 기준일(' + fresh.asOf + ')이 지난 자료(' + prev.asOf + ')보다 이르다 — 지난 것 유지');
        return prev;
      }
      return fresh;
    }
    log('  순위표 검사 실패 — 지난 것 유지: ' + problems.join(' / '));
  }
  return prev || null;
}

/** 가을야구 문서를 받을 때인가: 팀당 남은 경기가 PS_FETCH_FROM_LEFT 이하이거나 정규시즌이 끝났을 때.
 *  우승팀까지 정해진 뒤에는 하루 한 번만(겨울 내내 30분마다 같은 문서를 두드리지 않게) */
function wantPostseason(standings, prevPs, now) {
  if (process.env.FORCE_PS === '1') return true;
  if (prevPs && prevPs.champion && prevPs.fetchedAt && now - new Date(prevPs.fetchedAt) < PS_DONE_REFRESH_H * 3600000) return false;
  if (prevPs || (standings && standings.final)) return true;
  const rows = (standings && standings.rows) || [];
  return rows.length > 0 && Math.min.apply(null, rows.map(r => r.games)) >= SEASON_GAMES - PS_FETCH_FROM_LEFT;
}

/** 가을야구 대진 — 위키 두 문서·순위표·연합뉴스 PS 전적·지난 자료를 합친다(P.buildPostseason). 검사에 걸리면 지난 것을 쓴다 */
function pickPostseason(o, standings, psGames, prevPs, now, log) {
  const pages = o.psPages || null;
  const season = o.season;
  let ps;
  try {
    ps = P.buildPostseason({
      season, standings, newsGames: psGames, prev: prevPs, today: P.kstDate(now),
      psText: pages && pages.ps ? pages.ps.content : null,
      ksText: pages && pages.ks ? pages.ks.content : null,
    });
  } catch (e) {
    log('  포스트시즌 읽기 실패 — 지난 것 유지: ' + why(e));
    return prevPs || null;
  }
  if (!ps) return null;
  const problems = P.validatePostseason(ps);
  if (problems.length) {
    log('  포스트시즌 검사 실패 — 지난 것 유지: ' + problems.join(' / '));
    return prevPs || null;
  }
  const got = pages ? [pages.ps && [season + '년 KBO 포스트시즌', pages.ps], pages.ks && [season + '년 한국시리즈', pages.ks]].filter(Boolean) : [];
  ps.fetchedAt = got.length ? now.toISOString() : (prevPs && prevPs.fetchedAt) || null;
  ps.sources = got.length
    ? got.map(([title, pg]) => ({ name: '위키백과(한국어) 「' + title + '」', url: wikiUrl('ko.wikipedia.org', title), license: 'CC BY-SA 4.0', revision: pg.timestamp || null }))
    : (prevPs && prevPs.sources) || [];
  return ps;
}

/**
 * @param {object} o
 * @param {string|null} o.wikiText     영문 위키 시즌 문서 원문 (못 받았으면 null)
 * @param {string|null} o.wikiRevision 그 판의 시각
 * @param {Array<{feed, xml}>} o.feeds  받은 피드
 * @param {object|null} o.prev          지난 live 자료
 * @param {Date} o.now
 * @param {number} o.season
 * @param {{ps, ks}|null} o.psPages     한국어 위키 「<시즌>년 KBO 포스트시즌」·「<시즌>년 한국시리즈」 (안 받았으면 null, 문서가 없으면 그 칸이 null)
 */
function buildLive(o) {
  const log = o.log || (() => {});
  const now = new Date(o.now || Date.now());
  const season = o.season;
  /* 순위표·경기 결과·가을야구는 같은 시즌 것만 이어 쓴다. 뉴스는 시즌과 관계없이 이어 간다(새 시즌으로 넘어가는 날에도 사흘치가 남게) */
  const prev = o.prev && o.prev.season === season ? o.prev : null;

  let fresh = null;
  if (o.wikiText) {
    const parsed = P.parseStandings(o.wikiText);
    const title = season + ' KBO League season';
    fresh = {
      /* 시즌이 끝난 표에는 "as of" 날짜가 없다 — 그 판을 고친 날(한국 날짜)을 기준일로 쓴다 */
      asOf: parsed.asOf || (parsed.final ? P.kstDate(o.wikiRevision || now) : null),
      final: parsed.final,
      fetchedAt: now.toISOString(),
      source: {
        name: '위키백과(영문) 「' + title + '」',
        url: wikiUrl('en.wikipedia.org', title),
        license: 'CC BY-SA 4.0',
        revision: o.wikiRevision || null,
      },
      rows: P.computeStandings(parsed.rows),
      problems: parsed.problems,
    };
  }
  const standings = pickStandings(fresh, prev && prev.standings, log);
  if (standings) {
    delete standings.problems;
    if (typeof standings.final !== 'boolean') standings.final = false;   // final 칸이 생기기 전에 만든 지난 자료
  }

  const games = [];
  const psGames = [];   // 포스트시즌 전적 — 정규시즌 경기 목록이 아니라 가을야구 대진으로 간다
  const news = [];
  const seen = new Set();
  (o.feeds || []).forEach(({ feed, xml }) => {
    P.parseFeed(xml, feed, now).forEach(it => {
      if (feed.games) {
        const g = P.parseGameTitle(it.title, it.publishedAt, it.rawSummary);
        if (g) {
          /* 이상한 한 건은 그 경기만 뺀다. 2026-10-04 프로농구 점수(81-76) 한 건 때문에 검사가 자료 전체를 버려 하루 동안 갱신이 멈췄다 */
          const bad = P.gameProblems(g);
          if (bad.length) log('  경기 결과 한 건을 뺌 (' + bad.join(', ') + '): ' + g.id + ' — ' + it.title);
          else (g.stage ? psGames : games).push(Object.assign(g, { source: it.url }));
          return;
        }
      }
      if (P.isListArticle(it.title) || !P.isBaseball(it.title, it.summary)) return;
      const id = P.hashId(P.canonicalUrl(it.url));
      if (seen.has(id)) return;
      seen.add(id);
      /* 구단은 제목에서 먼저 찾는다. 요약에는 사진 설명("KIA 와 삼성의 경기")처럼 곁가지 구단이 섞인다 */
      let teams = P.teamsOf(it.title);
      if (!teams.length) teams = P.teamsOf(it.summary);
      news.push({
        id, title: it.title, summary: it.summary.replace(/^▲\s*/, ''), url: it.url, source: it.source,
        publishedAt: it.publishedAt, topics: P.topicsOf(it.title, it.summary, teams), teams,
      });
    });
  });

  const postseason = pickPostseason(o, standings, P.mergeGames([], psGames, season, now), prev && prev.postseason, now, log);

  const out = {
    version: 1,
    season,
    generatedAt: now.toISOString(),
    standings: standings || null,
    games: P.mergeGames(prev && prev.games, games, season, now),
    news: P.mergeNews(o.prev && o.prev.news, news, now),
    sources: {
      news: Array.from(new Set((o.feeds || []).map(f => f.feed.source))),
      games: '연합뉴스 전적 기사 제목',
    },
  };
  if (postseason) out.postseason = postseason;
  return out;
}

/**
 * @param {object} o
 * @param {Map<string,{content,timestamp}>} o.rosterPages  명단 틀 제목 → 원문
 * @param {Map<string,{content}>} o.profilePages           선수 문서 제목 → 첫 부분 원문
 * @param {object|null} o.prev                              지난 players 자료
 * @param {Date} o.now
 */
function buildPlayers(o) {
  const log = o.log || (() => {});
  const now = new Date(o.now || Date.now());
  const prev = o.prev || null;
  const rosters = {};
  const owners = new Map();   // 문서 제목 → { team, number }  (프로필이 맞는 사람인지 볼 때)

  TEAMS.forEach(team => {
    const page = o.rosterPages && o.rosterPages.get(team.roster);
    let roster = null;
    if (page) {
      const r = P.parseRoster(page.content);
      const problems = P.validateRoster(r);
      if (!problems.length) {
        const ids = new Set();
        const players = [];
        r.players.forEach(pl => {
          const key = pl.wiki || pl.name;
          const id = team.id + '-' + P.hashId(key);
          if (ids.has(id)) return;   // 틀에 같은 사람이 두 번 적힌 경우
          ids.add(id);
          players.push(Object.assign({ id }, pl, pl.number !== null && pl.number >= 100 ? { dev: true } : {}));
        });
        roster = {
          asOf: page.timestamp || null,
          source: { name: '위키백과(한국어) 「' + team.roster + '」', url: wikiUrl('ko.wikipedia.org', team.roster), license: 'CC BY-SA 4.0' },
          manager: r.manager, coaches: r.coaches, players, military: r.military,
        };
      } else {
        log('  ' + team.short + ' 명단 검사 실패 — 지난 것 유지: ' + problems.join(' / '));
      }
    }
    if (!roster && prev && prev.rosters && prev.rosters[team.id]) roster = prev.rosters[team.id];
    if (roster) {
      rosters[team.id] = roster;
      roster.players.forEach(pl => { if (pl.wiki) owners.set(pl.wiki, { team, number: pl.number }); });
      if (roster.manager && roster.manager.wiki) owners.set(roster.manager.wiki, { team, number: roster.manager.number });
    }
  });

  const prevProfiles = new Map(((prev && prev.profiles) || []).map(p => [p.wiki, p]));
  const profiles = [];
  let fresh = 0, kept = 0, dropped = 0, photos = 0;
  owners.forEach((own, wiki) => {
    const page = o.profilePages && o.profilePages.get(wiki);
    if (page) {
      const prof = P.parseProfile(page.content);
      if (prof && P.profileMatchesTeam(prof, own.team, own.number)) {
        /* 사진: 이번에 라이선스를 확인한 것만 붙인다. 확인을 못 했으면(요청 실패) 지난번에 확인한 같은 파일의 것을 쓴다 */
        let photo = null;
        /* 정보 상자의 사진이 먼저, 없으면 위키데이터 대표 사진(photoFallback) */
        const file = prof.photoFile || (o.photoFallback && o.photoFallback.get(wiki)) || null;
        if (file) {
          const info = o.photoInfo && o.photoInfo.get(file);
          if (info) photo = Object.assign({ file, caption: prof.photoFile ? prof.photoCaption : null }, info);
          else if (!o.photoInfo || o.photoFailed) {
            const old = prevProfiles.get(wiki);
            if (old && old.photo && old.photo.file === file) photo = old.photo;
          }
        }
        delete prof.team;
        delete prof.number;
        delete prof.photoFile;
        delete prof.photoCaption;
        if (photo) { prof.photo = photo; photos++; }
        profiles.push(Object.assign({ wiki }, prof));
        fresh++;
      } else if (prof) dropped++;
      return;
    }
    if (!o.profilePages || o.profileFailed) {
      const old = prevProfiles.get(wiki);   // 이번에 못 받았으면 지난 것
      if (old) { profiles.push(old); kept++; }
    }
  });
  log('  프로필: 새로 ' + fresh + '명(사진 ' + photos + '장), 지난 것 ' + kept + '명, 다른 사람 문서로 보여 뺌 ' + dropped + '명');

  return { version: 1, generatedAt: now.toISOString(), rosters, profiles };
}

/**
 * 연도별 기록 (data/stats.js) — 선수 문서의 「통산 기록」 표와 KBO 공식 기록 번호.
 * buildPlayers 가 "이 구단의 그 사람" 으로 확인한 문서만 쓴다. 감독은 뺀다(선수 시절 기록이 지금 기록처럼 보인다).
 * 선수 문서를 못 받은 차례에는 지난 기록을 그대로 쓴다.
 * @param {object} o  { players, profilePages, profileFailed, prev, now, season }
 */
function buildStats(o) {
  const log = o.log || (() => {});
  const now = new Date(o.now || Date.now());
  const prevBy = new Map(((o.prev && o.prev.players) || []).map(s => [s.wiki, s]));
  const playerWikis = new Set();
  const rosters = (o.players && o.players.rosters) || {};
  Object.keys(rosters).forEach(id => rosters[id].players.forEach(p => { if (p.wiki) playerWikis.add(p.wiki); }));
  const out = [];
  let fresh = 0, kept = 0;
  ((o.players && o.players.profiles) || []).forEach(prof => {
    const wiki = prof.wiki;
    if (!playerWikis.has(wiki)) return;
    const page = o.profilePages && o.profilePages.get(wiki);
    if (page) {
      const st = P.parseCareerStats(page.content, o.season);
      const kbo = P.parseKboIds(page.content);
      if (st || kbo) { out.push(Object.assign({ wiki, kbo: kbo || null }, st || {})); fresh++; }
      return;
    }
    if (!o.profilePages || o.profileFailed) {
      const old = prevBy.get(wiki);
      if (old) { out.push(old); kept++; }
    }
  });
  let latest = 0;
  out.forEach(s => ['bat', 'pit'].forEach(k => (s[k] ? s[k].rows : []).forEach(r => { latest = Math.max(latest, Number(r[0]) || 0); })));
  log('  연도별 기록: 새로 ' + fresh + '명, 지난 것 ' + kept + '명 (가장 최근 시즌 ' + (latest || '-') + ')');
  return { version: 1, generatedAt: now.toISOString(), latestSeason: latest || null, players: out };
}

/* ---------- 쓰기 ---------- */

/** git 차이를 사람이 읽을 수 있게: 기사·경기·선수 하나가 한 줄 (커밋 전 diff 확인 — AGENTS.md 규칙 2) */
function pretty(v, depth) {
  depth = depth || 0;
  const pad = '  '.repeat(depth + 1);
  const end = '  '.repeat(depth);
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    if (v.every(x => x === null || typeof x !== 'object')) return JSON.stringify(v);
    return '[\n' + v.map(x => pad + JSON.stringify(x)).join(',\n') + '\n' + end + ']';
  }
  if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    if (!keys.length) return '{}';
    if (depth >= 3) return JSON.stringify(v);
    return '{\n' + keys.map(k => pad + JSON.stringify(k) + ': ' + pretty(v[k], depth + 1)).join(',\n') + '\n' + end + '}';
  }
  return JSON.stringify(v);
}

function dataScript(name, payload, note) {
  return '/* 자동 생성 파일 — 직접 고치지 마세요. scripts/collect.js 가 만듭니다 (AGENTS.md 4절).\n' +
    '   ' + note + ' */\n' +
    'window.' + name + ' = ' + pretty(payload) + ';\n';
}

function writeData(file, name, payload, note) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const dest = path.join(DATA_DIR, file);
  const tmp = dest + '.tmp';
  fs.writeFileSync(tmp, dataScript(name, payload, note), 'utf8');
  fs.renameSync(tmp, dest);   // 반쯤 쓴 파일이 남지 않게
  return dest;
}

/* ---------- 실행 ---------- */

async function main() {
  const now = new Date();
  const force = process.env.FORCE_PLAYERS === '1';
  const base = process.env.PREV_BASE_URL || '';
  console.log('야구알리미 수집 — ' + now.toISOString());

  const localLive = readLocal(LIVE_FILE, 'BaseballLive');
  const remoteLive = await readRemote(base, LIVE_FILE, 'BaseballLive');
  const prevLive = newer(localLive, remoteLive);
  const prevPlayers = newer(readLocal(PLAYERS_FILE, 'BaseballPlayers'), await readRemote(base, PLAYERS_FILE, 'BaseballPlayers'));
  const prevStats = newer(readLocal(STATS_FILE, 'BaseballStats'), await readRemote(base, STATS_FILE, 'BaseballStats'));

  let failed = 0;

  /* 시즌과 순위표. 해마다 저절로 넘어간다: 올해 문서에 경기를 치른 순위표가 생기면(3월 개막) 올해,
     그 전(겨울·초봄)에는 지난해 시즌의 최종 순위와 가을야구 결과를 그대로 보여 준다 (P.chooseSeason) */
  const year = Number(P.kstDate(now).slice(0, 4));
  let season = Number(process.env.SEASON) || null;
  let wikiText = null, wikiRevision = null;
  try {
    const want = season || year;
    const title = want + ' KBO League season';
    const page = (await wikiPages('en.wikipedia.org', [title], false)).get(title) || null;
    if (!season) season = P.chooseSeason(page ? page.content : null, now, prevLive && prevLive.season);
    let use = season === want ? page : null;
    if (season !== want) {
      console.log('  ' + want + ' 시즌은 아직 경기를 치르지 않았다 — ' + season + ' 시즌을 그대로 보여 준다');
      const t2 = season + ' KBO League season';
      await sleep(WIKI_PAUSE_MS);
      use = (await wikiPages('en.wikipedia.org', [t2], false)).get(t2) || null;
    }
    if (!use) throw new Error('문서 없음: ' + season + ' KBO League season');
    wikiText = use.content;
    wikiRevision = use.timestamp;
    console.log('  ok   순위표 원문 ' + season + ' (' + use.timestamp + ')');
  } catch (e) {
    failed++;
    if (!season) season = P.chooseSeason(undefined, now, prevLive && prevLive.season);
    console.warn('  FAIL 순위표 원문: ' + why(e));
  }
  console.log('  시즌 ' + season);

  /* 경기·뉴스는 두 사본을 합친다 — 한쪽이 놓친 것이 있을 수 있다 */
  if (localLive && remoteLive) {
    prevLive.games = P.mergeGames(localLive.games, remoteLive.games, season, now);
    prevLive.news = P.mergeNews(localLive.news, remoteLive.news, now);
  }

  /* 가을야구 문서 (한국어 위키) — 정규시즌 막바지부터. 두 문서를 한 번에 묻는다. 아직 없는 문서는 빠진다 */
  let psPages = null;
  const parsedSt = wikiText ? P.parseStandings(wikiText) : null;
  const stNow = parsedSt && parsedSt.rows.length ? parsedSt : prevLive && prevLive.season === season ? prevLive.standings : null;
  const prevPs = prevLive && prevLive.season === season ? prevLive.postseason || null : null;
  if (wantPostseason(stNow, prevPs, now)) {
    const titles = [season + '년 KBO 포스트시즌', season + '년 한국시리즈'];
    try {
      const pages = await wikiPages('ko.wikipedia.org', titles, false);
      psPages = { ps: pages.get(titles[0]) || null, ks: pages.get(titles[1]) || null };
      console.log('  ok   가을야구 문서 ' + titles.filter(t => pages.get(t)).map(t => '「' + t + '」').join('·') + (pages.size ? '' : ' (아직 없음)'));
    } catch (e) {
      failed++;
      console.warn('  FAIL 가을야구 문서: ' + why(e));
    }
  }

  /* 피드 — 서로 다른 언론사 서버라 나란히 받는다 */
  const results = await Promise.allSettled(FEEDS.map(async feed => ({ feed, xml: decodeXml(await download(feed.url, 'application/rss+xml, application/xml, text/xml, */*')) })));
  const feeds = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') { feeds.push(r.value); console.log('  ok   ' + FEEDS[i].source); }
    else { failed++; console.warn('  FAIL ' + FEEDS[i].source + ': ' + why(r.reason) + '  ' + FEEDS[i].url); }
  });

  const live = buildLive({ wikiText, wikiRevision, feeds, psPages, prev: prevLive, now, season, log: console.log });

  /* 명단·프로필: 하루 한 번 */
  let players = prevPlayers;
  let stats = prevStats;
  const ageH = prevPlayers ? (now - new Date(prevPlayers.generatedAt)) / 3600000 : Infinity;
  /* 연도별 기록 파일이 아직 없으면(처음 만드는 차례) 명단 주기를 기다리지 않고 받는다 */
  if (force || ageH > PLAYERS_MAX_AGE_H || P.validatePlayers(prevPlayers).length || !prevStats) {
    let rosterPages = new Map();
    try {
      rosterPages = await wikiPages('ko.wikipedia.org', TEAMS.map(t => t.roster), false);
      console.log('  ok   명단 틀 ' + rosterPages.size + '/' + TEAMS.length);
    } catch (e) {
      failed++;
      console.warn('  FAIL 명단 틀: ' + why(e));
    }
    const titles = [];
    TEAMS.forEach(t => {
      const pg = rosterPages.get(t.roster);
      const r = pg ? P.parseRoster(pg.content) : (prevPlayers && prevPlayers.rosters && prevPlayers.rosters[t.id]);
      if (!r) return;
      if (r.manager && r.manager.wiki) titles.push(r.manager.wiki);
      r.players.forEach(pl => { if (pl.wiki) titles.push(pl.wiki); });
    });
    let profilePages = null, profileFailed = false;
    try {
      /* 문서 전체를 받는다 — 정보 상자(첫 부분)뿐 아니라 뒤쪽의 「통산 기록」 표와 KBO 기록 번호 틀도 쓴다 (50개씩 약 15번) */
      profilePages = await wikiPages('ko.wikipedia.org', titles, false);
      console.log('  ok   선수 문서 ' + profilePages.size + '/' + new Set(titles).size + ' (나머지는 위키에 문서가 없다)');
    } catch (e) {
      failed++;
      profileFailed = true;
      console.warn('  FAIL 선수 문서: ' + why(e));
    }
    /* 사진: 선수 문서의 사진 칸에 적힌 파일만, 자유 이용 라이선스인지 위키미디어에 묻는다 */
    let photoInfo = null, photoFailed = false, photoFallback = new Map();
    if (profilePages) {
      const files = [];
      const noPhoto = [];
      profilePages.forEach((pg, title) => {
        const pr = P.parseProfile(pg.content);
        if (pr && pr.photoFile) files.push(pr.photoFile);
        else if (pr) noPhoto.push(title);
      });
      try {
        photoFallback = await wikidataImages(noPhoto);
        console.log('  ok   위키데이터 대표 사진 ' + photoFallback.size + '장 (정보 상자에 사진이 없는 ' + noPhoto.length + '명 중)');
        photoFallback.forEach(f => files.push(f));
      } catch (e) {
        console.warn('  FAIL 위키데이터 대표 사진 (정보 상자 사진만 쓴다): ' + why(e));
      }
      try {
        photoInfo = await wikiImageInfo('ko.wikipedia.org', files);
        const usable = Array.from(photoInfo.values()).filter(Boolean).length;
        console.log('  ok   사진 정보 ' + usable + '/' + photoInfo.size + ' (자유 이용 라이선스인 것만 쓴다)');
      } catch (e) {
        failed++;
        photoFailed = true;
        console.warn('  FAIL 사진 정보: ' + why(e));
      }
    }
    /* 명단이나 선수 문서를 못 받았으면 지난 파일을 그대로 둔다. 새로 만든 척 시각을 바꾸면 20시간 동안 다시 받지 않는다 */
    if ((rosterPages.size < TEAMS.length || profileFailed) && prevPlayers) {
      console.warn('  명단·프로필 일부를 못 받아 지난 것을 그대로 둔다 — 다음 실행에서 다시 받는다');
    } else {
      players = buildPlayers({ rosterPages, profilePages, profileFailed, photoInfo, photoFailed, photoFallback, prev: prevPlayers, now, log: console.log });
      stats = buildStats({ players, profilePages, profileFailed, prev: prevStats, now, season, log: console.log });
    }
  } else {
    console.log('  명단·프로필은 ' + ageH.toFixed(1) + '시간 전 것을 그대로 쓴다 (' + PLAYERS_MAX_AGE_H + '시간마다 새로 받는다)');
  }

  const liveProblems = P.validateLive(live);
  const playerProblems = players ? P.validatePlayers(players) : ['명단 자료 없음'];
  if (!live.standings && !live.news.length && !live.games.length) liveProblems.push('순위표·뉴스·경기 결과를 하나도 얻지 못함');
  if (liveProblems.length) {
    console.error('\n자료 검사 실패 — 쓰지 않고 끝낸다(기존 파일 유지):\n  ' + liveProblems.slice(0, 20).join('\n  '));
    process.exit(1);
  }
  writeData(LIVE_FILE, 'BaseballLive', live, '순위표는 위키백과(CC BY-SA 4.0), 뉴스는 각 언론사 RSS 의 제목·링크·짧은 발췌만 담는다. 기사 본문은 저장하지 않는다.');
  if (players !== prevPlayers) {
    if (playerProblems.length) {
      console.error('\n명단 자료 검사 실패 — players.js 는 쓰지 않는다:\n  ' + playerProblems.slice(0, 20).join('\n  '));
      failed++;
    } else {
      writeData(PLAYERS_FILE, 'BaseballPlayers', players, '명단·프로필은 한국어 위키백과(CC BY-SA 4.0). 경기와 관계없는 신상(출신지·연봉·가족)은 담지 않는다.');
    }
  }
  if (stats !== prevStats && stats) {
    const statProblems = P.validateStats(stats);
    if (statProblems.length) {
      console.error('\n연도별 기록 검사 실패 — stats.js 는 쓰지 않는다:\n  ' + statProblems.slice(0, 20).join('\n  '));
      failed++;
    } else {
      writeData(STATS_FILE, 'BaseballStats', stats, '연도별 기록은 한국어 위키백과 선수 문서의 「통산 기록」 표(CC BY-SA 4.0). KBO 기록실은 긁지 않는다 — 올 시즌 공식 기록은 KBO 페이지 링크로 본다.');
    }
  }

  const prevAsOf = prevLive && prevLive.standings ? prevLive.standings.asOf : null;
  const psMark = ps => (ps ? ps.rounds.map(r => r.games.length + (r.winner || '')).join('/') + (ps.champion || '') : '');
  const changed = (live.standings && live.standings.asOf) !== prevAsOf || live.season !== (prevLive && prevLive.season) ||
    live.games.length !== ((prevLive && prevLive.games) || []).length || players !== prevPlayers ||
    psMark(live.postseason) !== psMark(prevPs);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'failed=' + failed + '\nchanged=' + changed + '\n');

  const ps = live.postseason;
  console.log('\n수집 완료 — 시즌 ' + live.season + ' · 순위표 기준 ' + (live.standings ? live.standings.asOf + (live.standings.final ? '(최종)' : '') : '없음') +
    ' · 경기 ' + live.games.length + ' · 뉴스 ' + live.news.length +
    (ps ? ' · 가을야구 ' + ps.rounds.map(r => r.short + ' ' + r.sides.map(s => s.wins).join('-')).join(', ') + (ps.champion ? ' · 우승 ' + ps.champion : '') : '') +
    ' · 명단 ' + (players ? Object.keys(players.rosters).length : 0) + '팀 · 출처 실패 ' + failed);
}

if (require.main === module) {
  main().catch(e => {
    console.error('수집 실패:', e && e.stack ? e.stack : e);
    process.exit(1);
  });
}

module.exports = { buildLive, buildPlayers, buildStats, pickStandings, wantPostseason, parseDataScript, dataScript, pretty, decodeXml, FEEDS, UA };
