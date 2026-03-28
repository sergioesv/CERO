const App = {
  routePermissions: {
    'vehiculos/dashboard': 'dashboard',
    'vehiculos/flota': 'flota',
    'vehiculos/preoperacionales': 'preoperacionales',
    'vehiculos/posoperacionales': 'posoperacionales',
    'vehiculos/tanqueos': 'tanqueos',
    'vehiculos/alertas': 'alertas',
    'vehiculos/conductores': 'conductores',
    'vehiculos/sedes': 'sedes',
    'vehiculos/usuarios': 'usuarios'
  },

  itemPermissions: {
    dashboard: ['superadmin_plataforma', 'superadmin_emp', 'administrador', 'supervisor'],
    flota: ['superadmin_plataforma', 'superadmin_emp', 'administrador', 'supervisor'],
    preoperacionales: ['superadmin_plataforma', 'superadmin_emp', 'administrador', 'supervisor'],
    posoperacionales: ['superadmin_plataforma', 'superadmin_emp', 'administrador', 'supervisor'],
    tanqueos: ['superadmin_plataforma', 'superadmin_emp', 'administrador', 'supervisor'],
    alertas: ['superadmin_plataforma', 'superadmin_emp', 'administrador', 'supervisor'],
    conductores: ['superadmin_plataforma', 'superadmin_emp', 'administrador'],
    sedes: ['superadmin_plataforma', 'superadmin_emp'],
    usuarios: ['superadmin_plataforma', 'superadmin_emp']
  },

  async init() {
    console.log('CERO Panel iniciando...');
    Theme.init();
    this.registerRoutes();
    Router.init();
    console.log('CERO Panel listo');
  },

  registerRoutes() {
    Router.register('vehiculos/index', () => Router.navigate('vehiculos/dashboard'));
    Router.register('vehiculos/dashboard', () => window.Dashboard && window.Dashboard.render());
    Router.register('vehiculos/flota', () => VehiculosFlota.render());
    Router.register('vehiculos/conductores', () => ConductoresModule.render());
    Router.register('vehiculos/sedes', () => SedesModule.render());
    Router.register('vehiculos/usuarios', () => UsuariosModule.render());
    Router.register('vehiculos/alertas', () => AlertasModule.render());

    Router.register('vehiculos/preoperacionales', () => Preoperacionales.render());

    Router.register('vehiculos/posoperacionales', () => PosoperacionalesModule.render());
    Router.register('vehiculos/tanqueos', () => TanqueosModule.render());

    Router.register('seguridad/index', () => {
      document.getElementById('main').innerHTML = `
        <div class="main-header"><div><h1 class="main-title">Seguridad del Personal</h1><p class="main-subtitle">Fase 3</p></div></div>
        <div class="main-content"><p class="text-secondary">Proximamente: arnes, escaleras, ATS</p></div>
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
  const allowedRoles = this.itemPermissions[itemId];
  if (!allowedRoles) return true;

  const roles = this.getCanonicalRoles();
  return roles.some((role) => allowedRoles.includes(role));
};

App.canAccessRoute = function canAccessRoute(path) {
  const itemId = this.routePermissions[path];
  if (!itemId) return true;
  return this.canAccessItem(itemId);
};

window.getRolesFromToken = getRolesFromToken;
document.addEventListener('DOMContentLoaded', () => App.init());
window.App = App;
