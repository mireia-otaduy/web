/* ==========================================================================
   10 · APARICIÓN DE TEXTO E IMÁGENES
   - [data-split]   titulares que aparecen palabra a palabra (o letra a letra con "chars")
   - [data-reveal]  bloques e imágenes que aparecen al entrar en pantalla
   - [data-stagger] escalona la aparición de sus hijos
   - [data-count]   cifras que cuentan desde cero
   Las clases de estado las pinta 08-effects.css. Con "reducir movimiento" no se hace nada.
   ========================================================================== */

/** Divide un texto en letras (grafemas), de modo que las letras acentuadas e ideogramas no se partan. */
function splitGraphemes(value) {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value), (part) => part.segment);
  }
  return Array.from(value);
}

/**
 * Divide un titular en palabras envueltas en máscaras (<span class="w"><span>palabra</span></span>).
 * Con data-split="chars" cada palabra se divide además en letras (<span class="ch">).
 * El resto de valores de data-split (blur, flip, slide, scale) solo cambian el CSS (09-fx.css).
 */
function splitWords(element) {
  const byChars = element.dataset.split === 'chars';
  const segmenter =
    typeof Intl !== 'undefined' && Intl.Segmenter
      ? new Intl.Segmenter(lang === 'zh' ? 'zh' : lang, { granularity: 'word' })
      : null;

  const walker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  let index = 0;
  let charIndex = 0;

  for (const node of textNodes) {
    if (!node.nodeValue.trim()) continue;

    const tokens = segmenter
      ? Array.from(segmenter.segment(node.nodeValue), (part) => ({ value: part.segment, word: part.isWordLike }))
      : node.nodeValue.split(/(\s+)/).filter(Boolean).map((value) => ({ value, word: !/^\s+$/.test(value) }));

    const fragment = doc.createDocumentFragment();
    const words = []; // palabras de este nodo: se rellenan al final, cuando ya tienen su puntuación
    let current = null; // palabra a la que se pega la puntuación siguiente
    let lead = ''; // puntuación inicial ("¿", "«") que se pega a la palabra siguiente

    const openWord = (value) => {
      const outer = doc.createElement('span');
      const inner = doc.createElement('span');
      outer.className = 'w';
      inner.style.setProperty('--i', String(index));
      index += 1;
      outer.append(inner);
      fragment.append(outer);
      const word = { inner, text: lead + value };
      lead = '';
      words.push(word);
      return word;
    };

    for (const token of tokens) {
      if (/^\s+$/.test(token.value)) {
        current = null;
        fragment.append(doc.createTextNode(token.value));
      } else if (token.word) {
        current = openWord(token.value);
      } else if (current) {
        current.text += token.value;
      } else {
        lead += token.value;
      }
    }
    if (lead) fragment.append(doc.createTextNode(lead));

    for (const word of words) {
      if (!byChars) {
        word.inner.textContent = word.text;
        continue;
      }
      for (const glyph of splitGraphemes(word.text)) {
        const letter = doc.createElement('span');
        letter.className = 'ch';
        letter.style.setProperty('--c', String(charIndex));
        charIndex += 1;
        letter.textContent = glyph;
        word.inner.append(letter);
      }
    }

    node.replaceWith(fragment);
  }

  element.classList.add('is-split');
}

/** Cifras que cuentan desde cero. El texto original se restaura al terminar. */
const numberFormatter = (() => {
  try {
    return new Intl.NumberFormat(lang === 'zh' ? 'zh-CN' : lang, { useGrouping: 'always' });
  } catch {
    return { format: (value) => String(value) };
  }
})();

function prepareCounter(element) {
  const original = element.textContent;
  const match = original.match(/\d[\d.,\s ]*/);
  if (!match) return null;

  const numberText = match[0].replace(/[\s ]+$/, '');
  const target = element.dataset.count ? Number(element.dataset.count) : parseInt(numberText.replace(/\D/g, ''), 10);
  if (!Number.isFinite(target)) return null;

  const prefix = original.slice(0, match.index);
  const suffix = original.slice(match.index + numberText.length);
  const plain = element.hasAttribute('data-plain');
  const render = (value) => prefix + (plain ? String(value) : numberFormatter.format(value)) + suffix;

  element.textContent = render(0);
  return { element, original, target, render };
}

function runCounter(counter) {
  const duration = 1700;
  const start = performance.now();
  const ease = (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t));

  const step = (now) => {
    const progress = clamp((now - start) / duration, 0, 1);
    if (progress < 1) {
      counter.element.textContent = counter.render(Math.round(counter.target * ease(progress)));
      requestAnimationFrame(step);
    } else {
      counter.element.textContent = counter.original;
    }
  };
  requestAnimationFrame(step);
}

/** Tras terminar la transición se retira data-reveal: el componente recupera sus propios hover. */
function releaseReveal(element, delayMs) {
  window.setTimeout(() => element.removeAttribute('data-reveal'), delayMs + 2600);
}

function initReveal() {
  if (prefersReducedMotion()) return;

  // Escalonado: cada hijo recibe su posición como retardo (máximo 7 pasos)
  for (const group of $$('[data-stagger]')) {
    $$(':scope > [data-reveal], :scope > * > [data-reveal]', group).forEach((child, index) => {
      child.style.setProperty('--d', String(Math.min(index, 7)));
    });
  }

  const splits = $$('[data-split]');
  splits.forEach(splitWords);

  const counters = new Map();
  for (const element of $$('[data-count]')) {
    const counter = prepareCounter(element);
    if (counter) counters.set(element, counter);
  }

  const targets = [...$$('[data-reveal]'), ...splits, ...counters.keys()];
  if (!('IntersectionObserver' in window)) {
    targets.forEach((element) => element.classList.add('is-in'));
    counters.forEach((counter) => (counter.element.textContent = counter.original));
    return;
  }

  // Pendientes de aparecer: sirve también para el barrido final (ver más abajo)
  const pending = new Set(targets);

  const reveal = (element) => {
    pending.delete(element);
    if (counters.has(element)) runCounter(counters.get(element));
    if (element.hasAttribute('data-reveal')) {
      element.classList.add('is-in');
      releaseReveal(element, Number(element.style.getPropertyValue('--d') || 0) * 90);
    } else if (element.hasAttribute('data-split')) {
      element.classList.add('is-in');
    }
  };

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        reveal(entry.target);
      }
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.01 }
  );

  // Barrido final: al llegar al final de la página, lo que quede dentro de la ventana aparece aunque
  // se encuentre en el 10 % inferior (que el margen del observador excluye), como la fila legal del pie.
  scrollTasks.push((y, viewport) => {
    if (pending.size === 0 || y + viewport < root.scrollHeight - 4) return;
    for (const element of Array.from(pending)) {
      if (element.getBoundingClientRect().top >= viewport) continue;
      observer.unobserve(element);
      reveal(element);
    }
  });

  targets.forEach((element) => observer.observe(element));
}
