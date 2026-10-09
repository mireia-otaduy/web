/* ==========================================================================
   61 · EFECTOS LIGADOS AL SCROLL (segunda capa)
   Da profundidad a la página:
     - formas decorativas al fondo de cada sección (anillos, puntos, cruces, arcos)
     - parallax de fotos, formas y marca de agua del pie ([data-parallax], [data-depth])
     - franjas de texto gigante que se desplazan de lado ([data-scroll-x])
     - secciones que se alejan al salir por arriba ([data-recede])
     - cintas que se inclinan según la velocidad del scroll
     - columna de puntos para saltar entre secciones
   Todas las lecturas de posición se hacen juntas y las escrituras después
   (así el navegador no recalcula el diseño varias veces por fotograma).
   Estilos: 09-fx.css.
   ========================================================================== */

/** Inserta las formas decorativas al fondo de cada sección. Son aria-hidden y no reciben clics. */
function initAmbient() {
  const TYPES = ['ring', 'dots', 'cross', 'arc'];
  const SIZES = { ring: '19rem', dots: '13rem', cross: '6rem', arc: '15rem' };
  const DEPTHS = [34, -26, 44, -38];

  $$('.section:not(.cta)').forEach((section, index) => {
    const onLeft = index % 2 === 0;
    const placements = [
      { type: TYPES[index % 4], x: onLeft ? '-6%' : '88%', y: '5%', depth: DEPTHS[index % 4] },
      { type: TYPES[(index + 2) % 4], x: onLeft ? '91%' : '-5%', y: '62%', depth: DEPTHS[(index + 1) % 4] }
    ];

    // Se insertan al revés para que el primero quede el primero del DOM
    for (const place of placements.reverse()) {
      const shape = doc.createElement('span');
      shape.className = `fx-shape fx-shape--${place.type}`;
      shape.setAttribute('aria-hidden', 'true');
      shape.dataset.depth = String(place.depth);
      shape.style.setProperty('--x', place.x);
      shape.style.setProperty('--y', place.y);
      shape.style.setProperty('--size', SIZES[place.type]);
      section.prepend(shape);
    }
  });
}

/** Movimiento ligado a la posición de cada elemento en la ventana. */
function initScrollFx() {
  if (prefersReducedMotion() || !('IntersectionObserver' in window)) return;

  const items = new Map(); // elemento → ajustes leídos una sola vez
  for (const element of $$('[data-parallax], [data-depth], [data-scroll-x], [data-recede]')) {
    items.set(element, {
      parallax: element.hasAttribute('data-parallax'),
      depth: element.dataset.depth ? Number(element.dataset.depth) : 0,
      scrollX: element.dataset.scrollX ? Number(element.dataset.scrollX) : 0,
      recede: element.hasAttribute('data-recede')
    });
  }

  // Solo se calculan los elementos visibles (con un margen para que el movimiento ya esté en marcha al entrar).
  // Los que quedan fuera conservan su valor "de reposo" (arriba = -1, abajo = 1), que se mantiene al día
  // sin leer posiciones: así un salto brusco con un ancla no deja valores atrasados.
  const active = new Set();
  const resting = new Map(); // elemento → { top, bottom (posición en el documento), side }

  const rest = (element, side) => {
    const setting = items.get(element);
    if (setting.parallax) element.style.setProperty('--p', String(side));
    if (setting.depth) element.style.setProperty('--dy', `${side * setting.depth}px`);
    if (setting.scrollX) element.style.setProperty('--sx', String(side * setting.scrollX));
    if (setting.recede) element.style.setProperty('--leave', side < 0 ? '1' : '0');
  };

  const watcher = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const element = entry.target;
        if (entry.isIntersecting) {
          active.add(element);
          resting.delete(element);
          continue;
        }
        active.delete(element);
        const side = entry.boundingClientRect.bottom < 0 ? -1 : 1;
        resting.set(element, {
          top: entry.boundingClientRect.top + window.scrollY,
          bottom: entry.boundingClientRect.bottom + window.scrollY,
          side
        });
        rest(element, side);
      }
    },
    { rootMargin: '20% 0px 20% 0px' }
  );
  items.forEach((_, element) => watcher.observe(element));

  // Inercia: las cintas cruzadas se inclinan con la velocidad del scroll y se enderezan al parar
  const ribbons = $('.ribbons');
  let lastY = null; // se lee en la primera pasada: pedir window.scrollY al arrancar fuerza un cálculo de diseño completo
  let velocity = 0;
  let ribbonsTilted = false;

  scrollTasks.push((y, viewport) => {
    resting.forEach((place, element) => {
      const side = place.bottom < y ? -1 : place.top > y + viewport ? 1 : place.side;
      if (side === place.side) return;
      place.side = side;
      rest(element, side);
    });

    const measured = [];
    active.forEach((element) => measured.push([element, items.get(element), element.getBoundingClientRect()]));

    for (const [element, setting, rect] of measured) {
      // 1 cuando el elemento está debajo de la ventana (entrando), 0 en el centro y -1 arriba (saliendo)
      const offset = clamp((rect.top + rect.height / 2 - viewport / 2) / (viewport / 2 + rect.height / 2), -1, 1);

      if (setting.parallax) element.style.setProperty('--p', offset.toFixed(3));
      if (setting.depth) element.style.setProperty('--dy', `${(offset * setting.depth).toFixed(1)}px`);
      if (setting.scrollX) element.style.setProperty('--sx', (offset * setting.scrollX).toFixed(2));
      if (setting.recede) {
        const leave = clamp((viewport * 0.55 - rect.bottom) / (viewport * 0.55), 0, 1);
        element.style.setProperty('--leave', leave.toFixed(3));
      }
    }

    velocity += (clamp((y - (lastY ?? y)) / 42, -1, 1) - velocity) * 0.22;
    lastY = y;
    if (ribbons) {
      const moving = Math.abs(velocity) > 0.015;
      if (moving || ribbonsTilted) ribbons.style.setProperty('--vel', moving ? velocity.toFixed(3) : '0');
      ribbonsTilted = moving;
    }
    if (Math.abs(velocity) > 0.015) kickScroll();
  });
}

/** Columna de puntos fija para saltar entre secciones; el punto activo sigue al scroll. */
function initSectionNav() {
  const sections = $$('main section[id]').filter((section) => $('.eyebrow', section));
  if (sections.length < 3) return;

  const nav = doc.createElement('nav');
  nav.className = 'dots';
  nav.setAttribute('aria-label', text('sectionNav', 'Secciones'));

  const links = sections.map((section) => {
    const eyebrow = $('.eyebrow', section);
    const label = ($('.sr-only', eyebrow) || eyebrow).textContent.trim();
    const link = doc.createElement('a');
    link.href = `#${section.id}`;
    const caption = doc.createElement('span');
    caption.className = 'dots__label';
    caption.textContent = label;
    const dot = doc.createElement('span');
    dot.className = 'dots__dot';
    dot.setAttribute('aria-hidden', 'true');
    link.append(caption, dot);
    nav.append(link);
    return link;
  });

  doc.body.append(nav);

  scrollTasks.push((y, viewport) => {
    nav.classList.toggle('is-visible', y > viewport * 0.5);

    // Activa la última sección cuyo borde superior ya ha superado el 40 % de la ventana
    let current = -1;
    sections.forEach((section, index) => {
      if (section.getBoundingClientRect().top <= viewport * 0.4) current = index;
    });
    links.forEach((link, index) => {
      const on = index === current;
      link.classList.toggle('is-active', on);
      if (on) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
  });
}
