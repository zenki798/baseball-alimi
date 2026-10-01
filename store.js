/* 데이터 계층 — window.Baseball
 *
 * 화면(app.js)은 이 객체가 주는 정리된 모양만 쓴다. 자료가 어디서 왔는지(위키백과·RSS)는 모른다.
 * 출처를 바꿀 때는 scripts/collect.js 와 이 파일만 고친다 (AGENTS.md 5절 "데이터 계약").
 *
 * 읽는 것: window.BaseballTeams(teams.js) · window.BaseballLive(data/live.js) · window.BaseballPlayers(data/players.js)
 * 자료 파일이 없거나 깨져 있어도 예외를 던지지 않는다 — 빈 목록을 돌려주고 화면이 "자료 없음"을 그린다.
 */
(function (g) {
  'use strict';

  var T = g.BaseballTeams;
  var TEAMS = T.TEAMS;
  var BY_ID = {};
  TEAMS.forEach(function (t) { BY_ID[t.id] = t; });

  var KST = 9 * 3600 * 1000;
  var POS_NAME = { P: '투수', C: '포수', IF: '내야수', OF: '외야수', M: '감독' };
  var TOPIC_NAME = { kbo: 'KBO', abroad: '해외야구', national: '대표·아마' };

  /* 지금 시각. 테스트가 시계를 고정할 수 있게 Date.now 만 쓴다 */
  function now() { return Date.now(); }
  function kstDate(ms) { return new Date(ms + KST).toISOString().slice(0, 10); }
  function today() { return kstDate(now()); }

  /* ---------- 글자 ---------- */

  var CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  /** "김도영" → "ㄱㄷㅇ" (한글 음절이 아니면 그대로) */
  function chosung(s) {
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i) - 0xac00;
      out += c >= 0 && c <= 11171 ? CHO[Math.floor(c / 588)] : s[i];
    }
    return out;
  }
  function onlyJamo(s) { return /^[ㄱ-ㅎ]+$/.test(s); }
  function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ''); }

  /* ---------- 숫자·날짜 표시 ---------- */

  /** 승률: 0.629 (KBO 표기처럼 앞의 0 을 남긴다) */
  function fmtPct(p) { return (typeof p === 'number' && isFinite(p) ? p : 0).toFixed(3); }
  /** 게임차: 1위는 "-", 나머지는 소수 한 자리 */
  function fmtGb(gb) { return !gb ? '-' : (Math.round(gb * 2) / 2).toFixed(1); }
  function fmtStreak(s) {
    if (!s || !s.n) return '-';
    return s.n + (s.type === 'W' ? '연승' : s.type === 'L' ? '연패' : '무');
  }
  function fmtRecord(r) { return r ? r.w + '-' + r.d + '-' + r.l : '-'; }

  var WEEK = ['일', '월', '화', '수', '목', '금', '토'];
  /** '2026-10-01' → '10월 1일 (목)' */
  function fmtDay(ymd, withWeek) {
    var p = String(ymd).split('-').map(Number);
    if (p.length !== 3) return String(ymd);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    return p[1] + '월 ' + p[2] + '일' + (withWeek === false ? '' : ' (' + WEEK[d.getUTCDay()] + ')');
  }
  function fmtShortDay(ymd) {
    var p = String(ymd).split('-').map(Number);
    return p[1] + '/' + p[2];
  }
  /** 한국 시각 "10월 1일 22:15" */
  function fmtTime(iso) {
    var ms = new Date(iso).getTime();
    if (!isFinite(ms)) return '';
    var d = new Date(ms + KST);
    return (d.getUTCMonth() + 1) + '월 ' + d.getUTCDate() + '일 ' +
      String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
  }
  /** "방금 · 12분 전 · 3시간 전 · 어제 · 4일 전" */
  function relTime(iso) {
    var ms = new Date(iso).getTime();
    if (!isFinite(ms)) return '';
    var diff = Math.max(0, now() - ms) / 60000;
    if (diff < 1) return '방금';
    if (diff < 60) return Math.floor(diff) + '분 전';
    if (diff < 24 * 60) return Math.floor(diff / 60) + '시간 전';
    var days = Math.round((Date.parse(today()) - Date.parse(kstDate(ms))) / 86400000);
    return days <= 1 ? '어제' : days + '일 전';
  }
  /** 만 나이 (한국 날짜 기준) */
  function age(born) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(born || '')) return null;
    var t = today();
    var a = Number(t.slice(0, 4)) - Number(born.slice(0, 4));
    if (t.slice(5) < born.slice(5)) a--;
    return a >= 0 && a < 100 ? a : null;
  }
  function hands(p) {
    if (!p || (!p.throws && !p.bats)) return '';
    return (p.throws ? p.throws + '투' : '') + (p.bats ? p.bats + '타' : '');
  }

  /* ---------- 자료 묶기 ---------- */

  var S = null;   // load() 가 만든 색인

  function arr(x) { return Array.isArray(x) ? x : []; }

  function load() {
    var live = g.BaseballLive && typeof g.BaseballLive === 'object' ? g.BaseballLive : null;
    var pl = g.BaseballPlayers && typeof g.BaseballPlayers === 'object' ? g.BaseballPlayers : null;
    var st = live && live.standings && Array.isArray(live.standings.rows) ? live.standings : null;
    var rows = st ? st.rows.filter(function (r) { return BY_ID[r.team]; }).slice().sort(function (a, b) {
      return (a.rank - b.rank) || (b.pct - a.pct) || (b.win - a.win);
    }) : [];
    var games = arr(live && live.games).filter(function (x) { return BY_ID[x.t1] && BY_ID[x.t2]; }).slice()
      .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    var news = arr(live && live.news).filter(function (n) { return n && n.title && /^https?:\/\//i.test(n.url || ''); }).slice()
      .sort(function (a, b) { return new Date(b.publishedAt) - new Date(a.publishedAt); });

    var profiles = {};
    arr(pl && pl.profiles).forEach(function (p) { if (p && p.wiki) profiles[p.wiki] = p; });

    var people = [];
    var byPerson = {};
    var nameCount = {};
    TEAMS.forEach(function (t) {
      var r = pl && pl.rosters && pl.rosters[t.id];
      if (!r) return;
      arr(r.players).forEach(function (p) {
        var person = {
          id: p.id, team: t.id, number: p.number, name: p.name, pos: p.pos, wiki: p.wiki || null,
          note: p.note || '', dev: !!p.dev, profile: (p.wiki && profiles[p.wiki]) || null,
          cho: chosung(p.name), key: norm(p.name),
        };
        people.push(person);
        byPerson[person.id] = person;
        nameCount[person.name] = (nameCount[person.name] || 0) + 1;
      });
      if (r.manager) {
        var m = r.manager;
        byPerson[t.id + '-mgr'] = {
          id: t.id + '-mgr', team: t.id, number: m.number, name: m.name, pos: 'M', wiki: m.wiki || null,
          note: '', dev: false, profile: (m.wiki && profiles[m.wiki]) || null, cho: chosung(m.name), key: norm(m.name),
        };
      }
    });

    S = { live: live, players: pl, standings: st, rows: rows, games: games, news: news, people: people, byPerson: byPerson, nameCount: nameCount };
    return api;
  }

  function team(id) { return BY_ID[id] || null; }
  function row(id) {
    for (var i = 0; i < S.rows.length; i++) if (S.rows[i].team === id) return S.rows[i];
    return null;
  }
  function rowAtRank(rank) {
    for (var i = 0; i < S.rows.length; i++) if (S.rows[i].rank === rank) return S.rows[i];
    return S.rows[rank - 1] || null;
  }
  /** a 가 b 보다 몇 경기 앞서는가 (뒤지면 음수) */
  function gamesAhead(a, b) { return ((a.win - b.win) + (b.loss - a.loss)) / 2; }

  /** 가을야구 진출선(5위)과의 거리: 5위 안이면 6위보다 몇 경기 앞섰나, 밖이면 5위보다 몇 경기 뒤졌나 */
  function cutDistance(id) {
    var r = row(id);
    if (!r || S.rows.length < T.POSTSEASON_CUT + 1) return null;
    var inside = S.rows.indexOf(r) < T.POSTSEASON_CUT;
    var other = S.rows[inside ? T.POSTSEASON_CUT : T.POSTSEASON_CUT - 1];
    return { inside: inside, vs: other.rank, gap: gamesAhead(r, other) };
  }

  function remaining(id) {
    var r = row(id);
    return r ? Math.max(0, T.SEASON_GAMES - r.games) : null;
  }

  /* ---------- 경기 ---------- */

  function gameDates() {
    var seen = {}, out = [];
    S.games.forEach(function (x) { if (!seen[x.date]) { seen[x.date] = 1; out.push(x.date); } });
    return out;
  }
  function gamesOn(date) { return S.games.filter(function (x) { return x.date === date; }); }

  /** 한 구단 입장에서 본 경기 — { date, opp, my, their, result:'W'|'L'|'D', venue:'홈'|'원정'|'' } 최신순 */
  function teamGames(id, n) {
    var out = [];
    for (var i = 0; i < S.games.length && (!n || out.length < n); i++) {
      var x = S.games[i];
      if (x.t1 !== id && x.t2 !== id) continue;
      var mine = x.t1 === id;
      var my = mine ? x.s1 : x.s2, their = mine ? x.s2 : x.s1;
      out.push({
        id: x.id, date: x.date, stadium: x.stadium || '', opp: mine ? x.t2 : x.t1, my: my, their: their,
        result: my > their ? 'W' : my < their ? 'L' : 'D',
        venue: x.home === id ? '홈' : x.home ? '원정' : '', source: x.source || null,
      });
    }
    return out;
  }

  /* ---------- 뉴스 ---------- */

  function news(f) {
    f = f || {};
    var q = norm(f.q);
    return S.news.filter(function (n) {
      if (f.topic && f.topic !== 'all' && (n.topics || []).indexOf(f.topic) < 0) return false;
      if (f.team && (n.teams || []).indexOf(f.team) < 0) return false;
      if (q && norm(n.title + ' ' + (n.summary || '') + ' ' + n.source).indexOf(q) < 0) return false;
      return true;
    });
  }

  /** 구단 별명 정규식. 구형 사파리(16.3 이하)는 뒤 보기((?<!…))를 몰라 예외가 나므로 짧은 이름으로 대신한다 */
  function teamPattern(t) {
    try { return new RegExp(t.alias); } catch (e) { return new RegExp(t.short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); }
  }

  /** 선수 이름이 나온 기사. 이름이 짧거나 다른 선수와 같으면 소속 구단도 함께 나와야 한다(동명이인 섞임 방지) */
  function personNews(person, n) {
    if (!person) return [];
    var t = team(person.team);
    var strict = (S.nameCount[person.name] || 0) > 1 || person.name.length < 3;
    var teamRe = teamPattern(t);
    var out = [];
    for (var i = 0; i < S.news.length && out.length < (n || 8); i++) {
      var x = S.news[i];
      var text = x.title + ' ' + (x.summary || '');
      if (text.indexOf(person.name) < 0) continue;
      if (strict && !teamRe.test(text) && (x.teams || []).indexOf(person.team) < 0) continue;
      out.push(x);
    }
    return out;
  }

  /* ---------- 선수 ---------- */

  var POS_ORDER = { P: 0, C: 1, IF: 2, OF: 3 };

  function roster(id) {
    var r = S.players && S.players.rosters && S.players.rosters[id];
    if (!r) return null;
    var list = S.people.filter(function (p) { return p.team === id; });
    return {
      asOf: r.asOf || null, source: r.source || null,
      manager: S.byPerson[id + '-mgr'] || null,
      coaches: arr(r.coaches),
      players: list,
      military: arr(r.military),
    };
  }

  function person(id) { return (S && S.byPerson[id]) || null; }

  /* ---------- 연도별 기록 (data/stats.js — 선수 화면을 열 때만 싣는다) ---------- */

  var STAT_LABEL = {
    year: '연도', team: '팀', g: '경기', avg: '타율', h: '안타', hr: '홈런', rbi: '타점', r: '득점', sb: '도루', bb: '볼넷', so: '삼진', ops: 'OPS',
    era: '평균자책점', w: '승', l: '패', sv: '세이브', hld: '홀드', ip: '이닝', k: '탈삼진', whip: 'WHIP',
  };
  var KBO_RECORD = {
    hitter: 'https://www.koreabaseball.com/Record/Player/HitterDetail/Total.aspx?playerId=',
    pitcher: 'https://www.koreabaseball.com/Record/Player/PitcherDetail/Total.aspx?playerId=',
  };
  var statsIndex = null;
  function statsLoaded() { return !!(g.BaseballStats && Array.isArray(g.BaseballStats.players)); }
  /** 선수 → { bat, pit, kbo: { hitter, pitcher }, links: [{ kind, url }] } 또는 null. 자료가 아직 안 실렸으면 undefined */
  function stats(p) {
    if (!statsLoaded()) return undefined;
    if (!statsIndex || statsIndex.src !== g.BaseballStats) {
      var by = {};
      g.BaseballStats.players.forEach(function (s) { if (s && s.wiki) by[s.wiki] = s; });
      statsIndex = { src: g.BaseballStats, by: by };
    }
    var s = p && p.wiki ? statsIndex.by[p.wiki] : null;
    if (!s) return null;
    var links = [];
    ['hitter', 'pitcher'].forEach(function (k) {
      var id = s.kbo && s.kbo[k];
      if (id && /^\d{4,7}$/.test(String(id))) links.push({ kind: k, url: KBO_RECORD[k] + id });
    });
    return { bat: s.bat || null, pit: s.pit || null, kbo: s.kbo || null, links: links };
  }
  function statsSeason() { return statsLoaded() ? g.BaseballStats.latestSeason || null : null; }

  /** 이름·초성·등번호로 찾는다. 등번호만 넣으면 그 번호의 선수 */
  function searchPeople(f) {
    f = f || {};
    var q = String(f.q || '').trim();
    var nq = norm(q);
    var jamo = onlyJamo(nq);
    var num = /^\d{1,3}$/.test(nq) ? Number(nq) : null;
    var list = S.people.filter(function (p) {
      if (f.team && p.team !== f.team) return false;
      if (f.pos && p.pos !== f.pos) return false;
      if (!nq) return true;
      if (num !== null) return p.number === num;
      if (jamo) return p.cho.indexOf(nq) >= 0;
      return p.key.indexOf(nq) >= 0;
    });
    /* 정확히 같은 이름 → 이름이 그 글자로 시작 → 나머지, 그다음 구단·포지션·번호 순 */
    list.sort(function (a, b) {
      if (nq && !jamo && num === null) {
        var ra = a.key === nq ? 0 : a.key.indexOf(nq) === 0 ? 1 : 2;
        var rb = b.key === nq ? 0 : b.key.indexOf(nq) === 0 ? 1 : 2;
        if (ra !== rb) return ra - rb;
      }
      return (TEAMS.indexOf(team(a.team)) - TEAMS.indexOf(team(b.team))) ||
        (POS_ORDER[a.pos] - POS_ORDER[b.pos]) ||
        ((a.number === null ? 999 : a.number) - (b.number === null ? 999 : b.number)) ||
        (a.name < b.name ? -1 : 1);
    });
    return list;
  }

  var api = {
    TEAMS: TEAMS, SEASON_GAMES: T.SEASON_GAMES, POSTSEASON_CUT: T.POSTSEASON_CUT,
    POS_NAME: POS_NAME, TOPIC_NAME: TOPIC_NAME,
    load: load,
    team: team,
    hasLive: function () { return !!S.live; },
    hasPlayers: function () { return !!(S.players && S.people.length); },
    season: function () { return (S.live && S.live.season) || null; },
    generatedAt: function () { return (S.live && S.live.generatedAt) || null; },
    playersGeneratedAt: function () { return (S.players && S.players.generatedAt) || null; },
    sources: function () { return (S.live && S.live.sources) || { news: [] }; },
    standings: function () {
      return S.standings ? { asOf: S.standings.asOf, source: S.standings.source || null, rows: S.rows } : null;
    },
    row: row, rowAtRank: rowAtRank, gamesAhead: gamesAhead, cutDistance: cutDistance, remaining: remaining,
    games: function () { return S.games; },
    gameDates: gameDates, gamesOn: gamesOn, teamGames: teamGames,
    news: news, personNews: personNews,
    roster: roster, person: person, people: function () { return S.people; }, searchPeople: searchPeople,
    fmt: {
      pct: fmtPct, gb: fmtGb, streak: fmtStreak, record: fmtRecord, day: fmtDay, shortDay: fmtShortDay,
      time: fmtTime, rel: relTime, age: age, hands: hands,
    },
    stats: stats, statsLoaded: statsLoaded, statsSeason: statsSeason, STAT_LABEL: STAT_LABEL,
    chosung: chosung, today: today, kstDate: kstDate,
  };

  load();
  g.Baseball = api;
})(window);
