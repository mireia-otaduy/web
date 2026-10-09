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

/** Pide un fotograma de scroll fuera de un evento de scroll (lo asigna startScrollLoop en 20-scroll.js). */
let kickScroll = () => {};

/** Ratón u otro puntero preciso (no táctil): solo en él tienen sentido las inclinaciones, el cursor y los imanes. */
const hasFinePointer = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/** Ejecuta una tarea cuando el navegador está libre, para no competir con el primer pintado. */
function whenIdle(task, timeout = 1800) {
  const run = () => {
    try {
      task();
    } catch (error) {
      console.error('[LCC] Error en una tarea diferida:', error);
    }
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout });
  else window.setTimeout(run, 400);
}

/** Añade una clase (por defecto is-in) a cada elemento la primera vez que entra en pantalla. */
function watchIn(elements, { className = 'is-in', margin = '0px 0px -8% 0px' } = {}) {
  const list = Array.from(elements);
  if (list.length === 0) return;
  if (!('IntersectionObserver' in window)) {
    list.forEach((element) => element.classList.add(className));
    return;
  }
  const pending = new Set(list);
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add(className);
        pending.delete(entry.target);
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: margin, threshold: 0.01 }
  );
  list.forEach((element) => observer.observe(element));

  // Al llegar al final de la página, lo que quede en la ventana aparece aunque esté en el margen inferior excluido
  scrollTasks.push((y, viewport) => {
    if (pending.size === 0 || y + viewport < root.scrollHeight - 4) return;
    for (const element of Array.from(pending)) {
      if (element.getBoundingClientRect().top >= viewport) continue;
      element.classList.add(className);
      pending.delete(element);
      observer.unobserve(element);
    }
  });
}
