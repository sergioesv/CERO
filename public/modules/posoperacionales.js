window.PosoperacionalesModule = (() => {
  const state = {
    data: [],
    filtros: {
      fecha_inicio: '',
      fecha_fin: '',
      placa: '',
      estado: 'todos'
    },
    detalleActual: null
  };

  function hoyISO() {
    return new Date().toISOString().split('T')[0];
  }

  function formatFechaHora(valor) {
    if (!valor) return '—';
    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime())) return '—';
    const fechaTexto = fecha.toLocaleDateString('es-CO');
    const horaTexto = fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    return `${fechaTexto}<br><span class="text-xs text-secondary">${horaTexto}</span>`;
  }

  function estadoBadge(estado) {
    const mapa = {
      OK: 'success',
      CON_NOVEDADES: 'warning',
      REQUIERE_ATENCION: 'danger'
    };
    return Badge.render(estado || '—', mapa[estado] || 'neutral');
  }

  function buildQuery() {
    const params = new URLSearchParams();
    if (state.filtros.fecha_inicio) params.set('fecha_inicio', state.filtros.fecha_inicio);
    if (state.filtros.fecha_fin) params.set('fecha_fin', state.filtros.fecha_fin);
    if (state.filtros.placa) params.set('placa', state.filtros.placa);
    return params.toString();
  }

  function getDataFiltrada() {
    if (state.filtros.estado === 'todos') return state.data;
    return state.data.filter((item) => (item.estado_general || '') === state.filtros.estado);
  }

  function renderStats() {
    const container = document.getElementById('posop-stats');
    if (!container) return;

    const hoy = hoyISO();
    const hoyData = state.data.filter((item) => String(item.created_at || '').startsWith(hoy));
    const conNovedades = hoyData.filter((item) => Array.isArray(item.novedades) && item.novedades.length > 0).length;
    const mostrando = getDataFiltrada().length;

    container.innerHTML = Card.statsGrid([
      { label: 'Inspecciones hoy', value: hoyData.length, type: hoyData.length ? 'success' : null },
      { label: 'Con novedades', value: conNovedades, type: conNovedades ? 'warning' : null },
      { label: 'Mostrando', value: mostrando, suffix: 'registros' }
    ]);
  }

  function renderTabla() {
    const container = document.getElementById('posop-tabla');
    if (!container) return;

    const data = getDataFiltrada();
    container.innerHTML = Table.render({
      columns: [
        {
          key: 'created_at',
          label: 'Fecha/Hora',
          width: '140px',
          render: (valor) => formatFechaHora(valor)
        },
        {
          key: 'vehiculo_placa',
          label: 'Placa',
          width: '90px',
          render: (valor) => `<span class="font-medium">${Utils.escaparHTML(valor || '—')}</span>`
        },
        {
          key: 'vehiculo',
          label: 'Vehiculo',
          render: (_, row) => {
            const vehiculo = [row.vehiculos?.marca, row.vehiculos?.tipo].filter(Boolean).join(' ');
            return Utils.escaparHTML(vehiculo || '—');
          }
        },
        {
          key: 'conductor_nombre',
          label: 'Conductor',
          render: (valor, row) =>
            Utils.escaparHTML(
              (row.conductores && row.conductores.nombre) || valor || '—'
            )
        },
        {
          key: 'km_referencia',
          label: 'KM inicial',
          width: '110px',
          render: (valor) => Utils.formatearNumero(valor)
        },
        {
          key: 'kilometraje_final',
          label: 'KM final',
          width: '110px',
          render: (valor) => Utils.formatearNumero(valor)
        },
        {
          key: 'estado_general',
          label: 'Estado',
          width: '140px',
          render: (valor) => estadoBadge(valor)
        },
        {
          key: 'acciones',
          label: '',
          width: '70px',
          render: (_, row) => `<button class="btn btn-sm btn-secondary" onclick="PosoperacionalesModule.abrirDetalle('${row.id}')">Ver</button>`
        }
      ],
      data,
      emptyMessage: 'No hay posoperacionales para los filtros seleccionados'
    });
  }

  function renderDrawer(registro) {
  const titulo = document.getElementById('posop-drawer-titulo');
  const contenido = document.getElementById('posop-drawer-contenido');
  if (!titulo || !contenido) return;

  titulo.textContent = registro.vehiculo_placa || 'Detalle';

  // Novedades
  let novedadesHtml = '<p class="text-secondary text-sm">Sin novedades</p>';
  let novedades = registro.novedades || [];
  if (typeof novedades === 'string') {
    try { novedades = JSON.parse(novedades); } catch { novedades = []; }
  }
  if (Array.isArray(novedades) && novedades.length > 0) {
    novedadesHtml = novedades.map(n => {
      const sev = { bloqueo: 'danger', alerta: 'warning', informativo: 'neutral', media: 'warning' };
      const badge = Badge.render(n.severidad || n.estado || '—', sev[n.severidad] || sev[n.estado] || 'neutral');
      return `
        <div class="detail-item" style="flex-direction:column;align-items:flex-start;gap:4px;">
          <div style="display:flex;justify-content:space-between;width:100%;align-items:center;">
            <span class="font-medium text-sm">${Utils.escaparHTML(n.item || '—')}</span>
            ${badge}
          </div>
          ${n.estado ? `<span class="text-xs text-secondary">${Utils.escaparHTML(n.estado)}</span>` : ''}
          ${n.texto_original ? `<span class="text-xs" style="color:var(--color-text-tertiary);">"${Utils.escaparHTML(n.texto_original)}"</span>` : ''}
        </div>`;
    }).join('');
  }

  const conductor = (registro.conductores && registro.conductores.nombre) || registro.conductor_nombre || '—';
  const vehiculo = [registro.vehiculos?.marca, registro.vehiculos?.tipo].filter(Boolean).join(' ') || '—';
  const kmInicial = Utils.formatearNumero(registro.km_referencia);
  const kmFinal = Utils.formatearNumero(registro.kilometraje_final);
  const recorrido = (registro.km_referencia && registro.kilometraje_final)
    ? Utils.formatearNumero(registro.kilometraje_final - registro.km_referencia) + ' km'
    : '—';

  const pdfHtml = registro.pdf_url
    ? `<div class="drawer-section"><a href="${Utils.escaparHTML(registro.pdf_url)}" target="_blank" class="btn btn-primary" style="width:100%;text-align:center;">Ver PDF</a></div>`
    : '';

  contenido.innerHTML = `
    <div class="drawer-section">
      <div class="detail-grid">
        <div class="detail-item"><span class="detail-label">Vehículo</span><span class="detail-value">${Utils.escaparHTML(vehiculo)}</span></div>
        <div class="detail-item"><span class="detail-label">Conductor</span><span class="detail-value">${Utils.escaparHTML(conductor)}</span></div>
        <div class="detail-item"><span class="detail-label">KM inicial</span><span class="detail-value">${kmInicial}</span></div>
        <div class="detail-item"><span class="detail-label">KM final</span><span class="detail-value">${kmFinal}</span></div>
        <div class="detail-item"><span class="detail-label">Recorrido</span><span class="detail-value">${recorrido}</span></div>
        <div class="detail-item"><span class="detail-label">Estado</span><span class="detail-value">${estadoBadge(registro.estado_general)}</span></div>
        <div class="detail-item"><span class="detail-label">Observaciones</span><span class="detail-value">${Utils.escaparHTML(registro.observaciones || 'Sin observaciones')}</span></div>
        <div class="detail-item"><span class="detail-label">Fecha</span><span class="detail-value">${formatFechaHora(registro.created_at)}</span></div>
      </div>
    </div>
    <div class="drawer-section">
      <p class="detail-label" style="margin-bottom:8px;">Novedades</p>
      ${novedadesHtml}
    </div>
    ${pdfHtml}
  `;
}
  
  async function cargarDatos() {
    try {
      const query = buildQuery();
      const respuesta = await API.get(`/posoperacionales${query ? `?${query}` : ''}`);
      state.data = respuesta.data || respuesta || [];
      renderStats();
      renderTabla();
    } catch (error) {
      console.error('Error cargando posoperacionales:', error);
      state.data = [];
      renderStats();
      renderTabla();
      Toast.error('Error cargando posoperacionales');
    }
  }

  function bindFiltros() {
    document.getElementById('posop-fecha-inicio')?.addEventListener('change', (e) => {
      state.filtros.fecha_inicio = e.target.value;
      cargarDatos();
    });
    document.getElementById('posop-fecha-fin')?.addEventListener('change', (e) => {
      state.filtros.fecha_fin = e.target.value;
      cargarDatos();
    });
    document.getElementById('posop-placa')?.addEventListener('input', Utils.debounce((e) => {
      state.filtros.placa = e.target.value.toUpperCase();
      cargarDatos();
    }));
    document.getElementById('posop-estado')?.addEventListener('change', (e) => {
      state.filtros.estado = e.target.value;
      renderStats();
      renderTabla();
    });
  }

  async function render() {
    const hoy = hoyISO();
    state.filtros.fecha_inicio = state.filtros.fecha_inicio || hoy;
    state.filtros.fecha_fin = state.filtros.fecha_fin || hoy;

    const main = document.getElementById('main');
    main.innerHTML = `
      <div class="main-header">
        <div>
          <h1 class="main-title">Posoperacionales</h1>
          <p class="main-subtitle">Historial de cierre operativo</p>
        </div>
      </div>
      <div class="main-content">
        <div id="posop-stats"></div>
        <div class="filters-row">
          <div class="flex gap-sm items-center">
            <label class="text-xs text-secondary">Desde</label>
            <input type="date" class="input input-sm" id="posop-fecha-inicio" value="${state.filtros.fecha_inicio}" style="width:140px;">
            <label class="text-xs text-secondary">Hasta</label>
            <input type="date" class="input input-sm" id="posop-fecha-fin" value="${state.filtros.fecha_fin}" style="width:140px;">
          </div>
          <div class="search-box" style="min-width:130px;max-width:160px;">
            <input type="text" class="input input-sm" placeholder="Placa..." id="posop-placa" value="${Utils.escaparHTML(state.filtros.placa)}" style="text-transform:uppercase;">
          </div>
          <select class="input input-sm" id="posop-estado" style="width:190px;">
            <option value="todos" ${state.filtros.estado === 'todos' ? 'selected' : ''}>Todos</option>
            <option value="OK" ${state.filtros.estado === 'OK' ? 'selected' : ''}>OK</option>
            <option value="CON_NOVEDADES" ${state.filtros.estado === 'CON_NOVEDADES' ? 'selected' : ''}>Con novedades</option>
            <option value="REQUIERE_ATENCION" ${state.filtros.estado === 'REQUIERE_ATENCION' ? 'selected' : ''}>Requiere atencion</option>
          </select>
        </div>
        <div id="posop-tabla"></div>
      </div>
      <div class="drawer-backdrop" id="posop-drawer-backdrop" onclick="PosoperacionalesModule.cerrarDrawer()"></div>
      <div class="drawer" id="posop-drawer-panel">
        <div class="drawer-header">
          <h3 class="drawer-title" id="posop-drawer-titulo">Detalle</h3>
          <button class="modal-close" onclick="PosoperacionalesModule.cerrarDrawer()">&times;</button>
        </div>
        <div class="drawer-body" id="posop-drawer-contenido"></div>
      </div>
    `;

    bindFiltros();
    await cargarDatos();
  }

  function abrirDetalle(id) {
    const registro = state.data.find((item) => String(item.id) === String(id));
    if (!registro) return;
    state.detalleActual = registro;
    renderDrawer(registro);
    document.getElementById('posop-drawer-backdrop')?.classList.add('active');
    document.getElementById('posop-drawer-panel')?.classList.add('active');
  }

  function cerrarDrawer() {
    document.getElementById('posop-drawer-backdrop')?.classList.remove('active');
    document.getElementById('posop-drawer-panel')?.classList.remove('active');
    state.detalleActual = null;
  }

  return {
    render,
    abrirDetalle,
    cerrarDrawer
  };
})();
