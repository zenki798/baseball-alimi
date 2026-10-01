/* 앱 아이콘 PNG 를 만든다 (`npm run make:icons`). 이미지 도구 없이 SVG 를 창 없는 브라우저로 찍는다.
   - icon-192/512      : 일반 아이콘 (둥근 모서리, 바깥은 투명)
   - icon-maskable-512 : 안드로이드 모양 마스크용 (배경을 끝까지 채우고, 그림은 가운데 안전 영역 안에)
   - apple-touch-icon  : iOS 홈 화면용 180px (배경을 끝까지 채운다. 모서리는 iOS 가 둥글린다)
   구단 로고는 상표라 쓰지 않는다 — 야구공과 알림 점만 그린다. */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'icons');
const BG = '#0d2b52';     // 화면 머리띠 색
const SEAM = '#d7263d';   // 실밥(빨강)
const DOT = '#ffc83d';    // 알림 점

/* 100×100 좌표계. scale 로 안전 영역에 맞춘다 */
function glyph(scale) {
  const t = (100 - 100 * scale) / 2;
  return `
  <g transform="translate(${t} ${t}) scale(${scale})">
    <circle cx="48" cy="52" r="30" fill="#ffffff"/>
    <path d="M30.5 29.5 C 40.5 39, 40.5 65, 30.5 74.5" fill="none" stroke="${SEAM}" stroke-width="3.6" stroke-linecap="round" stroke-dasharray="0.1 6.2"/>
    <path d="M65.5 29.5 C 55.5 39, 55.5 65, 65.5 74.5" fill="none" stroke="${SEAM}" stroke-width="3.6" stroke-linecap="round" stroke-dasharray="0.1 6.2"/>
    <path d="M30.5 29.5 C 40.5 39, 40.5 65, 30.5 74.5 M65.5 29.5 C 55.5 39, 55.5 65, 65.5 74.5" fill="none" stroke="${SEAM}" stroke-width="1.4" opacity=".55"/>
    <circle cx="75" cy="25" r="10.5" fill="${DOT}" stroke="${BG}" stroke-width="4.5"/>
  </g>`;
}

function svg({ rounded, scale }) {
  const bg = rounded
    ? `<rect x="4" y="4" width="92" height="92" rx="22" fill="${BG}"/>`
    : `<rect width="100" height="100" fill="${BG}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg}${glyph(scale)}</svg>`;
}

const ICONS = [
  { file: 'icon-192.png', size: 192, rounded: true, scale: 0.86 },
  { file: 'icon-512.png', size: 512, rounded: true, scale: 0.86 },
  { file: 'icon-maskable-512.png', size: 512, rounded: false, scale: 0.72 }, // 안전 영역: 가운데 지름 80%
  { file: 'apple-touch-icon.png', size: 180, rounded: false, scale: 0.8 },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const icon of ICONS) {
    await page.setViewportSize({ width: icon.size, height: icon.size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${icon.size}px;height:${icon.size}px}</style>${svg(icon)}`);
    await page.locator('svg').screenshot({ path: path.join(OUT, icon.file), omitBackground: true });
    console.log('icons/' + icon.file);
  }
  await browser.close();
})();
