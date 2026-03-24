window.TanqueosModule = (() => {
  const state = {
    data: [],
    filtros: {
      fecha_inicio: '',
      fecha_fin: '',
      placa: ''
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

  function buildQuery() {
    const params = new URLSearchParams();
    if (state.filtros.fecha_inicio) params.set('fecha_inicio', state.filtros.fecha_inicio);
    if (state.filtros.fecha_fin) params.set('fecha_fin', state.filtros.fecha_fin);
    if (state.filtros.placa) params.set('placa', state.filtros.placa);
    return params.toString();
  }

  function litrosHoy() {
    const hoy = hoyISO();
    return state.data
      .filter((item) => String(item.created_at || '').startsWith(hoy))
      .reduce((sum, item) => sum + Number(item.cantidad || 0), 0);
  }

  function renderStats() {
    const container = document.getElementById('tanq-stats');
    if (!container) return;

    const hoy = hoyISO();
    const hoyData = state.data.filter((item) => String(item.created_at || '').startsWith(hoy));

    container.innerHTML = Card.statsGrid([
      { label: 'Tanqueos hoy', value: hoyData.length, type: hoyData.length ? 'success' : null },
      { label: 'Total litros hoy', value: Utils.formatearNumero(litrosHoy()), suffix: 'L', type: litrosHoy() ? 'warning' : null },
      { label: 'Mostrando', value: state.data.length, suffix: 'registros' }
    ]);
  }

  function renderTabla() {
    const container = document.getElementById('tanq-tabla');
    if (!container) return;

    container.innerHTML = Table.render({
      columns: [
        { key: 'created_at', label: 'Fecha/Hora', width: '140px', render: (valor) => formatFechaHora(valor) },
        {
          key: 'vehiculo_placa',
          label: 'Placa',
          width: '90px',
          render: (valor) => `<span class="font-medium">${Utils.escaparHTML(valor || '—')}</span>`
        },
        {
          key: 'vehiculo',
          label: 'Vehiculo',
          render: (_, row) => Utils.escaparHTML(([row.vehiculos?.marca, row.vehiculos?.tipo].filter(Boolean).join(' ')) || '—')
        },
        {
          key: 'conductor',
          label: 'Conductor',
          render: (_, row) => Utils.escaparHTML(row.conductores?.nombre || '—')
        },
        {
          key: 'cantidad',
          label: 'Litros',
          width: '110px',
          render: (_, row) => `${Utils.formatearNumero(row.cantidad)} ${Utils.escaparHTML(row.unidad_medida || 'L')}`
        },
        {
          key: 'kilometraje',
          label: 'KM',
          width: '100px',
          render: (valor) => Utils.formatearNumero(valor)
        },
        {
          key: 'valor_total',
          label: 'Valor',
          width: '120px',
          render: (valor) => `$${Utils.formatearNumero(valor || 0)}`
        },
        {
          key: 'acciones',
          label: '',
          width: '70px',
          render: (_, row) => `<button class="btn btn-sm btn-secondary" onclick="TanqueosModule.abrirDetalle('${row.id}')">Ver</button>`
        }
      ],
      data: state.data,
      emptyMessage: 'No hay tanqueos para los filtros seleccionados'
    });
  }

  function renderDrawer(registro) {
    const titulo = document.getElementById('tanq-drawer-titulo');
    const contenido = document.getElementById('tanq-drawer-contenido');
    if (!titulo || !contenido) return;

    titulo.textContent = registro.vehiculo_placa || 'Detalle';

    const detalle = Object.entries(registro)
      .filter(([key]) => key !== 'vehiculos' && key !== 'conductores' && key !== 'fotos')
      .map(([key, value]) => {
        let texto = '—';
        if (Array.isArray(value) || (value && typeof value === 'object')) {
          texto = Utils.escaparHTML(JSON.stringify(value, null, 2));
        } else if (value !== null && value !== undefined && value !== '') {
          texto = Utils.escaparHTML(String(value));
        }

        return `
          <div class="detail-item">
            <span class="detail-label">${Utils.escaparHTML(key)}</span>
            <span class="detail-value" style="white-space:pre-wrap;">${texto}</span>
          </div>
        `;
      })
      .join('');

    const fotoHtml = registro.foto_url
      ? `
        <div class="drawer-section">
          <div class="drawer-section-title">Foto</div>
          <img src="${Utils.escaparHTML(registro.foto_url)}" alt="Foto tanqueo" style="width:100%;border-radius:12px;border:1px solid var(--border-light);">
        </div>
      `
      : '';

    contenido.innerHTML = `
      <div class="drawer-section">
        <div class="detail-grid">
          <div class="detail-item">
            <span class="detail-label">Vehiculo</span>
            <span class="detail-value">${Utils.escaparHTML(([registro.vehiculos?.marca, registro.vehiculos?.tipo].filter(Boolean).join(' ')) || '—')}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Conductor</span>
            <span class="detail-value">${Utils.escaparHTML(registro.conductores?.nombre || '—')}</span>
          </div>
          ${detalle}
        </div>
      </div>
      ${fotoHtml}
    `;
  }

  async function cargarDatos() {
    try {
      const query = buildQuery();
      const respuesta = await API.get(`/tanqueos${query ? `?${query}` : ''}`);
      state.data = respuesta.data || respuesta || [];
      renderStats();
      renderTabla();
    } catch (error) {
      console.error('Error cargando tanqueos:', error);
      state.data = [];
      renderStats();
      renderTabla();
      Toast.error('Error cargando tanqueos');
    }
  }

  function bindFiltros() {
    document.getElementById('tanq-fecha-inicio')?.addEventListener('change', (e) => {
      state.filtros.fecha_inicio = e.target.value;
      cargarDatos();
    });
    document.getElementById('tanq-fecha-fin')?.addEventListener('change', (e) => {
      state.filtros.fecha_fin = e.target.value;
      cargarDatos();
    });
    document.getElementById('tanq-placa')?.addEventListener('input', Utils.debounce((e) => {
      state.filtros.placa = e.target.value.toUpperCase();
      cargarDatos();
    }));
  }

  async function render() {
    const hoy = hoyISO();
    state.filtros.fecha_inicio = state.filtros.fecha_inicio || hoy;
    state.filtros.fecha_fin = state.filtros.fecha_fin || hoy;

    const main = document.getElementById('main');
    main.innerHTML = `
      <div class="main-header">
        <div>
          <h1 class="main-title">Tanqueos</h1>
          <p class="main-subtitle">Historial de abastecimiento</p>
        </div>
      </div>
      <div class="main-content">
        <div id="tanq-stats"></div>
        <div class="filters-row">
          <div class="flex gap-sm items-center">
            <label class="text-xs text-secondary">Desde</label>
            <input type="date" class="input input-sm" id="tanq-fecha-inicio" value="${state.filtros.fecha_inicio}" style="width:140px;">
            <label class="text-xs text-secondary">Hasta</label>
            <input type="date" class="input input-sm" id="tanq-fecha-fin" value="${state.filtros.fecha_fin}" style="width:140px;">
          </div>
          <div class="search-box" style="min-width:130px;max-width:160px;">
            <input type="text" class="input input-sm" placeholder="Placa..." id="tanq-placa" value="${Utils.escaparHTML(state.filtros.placa)}" style="text-transform:uppercase;">
          </div>
        </div>
        <div id="tanq-tabla"></div>
      </div>
      <div class="drawer-backdrop" id="tanq-drawer-backdrop" onclick="TanqueosModule.cerrarDrawer()"></div>
      <div class="drawer" id="tanq-drawer-panel">
        <div class="drawer-header">
          <h3 class="drawer-title" id="tanq-drawer-titulo">Detalle</h3>
          <button class="modal-close" onclick="TanqueosModule.cerrarDrawer()">&times;</button>
        </div>
        <div class="drawer-body" id="tanq-drawer-contenido"></div>
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
    document.getElementById('tanq-drawer-backdrop')?.classList.add('active');
    document.getElementById('tanq-drawer-panel')?.classList.add('active');
  }

  function cerrarDrawer() {
    document.getElementById('tanq-drawer-backdrop')?.classList.remove('active');
    document.getElementById('tanq-drawer-panel')?.classList.remove('active');
    state.detalleActual = null;
  }

  return {
    render,
    abrirDetalle,
    cerrarDrawer
  };
})();
