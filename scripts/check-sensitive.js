/*
 * 민감정보 검사기 (AGENTS.md 규칙 2) — 저장소에 올라가면 안 되는 개인정보·인증정보·실데이터 파일을 찾는다.
 *
 *   node scripts/check-sensitive.js              git 이 아는 파일 전체 (추적 중 + 새 파일, .gitignore 대상 제외)
 *   node scripts/check-sensitive.js --staged     커밋하려고 올린(stage) 내용만 — .githooks/pre-commit 이 부른다
 *   node scripts/check-sensitive.js --path <폴더> 그 폴더 아래 전부 (git 과 무관)
 *
 * 잡는 것: Luhn 이 맞는 카드번호(0000 으로 시작하는 가상 번호 제외), 주민등록번호, 휴대폰 번호(010-0000-0000 제외),
 *         이메일(example.* · users.noreply.github.com · noreply@anthropic.com 제외), 개인키, AWS 키(AKIA…),
 *         GitHub 토큰(ghp_ · github_pat_), api_key·secret·password·token 에 값을 넣은 줄,
 *         체크섬이 맞는 사업자등록번호(000 으로 시작하는 가상 번호 제외),
 *         파일: .env*(.env.example 제외) · 키 파일 · csv/tsv/xlsx/xls (tests/fixtures/ 제외)
 * 출력에는 찾은 값을 가려서 보여 준다(검사 결과가 또 하나의 유출이 되지 않게). 찾으면 종료코드 1, 없으면 0.
 *
 * 이 스크립트는 개발 도구다. 네트워크를 쓰지 않는다(git 은 로컬 명령만 부른다). 작업9(점검 프로그램)의 것을 옮겨 왔고,
 * 수집한 뉴스·사진 주소 속 긴 숫자를 카드번호·전화번호로 잘못 잡지 않게 앞뒤 경계를 넓혔다 — 2026-10-02 오탐 6건:
 * 기사 주소 AKR20261001192500007(영문자 뒤 숫자), 사진 주소 Thomas_Hatch_%2850169686298%29(괄호를 %28 로 바꾼 뒤 숫자).
 * tests/hygiene.spec.js 가 저장소 전체를, .githooks/pre-commit 이 커밋할 내용을 이것으로 검사한다.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'test-results', 'playwright-report', 'blob-report', 'private', 'dist', 'build']);
const MAX_SCAN_BYTES = 5 * 1024 * 1024;

/* ───────── 검사 규칙 ───────── */

function luhnOk(digits) {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

function rrnChecksumOk(d) {
  const w = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5];
  let s = 0;
  for (let i = 0; i < 12; i++) s += (d.charCodeAt(i) - 48) * w[i];
  return (11 - (s % 11)) % 10 === d.charCodeAt(12) - 48;
}

function bizNoChecksumOk(d) {
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let s = 0;
  for (let i = 0; i < 9; i++) s += (d.charCodeAt(i) - 48) * w[i];
  s += Math.floor(((d.charCodeAt(8) - 48) * 5) / 10);
  return (10 - (s % 10)) % 10 === d.charCodeAt(9) - 48;
}

function validDate(yy, mm, dd) {
  const m = Number(mm);
  const d = Number(dd);
  return m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

const SAFE_EMAIL = /@(?:[a-z0-9-]+\.)*example\.(?:com|org|net)$|@users\.noreply\.github\.com$|^noreply@anthropic\.com$/i;
const PLACEHOLDER = /^(?:x+|\*+|\.+|-+|_+|<[^>]*>|\$\{[^}]*\}|%[^%]*%|changeme|your[_-]?\w*|example\w*|dummy\w*|test\w*|sample\w*|placeholder|redacted|none|null|undefined|true|false)$/i;

const RULES = [
  {
    kind: '카드번호',
    re: /(?<![\w%=-])(?:\d{4}[- ]\d{4}[- ]\d{4}[- ]\d{1,7}|\d{4}[- ]\d{6}[- ]\d{5}|\d{13,19})(?![\w%-])/g,
    check(m) {
      const d = m.replace(/\D/g, '');
      return d.length >= 13 && d.length <= 19 && !d.startsWith('0000') && !/^(\d)\1+$/.test(d) && luhnOk(d);
    },
  },
  {
    kind: '주민등록번호',
    re: /(?<![\w%=])(\d{2})(\d{2})(\d{2})(-?)([1-8])(\d{6})(?![\w%])/g,
    check(m, g) {
      if (!validDate(g[1], g[2], g[3])) return false;
      const digits = m.replace('-', '');
      return g[4] === '-' || rrnChecksumOk(digits); // 붙여 쓴 13자리는 체크섬이 맞을 때만(다른 긴 숫자 오탐 방지)
    },
  },
  {
    kind: '휴대폰 번호',
    re: /(?<![\w%=/.-])01[016789][- .]?\d{3,4}[- .]?\d{4}(?![\w%-])/g,
    check(m) {
      const d = m.replace(/\D/g, '');
      return !/^01[016789]0{7,8}$/.test(d);
    },
  },
  {
    kind: '이메일',
    re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g,
    check(m) { return !SAFE_EMAIL.test(m); },
  },
  { kind: '개인키', re: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/g, check: () => true },
  { kind: 'AWS 접근 키', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, check: () => true },
  { kind: 'GitHub 토큰', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/g, check: () => true },
  {
    kind: '비밀값 대입',
    re: /\b(?:api[_-]?key|apikey|secret(?:[_-]?key)?|client[_-]?secret|password|passwd|pwd|access[_-]?token|auth[_-]?token|token)\b["']?\s*[:=]\s*["']([^"'\s]{8,})["']/gi,
    check(m, g) { return !PLACEHOLDER.test(g[1]) && !/^process\.env/.test(g[1]); },
  },
  {
    kind: '사업자등록번호',
    re: /(?<![\d-])(\d{3})-(\d{2})-(\d{5})(?![\d-])/g,
    check(m, g) { return g[1] !== '000' && bizNoChecksumOk(g[1] + g[2] + g[3]); },
  },
];

/* 파일 이름으로 막는 것 */
function fileProblem(relPath) {
  const p = relPath.replace(/\\/g, '/');
  const base = p.split('/').pop();
  const inFixtures = /(^|\/)tests\/fixtures\//.test(p);
  if (/^\.env(\..+)?$/i.test(base) && base.toLowerCase() !== '.env.example') return '환경설정 파일(.env)';
  if (/\.(pem|key|p12|pfx|jks|keystore)$/i.test(base) || /^id_(rsa|dsa|ecdsa|ed25519)$/i.test(base)) return '키·인증서 파일';
  if (/^(secrets|credentials)\.json$/i.test(base) || /^serviceAccount.*\.json$/i.test(base)) return '인증정보 파일';
  if (/\.(csv|tsv|xlsx|xlsm|xls)$/i.test(base) && !inFixtures) return '표 데이터 파일(실데이터일 수 있음 — private/ 에 두기)';
  return null;
}

/* 찾은 값을 가린다: 앞 2자 + * + 뒤 2자 (이메일은 앞 1자 + 도메인) */
function mask(value) {
  const v = String(value);
  const at = v.indexOf('@');
  if (at > 0) return v[0] + '***' + v.slice(at);
  if (v.length <= 6) return '*'.repeat(v.length);
  return v.slice(0, 2) + '*'.repeat(Math.min(v.length - 4, 12)) + v.slice(-2);
}

/*
 * 이 PC 에만 두는 금지어 목록 — private/blocked-words.txt (private/ 는 git 이 무시한다).
 * 사용자·가족 이름처럼 규칙으로는 알아볼 수 없는 낱말을 저장소에 넣지 않게 막는다. 목록 파일 자체는 올라가지 않는다.
 *   한 줄에 하나:  낱말            — 모든 파일에서 잡는다 (영문은 대소문자 무시)
 *                 낱말 | data/    — 그 경로로 시작하는 파일은 뺀다 (예: 같은 이름의 실제 선수가 자료에 있을 때)
 *   # 로 시작하는 줄은 설명
 * 목록이 없으면(새로 받은 사본·GitHub 서버) 이 검사는 하지 않는다.
 */
function privateWords(root) {
  let text = '';
  try { text = fs.readFileSync(path.join(root || process.cwd(), 'private', 'blocked-words.txt'), 'utf8'); } catch (e) { return []; }
  return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => {
    const [word, except] = l.split('|').map((s) => s.trim());
    return { word, except: (except || '').split(',').map((s) => s.trim().replace(/\\/g, '/')).filter(Boolean) };
  }).filter((w) => w.word && w.word.length >= 2);
}

function maskWord(w) { return w[0] + '*'.repeat(Math.max(1, w.length - 1)); }

function scanText(relPath, text, words) {
  const found = [];
  const rel = String(relPath).replace(/\\/g, '/');
  const active = (words || []).filter((w) => !w.except.some((p) => rel.startsWith(p)));
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (line.length > 20000) return; // 압축된 한 줄(번들 등)은 건너뜀
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      let g;
      while ((g = rule.re.exec(line)) !== null) {
        if (rule.check(g[0], g)) found.push({ file: relPath, line: i + 1, kind: rule.kind, value: mask(g[1] && rule.kind === '비밀값 대입' ? g[1] : g[0]) });
        if (g.index === rule.re.lastIndex) rule.re.lastIndex++;
      }
    }
    const low = line.toLowerCase();
    for (const w of active) {
      if (low.includes(w.word.toLowerCase())) found.push({ file: relPath, line: i + 1, kind: '금지어(private/blocked-words.txt)', value: maskWord(w.word) });
    }
  });
  return found;
}

function isBinary(buf) {
  const n = Math.min(buf.length, 8192);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

function scanBuffer(relPath, buf, words) {
  const out = [];
  const fp = fileProblem(relPath);
  if (fp) out.push({ file: relPath, line: 0, kind: fp, value: '' });
  if (!buf || buf.length > MAX_SCAN_BYTES || isBinary(buf)) return out;
  return out.concat(scanText(relPath, buf.toString('utf8'), words));
}

function excluded(relPath) {
  return relPath.replace(/\\/g, '/').split('/').some((part) => EXCLUDED_DIRS.has(part));
}

/* ───────── 대상 모으기 ───────── */

function git(args, opts) {
  return execFileSync('git', ['-c', 'core.quotepath=off'].concat(args), Object.assign({ maxBuffer: 256 * 1024 * 1024 }, opts || {}));
}

function listRepoFiles(cwd) {
  const out = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd }).toString('utf8');
  return Array.from(new Set(out.split('\0').filter(Boolean)));
}

function listStaged(cwd) {
  const out = git(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'], { cwd }).toString('utf8');
  return out.split('\0').filter(Boolean);
}

function walk(dir, root, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDED_DIRS.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, root, out);
    else if (ent.isFile()) out.push(path.relative(root, p));
  }
  return out;
}

function main(argv) {
  const staged = argv.includes('--staged');
  const pi = argv.indexOf('--path');
  const cwd = process.cwd();
  let findings = [];
  let count = 0;
  const root = pi >= 0 ? path.resolve(argv[pi + 1] || '.') : cwd;
  const words = privateWords(root);

  if (pi >= 0) {
    for (const rel of walk(root, root, [])) {
      count++;
      let buf = null;
      try { buf = fs.readFileSync(path.join(root, rel)); } catch (e) { continue; }
      findings = findings.concat(scanBuffer(rel, buf, words));
    }
  } else if (staged) {
    for (const rel of listStaged(cwd)) {
      if (excluded(rel)) continue;
      count++;
      let buf = null;
      try { buf = git(['show', ':' + rel], { cwd }); } catch (e) { buf = null; }
      findings = findings.concat(scanBuffer(rel, buf, words));
    }
  } else {
    for (const rel of listRepoFiles(cwd)) {
      if (excluded(rel)) continue;
      const abs = path.join(cwd, rel);
      if (!fs.existsSync(abs)) continue; // 지운 파일
      count++;
      findings = findings.concat(scanBuffer(rel, fs.readFileSync(abs), words));
    }
  }

  const scope = (pi >= 0 ? '폴더' : staged ? '커밋할(stage) 파일' : '저장소 파일') + (words.length ? ' (금지어 ' + words.length + '개 포함)' : '');
  if (!findings.length) {
    process.stdout.write('[민감정보 검사] ' + scope + ' ' + count + '개 — 0건\n');
    return 0;
  }
  process.stdout.write('[민감정보 검사] ' + scope + ' ' + count + '개 — ' + findings.length + '건 발견 (값은 가려서 보여 줍니다)\n');
  for (const f of findings) {
    process.stdout.write('  ' + f.file.replace(/\\/g, '/') + (f.line ? ':' + f.line : '') + '  ' + f.kind + (f.value ? '  ' + f.value : '') + '\n');
  }
  process.stdout.write('→ 커밋하지 말고 값을 빼거나 가상 값(AGENTS.md 규칙 2 표)으로 바꾸세요. 실데이터는 private/ 에 둡니다.\n');
  return 1;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    process.stderr.write('[민감정보 검사] 실행 실패: ' + ((e && e.message) || e) + '\n');
    process.exitCode = 2;
  }
}

module.exports = { scanText, scanBuffer, fileProblem, mask, privateWords, luhnOk, rrnChecksumOk, bizNoChecksumOk };
