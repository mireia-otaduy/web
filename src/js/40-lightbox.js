/* ==========================================================================
   40 · VISOR DE IMÁGENES
   Convierte los enlaces [data-lightbox] en un visor a pantalla completa con
   <dialog>: teclado (Esc, flechas), gestos de deslizar y foco gestionado por
   el navegador. Sin JavaScript, cada enlace abre la imagen en grande.
   ========================================================================== */

function initLightbox() {
  const links = $$('[data-lightbox]');
  if (links.length === 0 || typeof HTMLDialogElement === 'undefined') return;

  const dialog = doc.createElement('dialog');
  dialog.className = 'lightbox';
  dialog.setAttribute('aria-label', text('lightbox.label'));

  const icon = (name) => `<svg class="icon" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;
  dialog.innerHTML = `
    <div class="lightbox__stage">
      <figure class="lightbox__figure">
        <img class="lightbox__image" alt="">
        <figcaption class="lightbox__caption"></figcaption>
      </figure>
    </div>
    <button type="button" class="lightbox__btn lightbox__prev">${icon('arrow-left')}</button>
    <button type="button" class="lightbox__btn lightbox__next">${icon('arrow-right')}</button>
    <button type="button" class="lightbox__btn lightbox__close">${icon('x')}</button>`;
  doc.body.append(dialog);

  const image = $('.lightbox__image', dialog);
  const caption = $('.lightbox__caption', dialog);
  const prev = $('.lightbox__prev', dialog);
  const next = $('.lightbox__next', dialog);
  const close = $('.lightbox__close', dialog);
  prev.setAttribute('aria-label', text('lightbox.prev'));
  next.setAttribute('aria-label', text('lightbox.next'));
  close.setAttribute('aria-label', text('lightbox.close'));

  let index = 0;

  const show = (target) => {
    index = (target + links.length) % links.length;
    const link = links[index];
    const label = link.dataset.caption || '';
    image.src = link.href;
    image.alt = label;
    caption.textContent = `${label} · ${index + 1} ${text('lightbox.of', '/')} ${links.length}`;

    // Precarga las imágenes vecinas para que el cambio sea instantáneo
    for (const offset of [-1, 1]) {
      new Image().src = links[(index + offset + links.length) % links.length].href;
    }
  };

  const open = (target) => {
    show(target);
    if (!dialog.open) dialog.showModal();
    root.style.overflow = 'hidden';
  };

  links.forEach((link, position) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      open(position);
    });
  });

  prev.addEventListener('click', () => show(index - 1));
  next.addEventListener('click', () => show(index + 1));
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => root.style.removeProperty('overflow'));

  // Un clic fuera de la foto (en el fondo) cierra el visor
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog || event.target.classList.contains('lightbox__stage')) dialog.close();
  });

  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') show(index - 1);
    if (event.key === 'ArrowRight') show(index + 1);
  });

  // Deslizar con el dedo
  let startX = null;
  dialog.addEventListener('pointerdown', (event) => {
    startX = event.pointerType === 'touch' ? event.clientX : null;
  });
  dialog.addEventListener('pointerup', (event) => {
    if (startX === null) return;
    const delta = event.clientX - startX;
    startX = null;
    if (Math.abs(delta) > 50) show(index + (delta < 0 ? 1 : -1));
  });
}
