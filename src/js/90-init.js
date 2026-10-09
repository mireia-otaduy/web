/* ==========================================================================
   90 · ARRANQUE
   Ejecuta cada módulo de forma aislada: si uno falla, los demás siguen
   funcionando y la página nunca se queda a medias.
   ========================================================================== */

function startSite() {
  // Señal para el CSS: el script se ha cargado (anula la salvaguarda de 08-effects.css)
  root.classList.add('js-ready');

  // Módulos que ocultan contenido hasta que aparece: si alguno falla, la página vuelve a su estado estático
  const contentModules = new Set([initReveal, initEyebrows, initIconDraw, initCascade]);

  const modules = [
    initReveal,
    initScroll,
    initAmbient, // antes de initScrollFx: las formas que inserta se mueven con el scroll
    initScrollFx,
    initEyebrows,
    initIconDraw,
    initCascade,
    initRail,
    initHeroCanvasWhenIdle,
    initLightbox,
    initNav,
    initSpotlight,
    initQuoteForm,
    initSectionNav,
    () => whenIdle(initPointerFx) // el cursor, las inclinaciones y los imanes esperan a que el navegador esté libre
  ];

  for (const init of modules) {
    try {
      init();
    } catch (error) {
      console.error(`[LCC] Error al iniciar ${init.name || 'un módulo'}:`, error);
      if (contentModules.has(init)) root.classList.remove('js');
    }
  }

  startScrollLoop();
}

if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', startSite);
else startSite();
