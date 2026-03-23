// =============================================================================
// Módulo Sedes — Panel web CERO
// Patrón: stats cards + tabla + drawer lateral
// =============================================================================

window.SedesModule = (() => {
  // --------------------------------------------------------------------------
  // Estado interno
  // --------------------------------------------------------------------------
  let sedes = [];
  let sedeSeleccionada = null;
  let filtroActivo = 'todos'; // 'todos' | 'activas' | 'inactivas'

  function authHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + (sessionStorage.getItem('cero_token') || '')
    };
  }

  // --------------------------------------------------------------------------
  // Punto de entrada — llamado por el router al navegar a Sedes
  // --------------------------------------------------------------------------
  function render() {
    const main = document.getElementById('main');
    main.innerHTML = `
      <div class="main-header">
        <div>
          <h1 class="main-title">Sedes</h1>
          <p class="main-subtitle">Gestión de sedes y ubicaciones</p>
        </div>
        <div class="main-actions">
          <button class="btn btn-primary" onclick="SedesModule.abrirNuevo()">+ Nueva sede</button>
        </div>
      </div>
      <div class="main-content">
        <!-- Stat cards -->
        <div id="sedes-stats" class="stats-grid"></div>

        <!-- Barra de filtros y búsqueda -->
        <div class="filters-row">
          <div class="search-box">
            <input
              type="text"
              id="sedes-search"
              class="input input-sm"
              placeholder="Buscar por nombre o ciudad..."
              oninput="SedesModule.filtrar()"
            />
          </div>
          <select id="sedes-filtro" class="input input-sm" onchange="SedesModule.filtrar()">
            <option value="todos">Todas</option>
            <option value="activas">Activas</option>
            <option value="inactivas">Inactivas</option>
          </select>
        </div>

        <!-- Tabla -->
        <div id="sedes-tabla">
          <table class="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Ciudad</th>
                <th>Dirección</th>
                <th>Empresa</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody id="sedes-tbody">
              <tr><td colspan="5" class="table-empty">Cargando...</td></tr>
            </tbody>
          </table>
        </div>

        <!-- Drawer lateral -->
        <div id="sede-drawer" class="drawer">
          <div class="drawer-content" id="sede-drawer-content"></div>
        </div>
        <div id="sede-overlay" class="drawer-overlay" onclick="SedesModule.cerrarDrawer()"></div>
      </div>
    `;

    cargarDatos();
  }

  // --------------------------------------------------------------------------
  // Carga de datos desde la API
  // --------------------------------------------------------------------------
  async function cargarDatos() {
    try {
      const res = await fetch('/api/sedes', { headers: authHeaders() });
      if (res.status === 403) {
        sedes = [];
        renderStats();
        const tbody = document.getElementById('sedes-tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="table-empty">Sin acceso</td></tr>';
        mostrarToast('Sin acceso', 'error');
        return;
      }

      if (!res.ok) {
        throw new Error('Error HTTP ' + res.status);
      }

      const data = await res.json();
      sedes = data.data || data || [];
      renderStats();
      renderTabla(sedes);
    } catch (err) {
      console.error('Error cargando sedes:', err);
      const tbody = document.getElementById('sedes-tbody');
      if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="table-empty">Error al cargar sedes</td></tr>';
    }
  }

  // --------------------------------------------------------------------------
  // Render de stat cards
  // --------------------------------------------------------------------------
  function renderStats() {
    const activas   = sedes.filter(s => s.activa);
    const inactivas = sedes.filter(s => !s.activa);

    const statsEl = document.getElementById('sedes-stats');
    if (!statsEl) return;

    statsEl.innerHTML = `
      <div class="stat-card ${filtroActivo === 'todos'    ? 'active' : ''}" onclick="SedesModule.aplicarFiltroCard('todos')">
        <div class="stat-value">${sedes.length}</div>
        <div class="stat-label">Total sedes</div>
      </div>
      <div class="stat-card ${filtroActivo === 'activas'  ? 'active' : ''}" onclick="SedesModule.aplicarFiltroCard('activas')">
        <div class="stat-value">${activas.length}</div>
        <div class="stat-label">Activas</div>
      </div>
      <div class="stat-card ${filtroActivo === 'inactivas' ? 'active' : ''}" onclick="SedesModule.aplicarFiltroCard('inactivas')">
        <div class="stat-value">${inactivas.length}</div>
        <div class="stat-label">Inactivas</div>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // Render de tabla
  // --------------------------------------------------------------------------
  function renderTabla(lista) {
    const tbody = document.getElementById('sedes-tbody');
    if (!tbody) return;

    if (!lista || lista.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="table-empty">Sin sedes para mostrar</td></tr>';
      return;
    }

    tbody.innerHTML = lista.map(s => `
      <tr class="table-row" onclick="SedesModule.abrirDrawer('${s.id}')">
        <td>${s.nombre}</td>
        <td>${s.ciudad || '—'}</td>
        <td>${s.direccion || '—'}</td>
        <td>${s.empresas?.nombre || s.empresa_id || '—'}</td>
        <td>${s.activa
          ? '<span class="badge badge-success">Activa</span>'
          : '<span class="badge badge-danger">Inactiva</span>'
        }</td>
      </tr>
    `).join('');
  }

  // --------------------------------------------------------------------------
  // Filtro combinado (texto + select)
  // --------------------------------------------------------------------------
  function filtrar() {
    const texto  = (document.getElementById('sedes-search')?.value || '').toLowerCase();
    const filtro = document.getElementById('sedes-filtro')?.value || 'todos';

    const lista = sedes.filter(s => {
      const matchTexto = !texto ||
        s.nombre.toLowerCase().includes(texto) ||
        (s.ciudad || '').toLowerCase().includes(texto);

      let matchFiltro = true;
      if      (filtro === 'activas')   matchFiltro = s.activa;
      else if (filtro === 'inactivas') matchFiltro = !s.activa;

      return matchTexto && matchFiltro;
    });

    renderTabla(lista);
  }

  // --------------------------------------------------------------------------
  // Filtro desde stat card
  // --------------------------------------------------------------------------
  function aplicarFiltroCard(valor) {
    filtroActivo = valor;
    const select = document.getElementById('sedes-filtro');
    if (select) select.value = valor;
    renderStats();
    filtrar();
  }

  // --------------------------------------------------------------------------
  // Drawer — abrir con detalle de la sede
  // --------------------------------------------------------------------------
  function abrirDrawer(id) {
    sedeSeleccionada = sedes.find(s => s.id === id);
    if (!sedeSeleccionada) return;

    const s = sedeSeleccionada;

    document.getElementById('sede-drawer-content').innerHTML = `
      <div class="drawer-header">
        <h2 class="drawer-title">${s.nombre}</h2>
        <button class="drawer-close" onclick="SedesModule.cerrarDrawer()">✕</button>
      </div>

      <div class="drawer-section">
        <div class="detail-grid">
          <div class="detail-item">
            <span class="detail-label">Nombre</span>
            <span class="detail-value">${s.nombre}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Ciudad</span>
            <span class="detail-value">${s.ciudad || 'Sin registro'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Dirección</span>
            <span class="detail-value">${s.direccion || 'Sin registro'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Empresa</span>
            <span class="detail-value">${s.empresas?.nombre || s.empresa_id || 'Sin registro'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Estado</span>
            <span class="detail-value">
              ${s.activa
                ? '<span class="badge badge-success">Activa</span>'
                : '<span class="badge badge-danger">Inactiva</span>'
              }
            </span>
          </div>
        </div>
      </div>

      <div class="drawer-actions">
        <button class="btn btn-primary" onclick="SedesModule.abrirEditar('${s.id}')">
          Editar
        </button>
        <button class="btn ${s.activa ? 'btn-danger' : 'btn-success'}"
          onclick="SedesModule.toggleEstado('${s.id}', ${!s.activa})">
          ${s.activa ? 'Desactivar' : 'Activar'}
        </button>
      </div>
    `;

    document.getElementById('sede-drawer').classList.add('open');
    document.getElementById('sede-overlay').classList.add('open');
  }

  // --------------------------------------------------------------------------
  // Cerrar drawer
  // --------------------------------------------------------------------------
  function cerrarDrawer() {
    document.getElementById('sede-drawer')?.classList.remove('open');
    document.getElementById('sede-overlay')?.classList.remove('open');
    sedeSeleccionada = null;
  }

  // --------------------------------------------------------------------------
  // Modal crear / editar
  // --------------------------------------------------------------------------
  function abrirNuevo() {
    abrirModal(null);
  }

  function abrirEditar(id) {
    const s = sedes.find(s => s.id === id);
    abrirModal(s);
  }

  function abrirModal(sede) {
    const esEdicion = !!sede;
    const s = sede || {};

    document.getElementById('modal-sede')?.remove();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'modal-sede';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>${esEdicion ? 'Editar sede' : 'Nueva sede'}</h3>
          <button class="modal-close" onclick="document.getElementById('modal-sede').remove()">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Nombre *</label>
            <input type="text" id="f-nombre" class="input" value="${s.nombre || ''}" placeholder="Nombre de la sede" />
          </div>
          <div class="form-group">
            <label>Ciudad</label>
            <input type="text" id="f-ciudad" class="input" value="${s.ciudad || ''}" placeholder="Ciudad" />
          </div>
          <div class="form-group">
            <label>Dirección</label>
            <input type="text" id="f-direccion" class="input" value="${s.direccion || ''}" placeholder="Dirección completa" />
          </div>
          <div class="form-group">
            <label>Empresa ID</label>
            <input type="text" id="f-empresa" class="input" value="${s.empresa_id || ''}" placeholder="ID de la empresa" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('modal-sede').remove()">Cancelar</button>
          <button class="btn btn-primary" onclick="SedesModule.guardar('${s.id || ''}')">
            ${esEdicion ? 'Guardar cambios' : 'Crear sede'}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  // --------------------------------------------------------------------------
  // Guardar (crear o editar)
  // --------------------------------------------------------------------------
  async function guardar(id) {
    const nombre    = document.getElementById('f-nombre')?.value.trim();
    const ciudad    = document.getElementById('f-ciudad')?.value.trim();
    const direccion = document.getElementById('f-direccion')?.value.trim();
    const empresa_id = document.getElementById('f-empresa')?.value.trim() || null;

    if (!nombre) return mostrarToast('El nombre es obligatorio', 'error');

    const body = { nombre, ciudad, direccion, empresa_id };

    try {
      const esEdicion = !!id;
      const url    = esEdicion ? `/api/sedes/${id}` : '/api/sedes';
      const method = esEdicion ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: authHeaders(),
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const err = await res.json();
        return mostrarToast(err.error || 'Error al guardar', 'error');
      }

      document.getElementById('modal-sede')?.remove();
      cerrarDrawer();
      mostrarToast(esEdicion ? 'Sede actualizada' : 'Sede creada', 'success');
      await cargarDatos();
    } catch (err) {
      console.error('Error guardando sede:', err);
      mostrarToast('Error de conexión', 'error');
    }
  }

  // --------------------------------------------------------------------------
  // Activar / desactivar sede
  // --------------------------------------------------------------------------
  async function toggleEstado(id, nuevoEstado) {
    try {
      const res = await fetch(`/api/sedes/${id}/estado`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ activa: nuevoEstado })
      });

      if (!res.ok) return mostrarToast('Error al actualizar estado', 'error');

      mostrarToast(nuevoEstado ? 'Sede activada' : 'Sede desactivada', 'success');
      cerrarDrawer();
      await cargarDatos();
    } catch (err) {
      mostrarToast('Error de conexión', 'error');
    }
  }

  // --------------------------------------------------------------------------
  // Helper toast
  // --------------------------------------------------------------------------
  function mostrarToast(msg, tipo) {
    if (window.Toast) {
      window.Toast.show(msg, tipo);
    } else {
      console.log(`[${tipo}] ${msg}`);
    }
  }

  // --------------------------------------------------------------------------
  // API pública
  // --------------------------------------------------------------------------
  return {
    render,
    cargarDatos,
    filtrar,
    aplicarFiltroCard,
    abrirDrawer,
    cerrarDrawer,
    abrirNuevo,
    abrirEditar,
    guardar,
    toggleEstado
  };
})();
