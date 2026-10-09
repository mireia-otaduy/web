/* ==========================================================================
   62 · APARICIÓN AVANZADA (segunda capa)
     - rótulos (.eyebrow): el texto se "descifra" letra a letra y se dibuja su línea
     - iconos que se dibujan al entrar su contenedor en pantalla
     - hijos que aparecen en cascada ([data-cascade])
   Con "reducir movimiento" no se hace nada y todo se ve ya completo.
   Estilos: 09-fx.css.
   ========================================================================== */

/** Contenedores cuyos iconos se dibujan al aparecer (ver el selector equivalente en 09-fx.css). */
const ICON_HOSTS = '.benefit, .sector, .steps-mini li, .route__stop, .tech-card, .panel, .contact-card__row, .check-list li, .note, .stat-mini, .step-panel';

/** Rótulos: texto que se descifra y línea de cota que se dibuja. */
function initEyebrows() {
  const eyebrows = $$('.eyebrow');
  if (eyebrows.length === 0) return;

  const LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&<>+='; // sin / ni - para no crear saltos de línea provisionales
  const isWide = (char) => char.charCodeAt(0) >= 0x2e80; // ideogramas: ocupan el doble en fuente monoespaciada
  const pick = (pool) => pool[Math.floor(Math.random() * pool.length)];

  const scramble = (visible, original) => {
    const chars = Array.from(original);
    const widePool = chars.filter(isWide);
    const startedAt = performance.now();
    // Cada letra se resuelve en un instante propio: de izquierda a derecha con algo de azar
    const resolveAt = chars.map((_, index) => 280 + index * 20 + Math.random() * 380);
    let lastPaint = 0;

    const frame = (now) => {
      const elapsed = now - startedAt;
      if (now - lastPaint > 45 || elapsed >= resolveAt[resolveAt.length - 1]) {
        lastPaint = now;
        visible.textContent = chars
          .map((char, index) => {
            if (elapsed >= resolveAt[index] || char === ' ') return char;
            return isWide(char) ? pick(widePool) : pick(LATIN);
          })
          .join('');
      }
      if (elapsed < resolveAt[resolveAt.length - 1]) requestAnimationFrame(frame);
      else visible.textContent = original;
    };
    requestAnimationFrame(frame);
  };

  const prepared = new Map();
  for (const eyebrow of eyebrows) {
    if (prefersReducedMotion()) break;
    const original = eyebrow.textContent.trim();
    if (!original) continue;

    // Lectores de pantalla: el texto real va en un span oculto; la versión animada es decorativa
    const real = doc.createElement('span');
    real.className = 'sr-only';
    real.textContent = original;
    const visible = doc.createElement('span');
    visible.setAttribute('aria-hidden', 'true');
    visible.textContent = original;
    eyebrow.textContent = '';
    eyebrow.append(real, visible);
    prepared.set(eyebrow, { visible, original });
  }

  if (!('IntersectionObserver' in window)) {
    eyebrows.forEach((eyebrow) => eyebrow.classList.add('is-in'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const eyebrow = entry.target;
        observer.unobserve(eyebrow);
        eyebrow.classList.add('is-in');
        const data = prepared.get(eyebrow);
        if (data) scramble(data.visible, data.original);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.01 }
  );
  eyebrows.forEach((eyebrow) => observer.observe(eyebrow));
}

/** Iconos que se dibujan: sus contenedores reciben .is-in al entrar en pantalla. */
function initIconDraw() {
  if (prefersReducedMotion()) return;
  watchIn($$(ICON_HOSTS));
}

/** Hijos en cascada: se numera cada hijo (--n) y el contenedor recibe .is-in al entrar en pantalla. */
function initCascade() {
  if (prefersReducedMotion()) return;
  const containers = $$('[data-cascade]');
  for (const container of containers) {
    Array.from(container.children).forEach((child, index) => child.style.setProperty('--n', String(Math.min(index, 12))));
  }
  watchIn(containers);
}
