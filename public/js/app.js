const PERMISOS = {
  dashboard:          ['superadmin_plataforma', 'superadmin_emp', 'administrador', 'supervisor'],
  preoperacionales:   ['superadmin_plataforma', 'superadmin_emp', 'administrador', 'supervisor'],
  posoperacionales:   ['superadmin_plataforma', 'superadmin_emp', 'administrador', 'supervisor'],
  tanqueos:           ['superadmin_plataforma', 'superadmin_emp', 'administrador', 'supervisor'],
  alertas:            ['superadmin_plataforma', 'superadmin_emp', 'administrador', 'supervisor'],
  flota:              ['superadmin_plataforma', 'superadmin_emp', 'administrador', 'supervisor'],
  conductores:        ['superadmin_plataforma', 'superadmin_emp', 'administrador'],
  sedes:              ['superadmin_plataforma', 'superadmin_emp'],
  usuarios:           ['superadmin_plataforma', 'superadmin_emp'],
  equipos:            ['superadmin_plataforma'],
  personal_campo:     ['superadmin_plataforma'],
  locaciones:         ['superadmin_plataforma'],
  ats:                ['superadmin_plataforma'],
  altura:             ['superadmin_plataforma'],
  riesgo_electrico:   ['superadmin_plataforma'],
  espacio_confinado:  ['superadmin_plataforma']
};

const App = {
  async init() {
    console.log('CERO Panel iniciando...');
    Theme.init();
    this.registerRoutes();
    Sidebar.render();
    Router.init();
    console.log('CERO Panel listo');
  },

  cerrarSesion: function() {
    sessionStorage.removeItem('cero_token');
    window.location.href = '/login';
  },

  renderPlaceholder(titulo, descripcion) {
    const main = document.getElementById('main');
    if (!main) return;
    main.innerHTML = `
      <div class="main-header">
        <div>
          <h1 class="main-title">${titulo}</h1>
          <p class="main-subtitle">${descripcion}</p>
        </div>
      </div>
      <div class="main-content">
        <div style="
          display:flex;flex-direction:column;align-items:center;justify-content:center;
          min-height:300px;gap:16px;text-align:center;
          color:var(--text-tertiary);
        ">
          <div style="font-size:48px;opacity:0.3;">🚧</div>
          <div style="font-size:18px;font-weight:500;color:var(--text-secondary);">Próximamente</div>
          <div style="font-size:14px;max-width:400px;line-height:1.6;">
            Este módulo está en desarrollo. Estará disponible en la próxima fase de CERO.
          </div>
        </div>
      </div>
    `;
  },

  registerRoutes() {
    Router.register('dashboard', () => window.Dashboard && window.Dashboard.render());
    Router.register('preoperacionales', () => Preoperacionales.render());
    Router.register('posoperacionales', () => PosoperacionalesModule.render());
    Router.register('tanqueos', () => Tanqueos.render());
    Router.register('alertas', () => AlertasModule.render());
    Router.register('flota', () => VehiculosFlota.render());
    Router.register('conductores', () => ConductoresModule.render());
    Router.register('sedes', () => SedesModule.render());
    Router.register('usuarios', () => UsuariosModule.render());

    Router.register('equipos', () =>
      App.renderPlaceholder('Inspección de equipos', 'Escaleras, arnés, taladros, EPP'));
    Router.register('personal_campo', () =>
      App.renderPlaceholder('Inspección de personal', 'Verificación de operarios antes de trabajar'));
    Router.register('locaciones', () =>
      App.renderPlaceholder('Inspección de locaciones', 'Registro de condiciones del sitio de trabajo'));
    Router.register('ats', () =>
      App.renderPlaceholder('ATS — Análisis de trabajo seguro', 'Identificación de riesgos antes de cada tarea'));
    Router.register('altura', () =>
      App.renderPlaceholder('Permiso de trabajo en altura', 'Autorización para trabajos a más de 1.5m'));
    Router.register('riesgo_electrico', () =>
      App.renderPlaceholder('Permiso de riesgo eléctrico', 'Trabajos en instalaciones energizadas'));
    Router.register('espacio_confinado', () =>
      App.renderPlaceholder('Permiso de espacio confinado', 'Entrada a espacios con riesgo de atmósfera peligrosa'));

    // Compatibilidad URLs antiguas #vehiculos/...
    Router.register('vehiculos/dashboard', () => Router.navigate('dashboard'));
    Router.register('vehiculos/preoperacionales', () => Router.navigate('preoperacionales'));
    Router.register('vehiculos/posoperacionales', () => Router.navigate('posoperacionales'));
    Router.register('vehiculos/tanqueos', () => Router.navigate('tanqueos'));
    Router.register('vehiculos/alertas', () => Router.navigate('alertas'));
    Router.register('vehiculos/flota', () => Router.navigate('flota'));
    Router.register('vehiculos/conductores', () => Router.navigate('conductores'));
    Router.register('vehiculos/sedes', () => Router.navigate('sedes'));
    Router.register('vehiculos/usuarios', () => Router.navigate('usuarios'));
    Router.register('vehiculos/index', () => Router.navigate('dashboard'));
    Router.register('seguridad/index', () => Router.navigate('dashboard'));
    Router.register('reportes/index', () => Router.navigate('dashboard'));
  }
};

function normalizeRoleName(role) {
  return String(role || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function classifyRole(role) {
  const normalized = normalizeRoleName(role);

  if (!normalized) return null;
  if (normalized === 'superadmin_plataforma') return 'superadmin_plataforma';
  if (normalized === 'superadmin_emp' || normalized === 'superadmin_empresa') return 'superadmin_emp';
  if (normalized === 'administrador') return 'administrador';
  if (normalized === 'supervisor') return 'supervisor';

  if (normalized.includes('superadmin')) {
    return normalized.includes('emp') || normalized.includes('empresa')
      ? 'superadmin_emp'
      : 'superadmin_plataforma';
  }

  if (normalized.includes('administrador')) return 'administrador';
  if (normalized.includes('supervisor')) return 'supervisor';
  return null;
}

function getRolesFromToken() {
  const token = sessionStorage.getItem('cero_token');
  if (!token) return [];

  try {
    const payloadBase64 = token.split('.')[1];
    if (!payloadBase64) return [];

    const base64 = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const payload = JSON.parse(atob(padded));
    return Array.isArray(payload.roles) ? payload.roles : [];
  } catch (error) {
    console.error('No se pudo decodificar el token:', error);
    return [];
  }
}

App.getRolesFromToken = getRolesFromToken;
App.normalizeRoleName = normalizeRoleName;
App.classifyRole = classifyRole;
App.getCanonicalRoles = function getCanonicalRoles() {
  const roles = this.getRolesFromToken();
  return [...new Set(roles.map((role) => this.classifyRole(role)).filter(Boolean))];
};

App.canAccessItem = function canAccessItem(itemId) {
  const allowedRoles = PERMISOS[itemId];
  if (!allowedRoles) return true;

  const roles = this.getCanonicalRoles();
  return roles.some((role) => allowedRoles.includes(role));
};

App.canAccessRoute = function canAccessRoute(path) {
  const itemId = Router.normalizeViewPath(path);
  return this.canAccessItem(itemId);
};

window.getRolesFromToken = getRolesFromToken;
document.addEventListener('DOMContentLoaded', () => App.init());
window.App = App;
window.CeroApp = App;
