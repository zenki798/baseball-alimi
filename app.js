/* 화면 로직 — window.BaseballApp
 *
 * - 화면 넷: 순위(#standings) · 팀(#team/<id>) · 선수(#players, #player/<id>) · 뉴스(#news)
 *   주소 뒤 # 로 화면을 바꾼다. 앱(홈 화면)으로 실행해도 안드로이드 뒤로 가기가 이전 화면으로 돌아간다.
 * - 자료는 window.Baseball(store.js)에서만 받는다.
 * - 외부에서 온 글자(기사 제목·선수 이름 등)는 textContent 로만 넣는다. innerHTML 에는 이 파일의 고정 그림(SVG)만 넣는다.
 * - localStorage 는 막혀 있을 수 있다(file://·사생활 보호 모드). 읽기·쓰기를 모두 감싸고, 실패해도 화면은 돈다.
 */
(function () {
  'use strict';

  var B = window.Baseball;
  var F = B.fmt;
  var KEY = { myTeam: 'baseball-alimi.myTeam', installDismissed: 'baseball-alimi.installDismissed', owner: 'baseball-alimi.owner' };
  var AUTO_REFRESH_MS = 10 * 60 * 1000;    // 화면이 다시 보일 때, 이만큼 지났으면 새 자료를 받는다
  var STALE_HOURS = 6;                      // 마지막 수집이 이보다 오래되면 바닥글에 경고
  var PAGE = 60;                            // 선수 목록 한 번에 그리는 수
  var OWNER_MAX = 20;                       // 제목 뒤에 붙이는 이름 최대 글자 수
  var APP_NAME = (document.getElementById('brandName') || {}).textContent || '야구알리미';

  /* 제목 뒤 이름("for ○○")은 이 기기에만 저장한다. 공개 사이트·저장소에는 사람 이름을 넣지 않는다(사용자 결정, AGENTS.md 9절) */
  function cleanOwner(v) {
    return String(v || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, OWNER_MAX);
  }
  function appTitle() { return APP_NAME + (state.owner ? ' for ' + state.owner : ''); }

  /* ---------- 저장 (막혀 있어도 죽지 않게) ---------- */

  function load(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function save(key, val) {
    try {
      if (val === null || val === undefined) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, String(val));
    } catch (e) { /* 저장을 못 해도 이번 화면에서는 고른 대로 보인다 */ }
  }
  function validTeam(id) { return id && B.team(id) ? id : null; }

  /* ---------- 앱 모드 ---------- */

  var query = new URLSearchParams(location.search);
  var appMode = query.get('source') === 'pwa' ||
    !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    window.navigator.standalone === true;
  if (appMode) document.documentElement.classList.add('app-mode');

  var state = {
    myTeam: validTeam(load(KEY.myTeam)),
    owner: cleanOwner(load(KEY.owner)),
    route: { view: 'standings', id: null, q: {} },
    gamesDate: null,
    teamPos: 'P',
    news: { topic: 'all', team: '', q: '' },
    players: { q: '', team: '', pos: '', limit: PAGE },
    lastLoad: Date.now(),
    statKind: null,       // 연도별 기록에서 고른 종류(타격·투구) — 저장하지 않는다
    statsFailed: false,   // data/stats.js 를 못 실었으면 true (다시 그릴 때 안내)
  };

  /* ---------- DOM 도우미 ---------- */

  function $(id) { return document.getElementById(id); }

  /** h('a', { href: '#x', class: 'c', text: '글자' }, 자식…) — 글자는 늘 텍스트 노드로 들어간다 */
  function h(tag, props) {
    var el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'on') Object.keys(v).forEach(function (ev) { el.addEventListener(ev, v[ev]); });
        else if (k === 'team') setTeamVars(el, v);
        else if (k === 'hidden' || k === 'disabled') el[k] = !!v;
        else if (k === 'value') el.value = v;
        else el.setAttribute(k, v === true ? '' : String(v));
      });
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(el, x); }); return; }
    el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  /** 이 파일의 고정 SVG 만 넣는다 (외부 글자를 넣지 않는다) */
  var ICON = {
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3"/><path d="M15.6 15.6l4.6 4.6"/></svg>',
    zoom: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5M10.5 8v5M8 10.5h5"/></svg>',
  };
  function icon(name) {
    var s = document.createElement('span');
    s.className = 'ic';
    s.innerHTML = ICON[name];
    return s.firstChild;
  }

  function setTeamVars(el, id) {
    var t = B.team(id);
    if (t) { el.style.setProperty('--c', t.color); el.style.setProperty('--i', t.ink); }
    return el;
  }
  function teamBadge(id, size) {
    var t = B.team(id);
    return h('span', { class: 'tb' + (size ? ' ' + size : ''), team: id, title: t ? t.name : null }, t ? t.short : '?');
  }
  /** 구단 엠블럼(위키미디어 공용 퍼블릭 도메인 — icons/teams/README.md). px 크기의 정사각형 칸에 맞춘다.
   *  가로로 긴 글자 로고(한화)는 40px 미만이면 읽을 수 없어 색 배지로, 그림을 못 읽으면 역시 색 배지로 바꾼다. */
  var LOGO_BADGE = { 16: 'sm', 18: 'sm', 20: 'sm', 22: 'sm' };
  function teamLogo(id, px) {
    var t = B.team(id);
    var badge = function () { return teamBadge(id, px >= 44 ? 'lg' : LOGO_BADGE[px] || null); };
    if (!t || !t.logo || (t.logoWide && px < 40)) return badge();
    var img = h('img', {
      class: 'tl' + (t.logoWide ? ' wide' : ''), src: t.logo, alt: t.short, title: t.name,
      width: t.logoWide ? Math.round(px * 1.45) : px, height: px, decoding: 'async', 'data-team': id,
    });
    img.addEventListener('error', function () { if (img.parentNode) img.parentNode.replaceChild(badge(), img); });
    return img;
  }
  var RES = { W: '승', L: '패', D: '무' };
  function resChip(r, title) { return h('span', { class: 'res ' + r, title: title || RES[r] }, RES[r]); }

  function safeUrl(u) { return /^https?:\/\/[^\s"'<>]+$/i.test(String(u || '')) ? u : null; }
  function wikiLink(host, title) {
    return 'https://' + host + '/wiki/' + encodeURIComponent(String(title).replace(/ /g, '_'));
  }
  function extLink(url, text, cls) {
    var u = safeUrl(url);
    return u ? h('a', { href: u, target: '_blank', rel: 'noopener noreferrer', class: cls || null }, text) : h('span', null, text);
  }
  function card(cls, head, body) {
    return h('section', { class: 'card' + (cls ? ' ' + cls : '') }, head, body);
  }
  function cardHead(title, meta, level) {
    return h('div', { class: 'card-head' }, h(level || 'h2', null, title), meta || null);
  }
  function empty(title, text) {
    return h('p', { class: 'empty' }, h('strong', null, title), text || null);
  }

  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  /* ---------- 주소(#) → 화면 ---------- */

  var VIEWS = ['standings', 'teams', 'players', 'news'];

  function parseHash() {
    var raw = decodeURIComponent((location.hash || '').replace(/^#\/?/, ''));
    var qi = raw.indexOf('?');
    var path = qi >= 0 ? raw.slice(0, qi) : raw;
    var q = {};
    if (qi >= 0) new URLSearchParams(raw.slice(qi + 1)).forEach(function (v, k) { q[k] = v; });
    var parts = path.split('/').filter(Boolean);
    var head = parts[0] || 'standings';
    if (head === 'team') return { view: 'teams', id: validTeam(parts[1]), q: q };
    if (head === 'player') return { view: 'players', id: parts[1] || null, q: q };
    if (VIEWS.indexOf(head) < 0) return { view: 'standings', id: null, q: {} };
    return { view: head, id: null, q: q };
  }

  function onRoute(initial) {
    var prev = state.route;
    var r = parseHash();
    state.route = r;
    if (r.view === 'news') {
      if (r.q.team !== undefined) state.news.team = validTeam(r.q.team) || '';
      if (r.q.topic && B.TOPIC_NAME[r.q.topic]) state.news.topic = r.q.topic;
    }
    if (r.view === 'players' && !r.id && r.q.team !== undefined) {
      state.players.team = validTeam(r.q.team) || '';
      state.players.limit = PAGE;
    }
    render();
    if (!initial && (prev.view !== r.view || prev.id !== r.id)) window.scrollTo(0, 0);
  }

  function render() {
    var r = state.route;
    if (lb.open) { lb.open = false; $('lightbox').hidden = true; document.documentElement.classList.remove('lb-open'); }
    VIEWS.forEach(function (v) {
      var sec = $('view-' + v);
      sec.hidden = v !== r.view;
    });
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (a) {
      if (a.getAttribute('data-view') === r.view) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    renderHeader();
    var root = $('view-' + r.view);
    if (r.view === 'standings') renderStandings(root);
    else if (r.view === 'teams') renderTeam(root, r.id || state.myTeam || defaultTeam());
    else if (r.view === 'players') { if (r.id) renderPerson(root, r.id); else renderPlayers(root); }
    else if (r.view === 'news') renderNews(root);
    renderFoot();
    var titles = { standings: '순위', teams: '팀', players: '선수', news: '뉴스' };
    document.title = titles[r.view] + ' — ' + appTitle();
  }

  function defaultTeam() {
    var st = B.standings();
    return (st && st.rows[0] && st.rows[0].team) || B.TEAMS[0].id;
  }

  /* ---------- 머리띠 ---------- */

  function renderHeader() {
    var season = B.season();
    $('seasonLabel').textContent = (season ? season + ' ' : '') + 'KBO';
    var v = clear($('myTeamValue'));
    if (state.myTeam) append(v, [teamLogo(state.myTeam, 20), h('span', { class: 'mt-name' }, B.team(state.myTeam).short)]);
    else v.textContent = '고르기';
    $('myTeamBtn').setAttribute('aria-label', '내 팀: ' + (state.myTeam ? B.team(state.myTeam).name : '아직 고르지 않음') + ' — 바꾸기');
    $('refreshBtn').hidden = !appMode;
    var bf = $('brandFor');
    bf.textContent = state.owner ? 'for ' + state.owner : '';
    bf.hidden = !state.owner;
    document.querySelector('.brand').setAttribute('aria-label', appTitle() + ' 첫 화면(순위)');
  }

  /* ---------- 순위 ---------- */

  function renderStandings(root) {
    clear(root);
    var layout = h('div', { class: 'st-layout' });
    layout.appendChild(h('div', { class: 'a-mine' }, myTeamCard()));
    layout.appendChild(h('div', { class: 'a-table' }, standingsCard()));
    layout.appendChild(h('div', { class: 'a-games' }, gamesCard()));
    root.appendChild(layout);
  }

  function standingsCard() {
    var st = B.standings();
    if (!st || !st.rows.length) {
      return card(null, cardHead('정규시즌 순위'), empty('순위 자료가 아직 없습니다', '자료를 모으는 중이거나 출처에서 받지 못했습니다. 잠시 뒤 다시 열어 주세요.'));
    }
    var season = B.season();
    var head = h('div', { class: 'card-head' },
      h('h2', null, (season ? season + ' ' : '') + '정규시즌 순위'),
      h('span', { class: 'meta', id: 'standingsAsOf' }, F.day(st.asOf) + ' 경기까지'));
    var table = h('table', { class: 'st-table', id: 'standingsTable' },
      h('caption', { class: 'sr-only' }, (season || '') + ' KBO 정규시즌 순위, ' + F.day(st.asOf, false) + ' 기준'),
      h('thead', null, h('tr', null,
        h('th', { class: 'rank', scope: 'col' }, '순위'),
        h('th', { class: 'l', scope: 'col' }, '팀'),
        h('th', { class: 'n', scope: 'col' }, '경기'),
        h('th', { class: 'n', scope: 'col' }, '승'),
        h('th', { class: 'n', scope: 'col' }, '패'),
        h('th', { class: 'n', scope: 'col' }, '무'),
        h('th', { class: 'n', scope: 'col' }, '승률'),
        h('th', { class: 'n', scope: 'col' }, '게임차'),
        h('th', { class: 'n c-opt2', scope: 'col' }, '연속'),
        h('th', { class: 'c-opt', scope: 'col', title: '왼쪽이 오래된 경기' }, '최근 5경기'))));
    var tbody = h('tbody');
    st.rows.forEach(function (r, i) {
      var t = B.team(r.team);
      var cls = [];
      if (i < B.POSTSEASON_CUT) cls.push('ps');
      if (i === B.POSTSEASON_CUT - 1) cls.push('cut');
      if (r.team === state.myTeam) cls.push('mine');
      var form = B.teamGames(r.team, 5).slice().reverse();
      var teamCell = h('div', { class: 'team-cell' },
        teamLogo(r.team, 26),
        h('a', { href: '#team/' + r.team, class: 'nm' }, t.short),
        h('span', { class: 'full' }, t.name.split(' ').slice(1).join(' ') || ''),
        r.status === 'in' ? h('span', { class: 'badge-st', title: '가을야구(포스트시즌) 진출 확정' }, 'PS') : null,
        r.status === 'first' ? h('span', { class: 'badge-st first', title: '정규시즌 1위 확정' }, '1위 확정') : null,
        r.status === 'out' ? h('span', { class: 'badge-st out', title: '가을야구 탈락 확정' }, '탈락') : null,
        r.team === state.myTeam ? h('span', { class: 'badge-mine' }, '내 팀') : null);
      tbody.appendChild(h('tr', { class: cls.join(' ') || null, 'data-team': r.team },
        h('td', { class: 'rank n' }, r.rank),
        h('td', { class: 'l' }, teamCell),
        h('td', { class: 'n' }, r.games),
        h('td', { class: 'n' }, r.win),
        h('td', { class: 'n' }, r.loss),
        h('td', { class: 'n' }, r.draw),
        h('td', { class: 'n pct' }, F.pct(r.pct)),
        h('td', { class: 'n gb' }, F.gb(r.gb)),
        h('td', { class: 'n c-opt2' }, F.streak(r.streak)),
        h('td', { class: 'c-opt' }, form.length ? h('span', { class: 'form' }, form.map(function (g) {
          return resChip(g.result, F.shortDay(g.date) + ' ' + B.team(g.opp).short + '전 ' + g.my + '-' + g.their + ' ' + RES[g.result]);
        })) : h('span', { class: 'meta' }, '-'))));
    });
    tbody.addEventListener('click', function (e) {
      if (e.target.closest('a')) return;
      var tr = e.target.closest('tr[data-team]');
      if (tr) location.hash = '#team/' + tr.getAttribute('data-team');
    });
    table.appendChild(tbody);

    var src = st.source || {};
    return h('section', { class: 'card flush' },
      h('div', { style: 'padding:14px 16px 0' }, head),
      h('div', { class: 'table-wrap' }, table),
      h('div', { class: 'legend' },
        h('span', null, h('i', { class: 'l-ps' }), '가을야구 진출권(1~5위)'),
        h('span', null, h('i', { class: 'l-cut' }), '5위 경계'),
        state.myTeam ? h('span', null, h('i', { class: 'l-mine' }), '내 팀') : null,
        h('span', null, '승률은 무승부를 빼고 계산 · 홈·원정 성적은 팀 화면에')),
      h('p', { class: 'note', style: 'margin:0;padding:0 16px 14px' },
        '출처: ', extLink(src.url, src.name || '위키백과'), ' (', src.license || 'CC BY-SA 4.0', ') — 위키백과 편집자들이 정리한 표를 옮겼습니다. 공식 기록은 KBO 발표를 기준으로 합니다.'));
  }

  function myTeamCard() {
    if (!state.myTeam) {
      return card('myteam-card', null, h('div', { class: 'myteam-prompt' },
        h('p', null, '내 팀을 고르면 순위표에서 강조하고, 팀·뉴스 화면에서 먼저 보여 드립니다.'),
        h('button', { type: 'button', class: 'btn', id: 'pickTeamBtn', on: { click: openTeamSheet } }, '내 팀 고르기')));
    }
    var id = state.myTeam;
    var t = B.team(id);
    var r = B.row(id);
    var el = h('section', { class: 'card myteam-card', team: id, id: 'myTeamCard' });
    el.appendChild(h('div', { class: 'myteam-top' },
      teamLogo(id, 48),
      h('div', null, h('div', { class: 'ttl' }, t.name), h('div', { class: 'meta' }, '내 팀')),
      r ? h('div', { class: 'rank' }, r.rank, h('small', null, '위')) : null));
    if (r) el.appendChild(statTiles(id, r, true));
    var recent = B.teamGames(id, 3);
    if (recent.length) {
      el.appendChild(h('ul', { class: 'list', style: 'margin-top:10px' }, recent.map(teamGameRow)));
    }
    el.appendChild(h('p', { class: 'note', style: 'margin-top:8px' }, h('a', { class: 'more', href: '#team/' + id }, t.short + ' 자세히 보기 →')));
    return el;
  }

  /** 성적 칸들. compact 면 내 팀 카드용으로 줄인다 */
  function statTiles(id, r, compact) {
    var cut = B.cutDistance(id);
    var rem = B.remaining(id);
    var tiles = h('div', { class: 'tiles' });
    function tile(k, v, s, cls) { tiles.appendChild(h('div', { class: 'tile' }, h('div', { class: 'k' }, k), h('div', { class: 'v' + (cls ? ' ' + cls : '') }, v), s ? h('div', { class: 's' }, s) : null)); }
    tile('성적', r.win + '승 ' + r.draw + '무 ' + r.loss + '패', r.games + '경기');
    tile('승률', F.pct(r.pct));
    tile(r.rank === 1 ? '2위와' : '1위와', r.rank === 1 ? gapText(B.gamesAhead(r, B.rowAtRank(2) || r)) : F.gb(r.gb) + ' 경기 뒤',
      r.rank === 1 ? '경기차' : null, r.rank === 1 ? 'up' : null);
    if (cut) {
      tile(cut.inside ? cut.vs + '위와' : cut.vs + '위와', gapText(cut.gap), cut.inside ? '가을야구 안정권까지' : '가을야구 진출선까지',
        cut.gap > 0 ? 'up' : cut.gap < 0 ? 'down' : null);
    }
    if (!compact || rem !== null) tile('남은 경기', rem === null ? '-' : rem + '경기', B.SEASON_GAMES + '경기 중');
    tile('연속', F.streak(r.streak), null, r.streak && r.streak.type === 'W' ? 'up' : r.streak && r.streak.type === 'L' ? 'down' : null);
    return tiles;
  }
  function gapText(gap) {
    if (!gap) return '같은 승차';
    var v = (Math.round(Math.abs(gap) * 2) / 2).toFixed(1);
    return v + ' 경기 ' + (gap > 0 ? '앞' : '뒤');
  }

  function teamGameRow(g) {
    var opp = B.team(g.opp);
    return h('li', { class: 'tg-row' },
      h('span', { class: 'd' }, F.shortDay(g.date)),
      resChip(g.result),
      h('span', { class: 'vs' }, teamLogo(g.opp, 20), h('span', { class: 'nm' }, opp.short + '전'), g.venue ? h('span', { class: 'venue' }, g.venue) : null),
      h('span', { class: 'sc' }, g.my + ' : ' + g.their));
  }

  function gamesCard() {
    var dates = B.gameDates();
    var el = h('section', { class: 'card', id: 'gamesCard' });
    if (!dates.length) {
      el.appendChild(cardHead('경기 결과'));
      el.appendChild(empty('아직 모은 경기 결과가 없습니다', '경기가 끝나면 연합뉴스 전적 기사로 결과를 채웁니다.'));
      return el;
    }
    if (dates.indexOf(state.gamesDate) < 0) state.gamesDate = dates[0];
    var i = dates.indexOf(state.gamesDate);
    var nav = h('div', { class: 'day-nav' },
      h('button', { type: 'button', 'aria-label': '이전 날짜', disabled: i >= dates.length - 1, on: { click: function () { state.gamesDate = dates[i + 1]; swap(); } } }, '‹'),
      h('span', { class: 'day', id: 'gamesDay' }, F.day(state.gamesDate)),
      h('button', { type: 'button', 'aria-label': '다음 날짜', disabled: i <= 0, on: { click: function () { state.gamesDate = dates[i - 1]; swap(); } } }, '›'));
    el.appendChild(h('div', { class: 'card-head' }, h('h2', null, '경기 결과'), nav));
    var list = h('ul', { class: 'games', id: 'gamesList' });
    B.gamesOn(state.gamesDate).forEach(function (g) { list.appendChild(gameItem(g)); });
    el.appendChild(list);
    el.appendChild(h('p', { class: 'note' }, '연합뉴스 전적 기사 제목에서 읽은 결과입니다. 경기 시작 전 일정·선발 투수는 아직 제공하지 않습니다.'));
    function swap() { el.parentNode.replaceChild(gamesCard(), el); }
    return el;
  }

  function gameItem(g) {
    /* 원정 팀을 왼쪽, 홈 팀을 오른쪽에 둔다(중계 관례). 홈을 모르면(잠실 LG-두산) 기사 순서대로 */
    var left = { id: g.t1, s: g.s1 }, right = { id: g.t2, s: g.s2 };
    if (g.home === g.t1) { left = { id: g.t2, s: g.s2 }; right = { id: g.t1, s: g.s1 }; }
    var lw = left.s > right.s, rw = right.s > left.s;
    function side(x, win, lose, isRight) {
      var t = B.team(x.id);
      var kids = [teamLogo(x.id, 28), h('span', { class: 'nm' }, t.short)];
      return h('div', { class: 'side' + (isRight ? ' right' : '') + (win ? ' win' : '') + (lose ? ' lose' : '') }, isRight ? kids.reverse() : kids);
    }
    var homeName = g.home ? B.team(g.home).short : '';
    return h('li', { class: 'game', 'data-game': g.id },
      side(left, lw, rw, false),
      h('div', { class: 'score', 'aria-label': B.team(left.id).short + ' ' + left.s + ', ' + B.team(right.id).short + ' ' + right.s },
        h('span', { class: lw || left.s === right.s ? '' : 'lose' }, left.s), ' : ', h('span', { class: rw || left.s === right.s ? '' : 'lose' }, right.s)),
      side(right, rw, lw, true),
      h('div', { class: 'where' }, (g.stadium ? g.stadium : '') + (homeName ? ' · ' + homeName + ' 홈' : '') + (left.s === right.s ? ' · 무승부' : '')));
  }

  /* ---------- 팀 ---------- */

  function renderTeam(root, id) {
    clear(root);
    id = validTeam(id) || defaultTeam();
    var t = B.team(id);
    var r = B.row(id);

    root.appendChild(h('nav', { class: 'chips scroll', 'aria-label': '구단 고르기', id: 'teamChips' }, B.TEAMS.map(function (x) {
      return h('a', { class: 'chip', href: '#team/' + x.id, 'aria-current': x.id === id ? 'page' : null }, teamLogo(x.id, 20), x.short);
    })));

    var hero = h('section', { class: 'card team-hero', team: id, id: 'teamHero' },
      h('div', { class: 'hero-top' },
        teamLogo(id, 64),
        h('div', null, h('h2', null, t.name), h('div', { class: 'sub' }, t.city + ' · ' + t.stadium)),
        r ? h('div', { class: 'rank-pill' }, r.rank + '위') : null));
    if (r) {
      hero.appendChild(statTiles(id, r, false));
      hero.appendChild(h('div', { class: 'split' },
        h('div', { class: 'tile' }, h('div', { class: 'k' }, '홈'), h('div', { class: 'v' }, r.home ? r.home.w + '승 ' + r.home.d + '무 ' + r.home.l + '패' : '-')),
        h('div', { class: 'tile' }, h('div', { class: 'k' }, '원정'), h('div', { class: 'v' }, r.away ? r.away.w + '승 ' + r.away.d + '무 ' + r.away.l + '패' : '-'))));
      if (r.status) {
        hero.appendChild(h('p', { class: 'note' }, r.status === 'out' ? '가을야구(포스트시즌) 진출이 무산됐습니다.' :
          r.status === 'first' ? '정규시즌 1위가 확정됐습니다.' : '가을야구(포스트시즌) 진출이 확정됐습니다.'));
      }
    } else {
      hero.appendChild(h('p', { class: 'note' }, '순위 자료가 아직 없습니다.'));
    }
    root.appendChild(hero);

    var layout = h('div', { class: 'team-layout' });
    layout.appendChild(h('div', { class: 'a-recent' }, recentCard(id)));
    layout.appendChild(h('div', { class: 'a-news' }, teamNewsCard(id)));
    layout.appendChild(h('div', { class: 'a-roster' }, rosterCard(id)));
    layout.appendChild(h('div', { class: 'a-staff' }, staffCard(id)));
    root.appendChild(layout);
  }

  function recentCard(id) {
    var list = B.teamGames(id, 10);
    var el = card(null, cardHead('최근 경기', h('span', { class: 'meta' }, list.length ? list.length + '경기' : '')));
    if (!list.length) el.appendChild(empty('모은 경기 결과가 아직 없습니다'));
    else el.appendChild(h('ul', { class: 'list', id: 'recentList' }, list.map(teamGameRow)));
    return el;
  }

  function teamNewsCard(id) {
    var list = B.news({ team: id }).slice(0, 6);
    var el = card(null, cardHead(B.team(id).short + ' 뉴스', h('a', { class: 'more', href: '#news?team=' + id }, '더 보기 →')));
    if (!list.length) el.appendChild(empty('최근 사흘 동안 모은 기사가 없습니다'));
    else el.appendChild(h('ul', { class: 'news-list' }, list.map(function (n) { return h('li', null, newsItem(n, true)); })));
    return el;
  }

  function rosterCard(id) {
    var ro = B.roster(id);
    var el = h('section', { class: 'card', id: 'rosterCard' });
    if (!ro || !ro.players.length) {
      el.appendChild(cardHead('선수단'));
      el.appendChild(empty('선수 명단이 아직 없습니다'));
      return el;
    }
    el.appendChild(cardHead('선수단', h('span', { class: 'meta' }, ro.players.length + '명')));
    var groups = ['P', 'C', 'IF', 'OF'];
    if (groups.indexOf(state.teamPos) < 0) state.teamPos = 'P';
    var seg = h('div', { class: 'seg', role: 'group', 'aria-label': '포지션' });
    var grid = h('div', { class: 'roster-grid', id: 'rosterGrid' });
    function draw() {
      Array.prototype.forEach.call(seg.children, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-pos') === state.teamPos)); });
      clear(grid);
      ro.players.filter(function (p) { return p.pos === state.teamPos; }).forEach(function (p) {
        grid.appendChild(h('a', { class: 'person-btn', href: '#player/' + p.id, 'data-id': p.id },
          h('span', { class: 'no' }, p.number === null ? '-' : p.number),
          h('span', { class: 'nm' }, p.name),
          p.note === '주장' ? h('span', { class: 'tag cap' }, '주장') : null,
          p.dev ? h('span', { class: 'tag', title: '세 자리 등번호 — 육성선수' }, '육성') : null));
      });
    }
    groups.forEach(function (g) {
      var n = ro.players.filter(function (p) { return p.pos === g; }).length;
      seg.appendChild(h('button', { type: 'button', 'data-pos': g, on: { click: function () { state.teamPos = g; draw(); } } },
        B.POS_NAME[g] + ' ' + n));
    });
    el.appendChild(seg);
    el.appendChild(grid);
    draw();
    if (ro.military.length) {
      el.appendChild(h('details', { class: 'more-box' },
        h('summary', null, '군 복무 중 ' + ro.military.length + '명'),
        h('div', { class: 'staff' }, ro.military.map(function (m) { return h('span', { class: 'p' }, m.name); }))));
    }
    var src = ro.source || {};
    el.appendChild(h('p', { class: 'note' }, '명단 출처: ', extLink(src.url, src.name || '위키백과'), ' (CC BY-SA 4.0)',
      ro.asOf ? ' · ' + F.time(ro.asOf) + ' 수정본' : '', ' · 1군 등록 명단이 아니라 구단 소속 선수 전체입니다.'));
    return el;
  }

  function staffCard(id) {
    var ro = B.roster(id);
    var el = card(null, cardHead('코칭스태프'));
    if (!ro) { el.appendChild(empty('명단이 아직 없습니다')); return el; }
    if (ro.manager) {
      el.appendChild(h('div', { class: 'mgr-line' },
        h('span', { class: 'lbl' }, '감독'),
        h('a', { href: '#player/' + ro.manager.id, id: 'managerLink' }, ro.manager.name),
        ro.manager.number !== null ? h('span', { class: 'meta' }, 'No.' + ro.manager.number) : null));
    }
    if (ro.coaches.length) {
      el.appendChild(h('div', { class: 'staff' }, ro.coaches.map(function (c) {
        return h('span', { class: 'p' }, c.number !== null ? h('span', { class: 'no' }, c.number) : null, c.name, c.role ? h('span', { class: 'role' }, c.role) : null);
      })));
    }
    return el;
  }

  /* ---------- 선수 ---------- */

  function renderPlayers(root) {
    clear(root);
    if (!B.hasPlayers()) {
      root.appendChild(card(null, cardHead('선수'), empty('선수 명단이 아직 없습니다', '자료를 모으는 중이거나 출처에서 받지 못했습니다.')));
      return;
    }
    var f = state.players;
    var input = h('input', {
      type: 'search', id: 'playerSearch', placeholder: '이름·초성(ㄱㄷㅇ)·등번호', autocomplete: 'off', enterkeyhint: 'search',
      'aria-label': '선수 찾기', value: f.q,
    });
    input.addEventListener('input', function () { f.q = input.value; f.limit = PAGE; drawList(); });
    var teamSel = h('select', { class: 'select', id: 'playerTeam', 'aria-label': '구단' },
      h('option', { value: '' }, '전체 구단'),
      B.TEAMS.map(function (t) { return h('option', { value: t.id }, t.name); }));
    teamSel.value = f.team;
    teamSel.addEventListener('change', function () { f.team = teamSel.value; f.limit = PAGE; drawList(); });
    var posChips = h('div', { class: 'chips', role: 'group', 'aria-label': '포지션', id: 'playerPos' });
    [['', '전체'], ['P', '투수'], ['C', '포수'], ['IF', '내야수'], ['OF', '외야수']].forEach(function (p) {
      posChips.appendChild(h('button', { type: 'button', class: 'chip', 'data-pos': p[0], 'aria-pressed': String(f.pos === p[0]),
        on: { click: function () { f.pos = p[0]; f.limit = PAGE; drawList(); } } }, p[1]));
    });
    root.appendChild(card(null, cardHead('선수 찾기'), h('div', { class: 'filters' },
      h('div', { class: 'filter-row' }, h('label', { class: 'search' }, icon('search'), input), teamSel),
      posChips)));

    var count = h('p', { class: 'count', id: 'playerCount', 'aria-live': 'polite' });
    var list = h('ul', { class: 'people', id: 'peopleList' });
    var more = h('button', { type: 'button', class: 'btn ghost', id: 'morePeople', on: { click: function () { f.limit += PAGE; drawList(); } } }, '더 보기');
    root.appendChild(h('div', { class: 'stack' }, count, list, h('div', { style: 'text-align:center' }, more)));
    root.appendChild(h('p', { class: 'note box' },
      '명단은 한국어 위키백과의 구단별 현재 명단, 프로필은 선수 문서의 정보 상자에서 옮겼습니다(CC BY-SA 4.0). ',
      '연도별 기록은 선수 문서의 통산 기록 표(지난 시즌까지)에서, 올 시즌 기록은 선수 화면의 "KBO 공식 기록" 버튼으로 봅니다.'));

    function drawList() {
      Array.prototype.forEach.call(posChips.children, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-pos') === f.pos)); });
      var all = B.searchPeople(f);
      var total = B.people().length;
      count.textContent = all.length === total ? '선수 ' + total.toLocaleString('ko-KR') + '명' : '선수 ' + total.toLocaleString('ko-KR') + '명 중 ' + all.length.toLocaleString('ko-KR') + '명';
      clear(list);
      if (!all.length) list.appendChild(h('li', { style: 'grid-column:1/-1' }, empty('찾는 선수가 없습니다', '이름을 다시 확인하거나 초성(예: ㄱㄷㅇ)으로 찾아보세요.')));
      all.slice(0, f.limit).forEach(function (p) { list.appendChild(h('li', null, personCard(p))); });
      more.hidden = all.length <= f.limit;
    }
    drawList();
  }

  function personCard(p) {
    var t = B.team(p.team);
    var pr = p.profile;
    var bits = [t.short, B.POS_NAME[p.pos]];
    var a = pr ? F.age(pr.born) : null;
    if (a !== null) bits.push('만 ' + a + '세');
    if (pr && F.hands(pr)) bits.push(F.hands(pr));
    return h('a', { class: 'person-card', href: '#player/' + p.id, team: p.team, 'data-id': p.id },
      h('span', { class: 'no' + (p.number === null ? ' none' : '') }, p.number === null ? '-' : p.number),
      h('span', { class: 'body' },
        h('span', { class: 'nm' }, p.name, p.note === '주장' ? ' ' : null, p.note === '주장' ? h('span', { class: 'tag cap' }, '주장') : null),
        h('span', { class: 'sub', style: 'display:block' }, bits.join(' · '))));
  }

  function renderPerson(root, id) {
    clear(root);
    var p = B.person(id);
    if (!p) {
      root.appendChild(card(null, null, empty('선수를 찾을 수 없습니다', '명단이 바뀌었을 수 있습니다.')));
      root.appendChild(h('p', null, h('a', { class: 'back', href: '#players' }, '← 선수 목록')));
      return;
    }
    var t = B.team(p.team);
    var pr = p.profile;
    root.appendChild(h('div', null,
      h('a', { class: 'back', href: p.pos === 'M' ? '#team/' + p.team : '#players' }, p.pos === 'M' ? '← ' + t.short + ' 팀 화면' : '← 선수 목록')));

    var positions = pr && pr.positions && pr.positions.length ? pr.positions.join(', ') : B.POS_NAME[p.pos];
    var bigNo = function () { return h('span', { class: 'big-no' }, p.number === null ? '-' : p.number); };
    var photo = pr && pr.photo && /^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(pr.photo.thumb || '') ? pr.photo : null;
    var face = bigNo();
    var credit = null;
    if (photo) {
      /* 얼굴 사진 — 위키미디어 공용의 자유 이용 사진만(수집기가 라이선스를 확인했다). 저작자 표기는 CC 라이선스의 조건이다 */
      var img = h('img', {
        src: photo.thumb, alt: p.name + ' 사진' + (photo.caption ? ' — ' + photo.caption : ''),
        width: photo.width || null, height: photo.height || null, decoding: 'async', id: 'personPhoto',
      });
      /* 누르면 크게 (웹·모바일 모두) */
      var zoomBtn = h('button', { type: 'button', class: 'photo-btn', id: 'photoZoom', 'aria-label': p.name + ' 사진 크게 보기', title: '사진 크게 보기',
        on: { click: function () { openLightbox(photo, p.name); } } }, img, h('span', { class: 'zoom-hint' }, icon('zoom')));
      face = h('figure', { class: 'photo' }, zoomBtn,
        p.number !== null ? h('span', { class: 'no-badge', 'aria-label': '등번호 ' + p.number }, p.number) : null);
      credit = h('p', { class: 'photo-credit', id: 'photoCredit' },
        '사진: ', photo.author || '작성자 미상', ' · ',
        photo.licenseUrl ? extLink(photo.licenseUrl, photo.license) : photo.license, ' · ',
        extLink(photo.page, '위키미디어 공용'),
        photo.caption ? ' · ' + photo.caption : null);
      /* 사진을 못 받으면(인터넷 끊김·파일 삭제) 등번호로 바꾸고 표기도 뺀다 */
      img.addEventListener('error', function () {
        if (face.parentNode) face.parentNode.replaceChild(bigNo(), face);
        if (credit && credit.parentNode) credit.parentNode.removeChild(credit);
      });
    }
    var hero = h('section', { class: 'card person-hero', team: p.team, id: 'personHero' },
      h('div', { class: 'top' },
        face,
        h('div', null,
          h('h2', { id: 'personName' }, p.name),
          h('div', { class: 'sub' },
            teamLogo(p.team, 20), h('a', { href: '#team/' + p.team }, t.name), h('span', null, '· ' + (p.pos === 'M' ? '감독' : positions)),
            p.note === '주장' ? h('span', { class: 'tag cap' }, '주장') : null,
            p.dev ? h('span', { class: 'tag', title: '세 자리 등번호 — 육성선수' }, '육성선수') : null))),
      credit);

    if (pr) {
      var facts = h('dl', { class: 'facts', id: 'personFacts' });
      var fact = function (k, v) { if (v) facts.appendChild(h('div', null, h('dt', null, k), h('dd', null, v))); };
      var a = F.age(pr.born);
      fact('생년월일', pr.born ? [pr.born.slice(0, 4) + '년 ' + F.day(pr.born, false), a !== null ? h('span', { class: 'sub-line' }, '만 ' + a + '세') : null] : null);
      fact('투타', F.hands(pr) || null);
      fact('키·몸무게', pr.height || pr.weight ? (pr.height ? pr.height + 'cm' : '') + (pr.height && pr.weight ? ' · ' : '') + (pr.weight ? pr.weight + 'kg' : '') : null);
      fact('국적', pr.nationality);
      fact('프로 입단', pr.proYear ? pr.proYear + '년' : null);
      fact('드래프트', pr.draft);
      hero.appendChild(facts);
    }
    root.appendChild(hero);
    if (p.pos !== 'M') root.appendChild(statsCard(p));   // 감독은 선수 시절 기록이 지금 기록처럼 보여 내지 않는다

    if (pr && (pr.career.length || pr.titles.length)) {
      /* 경력·수상이 둘 다 있을 때만 두 칸으로. 하나뿐이면 전체 폭 */
      var more = h('div', { class: pr.career.length && pr.titles.length ? 'grid-2' : 'stack' });
      if (pr.career.length) more.appendChild(card(null, cardHead('경력', null, 'h3'), h('ul', { class: 'bullets' }, pr.career.map(function (c) { return h('li', null, c); }))));
      if (pr.titles.length) more.appendChild(card(null, cardHead('수상·타이틀', null, 'h3'), h('ul', { class: 'bullets' }, pr.titles.map(function (c) { return h('li', null, c); }))));
      root.appendChild(more);
    }

    var news = B.personNews(p, 8);
    var nc = card(null, cardHead(p.name + ' 관련 뉴스', null, 'h3'));
    if (!news.length) nc.appendChild(empty('최근 사흘 동안 이름이 나온 기사가 없습니다'));
    else nc.appendChild(h('ul', { class: 'news-list', id: 'personNews' }, news.map(function (n) { return h('li', null, newsItem(n, true)); })));
    root.appendChild(nc);

    root.appendChild(h('p', { class: 'note box' },
      p.wiki ? ['프로필 출처: ', extLink(wikiLink('ko.wikipedia.org', p.wiki), '위키백과 「' + p.wiki + '」'), ' (CC BY-SA 4.0). '] : null,
      pr ? null : '위키백과에 이 선수의 문서(정보 상자)가 아직 없어 명단 정보만 보여 드립니다. ',
      pr && !photo ? '위키미디어 공용에 자유 이용 사진이 없는 선수는 사진 대신 등번호를 보여 드립니다. ' : null));
  }

  /* ---------- 연도별 기록 ----------
   * 지난 시즌까지: 위키백과 「통산 기록」 표(data/stats.js — 선수 화면을 처음 열 때 한 번 싣는다).
   * 올 시즌: KBO 공식 기록 페이지로 가는 링크. KBO 기록실은 긁지 않는다(사전 승인 없는 자동 수집 금지 — AGENTS.md 4절). */

  var statsLoading = null;
  function ensureStats() {
    if (B.statsLoaded()) return Promise.resolve();
    if (!statsLoading) {
      statsLoading = loadScript('data/stats.js').then(function () { statsLoading = null; }, function () { statsLoading = null; state.statsFailed = true; });
    }
    return statsLoading;
  }

  function officialLinks(p, st) {
    var season = B.season() || '';
    var wrap = h('div', { class: 'official' });
    var links = (st && st.links) || [];
    links.forEach(function (l) {
      wrap.appendChild(h('a', { class: 'btn', href: l.url, target: '_blank', rel: 'noopener noreferrer', 'data-kind': l.kind },
        'KBO 공식 기록' + (links.length > 1 ? (l.kind === 'pitcher' ? '(투수)' : '(타자)') : '') + ' ↗'));
    });
    if (!links.length) {
      var q = p.name + ' ' + B.team(p.team).short + ' 야구 기록';
      wrap.appendChild(h('a', { class: 'btn ghost', id: 'statsSearch', href: 'https://search.naver.com/search.naver?query=' + encodeURIComponent(q), target: '_blank', rel: 'noopener noreferrer' },
        '네이버에서 기록 찾기 ↗'));
    }
    wrap.appendChild(h('p', { class: 'note' }, '올 시즌' + (season ? '(' + season + ')' : '') + ' 기록은 KBO 공식 기록실에서 보세요. ',
      '이 앱은 KBO 기록을 자동으로 모으지 않습니다(KBO 가 사전 승인 없는 자동 수집을 금지합니다).'));
    return wrap;
  }

  function statsCard(p) {
    var el = h('section', { class: 'card', id: 'statsCard' });
    el.appendChild(cardHead('기록', null, 'h3'));
    var st = B.stats(p);
    if (st === undefined) {
      /* 기록 파일이 아직 안 실렸다 — 싣고 나서 이 카드만 다시 그린다 */
      if (state.statsFailed) el.appendChild(empty('연도별 기록을 불러오지 못했습니다', '인터넷 연결을 확인해 주세요.'));
      else {
        el.appendChild(h('p', { class: 'meta', id: 'statsLoading' }, '연도별 기록을 불러오는 중…'));
        ensureStats().then(function () {
          if (el.parentNode && state.route.view === 'players' && state.route.id === p.id) el.parentNode.replaceChild(statsCard(p), el);
        });
      }
      el.appendChild(officialLinks(p, null));
      return el;
    }
    el.appendChild(officialLinks(p, st));
    if (!st || (!st.bat && !st.pit)) {
      el.appendChild(h('p', { class: 'note', id: 'statsNone' }, '위키백과에 이 선수의 연도별 기록 표가 아직 없습니다.'));
      return el;
    }
    var kinds = [];
    if (st.bat) kinds.push(['bat', '타격']);
    if (st.pit) kinds.push(['pit', '투구']);
    var cur = state.statKind && st[state.statKind] ? state.statKind : (p.pos === 'P' && st.pit ? 'pit' : kinds[0][0]);
    var seg = kinds.length > 1 ? h('div', { class: 'seg', role: 'group', 'aria-label': '기록 종류' }) : null;
    var holder = h('div', { class: 'table-wrap' });
    function draw() {
      if (seg) Array.prototype.forEach.call(seg.children, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-kind') === cur)); });
      var t = st[cur];
      var latest = t.rows.reduce(function (m, r) { return Math.max(m, Number(r[0]) || 0); }, 0);
      var table = h('table', { class: 'stat-table', id: 'statTable', 'data-kind': cur },
        h('caption', { class: 'sr-only' }, p.name + ' 연도별 ' + (cur === 'pit' ? '투구' : '타격') + ' 기록'),
        h('thead', null, h('tr', null, t.cols.map(function (c) { return h('th', { scope: 'col', class: c === 'team' ? 'team' : null }, B.STAT_LABEL[c] || c); }))),
        h('tbody', null, t.rows.map(function (r) {
          return h('tr', { class: Number(r[0]) === latest ? 'latest' : null }, r.map(function (v, i) {
            return h(i === 0 ? 'th' : 'td', { scope: i === 0 ? 'row' : null, class: t.cols[i] === 'team' ? 'team' : null }, v || '-');
          }));
        })),
        t.total ? h('tfoot', null, h('tr', null, t.total.map(function (v, i) {
          return h(i === 0 ? 'th' : 'td', { scope: i === 0 ? 'row' : null, class: t.cols[i] === 'team' ? 'team' : null },
            i === 0 ? '통산' : t.cols[i] === 'team' ? (t.seasons || '') : (v || '-'));
        }))) : null);
      clear(holder).appendChild(table);
    }
    if (seg) {
      kinds.forEach(function (k) {
        seg.appendChild(h('button', { type: 'button', 'data-kind': k[0], on: { click: function () { cur = k[0]; state.statKind = k[0]; draw(); } } }, k[1]));
      });
      el.appendChild(seg);
    }
    el.appendChild(holder);
    draw();
    var season = B.statsSeason();
    el.appendChild(h('p', { class: 'note' }, '연도별 기록: ', extLink(wikiLink('ko.wikipedia.org', p.wiki), '위키백과 「' + p.wiki + '」'),
      ' 통산 기록 표 (CC BY-SA 4.0)' + (season ? ' — ' + season + ' 시즌까지' : '') + '. 위키백과 편집자가 정리한 값이라 공식 기록과 다를 수 있습니다.'));
    return el;
  }

  /* ---------- 뉴스 ---------- */

  function newsItem(n, compact) {
    var a = h('a', { class: 'news-item', href: safeUrl(n.url) || '#news', target: '_blank', rel: 'noopener noreferrer', 'data-id': n.id },
      h('div', { class: 't' }, n.title),
      !compact && n.summary ? h('div', { class: 's' }, n.summary) : null,
      h('div', { class: 'm' },
        h('span', { class: 'src' }, n.source),
        h('time', { datetime: n.publishedAt, title: F.time(n.publishedAt) }, F.rel(n.publishedAt)),
        compact ? null : (n.topics || []).filter(function (x) { return x !== 'kbo'; }).map(function (x) { return h('span', { class: 'topic' }, '· ' + B.TOPIC_NAME[x]); }),
        compact ? null : (n.teams || []).slice(0, 4).map(function (id) { return teamBadge(id, 'sm'); })));
    return a;
  }

  function renderNews(root) {
    clear(root);
    var f = state.news;
    if (!B.hasLive()) {
      root.appendChild(card(null, cardHead('야구 뉴스'), empty('뉴스 자료가 아직 없습니다')));
      return;
    }
    var topics = h('div', { class: 'chips', role: 'group', 'aria-label': '분야', id: 'newsTopics' });
    [['all', '전체'], ['kbo', 'KBO'], ['abroad', '해외야구'], ['national', '대표·아마']].forEach(function (x) {
      topics.appendChild(h('button', { type: 'button', class: 'chip', 'data-topic': x[0],
        on: { click: function () { f.topic = x[0]; drawList(); } } }, x[1], h('span', { class: 'cnt' })));
    });
    var teamSel = h('select', { class: 'select', id: 'newsTeam', 'aria-label': '구단' },
      h('option', { value: '' }, '모든 구단'),
      B.TEAMS.map(function (t) { return h('option', { value: t.id }, t.name + (t.id === state.myTeam ? ' (내 팀)' : '')); }));
    teamSel.value = f.team;
    teamSel.addEventListener('change', function () { f.team = teamSel.value; drawList(); });
    var input = h('input', { type: 'search', id: 'newsSearch', placeholder: '제목·요약에서 찾기', autocomplete: 'off', enterkeyhint: 'search', 'aria-label': '뉴스 찾기', value: f.q });
    input.addEventListener('input', function () { f.q = input.value; drawList(); });

    var myBtn = state.myTeam ? h('button', { type: 'button', class: 'chip', id: 'newsMine',
      on: { click: function () { f.team = f.team === state.myTeam ? '' : state.myTeam; teamSel.value = f.team; drawList(); } } },
      teamLogo(state.myTeam, 18), '내 팀만') : null;

    root.appendChild(card(null, cardHead('야구 뉴스'), h('div', { class: 'filters' },
      topics,
      h('div', { class: 'filter-row' }, h('label', { class: 'search' }, icon('search'), input), teamSel, myBtn))));

    var count = h('p', { class: 'count', id: 'newsCount', 'aria-live': 'polite' });
    var list = h('ul', { class: 'news-list', id: 'newsList' });
    root.appendChild(h('section', { class: 'card' }, count, list));
    var src = B.sources().news || [];
    root.appendChild(h('p', { class: 'note box' },
      (src.length ? src.join('·') + ' ' : '') + 'RSS 에서 야구 기사만 골라 제목·짧은 발췌만 보여 드립니다. 기사를 누르면 언론사 원문으로 갑니다. ',
      '기사 저작권은 각 언론사에 있습니다. 사흘이 지난 기사는 목록에서 빠집니다.'));

    function drawList() {
      Array.prototype.forEach.call(topics.children, function (b) {
        var key = b.getAttribute('data-topic');
        b.setAttribute('aria-pressed', String(key === f.topic));
        b.lastChild.textContent = ' ' + B.news({ topic: key, team: f.team, q: f.q }).length;
      });
      if (myBtn) myBtn.setAttribute('aria-pressed', String(f.team === state.myTeam));
      var items = B.news(f);
      var parts = [];
      if (f.team) parts.push(B.team(f.team).short);
      if (f.topic !== 'all') parts.push(B.TOPIC_NAME[f.topic]);
      if (f.q) parts.push('"' + f.q + '"');
      count.textContent = (parts.length ? parts.join(' · ') + ' — ' : '') + '기사 ' + items.length + '건';
      clear(list);
      if (!items.length) list.appendChild(h('li', null, empty('조건에 맞는 기사가 없습니다', '분야·구단을 바꾸거나 검색어를 지워 보세요.')));
      items.forEach(function (n) { list.appendChild(h('li', null, newsItem(n, false))); });
    }
    drawList();
  }

  /* ---------- 사진 크게 보기 ---------- */

  /* 열 때 기록(history)을 하나 더한다. 휴대폰 뒤로 가기가 선수 화면을 떠나지 않고 사진만 닫게 하려는 것이다 */
  var lb = { open: false, lastFocus: null };
  function openLightbox(photo, name) {
    var img = $('lightboxImg');
    var cap = clear($('lightboxCaption'));
    lb.lastFocus = document.activeElement;
    /* 받아 둔 작은 사진을 먼저 띄우고, 큰 사진(960px)이 다 오면 바꾼다 */
    img.src = photo.thumb;
    img.alt = name + ' 사진 (크게 보기)';
    var big = photo.large && /^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(photo.large.url || '') ? photo.large.url : null;
    img.setAttribute('data-want', big || photo.thumb);
    if (big && big !== photo.thumb) {
      var pre = new Image();
      pre.onload = function () { if (lb.open && img.getAttribute('data-want') === big) img.src = big; };
      pre.src = big;
    }
    /* 큰 사진에도 저작자 표기를 붙인다(CC 라이선스 조건). append 는 자식 하나 또는 배열을 받는다 */
    append(cap, [h('strong', null, name), photo.caption ? ' · ' + photo.caption : null, h('br'),
      h('span', { id: 'lightboxCredit' }, '사진: ', photo.author || '작성자 미상', ' · ',
        photo.licenseUrl ? extLink(photo.licenseUrl, photo.license) : photo.license, ' · ', extLink(photo.page, '위키미디어 공용'))]);
    $('lightbox').hidden = false;
    document.documentElement.classList.add('lb-open');
    lb.open = true;
    try { history.pushState({ lightbox: true }, ''); } catch (e) { /* 기록을 못 남겨도 닫기 버튼은 된다 */ }
    $('lightboxClose').focus();
  }
  function closeLightbox(fromHistory) {
    if (!lb.open) return;
    lb.open = false;
    $('lightbox').hidden = true;
    $('lightboxImg').removeAttribute('src');
    document.documentElement.classList.remove('lb-open');
    if (!fromHistory && history.state && history.state.lightbox) history.back();
    if (lb.lastFocus && lb.lastFocus.focus && document.contains(lb.lastFocus)) lb.lastFocus.focus();
  }
  window.addEventListener('popstate', function () { if (lb.open) closeLightbox(true); });
  $('lightboxClose').addEventListener('click', function () { closeLightbox(false); });
  $('lightbox').addEventListener('click', function (e) {
    if (e.target.closest('a') || e.target.closest('#lightboxClose')) return;
    closeLightbox(false);   // 사진이나 바깥 어디를 눌러도 닫힌다
  });

  /* ---------- 바닥글 ---------- */

  function renderFoot() {
    var foot = clear($('foot'));
    var gen = B.generatedAt();
    if (gen) {
      var hours = (Date.now() - new Date(gen).getTime()) / 3600000;
      foot.appendChild(h('p', { id: 'freshness', class: hours > STALE_HOURS ? 'meta warn' : null },
        '마지막 수집: ' + F.time(gen) + ' (' + F.rel(gen) + ')' +
        (hours > STALE_HOURS ? ' — 자료 갱신이 늦어지고 있습니다. 순위·뉴스가 최신이 아닐 수 있습니다.' : '')));
    } else {
      foot.appendChild(h('p', { id: 'freshness', class: 'meta warn' }, '아직 수집된 자료가 없습니다.'));
    }
    var news = (B.sources().news || []).join('·');
    foot.appendChild(h('p', null,
      '자료: 순위표 — 위키백과(영문), 명단·선수 정보 — 위키백과(한국어), ',
      extLink('https://creativecommons.org/licenses/by-sa/4.0/deed.ko', 'CC BY-SA 4.0'),
      '. 뉴스·경기 결과 — ' + (news || '언론사') + ' RSS (기사 저작권은 각 언론사에 있습니다).'));
    foot.appendChild(h('p', { id: 'logoNotice' }, '구단 엠블럼은 위키미디어 공용의 퍼블릭 도메인 파일(단순 글자 로고)이며, 상표권은 각 구단에 있습니다. ',
      '어느 팀인지 알아보기 쉽게 표시하려고만 씁니다.'));
    foot.appendChild(h('p', null, '이 앱은 KBO·각 구단과 관계없는 개인 프로젝트입니다.'));
  }

  /* ---------- 내 팀 고르기 ---------- */

  var lastFocus = null;
  function openTeamSheet() {
    lastFocus = document.activeElement;
    var list = clear($('teamSheetList'));
    B.TEAMS.forEach(function (t) {
      list.appendChild(h('button', { type: 'button', 'data-team': t.id, 'aria-pressed': String(t.id === state.myTeam),
        on: { click: function () { setMyTeam(t.id); closeTeamSheet(); } } }, teamLogo(t.id, 30), t.name));
    });
    list.appendChild(h('button', { type: 'button', class: 'none', 'data-team': '', 'aria-pressed': String(!state.myTeam),
      on: { click: function () { setMyTeam(null); closeTeamSheet(); } } }, '선택 안 함'));
    $('ownerInput').value = state.owner;
    $('sheetBackdrop').hidden = false;
    $('teamSheet').hidden = false;
    var cur = list.querySelector('[aria-pressed="true"]') || list.firstChild;
    cur.focus();
  }
  function closeTeamSheet() {
    $('sheetBackdrop').hidden = true;
    $('teamSheet').hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function setMyTeam(id) {
    state.myTeam = validTeam(id);
    save(KEY.myTeam, state.myTeam);
    if (state.news.team && !id) state.news.team = '';
    render();
  }
  /** 제목 뒤 이름 — 이 기기에만 저장. 비우면 뺀다 */
  function setOwner(v) {
    state.owner = cleanOwner(v);
    save(KEY.owner, state.owner || null);
    render();
  }

  /* ---------- 새 자료 받기 ---------- */

  var reloading = null;
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src + '?t=' + Date.now();
      s.onload = function () { s.remove(); resolve(); };
      s.onerror = function () { s.remove(); reject(new Error(src)); };
      document.body.appendChild(s);
    });
  }
  /** data/*.js 만 다시 싣는다. 보던 화면·검색어·고른 분야는 그대로 남는다 */
  function reloadData(opts) {
    opts = opts || {};
    if (reloading) return reloading;
    var btn = $('refreshBtn');
    btn.classList.add('spinning');
    var before = B.generatedAt();
    var files = ['data/live.js'];
    var pg = B.playersGeneratedAt();
    if (opts.players || !pg || Date.now() - new Date(pg).getTime() > 20 * 3600000) files.push('data/players.js');
    reloading = Promise.all(files.map(loadScript)).then(function () {
      B.load();
      state.lastLoad = Date.now();
      render();
      if (!opts.quiet) toast(B.generatedAt() !== before ? '새 자료를 받았습니다' : '이미 최신 자료입니다');
      else if (B.generatedAt() !== before) toast('새 자료로 바꿨습니다');
    }, function () {
      if (!opts.quiet) toast('새 자료를 받지 못했습니다. 인터넷 연결을 확인해 주세요.');
    }).then(function () {
      btn.classList.remove('spinning');
      reloading = null;
    });
    return reloading;
  }

  /* 화면이 다시 보일 때만 확인한다(백그라운드에서 타이머를 돌리지 않는다 — 휴대폰 배터리). file:// 는 확인할 서버가 없다 */
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    if (location.protocol === 'file:' || navigator.onLine === false) return;
    if (Date.now() - state.lastLoad < AUTO_REFRESH_MS) return;
    reloadData({ quiet: true });
  });

  /* ---------- 앱 설치 안내 ---------- */

  var installEvt = null;
  function isIOS() {
    var ua = navigator.userAgent || '';
    if (/iPhone|iPod/.test(ua)) return 'iphone';
    if (/iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ipad';
    return null;
  }
  function showInstall(text, canPrompt) {
    if (appMode || load(KEY.installDismissed)) return;
    $('install-text').textContent = text;
    $('install-btn').hidden = !canPrompt;
    $('install-bar').hidden = false;
  }
  function hideInstall() { $('install-bar').hidden = true; }
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    installEvt = e;
    showInstall('홈 화면에 설치하면 주소창·툴바 없이 앱처럼 열립니다.', true);
  });
  window.addEventListener('appinstalled', hideInstall);
  $('install-btn').addEventListener('click', function () {
    if (!installEvt) return;
    installEvt.prompt();
    Promise.resolve(installEvt.userChoice).then(function () { installEvt = null; });
    hideInstall();
  });
  $('install-close').addEventListener('click', function () { save(KEY.installDismissed, '1'); hideInstall(); });
  var ios = isIOS();
  if (ios && location.protocol !== 'file:') {
    showInstall(ios === 'ipad'
      ? '오른쪽 위 공유 버튼을 누르고 "홈 화면에 추가"를 고르면 앱처럼 쓸 수 있습니다.'
      : '아래쪽 공유 버튼을 누르고 "홈 화면에 추가"를 고르면 앱처럼 쓸 수 있습니다.', false);
  }

  /* ---------- 시작 ---------- */

  $('myTeamBtn').addEventListener('click', openTeamSheet);
  $('teamSheetClose').addEventListener('click', closeTeamSheet);
  $('ownerForm').addEventListener('submit', function (e) {
    e.preventDefault();
    setOwner($('ownerInput').value);
    closeTeamSheet();
    toast(state.owner ? '제목에 이름을 붙였습니다 (이 기기에만)' : '제목에서 이름을 뺐습니다');
  });
  $('sheetBackdrop').addEventListener('click', closeTeamSheet);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && lb.open) closeLightbox(false);
    else if (e.key === 'Escape' && !$('teamSheet').hidden) closeTeamSheet();
  });
  $('refreshBtn').addEventListener('click', function () { reloadData({ players: true }); });
  window.addEventListener('hashchange', function () { onRoute(false); });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* 설치만 못 할 뿐 화면은 동작한다 */ });
    });
  }

  onRoute(true);
  document.documentElement.setAttribute('data-state', 'ready');
  document.documentElement.setAttribute('data-data', B.hasLive() ? (B.hasPlayers() ? 'full' : 'live') : 'none');

  window.BaseballApp = {
    state: state, render: render, reloadData: reloadData, appMode: appMode,
    setMyTeam: setMyTeam, setOwner: setOwner, openTeamSheet: openTeamSheet,
  };
})();
