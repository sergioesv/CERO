const Sidebar = {
  menus: {
    vehiculos: {
      sections: [
        {
          title: 'Operación',
          items: [
            { id: 'preoperacionales', label: 'Preoperacionales', route: 'vehiculos/preoperacionales' },
            { id: 'posoperacionales', label: 'Posoperacionales', route: 'vehiculos/posoperacionales' },
            { id: 'tanqueos', label: 'Tanqueos', route: 'vehiculos/tanqueos' }
          ]
        }
      ]
    },
            {
          title: 'Vehículos',
          items: [
            { id: 'flota', label: 'Flota', route: 'vehiculos/flota' },
            { id: 'conductores', label: 'Conductores', route: 'vehiculos/conductores' },
            { id: 'alertas', label: 'Alertas', route: 'vehiculos/alertas', badge: { type: 'danger', count: 0 } }
          ]
        },
    seguridad: {
      sections: [
        {
          title: 'Equipos',
          items: [
            { id: 'arnes', label: 'Arnés', route: 'seguridad/arnes' },
            { id: 'escaleras', label: 'Escaleras', route: 'seguridad/escaleras' }
          ]
        }
      ]
    },
    reportes: {
      sections: [
        {
          title: 'Reportes',
          items: [
            { id: 'historial', label: 'Historial', route: 'reportes/historial' },
            { id: 'estadisticas', label: 'Estadísticas', route: 'reportes/estadisticas' }
          ]
        }
      ]
    }
  },
  
  badges: {},
  
  render(module) {
    const container = document.getElementById('sidebar');
    if (!container) return;
    
    const menu = this.menus[module];
    if (!menu) { container.innerHTML = ''; return; }
    
    let html = '';
    menu.sections.forEach((section, i) => {
      if (i > 0) html += '<div class="sidebar-divider"></div>';
      html += `<div class="sidebar-section"><div class="sidebar-section-title">${section.title}</div>`;
      section.items.forEach(item => {
        const badge = this.badges[item.id] || (item.badge && item.badge.count > 0 ? item.badge : null);
        const badgeHtml = badge ? `<span class="sidebar-item-badge ${badge.type}">${badge.count}</span>` : '';
        html += `<a href="#${item.route}" class="sidebar-item" data-view="${item.id}"><span>${item.label}</span>${badgeHtml}</a>`;
      });
      html += '</div>';
    });
    container.innerHTML = html;
  },
  
  setActive(viewId) {
    const container = document.getElementById('sidebar');
    if (!container) return;
    container.querySelectorAll('.sidebar-item').forEach(item => item.classList.remove('active'));
    const active = container.querySelector(`[data-view="${viewId}"]`);
    if (active) active.classList.add('active');
  },
  
  updateBadge(itemId, count, type = 'danger') {
    this.badges[itemId] = { type, count };
  }
};

window.Sidebar = Sidebar;

