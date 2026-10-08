/* ==========================================================================
   35 · PARTÍCULAS DE LA PORTADA
   Red de puntos de luz que flota despacio y reacciona al cursor. Decorativa:
   el canvas es aria-hidden. Se pausa cuando la portada no se ve o la pestaña
   está en segundo plano, y no se inicia con "reducir movimiento".
   ========================================================================== */

function initHeroCanvas() {
  const canvas = $('[data-hero-canvas]');
  const saveData = navigator.connection && navigator.connection.saveData;
  if (!canvas || prefersReducedMotion() || saveData) return;

  const context = canvas.getContext('2d');
  const hero = canvas.closest('.hero');
  if (!context || !hero) return;

  const LINK_DISTANCE = 120;
  const POINTER_DISTANCE = 160;

  let width = 0;
  let height = 0;
  let particles = [];
  let frameId = 0;
  let visible = true;
  const pointer = { x: -9999, y: -9999 };

  const seed = () => {
    // Menos partículas en pantallas pequeñas (menos cálculo y menos batería)
    const maxCount = width < 700 ? 28 : 80;
    const count = clamp(Math.round((width * height) / 19000), 18, maxCount);
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.28,
      vy: -(0.08 + Math.random() * 0.28),
      radius: 0.8 + Math.random() * 1.6,
      alpha: 0.35 + Math.random() * 0.5
    }));
  };

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    seed();
  };

  const draw = () => {
    context.clearRect(0, 0, width, height);

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.y < -10) p.y = height + 10;
      if (p.x < -10) p.x = width + 10;
      if (p.x > width + 10) p.x = -10;

      // El cursor aparta suavemente los puntos cercanos
      const dx = p.x - pointer.x;
      const dy = p.y - pointer.y;
      const distance = Math.hypot(dx, dy);
      if (distance < POINTER_DISTANCE && distance > 0) {
        const push = (1 - distance / POINTER_DISTANCE) * 0.6;
        p.x += (dx / distance) * push;
        p.y += (dy / distance) * push;
      }

      context.beginPath();
      context.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      context.fillStyle = `rgba(90, 180, 255, ${p.alpha})`;
      context.fill();
    }

    // Líneas entre puntos cercanos y entre los puntos y el cursor
    context.lineWidth = 1;
    for (let i = 0; i < particles.length; i += 1) {
      const a = particles[i];
      for (let j = i + 1; j < particles.length; j += 1) {
        const b = particles[j];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (distance < LINK_DISTANCE) {
          context.strokeStyle = `rgba(90, 180, 255, ${0.16 * (1 - distance / LINK_DISTANCE)})`;
          context.beginPath();
          context.moveTo(a.x, a.y);
          context.lineTo(b.x, b.y);
          context.stroke();
        }
      }
      const toPointer = Math.hypot(a.x - pointer.x, a.y - pointer.y);
      if (toPointer < POINTER_DISTANCE) {
        context.strokeStyle = `rgba(162, 189, 242, ${0.35 * (1 - toPointer / POINTER_DISTANCE)})`;
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(pointer.x, pointer.y);
        context.stroke();
      }
    }
  };

  const loop = () => {
    frameId = 0;
    if (!visible || doc.hidden) return;
    draw();
    frameId = requestAnimationFrame(loop);
  };

  const play = () => {
    if (!frameId && visible && !doc.hidden) frameId = requestAnimationFrame(loop);
  };

  resize();

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(resize, 150);
  });

  hero.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
  });
  hero.addEventListener('pointerleave', () => {
    pointer.x = -9999;
    pointer.y = -9999;
  });

  doc.addEventListener('visibilitychange', play);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      play();
    }).observe(hero);
  }

  play();
}

/** Arranca las partículas cuando la página ya ha cargado y el navegador está libre (no compite con el primer pintado). */
function initHeroCanvasWhenIdle() {
  const run = () => {
    try {
      initHeroCanvas();
    } catch (error) {
      console.error('[LCC] Error al iniciar las partículas de la portada:', error);
    }
  };
  const start = () => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 2500 });
    else window.setTimeout(run, 1200);
  };
  if (doc.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}
