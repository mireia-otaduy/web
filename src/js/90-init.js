/* ==========================================================================
   90 · ARRANQUE
   Ejecuta cada módulo de forma aislada: si uno falla, los demás siguen
   funcionando y la página nunca se queda a medias.
   ========================================================================== */

function startSite() {
  // Señal para el CSS: el script se ha cargado (anula la salvaguarda de 08-effects.css)
  root.classList.add('js-ready');

  const modules = [
    initReveal,
    initScroll,
    initRail,
    initHeroCanvasWhenIdle,
    initLightbox,
    initNav,
    initSpotlight,
    initQuoteForm
  ];

  for (const init of modules) {
    try {
      init();
    } catch (error) {
      console.error(`[LCC] Error al iniciar ${init.name}:`, error);
      // Si falla la aparición animada, se devuelve la página a su estado estático: el contenido nunca queda oculto
      if (init === initReveal) root.classList.remove('js');
    }
  }

  startScrollLoop();
}

if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', startSite);
else startSite();
