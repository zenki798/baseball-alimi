const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const S = require('../scripts/check-sensitive.js');

/*
 * 저장소 위생 — AGENTS.md 규칙 1·2 를 사람(에이전트)의 주의에만 맡기지 않고 기계가 확인한다.
 */

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'test-results', 'playwright-report', 'blob-report', 'private', '_site']);

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const isGit = fs.existsSync(path.join(ROOT, '.git'));
const git = (args) => execFileSync('git', args, { cwd: ROOT }).toString().trim();

test('규칙 1: 테스트를 건너뛰거나 하나만 돌리는 표시가 없다 (skip·only·fixme)', () => {
  /* 이 파일이 자기 자신에게 걸리지 않게 낱말을 쪼개 둔다 */
  const banned = new RegExp('\\b(?:test|describe|it)(?:\\.describe)?\\.(?:' + ['sk' + 'ip', 'on' + 'ly', 'fix' + 'me'].join('|') + ')\\s*\\(');
  const found = [];
  for (const f of walk(path.join(ROOT, 'tests'))) {
    if (!f.endsWith('.js')) continue;
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (banned.test(line)) found.push(path.relative(ROOT, f) + ':' + (i + 1));
    });
  }
  expect(found).toEqual([]);
});

test('규칙 2: 저장소 파일에 민감정보가 없다 (개인정보·인증정보·키 파일·표 데이터·이 PC 의 금지어)', () => {
  /* 금지어 목록(private/blocked-words.txt)은 이 PC 에만 있다 — GitHub 서버에서는 빈 목록으로 돈다 */
  const words = S.privateWords(ROOT);
  const findings = [];
  for (const f of walk(ROOT)) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    if (fs.statSync(f).size > 5 * 1024 * 1024) continue;
    findings.push(...S.scanBuffer(rel, fs.readFileSync(f), words));
  }
  expect(findings.map((x) => x.file + ':' + x.line + ' ' + x.kind)).toEqual([]);
});

test('규칙 2: 금지어 목록은 저장소에 올라가지 않는다 (private/ 는 git 이 무시)', () => {
  const gi = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/).map((l) => l.trim());
  expect(gi).toContain('private/');
  if (isGit) expect(git(['check-ignore', 'private/blocked-words.txt'])).toBe('private/blocked-words.txt');
  /* 목록 형식: "낱말" 또는 "낱말 | 뺄 경로" — 뺄 경로에 걸린 파일만 넘긴다 */
  const fake = [{ word: '가상이름', except: ['data/'] }];
  expect(S.scanText('app.js', '제목 가상이름', fake).map((f) => f.kind)).toEqual(['금지어(private/blocked-words.txt)']);
  expect(S.scanText('data/players.js', '{"name":"박가상이름"}', fake)).toEqual([]);
  expect(S.scanText('app.js', '제목 가상이름', fake)[0].value).not.toContain('상이름');   // 결과에도 낱말을 다 드러내지 않는다
});

test('규칙 2: 검사기는 진짜 값을 잡고, 가상 값·주소 속 숫자는 넘긴다', () => {
  const kinds = (s) => S.scanText('x', s).map((f) => f.kind);
  /* 시험용 값은 실행할 때 조각을 이어 만든다 — 파일에 그대로 적으면 위의 저장소 검사(와 GitHub 비밀 검사)가 이 파일을 잡는다 */
  const card = ['4111', '1111', '1111', '1111'].join(' ');
  const phone = ['010', '1234', '5678'].join('-');
  const mail = ['hong', 'company.co.kr'].join('@');
  const secret = 'token = "' + ['abcd1234', 'efgh5678'].join('') + '"';
  expect(kinds(card)).toEqual(['카드번호']);
  expect(kinds('연락처 ' + phone)).toEqual(['휴대폰 번호']);
  expect(kinds(mail)).toEqual(['이메일']);
  expect(kinds(secret)).toEqual(['비밀값 대입']);
  expect(kinds('010-0000-0000 hong@example.com zenki798@users.noreply.github.com')).toEqual([]);
  expect(kinds('https://www.yna.co.kr/view/AKR20261001192500007')).toEqual([]);
  expect(kinds('Thomas_Hatch_%2850169686298%29_(cropped).jpg')).toEqual([]);
});

test('규칙 2: .gitignore 필수 항목', () => {
  const gi = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/).map((l) => l.trim());
  for (const need of ['.env', '.env.*', '!.env.example', '*.pem', '*.key', 'node_modules/', 'playwright-report/', 'test-results/']) {
    expect(gi, need).toContain(need);
  }
});

test('규칙 2: 커밋 전 검사 훅이 있고, git 저장소라면 켜져 있으며 작성자는 noreply 주소', () => {
  const hook = fs.readFileSync(path.join(ROOT, '.githooks', 'pre-commit'), 'utf8');
  expect(hook).toContain('node scripts/check-sensitive.js --staged');
  /* git 을 아직 만들지 않은 사본, GitHub 서버의 사본(이 PC 의 로컬 설정이 없다)에서는 훅 파일만 본다.
     GitHub 서버가 만드는 자료 커밋의 작성자는 workflow.spec.js 가 따로 본다(봇 noreply) */
  if (!isGit || process.env.GITHUB_ACTIONS) return;
  expect(git(['config', '--get', 'core.hooksPath'])).toBe('.githooks');
  expect(git(['config', '--get', 'user.email'])).toMatch(/@users\.noreply\.github\.com$/);
});

test('개발 서버는 앱 파일만 내준다 (테스트·수집기·설정·문서는 404)', async ({ request }) => {
  for (const p of ['/', '/index.html', '/app.js', '/data/live.js', '/icons/teams/kia.svg', '/manifest.webmanifest']) {
    expect((await request.get(p)).status(), p).toBe(200);
  }
  for (const p of ['/scripts/collect.js', '/package.json', '/AGENTS.md', '/tests/helpers.js', '/.gitignore', '/icons/teams/README.md', '/%2e%2e/package.json', '/server.js']) {
    expect((await request.get(p)).status(), p).toBe(404);
  }
});

test('package.json: Playwright 버전을 정확히 고정한다 (이 PC 에 받아 둔 브라우저를 쓴다)', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  expect(pkg.devDependencies['@playwright/test']).toMatch(/^\d+\.\d+\.\d+$/);
  expect(pkg.private).toBe(true);
});
