/* ==========================================================================
   00 · NÚCLEO
   Utilidades compartidas por el resto de módulos. El build concatena todos los
   archivos de src/js (en orden alfabético) dentro de una única función, así que
   lo declarado aquí está disponible en los demás.

   Principio de diseño: mejora progresiva. La web funciona sin JavaScript;
   este código solo añade animaciones, el visor de imágenes y el envío del formulario.
   ========================================================================== */

const doc = document;
const root = doc.documentElement;

/** Atajos de selección. */
const $ = (selector, scope = doc) => scope.querySelector(selector);
const $$ = (selector, scope = doc) => Array.from(scope.querySelectorAll(selector));

/** Idioma de la página ("es", "en" o "zh"). */
const lang = (root.lang || 'es').slice(0, 2).toLowerCase();

/** Preferencia del sistema: menos movimiento. Se consulta en cada uso por si cambia. */
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const prefersReducedMotion = () => motionQuery.matches;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Lee un bloque <script type="application/json" id="..."> de la página. */
function readJson(id) {
  const element = doc.getElementById(id);
  if (!element) return {};
  try {
    return JSON.parse(element.textContent);
  } catch {
    return {};
  }
}

/** Textos traducidos que el build incrusta en cada página (espacio de nombres "js"). */
const strings = readJson('i18n-data');

/** Devuelve un texto traducido por ruta ("form.errors.email"). */
function text(path, fallback = '') {
  const value = path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), strings);
  return value === undefined ? fallback : value;
}

/** Sustituye {marcadores} de una plantilla de texto. */
function fill(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, key) => (values[key] === undefined ? '' : values[key]));
}

/** Registro de tareas que se ejecutan en cada fotograma de scroll (ver 20-scroll.js). */
const scrollTasks = [];
