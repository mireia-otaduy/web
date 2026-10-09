/* ==========================================================================
   63 · EFECTOS CON EL PUNTERO (segunda capa)
     - onda al pulsar un botón (también en táctil)
     - inclinación 3D de las tarjetas [data-tilt]
     - botones "magnéticos": se acercan un poco al cursor
     - foco de luz que sigue al cursor en la portada, cabeceras y secciones oscuras
     - capas de la portada que se mueven con el cursor
     - cursor personalizado (anillo con inercia)
   Todo salvo la onda requiere un puntero preciso (ratón). Con "reducir movimiento"
   no se activa nada. Estilos: 09-fx.css.
   ========================================================================== */

/** Ejecuta cada efecto de forma aislada: si uno falla, los demás siguen. */
function isolated(task, name) {
  try {
    task();
  } catch (error) {
    console.error(`[LCC] Error en ${name}:`, error);
  }
}

function initPointerFx() {
  if (prefersReducedMotion()) return;

  isolated(initRipple, 'la onda de los botones');
  if (!hasFinePointer()) return;

  isolated(initTilt, 'la inclinación 3D');
  isolated(initMagnetic, 'los botones magnéticos');
  isolated(initGlow, 'el foco de luz');
  isolated(initHeroParallax, 'el movimiento de la portada');
  isolated(initCursor, 'el cursor');
}

/** Onda que nace en el punto pulsado de cada botón. */
function initRipple() {
  doc.addEventListener(
    'pointerdown',
    (event) => {
      const button = event.target instanceof Element ? event.target.closest('.btn') : null;
      if (!button || button.disabled) return;

      const rect = button.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 2.4;
      const wave = doc.createElement('span');
      wave.className = 'ripple';
      wave.setAttribute('aria-hidden', 'true');
      wave.style.setProperty('width', `${size}px`);
      wave.style.setProperty('height', `${size}px`);
      wave.style.setProperty('left', `${event.clientX - rect.left}px`);
      wave.style.setProperty('top', `${event.clientY - rect.top}px`);
      button.append(wave);
      wave.addEventListener('animationend', () => wave.remove(), { once: true });
    },
    { passive: true }
  );
}

/** Inclinación 3D: la tarjeta bajo el cursor gira hacia él y vuelve suavemente a su sitio. */
function initTilt() {
  const SELECTOR = '[data-tilt]';
  const MAX_ANGLE = 8; // grados en las esquinas
  const targets = $$(SELECTOR);
  if (targets.length === 0) return;

  // La perspectiva la da el contenedor de cada tarjeta
  new Set(targets.map((element) => element.parentElement)).forEach((parent) => parent && parent.style.setProperty('perspective', '1100px'));

  const state = new Map(); // elemento → { x, y (actuales), tx, ty (objetivo) }
  let hovered = null;
  let frame = 0;

  const write = (element, entry) => {
    const angle = Math.hypot(entry.x, entry.y) * 2 * MAX_ANGLE;
    if (angle < 0.02) element.style.removeProperty('--tilt');
    else element.style.setProperty('--tilt', `${(-entry.y).toFixed(3)} ${entry.x.toFixed(3)} 0 ${angle.toFixed(2)}deg`);
  };

  const step = () => {
    frame = 0;
    let moving = false;
    state.forEach((entry, element) => {
      entry.x += (entry.tx - entry.x) * 0.16;
      entry.y += (entry.ty - entry.y) * 0.16;
      write(element, entry);
      const settled = Math.abs(entry.tx - entry.x) < 0.002 && Math.abs(entry.ty - entry.y) < 0.002;
      if (settled && entry.tx === 0 && entry.ty === 0) {
        element.style.removeProperty('--tilt');
        state.delete(element);
      } else if (!settled) {
        moving = true;
      }
    });
    if (moving) frame = requestAnimationFrame(step);
  };

  const start = () => {
    if (!frame) frame = requestAnimationFrame(step);
  };

  const release = (element) => {
    const entry = state.get(element);
    if (entry) {
      entry.tx = 0;
      entry.ty = 0;
      start();
    }
  };

  doc.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType !== 'mouse') return;
      const element = event.target instanceof Element ? event.target.closest(SELECTOR) : null;
      if (element !== hovered) {
        if (hovered) release(hovered);
        hovered = element;
      }
      if (!element) return;

      const rect = element.getBoundingClientRect();
      const entry = state.get(element) || { x: 0, y: 0, tx: 0, ty: 0 };
      entry.tx = (event.clientX - rect.left) / rect.width - 0.5;
      entry.ty = (event.clientY - rect.top) / rect.height - 0.5;
      state.set(element, entry);
      start();
    },
    { passive: true }
  );

  root.addEventListener('pointerleave', () => {
    if (hovered) release(hovered);
    hovered = null;
  });
}

/** Botones magnéticos: dentro de un radio, el botón se desplaza un poco hacia el cursor. */
function initMagnetic() {
  const buttons = $$('.btn:not(.fab)');
  if (buttons.length === 0 || !('IntersectionObserver' in window)) return;

  // Solo se calculan los botones visibles
  const visible = new Set();
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        visible.add(entry.target);
      } else {
        visible.delete(entry.target);
        entry.target.style.removeProperty('--bx');
        entry.target.style.removeProperty('--by');
      }
    }
  });
  buttons.forEach((button) => observer.observe(button));

  let pointer = null;
  let frame = 0;

  const update = () => {
    frame = 0;
    const reads = [];
    visible.forEach((button) => reads.push([button, button.getBoundingClientRect()]));

    for (const [button, rect] of reads) {
      const dx = pointer ? pointer.x - (rect.left + rect.width / 2) : 0;
      const dy = pointer ? pointer.y - (rect.top + rect.height / 2) : 0;
      const reach = Math.max(rect.width, rect.height) / 2 + 70;
      const distance = Math.hypot(dx, dy);

      if (pointer && distance < reach) {
        button.style.setProperty('--bx', `${clamp(dx * 0.22, -10, 10).toFixed(1)}px`);
        button.style.setProperty('--by', `${clamp(dy * 0.28, -8, 8).toFixed(1)}px`);
      } else {
        button.style.removeProperty('--bx');
        button.style.removeProperty('--by');
      }
    }
  };

  doc.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType !== 'mouse') return;
      pointer = { x: event.clientX, y: event.clientY };
      if (!frame) frame = requestAnimationFrame(update);
    },
    { passive: true }
  );

  root.addEventListener('pointerleave', () => {
    pointer = null;
    if (!frame) frame = requestAnimationFrame(update);
  });
}

/** Foco de luz que sigue al cursor sobre la portada, las cabeceras y las secciones oscuras. */
function initGlow() {
  const hosts = $$('.hero, .page-hero, .section.is-dark, .cta__main');
  for (const host of hosts) {
    const glow = doc.createElement('div');
    glow.className = 'fx-glow';
    glow.setAttribute('aria-hidden', 'true');
    host.setAttribute('data-glow', '');
    host.prepend(glow);
  }

  let pending = null;
  let frame = 0;

  doc.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType !== 'mouse') return;
      const host = event.target instanceof Element ? event.target.closest('[data-glow]') : null;
      if (!host) return;
      pending = { host, x: event.clientX, y: event.clientY };
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const rect = pending.host.getBoundingClientRect();
        pending.host.style.setProperty('--gx', `${(pending.x - rect.left).toFixed(0)}px`);
        pending.host.style.setProperty('--gy', `${(pending.y - rect.top).toFixed(0)}px`);
      });
    },
    { passive: true }
  );
}

/** Las capas de la portada (foto, anillo, fichas, plano) se desplazan en sentidos distintos según el cursor. */
function initHeroParallax() {
  const hero = $('.hero');
  if (!hero) return;

  let targetX = 0;
  let targetY = 0;
  let x = 0;
  let y = 0;
  let frame = 0;

  const step = () => {
    frame = 0;
    x += (targetX - x) * 0.08;
    y += (targetY - y) * 0.08;
    hero.style.setProperty('--hx', x.toFixed(3));
    hero.style.setProperty('--hy', y.toFixed(3));
    if (Math.abs(targetX - x) > 0.002 || Math.abs(targetY - y) > 0.002) frame = requestAnimationFrame(step);
  };

  hero.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType !== 'mouse') return;
      const rect = hero.getBoundingClientRect();
      targetX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      targetY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
      if (!frame) frame = requestAnimationFrame(step);
    },
    { passive: true }
  );

  hero.addEventListener('pointerleave', () => {
    targetX = 0;
    targetY = 0;
    if (!frame) frame = requestAnimationFrame(step);
  });
}

/** Cursor personalizado: anillo con inercia y punto exacto; el cursor del sistema sigue visible. */
function initCursor() {
  const ring = doc.createElement('div');
  const dot = doc.createElement('div');
  ring.className = 'cursor';
  dot.className = 'cursor__dot';
  ring.setAttribute('aria-hidden', 'true');
  dot.setAttribute('aria-hidden', 'true');
  doc.body.append(ring, dot);

  const INTERACTIVE = 'a, button, summary, label, select, [data-lightbox], [role="button"]';
  const TEXT_FIELD = 'input:not([type="checkbox"]):not([type="radio"]):not([type="submit"]), textarea';

  let x = -100;
  let y = -100;
  let ringX = x;
  let ringY = y;
  let frame = 0;

  const draw = () => {
    frame = 0;
    ringX += (x - ringX) * 0.2;
    ringY += (y - ringY) * 0.2;
    ring.style.setProperty('transform', `translate3d(${ringX.toFixed(1)}px, ${ringY.toFixed(1)}px, 0)`);
    dot.style.setProperty('transform', `translate3d(${x}px, ${y}px, 0)`);
    if (Math.abs(x - ringX) > 0.1 || Math.abs(y - ringY) > 0.1) frame = requestAnimationFrame(draw);
  };

  doc.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType !== 'mouse') return;
      x = event.clientX;
      y = event.clientY;
      const target = event.target instanceof Element ? event.target : null;
      ring.classList.add('is-on');
      dot.classList.add('is-on');
      ring.classList.toggle('is-link', Boolean(target && target.closest(INTERACTIVE)));
      ring.classList.toggle('is-text', Boolean(target && target.closest(TEXT_FIELD)));
      dot.classList.toggle('is-text', Boolean(target && target.closest(TEXT_FIELD)));
      if (!frame) frame = requestAnimationFrame(draw);
    },
    { passive: true }
  );

  doc.addEventListener('pointerdown', () => ring.classList.add('is-down'), { passive: true });
  doc.addEventListener('pointerup', () => ring.classList.remove('is-down'), { passive: true });
  root.addEventListener('pointerleave', () => {
    ring.classList.remove('is-on');
    dot.classList.remove('is-on');
  });
}
