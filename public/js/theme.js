const Theme = {
  STORAGE_KEY: 'cero_theme',
  LIGHT: 'light',
  DARK: 'dark',
  
  init() {
    const saved = localStorage.getItem(this.STORAGE_KEY);
    if (saved) {
      this.set(saved);
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.set(prefersDark ? this.DARK : this.LIGHT);
    }
    this.setupToggleButton();
  },
  
  get() { return document.body.getAttribute('data-theme') || this.LIGHT; },
  
  set(theme) {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem(this.STORAGE_KEY, theme);
    this.updateToggleButton();
    try {
      window.dispatchEvent(new CustomEvent('cero-theme-changed', { detail: { theme: theme } }));
    } catch (e) {
      /* noop */
    }
  },
  
  toggle() {
    this.set(this.get() === this.LIGHT ? this.DARK : this.LIGHT);
  },
  
  setupToggleButton() {
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.addEventListener('click', () => this.toggle());
      this.updateToggleButton();
    }
  },
  
  updateToggleButton() {
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      const isDark = this.get() === this.DARK;
      btn.textContent = isDark ? '☀️' : '🌙';
      btn.title = isDark ? 'Tema claro' : 'Tema oscuro';
    }
  }
};

window.Theme = Theme;


