#!/usr/bin/env node
/**
 * Verificador estático del sitio generado (/public). No necesita dependencias.
 *
 * Comprueba, para cada página y cada idioma:
 *   - que no queden marcas de plantilla sin resolver ({{…}} o ⟦…⟧)
 *   - identificadores (id) únicos y enlaces internos, imágenes, CSS y JS existentes
 *   - que cada ancla (#algo) apunte a un id real de la página de destino
 *   - <html lang>, <title>, descripción, canonical y alternativas hreflang recíprocas
 *   - imágenes con alt, width y height; enlaces externos con rel="noopener"
 *   - ausencia de estilos en línea (los bloquea la política CSP) y de scripts no autorizados
 *   - que el sitemap solo liste archivos que existen
 *   - textos sin traducir (idénticos al español) en inglés y chino
 *
 * Uso:  node tools/check.mjs        (sale con código 1 si encuentra errores)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const SRC = path.join(ROOT, 'src');
const site = JSON.parse(fs.readFileSync(path.join(SRC, 'site.json'), 'utf8'));

const errors = [];
const warnings = [];
const fail = (page, message) => errors.push(`${page}: ${message}`);

/* ---------- Utilidades ---------- */

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const htmlFiles = walk(PUBLIC).filter((file) => file.endsWith('.html'));
const htmlCache = new Map(htmlFiles.map((file) => [file, fs.readFileSync(file, 'utf8')]));
const idsOf = (html) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
const rel = (file) => path.relative(PUBLIC, file);

/* ---------- Comprobaciones por página ---------- */

for (const file of htmlFiles) {
  const html = htmlCache.get(file);
  const name = rel(file);
  const isNotFound = name === '404.html';

  if (/\{\{|⟦/.test(html)) fail(name, 'quedan marcas de plantilla sin resolver');

  // Estructura básica
  const lang = html.match(/<html lang="([^"]+)"/)?.[1];
  if (!lang) fail(name, 'falta <html lang>');
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1];
  if (!title) fail(name, 'falta <title>');
  else if (title.length > 70) warnings.push(`${name}: <title> largo (${title.length} caracteres)`);
  const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1];
  if (!description) fail(name, 'falta meta description');
  else if (description.length > 170) warnings.push(`${name}: meta description larga (${description.length} caracteres)`);
  if (!/<link rel="canonical" href="https:\/\/[^"]+"/.test(html)) fail(name, 'falta canonical absoluta');
  if (!/<h1[\s>]/.test(html)) fail(name, 'falta <h1>');
  if ((html.match(/<h1[\s>]/g) ?? []).length > 1) fail(name, 'hay más de un <h1>');

  // Identificadores únicos
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  for (const id of new Set(ids.filter((item, index) => ids.indexOf(item) !== index))) fail(name, `id duplicado: ${id}`);

  // Estilos en línea y scripts (CSP: style-src 'self', script-src con hash)
  if (/\sstyle="/.test(html)) fail(name, 'hay atributos style="" (los bloquearía la CSP)');
  const inlineScripts = [...html.matchAll(/<script(?![^>]*\ssrc=)([^>]*)>([\s\S]*?)<\/script>/g)];
  for (const [, attrs, body] of inlineScripts) {
    if (/application\/(ld\+)?json/.test(attrs)) continue;
    const expected = "document.documentElement.classList.add('js')";
    if (body !== expected) fail(name, 'script en línea no autorizado por la CSP');
  }

  // Datos estructurados: deben ser JSON válido con las entidades esperadas
  for (const [, json] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(json);
      const types = (data['@graph'] ?? []).map((node) => node['@type']);
      for (const needed of ['Organization', 'WebSite']) if (!types.includes(needed)) fail(name, `JSON-LD sin ${needed}`);
    } catch {
      fail(name, 'JSON-LD no es JSON válido');
    }
  }
  if (!isNotFound && !/application\/ld\+json/.test(html)) fail(name, 'faltan datos estructurados JSON-LD');

  // Imágenes
  for (const [tag] of html.matchAll(/<img\b[^>]*>/g)) {
    if (!/\salt="/.test(tag)) fail(name, `imagen sin alt: ${tag.slice(0, 80)}`);
    if (!/\swidth="\d+"/.test(tag) || !/\sheight="\d+"/.test(tag)) fail(name, `imagen sin width/height: ${tag.slice(0, 80)}`);
  }

  // Enlaces y recursos
  for (const [, attr, value] of html.matchAll(/\s(href|src)="([^"]*)"/g)) {
    if (/^(https?:|mailto:|tel:|data:|javascript:)/.test(value)) continue;
    if (value === '' || value === '#') {
      if (attr === 'href') fail(name, 'enlace vacío');
      continue;
    }
    const [target, fragment] = value.split('#');
    const targetPath = target.split('?')[0];

    let targetFile;
    if (targetPath === '') targetFile = file;
    else if (targetPath.startsWith('/')) targetFile = path.join(PUBLIC, targetPath);
    else targetFile = path.resolve(path.dirname(file), targetPath);
    if (targetFile.endsWith(path.sep) || (fs.existsSync(targetFile) && fs.statSync(targetFile).isDirectory())) {
      targetFile = path.join(targetFile, 'index.html');
    }

    if (!fs.existsSync(targetFile)) {
      fail(name, `${attr}="${value}" apunta a un archivo inexistente`);
      continue;
    }
    if (fragment) {
      const targetHtml = htmlCache.get(targetFile);
      if (targetHtml && !idsOf(targetHtml).has(fragment)) fail(name, `ancla #${fragment} inexistente en ${rel(targetFile)}`);
    }
  }

  // srcset: cada archivo listado debe existir
  for (const [, set] of html.matchAll(/\ssrcset="([^"]*)"/g)) {
    for (const entry of set.split(',')) {
      const url = entry.trim().split(/\s+/)[0];
      const resolved = url.startsWith('/') ? path.join(PUBLIC, url) : path.resolve(path.dirname(file), url);
      if (url && !fs.existsSync(resolved)) fail(name, `srcset apunta a un archivo inexistente: ${url}`);
    }
  }

  // Enlaces externos
  for (const [tag] of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) {
    if (!/rel="[^"]*noopener/.test(tag)) fail(name, 'enlace target="_blank" sin rel="noopener"');
  }

  // Alternativas de idioma recíprocas
  if (!isNotFound) {
    const alternates = [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)];
    const expected = Object.keys(site.languages).length + 1;
    if (alternates.length !== expected) fail(name, `hreflang: se esperaban ${expected} alternativas y hay ${alternates.length}`);
    for (const [, , href] of alternates) {
      const local = href.replace(site.url, '');
      const candidate = path.join(PUBLIC, local.endsWith('/') ? `${local}index.html` : local);
      if (!fs.existsSync(candidate)) fail(name, `hreflang apunta a una página inexistente: ${href}`);
    }
  }
}

/* ---------- Sitemap, robots y manifiesto ---------- */

const sitemap = fs.readFileSync(path.join(PUBLIC, 'sitemap.xml'), 'utf8');
for (const [, loc] of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
  const local = loc.replace(site.url, '');
  const candidate = path.join(PUBLIC, local.endsWith('/') ? `${local}index.html` : local);
  if (!fs.existsSync(candidate)) fail('sitemap.xml', `URL sin archivo: ${loc}`);
}

for (const file of ['robots.txt', 'site.webmanifest', 'favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'assets/icons/icon-512-maskable.png']) {
  if (!fs.existsSync(path.join(PUBLIC, file))) fail(file, 'archivo obligatorio ausente');
}
for (const lang of Object.keys(site.languages)) {
  if (!fs.existsSync(path.join(PUBLIC, `assets/img/og-${lang}.jpg`))) fail(`og-${lang}.jpg`, 'falta la imagen para redes sociales');
}

/* ---------- Política CSP: el hash debe coincidir con el script de arranque ---------- */

const firebase = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8'));
const csp = firebase.hosting.headers.flatMap((rule) => rule.headers).find((header) => header.key === 'Content-Security-Policy')?.value ?? '';
const bootHash = crypto.createHash('sha256').update("document.documentElement.classList.add('js')").digest('base64');
if (!csp.includes(`'sha256-${bootHash}'`)) fail('firebase.json', 'el hash CSP no coincide con el script de arranque (ejecuta el build)');

/* ---------- Textos sin traducir ---------- */

function flatten(obj, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') flatten(value, full, out);
    else out[full] = String(value);
  }
  return out;
}

function loadLang(lang) {
  const dir = path.join(SRC, 'i18n', lang);
  const data = {};
  for (const file of fs.readdirSync(dir)) {
    if (file.endsWith('.json')) data[file.replace('.json', '')] = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  }
  return flatten(data);
}

const base = loadLang(site.defaultLang);
for (const lang of Object.keys(site.languages)) {
  if (lang === site.defaultLang) continue;
  const other = loadLang(lang);
  for (const [key, value] of Object.entries(base)) {
    const plain = value.replace(/<[^>]*>/g, '').trim();
    if (plain.length >= 25 && other[key] === value && !/^(https?:|\{\{)/.test(plain)) warnings.push(`[${lang}] texto idéntico al español (¿sin traducir?): ${key}`);
  }
}

/* ---------- Resultado ---------- */

for (const warning of warnings) console.warn(`⚠ ${warning}`);
if (errors.length > 0) {
  for (const error of errors) console.error(`✖ ${error}`);
  console.error(`\n${errors.length} error(es) en ${htmlFiles.length} páginas.`);
  process.exit(1);
}
console.log(`✔ ${htmlFiles.length} páginas verificadas sin errores${warnings.length ? ` (${warnings.length} avisos)` : ''}`);
