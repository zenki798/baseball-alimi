const { defineConfig, devices } = require('@playwright/test');

/* 다른 작업 폴더의 개발 서버(4175·4179 …)와 겹치지 않는 포트. 겹치면 reuseExistingServer 때문에
   다른 앱을 대상으로 테스트가 돈다 (server.js 머리 주석). */
const PORT = 4211;
const BASE_URL = 'http://localhost:' + PORT;

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  /* 사용자는 같은 PC 에서 다른 일을 한다. 창은 띄우지 않고(headless) 워커는 셋까지만 */
  workers: 3,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 30 * 1000,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    /* 서비스 워커가 페이지 요청을 가로채면 가짜 자료(route)가 흔들린다.
       기본은 막고, 앱 설치·오프라인 검사(pwa.spec.js)에서만 켠다. */
    serviceWorkers: 'block',
  },

  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 5'] },
      /* 화면과 상관없는 검사(수집기·자료 계약·저장소 위생·배포 설정)는 한 번만 돌린다 */
      testIgnore: /(collector|data|hygiene|workflow)\.spec\.js$/,
    },
  ],

  webServer: {
    command: 'node server.js',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 30 * 1000,
  },
});
