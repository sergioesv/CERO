const Router = {
  routes: {},
  currentModule: null,
  currentView: null,
  
  register(path, handler) { this.routes[path] = handler; },
  
  init() {
    window.addEventListener('hashchange', () => this.handleRoute());
    this.handleRoute();
  },
  
  navigate(path) { window.location.hash = path; },
  
  getPath() { return window.location.hash.slice(1) || 'vehiculos/preoperacionales'; },
  
  handleRoute() {
    const path = this.getPath();
    const parts = path.split('/');
    const module = parts[0];
    const view = parts[1] || 'index';
    
    this.updateHeaderModules(module);
    
    if (module !== this.currentModule) {
      this.currentModule = module;
      Sidebar.render(module);
    }
    
    this.currentView = view;
    Sidebar.setActive(view);
    
    const handler = this.routes[path] || this.routes[`${module}/index`];
    if (handler) {
      handler();
    } else {
      this.renderNotFound();
    }
  },
  
  updateHeaderModules(activeModule) {
    const container = document.getElementById('header-modules');
    if (!container) return;
    
    const modules = [
      { id: 'vehiculos', label: 'Vehículos' },
      { id: 'seguridad', label: 'Seguridad' },
      { id: 'reportes', label: 'Reportes' }
    ];
    
    container.innerHTML = modules.map(m => `
      <button class="header-module ${m.id === activeModule ? 'active' : ''}" onclick="Router.navigate('${m.id}/index')">
        ${m.label}
      </button>
    `).join('');
  },
  
  renderNotFound() {
    document.getElementById('main').innerHTML = `
      <div class="main-content" style="text-align: center; padding-top: 100px;">
        <h1 style="font-size: 48px; color: var(--text-tertiary);">404</h1>
        <p class="text-secondary">Página no encontrada</p>
        <button class="btn btn-primary" onclick="Router.navigate('vehiculos/flota')" style="margin-top: 20px;">Ir al inicio</button>
      </div>
    `;
  }
};

window.Router = Router;

