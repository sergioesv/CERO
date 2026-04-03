const Router = {
  routes: {},
  currentView: null,

  register(path, handler) { this.routes[path] = handler; },

  init() {
    window.addEventListener('hashchange', () => this.handleRoute());
    this.handleRoute();
  },

  navigate(path) {
    window.location.hash = path;
  },

  getPath() {
    return window.location.hash.slice(1) || 'dashboard';
  },

  /**
   * Convierte rutas planas o legadas (#vehiculos/dashboard) al id de vista usado en permisos y Sidebar.
   */
  normalizeViewPath(path) {
    const parts = String(path || '').split('/').filter(Boolean);
    if (parts.length === 0) return 'dashboard';
    if (parts.length === 2 && parts[0] === 'vehiculos') return parts[1];
    if (parts.length === 2 && (parts[0] === 'seguridad' || parts[0] === 'reportes')) return 'dashboard';
    return parts[0];
  },

  handleRoute() {
    const path = this.getPath();
    const viewId = this.normalizeViewPath(path);

    if (window.App && !window.App.canAccessRoute(path)) {
      this.currentView = null;
      Sidebar.setActive(null);
      this.renderAccessDenied();
      if (window.Toast) window.Toast.error('Sin acceso');
      return;
    }

    this.currentView = viewId;
    Sidebar.setActive(viewId);

    const handler = this.routes[path] || this.routes[viewId];
    if (handler) {
      handler();
    } else {
      this.renderNotFound();
    }
  },

  renderAccessDenied() {
    document.getElementById('main').innerHTML = `
      <div class="main-content" style="text-align: center; padding-top: 100px;">
        <h1 style="font-size: 36px; color: var(--text-primary);">Sin acceso</h1>
        <p class="text-secondary">No tienes permiso para entrar a esta seccion.</p>
      </div>
    `;
  },

  renderNotFound() {
    document.getElementById('main').innerHTML = `
      <div class="main-content" style="text-align: center; padding-top: 100px;">
        <h1 style="font-size: 48px; color: var(--text-tertiary);">404</h1>
        <p class="text-secondary">Pagina no encontrada</p>
        <button class="btn btn-primary" onclick="Router.navigate('dashboard')" style="margin-top: 20px;">Ir al inicio</button>
      </div>
    `;
  }
};

window.Router = Router;
