/* ==========================================================================
   60 · FOCO DE LUZ SOBRE LAS TARJETAS
   Los elementos [data-spot] reciben la posición del cursor (--mx, --my) y su
   ::after (ver 04-components.css) dibuja un resplandor que lo sigue.
   Solo con puntero preciso (ratón); en pantallas táctiles no se activa.
   ========================================================================== */

function initSpotlight() {
  if (prefersReducedMotion() || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  let pending = null;
  let queued = false;

  doc.addEventListener(
    'pointermove',
    (event) => {
      const target = event.target instanceof Element ? event.target.closest('[data-spot]') : null;
      if (!target) return;
      pending = { target, x: event.clientX, y: event.clientY };
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        if (!pending) return;
        const rect = pending.target.getBoundingClientRect();
        pending.target.style.setProperty('--mx', `${(pending.x - rect.left).toFixed(0)}px`);
        pending.target.style.setProperty('--my', `${(pending.y - rect.top).toFixed(0)}px`);
      });
    },
    { passive: true }
  );
}
