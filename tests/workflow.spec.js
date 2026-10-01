const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

/*
 * 배포 워크플로(.github/workflows/collect.yml) — 수집 → 전체 테스트 → 통과해야 배포.
 * YAML 해석기를 들이지 않고 글자로 본다(의존성을 늘리지 않는다).
 */

const ROOT = path.resolve(__dirname, '..');
const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'collect.yml'), 'utf8');

function job(name) {
  const m = yml.match(new RegExp('\\n  ' + name + ':\\n([\\s\\S]*?)(?=\\n  [a-z]+:\\n|$)'));
  return m ? m[1] : '';
}

test('예약·푸시·수동 실행으로 돈다, 한 번에 하나만', () => {
  expect(yml).toMatch(/schedule:\s*\n(?:\s*#[^\n]*\n)*\s*- cron: '[^']+'/);   // 사이에 설명 주석 줄이 있다
  expect(yml).toMatch(/push:\s*\n\s*branches: \[main\]/);
  expect(yml).toContain('workflow_dispatch:');
  expect(yml).toMatch(/concurrency:\s*\n\s*group: collect/);
});

test('규칙 1: 전체 테스트가 통과해야 배포한다 (deploy ← test ← collect)', () => {
  expect(job('test')).toContain('needs: collect');
  expect(job('test')).toContain('run: npx playwright test');
  expect(job('deploy')).toContain('needs: test');
  /* 테스트는 방금 모은 자료로 돈다 — 망가진 자료는 배포되지 않는다 */
  expect(job('test')).toContain('actions/download-artifact');
});

test('배포에는 앱 파일만 — 테스트·수집기·설정·AGENTS.md 는 올리지 않는다', () => {
  const d = job('deploy');
  expect(d).toContain('cp index.html styles.css teams.js store.js app.js sw.js manifest.webmanifest _site/');
  expect(d).toContain('cp icons/teams/*.svg icons/teams/*.png _site/icons/teams/');
  expect(d).toContain('cp data/live.js data/players.js data/stats.js _site/data/');
  for (const bad of ['tests', 'scripts', 'package.json', 'AGENTS.md', 'server.js', 'playwright.config.js']) {
    expect(d.split('\n').filter((l) => /\bcp\b/.test(l)).join('\n'), bad).not.toContain(bad);
  }
});

test('권한은 꼭 필요한 만큼: 기본 읽기, 커밋하는 수집 단계만 쓰기, 배포만 pages', () => {
  expect(yml).toMatch(/^permissions:\s*\n\s*contents: read/m);
  expect(job('collect')).toContain('contents: write');
  expect(job('deploy')).toMatch(/pages: write[\s\S]*id-token: write/);
  expect(job('test')).not.toContain('permissions:');
  /* 비밀값을 쓰지 않는다 — 수집에 키가 필요 없다 */
  expect(yml).not.toMatch(/secrets\./);
});

test('저장소 사본 커밋: 하루 한 번까지, 커밋 전에 민감정보 검사, 작성자는 봇 noreply', () => {
  const c = job('collect');
  expect(c).toContain('72000');   // 20시간
  expect(c).toContain('node scripts/check-sensitive.js --staged');
  expect(c).toContain('users.noreply.github.com');
  expect(c).toContain('PREV_BASE_URL');
  expect(c).toContain('git add data/live.js data/players.js data/stats.js');
});
