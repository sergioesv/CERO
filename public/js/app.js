const App = {
  async init() {
    console.log('🚀 CERO Panel — Iniciando...');
    Theme.init();
    this.registerRoutes();
    Router.init();
    console.log('✅ CERO Panel — Listo');
  },
  
  registerRoutes() {
    Router.register('vehiculos/index', () => Router.navigate('vehiculos/flota'));
    Router.register('vehiculos/flota', () => VehiculosFlota.render());
    
    Router.register('vehiculos/conductores', () => {
      document.getElementById('main').innerHTML = `
        <div class="main-header"><div><h1 class="main-title">Conductores</h1></div></div>
        <div class="main-content"><p class="text-secondary">Módulo pendiente</p></div>
      `;
    });
    
    Router.register('vehiculos/alertas', () => {
      document.getElementById('main').innerHTML = `
        <div class="main-header"><div><h1 class="main-title">Alertas</h1></div></div>
        <div class="main-content"><p class="text-secondary">Módulo pendiente</p></div>
      `;
    });
    
    Router.register('vehiculos/preoperacionales', () => {
      document.getElementById('main').innerHTML = `
        <div class="main-header"><div><h1 class="main-title">Preoperacionales</h1></div></div>
        <div class="main-content"><p class="text-secondary">Módulo pendiente</p></div>
      `;
    });
    
    Router.register('vehiculos/posoperacionales', () => {
      document.getElementById('main').innerHTML = `
        <div class="main-header"><div><h1 class="main-title">Posoperacionales</h1></div></div>
        <div class="main-content"><p class="text-secondary">Módulo pendiente</p></div>
      `;
    });
    
    Router.register('vehiculos/tanqueos', () => {
      document.getElementById('main').innerHTML = `
        <div class="main-header"><div><h1 class="main-title">Tanqueos</h1></div></div>
        <div class="main-content"><p class="text-secondary">Módulo pendiente</p></div>
      `;
    });
    
    Router.register('seguridad/index', () => {
      document.getElementById('main').innerHTML = `
        <div class="main-header"><div><h1 class="main-title">Seguridad del Personal</h1><p class="main-subtitle">Fase 3</p></div></div>
        <div class="main-content"><p class="text-secondary">Próximamente: arnés, escaleras, ATS</p></div>
      `;
    });
    
    Router.register('reportes/index', () => {
      document.getElementById('main').innerHTML = `
        <div class="main-header"><div><h1 class="main-title">Reportes</h1></div></div>
        <div class="main-content"><p class="text-secondary">En desarrollo</p></div>
      `;
    });
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
window.App = App;
