/**
 * Motor de plantillas de LCC Manufacturing.
 *
 * Es deliberadamente pequeño (sin dependencias) y solo ofrece lo que la web necesita:
 *
 *   {{!-- comentario --}}          Comentario de plantilla: no se publica.
 *   {{> nombre}}                   Incluye un parcial (src/templates/partials/nombre.html).
 *   {{#repeat N}}…{{@i}}…{{/repeat}}   Repite un bloque N veces ({{@i}} = 1..N, {{@i2}} = 01..N).
 *   {{#repeat N from K}}…              Igual, pero contando desde K.
 *   {{#if condición}}…{{else}}…{{/if}} Condicional (ver evalCondition).
 *   {{t:clave.anidada}}            Texto traducido (admite HTML).
 *   {{a:clave.anidada}}            Texto traducido, sin etiquetas y escapado para atributos.
 *   {{s:ruta.en.site}}             Dato de src/site.json.
 *   {{v:nombre}}                   Variable calculada por el build (idioma, rutas, SEO…).
 *   {{link:página}}                URL relativa de otra página en el idioma actual.
 *   {{asset:ruta}}                 URL relativa de un recurso en /assets.
 *   {{icon:nombre|class=x}}        Icono SVG (se enlaza con el sprite de la página).
 *   {{img:archivo.jpg|alt=clave|class=x|eager}}  Imagen con width/height reales.
 *       alt=clave      texto alternativo traducido (clave de i18n)
 *       alts=ruta      texto alternativo tomado de site.json (nombres propios, p. ej. clientes)
 *       decorative     imagen decorativa (alt vacío)
 */

export class BuildError extends Error {}

const TOKEN = /\{\{(t|a|s|v|link|asset|icon|img):([^{}]+?)\}\}/g;

/** Escapa texto para usarlo dentro de un atributo HTML entre comillas dobles. */
export function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Quita etiquetas HTML y deja texto plano. */
export function stripTags(value) {
  return String(value).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/** Lee `opciones|separadas|por|barras` en { first, flags:Set, opts:{k:v} }. */
function parseArgs(raw) {
  const [first, ...rest] = raw.split('|').map((part) => part.trim());
  const flags = new Set();
  const opts = {};
  for (const part of rest) {
    const eq = part.indexOf('=');
    if (eq === -1) flags.add(part);
    else opts[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return { first, flags, opts };
}

/**
 * Evalúa la condición de un {{#if}}.
 *   t:clave        → la traducción existe y no está vacía
 *   s:ruta         → el dato de site.json existe y no está vacío
 *   nombre=valor   → la variable del build es igual a valor (p. ej. page=home)
 *   nombre!=valor  → distinta
 */
function evalCondition(expression, ctx) {
  const cond = expression.trim();
  let match;
  if ((match = cond.match(/^t:(.+)$/))) return Boolean(ctx.tryT(match[1].trim()));
  if ((match = cond.match(/^s:(.+)$/))) return Boolean(ctx.trySite(match[1].trim()));
  if ((match = cond.match(/^([\w-]+)\s*(!?=)\s*(.+)$/))) {
    const actual = String(ctx.vars[match[1]] ?? '');
    const equal = actual === match[3].trim();
    return match[2] === '=' ? equal : !equal;
  }
  throw new BuildError(`Condición no válida en {{#if ${cond}}}`);
}

function processIfs(source, ctx) {
  // Se resuelven de dentro hacia fuera: el patrón no admite otro {{#if}} en el cuerpo.
  const innermost = /\{\{#if\s+([^{}]+?)\}\}((?:(?!\{\{#if)[\s\S])*?)\{\{\/if\}\}/;
  let out = source;
  for (let guard = 0; guard < 500; guard += 1) {
    const match = innermost.exec(out);
    if (!match) return out;
    const [whole, expression, body] = match;
    const [whenTrue, whenFalse = ''] = body.split('{{else}}');
    const chosen = evalCondition(expression, ctx) ? whenTrue : whenFalse;
    out = out.slice(0, match.index) + chosen + out.slice(match.index + whole.length);
  }
  throw new BuildError('Demasiados {{#if}} anidados o sin cerrar');
}

/** {{#repeat N}} repite N veces; {{#repeat N from K}} cuenta desde K en lugar de desde 1. */
function processRepeats(source) {
  return source.replace(/\{\{#repeat\s+(\d+)(?:\s+from\s+(\d+))?\}\}([\s\S]*?)\{\{\/repeat\}\}/g, (_, count, from, body) => {
    const total = Number(count);
    const start = from === undefined ? 1 : Number(from);
    let out = '';
    for (let i = start; i < start + total; i += 1) {
      out += body
        .replace(/\{\{@i2\}\}/g, String(i).padStart(2, '0'))
        .replace(/\{\{@i\}\}/g, String(i))
        .replace(/\{\{@n\}\}/g, String(total));
    }
    return out;
  });
}

function resolveToken(kind, rawArg, ctx) {
  const { first, flags, opts } = parseArgs(rawArg);
  switch (kind) {
    case 't':
      return render(ctx.t(first), ctx, 1);
    case 'a':
      return escapeAttr(stripTags(render(ctx.t(first), ctx, 1)));
    case 's':
      return escapeAttr(ctx.site(first));
    case 'v':
      if (!(first in ctx.vars)) throw new BuildError(`Variable de build desconocida: ${first}`);
      return String(ctx.vars[first]);
    case 'link':
      return ctx.link(first);
    case 'asset':
      return ctx.asset(first);
    case 'icon':
      return ctx.icon(first, opts.class);
    case 'img':
      return ctx.img(first, { flags, opts });
    default:
      throw new BuildError(`Token desconocido: ${kind}`);
  }
}

/**
 * Renderiza una plantilla completa.
 * `depth` > 0 se usa al resolver tokens dentro de textos traducidos (no repite parciales).
 */
export function render(source, ctx, depth = 0) {
  if (depth > 6) throw new BuildError('Plantilla recursiva: revisa los textos con {{…}} dentro de las traducciones');
  let out = source.replace(/\{\{!--[\s\S]*?--\}\}/g, '');

  if (depth === 0) {
    for (let guard = 0; guard < 12 && /\{\{>\s*[\w./-]+\s*\}\}/.test(out); guard += 1) {
      out = out.replace(/\{\{>\s*([\w./-]+)\s*\}\}/g, (_, name) => ctx.partial(name).replace(/\{\{!--[\s\S]*?--\}\}/g, ''));
    }
    out = processRepeats(out);
    out = processIfs(out, ctx);
  }

  return out.replace(TOKEN, (_, kind, arg) => resolveToken(kind, arg, ctx));
}
