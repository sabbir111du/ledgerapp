/* Compact mobile navigation reuses the existing sidebar routes. */
(() => {
  const menu = document.getElementById('mobileMenuToggle');
  const sidebar = document.getElementById('appSidebar');
  const backdrop = document.getElementById('navBackdrop');
  const mobile = window.matchMedia('(max-width: 760px)');
  let open = false;
  let previousOverflow = '';

  function setOpen(next, restoreFocus = true) {
    const wasOpen = open;
    open = mobile.matches && next;
    sidebar.classList.toggle('mobile-open', open);
    backdrop.classList.toggle('hidden', !open);
    menu.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    sidebar.inert = mobile.matches && !open;
    if (mobile.matches) sidebar.setAttribute('aria-hidden', String(!open));
    else sidebar.removeAttribute('aria-hidden');

    if (open && !wasOpen) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      sidebar.querySelector('.tabs button.active')?.focus();
    } else if (wasOpen && !open) {
      document.body.style.overflow = previousOverflow;
      if (restoreFocus) menu.focus();
    }
  }

  menu.addEventListener('click', () => setOpen(!open));
  document.getElementById('mobileMenuClose').addEventListener('click', () => setOpen(false));
  backdrop.addEventListener('click', () => setOpen(false));
  sidebar.addEventListener('click', event => {
    if (event.target.closest('[data-view], #brandHome, #sidebarSettings')) setOpen(false);
  });
  document.getElementById('mobileHome').addEventListener('click', event => {
    event.preventDefault();
    document.getElementById('brandHome').click();
    setOpen(false, false);
  });
  document.addEventListener('keydown', event => {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === 'Tab') {
      const controls = [...sidebar.querySelectorAll('a[href], button:not(:disabled)')];
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    }
  });
  mobile.addEventListener('change', () => setOpen(false, false));
  setOpen(false, false);
})();
