/* ==========================================================================
   20 · EFECTOS LIGADOS AL SCROLL
   Un único listener (con requestAnimationFrame) reparte el scroll entre tareas:
     - barra de lectura y sombra de la cabecera
     - aparición del botón flotante
     - desvanecimiento de la portada y de las cabeceras de página
     - frase del manifiesto que se ilumina palabra a palabra
   El parallax, las formas con profundidad, las franjas de texto y el resto de efectos
   de la segunda capa viven en 61-fx-scroll.js; el carril, el visor… registran sus
   propias tareas con scrollTasks.
   ========================================================================== */

function initScroll() {
  const reduced = prefersReducedMotion();
  const header = $('.site-header');
  const fab = $('.fab');
  const footer = $('.site-footer');
  const heroes = $$('.hero, .page-hero');
  const progressBar = $('.scroll-progress');

  // Manifiesto: se dividen las palabras y se iluminan según el avance
  const manifesto = reduced ? null : $('[data-manifesto]');
  let words = [];
  if (manifesto) {
    const segmenter =
      typeof Intl !== 'undefined' && Intl.Segmenter
        ? new Intl.Segmenter(lang === 'zh' ? 'zh' : lang, { granularity: 'word' })
        : null;
    const source = manifesto.textContent;
    const tokens = segmenter
      ? Array.from(segmenter.segment(source), (part) => ({ value: part.segment, word: part.isWordLike }))
      : source.split(/(\s+)/).filter(Boolean).map((value) => ({ value, word: !/^\s+$/.test(value) }));

    manifesto.textContent = '';
    let current = null;
    for (const token of tokens) {
      if (/^\s+$/.test(token.value)) {
        current = null;
        manifesto.append(doc.createTextNode(token.value));
      } else if (token.word || !current) {
        current = doc.createElement('span');
        current.className = 'mw';
        current.textContent = token.value;
        manifesto.append(current);
        words.push(current);
      } else {
        current.textContent += token.value;
      }
    }
  }

  scrollTasks.push((y, viewport) => {
    // Barra de lectura
    const max = root.scrollHeight - viewport;
    // Se escribe en la propia barra (no en <html>) para no invalidar los estilos de toda la página en cada fotograma
    if (progressBar) progressBar.style.setProperty('--progress', max > 0 ? clamp(y / max, 0, 1).toFixed(4) : '0');

    if (header) header.classList.toggle('is-scrolled', y > 8);
    // El botón flotante aparece al bajar un poco y se retira al llegar al pie (para no tapar los enlaces legales)
    if (fab) {
      const footerInView = footer ? footer.getBoundingClientRect().top < viewport - 40 : false;
      fab.classList.toggle('is-visible', y > viewport * 0.35 && !footerInView);
    }

    if (!reduced && y < viewport * 1.2) {
      const progress = clamp(y / (viewport * 0.85), 0, 1).toFixed(3);
      heroes.forEach((hero) => hero.style.setProperty('--hero-p', progress));
    }

    if (manifesto && words.length) {
      const rect = manifesto.getBoundingClientRect();
      const progress = clamp((viewport * 0.85 - rect.top) / (rect.height + viewport * 0.3), 0, 1);
      const lit = Math.round(progress * words.length);
      words.forEach((word, index) => word.classList.toggle('is-on', index < lit));
    }
  });
}

/** Arranca el bucle de scroll: una pasada por fotograma como máximo. */
function startScrollLoop() {
  let queued = false;

  const run = () => {
    queued = false;
    const y = window.scrollY;
    const viewport = window.innerHeight;
    scrollTasks.forEach((task) => task(y, viewport));
  };

  const request = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(run);
  };
  kickScroll = request;

  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', request, { passive: true });
  request();
}
