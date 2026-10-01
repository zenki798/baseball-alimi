'use strict';
/* ===========================================================
   수집기의 "읽고 고르는" 함수 모음 — 네트워크를 쓰지 않는다.
   scripts/collect.js 가 받아 온 원문을 여기로 넘기고, tests/collector.spec.js 가
   이 함수들을 저장해 둔 견본(tests/fixtures/)으로 직접 검사한다.

   다루는 원문
   - 영문 위키백과 「<시즌> KBO League season」 문서의 정규시즌 순위표 (위키 문법)
   - 한국어 위키백과 「틀:<구단> 명단」 (현재 선수단)과 선수 문서 첫 부분의 「야구 선수 정보」 상자
   - 언론사 RSS (제목·링크·짧은 발췌·시각) — 연합뉴스 전적 기사 제목에서 경기 결과를 읽는다
   =========================================================== */

const { TEAMS, SEASON_GAMES } = require('../teams.js');

/* ---------- 글자 다루기 (작업4 뉴스알리미에서 검증된 것을 그대로 옮겼다) ---------- */

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
  hellip: '…', middot: '·', ndash: '–', mdash: '—', times: '×',
};

function safeChar(code) {
  if (!isFinite(code) || code < 0 || code > 0x10ffff) return '';
  try { return String.fromCodePoint(code); } catch (e) { return ''; }
}

function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => {
      const v = ENTITIES[name.toLowerCase()];
      return v === undefined ? m : v;
    });
}

/** CDATA 를 벗기고 태그를 없애고 공백을 정리한다. 이스케이프는 두 번 푼다
 *  (연합뉴스는 요약을 HTML 로 이스케이프한 뒤 XML 로 한 번 더 감싸 보낸다 — E&amp;amp;S). */
function clean(raw) {
  if (!raw) return '';
  let s = String(raw);
  s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  s = s.replace(/<[^>]*>/g, ' ');
  s = decodeEntities(decodeEntities(s));
  return s.replace(/\s+/g, ' ').trim();
}

/** <tag>...</tag> 안쪽을 꺼낸다 */
function pick(block, tag) {
  const m = block.match(new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + tag + '>', 'i'));
  return m ? m[1] : '';
}

/** Atom 의 <link href="..."/> 형태도 처리한다 */
function pickLink(block) {
  const plain = clean(pick(block, 'link'));
  if (/^https?:\/\//.test(plain)) return plain;
  const m = block.match(/<link[^>]*href=["']([^"']+)["']/i);
  return m ? decodeEntities(m[1]) : '';
}

/** 통신사·신문 머리말을 떼어낸다. "(서울=연합뉴스) 홍길동 기자 = ", "[서울=뉴시스] 홍길동 기자 = ",
 *  "[OSEN=잠실, 홍길동 기자] " 처럼 모양이 여럿이다. 기자 이름이 요약 맨 앞에 남지 않게 한다. */
function stripByline(s) {
  return String(s)
    .replace(/^[(\[][^)\]]{2,40}[)\]]\s*[^=]{0,25}?(기자|특파원|통신원|앵커)\s*=\s*/, '')
    .replace(/^[(\[][^)\]]{2,40}[)\]]\s*=\s*/, '')
    .replace(/^[(\[][^)\]]{0,30}(기자|특파원)\s*[)\]]\s*/, '')
    .replace(/^[가-힣]{2,4}\s*(기자|특파원)\s*=\s*/, '')
    .trim();
}

/** 요약에서 읽을거리가 아닌 것을 지운다. 이메일 주소(기자 메일)는 저장소에 넣지 않는다(AGENTS.md 규칙 2).
 *  자르기 전에 지워야 한다 — 잘린 뒤에는 "abc@news…" 처럼 모양이 깨져 안 걸린다. */
function scrubSummary(s) {
  return String(s)
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, ' ')
    .replace(/◎\s*공감언론\s*뉴시스/g, ' ')
    .replace(/후속\s*기사가\s*이어집니다\.?/g, ' ')
    .replace(/\[?\s*(?:사진|영상)\s*[=:]\s*[^\]\n]{1,30}\]?/g, ' ')
    .replace(/<?\s*(?:저작권자|ⓒ|©)[^>]*?(?:무단|금지)[^>]*>?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 문단 사이 줄바꿈을 그냥 지워 보내는 피드가 있다 ("세웠다.한국은행이"). 문장 끝 뒤에 한 칸 띄운다. */
function spaceSentences(s) {
  return String(s).replace(/다\.(?=[가-힣A-Za-z"'“‘(\[])/g, '다. ');
}

/** 문장 경계를 살려서 자른다 */
function truncate(s, max) {
  s = String(s || '');
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const dot = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('다.'), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  if (dot > max * 0.5) return cut.slice(0, dot + 1).trim();
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).trim() + '…';
}

/** 주소 쿼리 속 글 번호 (articleView.html?idxno=… 등). ? 앞만 보면 그 매체 기사가 전부 같은 주소로 보인다. */
function articleNo(url) {
  try {
    for (const v of new URL(url).searchParams.values()) if (/^\d{5,}$/.test(v)) return v;
  } catch (e) { /* 주소가 이상하면 번호 없음 */ }
  return '';
}

/** 중복 판단용 주소. 추적용 쿼리는 버리고 글 번호만 남긴다 */
function canonicalUrl(url) {
  const base = String(url).split('#')[0].split('?')[0].replace(/^http:/, 'https:');
  const no = articleNo(url);
  return no ? base + '?' + no : base;
}

/** 짧고 안정적인 id (FNV-1a 32비트 → 36진수). 같은 주소면 늘 같은 id 가 나온다. */
function hashId(s) {
  let h = 0x811c9dc5;
  const str = String(s);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

function isHttpUrl(u) {
  return typeof u === 'string' && /^https?:\/\/[^\s"'<>]+$/i.test(u);
}

/* ---------- 날짜 (한국 시간, 서머타임 없음) ---------- */

const KST_MS = 9 * 3600 * 1000;

/** 그 순간의 한국 날짜 'YYYY-MM-DD' */
function kstDate(t) {
  const d = new Date((t instanceof Date ? t.getTime() : new Date(t).getTime()) + KST_MS);
  return d.toISOString().slice(0, 10);
}

/** 시즌 연도. 1~2월은 아직 지난 시즌으로 본다 (새 시즌 문서에 순위표가 없다). */
function seasonFor(now) {
  const d = new Date(new Date(now).getTime() + KST_MS);
  const y = d.getUTCFullYear();
  return d.getUTCMonth() < 2 ? y - 1 : y;
}

/** RSS 시각. 시간대가 없는 "2026-10-01 23:32:22"(일간스포츠)는 한국 시각으로 읽는다.
 *  그냥 new Date() 에 넣으면 GitHub 서버(UTC)와 이 PC(KST)에서 9시간 다르게 읽힌다. */
function parseFeedDate(s) {
  const t = String(s || '').trim();
  if (!t) return null;
  let ms;
  const local = t.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)(?:\.\d+)?$/);
  if (local) ms = Date.parse(local[1] + 'T' + local[2] + '+09:00');
  else ms = Date.parse(t);
  return isNaN(ms) ? null : new Date(ms);
}

const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };

function ymd(y, m, d) {
  const yy = Number(y), mm = Number(m), dd = Number(d);
  if (!(yy > 1900 && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31)) return null;
  const dt = new Date(Date.UTC(yy, mm - 1, dd));
  if (dt.getUTCMonth() !== mm - 1) return null;   // 2월 30일 같은 날짜
  return dt.toISOString().slice(0, 10);
}

/* ---------- 위키 문법 ---------- */

/** text[start] 에서 시작하는 '{{' 의 짝 '}}' 바로 뒤 위치. 짝이 없으면 -1 */
function matchBraces(text, start) {
  let depth = 0;
  for (let i = start; i < text.length - 1; i++) {
    if (text[i] === '{' && text[i + 1] === '{') { depth++; i++; }
    else if (text[i] === '}' && text[i + 1] === '}') {
      depth--; i++;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/** 이름이 nameRe 에 맞는 첫 틀(template)의 안쪽 글. 없으면 null */
function findTemplate(text, nameRe) {
  const re = /\{\{\s*([^{}|\n]+?)\s*(?=\||\}\}|\n)/g;
  let m;
  while ((m = re.exec(String(text)))) {
    if (nameRe.test(m[1].replace(/_/g, ' ').trim())) {
      const end = matchBraces(text, m.index);
      if (end < 0) return null;
      return text.slice(m.index + 2, end - 2);
    }
  }
  return null;
}

/** 틀·링크([[a|b]], {{x|y}}) 안의 구분자는 건너뛰고 나눈다. sep 은 '|' 또는 '||' 같은 1~2글자 */
function splitTopLevel(s, sep) {
  const out = [];
  let t = 0, l = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const two = s.substr(i, 2);
    if (two === '{{') { t++; cur += two; i++; continue; }
    if (two === '}}' && t) { t--; cur += two; i++; continue; }
    if (two === '[[') { l++; cur += two; i++; continue; }
    if (two === ']]' && l) { l--; cur += two; i++; continue; }
    if (!t && !l && s.substr(i, sep.length) === sep) { out.push(cur); cur = ''; i += sep.length - 1; continue; }
    cur += s[i];
  }
  out.push(cur);
  return out;
}

/** 틀 안쪽 글 → { name, named: {키: 값}, positional: [] } */
function templateParams(body) {
  const parts = splitTopLevel(body, '|');
  const named = {}, positional = [];
  parts.slice(1).forEach(p => {
    const eq = p.indexOf('=');
    const key = eq > 0 ? p.slice(0, eq) : '';
    if (eq > 0 && !/\[\[|\{\{/.test(key)) named[key.trim()] = p.slice(eq + 1).trim();
    else positional.push(p.trim());
  });
  return { name: parts[0].trim(), named, positional };
}

/** 안쪽부터 틀을 지운다 ({{a|{{b}}}} 처럼 겹쳐 있어도) */
function removeTemplates(s) {
  let t = s, prev;
  do { prev = t; t = t.replace(/\{\{[^{}]*\}\}/g, ''); } while (t !== prev);
  return t;
}

/** 위키 문법을 걷어 낸 읽을 글 */
function stripWiki(s) {
  let t = String(s || '');
  t = t.replace(/<!--[\s\S]*?-->/g, '');
  t = t.replace(/<ref[^>]*\/>/gi, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
  t = t.replace(/<br\s*\/?>/gi, ' / ');
  t = t.replace(/<nowiki\s*\/?>(?:<\/nowiki>)?/gi, '');
  t = removeTemplates(t);
  t = t.replace(/\[\[(?:파일|File|Image|그림|분류|Category):[^\]]*\]\]/gi, '');
  t = t.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2').replace(/\[\[([^\]]*)\]\]/g, '$1');
  t = t.replace(/\[https?:\/\/\S+\s([^\]]+)\]/g, '$1').replace(/\[https?:\/\/[^\]]+\]/g, '');
  t = t.replace(/'''?/g, '');
  t = t.replace(/<[^>]+>/g, '');
  t = decodeEntities(t);
  return t.replace(/\s+/g, ' ').replace(/^[\s/]+|[\s/]+$/g, '').trim();
}

/** "* 항목" 줄만 골라 읽을 글로 */
function listItems(s, max) {
  return String(s || '').split('\n')
    .filter(line => /^\s*\*/.test(line))
    .map(line => stripWiki(line.replace(/^\s*\*+\s*/, '')))
    .filter(Boolean)
    .slice(0, max || 10);
}

/* ---------- 위키 표 ---------- */

/** {| … |} 표 → 줄마다 칸 목록. 칸: { header, raw(위키 원문), text(읽을 글), rowspan, colspan } */
function parseWikiTable(tableText) {
  const rows = [];
  let row = null;
  for (const rawLine of String(tableText).split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('{|') || line.startsWith('|+')) continue;
    if (line.startsWith('|}')) break;
    if (line.startsWith('|-')) { row = { attrs: line.slice(2), cells: [] }; rows.push(row); continue; }
    if (line[0] === '!' || line[0] === '|') {
      if (!row) { row = { attrs: '', cells: [] }; rows.push(row); }
      const header = line[0] === '!';
      const body = line.replace(/^(\|\||!!|\||!)/, '');
      let parts = splitTopLevel(body, '||');
      if (header) parts = [].concat(...parts.map(p => splitTopLevel(p, '!!')));
      parts.forEach(p => row.cells.push(parseCell(p, header)));
    } else if (row && row.cells.length) {
      const last = row.cells[row.cells.length - 1];
      Object.assign(last, parseCell(last.source + '\n' + line, last.header));
    }
  }
  return rows;
}

function parseCell(p, header) {
  const parts = splitTopLevel(p, '|');
  let attrs = '', content = p;
  if (parts.length >= 2 && /=/.test(parts[0]) && !/\[\[|\{\{/.test(parts[0])) {
    attrs = parts[0];
    content = parts.slice(1).join('|');
  }
  const rowspan = Number((attrs.match(/rowspan\s*=\s*"?(\d+)/i) || [])[1]) || 1;
  const colspan = Number((attrs.match(/colspan\s*=\s*"?(\d+)/i) || [])[1]) || 1;
  return { header, source: p, attrs, raw: content.trim(), text: stripWiki(content), rowspan, colspan };
}

/** 표 하나를 통째로 꺼낸다 ({| 부터 짝이 되는 |} 까지). 표 안의 표도 센다. */
function extractTable(text, from) {
  const start = text.indexOf('{|', from || 0);
  if (start < 0) return null;
  let depth = 0;
  const re = /^\s*(\{\||\|\})/gm;
  re.lastIndex = start;
  let m;
  while ((m = re.exec(text))) {
    if (m[1] === '{|') depth++;
    else if (--depth === 0) return { start, end: m.index + m[0].length, text: text.slice(start, m.index + m[0].length) };
  }
  return null;
}

/* ---------- 정규시즌 순위표 (영문 위키백과) ---------- */

function teamByWikiEn(name) {
  const n = String(name).replace(/_/g, ' ').trim().toLowerCase();
  return TEAMS.find(t => t.wikiEn.some(w => w.toLowerCase() === n)) || null;
}

/** 칸 안의 첫 링크가 구단이면 그 구단 */
function teamInCell(cell) {
  const re = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
  let m;
  while ((m = re.exec(cell.raw))) {
    const t = teamByWikiEn(m[1]);
    if (t) return t;
  }
  return teamByWikiEn(cell.text);
}

const INT = /^\d{1,3}$/;
const STREAK = /^([WLDT])\s?(\d{1,2})$/i;
const TRIPLE = /^(\d{1,3})\s*[–\-—]\s*(\d{1,3})\s*[–\-—]\s*(\d{1,3})$/;

/** 홈·원정 세 칸의 순서를 숫자 합으로 정한다 (승·무·패인지 승·패·무인지 표마다 다를 수 있다).
 *  둘 다 맞지 않으면 null — 틀린 순서로 보여 주느니 비워 둔다. */
function splitHomeAway(h, r, totals) {
  const orders = [['w', 'd', 'l'], ['w', 'l', 'd']];
  for (const o of orders) {
    const home = { [o[0]]: h[0], [o[1]]: h[1], [o[2]]: h[2] };
    const away = { [o[0]]: r[0], [o[1]]: r[1], [o[2]]: r[2] };
    if (home.w + away.w === totals.w && home.l + away.l === totals.l && home.d + away.d === totals.d) return { home, away };
  }
  return null;
}

function statusOf(text) {
  const t = String(text || '').toLowerCase();
  if (!t) return null;
  if (/did not|eliminat|not qualif/.test(t)) return 'out';
  if (/clinch(ed)?\s+(first|1st|regular season|pennant|korean series|ks)|korean series berth/.test(t)) return 'first';
  if (/qualif|clinch|advance|berth/.test(t)) return 'in';
  return null;
}

/**
 * 영문 위키백과 시즌 문서 → { asOf, rows: [{ team, games, win, loss, draw, streak, home, away, status }], problems }
 * 순위·승률·게임차는 여기서 다시 계산한다(computeStandings). 위키 표의 순위 칸은 공동 순위가 rowspan 으로
 * 합쳐져 있어 칸 수가 줄마다 다르다. 그래서 칸 위치가 아니라 "구단 칸 뒤의 숫자 넷 = 경기·승·패·무"처럼 모양으로 읽는다.
 */
function parseStandings(wikitext) {
  const text = String(wikitext || '');
  const problems = [];
  const reg = text.search(/^==\s*Regular season\s*==\s*$/mi);
  if (reg < 0) problems.push('"Regular season" 절이 없다');
  const st = text.slice(reg < 0 ? 0 : reg).search(/^===?\s*Standings\s*===?\s*$/mi);
  let from = reg < 0 ? 0 : reg + Math.max(0, st);
  let table = extractTable(text, from);
  /* 절 이름이 바뀌어도 표 제목(Regular season standings)으로 찾는다 */
  if (!table || !/regular season/i.test(table.text.slice(0, 300))) {
    const cap = text.search(/\|\+[^\n]*regular season standings/i);
    if (cap >= 0) table = extractTable(text, text.lastIndexOf('{|', cap));
  }
  if (!table) return { asOf: null, rows: [], problems: problems.concat('순위표를 찾지 못했다') };

  const after = text.slice(table.end, table.end + 600);
  const am = after.match(/correct as of\s+([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/i);
  const asOf = am && MONTHS[am[1].toLowerCase()] ? ymd(am[3], MONTHS[am[1].toLowerCase()], am[2]) : null;
  if (!asOf) problems.push('"Statistics are correct as of" 날짜가 없다');

  const rows = [];
  let carry = null;   // rowspan 으로 아래 줄까지 이어지는 진출 여부 칸
  for (const r of parseWikiTable(table.text)) {
    const idx = r.cells.findIndex(c => teamInCell(c));
    if (idx < 0) continue;
    const team = teamInCell(r.cells[idx]);
    const after2 = r.cells.slice(idx + 1);
    const nums = [];
    let k = 0;
    for (; k < after2.length && nums.length < 4; k++) {
      if (INT.test(after2[k].text)) nums.push(Number(after2[k].text));
      else if (nums.length) break;
    }
    if (nums.length < 4) { problems.push(team.short + ': 경기·승·패·무 칸을 못 읽음'); continue; }
    const [games, win, loss, draw] = nums;

    const rest = after2.slice(k);
    const si = rest.findIndex(c => STREAK.test(c.text));
    const sm = si >= 0 ? rest[si].text.match(STREAK) : null;
    const streak = sm ? { type: sm[1].toUpperCase() === 'T' ? 'D' : sm[1].toUpperCase(), n: Number(sm[2]) } : null;

    const tail = si >= 0 ? rest.slice(si + 1) : rest;
    let homeAway = null;
    const ints = tail.filter(c => INT.test(c.text)).map(c => Number(c.text));
    const triples = tail.map(c => c.text.match(TRIPLE)).filter(Boolean).map(m => [Number(m[1]), Number(m[2]), Number(m[3])]);
    if (si >= 0 && ints.length >= 6) homeAway = splitHomeAway(ints.slice(0, 3), ints.slice(3, 6), { w: win, l: loss, d: draw });
    else if (triples.length >= 2) homeAway = splitHomeAway(triples[0], triples[1], { w: win, l: loss, d: draw });
    if (!homeAway) problems.push(team.short + ': 홈·원정 성적을 못 읽음');

    let status = null;
    const sc = tail.find(c => statusOf(c.text));
    if (sc) {
      status = statusOf(sc.text);
      carry = sc.rowspan > 1 ? { value: status, left: sc.rowspan - 1 } : null;
    } else if (carry && carry.left > 0) {
      status = carry.value;
      carry.left--;
    }

    rows.push({
      team: team.id, games, win, loss, draw, streak,
      home: homeAway ? homeAway.home : null,
      away: homeAway ? homeAway.away : null,
      status,
    });
  }
  return { asOf, rows, problems };
}

/** 승률(무승부 제외)·순위(승률이 같으면 공동)·게임차(1위 기준)를 매긴다. 표 순서는 순위 → 승 → 원래 순서 */
function computeStandings(rows) {
  const list = rows.map((r, i) => {
    const decided = r.win + r.loss;
    return Object.assign({}, r, { pct: decided ? r.win / decided : 0, _i: i });
  });
  list.sort((a, b) => (b.pct - a.pct) || (b.win - a.win) || (a._i - b._i));
  const lead = list[0];
  /* 순위는 반올림하기 전 승률로 매긴다. 한 줄씩 반올림하면서 매기면, 앞 팀만 반올림된 값과 비교돼
     승률이 같은 팀(NC·롯데 64승 68패)이 6위·7위로 갈렸다 — 2026-10-02 테스트가 잡음 */
  const ranks = list.map(r => 1 + list.filter(o => o.pct - r.pct > 1e-9).length);
  list.forEach((r, k) => {
    r.rank = ranks[k];
    r.gb = lead ? ((lead.win - r.win) + (r.loss - lead.loss)) / 2 : 0;
  });
  list.forEach(r => {
    r.pct = Math.round(r.pct * 1000) / 1000;
    delete r._i;
  });
  return list;
}

/** 순위표 자체 검사. 하나라도 걸리면 이번 것은 버리고 지난 순위표를 쓴다(collect.js).
 *  위키는 사람이 고친다 — 몇 팀만 고쳐 둔 순간에 받으면 리그 전체 승 수와 패 수가 어긋난다. */
function validateStandings(st) {
  const p = [];
  if (!st || !Array.isArray(st.rows)) return ['순위표 없음'];
  if (!st.asOf || !/^\d{4}-\d{2}-\d{2}$/.test(st.asOf)) p.push('기준일 없음');
  const ids = st.rows.map(r => r.team);
  if (ids.length !== TEAMS.length) p.push('구단 수 ' + ids.length + ' (10이어야 함)');
  TEAMS.forEach(t => { if (!ids.includes(t.id)) p.push(t.short + ' 없음'); });
  if (new Set(ids).size !== ids.length) p.push('같은 구단이 두 번');
  let sw = 0, sl = 0, sd = 0;
  st.rows.forEach(r => {
    const name = (TEAMS.find(t => t.id === r.team) || { short: r.team }).short;
    for (const k of ['games', 'win', 'loss', 'draw']) if (!Number.isInteger(r[k]) || r[k] < 0) p.push(name + ' ' + k + ' 값 이상');
    if (r.win + r.loss + r.draw !== r.games) p.push(name + ': 승+패+무 ≠ 경기 수');
    if (r.games > SEASON_GAMES + 2) p.push(name + ': 경기 수가 ' + SEASON_GAMES + ' 보다 많음');
    if (r.home && r.away && (r.home.w + r.away.w !== r.win || r.home.l + r.away.l !== r.loss || r.home.d + r.away.d !== r.draw)) p.push(name + ': 홈+원정 ≠ 전체');
    if (r.streak && !(/^[WLD]$/.test(r.streak.type) && r.streak.n > 0)) p.push(name + ': 연속 기록 이상');
    sw += r.win; sl += r.loss; sd += r.draw;
  });
  if (sw !== sl) p.push('리그 전체 승(' + sw + ')과 패(' + sl + ')가 다름 — 위키가 일부만 고쳐진 상태일 수 있다');
  if (sd % 2) p.push('리그 전체 무승부 수가 홀수');
  return p;
}

/* ---------- 현재 명단 (한국어 위키백과 「틀:<구단> 명단」) ---------- */

/** 묶음 이름 → 종류. 1군 코치는 '코치' 하나뿐이다. 퓨처스·잔류군·재활군 등은 'staff' 로 모으고 화면에는 내지 않는다. */
function groupKind(label) {
  const l = String(label).replace(/\s+/g, '');
  if (l === '감독') return 'manager';
  if (l === '코치') return 'coach';
  if (l === '투수') return 'P';
  if (l === '포수') return 'C';
  if (l === '내야수') return 'IF';
  if (l === '외야수') return 'OF';
  if (/군입대|군복무|입대/.test(l)) return 'military';
  if (/신인/.test(l)) return 'rookie';
  return 'staff';
}

/** "* 47 [[나성범]]<small>(주장)</small>" → { number: 47, name: '나성범', wiki: '나성범', note: '주장' } */
function parseRosterLine(line) {
  const m = String(line).match(/^\s*\*+\s*(\d{1,3})?\s*([\s\S]*)$/);
  if (!m) return null;
  const rest = m[2];
  const link = rest.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
  let name, wiki = null;
  if (link) {
    wiki = link[1].split('#')[0].trim();
    name = stripWiki(link[2] || link[1]).replace(/\s*\([^)]*\)\s*$/, '').trim();
  } else {
    name = stripWiki(rest).replace(/\(.*?\)/g, '').trim();
  }
  if (!name || name.length > 30) return null;
  const noteSrc = link ? rest.replace(link[0], '') : rest.replace(name, '');
  const note = stripWiki(noteSrc).replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
  return {
    number: m[1] !== undefined ? Number(m[1]) : null,
    name,
    wiki: wiki || null,
    note: note && note.length <= 20 && /[가-힣A-Za-z0-9]/.test(note) ? note : '',
  };
}

/** 명단 틀 → { manager, coaches, players, military }. 선수의 pos 는 P·C·IF·OF */
function parseRoster(wikitext) {
  const body = findTemplate(wikitext, /^둘러보기 상자$/);
  const out = { manager: null, coaches: [], players: [], military: [] };
  if (!body) return out;
  const { named } = templateParams(body);
  Object.keys(named).forEach(key => {
    const g = key.match(/^묶음(\d+)$/);
    if (!g) return;
    const kind = groupKind(stripWiki(named[key]));
    const lines = String(named['내용' + g[1]] || '').split('\n').map(parseRosterLine).filter(Boolean);
    if (kind === 'manager' && lines[0]) out.manager = { number: lines[0].number, name: lines[0].name, wiki: lines[0].wiki };
    else if (kind === 'coach') lines.forEach(c => out.coaches.push({ number: c.number, name: c.name, wiki: c.wiki, role: c.note }));
    else if (/^(P|C|IF|OF)$/.test(kind)) lines.forEach(pl => out.players.push({ number: pl.number, name: pl.name, wiki: pl.wiki, pos: kind, note: pl.note }));
    else if (kind === 'military') lines.forEach(pl => out.military.push({ name: pl.name, wiki: pl.wiki }));
  });
  return out;
}

function validateRoster(r) {
  const p = [];
  if (!r || !Array.isArray(r.players)) return ['명단 없음'];
  if (!r.manager || !r.manager.name) p.push('감독 없음');
  const by = pos => r.players.filter(x => x.pos === pos).length;
  if (r.players.length < 25) p.push('선수 ' + r.players.length + '명 (너무 적음)');
  if (by('P') < 8) p.push('투수 ' + by('P') + '명');
  if (by('C') < 1) p.push('포수 없음');
  if (by('IF') < 3) p.push('내야수 ' + by('IF') + '명');
  if (by('OF') < 3) p.push('외야수 ' + by('OF') + '명');
  return p;
}

/* ---------- 선수 프로필 (선수 문서 첫 부분의 「야구 선수 정보」 상자) ---------- */

function parseBirth(v) {
  const s = String(v || '');
  let m = s.match(/\{\{\s*(?:출생일과\s*나이|출생일|birth date and age|birth date)\s*\|(?:\s*[a-z]+\s*=[^|}]*\|)*\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})/i);
  if (m) return ymd(m[1], m[2], m[3]);
  const t = stripWiki(s);
  m = t.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/) || t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m ? ymd(m[1], m[2], m[3]) : null;
}

function handOf(v) {
  const t = stripWiki(v).replace(/\s+/g, '');
  if (!t) return null;
  if (/양|스위치|switch|^S$/i.test(t)) return '양';
  if (/좌|왼|^L/i.test(t)) return '좌';
  if (/우|오른|^R/i.test(t)) return '우';
  return null;
}

function numIn(v, min, max) {
  const m = stripWiki(v).match(/\d{2,3}/);
  const n = m ? Number(m[0]) : NaN;
  return n >= min && n <= max ? n : null;
}

/**
 * 선수 문서 위키 원문(첫 부분) → 공개 프로필. 경기와 관계없는 신상(출신지·연봉·계약금·본명·가족)은
 * 상자에 있어도 꺼내지 않는다 (AGENTS.md 규칙 2 "선수·감독 이름은 왜 올라가도 되는가").
 */
function parseProfile(wikitext) {
  const body = findTemplate(wikitext, /^(야구\s*선수\s*정보|야구인\s*정보|Infobox baseball biography)$/i);
  if (!body) return null;
  const p = templateParams(body).named;
  const get = k => (p[k] !== undefined ? p[k] : '');
  const born = parseBirth(get('생년월일'));
  const positions = Array.from(new Set(
    stripWiki(get('수비 위치') || get('포지션')).split(/\s*[,/·、]\s*/)
      .map(s => s.replace(/\(.*?\)/g, '').trim())
      .filter(s => s && s.length <= 10)
  )).slice(0, 5);
  const year = stripWiki(get('프로 입단 연도')).match(/\d{4}/);
  const prof = {
    born,
    height: numIn(get('신장'), 150, 220),
    weight: numIn(get('체중'), 50, 160),
    throws: handOf(get('투구')),
    bats: handOf(get('타석')),
    positions,
    nationality: truncate(stripWiki(get('국적')), 20) || null,
    proYear: year ? Number(year[0]) : null,
    draft: truncate(stripWiki(get('드래프트 순위')), 80) || null,
    career: listItems(get('경력'), 10).map(s => truncate(s, 60)),
    titles: listItems(get('획득 타이틀'), 8).map(s => truncate(s, 60)),
    team: truncate(stripWiki(get('소속 구단')), 30) || null,
    number: truncate(stripWiki(get('등번호')), 12) || null,
    /* 사진은 파일 이름만 읽는다. 쓸 수 있는지(자유 이용 라이선스)는 collect.js 가 위키미디어에 물어 정한다(parseImageInfo) */
    photoFile: photoFileName(get('선수 사진 파일명') || get('사진') || get('그림') || get('image')),
    photoCaption: truncate(stripWiki(get('사진 설명')), 60) || null,
  };
  if (born && (Number(born.slice(0, 4)) < 1940 || Number(born.slice(0, 4)) > 2012)) prof.born = null;
  return prof;
}

/** 정보 상자의 사진 칸 → 파일 이름. "[[파일:가.jpg|250px]]" 처럼 적힌 것도 받는다. 사진(jpg·png·webp)이 아니면 null
 *  (svg 는 대개 구단 로고라 쓰지 않는다 — 로고는 상표다) */
function photoFileName(v) {
  let s = String(v || '').trim();
  if (!s) return null;
  s = s.replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0];
  s = s.replace(/^\s*(?:파일|File|그림|Image)\s*:\s*/i, '').replace(/_/g, ' ').trim();
  return /\.(jpe?g|png|webp)$/i.test(s) && s.length <= 200 ? s : null;
}

/* 화면에 띄워도 되는 사진 라이선스 — 자유 이용(출처 표기 조건)만. 비자유(공정 이용) 파일은 쓰지 않는다 */
const FREE_LICENSE = /^(?:CC0(?: 1\.0)?|CC BY(?:-SA)? \d(?:\.\d)?(?: [A-Za-z-]{2,})?|Public domain|PD(?:-[\w.-]+)?|GFDL(?:[ -][\d.]+)?)$/i;
const IMAGE_HOST = /^https:\/\/(?:upload|thumb)\.wikimedia\.org\/[^\s"'<>]+$/;

/** imageinfo 결과 → { url, width, height } (확대용 큰 사진). 주소가 위키미디어가 아니면 null */
function parseImageSize(page) {
  const ii = page && page.imageinfo && page.imageinfo[0];
  if (!ii) return null;
  const url = String(ii.thumburl || ii.url || '').split('?')[0];
  if (!IMAGE_HOST.test(url)) return null;
  return { url, width: Number(ii.thumbwidth || ii.width) || null, height: Number(ii.thumbheight || ii.height) || null };
}

/** 위키 API imageinfo 결과 한 쪽 → 화면에 쓸 사진 정보. 자유 이용이 아니거나 사진이 아니면 null.
 *  저작자 표기(작성자·라이선스·원본 링크)는 CC 라이선스의 조건이라 반드시 함께 담는다. */
function parseImageInfo(page) {
  const ii = page && page.imageinfo && page.imageinfo[0];
  if (!ii || !/^image\/(jpeg|png|webp)$/.test(ii.mime || '')) return null;
  const meta = ii.extmetadata || {};
  const val = k => (meta[k] && meta[k].value !== undefined ? String(meta[k].value) : '');
  const license = clean(val('LicenseShortName'));
  if (!FREE_LICENSE.test(license)) return null;
  const thumb = String(ii.thumburl || '').split('?')[0];
  if (!IMAGE_HOST.test(thumb)) return null;
  const author = truncate(clean(val('Artist')) || clean(val('Credit')), 60) || null;
  if (/^true$/i.test(val('AttributionRequired')) && !author) return null;   // 표기할 작성자를 모르면 쓰지 않는다
  const licenseUrl = clean(val('LicenseUrl'));
  return {
    thumb,
    width: Number(ii.thumbwidth) || null,
    height: Number(ii.thumbheight) || null,
    page: isHttpUrl(ii.descriptionurl) ? ii.descriptionurl : null,
    author,
    license,
    licenseUrl: isHttpUrl(licenseUrl) ? licenseUrl : null,
  };
}

/** 같은 이름의 다른 사람 문서로 링크가 걸린 경우를 거른다: 소속 구단·경력에 이 구단이 있거나 등번호가 같아야 쓴다 */
function profileMatchesTeam(prof, team, number) {
  if (!prof) return false;
  const names = [team.wikiKo, team.name, team.short + ' ' + team.name.split(' ').slice(1).join(' ')]
    .concat(team.id === 'kt' ? ['kt 위즈', 'KT 위즈'] : [])
    .map(s => s.toLowerCase());
  const hay = [prof.team || ''].concat(prof.career || []).join(' ').toLowerCase();
  if (names.some(n => n.trim() && hay.includes(n.trim()))) return true;
  const num = String(prof.number || '').match(/\d+/);
  return number !== null && number !== undefined && num !== null && Number(num[0]) === number;
}

/* ---------- 연도별 기록 (선수 문서의 「통산 기록」 표) ----------
 * 위키백과 편집자들이 시즌이 끝나면 한 줄씩 더하는 표다(2026-10-02 표본 150명 중 130명에게 있고, 2025 시즌까지 들어 있다).
 * KBO 기록실을 긁지 않는다 — KBO 는 사전 승인 없는 자동 수집을 금지한다(AGENTS.md 4절). 올 시즌 기록은 KBO 공식 페이지 링크로 보낸다.
 */

/* 표 머리 이름 → 칸 이름. 문서마다 표기가 조금씩 다르다(세/세이브, 홀/홀드, 평균자책점/방어율, 팀명/소속팀) */
const STAT_COMMON = { '연도': 'year', '년도': 'year', '시즌': 'year', '팀명': 'team', '팀': 'team', '소속팀': 'team', '소속': 'team', '구단': 'team', '경기': 'g', '경기수': 'g' };
const STAT_BAT = { '타율': 'avg', '안타': 'h', '홈런': 'hr', '타점': 'rbi', '득점': 'r', '도루': 'sb', '볼넷': 'bb', '4구': 'bb', '삼진': 'so', 'OPS': 'ops' };
const STAT_PIT = { '평균자책점': 'era', '방어율': 'era', '승': 'w', '패': 'l', '세': 'sv', '세이브': 'sv', '홀': 'hld', '홀드': 'hld', '이닝': 'ip', '투구이닝': 'ip', '탈삼진': 'k', '볼넷': 'bb', 'WHIP': 'whip' };
/* 화면에 내는 칸과 순서 */
const BAT_COLS = ['year', 'team', 'g', 'avg', 'h', 'hr', 'rbi', 'r', 'sb', 'bb', 'so', 'ops'];
const PIT_COLS = ['year', 'team', 'g', 'era', 'w', 'l', 'sv', 'hld', 'ip', 'k', 'bb', 'whip'];
/* KBO 구단(옛 이름 포함). MLB·NPB 기록 표를 KBO 기록으로 잘못 내지 않게 행의 팀 칸으로 고른다 */
const KBO_TEAM_CELL = /KIA|기아|해태|삼성|LG|엘지|MBC|두산|OB|(?<![A-Za-z])(?:kt|KT)(?![A-Za-z])|SSG|SK|롯데|한화|빙그레|NC|키움|넥센|히어로즈|우리|현대|태평양|청보|삼미|쌍방울/;

/** 표 칸 → 글자. {{Color|red|143}} 같은 꾸밈 틀은 값만 남긴다(그냥 틀을 지우면 기록이 사라진다) */
function statCellText(raw) {
  let s = String(raw || '');
  s = s.replace(/\{\{\s*(?:color|colour|font color|색)\s*\|[^{}|]*\|([^{}]*)\}\}/gi, '$1');
  s = s.replace(/\{\{\s*(?:nowrap|굵게|bold)\s*\|([^{}]*)\}\}/gi, '$1');
  return stripWiki(s).replace(/[†‡*]/g, '').replace(/\s+/g, ' ').trim();
}

/** rowspan·colspan 을 펴서 머리 칸 수에 맞춘 격자로 */
function alignRows(rows, ncol) {
  const carry = new Array(ncol).fill(null);
  return rows.map(r => {
    const cells = r.cells.slice();
    const line = [];
    let k = 0;
    for (let c = 0; c < ncol; c++) {
      if (carry[c] && carry[c].left > 0) { line.push(carry[c].cell); carry[c].left--; continue; }
      const cell = cells[k++];
      if (!cell) { line.push(null); continue; }
      line.push(cell);
      if (cell.rowspan > 1) carry[c] = { left: cell.rowspan - 1, cell };
      for (let s = 1; s < cell.colspan && c + 1 < ncol; s++) { c++; line.push(cell); }
    }
    return line;
  });
}

/** 위키 표 하나 → { kind: 'bat'|'pit', cols, rows: [[값…]], total, seasons } 또는 null */
function parseStatTable(tableText, maxYear) {
  const rows = parseWikiTable(tableText);
  const hi = rows.findIndex(r => r.cells.length >= 4 && r.cells.every(c => c.header) && r.cells.some(c => STAT_COMMON[c.text] === 'year'));
  if (hi < 0) return null;
  const head = rows[hi].cells.map(c => c.text.replace(/\s+/g, ''));
  const kind = head.includes('타율') ? 'bat' : (head.includes('평균자책점') || head.includes('방어율')) ? 'pit' : null;
  if (!kind) return null;
  const alias = Object.assign({}, STAT_COMMON, kind === 'bat' ? STAT_BAT : STAT_PIT);
  const keys = head.map(h => alias[h] || null);
  const wanted = (kind === 'bat' ? BAT_COLS : PIT_COLS).filter(k => keys.includes(k));
  if (!wanted.includes('year') || !wanted.includes('g')) return null;
  const grid = alignRows(rows.slice(hi + 1).filter(r => r.cells.length), head.length);
  const out = [];
  let total = null, seasons = null;
  grid.forEach(line => {
    const vals = {};
    keys.forEach((k, i) => { if (k && line[i]) vals[k] = statCellText(line[i].raw).slice(0, 12); });
    if (/^통산|^합계|^계$/.test(vals.year || '')) {
      total = wanted.map(k => (k === 'year' ? '통산' : k === 'team' ? '' : vals[k] || ''));
      seasons = /\d+\s*시즌/.test(vals.team || '') ? vals.team.match(/\d+\s*시즌/)[0].replace(/\s+/g, '') : null;
      return;
    }
    const y = Number((vals.year || '').match(/^\d{4}/) || NaN);
    if (!(y >= 1982 && y <= maxYear)) return;
    vals.year = String(y);
    /* 편집자가 시즌 시작 때 미리 만들어 둔 자리 줄("2026 | NC | | |…", "000 | 00.00")은 뺀다 — 기록이 0 인 것처럼 보인다.
       경기 수가 비었거나 0 이면 그해에 뛰지 않은 것으로 본다 (2026-10-02 실제 문서 10곳에서 겪음) */
    if (!/[1-9]/.test(vals.g || '')) return;
    out.push(wanted.map(k => vals[k] || ''));
  });
  if (!out.length) return null;
  const ti = wanted.indexOf('team');
  if (ti >= 0 && !out.some(r => KBO_TEAM_CELL.test(r[ti]))) return null;   // MLB·NPB 표
  return { kind, cols: wanted, rows: out.slice(0, 30), total, seasons };
}

/** 선수 문서 전체 → { bat, pit } (없으면 null). 「통산 기록」 절의 표 가운데 KBO 기록 표를 쓴다 */
function parseCareerStats(wikitext, maxYear) {
  const text = String(wikitext || '');
  const m = text.match(/^(==+)\s*(?:통산\s*기록|연도별\s*(?:성적|기록)|시즌별\s*(?:성적|기록)|통산\s*성적|개인\s*기록|기록)\s*\1\s*$/m);
  if (!m) return null;
  const start = m.index + m[0].length;
  const rest = text.slice(start);
  const next = rest.search(new RegExp('^={2,' + m[1].length + '}[^=]', 'm'));
  const sec = next >= 0 ? rest.slice(0, next) : rest;
  const out = {};
  let from = 0, t;
  while ((t = extractTable(sec, from))) {
    const st = parseStatTable(t.text, maxYear || 2100);
    if (st && !out[st.kind]) out[st.kind] = { cols: st.cols, rows: st.rows, total: st.total, seasons: st.seasons };
    from = t.end;
  }
  return out.bat || out.pit ? out : null;
}

/** 문서의 {{KBO 타자|52605}}·{{KBO 투수|69446}} → KBO 공식 기록 페이지 번호. 위키백과에 적힌 번호라 KBO 를 긁지 않는다 */
function parseKboIds(wikitext) {
  const t = String(wikitext || '');
  const pick = re => { const m = t.match(re); return m ? m[1] : null; };
  const hitter = pick(/\{\{\s*KBO\s*타자\s*\|\s*(?:id\s*=\s*)?(\d{4,7})\s*[|}]/);
  const pitcher = pick(/\{\{\s*KBO\s*투수\s*\|\s*(?:id\s*=\s*)?(\d{4,7})\s*[|}]/);
  return hitter || pitcher ? { hitter, pitcher } : null;
}

/* ---------- 뉴스 (언론사 RSS) ---------- */

/** 우리 구단과 별명이 같은 다른 리그·종목 팀. 구단을 알아보기 전에 지운다
 *  (샌프란시스코 자이언츠 ≠ 롯데, 지바 롯데 마린스 ≠ 롯데, KT 소닉붐(농구) ≠ kt wiz …) */
const FOREIGN_SAME_NAME = new RegExp([
  '(?:샌프란시스코|SF|요미우리|뉴욕|미네소타|세이부|라쿠텐|도호쿠|필라델피아|시카고|디트로이트|한신|LA|로스앤젤레스|애틀랜타|토론토)\\s*(?:자이언츠|트윈스|라이온즈|이글스|베어스|타이거스|타이거즈|마린스)',
  '지바\\s*롯데(?:\\s*마린스)?',
  '(?:KT|kt)\\s*(?:소닉붐|롤스터|&G)', 'LG\\s*세이커스', '삼성\\s*(?:썬더스|화재|생명|블루윙즈|전자|SDI|바이오)',
  'LG\\s*(?:전자|화학|에너지|유플러스)', '한화\\s*(?:생명|솔루션|오션|에어로)', 'NC\\s*소프트', '롯데\\s*(?:호텔|백화점|쇼핑|그룹|칠성|월드|카드)',
  '키움\\s*증권', '두산\\s*(?:에너빌리티|밥캣|핸드볼)', '기아\\s*(?:자동차|차)',
].join('|'), 'g');

const TEAM_RES = TEAMS.map(t => ({ id: t.id, re: new RegExp(t.alias) }));

/** 야구 기사인가. 스포츠 피드에는 축구·농구·배구·골프·바둑이 섞여 있다. 야구에만 쓰는 낱말로 고른다.
 *  - '안타'는 '안타깝다', '이닝'은 '다이닝'·'트레이닝', '위즈'는 '위즈덤' 에 걸리지 않게 했다.
 *    (축구 대표팀 기사가 "오픈트레이닝데이" 의 '이닝' 으로 야구에 들어온 적이 있다 — 2026-10-01)
 *  - '와일드카드'는 넣지 않는다. 바둑(삼성화재배 와일드카드)·테니스에도 쓴다. */
const BASEBALL = /야구|KBO|프로야구|메이저리그|마이너리그|빅리그|MLB|NPB|홈런|안타(?![까깝])|타점|타율|타자|투수|(?<![다레])이닝|삼진|마운드|불펜|홀드|도루|유격수|포수|외야수|내야수|[123]루수|지명타자|끝내기|가을야구|한국시리즈|평균자책|방어율|다승|노히트|퍼펙트게임|사이영|골든글러브|타이거즈|라이온즈|트윈스|베어스|위즈(?!덤)|랜더스|자이언츠|이글스|다이노스|히어로즈/;

/* 해외야구 — MLB·NPB 구단과 MLB 연고 도시. 도시 이름은 야구 기사 안에서만 쓰므로 정치 기사와 섞이지 않는다 */
const ABROAD = /MLB|메이저리그|마이너리그|빅리그|NPB|일본\s?프로야구|미국\s?프로야구|월드시리즈|디비전\s?시리즈|챔피언십\s?시리즈|[AN]LDS|[AN]LCS|내셔널리그|아메리칸리그|사이영|다저스|양키스|메츠|파드리스|샌디에이고|샌프란시스코|화이트삭스|레드삭스|컵스|브레이브스|애틀랜타|필리스|애스트로스|휴스턴|레인저스|매리너스|시애틀|에인절스|블루제이스|토론토|오리올스|볼티모어|탬파베이|가디언스|클리블랜드|디트로이트|미네소타|로열스|캔자스시티|애슬레틱스|브루어스|밀워키|카디널스|세인트루이스|신시내티|파이리츠|피츠버그|말린스|내셔널스|로키스|콜로라도|다이아몬드백스|애리조나|요미우리|한신|소프트뱅크|닛폰햄|라쿠텐|세이부|오릭스|지바\s?롯데|주니치|야쿠르트|히로시마|요코하마|CPBL|대만\s?프로야구/;
const NATIONAL = /국가대표|대표팀|아시안게임|(?<![A-Za-z])AG(?![A-Za-z])|WBC|월드\s?베이스볼|프리미어\s?12|올림픽|고교야구|대학야구|청소년|(?<![A-Za-z])U-?(?:1[2-9]|2[0-3])(?!\d)|리틀\s?야구|(?:초등|중학|고교|고등학교|대학|유소년)\s?(?:학교\s?)?야구|야구\s?대회|봉황대기|황금사자기|청룡기|대통령배|협회장기|독립리그|여자\s?야구|사회인\s?야구/;
/* '프로야구'·'가을야구'는 MLB 기사에도 나온다("미국프로야구 메이저리그 가을야구"). 해외야구 기사에서는 KBO 근거로 치지 않는다 */
const KBO_HARD = /KBO/;
const KBO_SOFT = /프로야구|가을야구|한국시리즈|정규시즌|포스트시즌|와일드카드/;
const PRO_ABROAD = /(?:미국|일본|대만)\s?프로야구/g;

/** 목록·표 기사(전적·중간순위·선발투수)는 뉴스 목록에 넣지 않는다. 본문이 표뿐이라 제목만으로는 읽을 게 없다.
 *  전적 기사는 대신 경기 결과로 읽는다(parseGameTitle). */
const LIST_TITLE = /^\[\s*(?:프로야구|KBO)?[^\]]*(?:전적|중간\s?순위|선발\s?투수)\s*\]|선발\s?투수\s*$|오늘의\s*경기\s*결과|^\[(?:게시판|부고|인사|표|포토|사진|영상|알림)\]/;

function teamsOf(text) {
  const t = String(text || '').replace(FOREIGN_SAME_NAME, ' ');
  return TEAM_RES.filter(x => x.re.test(t)).map(x => x.id);
}

/** 별명이 같은 다른 종목 팀(필라델피아 이글스 = 미식축구)은 지우고 본다. 해외 야구 기사는 '안타'·'MLB' 같은 다른 낱말로 걸린다. */
function isBaseball(title, summary) {
  const t = (String(title || '') + ' ' + String(summary || '')).replace(FOREIGN_SAME_NAME, ' ');
  return BASEBALL.test(t);
}

/** 기사 갈래 — 여러 개일 수 있다: kbo(프로야구) · abroad(해외야구) · national(대표팀·아마) */
function topicsOf(title, summary, teams) {
  const t = String(title || '') + ' ' + String(summary || '');
  const abroad = ABROAD.test(t);
  const t2 = t.replace(PRO_ABROAD, ' ');
  const out = [];
  if ((teams && teams.length) || KBO_HARD.test(t2) || (!abroad && KBO_SOFT.test(t2))) out.push('kbo');
  if (abroad) out.push('abroad');
  if (NATIONAL.test(t)) out.push('national');
  if (!out.length) out.push('kbo');
  return out;
}

function isListArticle(title) {
  return LIST_TITLE.test(String(title || ''));
}

/** RSS 원문 → [{ title, url, summary, publishedAt, source }] (아직 야구 기사인지 고르기 전) */
function parseFeed(xml, feed, now) {
  const blocks = String(xml).match(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi) || [];
  const nowMs = now ? new Date(now).getTime() : Date.now();
  const out = [];
  for (const b of blocks) {
    const title = truncate(clean(pick(b, 'title')), 140);
    const url = pickLink(b);
    if (!title || !isHttpUrl(url)) continue;
    const dt = parseFeedDate(clean(pick(b, 'pubDate') || pick(b, 'dc:date') || pick(b, 'published') || pick(b, 'updated')));
    /* 시각이 없거나 앞날(시간대 잘못)이면 받은 시각으로 둔다 — 맨 위에 붙박이지 않게 */
    const ms = dt ? Math.min(dt.getTime(), nowMs) : nowMs;
    const rawSum = pick(b, 'description') || pick(b, 'summary') || pick(b, 'content:encoded') || pick(b, 'content');
    let summary = stripByline(truncate(spaceSentences(scrubSummary(clean(rawSum))), 160));
    if (summary.length < 20 || summary === title) summary = '';
    out.push({ title, url, summary, publishedAt: new Date(ms).toISOString(), source: feed.source, rawSummary: clean(rawSum).slice(0, 60) });
  }
  return out;
}

/* 연합뉴스 전적 기사 제목: "[프로야구 광주전적] kt 7-5 KIA" — 이긴 팀이 앞, 무승부면 같은 점수.
 * 홈 팀은 구장 이름으로 정한다(광주 = KIA). 잠실을 함께 쓰는 LG·두산끼리의 경기는 홈을 비워 둔다.
 * 포스트시즌 제목 모양은 아직 실제로 보지 못했다(2026-10-01) — 모르는 모양이면 null 로 두고 넘어간다. */
const GAME_TITLE = /^\[\s*(?:프로야구|KBO)?\s*([^\]]*?)\s*전적\s*\]\s*(\S+)\s+(\d{1,2})\s*[-–:]\s*(\d{1,2})\s+(\S+)\s*$/;

function teamByTitleName(s) {
  const n = String(s || '').trim();
  return TEAMS.find(t => t.titleName.some(x => x.toLowerCase() === n.toLowerCase())) || null;
}

function parseGameTitle(title, publishedAt, rawSummary) {
  const m = String(title || '').match(GAME_TITLE);
  if (!m) return null;
  const t1 = teamByTitleName(m[2]);
  const t2 = teamByTitleName(m[5]);
  if (!t1 || !t2 || t1 === t2) return null;
  const where = m[1];
  const token = TEAMS.reduce((found, t) => found || t.homeTokens.find(h => where.includes(h)), null) || null;
  const homes = token ? [t1, t2].filter(t => t.homeTokens.includes(token)) : [];
  const home = homes.length === 1 ? homes[0].id : null;

  /* 날짜: 요약의 "▲ 광주전적(1일)" 의 날을 쓰고, 연·월은 기사 시각(한국)에서 가져온다. 자정 넘어 나온 기사도 경기 날로 묶인다. */
  const pub = kstDate(publishedAt);
  let date = pub;
  const dm = String(rawSummary || '').match(/\((\d{1,2})일/);
  if (dm) {
    let [y, mo] = pub.split('-').map(Number);
    const day = Number(dm[1]);
    if (day > Number(pub.slice(8, 10))) { mo -= 1; if (mo < 1) { mo = 12; y -= 1; } }
    date = ymd(y, mo, day) || pub;
  }
  const dhm = (where + ' ' + (rawSummary || '')).match(/([12])\s*차전/);
  const dh = dhm ? Number(dhm[1]) : 0;
  const pair = [t1.id, t2.id].sort().join('-');
  return {
    id: date + '-' + pair + (dh ? '-' + dh : ''),
    date, stadium: token, home,
    t1: t1.id, s1: Number(m[3]), t2: t2.id, s2: Number(m[4]),
  };
}

/** 지난 경기 결과와 새로 읽은 결과를 합친다. 같은 경기는 새것이 이긴다(정정 기사). 그 시즌 것만, 앞날은 뺀다. */
function mergeGames(prev, next, season, now) {
  const map = new Map();
  (prev || []).forEach(g => map.set(g.id, g));
  (next || []).forEach(g => map.set(g.id, g));
  const tomorrow = kstDate(new Date((now ? new Date(now).getTime() : Date.now()) + 86400000));
  return Array.from(map.values())
    .filter(g => String(g.date).startsWith(String(season)) && g.date <= tomorrow)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? -1 : 1));
}

const NEWS_KEEP_HOURS = 72;
const NEWS_MAX = 240;

/** 지난 뉴스와 새 뉴스를 합친다. 피드는 하루치 정도만 담고 있어서 합쳐 두어야 사흘치가 남는다. */
function mergeNews(prev, next, now) {
  const nowMs = now ? new Date(now).getTime() : Date.now();
  const map = new Map();
  (prev || []).forEach(n => map.set(n.id, n));
  (next || []).forEach(n => map.set(n.id, n));
  return Array.from(map.values())
    .filter(n => nowMs - new Date(n.publishedAt).getTime() <= NEWS_KEEP_HOURS * 3600000)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, NEWS_MAX);
}

/* ---------- 만든 자료 전체 검사 (collect.js 가 쓰기 전에, tests/data.spec.js 가 저장소 사본에) ---------- */

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const TEAM_IDS = TEAMS.map(t => t.id);
const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/;

function validateLive(live) {
  const p = [];
  if (!live || typeof live !== 'object') return ['자료가 비어 있음'];
  if (live.version !== 1) p.push('version');
  if (!Number.isInteger(live.season)) p.push('season');
  if (!ISO.test(live.generatedAt || '')) p.push('generatedAt');
  if (live.standings) {
    validateStandings(live.standings).forEach(x => p.push('순위표: ' + x));
    (live.standings.rows || []).forEach(r => {
      if (!(r.rank >= 1 && r.rank <= 10)) p.push('순위표: ' + r.team + ' 순위 이상');
      if (!(r.pct >= 0 && r.pct <= 1)) p.push('순위표: ' + r.team + ' 승률 이상');
    });
    if (!live.standings.source || !isHttpUrl(live.standings.source.url)) p.push('순위표 출처 주소 없음');
  }
  if (!Array.isArray(live.games)) p.push('games 가 배열이 아님');
  else {
    const ids = new Set();
    live.games.forEach(g => {
      if (ids.has(g.id)) p.push('경기 id 중복 ' + g.id);
      ids.add(g.id);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(g.date)) p.push('경기 날짜 이상 ' + g.id);
      if (!TEAM_IDS.includes(g.t1) || !TEAM_IDS.includes(g.t2) || g.t1 === g.t2) p.push('경기 구단 이상 ' + g.id);
      if (!(Number.isInteger(g.s1) && Number.isInteger(g.s2) && g.s1 >= 0 && g.s2 >= 0 && g.s1 < 60 && g.s2 < 60)) p.push('경기 점수 이상 ' + g.id);
      if (g.home !== null && g.home !== g.t1 && g.home !== g.t2) p.push('경기 홈 팀 이상 ' + g.id);
    });
  }
  if (!Array.isArray(live.news)) p.push('news 가 배열이 아님');
  else {
    const ids = new Set();
    live.news.forEach(n => {
      if (ids.has(n.id)) p.push('뉴스 id 중복 ' + n.id);
      ids.add(n.id);
      if (!n.title || n.title.length > 200) p.push('뉴스 제목 이상 ' + n.id);
      if (!isHttpUrl(n.url)) p.push('뉴스 주소 이상 ' + n.id);
      if (!n.source) p.push('뉴스 출처 없음 ' + n.id);
      if (!ISO.test(n.publishedAt || '')) p.push('뉴스 시각 이상 ' + n.id);
      if (typeof n.summary !== 'string' || n.summary.length > 200) p.push('뉴스 요약 이상 ' + n.id);
      if (EMAIL.test(n.title + ' ' + n.summary)) p.push('뉴스에 이메일 주소가 남음 ' + n.id);
      if (!Array.isArray(n.topics) || !n.topics.length || n.topics.some(t => !['kbo', 'abroad', 'national'].includes(t))) p.push('뉴스 갈래 이상 ' + n.id);
      if (!Array.isArray(n.teams) || n.teams.some(t => !TEAM_IDS.includes(t))) p.push('뉴스 구단 이상 ' + n.id);
    });
  }
  return p;
}

function validatePlayers(players) {
  const p = [];
  if (!players || typeof players !== 'object') return ['자료가 비어 있음'];
  if (players.version !== 1) p.push('version');
  if (!ISO.test(players.generatedAt || '')) p.push('generatedAt');
  if (!players.rosters || typeof players.rosters !== 'object') return p.concat('rosters 없음');
  TEAMS.forEach(t => {
    const r = players.rosters[t.id];
    if (!r) { p.push(t.short + ' 명단 없음'); return; }
    validateRoster(r).forEach(x => p.push(t.short + ' 명단: ' + x));
    const ids = new Set();
    r.players.forEach(pl => {
      if (!pl.id || ids.has(pl.id)) p.push(t.short + ' 선수 id 이상 ' + pl.name);
      ids.add(pl.id);
      if (!['P', 'C', 'IF', 'OF'].includes(pl.pos)) p.push(t.short + ' 포지션 이상 ' + pl.name);
    });
    if (!r.source || !isHttpUrl(r.source.url)) p.push(t.short + ' 명단 출처 주소 없음');
  });
  if (!Array.isArray(players.profiles)) p.push('profiles 가 배열이 아님');
  else players.profiles.forEach(pr => {
    if (!pr.wiki) p.push('프로필 문서 이름 없음');
    if (pr.born && !/^\d{4}-\d{2}-\d{2}$/.test(pr.born)) p.push('생년월일 형식 ' + pr.wiki);
    for (const k of ['birthplace', 'salary', 'contract', 'realName']) if (k in pr) p.push('수집하지 않기로 한 항목 ' + k + ' ' + pr.wiki);
    if (pr.photo) {
      const ph = pr.photo;
      if (!IMAGE_HOST.test(ph.thumb || '')) p.push('사진 주소가 위키미디어가 아님 ' + pr.wiki);
      if (!FREE_LICENSE.test(ph.license || '')) p.push('사진 라이선스가 자유 이용이 아님 ' + pr.wiki);
      if (!isHttpUrl(ph.page || '')) p.push('사진 원본 링크 없음 ' + pr.wiki);
      if (ph.large && !IMAGE_HOST.test(ph.large.url || '')) p.push('큰 사진 주소가 위키미디어가 아님 ' + pr.wiki);
    }
  });
  return p;
}

const STAT_KEYS = new Set(BAT_COLS.concat(PIT_COLS));

/** data/stats.js 검사 — 연도별 기록과 KBO 공식 기록 번호 */
function validateStats(stats) {
  const p = [];
  if (!stats || typeof stats !== 'object') return ['자료가 비어 있음'];
  if (stats.version !== 1) p.push('version');
  if (!ISO.test(stats.generatedAt || '')) p.push('generatedAt');
  if (!Array.isArray(stats.players)) return p.concat('players 가 배열이 아님');
  const seen = new Set();
  stats.players.forEach(s => {
    if (!s || !s.wiki || seen.has(s.wiki)) p.push('선수 문서 이름 이상 ' + (s && s.wiki));
    seen.add(s && s.wiki);
    if (s.kbo) for (const k of ['hitter', 'pitcher']) if (s.kbo[k] !== null && !/^\d{4,7}$/.test(String(s.kbo[k]))) p.push('KBO 번호 이상 ' + s.wiki);
    for (const kind of ['bat', 'pit']) {
      const t = s[kind];
      if (!t) continue;
      if (!Array.isArray(t.cols) || t.cols[0] !== 'year' || t.cols.some(c => !STAT_KEYS.has(c))) p.push('기록 칸 이상 ' + s.wiki);
      if (!Array.isArray(t.rows) || !t.rows.length || t.rows.some(r => !Array.isArray(r) || r.length !== t.cols.length || !/^\d{4}$/.test(r[0]))) p.push('기록 줄 이상 ' + s.wiki);
      if (t.total && (!Array.isArray(t.total) || t.total.length !== t.cols.length)) p.push('통산 줄 이상 ' + s.wiki);
    }
    if (!s.bat && !s.pit && !s.kbo) p.push('빈 기록 ' + s.wiki);
  });
  return p;
}

module.exports = {
  validateStats, parseCareerStats, parseStatTable, parseKboIds, statCellText, alignRows, BAT_COLS, PIT_COLS,
  decodeEntities, clean, pick, pickLink, stripByline, scrubSummary, spaceSentences, truncate,
  articleNo, canonicalUrl, hashId, isHttpUrl,
  kstDate, seasonFor, parseFeedDate, ymd,
  matchBraces, findTemplate, splitTopLevel, templateParams, stripWiki, listItems,
  parseWikiTable, extractTable, teamByWikiEn, parseStandings, computeStandings, validateStandings, statusOf,
  groupKind, parseRosterLine, parseRoster, validateRoster,
  parseBirth, handOf, parseProfile, profileMatchesTeam, photoFileName, parseImageInfo, parseImageSize, FREE_LICENSE, IMAGE_HOST,
  teamsOf, isBaseball, topicsOf, isListArticle, parseFeed, parseGameTitle, teamByTitleName,
  mergeGames, mergeNews, NEWS_KEEP_HOURS, NEWS_MAX,
  validateLive, validatePlayers,
};
