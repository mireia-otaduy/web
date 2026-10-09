/* ==========================================================================
   30 · CARRIL DE TECNOLOGÍAS (sección fija con desplazamiento lateral)
   En pantallas anchas la sección se hace tan alta como el recorrido lateral
   de la fila y se queda "pegada" (position: sticky) mientras se baja; el
   progreso del scroll mueve la fila hacia la izquierda.
   En tablet, móvil o con movimiento reducido queda la fila deslizable a mano
   que define 10-home.css. Estilos: .rail.is-pinned en 10-home.css.
   ========================================================================== */

function initRail() {
  const rail = $('[data-rail]');
  if (!rail) return;

  const viewport = $('[data-rail-viewport]', rail);
  const track = $('[data-rail-track]', rail);
  const header = $('.site-header');
  const wide = window.matchMedia('(min-width: 1001px)');

  let pinned = false;
  let travel = 0;
  let start = 0;

  const unpin = () => {
    pinned = false;
    rail.classList.remove('is-pinned');
    rail.style.removeProperty('--rail-h');
    rail.style.removeProperty('--rail-x');
    rail.style.removeProperty('--rail-p');
    viewport.setAttribute('tabindex', '0');
  };

  const measure = () => {
    if (!wide.matches || prefersReducedMotion()) {
      if (pinned) unpin();
      return;
    }

    if (!pinned) {
      pinned = true;
      rail.classList.add('is-pinned');
      // En modo fijo la fila no se desplaza con el dedo: ya no necesita foco de teclado
      viewport.removeAttribute('tabindex');
    }

    const headerHeight = header ? header.offsetHeight : 0;
    const stickyHeight = window.innerHeight - headerHeight;
    travel = Math.max(0, track.scrollWidth - viewport.clientWidth);
    start = rail.getBoundingClientRect().top + window.scrollY - headerHeight;
    rail.style.setProperty('--rail-h', `${Math.round(travel + stickyHeight)}px`);
    update(window.scrollY);
  };

  const update = (y) => {
    if (!pinned) return;
    const progress = travel > 0 ? clamp((y - start) / travel, 0, 1) : 0;
    rail.style.setProperty('--rail-x', `${(-progress * travel).toFixed(1)}px`);
    rail.style.setProperty('--rail-p', progress.toFixed(4));
  };

  scrollTasks.push((y) => update(y));

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(measure, 120);
  });
  window.addEventListener('load', measure);
  wide.addEventListener('change', measure);
  motionQuery.addEventListener('change', measure);
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(measure);

  // Si cambia la altura del contenido de encima (fuentes, imágenes, traducciones largas), se recalcula el punto de inicio
  if ('ResizeObserver' in window) {
    let frame = 0;
    new ResizeObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    }).observe(doc.body);
  }

  measure();
}
