const PosopAPI = {
  async listar(filtros) {
    const params = new URLSearchParams();
    if (filtros.fecha_inicio) params.set('fecha_inicio', filtros.fecha_inicio);
    if (filtros.fecha_fin) params.set('fecha_fin', filtros.fecha_fin);
    if (filtros.placa) params.set('placa', filtros.placa);
    const query = params.toString();
    const respuesta = await API.get(`/posoperacionales${query ? `?${query}` : ''}`);
    return respuesta.data || respuesta || [];
  }
};

const PosopLogic = {
  filtrarData(data, estadoFiltro, placaFiltro) {
    let filtrada = data;
    if (estadoFiltro && estadoFiltro !== 'todos') {
      filtrada = filtrada.filter(item => (item.estado_general || '') === estadoFiltro);
    }
    if (placaFiltro) {
      filtrada = filtrada.filter(item => (item.vehiculo_placa || '').toUpperCase().includes(placaFiltro));
    }
    return filtrada;
  },

  formatFechaHora(valor) {
    if (!valor) return '—';
    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime())) return '—';
    const fechaTexto = fecha.toLocaleDateString('es-CO');
    const horaTexto = fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    return `${fechaTexto}<br><span class="text-xs text-secondary">${horaTexto}</span>`;
  },

  estadoBadge(estado) {
    const mapa = { OK: 'success', CON_NOVEDADES: 'warning', REQUIERE_ATENCION: 'danger' };
    return Badge.render(estado || '—', mapa[estado] || 'neutral');
  }
};

const PosopRender = {
  stats(data, dataFiltrada) {
    const hoy = fechaHoyBogota();
    const hoyData = data.filter((item) => String(item.created_at || '').startsWith(hoy));
    const conNovedades = hoyData.filter((item) => Array.isArray(item.novedades) && item.novedades.length > 0).length;

    return Card.statsGrid([
      { label: 'Inspecciones hoy', value: hoyData.length, type: hoyData.length ? 'success' : null },
      { label: 'Con novedades', value: conNovedades, type: conNovedades ? 'warning' : null },
      { label: 'Mostrando', value: dataFiltrada.length, suffix: 'registros' }
    ]);
  },

  tabla(dataFiltrada) {
    return Table.render({
      columns: [
        {
          key: 'created_at', label: 'Fecha/Hora', width: '140px',
          render: (valor) => PosopLogic.formatFechaHora(valor)
        },
        {
          key: 'vehiculo_placa', label: 'Placa', width: '90px',
          render: (valor) => `<span class="font-medium">${Utils.escaparHTML(valor || '—')}</span>`
        },
        {
          key: 'vehiculo', label: 'Vehículo',
          render: (_, row) => {
            const vehiculo = [row.vehiculos?.marca, row.vehiculos?.tipo].filter(Boolean).join(' ');
            return Utils.escaparHTML(vehiculo || '—');
          }
        },
        {
          key: 'conductor_nombre', label: 'Conductor',
          render: (valor, row) => Utils.escaparHTML((row.conductores && row.conductores.nombre) || valor || '—')
        },
        {
          key: 'km_referencia', label: 'KM inicial', width: '110px',
          render: (valor) => Utils.formatearNumero(valor)
        },
        {
          key: 'kilometraje_final', label: 'KM final', width: '110px',
          render: (valor) => Utils.formatearNumero(valor)
        },
        {
          key: 'estado_general', label: 'Estado', width: '140px',
          render: (valor) => PosopLogic.estadoBadge(valor)
        },
        {
          key: 'acciones', label: '', width: '70px',
          render: (_, row) => `<button class="btn btn-sm btn-secondary" onclick="PosoperacionalesModule.abrirDetalle('${row.id}')">Ver</button>`
        }
      ],
      data: dataFiltrada,
      emptyMessage: 'No hay posoperacionales para los filtros seleccionados'
    });
  },

  drawerContent(registro) {
    const conductor = (registro.conductores?.nombre) || registro.conductor_nombre || '—';
    const vehiculo = [registro.vehiculos?.marca, registro.vehiculos?.tipo].filter(Boolean).join(' ') || '—';
    const kmInicial = Utils.formatearNumero(registro.km_referencia);
    const kmFinal = Utils.formatearNumero(registro.kilometraje_final);
    const recorrido = (registro.km_referencia != null && registro.kilometraje_final != null)
      ? Utils.formatearNumero(registro.kilometraje_final - registro.km_referencia) + ' km'
      : '—';

    let novedades = registro.novedades || [];
    if (typeof novedades === 'string') {
      try { novedades = JSON.parse(novedades); } catch { novedades = []; }
    }

    let novedadesHtml;
    if (!Array.isArray(novedades) || novedades.length === 0) {
      novedadesHtml = '<div class="drawer-all-ok">✓ Sin novedades al cierre</div>';
    } else {
      const sevMap = { bloqueo: 'danger', alerta: 'warning', media: 'warning', informativo: 'neutral' };
      novedadesHtml = novedades.map(n => {
        const tipo = (n.severidad || n.estado || '').toLowerCase();
        const esCritica = tipo === 'bloqueo' || tipo === 'critica';
        return `
          <div class="drawer-novedad ${esCritica ? 'critica' : ''}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
              <span class="font-medium text-sm">${Utils.escaparHTML(n.item || '—')}</span>
              ${Badge.render(n.severidad || n.estado || '—', sevMap[tipo] || 'neutral')}
            </div>
            ${n.estado ? `<div class="text-xs text-secondary">${Utils.escaparHTML(n.estado)}</div>` : ''}
            ${n.texto_original ? `<div class="text-xs" style="margin-top:4px;font-style:italic;">"${Utils.escaparHTML(n.texto_original)}"</div>` : ''}
          </div>`;
      }).join('');
    }

    const pdfHtml = registro.pdf_url
      ? `<a href="${Utils.escaparHTML(registro.pdf_url)}" target="_blank" class="btn btn-primary" style="width:100%;text-align:center;">Ver PDF</a>`
      : '';

    return `
      <div class="drawer-info-grid">
        <div class="drawer-info-card">
          <div class="stat-label">Conductor</div>
          <div class="font-medium">${Utils.escaparHTML(conductor)}</div>
        </div>
        <div class="drawer-info-card">
          <div class="stat-label">Fecha</div>
          <div class="font-medium">${PosopLogic.formatFechaHora(registro.created_at).replace('<br>', ' ')}</div>
        </div>
        <div class="drawer-info-card">
          <div class="stat-label">Vehículo</div>
          <div class="font-medium">${Utils.escaparHTML(vehiculo)}</div>
        </div>
        <div class="drawer-info-card">
          <div class="stat-label">Estado</div>
          <div>${PosopLogic.estadoBadge(registro.estado_general)}</div>
        </div>
        <div class="drawer-info-card">
          <div class="stat-label">KM inicial</div>
          <div class="font-medium">${kmInicial}</div>
        </div>
        <div class="drawer-info-card">
          <div class="stat-label">KM final</div>
          <div class="font-medium">${kmFinal}</div>
        </div>
        <div class="drawer-info-card" style="grid-column:span 2;">
          <div class="stat-label">Recorrido</div>
          <div class="font-medium">${recorrido}</div>
        </div>
      </div>

      <div class="drawer-section">
        <div class="drawer-section-title">Novedades</div>
        ${novedadesHtml}
      </div>

      ${registro.observaciones ? `
      <div class="drawer-section">
        <div class="drawer-section-title">Observaciones</div>
        <div class="drawer-observacion">${Utils.escaparHTML(registro.observaciones)}</div>
      </div>` : ''}

      ${pdfHtml ? `<div class="drawer-section">${pdfHtml}</div>` : ''}

      ${registro.firmado ? `
      <div class="drawer-firma">✓ Firmado digitalmente — ${PosopLogic.formatFechaHora(registro.firmado_timestamp || registro.created_at).replace('<br>', ' ')}</div>
      ` : ''}
    `;
  }
};

window.PosoperacionalesModule = {
  data: [],
  filtros: {
    fecha_inicio: '',
    fecha_fin: '',
    placa: '',
    estado: 'todos'
  },

  async render() {
    const hoy = fechaHoyBogota();
    this.filtros.fecha_inicio = this.filtros.fecha_inicio || hoy;
    this.filtros.fecha_fin = this.filtros.fecha_fin || hoy;

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
        <div id="posop-filters"></div>
        <div id="posop-tabla"></div>
      </div>
    `;

    Filters.render({
      containerId: 'posop-filters',
      onFilterChange: (key, value) => {
        if (key === 'desde') this.filtros.fecha_inicio = value;
        if (key === 'hasta') this.filtros.fecha_fin = value;
        if (key === 'busqueda') this.filtros.placa = value;
        if (key === 'estado') this.filtros.estado = value;
        
        if (key === 'estado' || key === 'busqueda') {
          this.renderUIOnly();
        } else {
          // Si cambia la fecha, pedir al backend
          this.cargarDatos();
        }
      },
      defaultState: this.filtros.estado,
      dateValues: { desde: this.filtros.fecha_inicio, hasta: this.filtros.fecha_fin, busqueda: this.filtros.placa },
      searchPlaceholder: 'Buscar placa...',
      states: [
        { value: 'todos', label: 'Todos', colorClass: 'btn-primary' },
        { value: 'OK', label: 'OK', colorClass: 'btn-success' },
        { value: 'CON_NOVEDADES', label: 'Con novedades', colorClass: 'btn-warning' },
        { value: 'REQUIERE_ATENCION', label: 'Requiere atención', colorClass: 'btn-danger' }
      ]
    });

    await this.cargarDatos();
  },

  async cargarDatos() {
    try {
      this.data = await PosopAPI.listar(this.filtros);
      this.renderUIOnly();
    } catch (error) {
      console.error('Error cargando posoperacionales:', error);
      this.data = [];
      this.renderUIOnly();
      if (window.Toast) Toast.error('Error cargando posoperacionales');
    }
  },

  renderUIOnly() {
    const dataFiltrada = PosopLogic.filtrarData(this.data, this.filtros.estado, this.filtros.placa);
    const statsContainer = document.getElementById('posop-stats');
    const tablaContainer = document.getElementById('posop-tabla');
    
    if (statsContainer) statsContainer.innerHTML = PosopRender.stats(this.data, dataFiltrada);
    if (tablaContainer) tablaContainer.innerHTML = PosopRender.tabla(dataFiltrada);
  },

  abrirDetalle(id) {
    const registro = this.data.find(item => String(item.id) === String(id));
    if (!registro) return;
    
    Drawer.open({
      title: Utils.escaparHTML(registro.vehiculo_placa || 'Detalle'),
      content: PosopRender.drawerContent(registro),
      width: '600px'
    });
  }
};
