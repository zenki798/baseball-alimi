/* KBO 10개 구단의 고정 정보 — 화면(app.js·store.js)과 수집기(scripts/collect.js)가 함께 쓴다.
 *
 * - 브라우저에서는 window.BaseballTeams, Node 에서는 require('./teams.js') 로 같은 목록을 받는다.
 *   ES 모듈로 바꾸지 않는다: index.html 을 더블클릭(file://)하면 모듈이 막힌다 (AGENTS.md 8절).
 * - 구단 엠블럼은 퍼블릭 도메인 글자 로고만 쓴다(아래 LOGOS). 그림을 못 읽으면 짧은 이름 + 구단 색 배지다.
 * - 순서는 KBO 가 목록에 쓰는 순서(영문 이름 먼저, 그다음 가나다)를 따른다.
 *
 * 각 칸
 *   id        앱 안의 구단 코드 (주소 #team/kia 등에 쓰인다 — 바꾸면 저장된 "내 팀"이 풀린다)
 *   name      정식 이름 · short 짧은 이름(표·배지)
 *   color/ink 배지 배경색·글자색 (구단 상징색을 따른 근사값)
 *   city      연고지 · stadium 홈구장
 *   wikiEn    영문 위키백과 순위표의 구단 이름 (수집기가 순위표 줄을 알아볼 때)
 *   wikiKo    한국어 위키백과 문서 이름 · roster 현재 명단 틀 이름 (2026-10-01 문서가 있는 것을 확인했다)
 *   titleName 연합뉴스 전적 기사 제목에 쓰이는 이름 ("[프로야구 광주전적] kt 7-5 KIA")
 *   homeTokens 그 기사 제목의 구장 이름 중 이 구단의 홈 (잠실은 LG·두산이 함께 쓴다)
 *   alias     뉴스 제목·요약에서 이 구단을 알아보는 정규식 (수집기 전용. 해외 구단 이름은 수집기가 먼저 지운다)
 */
(function (root) {
  'use strict';

  var TEAMS = [
    {
      id: 'kia', name: 'KIA 타이거즈', short: 'KIA', color: '#EA0029', ink: '#ffffff',
      city: '광주', stadium: '광주-기아 챔피언스 필드',
      wikiEn: ['Kia Tigers', 'KIA Tigers'], wikiKo: 'KIA 타이거즈', roster: '틀:KIA 타이거즈 명단',
      titleName: ['KIA', '기아'], homeTokens: ['광주'],
      alias: 'KIA|기아|타이거즈',
    },
    {
      id: 'kt', name: 'kt wiz', short: 'KT', color: '#231F20', ink: '#ffffff',
      city: '수원', stadium: '수원 케이티 위즈 파크',
      wikiEn: ['KT Wiz', 'kt wiz', 'KT wiz'], wikiKo: 'kt wiz', roster: '틀:KT 위즈 명단',
      titleName: ['kt', 'KT'], homeTokens: ['수원'],
      alias: '(?<![A-Za-z])(?:kt|KT)(?![A-Za-z])|위즈|wiz',
    },
    {
      id: 'lg', name: 'LG 트윈스', short: 'LG', color: '#C30452', ink: '#ffffff',
      city: '서울', stadium: '잠실야구장',
      wikiEn: ['LG Twins'], wikiKo: 'LG 트윈스', roster: '틀:LG 트윈스 명단',
      titleName: ['LG'], homeTokens: ['잠실'],
      alias: '(?<![A-Za-z])LG(?![A-Za-z])|트윈스',
    },
    {
      id: 'nc', name: 'NC 다이노스', short: 'NC', color: '#315288', ink: '#ffffff',
      city: '창원', stadium: '창원NC파크',
      wikiEn: ['NC Dinos'], wikiKo: 'NC 다이노스', roster: '틀:NC 다이노스 명단',
      titleName: ['NC'], homeTokens: ['창원', '마산'],
      alias: '(?<![A-Za-z])NC(?![A-Za-z])|다이노스',
    },
    {
      id: 'ssg', name: 'SSG 랜더스', short: 'SSG', color: '#CE0E2D', ink: '#ffffff',
      city: '인천', stadium: '인천SSG랜더스필드',
      wikiEn: ['SSG Landers'], wikiKo: 'SSG 랜더스', roster: '틀:SSG 랜더스 명단',
      titleName: ['SSG'], homeTokens: ['인천', '문학'],
      alias: 'SSG|랜더스',
    },
    {
      id: 'doosan', name: '두산 베어스', short: '두산', color: '#131230', ink: '#ffffff',
      city: '서울', stadium: '잠실야구장',
      wikiEn: ['Doosan Bears'], wikiKo: '두산 베어스', roster: '틀:두산 베어스 명단',
      titleName: ['두산'], homeTokens: ['잠실'],
      alias: '두산|베어스',
    },
    {
      id: 'lotte', name: '롯데 자이언츠', short: '롯데', color: '#041E42', ink: '#ffffff',
      city: '부산', stadium: '사직야구장',
      wikiEn: ['Lotte Giants'], wikiKo: '롯데 자이언츠', roster: '틀:롯데 자이언츠 명단',
      titleName: ['롯데'], homeTokens: ['부산', '사직', '울산'],
      alias: '롯데|자이언츠',
    },
    {
      id: 'samsung', name: '삼성 라이온즈', short: '삼성', color: '#074CA1', ink: '#ffffff',
      city: '대구', stadium: '대구삼성라이온즈파크',
      wikiEn: ['Samsung Lions'], wikiKo: '삼성 라이온즈', roster: '틀:삼성 라이온즈 명단',
      titleName: ['삼성'], homeTokens: ['대구', '포항'],
      alias: '삼성|라이온즈',
    },
    {
      id: 'kiwoom', name: '키움 히어로즈', short: '키움', color: '#570514', ink: '#ffffff',
      city: '서울', stadium: '고척스카이돔',
      wikiEn: ['Kiwoom Heroes'], wikiKo: '키움 히어로즈', roster: '틀:키움 히어로즈 명단',
      titleName: ['키움'], homeTokens: ['고척'],
      alias: '키움|히어로즈',
    },
    {
      id: 'hanwha', name: '한화 이글스', short: '한화', color: '#FC4E00', ink: '#ffffff',
      city: '대전', stadium: '대전한화생명볼파크',
      wikiEn: ['Hanwha Eagles'], wikiKo: '한화 이글스', roster: '틀:한화 이글스 명단',
      titleName: ['한화'], homeTokens: ['대전', '청주'],
      alias: '한화|이글스',
    },
  ];

  /* 구단 엠블럼 — 위키미디어 공용의 퍼블릭 도메인(단순 글자 로고) 파일. 출처·조건은 icons/teams/README.md.
   * 상표권은 각 구단에 있다: 어느 팀인지 알아보게 하는 표시로만 쓴다.
   * logoWide: 가로로 긴 글자 로고(한화) — 작게 줄이면 읽을 수 없어 작은 자리에서는 구단 색 배지를 쓴다 */
  var LOGOS = {
    kia: 'icons/teams/kia.svg', kt: 'icons/teams/kt.svg', lg: 'icons/teams/lg.svg', nc: 'icons/teams/nc.svg',
    ssg: 'icons/teams/ssg.png', doosan: 'icons/teams/doosan.svg', lotte: 'icons/teams/lotte.svg',
    samsung: 'icons/teams/samsung.svg', kiwoom: 'icons/teams/kiwoom.png', hanwha: 'icons/teams/hanwha.png',
  };
  TEAMS.forEach(function (t) {
    t.logo = LOGOS[t.id] || null;
    t.logoWide = t.id === 'hanwha';
  });

  /* 정규시즌 팀당 경기 수 · 가을야구(포스트시즌)에 나가는 순위 */
  var SEASON_GAMES = 144;
  var POSTSEASON_CUT = 5;

  /* 가을야구 대진 (2015년부터 같은 방식, 2026-10-02 확인). KBO 가 방식을 바꾸면 여기 한 곳만 고친다.
   *   top      이 라운드에서 기다리는 정규시즌 순위 (상대는 앞 라운드 승자 — 와일드카드만 5위)
   *   bestOf   최대 경기 수. 이기는 데 필요한 승수 = bestOf 를 반으로 나눠 버리고 1 을 더한 수 (무승부는 승수에 들지 않는다)
   *   와일드카드는 4위가 1승을 안고 시작한다: 4위는 한 번 이기거나 비기면, 5위는 두 번 다 이겨야 올라간다 */
  var POSTSEASON = [
    { key: 'wc', name: '와일드카드 결정전', short: 'WC', bestOf: 2, top: 4, low: 5 },
    { key: 'spo', name: '준플레이오프', short: '준PO', bestOf: 5, top: 3 },
    { key: 'po', name: '플레이오프', short: 'PO', bestOf: 5, top: 2 },
    { key: 'ks', name: '한국시리즈', short: 'KS', bestOf: 7, top: 1 },
  ];

  var api = { TEAMS: TEAMS, SEASON_GAMES: SEASON_GAMES, POSTSEASON_CUT: POSTSEASON_CUT, POSTSEASON: POSTSEASON };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BaseballTeams = api;
})(this);
