/* ==========================================================================
   20 · EFECTOS LIGADOS AL SCROLL
   Un único listener (con requestAnimationFrame) reparte el scroll entre tareas:
     - barra de lectura y sombra de la cabecera
     - aparición del botón flotante
     - desvanecimiento de la portada
     - frase del manifiesto que se ilumina palabra a palabra
     - parallax de las fotos
   Las demás partes (carril, visor…) registran sus propias tareas con scrollTasks.
   ========================================================================== */

function initScroll() {
  const reduced = prefersReducedMotion();
  const header = $('.site-header');
  const fab = $('.fab');
  const footer = $('.site-footer');
  const hero = $('.hero');

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

  // Parallax: solo se calcula para las fotos visibles
  const parallax = new Set();
  if (!reduced && 'IntersectionObserver' in window) {
    const watcher = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) parallax.add(entry.target);
        else parallax.delete(entry.target);
      }
    });
    $$('[data-parallax]').forEach((element) => watcher.observe(element));
  }

  scrollTasks.push((y, viewport) => {
    // Barra de lectura
    const max = root.scrollHeight - viewport;
    root.style.setProperty('--progress', max > 0 ? clamp(y / max, 0, 1).toFixed(4) : '0');

    if (header) header.classList.toggle('is-scrolled', y > 8);
    // El botón flotante aparece al bajar un poco y se retira al llegar al pie (para no tapar los enlaces legales)
    if (fab) {
      const footerInView = footer ? footer.getBoundingClientRect().top < viewport - 40 : false;
      fab.classList.toggle('is-visible', y > viewport * 0.35 && !footerInView);
    }

    if (hero && !reduced) {
      hero.style.setProperty('--hero-p', clamp(y / (viewport * 0.85), 0, 1).toFixed(3));
    }

    if (manifesto && words.length) {
      const rect = manifesto.getBoundingClientRect();
      const progress = clamp((viewport * 0.85 - rect.top) / (rect.height + viewport * 0.3), 0, 1);
      const lit = Math.round(progress * words.length);
      words.forEach((word, index) => word.classList.toggle('is-on', index < lit));
    }

    parallax.forEach((element) => {
      const rect = element.getBoundingClientRect();
      const offset = (rect.top + rect.height / 2 - viewport / 2) / (viewport / 2 + rect.height / 2);
      element.style.setProperty('--p', clamp(offset, -1, 1).toFixed(3));
    });
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

  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', request, { passive: true });
  request();
}
