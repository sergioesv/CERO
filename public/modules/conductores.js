// =============================================================================
// Módulo Conductores — Panel web CERO
// Patrón: stats cards + tabla + drawer lateral
// v2 — campo sede agregado, diseño mejorado
// =============================================================================

window.ConductoresModule = (() => {
  let conductores = [];
  let sedes = [];
  let conductorSeleccionado = null;
  let filtroActivo = 'todos';

  // --------------------------------------------------------------------------
  // Render principal
  // --------------------------------------------------------------------------
  function render() {
    const main = document.getElementById('main');
    main.innerHTML = `
      <div class="main-header">
        <div>
          <h1 class="main-title">Conductores</h1>
          <p class="main-subtitle">Gestión de conductores y licencias</p>
        </div>
        <div class="main-actions">
          <button class="btn btn-primary" onclick="ConductoresModule.abrirNuevo()">+ Nuevo conductor</button>
        </div>
      </div>
      <div class="main-content">
        <div id="conductores-stats" class="stats-grid"></div>

        <div class="filters-row">
          <div class="search-box">
            <input
              type="text"
              id="conductores-search"
              class="input input-sm"
              placeholder="Buscar por nombre o cédula..."
              oninput="ConductoresModule.filtrar()"
            />
          </div>
          <select id="conductores-filtro" class="input input-sm" onchange="ConductoresModule.filtrar()">
            <option value="todos">Todos</option>
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
            <option value="vencidos">Licencia vencida</option>
          </select>
        </div>

        <div id="conductores-tabla">
          <table class="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th class="col-hidden-mobile">Cédula</th>
                <th class="col-hidden-mobile">Cargo</th>
                <th class="col-hidden-mobile">Sede</th>
                <th class="col-hidden-mobile">Categoría</th>
                <th class="col-hidden-mobile">Licencia vence</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody id="conductores-tbody">
              <tr><td colspan="7" class="table-empty">Cargando...</td></tr>
            </tbody>
          </table>
        </div>

        <div id="conductor-drawer" class="drawer">
          <div class="drawer-content" id="conductor-drawer-content"></div>
        </div>
        <div id="conductor-overlay" class="drawer-overlay" onclick="ConductoresModule.cerrarDrawer()"></div>
      </div>
    `;

    cargarDatos();
  }

  // --------------------------------------------------------------------------
  // Carga de datos — conductores y sedes en paralelo
  // --------------------------------------------------------------------------
  async function cargarDatos() {
    try {
      const [resConductores, resSedes] = await Promise.all([
        API.conductores.listar(),
        API.get('/sedes').catch(() => ({ data: [] }))
      ]);

      conductores = resConductores.data || resConductores || [];
      sedes = (resSedes.datos || resSedes.data || []);

      renderStats();
      renderTabla(conductores);
    } catch (err) {
      console.error('Error cargando conductores:', err);
      const tbody = document.getElementById('conductores-tbody');
      if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="table-empty">Error al cargar conductores</td></tr>';
    }
  }

  // --------------------------------------------------------------------------
  // Helper — nombre de sede por id
  // --------------------------------------------------------------------------
  function nombreSede(sedeId) {
    if (!sedeId) return '—';
    const sede = sedes.find(s => s.id === sedeId);
    return sede ? sede.nombre : '—';
  }

  // --------------------------------------------------------------------------
  // Stats cards
  // --------------------------------------------------------------------------
  function renderStats() {
    const hoy = new Date();
    const activos   = conductores.filter(c => c.activo);
    const inactivos = conductores.filter(c => !c.activo);
    const vencidos  = conductores.filter(c => c.licencia_vencimiento && new Date(c.licencia_vencimiento) < hoy);

    const statsEl = document.getElementById('conductores-stats');
    if (!statsEl) return;

    statsEl.innerHTML = `
      <div class="stat-card ${filtroActivo === 'todos'     ? 'active' : ''}" onclick="ConductoresModule.aplicarFiltroCard('todos')">
        <div class="stat-value">${conductores.length}</div>
        <div class="stat-label">Total</div>
      </div>
      <div class="stat-card ${filtroActivo === 'activos'   ? 'active' : ''}" onclick="ConductoresModule.aplicarFiltroCard('activos')">
        <div class="stat-value">${activos.length}</div>
        <div class="stat-label">Activos</div>
      </div>
      <div class="stat-card ${filtroActivo === 'inactivos' ? 'active' : ''}" onclick="ConductoresModule.aplicarFiltroCard('inactivos')">
        <div class="stat-value">${inactivos.length}</div>
        <div class="stat-label">Inactivos</div>
      </div>
      <div class="stat-card ${filtroActivo === 'vencidos'  ? 'active' : ''}" onclick="ConductoresModule.aplicarFiltroCard('vencidos')">
        <div class="stat-value">${vencidos.length}</div>
        <div class="stat-label">Licencia vencida</div>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // Tabla
  // --------------------------------------------------------------------------
  function renderTabla(lista) {
    const tbody = document.getElementById('conductores-tbody');
    if (!tbody) return;

    if (!lista || lista.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="table-empty">Sin conductores para mostrar</td></tr>';
      return;
    }

    tbody.innerHTML = lista.map(c => {
      const estadoLicencia = calcularEstadoLicencia(c.licencia_vencimiento);
      const sede = nombreSede(c.sede_id);
      return `
        <tr class="table-row" onclick="ConductoresModule.abrirDrawer('${c.id}')">
          <td>
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="
                width:32px;height:32px;border-radius:50%;
                background:var(--color-background-secondary);
                border:1px solid var(--color-border-tertiary);
                display:flex;align-items:center;justify-content:center;
                font-size:13px;font-weight:500;color:var(--color-text-secondary);
                flex-shrink:0;
              ">${c.nombre.charAt(0).toUpperCase()}</div>
              <span>${c.nombre}</span>
            </div>
          </td>
          <td class="col-hidden-mobile" style="color:var(--color-text-secondary);font-size:13px;">${c.cedula || '—'}</td>
          <td class="col-hidden-mobile">${c.cargo || '—'}</td>
          <td class="col-hidden-mobile">
            ${c.sede_id
              ? `<span style="
                  display:inline-flex;align-items:center;gap:4px;
                  background:var(--color-background-info);
                  color:var(--color-text-info);
                  border-radius:4px;padding:2px 8px;font-size:12px;
                ">${sede}</span>`
              : '<span style="color:var(--color-text-tertiary);font-size:12px;">Sin sede</span>'
            }
          </td>
          <td class="col-hidden-mobile" style="font-size:13px;">${c.licencia_categoria || '—'}</td>
          <td class="col-hidden-mobile ${estadoLicencia.clase}" style="font-size:13px;">${estadoLicencia.texto}</td>
          <td>${c.activo
            ? '<span class="badge badge-success">Activo</span>'
            : '<span class="badge badge-danger">Inactivo</span>'
          }</td>
        </tr>
      `;
    }).join('');
  }

  // --------------------------------------------------------------------------
  // Estado licencia
  // --------------------------------------------------------------------------
  function calcularEstadoLicencia(fechaStr) {
    if (!fechaStr) return { texto: 'Sin registro', clase: 'text-muted' };
    const hoy   = new Date();
    const fecha = new Date(fechaStr);
    const dias  = Math.ceil((fecha - hoy) / 86400000);
    const textoFecha = fecha.toLocaleDateString('es-CO', {
      timeZone: 'America/Bogota',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    if (dias < 0)   return { texto: `VENCIDA — ${textoFecha}`,            clase: 'text-danger' };
    if (dias <= 7)  return { texto: `Vence en ${dias}d — ${textoFecha}`,  clase: 'text-danger' };
    if (dias <= 30) return { texto: `Vence en ${dias}d — ${textoFecha}`,  clase: 'text-warning' };
    return { texto: `Vigente — ${textoFecha}`, clase: 'text-success' };
  }

  // --------------------------------------------------------------------------
  // Filtros
  // --------------------------------------------------------------------------
  function filtrar() {
    const texto  = (document.getElementById('conductores-search')?.value || '').toLowerCase();
    const filtro = document.getElementById('conductores-filtro')?.value || 'todos';
    const hoy    = new Date();

    const lista = conductores.filter(c => {
      const matchTexto = !texto ||
        c.nombre.toLowerCase().includes(texto) ||
        (c.cedula || '').toLowerCase().includes(texto);

      let matchFiltro = true;
      if      (filtro === 'activos')   matchFiltro = c.activo;
      else if (filtro === 'inactivos') matchFiltro = !c.activo;
      else if (filtro === 'vencidos')  matchFiltro = c.licencia_vencimiento && new Date(c.licencia_vencimiento) < hoy;

      return matchTexto && matchFiltro;
    });

    renderTabla(lista);
  }

  function aplicarFiltroCard(valor) {
    filtroActivo = valor;
    const select = document.getElementById('conductores-filtro');
    if (select) select.value = valor;
    renderStats();
    filtrar();
  }

  // --------------------------------------------------------------------------
  // Drawer
  // --------------------------------------------------------------------------
  function abrirDrawer(id) {
    conductorSeleccionado = conductores.find(c => c.id === id);
    if (!conductorSeleccionado) return;

    const c         = conductorSeleccionado;
    const estadoLic = calcularEstadoLicencia(c.licencia_vencimiento);
    const sede      = nombreSede(c.sede_id);

    document.getElementById('conductor-drawer-content').innerHTML = `
      <div class="drawer-header">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="
            width:44px;height:44px;border-radius:50%;
            background:var(--color-background-secondary);
            border:1px solid var(--color-border-secondary);
            display:flex;align-items:center;justify-content:center;
            font-size:18px;font-weight:500;color:var(--color-text-secondary);
            flex-shrink:0;
          ">${c.nombre.charAt(0).toUpperCase()}</div>
          <div>
            <h2 class="drawer-title" style="margin:0;">${c.nombre}</h2>
            <span style="font-size:12px;color:var(--color-text-tertiary);">${c.cargo || 'Sin cargo'}</span>
          </div>
        </div>
        <button class="drawer-close" onclick="ConductoresModule.cerrarDrawer()">✕</button>
      </div>

      <div class="drawer-section">
        <div class="detail-grid">
          <div class="detail-item">
            <span class="detail-label">Cédula</span>
            <span class="detail-value">${c.cedula || 'Sin registro'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Teléfono</span>
            <span class="detail-value">${c.telefono && c.telefono !== c.cedula ? c.telefono : 'Sin registro'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Cargo</span>
            <span class="detail-value">${c.cargo || 'Sin registro'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Sede</span>
            <span class="detail-value">
              ${c.sede_id
                ? `<span style="
                    display:inline-flex;align-items:center;gap:4px;
                    background:var(--color-background-info);
                    color:var(--color-text-info);
                    border-radius:4px;padding:2px 8px;font-size:12px;
                  ">${sede}</span>`
                : '<span style="color:var(--color-text-tertiary);">Sin sede asignada</span>'
              }
            </span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Categoría licencia</span>
            <span class="detail-value">${c.licencia_categoria || 'Sin registro'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Vencimiento licencia</span>
            <span class="detail-value ${estadoLic.clase}">${estadoLic.texto}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Estado</span>
            <span class="detail-value">
              ${c.activo
                ? '<span class="badge badge-success">Activo</span>'
                : '<span class="badge badge-danger">Inactivo</span>'
              }
            </span>
          </div>
        </div>
      </div>

      <div class="drawer-actions">
        <button class="btn btn-primary" onclick="ConductoresModule.abrirEditar('${c.id}')">
          Editar
        </button>
        <button class="btn ${c.activo ? 'btn-danger' : 'btn-success'}"
          onclick="ConductoresModule.toggleActivo('${c.id}', ${!c.activo})">
          ${c.activo ? 'Desactivar' : 'Activar'}
        </button>
      </div>
    `;

    document.getElementById('conductor-drawer').classList.add('open');
    document.getElementById('conductor-overlay').classList.add('open');
  }

  function cerrarDrawer() {
    document.getElementById('conductor-drawer')?.classList.remove('open');
    document.getElementById('conductor-overlay')?.classList.remove('open');
    conductorSeleccionado = null;
  }

  // --------------------------------------------------------------------------
  // Modal crear / editar
  // --------------------------------------------------------------------------
  function abrirNuevo()      { abrirModal(null); }
  function abrirEditar(id)   { abrirModal(conductores.find(c => c.id === id)); }

  function abrirModal(conductor) {
    const esEdicion = !!conductor;
    const c = conductor || {};
    const fechaLic = c.licencia_vencimiento ? c.licencia_vencimiento.substring(0, 10) : '';

    document.getElementById('modal-conductor')?.remove();

    // Construir opciones de sede
    const opcionesSedes = sedes.map(s =>
      `<option value="${s.id}" ${c.sede_id === s.id ? 'selected' : ''}>${s.nombre}${s.ciudad ? ' — ' + s.ciudad : ''}</option>`
    ).join('');

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'modal-conductor';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>${esEdicion ? 'Editar conductor' : 'Nuevo conductor'}</h3>
          <button class="modal-close" onclick="document.getElementById('modal-conductor').remove()">✕</button>
        </div>
        <div class="modal-body">

          <div class="form-group">
            <label>Nombre completo *</label>
            <input type="text" id="f-nombre" class="input" value="${c.nombre || ''}" placeholder="Nombre completo" />
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="form-group">
              <label>Cédula *</label>
              <input type="text" id="f-cedula" class="input" value="${c.cedula || ''}" placeholder="Número de cédula" />
            </div>
            <div class="form-group">
              <label>Teléfono (con código país)</label>
              <input type="text" id="f-telefono" class="input" value="${c.telefono && c.telefono !== c.cedula ? c.telefono : ''}" placeholder="573001234567" />
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="form-group">
              <label>Cargo</label>
              <select id="f-cargo" class="input">
                <option value="">Seleccionar...</option>
                ${['Conductor','Conductor Ayudante','Operario','Técnico','Supervisor','Administrador','Mensajero','Analista','Director Operativo'].map(op =>
                  `<option value="${op}" ${c.cargo === op ? 'selected' : ''}>${op}</option>`
                ).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Sede</label>
              <select id="f-sede" class="input">
                <option value="">Sin sede asignada</option>
                ${opcionesSedes}
              </select>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="form-group">
              <label>Categoría de licencia</label>
              <select id="f-licencia-cat" class="input">
                <option value="">Seleccionar...</option>
                ${['A1','A2','B1','B2','B3','C1','C2','C3'].map(cat =>
                  `<option value="${cat}" ${c.licencia_categoria === cat ? 'selected' : ''}>${cat}</option>`
                ).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Vencimiento de licencia</label>
              <input type="date" id="f-licencia-venc" class="input" value="${fechaLic}" />
            </div>
          </div>

        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('modal-conductor').remove()">Cancelar</button>
          <button class="btn btn-primary" onclick="ConductoresModule.guardar('${c.id || ''}')">
            ${esEdicion ? 'Guardar cambios' : 'Crear conductor'}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  // --------------------------------------------------------------------------
  // Guardar
  // --------------------------------------------------------------------------
  async function guardar(id) {
    const nombre             = document.getElementById('f-nombre')?.value.trim();
    const cedula             = document.getElementById('f-cedula')?.value.trim();
    const telefono           = document.getElementById('f-telefono')?.value.trim();
    const cargo              = document.getElementById('f-cargo')?.value;
    const sede_id            = document.getElementById('f-sede')?.value || null;
    const licencia_categoria = document.getElementById('f-licencia-cat')?.value;
    const licencia_vencimiento = document.getElementById('f-licencia-venc')?.value || null;

    if (!nombre) return mostrarToast('El nombre es obligatorio', 'error');
    if (!cedula) return mostrarToast('La cédula es obligatoria', 'error');

    // Teléfono: si está vacío usar cédula como placeholder (restricción NOT NULL única)
    const telefonoFinal = telefono || cedula;

    const body = { nombre, cedula, telefono: telefonoFinal, cargo, sede_id, licencia_categoria, licencia_vencimiento };

    try {
      const esEdicion = !!id;
      if (esEdicion) await API.conductores.actualizar(id, body);
      else           await API.conductores.crear(body);

      document.getElementById('modal-conductor')?.remove();
      cerrarDrawer();
      mostrarToast(esEdicion ? 'Conductor actualizado' : 'Conductor creado', 'success');
      await cargarDatos();
    } catch (err) {
      console.error('Error guardando conductor:', err);
      mostrarToast('Error guardando conductor', 'error');
    }
  }

  // --------------------------------------------------------------------------
  // Activar / desactivar
  // --------------------------------------------------------------------------
  async function toggleActivo(id, nuevoEstado) {
    try {
      await API.conductores.actualizar(id, { activo: nuevoEstado });
      mostrarToast(nuevoEstado ? 'Conductor activado' : 'Conductor desactivado', 'success');
      cerrarDrawer();
      await cargarDatos();
    } catch (err) {
      mostrarToast('Error de conexión', 'error');
    }
  }

  // --------------------------------------------------------------------------
  // Toast
  // --------------------------------------------------------------------------
  function mostrarToast(msg, tipo) {
    if (window.Toast) window.Toast.show(msg, tipo);
    else console.log(`[${tipo}] ${msg}`);
  }

  // --------------------------------------------------------------------------
  // API pública
  // --------------------------------------------------------------------------
  return {
    render, cargarDatos, filtrar, aplicarFiltroCard,
    abrirDrawer, cerrarDrawer, abrirNuevo, abrirEditar,
    guardar, toggleActivo
  };
})();
