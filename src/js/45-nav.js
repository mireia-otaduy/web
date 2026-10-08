/* ==========================================================================
   45 · NAVEGACIÓN
   El menú móvil funciona con la API popover (sin JavaScript). Aquí solo se
   cierra el panel al pasar a pantalla ancha y se gestiona el selector de
   idioma (<details>): se cierra con Esc, al hacer clic fuera o al perder el foco.
   ========================================================================== */

function initNav() {
  const menu = $('#menu');
  const wide = window.matchMedia('(min-width: 861px)');

  if (menu && typeof menu.hidePopover === 'function') {
    wide.addEventListener('change', (event) => {
      if (event.matches) {
        try {
          menu.hidePopover();
        } catch {
          /* ya estaba cerrado */
        }
      }
    });
  }

  const langMenu = $('[data-lang-menu]');
  if (!langMenu) return;

  doc.addEventListener('click', (event) => {
    if (langMenu.open && !langMenu.contains(event.target)) langMenu.open = false;
  });

  langMenu.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && langMenu.open) {
      langMenu.open = false;
      $('summary', langMenu).focus();
    }
  });

  langMenu.addEventListener('focusout', (event) => {
    if (langMenu.open && event.relatedTarget && !langMenu.contains(event.relatedTarget)) langMenu.open = false;
  });
}
