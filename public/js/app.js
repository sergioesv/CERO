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
    this.actualizarHeaderUsuario();
    Router.init();
    // Bloquear panel si el usuario debe cambiar su password
    if (this.debeCambiarPassword()) {
      this.mostrarModalCambiarPassword();
    }
    console.log('CERO Panel listo');
  },

  actualizarHeaderUsuario() {
    const headerUser = document.getElementById('header-user');
    if (!headerUser) return;

    const payload = Utils.getJwtPayload();
    if (!payload) {
      headerUser.textContent = 'Usuario';
      return;
    }

    try {
      const nombre = payload.nombre || 'Usuario';
      const roles = payload.roles || [];

      // Tomar el primer rol y capitalizarlo
      let rolDisplay = 'Usuario';
      if (roles.length > 0) {
        const rol = roles[0];
        // Mapeo de roles técnicos a nombres legibles
        const mapeoRoles = {
          'superadmin_plataforma': 'Superadmin',
          'superadmin_emp': 'Superadmin Empresa',
          'administrador': 'Administrador',
          'supervisor': 'Supervisor',
          'conductor': 'Conductor',
          'mantenimiento': 'Mantenimiento',
          'sst': 'SST',
          'auditor_interno': 'Auditor Interno',
          'auditor_externo': 'Auditor Externo',
          'reportes': 'Reportes'
        };

        rolDisplay = mapeoRoles[rol] || rol.charAt(0).toUpperCase() + rol.slice(1).replace(/_/g, ' ');
      }

      headerUser.textContent = rolDisplay;
      headerUser.title = `${nombre} · ${rolDisplay}`;
    } catch (e) {
      console.error('Error actualizando header usuario:', e);
      headerUser.textContent = 'Usuario';
    }
  },

  debeCambiarPassword() {
    const payload = Utils.getJwtPayload();
    return payload ? !!payload.debe_cambiar_password : false;
  },

  mostrarModalCambiarPassword() {
    document.getElementById('modal-cambiar-pass')?.remove();
    const modal = document.createElement('div');
    modal.id = 'modal-cambiar-pass';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = `
      <div style="background:var(--bg-primary,#1a1a2e);border:1px solid var(--border-color,#333);border-radius:12px;padding:32px;width:100%;max-width:420px;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
        <h2 style="margin:0 0 8px;font-size:20px;">Cambiar contrasena</h2>
        <p style="margin:0 0 24px;font-size:14px;opacity:0.7;">Tu cuenta tiene una contrasena temporal. Debes cambiarla para continuar.</p>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <input type="password" id="cp-actual" class="input" placeholder="Contrasena actual" />
          <input type="password" id="cp-nueva" class="input" placeholder="Nueva contrasena (min. 8 caracteres)" />
          <input type="password" id="cp-confirmar" class="input" placeholder="Confirmar nueva contrasena" />
          <div id="cp-error" style="color:#ef4444;font-size:13px;display:none;"></div>
          <button class="btn btn-primary" onclick="App.guardarNuevaPassword()" style="margin-top:4px;">Cambiar contrasena</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },

  async guardarNuevaPassword() {
    const actual     = document.getElementById('cp-actual')?.value;
    const nueva      = document.getElementById('cp-nueva')?.value;
    const confirmar  = document.getElementById('cp-confirmar')?.value;
    const errorEl    = document.getElementById('cp-error');

    const mostrarError = (msg) => { if (errorEl) { errorEl.textContent = msg; errorEl.style.display = 'block'; } };
    if (errorEl) errorEl.style.display = 'none';

    if (!actual || !nueva || !confirmar) return mostrarError('Todos los campos son obligatorios');
    if (nueva.length < 8)               return mostrarError('La nueva contrasena debe tener al menos 8 caracteres');
    if (nueva !== confirmar)             return mostrarError('Las contrasenas no coinciden');
    if (actual === nueva)               return mostrarError('La nueva contrasena debe ser diferente a la actual');

    try {
      const res = await fetch('/auth/cambiar-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sessionStorage.getItem('cero_token') },
        body: JSON.stringify({ password_actual: actual, password_nueva: nueva })
      });
      const data = await res.json();
      if (!res.ok) return mostrarError(data.error || 'Error al cambiar contrasena');

      // Exito: cerrar sesion para forzar login con nuevo JWT sin el flag
      sessionStorage.removeItem('cero_token');
      window.location.href = '/login';
    } catch (err) {
      mostrarError('Error de conexion');
    }
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
    Router.register('cambiar-password', () => App.mostrarModalCambiarPassword());

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

App.getRolesFromToken = function() { return Utils.getRoles(); };
App.getEmpresaId = function() { return Utils.getEmpresaId(); };
App.normalizeRoleName = normalizeRoleName;
App.classifyRole = classifyRole;
App.getCanonicalRoles = function getCanonicalRoles() {
  const roles = Utils.getRoles();
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

document.addEventListener('DOMContentLoaded', () => App.init());
window.App = App;
window.CeroApp = App; // Utilizado en index.html para cerrar sesión
