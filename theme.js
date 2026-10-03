/* Theme runs before styles and Supabase, so the saved mode appears immediately. */
(() => {
  const storageKey = 'ledger-theme';
  const root = document.documentElement;
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  let preference = null;

  try {
    const saved = localStorage.getItem(storageKey);
    if (saved === 'light' || saved === 'dark') preference = saved;
  } catch (_) {
    // The toggle still works when browser storage is unavailable.
  }

  function applyTheme(theme) {
    root.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#111827' : '#f7f9fc');
    const toggle = document.getElementById('themeToggle');
    if (toggle) {
      const dark = theme === 'dark';
      toggle.setAttribute('aria-pressed', String(dark));
      toggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
      toggle.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
    }
  }

  applyTheme(preference || (system.matches ? 'dark' : 'light'));

  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(root.dataset.theme);
    document.getElementById('themeToggle')?.addEventListener('click', () => {
      preference = root.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(preference);
      try { localStorage.setItem(storageKey, preference); } catch (_) {}
    });
  });

  system.addEventListener('change', event => {
    if (!preference) applyTheme(event.matches ? 'dark' : 'light');
  });

  // Keep open tabs in sync when the preference changes elsewhere.
  window.addEventListener('storage', event => {
    if (event.key !== storageKey) return;
    preference = event.newValue === 'dark' || event.newValue === 'light' ? event.newValue : null;
    applyTheme(preference || (system.matches ? 'dark' : 'light'));
  });
})();
