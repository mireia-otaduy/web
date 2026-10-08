#!/usr/bin/env node
/**
 * Genera los recursos gráficos derivados de la marca:
 *   - favicon.svg, favicon.ico, apple-touch-icon.png
 *   - iconos del manifiesto web (192, 512 y 512 "maskable")
 *   - imágenes para redes sociales (Open Graph) en los tres idiomas
 *
 * No forma parte del build normal: los resultados ya están en src/static y src/img.
 * Solo hay que ejecutarlo si cambia la marca o el eslogan.
 *
 * Requiere Playwright con Chromium:  npm i -D playwright && npx playwright install chromium
 * Uso:  node tools/make-assets.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');

let chromium;
try {
  // PLAYWRIGHT_MODULE permite apuntar a una instalación global de Playwright
  const entry = process.env.PLAYWRIGHT_MODULE ? pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE, 'index.mjs')).href : 'playwright';
  ({ chromium } = await import(entry));
} catch {
  console.error('Falta Playwright. Instálalo con: npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}

const NAVY = '#07163a';
const SKY = '#5ab4ff';

/** Marca cuadrada: fondo azul marino y una "L" celeste (la misma del favicon original). */
const markSvg = (size, { bleed = false } = {}) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="${bleed ? 0 : 14}" fill="${NAVY}"/>
  <path d="M21 14h11v26h16v10H21z" fill="${SKY}"/>
</svg>`;

const slogans = {
  es: {
    title: 'Piezas industriales <em>a medida</em>, del plano a la serie',
    sub: 'Desarrollo de proyectos y fabricación industrial · desde 2008'
  },
  en: {
    title: 'Custom <em>industrial parts</em>, from drawing to series',
    sub: 'Project development and industrial manufacturing · since 2008'
  },
  zh: {
    title: '<em>按图定制</em>工业零部件，从图纸到批量生产',
    sub: '项目开发与工业制造 · 创立于 2008 年'
  }
};

const ogHtml = (lang) => {
  const font = (name, file) =>
    `@font-face{font-family:"${name}";src:url("${pathToFileURL(path.join(SRC, 'fonts', file))}") format("woff2");font-weight:100 900}`;
  return `<!doctype html><html lang="${lang}"><meta charset="utf-8"><style>
    ${font('Space Grotesk', 'space-grotesk-latin-wght-normal.woff2')}
    ${font('Inter', 'inter-latin-wght-normal.woff2')}
    *{box-sizing:border-box;margin:0}
    body{width:1200px;height:630px;overflow:hidden;background:${NAVY};color:#fff;font-family:"Inter","WenQuanYi Zen Hei","Noto Sans CJK SC",sans-serif;position:relative}
    .grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px);background-size:56px 56px;-webkit-mask-image:radial-gradient(ellipse 80% 90% at 30% 45%,#000 20%,transparent 80%)}
    .glow{position:absolute;inset:-20%;background:radial-gradient(38% 38% at 24% 38%,rgba(34,87,189,.55),transparent 72%),radial-gradient(22% 22% at 82% 72%,rgba(90,180,255,.22),transparent 72%);filter:blur(30px)}
    .copy{position:absolute;left:72px;top:64px;width:600px;height:502px;display:flex;flex-direction:column}
    .logo{width:190px;height:auto}
    h1{margin-top:auto;font-family:"Space Grotesk","WenQuanYi Zen Hei","Noto Sans CJK SC",sans-serif;font-size:${lang === 'zh' ? 60 : 62}px;line-height:1.08;letter-spacing:${lang === 'zh' ? 0 : -0.03}em;font-weight:700}
    h1 em{font-style:normal;color:${SKY}}
    p{margin-top:22px;font-size:25px;line-height:1.4;color:#c3cde3}
    .rule{margin-top:30px;width:110px;height:4px;background:${SKY};border-radius:4px}
    .photo{position:absolute;right:72px;top:64px;width:400px;height:502px;border-radius:28px;overflow:hidden;box-shadow:0 30px 60px rgba(0,0,0,.5)}
    .photo img{width:100%;height:100%;object-fit:cover;object-position:80% center}
    .frame{position:absolute;right:52px;top:84px;width:400px;height:502px;border:2px solid ${SKY};border-radius:28px}
  </style><body><div class="glow"></div><div class="grid"></div>
    <div class="frame"></div>
    <div class="photo"><img src="${pathToFileURL(path.join(SRC, 'img/portada.jpg'))}" alt=""></div>
    <div class="copy">
      <img class="logo" src="${pathToFileURL(path.join(SRC, 'img/logo-lcc-blanco.png'))}" alt="">
      <h1>${slogans[lang].title}</h1>
      <p>${slogans[lang].sub}</p>
      <div class="rule"></div>
    </div>
  </body></html>`;
};

/** Empaqueta PNG en un .ico (formato de entradas PNG, válido desde Windows Vista). */
function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = 6 + pngs.length * 16;
  const entries = pngs.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

const staticDir = path.join(SRC, 'static');
const iconsDir = path.join(staticDir, 'assets/icons');
fs.mkdirSync(iconsDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();

async function renderMark(size, options) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0;background:transparent">${markSvg(size, options)}</body>`);
  return page.screenshot({ omitBackground: !options?.bleed, clip: { x: 0, y: 0, width: size, height: size } });
}

fs.writeFileSync(path.join(staticDir, 'favicon.svg'), markSvg(64).trim() + '\n');
fs.writeFileSync(path.join(iconsDir, 'icon-192.png'), await renderMark(192));
fs.writeFileSync(path.join(iconsDir, 'icon-512.png'), await renderMark(512));
// "Maskable": a sangre y con la L dentro de la zona segura (80 %)
await page.setViewportSize({ width: 512, height: 512 });
await page.setContent(
  `<body style="margin:0;background:${NAVY}"><svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 64 64"><rect width="64" height="64" fill="${NAVY}"/><g transform="translate(9.6 9.6) scale(.7)"><path d="M21 14h11v26h16v10H21z" fill="${SKY}"/></g></svg></body>`
);
fs.writeFileSync(path.join(iconsDir, 'icon-512-maskable.png'), await page.screenshot({ clip: { x: 0, y: 0, width: 512, height: 512 } }));
fs.writeFileSync(path.join(staticDir, 'apple-touch-icon.png'), await renderMark(180, { bleed: true }));
const icoImages = [];
for (const size of [16, 32, 48]) icoImages.push({ size, data: await renderMark(size) });
fs.writeFileSync(path.join(staticDir, 'favicon.ico'), buildIco(icoImages));

// La plantilla se carga desde un archivo temporal: así Chromium permite leer las imágenes y fuentes locales
await page.setViewportSize({ width: 1200, height: 630 });
const tempFile = path.join(os.tmpdir(), 'lcc-og-template.html');
for (const lang of Object.keys(slogans)) {
  fs.writeFileSync(tempFile, ogHtml(lang));
  await page.goto(pathToFileURL(tempFile).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  fs.writeFileSync(path.join(SRC, 'img', `og-${lang}.jpg`), await page.screenshot({ type: 'jpeg', quality: 86 }));
}

await browser.close();
console.log('✔ Recursos gráficos generados en src/static y src/img');
