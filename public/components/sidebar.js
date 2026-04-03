const Sidebar = {

  // Módulos solo visibles para superadmin_plataforma
  SOLO_SUPERADMIN: [
    'equipos', 'personal_campo', 'locaciones',
    'ats', 'altura', 'riesgo_electrico', 'espacio_confinado'
  ],

  badges: {},

  render() {
    const container = document.getElementById('sidebar');
    if (!container) return;

    const canonicalRoles = window.App && typeof window.App.getCanonicalRoles === 'function'
      ? window.App.getCanonicalRoles()
      : [];

    const esSuperAdmin = canonicalRoles.includes('superadmin_plataforma');

    const sections = [
      {
        title: 'Resumen',
        items: [
          { id: 'dashboard', label: 'Dashboard', route: 'dashboard' }
        ]
      },
      {
        title: 'Inspecciones',
        items: [
          { id: 'preoperacionales',  label: 'Vehículos',   route: 'preoperacionales' },
          { id: 'equipos',           label: 'Equipos',     route: 'equipos',          soloSuperAdmin: true },
          { id: 'personal_campo',    label: 'Personal',    route: 'personal_campo',   soloSuperAdmin: true },
          { id: 'locaciones',        label: 'Locaciones',  route: 'locaciones',       soloSuperAdmin: true }
        ]
      },
      {
        title: 'Permisos de trabajo',
        soloSuperAdmin: true,
        items: [
          { id: 'ats',               label: 'ATS',                    route: 'ats',               soloSuperAdmin: true },
          { id: 'altura',            label: 'Trabajo en altura',      route: 'altura',            soloSuperAdmin: true },
          { id: 'riesgo_electrico',  label: 'Riesgo eléctrico',       route: 'riesgo_electrico',  soloSuperAdmin: true },
          { id: 'espacio_confinado', label: 'Espacio confinado',      route: 'espacio_confinado', soloSuperAdmin: true }
        ]
      },
      {
        title: 'Registro operativo',
        items: [
          { id: 'tanqueos',     label: 'Tanqueos', route: 'tanqueos' },
          { id: 'alertas',      label: 'Alertas',  route: 'alertas',  badge: { type: 'danger', count: 0 } },
          { id: 'posoperacionales', label: 'Posoperacionales', route: 'posoperacionales' }
        ]
      },
      {
        title: 'Activos',
        items: [
          { id: 'flota',        label: 'Flota',        route: 'flota' },
          { id: 'conductores',  label: 'Conductores',  route: 'conductores' }
        ]
      },
      {
        title: 'Empresa',
        items: [
          { id: 'sedes',    label: 'Sedes',    route: 'sedes' },
          { id: 'usuarios', label: 'Usuarios', route: 'usuarios' }
        ]
      }
    ];

    let html = '';
    let firstVisibleSection = true;

    sections.forEach((section) => {
      if (section.soloSuperAdmin && !esSuperAdmin) return;

      const visibleItems = section.items.filter(item => {
        if (item.soloSuperAdmin && !esSuperAdmin) return false;
        return !window.App || window.App.canAccessItem(item.id);
      });

      if (visibleItems.length === 0) return;

      if (!firstVisibleSection) html += '<div class="sidebar-divider"></div>';
      firstVisibleSection = false;

      html += '<div class="sidebar-section">';

      const labelExtra = section.soloSuperAdmin
        ? ' <span style="font-size:9px;opacity:0.5;vertical-align:middle;">BETA</span>'
        : '';
      html += `<div class="sidebar-section-title">${section.title}${labelExtra}</div>`;

      visibleItems.forEach(item => {
        const badge = this.badges[item.id] || (item.badge && item.badge.count > 0 ? item.badge : null);
        const badgeHtml = badge ? `<span class="sidebar-item-badge ${badge.type}">${badge.count}</span>` : '';

        const proximamente = item.soloSuperAdmin
          ? ' style="opacity:0.6;"'
          : '';

        html += `<a href="#${item.route}" class="sidebar-item" data-view="${item.id}"
          onclick="if(window.innerWidth<=768)toggleSidebar()"
          ${proximamente}>
          <span>${item.label}</span>
          ${item.soloSuperAdmin ? '<span style="font-size:10px;opacity:0.5;margin-left:auto;">pronto</span>' : ''}
          ${badgeHtml}
        </a>`;
      });

      html += '</div>';
    });

    const footerHtml = `<div class="sidebar-footer">
  <button class="sidebar-logout" onclick="CeroApp.cerrarSesion()">
    Cerrar sesión
  </button>
</div>`;
    container.innerHTML = `<div class="sidebar-nav">${html}</div>${footerHtml}`;
  },

  setActive(viewId) {
    const container = document.getElementById('sidebar');
    if (!container) return;
    container.querySelectorAll('.sidebar-item').forEach(item => item.classList.remove('active'));
    if (viewId == null || viewId === '') return;
    const active = container.querySelector(`[data-view="${viewId}"]`);
    if (active) active.classList.add('active');
  },

  updateBadge(itemId, count, type = 'danger') {
    this.badges[itemId] = { type, count };
  }
};

window.Sidebar = Sidebar;

function toggleSidebar() {
  var sidebar = document.getElementById('sidebar');
  var overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.toggle('abierto');
  if (overlay) overlay.classList.toggle('visible');
}
window.toggleSidebar = toggleSidebar;
