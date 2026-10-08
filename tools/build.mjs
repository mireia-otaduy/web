#!/usr/bin/env node
/**
 * Build de LCC Manufacturing.
 *
 * Lee las plantillas, los textos (ES/EN/ZH) y los recursos de /src y genera el sitio
 * estático completo en /public, listo para publicar en Firebase Hosting:
 *
 *   public/            → español (idioma por defecto)
 *   public/en/         → inglés
 *   public/zh/         → chino simplificado
 *   public/assets/     → CSS, JS, imágenes y tipografías compartidas
 *
 * Uso:  node tools/build.mjs      (sin dependencias: solo Node 20 o superior)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { render, BuildError, escapeAttr, stripTags } from './lib/engine.mjs';
import { imageSize, loadIcons, buildSprite } from './lib/media.mjs';
import {
  pageUrl,
  pageOutputPath,
  alternateLinks,
  buildSitemap,
  buildRobots,
  buildManifest,
  buildJsonLd
} from './lib/seo.mjs';

/** esbuild es opcional: si está instalado (npm install) se minifican el CSS y el JS. */
let esbuild = null;
try {
  esbuild = await import('esbuild');
} catch {
  /* sin esbuild el sitio se genera igualmente, pero sin minificar */
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'public');

/** Iconos que el JavaScript necesita en cualquier página (visor de imágenes, etc.). */
const ALWAYS_ICONS = ['arrow-left', 'arrow-right', 'x'];

/** Script mínimo que marca la página como "con JavaScript" antes del primer pintado. */
const BOOT_SCRIPT = "document.documentElement.classList.add('js')";

const errors = [];
const warnings = [];
const fail = (message) => {
  errors.push(message);
  return `⟦${message}⟧`;
};

/* ---------------------------------------------------------------------------
   1. Carga de datos
   --------------------------------------------------------------------------- */

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new BuildError(`JSON no válido en ${path.relative(ROOT, file)}: ${error.message}`);
  }
};

/** Carga src/i18n/<idioma>/*.json; cada archivo es un espacio de nombres (home.json → "home.*"). */
function loadNamespaces(dir) {
  const out = {};
  for (const file of fs.readdirSync(dir).sort()) {
    if (file.endsWith('.json')) out[file.replace(/\.json$/, '')] = readJson(path.join(dir, file));
  }
  return out;
}

const site = readJson(path.join(SRC, 'site.json'));
const langs = Object.keys(site.languages);
const i18n = Object.fromEntries(langs.map((lang) => [lang, loadNamespaces(path.join(SRC, 'i18n', lang))]));
const icons = loadIcons(path.join(SRC, 'icons'));

/** Aplana un objeto anidado a { "a.b.c": "texto" }. */
function flatten(obj, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') flatten(value, full, out);
    else out[full] = value;
  }
  return out;
}

const flat = Object.fromEntries(langs.map((lang) => [lang, flatten(i18n[lang])]));

/** Todos los idiomas deben tener exactamente las mismas claves que el idioma por defecto. */
function checkTranslationParity() {
  const base = flat[site.defaultLang];
  for (const lang of langs) {
    if (lang === site.defaultLang) continue;
    for (const key of Object.keys(base)) {
      if (!(key in flat[lang]) || String(flat[lang][key]).trim() === '') errors.push(`[${lang}] falta la traducción de "${key}"`);
    }
    for (const key of Object.keys(flat[lang])) {
      if (!(key in base)) errors.push(`[${lang}] la clave "${key}" no existe en ${site.defaultLang}.json`);
    }
  }
}

/* ---------------------------------------------------------------------------
   2. Recursos: CSS, JS, imágenes, tipografías e iconos
   --------------------------------------------------------------------------- */

const hash = (content) => crypto.createHash('sha1').update(content).digest('hex').slice(0, 10);

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(source, target);
    else fs.copyFileSync(source, target);
  }
}

const listFiles = (dir, ext) =>
  fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(ext))
    .sort();

/** Hoja específica de cada plantilla (el resto de archivos, 00-09, es común a todas las páginas). */
const PAGE_STYLES = {
  index: '10-home',
  technologies: '11-technologies',
  process: '12-process',
  contact: '13-contact',
  legal: '14-legal',
  privacy: '14-legal',
  404: '14-legal'
};

function minifyCss(css) {
  if (!esbuild) return css;
  const result = esbuild.transformSync(css, { loader: 'css', minify: true, legalComments: 'none', logLevel: 'silent' });
  return result.code;
}

function writeCss(name, parts, banner) {
  const source = parts.join('\n\n');
  const css = esbuild ? `${banner}\n${minifyCss(source)}` : `${banner}\n\n${source}`;
  const file = `${name}.${hash(css)}.css`;
  fs.mkdirSync(path.join(OUT, 'assets/css'), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'assets/css', file), css);
  return `assets/css/${file}`;
}

/**
 * Genera una hoja común (00-09) y una hoja por página (10-14), con huella en el nombre.
 * Así cada página descarga solo el CSS que usa.
 */
function bundleCss() {
  const dir = path.join(SRC, 'css');
  const files = listFiles(dir, '.css');
  const read = (file) => fs.readFileSync(path.join(dir, file), 'utf8').trim();

  const common = files.filter((file) => /^0\d-/.test(file));
  const banner = '/* LCC Manufacturing · hoja de estilos generada por tools/build.mjs · el código fuente comentado está en src/css */';
  const result = { common: writeCss('site', common.map(read), banner), pages: {} };

  for (const prefix of new Set(Object.values(PAGE_STYLES))) {
    const file = files.find((name) => name.startsWith(`${prefix}.`));
    if (!file) throw new BuildError(`Falta la hoja de estilos src/css/${prefix}.css`);
    result.pages[prefix] = writeCss(prefix.replace(/^\d+-/, 'page-'), [read(file)], banner);
  }
  return result;
}

/** Une los JS de src/js dentro de una única función autoejecutable. */
function bundleJs() {
  const dir = path.join(SRC, 'js');
  const parts = listFiles(dir, '.js').map((file) => fs.readFileSync(path.join(dir, file), 'utf8').trim());
  const banner = '/* LCC Manufacturing · script generado por tools/build.mjs · el código fuente comentado está en src/js */';
  const source = `(() => {\n'use strict';\n\n${parts.join('\n\n')}\n})();\n`;
  const js = esbuild
    ? `${banner}\n${esbuild.transformSync(source, { minify: true, target: 'es2020', legalComments: 'none' }).code}`
    : `${banner}\n${source}`;
  const name = `site.${hash(js)}.js`;
  fs.mkdirSync(path.join(OUT, 'assets/js'), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'assets/js', name), js);
  return `assets/js/${name}`;
}

/* ---------------------------------------------------------------------------
   3. Contexto de render de cada página
   --------------------------------------------------------------------------- */

const partialCache = new Map();
function loadPartial(name) {
  if (!partialCache.has(name)) {
    const file = path.join(SRC, 'templates/partials', `${name}.html`);
    partialCache.set(name, fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : fail(`parcial inexistente: ${name}`));
  }
  return partialCache.get(name);
}

const usedKeys = new Set();
const usedImages = new Set();

/** Genera el HTML del selector de idioma (menú desplegable con enlaces a la misma página). */
function buildLangSwitch(lang, pageKey, ctx) {
  const items = langs
    .map((target) => {
      const meta = site.languages[target];
      const href = crossLangHref(lang, target, pageKey, ctx.absolute);
      const current = target === lang ? ' aria-current="true"' : '';
      return `<li><a href="${href}" hreflang="${meta.hreflang}" lang="${meta.htmlLang}"${current}>${meta.native}</a></li>`;
    })
    .join('');
  const label = stripTags(flat[lang]['common.lang.label']);
  usedKeys.add('common.lang.label');
  return (
    `<details class="lang" data-lang-menu>` +
    `<summary class="lang__button">${ctx.icon('globe')}<span class="lang__code">${site.languages[lang].code}</span><span class="sr-only"> – ${escapeAttr(label)}</span>${ctx.icon('chevron-down', 'lang__chevron')}</summary>` +
    `<ul class="lang__list">${items}</ul></details>`
  );
}

/** URL relativa (o absoluta en la 404) desde una página en `from` hacia la misma página en `to`. */
function crossLangHref(from, to, pageKey, absolute) {
  const file = site.pages[pageKey].files[to];
  const toDir = site.languages[to].dir;
  if (absolute) return `/${toDir}${file}`;
  const fromDir = site.languages[from].dir;
  if (fromDir === toDir) return file;
  return `${fromDir ? '../' : ''}${toDir}${file}`;
}

const imageFiles = new Set(fs.readdirSync(path.join(SRC, 'img')));
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Busca las variantes de una imagen: nombre-800.jpg (más pequeña) y su equivalente .webp.
 * Devuelve las fuentes ordenadas por ancho, incluida la imagen original.
 */
function imageSources(file, fullWidth) {
  const ext = path.extname(file);
  const base = path.basename(file, ext);
  const variants = [...imageFiles]
    .map((name) => name.match(new RegExp(`^${escapeRegExp(base)}-(\\d+)${escapeRegExp(ext)}$`)))
    .filter(Boolean)
    .map((match) => ({ name: match[0], w: Number(match[1]) }));
  const originals = [...variants, { name: file, w: fullWidth }].sort((a, b) => a.w - b.w);
  const webp = originals
    .map(({ name, w }) => ({ name: name.replace(new RegExp(`${escapeRegExp(ext)}$`), '.webp'), w }))
    .filter(({ name }) => imageFiles.has(name));
  // Si falta algún .webp de la serie se omite <picture> para no mezclar anchos
  return { sources: originals, webp: webp.length === originals.length ? webp : [] };
}

function makeContext({ lang, pageKey, absolute = false, template }) {
  const langMeta = site.languages[lang];
  const root = absolute ? '/' : langMeta.dir ? '../' : '';
  const usedIcons = new Set();

  const ctx = {
    absolute,
    usedIcons,
    vars: {},

    t(key) {
      usedKeys.add(key);
      const value = flat[lang][key];
      return value === undefined ? fail(`[${lang}/${template}] falta la clave "${key}"`) : String(value);
    },
    tryT(key) {
      const value = flat[lang][key];
      if (value !== undefined) usedKeys.add(key);
      return value === undefined ? '' : String(value);
    },
    site(dotted) {
      const value = dotted.split('.').reduce((acc, part) => (acc == null ? acc : acc[part]), site);
      return value === undefined ? fail(`[${lang}/${template}] dato inexistente en site.json: ${dotted}`) : String(value);
    },
    trySite(dotted) {
      const value = dotted.split('.').reduce((acc, part) => (acc == null ? acc : acc[part]), site);
      return value === undefined || value === null ? '' : String(value);
    },
    partial: loadPartial,

    link(target) {
      if (!site.pages[target]) return fail(`[${lang}/${template}] enlace a una página inexistente: ${target}`);
      return `${absolute ? `/${langMeta.dir}` : ''}${site.pages[target].files[lang]}`;
    },
    asset(file) {
      return `${root}assets/${file}`;
    },
    icon(name, cls = '') {
      if (!icons[name]) return fail(`[${lang}/${template}] icono inexistente: ${name}`);
      usedIcons.add(name);
      const classes = ['icon', cls].filter(Boolean).join(' ');
      return `<svg class="${classes}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;
    },
    img(file, { flags, opts }) {
      const source = path.join(SRC, 'img', file);
      if (!fs.existsSync(source)) return fail(`[${lang}/${template}] imagen inexistente: ${file}`);
      usedImages.add(file);
      const { width, height } = imageSize(source);
      let alt;
      if (opts.alt) alt = escapeAttr(stripTags(ctx.t(opts.alt)));
      else if (opts.alts) alt = ctx.site(opts.alts);
      else if (flags.has('decorative')) alt = '';
      else return fail(`[${lang}/${template}] la imagen ${file} necesita alt=clave, alts=ruta o la opción decorative`);

      // Variantes: portada-800.jpg se enlaza con srcset; el .webp (si existe) se ofrece con <picture>
      const { sources: srcset, webp } = imageSources(file, width);
      for (const { name } of [...srcset, ...webp]) usedImages.add(name);
      const attrs = [`src="${ctx.asset(`img/${file}`)}"`];
      const sizes = opts.sizes ? ` sizes="${escapeAttr(opts.sizes)}"` : '';
      const toSrcset = (list) => list.map(({ name, w }) => `${ctx.asset(`img/${name}`)} ${w}w`).join(', ');
      if (srcset.length > 1) attrs.push(`srcset="${toSrcset(srcset)}"`, ...(sizes ? [sizes.trim()] : []));
      attrs.push(`alt="${alt}"`, `width="${width}"`, `height="${height}"`);
      if (opts.class) attrs.push(`class="${opts.class}"`);
      if (flags.has('eager')) attrs.push('fetchpriority="high"');
      else attrs.push('loading="lazy"', 'decoding="async"');
      const tag = `<img ${attrs.join(' ')}>`;
      if (webp.length === 0) return tag;
      const webpSet = webp.length > 1 ? toSrcset(webp) : ctx.asset(`img/${webp[0].name}`);
      return `<picture><source type="image/webp" srcset="${webpSet}"${webp.length > 1 ? sizes : ''}>${tag}</picture>`;
    }
  };
  return ctx;
}

/** Separa los bloques {{#define nombre}}…{{/define}} del contenido principal de una página. */
function splitSlots(source) {
  const slots = {};
  const content = source.replace(/\{\{#define\s+([\w-]+)\}\}([\s\S]*?)\{\{\/define\}\}/g, (_, name, body) => {
    slots[name] = body.trim();
    return '';
  });
  return { slots, content };
}

/* ---------------------------------------------------------------------------
   4. Render de páginas
   --------------------------------------------------------------------------- */

function renderPage({ lang, pageKey, assets, special }) {
  const absolute = Boolean(special);
  const template = special ?? site.pages[pageKey].template;
  const templateFile = path.join(SRC, 'templates/pages', `${template}.html`);
  const ctx = makeContext({ lang, pageKey, absolute, template });
  const langMeta = site.languages[lang];
  const metaKey = special ?? pageKey;

  const title = ctx.t(`meta.${metaKey}.title`);
  const description = ctx.t(`meta.${metaKey}.description`);
  const url = special ? `${site.url}/` : pageUrl(site, lang, pageKey);
  const ogImage = `${site.url}/assets/img/og-${lang}.jpg`;
  const root = absolute ? '/' : langMeta.dir ? '../' : '';

  Object.assign(ctx.vars, {
    lang,
    page: pageKey ?? special,
    htmlLang: langMeta.htmlLang,
    ogLocale: langMeta.ogLocale,
    ogLocaleAlternates: langs
      .filter((other) => other !== lang)
      .map((other) => `<meta property="og:locale:alternate" content="${site.languages[other].ogLocale}">`)
      .join('\n  '),
    root,
    title: escapeAttr(stripTags(title)),
    description: escapeAttr(stripTags(description)),
    canonical: url,
    alternates: special ? '' : alternateLinks(site, pageKey),
    robots: special ? '<meta name="robots" content="noindex">' : '',
    ogImage,
    ogImageAlt: escapeAttr(stripTags(ctx.t('meta.ogImageAlt'))),
    styles: [assets.css.common, assets.css.pages[PAGE_STYLES[template]]]
      .map((file) => `<link rel="stylesheet" href="${root}${file}">`)
      .join('\n  '),
    js: `${root}${assets.js}`,
    year: String(new Date().getFullYear()),
    siteName: escapeAttr(site.name),
    themeColor: site.themeColor,
    bootScript: BOOT_SCRIPT,
    jsonld: special ? '' : `<script type="application/ld+json">${buildJsonLd(site, lang, pageKey, { title: stripTags(title), description: stripTags(description) })}</script>`,
    jsStrings: JSON.stringify(i18n[lang].js ?? {}).replace(/</g, '\\u003c'),
    formConfig: JSON.stringify({
      projectId: site.firebase.projectId,
      apiKey: site.firebase.apiKey,
      collection: site.firebase.collection,
      email: site.email,
      lang
    }).replace(/</g, '\\u003c'),
    langSwitch: '',
    'slot-head': '',
    'slot-bodyClass': '',
    content: ''
  });
  ctx.vars.langSwitch = buildLangSwitch(lang, pageKey ?? 'home', ctx);

  // La página 404 es única para todo el sitio, así que lleva su mensaje en los tres idiomas.
  if (special === '404') {
    for (const other of langs) {
      for (const part of ['title', 'text', 'home']) {
        ctx.vars[`nf-${other}-${part}`] = escapeAttr(flat[other][`notfound.${part}`]);
        usedKeys.add(`notfound.${part}`);
      }
    }
  }

  if (!fs.existsSync(templateFile)) return fail(`plantilla inexistente: ${template}`);
  const { slots, content } = splitSlots(fs.readFileSync(templateFile, 'utf8'));
  for (const [name, body] of Object.entries(slots)) ctx.vars[`slot-${name}`] = render(body, ctx);
  ctx.vars.content = render(content, ctx);

  let html = render(fs.readFileSync(path.join(SRC, 'templates/layout.html'), 'utf8'), ctx);
  for (const name of ALWAYS_ICONS) ctx.usedIcons.add(name);
  html = html.replace('<!--@sprite-->', buildSprite(icons, ctx.usedIcons));
  html = html.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  return html;
}

/* ---------------------------------------------------------------------------
   5. Archivos generados (sitemap, robots, manifiesto) y política CSP
   --------------------------------------------------------------------------- */

function write(relative, content) {
  const target = path.join(OUT, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

/** Mantiene en firebase.json el hash SHA-256 del script de arranque (política CSP). */
function syncCspHash() {
  const file = path.join(ROOT, 'firebase.json');
  if (!fs.existsSync(file)) return;
  const digest = crypto.createHash('sha256').update(BOOT_SCRIPT).digest('base64');
  const current = fs.readFileSync(file, 'utf8');
  const updated = current.replace(/'sha256-[^']*'/, `'sha256-${digest}'`);
  if (updated !== current) {
    fs.writeFileSync(file, updated);
    console.log('· firebase.json: hash CSP actualizado');
  }
}

/* ---------------------------------------------------------------------------
   6. Ejecución
   --------------------------------------------------------------------------- */

function main() {
  const started = Date.now();
  checkTranslationParity();

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  copyDir(path.join(SRC, 'fonts'), path.join(OUT, 'assets/fonts'));
  copyDir(path.join(SRC, 'img'), path.join(OUT, 'assets/img'));
  if (fs.existsSync(path.join(SRC, 'static'))) copyDir(path.join(SRC, 'static'), OUT);

  const assets = { css: bundleCss(), js: bundleJs() };

  for (const lang of langs) {
    for (const pageKey of Object.keys(site.pages)) {
      write(pageOutputPath(site, lang, pageKey), renderPage({ lang, pageKey, assets }));
    }
  }
  write('404.html', renderPage({ lang: site.defaultLang, pageKey: null, assets, special: '404' }));

  write('sitemap.xml', buildSitemap(site));
  write('robots.txt', buildRobots(site));
  write('site.webmanifest', buildManifest(site, flat[site.defaultLang]['meta.home.description']));
  syncCspHash();

  // Avisos: textos o imágenes que ya nadie usa (conviene eliminarlos).
  // Claves que solo se pintan cuando hay datos (por ejemplo, los datos registrales opcionales)
  const conditionalKeys = new Set(['legal.owner.registry']);
  for (const key of Object.keys(flat[site.defaultLang])) {
    if (key.startsWith('js.') || key.startsWith('meta.') || conditionalKeys.has(key)) continue;
    if (!usedKeys.has(key)) warnings.push(`texto sin usar: "${key}"`);
  }
  for (const file of fs.readdirSync(path.join(SRC, 'img'))) {
    if (!usedImages.has(file) && !/^(og-|logo-)/.test(file)) warnings.push(`imagen sin usar: ${file}`);
  }

  for (const warning of warnings) console.warn(`⚠ ${warning}`);
  if (errors.length > 0) {
    for (const error of [...new Set(errors)]) console.error(`✖ ${error}`);
    console.error(`\nBuild con ${new Set(errors).size} error(es).`);
    process.exit(1);
  }
  const pages = langs.length * Object.keys(site.pages).length + 1;
  console.log(`✔ ${pages} páginas generadas en public/ (${Date.now() - started} ms)`);
}

try {
  main();
} catch (error) {
  if (error instanceof BuildError) {
    console.error(`✖ ${error.message}`);
    process.exit(1);
  }
  throw error;
}
