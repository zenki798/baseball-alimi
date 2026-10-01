const { test, expect } = require('@playwright/test');
const P = require('../scripts/parsers.js');
const C = require('../scripts/collect.js');
const W = require('./fixtures/wiki.js');

/*
 * 수집기 규칙 — 네트워크 없이, 실제 원문 모양을 본뜬 견본(fixtures/wiki.js·아래 RSS)으로 검사한다.
 * 여기 있는 사례 대부분은 2026-10-01~02 실제 자료에서 겪은 것이다 (AGENTS.md 4절 표).
 */

const NOW = new Date('2026-10-02T03:00:00.000Z');   // 10월 2일 12:00 (한국)

function rss(items) {
  return '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>t</title>' +
    items.map(i => '<item><title><![CDATA[' + i.title + ']]></title><link>' + (i.link || 'https://news.example.com/a/' + encodeURIComponent(i.title).slice(0, 40)) + '</link>' +
      '<pubDate>' + i.date + '</pubDate><description><![CDATA[' + (i.desc || '') + ']]></description></item>').join('') +
    '</channel></rss>';
}
const FEED = { source: '테스트통신', url: 'https://news.example.com/rss', games: true };

test.describe('정규시즌 순위표 (영문 위키백과 표)', () => {
  const parsed = P.parseStandings(W.STANDINGS);

  test('정규시즌 표만 읽는다 (앞쪽 시범경기 표는 건너뛴다) · 기준일', () => {
    expect(parsed.problems).toEqual([]);
    expect(parsed.asOf).toBe('2026-10-01');
    expect(parsed.rows).toHaveLength(10);
    expect(parsed.rows.map(r => r.team)).toEqual(['kt', 'samsung', 'lg', 'kia', 'doosan', 'nc', 'lotte', 'ssg', 'hanwha', 'kiwoom']);
  });

  test('경기·승·패·무, 홈·원정(승-무-패 순서를 숫자 합으로 알아낸다), 연속(T = 무)', () => {
    const kt = parsed.rows[0];
    expect(kt).toMatchObject({ games: 134, win: 79, loss: 53, draw: 2, streak: { type: 'W', n: 3 }, home: { w: 40, d: 1, l: 26 }, away: { w: 39, d: 1, l: 27 } });
    expect(parsed.rows.find(r => r.team === 'ssg').streak).toEqual({ type: 'D', n: 1 });
    /* 공동 순위로 칸이 줄어든 줄(롯데)도 같은 값으로 읽힌다 */
    expect(parsed.rows.find(r => r.team === 'lotte')).toMatchObject({ games: 134, win: 64, loss: 68, draw: 2, home: { w: 32, d: 1, l: 34 } });
  });

  test('진출 여부: 1위 확정 · rowspan 으로 아래 줄까지 이어지는 칸 · 빈칸', () => {
    const st = Object.fromEntries(parsed.rows.map(r => [r.team, r.status]));
    expect(st).toEqual({ kt: 'first', samsung: 'in', lg: 'in', kia: 'in', doosan: 'in', nc: null, lotte: null, ssg: 'out', hanwha: 'out', kiwoom: 'out' });
  });

  test('순위·승률·게임차는 다시 계산한다: 승률이 같으면 공동 순위, 게임차는 1위 기준', () => {
    const rows = P.computeStandings(parsed.rows);
    const by = Object.fromEntries(rows.map(r => [r.team, r]));
    expect(by.kt).toMatchObject({ rank: 1, pct: 0.598, gb: 0 });
    expect(by.samsung).toMatchObject({ rank: 2, pct: 0.588, gb: 1.5 });
    expect(by.doosan.gb).toBe(10.5);
    expect([by.nc.rank, by.lotte.rank]).toEqual([6, 6]);
    expect(by.ssg.rank).toBe(8);
    expect(by.kiwoom).toMatchObject({ rank: 10, pct: 0.368, gb: 30.5 });
    expect(P.validateStandings({ asOf: parsed.asOf, rows })).toEqual([]);
  });

  test('검사: 몇 팀만 고쳐진 순간(리그 전체 승 ≠ 패), 구단 빠짐, 승+패+무 ≠ 경기 수를 잡는다', () => {
    const rows = P.computeStandings(parsed.rows);
    const half = rows.map(r => (r.team === 'kt' ? Object.assign({}, r, { win: r.win + 1, games: r.games + 1, home: null, away: null }) : r));
    expect(P.validateStandings({ asOf: '2026-10-01', rows: half }).join()).toContain('리그 전체 승');
    expect(P.validateStandings({ asOf: '2026-10-01', rows: rows.slice(1) }).join()).toContain('KT 없음');
    const bad = rows.map(r => (r.team === 'lg' ? Object.assign({}, r, { games: 999 }) : r));
    expect(P.validateStandings({ asOf: '2026-10-01', rows: bad }).join()).toContain('승+패+무 ≠ 경기 수');
    expect(P.validateStandings({ asOf: null, rows }).join()).toContain('기준일 없음');
  });

  test('표를 못 찾으면 빈 결과와 까닭을 돌려준다(예외를 던지지 않는다)', () => {
    const r = P.parseStandings('== Regular season ==\n표가 아직 없다.');
    expect(r.rows).toEqual([]);
    expect(r.problems.join()).toContain('순위표를 찾지 못했다');
  });
});

test.describe('현재 명단 (한국어 위키백과 틀)', () => {
  const r = P.parseRoster(W.ROSTER);

  test('감독·코치(역할)·포지션별 선수·군 복무, 퓨처스·신인 묶음은 뺀다', () => {
    expect(r.manager).toEqual({ number: 71, name: '테스트감독', wiki: '테스트감독' });
    expect(r.coaches).toEqual([
      { number: 68, name: '가상코치', wiki: '가상코치 (야구인)', role: '수석' },
      { number: 73, name: '둘째코치', wiki: '둘째코치', role: '작전주루' },
    ]);
    const count = pos => r.players.filter(p => p.pos === pos).length;
    expect([count('P'), count('C'), count('IF'), count('OF')]).toEqual([15, 2, 4, 4]);
    expect(r.players.some(p => p.name === '퓨처스감독')).toBe(false);
    expect(r.military).toEqual([{ name: '군복무하나', wiki: '군복무하나 (야구 선수)' }, { name: '군복무둘', wiki: '군복무둘' }]);
    expect(P.validateRoster(r)).toEqual([]);
  });

  test('링크 글자·괄호 구분·#앞만·<small>(주장) 메모', () => {
    const by = Object.fromEntries(r.players.map(p => [p.name, p]));
    expect(by['가람']).toMatchObject({ number: 0, wiki: '가람 (야구 선수)', pos: 'P' });
    expect(by['내야둘']).toMatchObject({ number: 5, wiki: '내야둘 (2003년)' });
    expect(by['외야셋'].note).toBe('주장');
    expect(by['외야넷'].wiki).toBe('외야넷');
    expect(by['육성투수'].number).toBe(102);
  });

  test('망가진 명단은 검사에 걸린다 (collect.js 는 지난 명단을 쓴다)', () => {
    const problems = P.validateRoster(P.parseRoster(W.BROKEN_ROSTER));
    expect(problems.join()).toContain('투수');
    expect(problems.join()).toContain('포수 없음');
    expect(P.parseRoster('틀이 없다').players).toEqual([]);
  });
});

test.describe('선수 정보 상자', () => {
  const prof = P.parseProfile(W.INFOBOX);

  test('공개 프로필만 꺼낸다 — 출신지·연봉·계약금은 상자에 있어도 담지 않는다', () => {
    expect(prof).toMatchObject({
      born: '2001-10-03', height: 185, weight: 88, throws: '우', bats: '좌', positions: ['투수', '외야수'],
      nationality: '대한민국', proYear: 2020, draft: '2020년 1차 지명(KIA 타이거즈)',
      career: ['KIA 타이거즈 (2020년 ~ 현재)', '상무 (2022년 ~ 2023년)'], titles: ['2025년 KBO 테스트상'],
      photoFile: '가람 선수 첫 인사.jpg', photoCaption: '가람(2025년)',
    });
    const text = JSON.stringify(prof);
    for (const word of ['가상시', '2억원', '3억원', '출신']) expect(text).not.toContain(word);
  });

  test('생년월일·투타 여러 표기, 엉뚱한 값은 버린다', () => {
    expect(P.parseBirth('{{출생일과 나이|1988|3|1}}')).toBe('1988-03-01');
    expect(P.parseBirth('{{birth date and age|df=y|1993|2|8}}')).toBe('1993-02-08');
    expect(P.parseBirth('[[1981년]] [[11월 25일]]')).toBe('1981-11-25');   // 연·월일이 링크로 쪼개져 있어도 읽는다
    expect(P.parseBirth('1981년 11월 25일')).toBe('1981-11-25');
    expect(P.parseBirth('{{출생일과 나이|2001|2|30}}')).toBeNull();
    expect([P.handOf('[[좌]]'), P.handOf('우투'), P.handOf('스위치'), P.handOf('')]).toEqual(['좌', '우', '양', null]);
    expect(P.parseProfile('{{야구 선수 정보|신장 = 999|체중 = 20}}')).toMatchObject({ height: null, weight: null });
    expect(P.parseProfile('정보 상자가 없는 문서')).toBeNull();
  });

  test('동명이인 문서를 거른다: 이 구단이 소속·경력에 있거나 등번호가 같아야 쓴다', () => {
    const kia = require('../teams.js').TEAMS.find(t => t.id === 'kia');
    expect(P.profileMatchesTeam(prof, kia, 0)).toBe(true);
    const other = Object.assign({}, prof, { team: '가상 실업팀', career: ['가상 실업팀 (2010년 ~ 2015년)'], number: '33' });
    expect(P.profileMatchesTeam(other, kia, 0)).toBe(false);
    expect(P.profileMatchesTeam(other, kia, 33)).toBe(true);
  });

  test('사진 파일 이름: [[파일:…|크기]] 모양도 받고, 사진이 아닌 것(svg 로고)은 버린다', () => {
    expect(P.photoFileName('[[파일:가 람_사진.jpg|250px]]')).toBe('가 람 사진.jpg');
    expect(P.photoFileName('File:Ga Ram.PNG')).toBe('Ga Ram.PNG');
    expect(P.photoFileName('KIA 로고.svg')).toBeNull();
    expect(P.photoFileName('')).toBeNull();
  });
});

test.describe('사진 라이선스 (위키미디어 imageinfo)', () => {
  const page = (license, extra = {}) => ({
    title: '파일:가람.jpg',
    imageinfo: [Object.assign({
      mime: 'image/jpeg', thumburl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Ga.jpg/330px-Ga.jpg?utm_source=ko.wikipedia.org',
      thumbwidth: 330, thumbheight: 440, descriptionurl: 'https://commons.wikimedia.org/wiki/File:Ga.jpg',
      extmetadata: {
        LicenseShortName: { value: license }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by/3.0' },
        Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Test">테스트 작가</a>' }, AttributionRequired: { value: 'true' },
      },
    }, extra)],
  });

  test('자유 이용 라이선스면 썸네일 주소(추적 쿼리 뗌)·작성자·라이선스·원본 링크를 함께 담는다', () => {
    expect(P.parseImageInfo(page('CC BY 3.0'))).toEqual({
      thumb: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Ga.jpg/330px-Ga.jpg',
      width: 330, height: 440, page: 'https://commons.wikimedia.org/wiki/File:Ga.jpg',
      author: '테스트 작가', license: 'CC BY 3.0', licenseUrl: 'https://creativecommons.org/licenses/by/3.0',
    });
    for (const l of ['CC BY-SA 4.0', 'CC0', 'CC BY 2.0', 'Public domain', 'CC BY-SA 3.0 de']) expect(P.parseImageInfo(page(l)), l).not.toBeNull();
  });

  test('비자유(공정 이용)·사진 아닌 파일·위키미디어 밖 주소·작성자 모름은 쓰지 않는다', () => {
    expect(P.parseImageInfo(page('Fair use'))).toBeNull();
    expect(P.parseImageInfo(page('Non-free logo'))).toBeNull();
    expect(P.parseImageInfo(page('CC BY 3.0', { mime: 'image/svg+xml' }))).toBeNull();
    expect(P.parseImageInfo(page('CC BY 3.0', { thumburl: 'https://evil.example.com/x.jpg' }))).toBeNull();
    const noAuthor = page('CC BY 3.0');
    noAuthor.imageinfo[0].extmetadata.Artist = { value: '' };
    expect(P.parseImageInfo(noAuthor)).toBeNull();
    expect(P.parseImageInfo({ title: '파일:없음.jpg', missing: true })).toBeNull();
  });
});

test.describe('뉴스 고르기 · 구단 · 갈래', () => {
  test('야구 기사만: 바둑 "와일드카드", 축구 "트레이닝"(이닝), "안타깝다"(안타)는 야구가 아니다', () => {
    expect(P.isBaseball('바둑 안성준, 삼성화재배 와일드카드 선정', '')).toBe(false);
    expect(P.isBaseball('모레노호 첫 훈련', '오픈트레이닝데이를 찾은 팬들')).toBe(false);
    expect(P.isBaseball('안타까운 부상 소식', '축구 대표팀 공격수')).toBe(false);
    expect(P.isBaseball('파인다이닝 열풍', '')).toBe(false);
    expect(P.isBaseball('김재환, 통산 300홈런', '')).toBe(true);
    expect(P.isBaseball('구자욱 부상', '프로야구 삼성 라이온즈에 악재')).toBe(true);
    expect(P.isBaseball('필라델피아 이글스, 슈퍼볼 진출', '미식축구')).toBe(false);
  });

  test('구단: 별명이 같은 해외·다른 종목 팀은 우리 구단이 아니다', () => {
    expect(P.teamsOf('샌프란시스코 자이언츠 이정후 2안타')).toEqual([]);
    expect(P.teamsOf('요미우리 자이언츠·지바 롯데 마린스 소식')).toEqual([]);
    expect(P.teamsOf('수원 KT 소닉붐 개막전')).toEqual([]);
    expect(P.teamsOf('kt wiz, LG전 승리')).toEqual(['kt', 'lg']);
    expect(P.teamsOf('롯데 자이언츠와 NC 다이노스')).toEqual(['nc', 'lotte']);
    expect(P.teamsOf('KTX 타고 원정')).toEqual([]);
  });

  test('갈래: MLB 기사의 "미국프로야구 … 가을야구" 는 KBO 로 치지 않는다, 여러 갈래도 된다', () => {
    expect(P.topicsOf('화이트삭스, 디비전시리즈 진출', '미국프로야구 메이저리그(MLB) 가을야구 첫 시리즈', [])).toEqual(['abroad']);
    expect(P.topicsOf("'KBO MVP 출신' 페디, 화이트삭스 승리", '', [])).toEqual(['kbo', 'abroad']);
    expect(P.topicsOf('U-18 야구 대표팀, 아시아 정상', '', [])).toEqual(['national']);
    expect(P.topicsOf('딜라이브기 초등학교 야구대회 개막', '', [])).toEqual(['national']);
    expect(P.topicsOf('프로야구 관중 1200만', '', [])).toEqual(['kbo']);
    expect(P.topicsOf('야구 이야기', '', [])).toEqual(['kbo']);
  });

  test('목록·표 기사(전적·중간순위·선발투수·사진)는 뉴스 목록에 넣지 않는다', () => {
    for (const t of ['[프로야구 중간순위] 1일', '[프로야구] 1일 선발투수', '[프로야구 광주전적] kt 7-5 KIA', '[KBO 오늘의 경기 결과]10월1일(목)', '[포토] 5연패 LG, 충격', '[사진] 하이파이브']) {
      expect(P.isListArticle(t), t).toBe(true);
    }
    expect(P.isListArticle('SSG 김재환, 통산 300홈런')).toBe(false);
  });
});

test.describe('RSS 읽기', () => {
  test('CDATA·두 번 이스케이프된 글자·머리말(기자 이름)·기자 이메일을 정리한다', () => {
    const xml = rss([{
      title: 'E&amp;amp;S 컵, 프로야구 &lt;특집&gt;', date: 'Thu, 1 Oct 2026 22:15:31 +0900',
      desc: '(서울=연합뉴스) 홍길동 기자 = 프로야구 KIA 타이거즈가 연승을 달렸다. 문의 hong@example.com 으로 받는다.',
    }]);
    const [it] = P.parseFeed(xml, FEED, NOW);
    expect(it.title).toBe('E&S 컵, 프로야구 <특집>');
    expect(it.summary.startsWith('프로야구 KIA 타이거즈가')).toBe(true);
    expect(it.summary).not.toContain('홍길동');
    expect(it.summary).not.toMatch(/@/);
    expect(it.publishedAt).toBe('2026-10-01T13:15:31.000Z');
  });

  test('시간대 없는 시각은 한국 시각으로 읽고, 앞날 시각은 받은 시각으로 바꾼다, 짧은 요약은 비운다', () => {
    const xml = rss([
      { title: '시간대 없는 기사', date: '2026-10-01 23:32:22', desc: '이 기사는 시간대 표시 없이 시각만 적어 보낸 피드의 모양을 흉내 낸다.' },
      { title: '앞날 기사', date: 'Sat, 10 Oct 2026 09:00:00 +0900', desc: '(' },
    ]);
    const [a, b] = P.parseFeed(xml, FEED, NOW);
    expect(a.publishedAt).toBe('2026-10-01T14:32:22.000Z');
    expect(b.publishedAt).toBe(NOW.toISOString());
    expect(b.summary).toBe('');
  });

  test('EUC-KR 로 보낸 피드도 글자가 깨지지 않는다', () => {
    const head = Buffer.from('<?xml version="1.0" encoding="EUC-KR"?><rss><channel><item><title>', 'latin1');
    const body = Buffer.from([0xbe, 0xdf, 0xb1, 0xb8]);   // "야구" (EUC-KR)
    const tail = Buffer.from('</title><link>https://news.example.com/x</link></item></channel></rss>', 'latin1');
    expect(C.decodeXml(Buffer.concat([head, body, tail]))).toContain('<title>야구</title>');
  });
});

test.describe('전적 기사 제목 → 경기 결과', () => {
  const g = (title, date, desc) => P.parseGameTitle(title, new Date(date).toISOString(), desc);

  test('이긴 팀이 앞 · 홈은 구장 이름으로 · kt 소문자', () => {
    expect(g('[프로야구 광주전적] kt 7-5 KIA', '2026-10-01T22:15:31+09:00', '▲ 광주전적(1일)')).toEqual({
      id: '2026-10-01-kia-kt', date: '2026-10-01', stadium: '광주', home: 'kia', t1: 'kt', s1: 7, t2: 'kia', s2: 5,
    });
  });

  test('잠실 LG–두산은 홈을 비운다 · 무승부 · 자정 넘어 나온 기사는 경기 날로', () => {
    expect(g('[프로야구 잠실전적] LG 3-3 두산', '2026-10-02T00:20:00+09:00', '▲ 잠실전적(1일)')).toMatchObject({
      date: '2026-10-01', stadium: '잠실', home: null, t1: 'lg', s1: 3, t2: 'doosan', s2: 3,
    });
    expect(g('[프로야구 잠실전적] 두산 9-7 NC', '2026-10-01T22:12:36+09:00', '▲ 잠실전적(1일)').home).toBe('doosan');
  });

  test('달이 바뀌는 날(10월 1일 새벽의 "30일" 경기) · 더블헤더 1차전', () => {
    expect(g('[프로야구 부산전적] 롯데 8-6 키움', '2026-10-01T00:30:00+09:00', '▲ 부산전적(30일)').date).toBe('2026-09-30');
    expect(g('[프로야구 대구전적] 삼성 5-3 한화', '2026-10-01T17:00:00+09:00', '▲ 대구전적(1일·1차전)')).toMatchObject({ id: '2026-10-01-hanwha-samsung-1' });
  });

  test('모르는 모양·모르는 구단은 null (틀린 결과를 만들지 않는다)', () => {
    expect(g('[프로야구 중간순위] 1일', '2026-10-01T22:00:00+09:00', '')).toBeNull();
    expect(g('[프로야구 광주전적] 가상팀 7-5 KIA', '2026-10-01T22:00:00+09:00', '')).toBeNull();
    expect(g('[프로야구 광주전적] KIA 7-5 KIA', '2026-10-01T22:00:00+09:00', '')).toBeNull();
  });
});

test.describe('합치기 — 지난 자료 + 새 자료', () => {
  test('경기: 같은 경기는 새것이(정정), 다른 시즌·앞날은 뺀다, 최신순', () => {
    const prev = [
      { id: '2026-09-30-kia-kt', date: '2026-09-30', t1: 'kt', s1: 1, t2: 'kia', s2: 0 },
      { id: '2025-10-01-kia-kt', date: '2025-10-01', t1: 'kt', s1: 1, t2: 'kia', s2: 0 },
    ];
    const next = [
      { id: '2026-09-30-kia-kt', date: '2026-09-30', t1: 'kt', s1: 2, t2: 'kia', s2: 0 },
      { id: '2026-10-01-kia-kt', date: '2026-10-01', t1: 'kia', s1: 4, t2: 'kt', s2: 3 },
      { id: '2026-10-09-kia-kt', date: '2026-10-09', t1: 'kia', s1: 4, t2: 'kt', s2: 3 },
    ];
    const out = P.mergeGames(prev, next, 2026, NOW);
    expect(out.map(x => x.id)).toEqual(['2026-10-01-kia-kt', '2026-09-30-kia-kt']);
    expect(out[1].s1).toBe(2);
  });

  test('뉴스: 사흘(72시간) 지난 것은 빼고 최신순, 같은 id 는 하나', () => {
    const n = (id, at) => ({ id, publishedAt: at });
    const out = P.mergeNews([n('a', '2026-09-28T00:00:00.000Z'), n('b', '2026-10-01T00:00:00.000Z')], [n('b', '2026-10-01T00:00:00.000Z'), n('c', '2026-10-02T02:00:00.000Z')], NOW);
    expect(out.map(x => x.id)).toEqual(['c', 'b']);
  });
});

test.describe('조립 — buildLive · buildPlayers (collect.js)', () => {
  const feeds = [{
    feed: FEED, xml: rss([
      { title: '[프로야구 광주전적] kt 7-5 KIA', date: 'Thu, 1 Oct 2026 22:15:31 +0900', desc: '▲ 광주전적(1일)' },
      { title: '[프로야구 중간순위] 1일', date: 'Thu, 1 Oct 2026 22:18:44 +0900', desc: '◇ 2026 KBO리그 중간순위(1일)' },
      { title: '힐리어드, 시즌 41호 공동 선두…kt, 매직넘버 5', date: 'Thu, 1 Oct 2026 22:34:30 +0900', desc: '프로야구 kt wiz의 외국인 타자가 김도영(KIA 타이거즈)이 지켜보는 가운데 홈런을 쳤다.', link: 'https://news.example.com/view/AKR1?utm_source=rss' },
      { title: '바둑 와일드카드 선정', date: 'Thu, 1 Oct 2026 20:00:00 +0900', desc: '한국기원은 와일드카드를 발표했다.' },
    ]),
  }];

  test('순위표·경기·뉴스: 목록 기사·다른 종목은 빠지고, 구단은 제목에서 먼저 찾는다', () => {
    const live = C.buildLive({ wikiText: W.STANDINGS, wikiRevision: '2026-10-01T14:00:00Z', feeds, prev: null, now: NOW, season: 2026 });
    expect(P.validateLive(live)).toEqual([]);
    expect(live.standings.asOf).toBe('2026-10-01');
    expect(live.standings.rows[0]).toMatchObject({ team: 'kt', rank: 1 });
    expect(live.standings.source.url).toBe('https://en.wikipedia.org/wiki/2026_KBO_League_season');
    expect(live.games.map(x => x.id)).toEqual(['2026-10-01-kia-kt']);
    expect(live.news.map(x => x.title)).toEqual(['힐리어드, 시즌 41호 공동 선두…kt, 매직넘버 5']);
    expect(live.news[0].teams).toEqual(['kt']);          // 요약의 KIA 는 곁가지라 넣지 않는다
    /* id 는 추적 쿼리를 뗀 주소로 만든다 — 같은 기사면 늘 같은 id */
    expect(live.news[0].id).toBe(P.hashId('https://news.example.com/view/AKR1'));
  });

  test('이번 순위표가 검사에 걸리거나 기준일이 더 이르면 지난 순위표를 쓴다', () => {
    const first = C.buildLive({ wikiText: W.STANDINGS, feeds: [], prev: null, now: NOW, season: 2026 });
    const broken = W.STANDINGS.replace("| '''[[KT Wiz]]''' || 134 || 79 || 53 || 2", "| '''[[KT Wiz]]''' || 135 || 80 || 53 || 2");
    const keep = C.buildLive({ wikiText: broken, feeds: [], prev: first, now: NOW, season: 2026 });
    expect(keep.standings.rows[0].win).toBe(79);
    const older = W.STANDINGS.replace('October 1, 2026', 'September 29, 2026');
    expect(C.buildLive({ wikiText: older, feeds: [], prev: first, now: NOW, season: 2026 }).standings.asOf).toBe('2026-10-01');
    /* 위키를 못 받았으면(null) 지난 것 그대로 */
    expect(C.buildLive({ wikiText: null, feeds: [], prev: first, now: NOW, season: 2026 }).standings.asOf).toBe('2026-10-01');
  });

  test('명단·프로필·사진: 다른 사람 문서는 빼고, 지난 사진은 같은 파일일 때만 다시 쓴다', () => {
    const rosterPages = new Map([['틀:KIA 타이거즈 명단', { content: W.ROSTER, timestamp: '2026-09-17T06:58:57Z' }]]);
    const profilePages = new Map([
      ['가람 (야구 선수)', { content: W.INFOBOX }],
      ['투수둘', { content: W.INFOBOX.replace(/KIA 타이거즈/g, '가상 실업팀').replace('등번호 = 0', '등번호 = 99') }],
    ]);
    const photoInfo = new Map([['가람 선수 첫 인사.jpg', { thumb: 'https://thumb.wikimedia.org/x/330px-a.jpg', width: 330, height: 440, page: 'https://commons.wikimedia.org/wiki/File:a.jpg', author: '테스트 작가', license: 'CC BY 3.0', licenseUrl: null }]]);
    const pl = C.buildPlayers({ rosterPages, profilePages, photoInfo, prev: null, now: NOW });
    expect(pl.rosters.kia.players).toHaveLength(25);
    expect(pl.rosters.kia.players.find(p => p.name === '육성투수').dev).toBe(true);
    expect(pl.profiles.map(p => p.wiki)).toEqual(['가람 (야구 선수)']);
    const garam = pl.profiles[0];
    expect(garam.photo).toMatchObject({ file: '가람 선수 첫 인사.jpg', caption: '가람(2025년)', license: 'CC BY 3.0' });
    for (const k of ['team', 'number', 'photoFile', 'photoCaption']) expect(garam).not.toHaveProperty(k);

    /* 사진 정보를 못 받은 차례: 지난번에 확인한 같은 파일의 사진을 쓴다 */
    const again = C.buildPlayers({ rosterPages, profilePages, photoInfo: null, photoFailed: true, prev: pl, now: NOW });
    expect(again.profiles[0].photo.thumb).toBe('https://thumb.wikimedia.org/x/330px-a.jpg');
    /* 이번에 라이선스 확인에서 빠진 파일(비자유가 됐거나 지워짐)이면 붙이지 않는다 */
    const gone = C.buildPlayers({ rosterPages, profilePages, photoInfo: new Map([['가람 선수 첫 인사.jpg', null]]), prev: pl, now: NOW });
    expect(gone.profiles[0].photo).toBeUndefined();
  });

  test('위키데이터 대표 사진은 정보 상자에 사진이 없을 때만', () => {
    const rosterPages = new Map([['틀:KIA 타이거즈 명단', { content: W.ROSTER }]]);
    const noPhoto = W.INFOBOX.replace('| 선수 사진 파일명 = 가람 선수 첫 인사.jpg', '| 선수 사진 파일명 =');
    const photo = { thumb: 'https://upload.wikimedia.org/b.jpg', width: 330, height: 400, page: 'https://commons.wikimedia.org/wiki/File:b.jpg', author: 'b', license: 'CC0', licenseUrl: null };
    const pl = C.buildPlayers({
      rosterPages, profilePages: new Map([['가람 (야구 선수)', { content: noPhoto }]]),
      photoInfo: new Map([['Wikidata Ga.jpg', photo]]), photoFallback: new Map([['가람 (야구 선수)', 'Wikidata Ga.jpg']]), prev: null, now: NOW,
    });
    expect(pl.profiles[0].photo).toMatchObject({ file: 'Wikidata Ga.jpg', caption: null });
  });

  test('명단 틀이 망가졌으면 그 구단은 지난 명단을 쓴다', () => {
    const good = C.buildPlayers({ rosterPages: new Map([['틀:KIA 타이거즈 명단', { content: W.ROSTER }]]), profilePages: new Map(), prev: null, now: NOW });
    const bad = C.buildPlayers({ rosterPages: new Map([['틀:KIA 타이거즈 명단', { content: W.BROKEN_ROSTER }]]), profilePages: new Map(), prev: good, now: NOW });
    expect(bad.rosters.kia.players).toHaveLength(25);
  });
});

test.describe('연도별 기록 (선수 문서의 「통산 기록」 표)', () => {
  test('팀 칸 rowspan·세로로 적은 줄·{{Color}} 꾸밈을 읽고, 통산 줄과 시즌 수를 따로 둔다', () => {
    const st = P.parseCareerStats(W.CAREER, 2026);
    expect(Object.keys(st)).toEqual(['pit']);
    expect(st.pit.cols).toEqual(['year', 'team', 'g', 'era', 'w', 'l', 'sv', 'hld', 'ip', 'k', 'bb']);
    expect(st.pit.rows).toEqual([
      ['2023', 'KIA', '20', '4.10', '5', '7', '0', '1', '90', '70', '30'],
      ['2024', 'KIA', '28', '2.95', '12', '5', '0', '0', '150⅔', '140', '35'],
      ['2025', 'KIA', '25', '3.33', '9', '6', '0', '0', '135⅓', '120', '33'],
    ]);
    expect(st.pit.total).toEqual(['통산', '', '73', '3.40', '26', '18', '0', '1', '376', '330', '98']);
    expect(st.pit.seasons).toBe('3시즌');
  });

  test('편집자가 미리 만든 빈 시즌 줄(경기 0·000)은 뺀다, MLB 만 있는 표는 KBO 기록으로 내지 않는다', () => {
    const st = P.parseCareerStats(W.CAREER, 2026);
    expect(st.pit.rows.map((r) => r[0])).not.toContain('2026');
    expect(P.parseCareerStats(W.CAREER_MLB_ONLY, 2026)).toBeNull();
    expect(P.parseCareerStats('기록 절이 없는 문서', 2026)).toBeNull();
    /* 올해보다 뒤 연도는 받지 않는다 */
    expect(P.parseCareerStats(W.CAREER, 2024).pit.rows.map((r) => r[0])).toEqual(['2023', '2024']);
  });

  test('KBO 공식 기록 번호: {{KBO 투수|번호}}·{{KBO 타자|id=번호|이름}}', () => {
    expect(P.parseKboIds(W.CAREER)).toEqual({ hitter: '67890', pitcher: '12345' });
    expect(P.parseKboIds('{{KBO 타자|52605}}')).toEqual({ hitter: '52605', pitcher: null });
    expect(P.parseKboIds('외부 링크 없음')).toBeNull();
  });

  test('buildStats: 이 구단 선수로 확인한 문서만, 감독은 빼고, 못 받은 차례에는 지난 기록', () => {
    const rosterPages = new Map([['틀:KIA 타이거즈 명단', { content: W.ROSTER }]]);
    const profilePages = new Map([
      ['가람 (야구 선수)', { content: W.INFOBOX + '\n' + W.CAREER }],
      ['테스트감독', { content: W.INFOBOX.replace('| 선수명 = 가람', '| 선수명 = 테스트감독') + '\n' + W.CAREER }],
    ]);
    const players = C.buildPlayers({ rosterPages, profilePages, prev: null, now: NOW });
    expect(players.profiles.map((p) => p.wiki).sort()).toEqual(['가람 (야구 선수)', '테스트감독']);
    const stats = C.buildStats({ players, profilePages, prev: null, now: NOW, season: 2026 });
    expect(stats.players.map((s) => s.wiki)).toEqual(['가람 (야구 선수)']);   // 감독 제외
    expect(stats.players[0].kbo).toEqual({ hitter: '67890', pitcher: '12345' });
    expect(stats.latestSeason).toBe(2025);
    expect(P.validateStats(stats)).toEqual([]);
    const again = C.buildStats({ players, profilePages: null, profileFailed: true, prev: stats, now: NOW, season: 2026 });
    expect(again.players).toEqual(stats.players);
  });

  test('validateStats: 칸·줄 모양과 KBO 번호를 검사한다', () => {
    const ok = { version: 1, generatedAt: NOW.toISOString(), latestSeason: 2025, players: [{ wiki: 'a', kbo: { hitter: '1234', pitcher: null }, bat: { cols: ['year', 'g'], rows: [['2025', '10']], total: null } }] };
    expect(P.validateStats(ok)).toEqual([]);
    const bad = JSON.parse(JSON.stringify(ok));
    bad.players[0].bat.rows[0] = ['20xx', '10'];
    bad.players[0].kbo.hitter = 'abc';
    bad.players.push({ wiki: 'b', kbo: null });
    expect(P.validateStats(bad).join()).toMatch(/기록 줄 이상.*KBO 번호 이상|KBO 번호 이상.*기록 줄 이상/);
    expect(P.validateStats(bad).join()).toContain('빈 기록 b');
  });
});

test.describe('자료 파일 쓰기·읽기', () => {
  test('dataScript → parseDataScript 왕복, 기사·선수 하나가 한 줄 (git 차이를 사람이 읽을 수 있게)', () => {
    const payload = { version: 1, list: [{ a: 1 }, { a: 2 }], nested: { rows: [{ b: 1 }] } };
    const text = C.dataScript('BaseballLive', payload, '시험');
    expect(C.parseDataScript(text, 'BaseballLive')).toEqual(payload);
    expect(text).toContain('\n    {"a":1},\n    {"a":2}\n');
    expect(C.parseDataScript('깨진 파일', 'BaseballLive')).toBeNull();
  });

  test('수집 설정: 피드는 모두 https, 위키 요청에는 연락처가 든 User-Agent', () => {
    expect(C.FEEDS.length).toBeGreaterThanOrEqual(5);
    for (const f of C.FEEDS) {
      expect(f.url, f.source).toMatch(/^https:\/\//);
      expect(f.source).toBeTruthy();
    }
    expect(C.FEEDS.filter(f => f.games).map(f => f.source)).toEqual(['연합뉴스']);
    expect(C.UA).toMatch(/^baseball-alimi\/[\d.]+ \(\+https:\/\/github\.com\//);
  });
});
