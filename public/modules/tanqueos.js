// ═══════════════════════════════════════════════════════════
// CERO — Módulo Tanqueos
// Panel de control de combustible con validación cruzada
// Fase 2.1 — 13/04/2026
// ═══════════════════════════════════════════════════════════

var Tanqueos = {
  data: [],
  stats: {},
  filtros: {
    fecha_inicio: '',
    fecha_fin: '',
    placa: '',
    estado_validacion: 'todos',
    tipo_tanqueo: 'todos'
  },
  drawerAbierto: false,
  detalleActual: null,
  seleccionados: [],
  vistaConsolidado: false,
  consolidadoData: null,
  consolidadoMes: '',

  // ─────────────────────────────────────────────────────────
  // RENDER PRINCIPAL
  // ─────────────────────────────────────────────────────────

  async render() {
    var hoy = new Date().toISOString().split('T')[0];
    var hace30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    this.filtros.fecha_inicio = this.filtros.fecha_inicio || hace30;
    this.filtros.fecha_fin = this.filtros.fecha_fin || hoy;
    this.consolidadoMes = this.consolidadoMes || hoy.substring(0, 7);

    var main = document.getElementById('main');
    main.innerHTML = `
      <div class="main-header">
        <div>
          <h1 class="main-title">Tanqueos</h1>
          <p class="main-subtitle">Control de combustible y validación cruzada</p>
        </div>
        <div class="main-actions">
          <button class="btn btn-secondary btn-sm" onclick="Tanqueos.abrirConsolidado()">📊 Consolidado mensual</button>
          <button class="btn btn-secondary btn-sm" onclick="Tanqueos.resetFiltros()">Limpiar filtros</button>
        </div>
      </div>
      <div class="main-content">
        <div id="tanq-stats"></div>
        <div class="filters-row">
          <div class="flex gap-sm items-center">
            <label class="text-xs text-secondary">Desde</label>
            <input type="date" class="input input-sm" id="tanq-desde" value="${this.filtros.fecha_inicio}" style="width:140px;">
            <label class="text-xs text-secondary">Hasta</label>
            <input type="date" class="input input-sm" id="tanq-hasta" value="${this.filtros.fecha_fin}" style="width:140px;">
          </div>
          <div class="search-box" style="min-width:130px;max-width:160px;">
            <input type="text" class="input input-sm" placeholder="Placa..." id="tanq-placa" value="${this.filtros.placa}" style="text-transform:uppercase;">
          </div>
          <div class="flex gap-sm">
            <button class="btn btn-sm ${this.filtros.estado_validacion === 'todos' ? 'btn-primary' : 'btn-secondary'}" onclick="Tanqueos.filtrarEstado('todos')">Todos</button>
            <button class="btn btn-sm ${this.filtros.estado_validacion === 'pendiente_revision' ? 'btn-warning' : 'btn-secondary'}" onclick="Tanqueos.filtrarEstado('pendiente_revision')">Pendientes</button>
            <button class="btn btn-sm ${this.filtros.estado_validacion === 'auto_validado' ? 'btn-info' : 'btn-secondary'}" onclick="Tanqueos.filtrarEstado('auto_validado')">Auto-validados</button>
            <button class="btn btn-sm ${this.filtros.estado_validacion === 'validado' ? 'btn-success' : 'btn-secondary'}" onclick="Tanqueos.filtrarEstado('validado')">Validados</button>
            <button class="btn btn-sm ${this.filtros.estado_validacion === 'rechazado' ? 'btn-danger' : 'btn-secondary'}" onclick="Tanqueos.filtrarEstado('rechazado')">Rechazados</button>
          </div>
          <div class="flex gap-sm">
            <button class="btn btn-sm ${this.filtros.tipo_tanqueo === 'todos' ? 'btn-primary' : 'btn-secondary'}" onclick="Tanqueos.filtrarTipo('todos')">Todos</button>
            <button class="btn btn-sm ${this.filtros.tipo_tanqueo === 'convenio' ? 'btn-primary' : 'btn-secondary'}" onclick="Tanqueos.filtrarTipo('convenio')">Convenio</button>
            <button class="btn btn-sm ${this.filtros.tipo_tanqueo === 'emergencia' ? 'btn-warning' : 'btn-secondary'}" onclick="Tanqueos.filtrarTipo('emergencia')">Emergencia</button>
          </div>
        </div>
        <div id="tanq-acciones-lote" class="flex gap-sm" style="display:none;margin-bottom:8px;">
          <span id="tanq-seleccionados-count" class="text-sm text-secondary"></span>
          <button class="btn btn-sm btn-success" onclick="Tanqueos.validarLote()">✅ Validar seleccionados</button>
        </div>
        <div id="tanq-tabla">
          <div style="text-align:center;padding:40px;">
            <span class="text-secondary">Cargando tanqueos...</span>
          </div>
        </div>
      </div>

      <!-- Drawer lateral -->
      <div class="drawer-backdrop" id="drawer-backdrop" onclick="Tanqueos.cerrarDrawer()"></div>
      <div class="drawer" id="drawer-panel" style="width:min(780px,95vw);">
        <div class="drawer-header">
          <h3 class="drawer-title" id="drawer-titulo">Detalle del tanqueo</h3>
          <button class="modal-close" onclick="Tanqueos.cerrarDrawer()">&times;</button>
        </div>
        <div class="drawer-body" id="drawer-contenido" style="padding:0;"></div>
      </div>

      <!-- Modal consolidado -->
      <div class="modal-overlay" id="modal-consolidado" style="display:none;" onclick="if(event.target===this)Tanqueos.cerrarConsolidado()">
        <div class="modal" style="max-width:860px;width:95vw;">
          <div class="modal-header">
            <h3 class="modal-title">📊 Consolidado mensual</h3>
            <button class="modal-close" onclick="Tanqueos.cerrarConsolidado()">&times;</button>
          </div>
          <div class="modal-body" id="modal-consolidado-body">Cargando...</div>
        </div>
      </div>
    `;

    // Eventos filtros
    document.getElementById('tanq-desde').addEventListener('change', function() {
      Tanqueos.filtros.fecha_inicio = this.value;
      Tanqueos.cargarDatos();
    });
    document.getElementById('tanq-hasta').addEventListener('change', function() {
      Tanqueos.filtros.fecha_fin = this.value;
      Tanqueos.cargarDatos();
    });
    document.getElementById('tanq-placa').addEventListener('input', Utils.debounce(function(e) {
      Tanqueos.filtros.placa = e.target.value.toUpperCase();
      Tanqueos.cargarDatos();
    }, 400));

    await this.cargarDatos();
  },

  // ─────────────────────────────────────────────────────────
  // CARGA DE DATOS
  // ─────────────────────────────────────────────────────────

  async cargarDatos() {
    try {
      var params = new URLSearchParams();
      if (this.filtros.fecha_inicio) params.append('fecha_inicio', this.filtros.fecha_inicio);
      if (this.filtros.fecha_fin) params.append('fecha_fin', this.filtros.fecha_fin);
      if (this.filtros.placa) params.append('placa', this.filtros.placa);
      if (this.filtros.estado_validacion !== 'todos') params.append('estado_validacion', this.filtros.estado_validacion);
      if (this.filtros.tipo_tanqueo !== 'todos') params.append('tipo_tanqueo', this.filtros.tipo_tanqueo);

      var qs = params.toString();
      var resp = await API.get('/tanqueos' + (qs ? '?' + qs : ''));
      this.data = resp.data || [];
      this.stats = resp.stats || {};
      this.seleccionados = [];
      this.renderStats();
      this.renderTabla();
    } catch (error) {
      this.data = [];
      Toast.error('Error cargando tanqueos');
      this.renderTabla();
    }
  },

  // ─────────────────────────────────────────────────────────
  // STATS CARDS
  // ─────────────────────────────────────────────────────────

  renderStats() {
    var s = this.stats;
    document.getElementById('tanq-stats').innerHTML = Card.statsGrid([
      { label: 'Tanqueos hoy', value: s.hoy || 0 },
      { label: 'Galones hoy', value: (s.galones_hoy || 0).toFixed(1) },
      { label: 'Pendientes revisión', value: s.pendientes || 0, type: (s.pendientes || 0) > 0 ? 'danger' : null },
      { label: 'Anomalías rendimiento', value: s.anomalias || 0, type: (s.anomalias || 0) > 0 ? 'warning' : null }
    ]);
  },

  // ─────────────────────────────────────────────────────────
  // TABLA PRINCIPAL
  // ─────────────────────────────────────────────────────────

  renderTabla() {
    var contenedor = document.getElementById('tanq-tabla');
    if (!contenedor) return;

    if (!this.data.length) {
      contenedor.innerHTML = '<div style="text-align:center;padding:40px;"><span class="text-secondary">Sin tanqueos para los filtros seleccionados.</span></div>';
      return;
    }

    // Ordenar: pendientes arriba, luego auto_validados, luego el resto
    var orden = { pendiente_revision: 0, auto_validado: 1, validado: 2, rechazado: 3 };
    var datos = this.data.slice().sort(function(a, b) {
      return (orden[a.estado_validacion] || 9) - (orden[b.estado_validacion] || 9);
    });

    var hayAutoValidados = datos.some(function(t) { return t.estado_validacion === 'auto_validado'; });

    var filas = datos.map(function(t) {
      var fecha = t.created_at ? t.created_at.substring(0, 10) : '-';
      var placa = t.vehiculo_placa || '-';
      var conductor = t.conductores ? t.conductores.nombre : '-';
      var galones = t.cantidad ? (parseFloat(t.cantidad).toFixed(3) + ' ' + (t.unidad_medida || 'L')) : '-';
      var valor = t.valor_total ? ('$' + parseInt(t.valor_total, 10).toLocaleString('es-CO')) : '-';
      var km = t.kilometraje ? t.kilometraje.toLocaleString('es-CO') : '-';
      var rend = t.rendimiento_calculado
        ? (parseFloat(t.rendimiento_calculado).toFixed(1) + ' km/u')
        : '<span class="text-secondary">-</span>';

      // Badge estado validación
      var badgeEstado = Tanqueos._badgeEstado(t.estado_validacion);

      // Badge tipo tanqueo
      var badgeTipo = t.tipo_tanqueo === 'emergencia'
        ? '<span class="badge badge-warning" style="font-size:0.7rem;">⚠️ Emerg.</span>'
        : '';

      // Alerta rendimiento
      var alertaRend = t.rendimiento_alerta
        ? '<span class="badge badge-warning" style="font-size:0.7rem;" title="Rendimiento fuera de rango">📉</span>'
        : '';

      // Checkbox solo para auto_validado
      var checkbox = (t.estado_validacion === 'auto_validado')
        ? '<input type="checkbox" class="tanq-check" data-id="' + t.id + '" onchange="Tanqueos.toggleSeleccion(\'' + t.id + '\')">'
        : '';

      return '<tr class="table-row-clickable" onclick="Tanqueos.abrirDrawer(\'' + t.id + '\')" style="cursor:pointer;">' +
        '<td onclick="event.stopPropagation()" style="width:36px;">' + checkbox + '</td>' +
        '<td>' + fecha + '</td>' +
        '<td><strong>' + placa + '</strong> ' + badgeTipo + '</td>' +
        '<td>' + conductor + '</td>' +
        '<td>' + galones + '</td>' +
        '<td>' + valor + '</td>' +
        '<td>' + km + '</td>' +
        '<td>' + rend + ' ' + alertaRend + '</td>' +
        '<td>' + badgeEstado + '</td>' +
        '</tr>';
    }).join('');

    contenedor.innerHTML =
      '<table class="table">' +
        '<thead><tr>' +
          '<th style="width:36px;">' +
            (hayAutoValidados ? '<input type="checkbox" onchange="Tanqueos.toggleTodos(this.checked)" title="Seleccionar auto-validados">' : '') +
          '</th>' +
          '<th>Fecha</th><th>Placa</th><th>Conductor</th>' +
          '<th>Cantidad</th><th>Valor</th><th>Km</th>' +
          '<th>Rendimiento</th><th>Estado</th>' +
        '</tr></thead>' +
        '<tbody>' + filas + '</tbody>' +
      '</table>';

    this._actualizarBarraLote();
  },

  _badgeEstado: function(estado) {
    var mapa = {
      auto_validado: '<span class="badge badge-info">Auto-validado</span>',
      pendiente_revision: '<span class="badge badge-warning">Pendiente</span>',
      validado: '<span class="badge badge-success">Validado</span>',
      rechazado: '<span class="badge badge-danger">Rechazado</span>'
    };
    return mapa[estado] || '<span class="badge">' + (estado || '-') + '</span>';
  },

  // ─────────────────────────────────────────────────────────
  // SELECCIÓN EN LOTE
  // ─────────────────────────────────────────────────────────

  toggleSeleccion: function(id) {
    var idx = this.seleccionados.indexOf(id);
    if (idx === -1) this.seleccionados.push(id);
    else this.seleccionados.splice(idx, 1);
    this._actualizarBarraLote();
  },

  toggleTodos: function(checked) {
    var checks = document.querySelectorAll('.tanq-check');
    this.seleccionados = [];
    checks.forEach(function(c) {
      c.checked = checked;
      if (checked) Tanqueos.seleccionados.push(c.dataset.id);
    });
    this._actualizarBarraLote();
  },

  _actualizarBarraLote: function() {
    var barra = document.getElementById('tanq-acciones-lote');
    var count = document.getElementById('tanq-seleccionados-count');
    if (!barra) return;
    if (this.seleccionados.length > 0) {
      barra.style.display = 'flex';
      count.textContent = this.seleccionados.length + ' seleccionado(s)';
    } else {
      barra.style.display = 'none';
    }
  },

  async validarLote() {
    if (!this.seleccionados.length) return;
    if (!confirm('¿Validar ' + this.seleccionados.length + ' tanqueo(s)?')) return;
    try {
      await API.put('/tanqueos/validar-lote', { ids: this.seleccionados });
      Toast.success('Tanqueos validados correctamente');
      this.seleccionados = [];
      await this.cargarDatos();
    } catch (e) {
      Toast.error('Error al validar en lote');
    }
  },

  // ─────────────────────────────────────────────────────────
  // FILTROS
  // ─────────────────────────────────────────────────────────

  filtrarEstado: function(estado) {
    this.filtros.estado_validacion = estado;
    this.render();
  },

  filtrarTipo: function(tipo) {
    this.filtros.tipo_tanqueo = tipo;
    this.render();
  },

  resetFiltros: function() {
    this.filtros = { fecha_inicio: '', fecha_fin: '', placa: '', estado_validacion: 'todos', tipo_tanqueo: 'todos' };
    this.render();
  },

  // ─────────────────────────────────────────────────────────
  // DRAWER DETALLE — SPLIT 50/50
  // ─────────────────────────────────────────────────────────

  async abrirDrawer(id) {
    var drawer = document.getElementById('drawer-panel');
    var backdrop = document.getElementById('drawer-backdrop');
    var contenido = document.getElementById('drawer-contenido');
    var titulo = document.getElementById('drawer-titulo');

    if (!drawer) return;
    titulo.textContent = 'Cargando...';
    contenido.innerHTML = '<div style="padding:40px;text-align:center;"><span class="text-secondary">Cargando detalle...</span></div>';
    drawer.classList.add('open');
    if (backdrop) backdrop.classList.add('active');
    this.drawerAbierto = true;

    try {
      var resp = await API.get('/tanqueos/' + id);
      var t = resp.data;
      this.detalleActual = t;
      titulo.textContent = 'Tanqueo — ' + t.vehiculo_placa;
      contenido.innerHTML = this._renderDrawerContenido(t);
    } catch (e) {
      contenido.innerHTML = '<div style="padding:24px;"><span class="badge badge-danger">Error cargando detalle</span></div>';
    }
  },

  cerrarDrawer: function() {
    var drawer = document.getElementById('drawer-panel');
    var backdrop = document.getElementById('drawer-backdrop');
    if (drawer) drawer.classList.remove('open');
    if (backdrop) backdrop.classList.remove('active');
    this.drawerAbierto = false;
    this.detalleActual = null;
  },

  _renderDrawerContenido: function(t) {
    // Buscar foto factura para el panel derecho
    var fotos = t.fotos || [];
    var fotoFact = fotos.find(function(f) { return f.tipo === 'factura'; });
    var fotoPlaca = fotos.find(function(f) { return f.tipo === 'placa'; });
    var fotoOdom = fotos.find(function(f) { return f.tipo === 'odometro'; });

    var urlFact = fotoFact ? (fotoFact.url_firmada || fotoFact.foto_url) : null;
    var urlPlaca = fotoPlaca ? (fotoPlaca.url_firmada || fotoPlaca.foto_url) : null;
    var urlOdom = fotoOdom ? (fotoOdom.url_firmada || fotoOdom.foto_url) : null;

    // Indicadores de coincidencia
    var disc = t.discrepancias || [];
    var discMapa = {};
    disc.forEach(function(d) { discMapa[d.campo] = d; });

    function indicador(campo) {
      return discMapa[campo]
        ? '<span style="color:var(--color-danger);font-weight:600;" title="Discrepancia">✗</span>'
        : '<span style="color:var(--color-success);font-weight:600;" title="Coincide">✓</span>';
    }

    // Panel izquierdo
    var izq = '<div style="padding:20px;overflow-y:auto;height:100%;">';

    // Header con badges
    izq += '<div style="display:flex;gap:8px;align-items:center;margin-bottom:16px;">';
    izq += Tanqueos._badgeEstado(t.estado_validacion);
    if (t.tipo_tanqueo === 'emergencia') {
      izq += '<span class="badge badge-warning">⚠️ Emergencia</span>';
    }
    if (t.rendimiento_alerta) {
      izq += '<span class="badge badge-warning">📉 Rendimiento anómalo</span>';
    }
    izq += '</div>';

    // Fecha y conductor
    izq += '<div style="margin-bottom:16px;">';
    izq += '<div class="text-xs text-secondary">Fecha</div>';
    izq += '<div>' + (t.created_at ? t.created_at.substring(0, 10) : '-') + '</div>';
    izq += '<div class="text-xs text-secondary" style="margin-top:8px;">Conductor</div>';
    izq += '<div>' + (t.conductores ? t.conductores.nombre : '-') + '</div>';
    izq += '</div>';

    // Sección: datos factura
    izq += '<div class="drawer-section" style="margin-bottom:12px;">';
    izq += '<div class="text-xs text-secondary" style="margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em;">Factura</div>';
    izq += '<div class="flex gap-sm" style="margin-bottom:4px;"><span class="text-secondary" style="min-width:140px;">Nro. manual</span><strong>' + (t.factura_numero_manual || '-') + '</strong></div>';
    izq += '<div class="flex gap-sm"><span class="text-secondary" style="min-width:140px;">Nro. OCR</span><strong>' + (t.factura_numero_ocr || '-') + '</strong> ' + indicador('factura_numero') + '</div>';
    izq += '</div>';

    // Sección: vehículo / placa
    izq += '<div class="drawer-section" style="margin-bottom:12px;">';
    izq += '<div class="text-xs text-secondary" style="margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em;">Vehículo</div>';
    izq += '<div class="flex gap-sm" style="margin-bottom:4px;"><span class="text-secondary" style="min-width:140px;">Placa foto</span><strong>' + (t.placa_ocr_foto || t.vehiculo_placa || '-') + '</strong></div>';
    izq += '<div class="flex gap-sm"><span class="text-secondary" style="min-width:140px;">Placa recibo OCR</span><strong>' + (t.placa_ocr_factura || '-') + '</strong> ' + indicador('placa') + '</div>';
    izq += '</div>';

    // Sección: kilometraje
    var kmOcrFact = t.km_ocr_factura;
    var kmOcrFactTxt = kmOcrFact != null && kmOcrFact !== ''
      ? (typeof kmOcrFact === 'number' ? kmOcrFact.toLocaleString('es-CO') : String(kmOcrFact)) + ' km'
      : '-';
    izq += '<div class="drawer-section" style="margin-bottom:12px;">';
    izq += '<div class="text-xs text-secondary" style="margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em;">Kilometraje</div>';
    izq += '<div class="flex gap-sm" style="margin-bottom:4px;"><span class="text-secondary" style="min-width:140px;">Odómetro foto</span><strong>' + (t.km_ocr_odometro != null ? t.km_ocr_odometro.toLocaleString('es-CO') + ' km' : '-') + '</strong></div>';
    izq += '<div class="flex gap-sm"><span class="text-secondary" style="min-width:140px;">Km recibo OCR</span><strong>' + kmOcrFactTxt + '</strong> ' + indicador('kilometraje') + '</div>';
    izq += '</div>';

    // Sección: combustible
    izq += '<div class="drawer-section" style="margin-bottom:12px;">';
    izq += '<div class="text-xs text-secondary" style="margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em;">Combustible</div>';
    izq += '<div class="flex gap-sm" style="margin-bottom:4px;"><span class="text-secondary" style="min-width:140px;">Tipo</span><strong>' + (t.tipo_combustible || '-') + '</strong></div>';
    izq += '<div class="flex gap-sm" style="margin-bottom:4px;"><span class="text-secondary" style="min-width:140px;">Cantidad OCR</span><strong>' + (t.cantidad_ocr ? t.cantidad_ocr + ' ' + (t.unidad_medida || '') : '-') + '</strong></div>';
    izq += '<div class="flex gap-sm" style="margin-bottom:4px;"><span class="text-secondary" style="min-width:140px;">Cantidad conductor</span><strong>' + (t.cantidad_manual ? t.cantidad_manual + ' ' + (t.unidad_medida || '') : '-') + '</strong> ' + indicador('cantidad') + '</div>';
    izq += '<div class="flex gap-sm" style="margin-bottom:4px;"><span class="text-secondary" style="min-width:140px;">Valor total</span><strong>' + (t.valor_total ? '$' + parseInt(t.valor_total, 10).toLocaleString('es-CO') : '-') + '</strong></div>';
    izq += '<div class="flex gap-sm"><span class="text-secondary" style="min-width:140px;">Precio / unidad</span><strong>' + (t.precio_unitario ? '$' + parseFloat(t.precio_unitario).toLocaleString('es-CO') : '-') + '</strong></div>';
    izq += '</div>';

    // Sección: rendimiento
    izq += '<div class="drawer-section" style="margin-bottom:12px;">';
    izq += '<div class="text-xs text-secondary" style="margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em;">Rendimiento</div>';
    if (t.rendimiento_calculado) {
      var veh = t.vehiculos || {};
      var rendTxt = (t.es_primer_tanqueo === true || parseFloat(t.rendimiento_calculado) >= 500)
        ? 'Primer registro'
        : (parseFloat(t.rendimiento_calculado).toFixed(2) + ' km/u');
      izq += '<div class="flex gap-sm" style="margin-bottom:4px;"><span class="text-secondary" style="min-width:140px;">Km recorridos</span><strong>' + (t.diferencia_km != null ? t.diferencia_km.toLocaleString('es-CO') + ' km' : '-') + '</strong></div>';
      izq += '<div class="flex gap-sm" style="margin-bottom:4px;"><span class="text-secondary" style="min-width:140px;">Rendimiento</span><strong>' + rendTxt + '</strong>';
      if (t.rendimiento_alerta) izq += ' <span class="badge badge-warning" style="font-size:0.7rem;">Fuera de rango</span>';
      izq += '</div>';
      if (veh.rendimiento_min && veh.rendimiento_max) {
        izq += '<div class="flex gap-sm"><span class="text-secondary" style="min-width:140px;">Rango esperado</span><strong>' + veh.rendimiento_min + ' – ' + veh.rendimiento_max + ' km/u</strong></div>';
      }
    } else {
      izq += '<div class="text-secondary" style="font-size:0.85rem;">Línea base — sin cálculo (primer tanqueo)</div>';
    }
    izq += '</div>';

    // Miniaturas fotos placa y odómetro
    if (urlPlaca || urlOdom) {
      izq += '<div class="drawer-section" style="margin-bottom:12px;">';
      izq += '<div class="text-xs text-secondary" style="margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em;">Fotos</div>';
      izq += '<div class="flex gap-sm">';
      if (urlPlaca) izq += '<a href="' + urlPlaca + '" target="_blank"><img src="' + urlPlaca + '" style="width:90px;height:60px;object-fit:cover;border-radius:4px;border:1px solid var(--border-color);" title="Foto placa"></a>';
      if (urlOdom) izq += '<a href="' + urlOdom + '" target="_blank"><img src="' + urlOdom + '" style="width:90px;height:60px;object-fit:cover;border-radius:4px;border:1px solid var(--border-color);" title="Odómetro"></a>';
      izq += '</div></div>';
    }

    // Discrepancias
    if (disc.length > 0) {
      izq += '<div class="drawer-section" style="margin-bottom:12px;">';
      izq += '<div class="text-xs text-secondary" style="margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em;color:var(--color-danger);">Discrepancias</div>';
      disc.forEach(function(d) {
        izq += '<div style="margin-bottom:4px;font-size:0.85rem;"><strong>' + d.campo + '</strong>: conductor <em>' + d.valor_conductor + '</em> vs OCR <em>' + d.valor_ocr + '</em></div>';
      });
      izq += '</div>';
    }

    // Motivo rechazo
    if (t.estado_validacion === 'rechazado' && t.motivo_rechazo) {
      izq += '<div class="drawer-section" style="margin-bottom:12px;">';
      izq += '<div class="text-xs text-secondary" style="margin-bottom:6px;color:var(--color-danger);">MOTIVO RECHAZO</div>';
      izq += '<div style="font-size:0.9rem;">' + t.motivo_rechazo + '</div>';
      izq += '</div>';
    }

    // Botones acción
    if (t.estado_validacion === 'pendiente_revision' || t.estado_validacion === 'auto_validado') {
      izq += '<div style="display:flex;gap:8px;margin-top:16px;padding-top:16px;border-top:1px solid var(--border-color);">';
      izq += '<button class="btn btn-success btn-sm" onclick="Tanqueos.accionValidar(\'' + t.id + '\', \'validar\')">✅ Validar</button>';
      izq += '<button class="btn btn-danger btn-sm" onclick="Tanqueos.accionValidar(\'' + t.id + '\', \'rechazar\')">❌ Rechazar</button>';
      izq += '</div>';
    }

    izq += '</div>'; // fin panel izquierdo

    // Panel derecho — foto factura sticky
    var der = '<div style="background:var(--bg-secondary);border-left:1px solid var(--border-color);display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:16px;min-height:100%;">';
    der += '<div style="position:sticky;top:0;">';
    if (urlFact) {
      der += '<div class="text-xs text-secondary" style="margin-bottom:8px;text-align:center;">📄 Foto recibo</div>';
      der += '<a href="' + urlFact + '" target="_blank" title="Ampliar">';
      der += '<img src="' + urlFact + '" style="width:100%;max-width:340px;border-radius:6px;border:1px solid var(--border-color);cursor:zoom-in;" onerror="this.parentElement.innerHTML=\'<span class=\\\"text-secondary\\\">Foto no disponible</span>\'">';
      der += '</a>';
      der += '<div class="text-xs text-secondary" style="margin-top:6px;text-align:center;">Clic para ampliar</div>';
    } else {
      der += '<div style="text-align:center;padding:40px 0;"><span class="text-secondary">Sin foto de recibo</span></div>';
    }
    der += '</div></div>';

    // Layout split 50/50
    return '<div style="display:grid;grid-template-columns:1fr 1fr;height:100%;overflow:hidden;">' + izq + der + '</div>';
  },

  // ─────────────────────────────────────────────────────────
  // ACCIONES DE VALIDACIÓN
  // ─────────────────────────────────────────────────────────

  async accionValidar(id, decision) {
    var motivoRechazo = '';
    if (decision === 'rechazar') {
      motivoRechazo = prompt('Motivo de rechazo (obligatorio):');
      if (!motivoRechazo || motivoRechazo.trim().length < 5) {
        Toast.error('Motivo requerido (mín 5 caracteres)');
        return;
      }
    } else {
      if (!confirm('¿Confirmar validación del tanqueo?')) return;
    }
    try {
      await API.put('/tanqueos/' + id + '/validar', {
        decision: decision,
        motivo_rechazo: motivoRechazo
      });
      Toast.success(decision === 'validar' ? 'Tanqueo validado' : 'Tanqueo rechazado');
      this.cerrarDrawer();
      await this.cargarDatos();
    } catch (e) {
      Toast.error('Error al procesar la acción');
    }
  },

  // ─────────────────────────────────────────────────────────
  // CONSOLIDADO MENSUAL
  // ─────────────────────────────────────────────────────────

  async abrirConsolidado() {
    var modal = document.getElementById('modal-consolidado');
    var body = document.getElementById('modal-consolidado-body');
    if (!modal) return;
    modal.style.display = 'flex';
    body.innerHTML = '<div style="padding:24px;text-align:center;"><span class="text-secondary">Cargando consolidado...</span></div>';
    await this.cargarConsolidado();
  },

  cerrarConsolidado: function() {
    var modal = document.getElementById('modal-consolidado');
    if (modal) modal.style.display = 'none';
  },

  async cargarConsolidado() {
    var body = document.getElementById('modal-consolidado-body');
    try {
      var resp = await API.get('/tanqueos/consolidado?mes=' + encodeURIComponent(this.consolidadoMes));
      this.consolidadoData = resp;
      body.innerHTML = this._renderConsolidado(resp);
    } catch (e) {
      body.innerHTML = '<div style="padding:24px;"><span class="badge badge-danger">Error cargando consolidado</span></div>';
    }
  },

  /** Descarga CSV con el mismo token que el resto del panel (fetch + blob). */
  async exportarCsvConsolidado() {
    try {
      var token = sessionStorage.getItem('cero_token');
      var url = '/api/tanqueos/consolidado/exportar?mes=' + encodeURIComponent(this.consolidadoMes);
      var resp = await fetch(url, {
        method: 'GET',
        headers: token ? { Authorization: 'Bearer ' + token } : {}
      });
      if (!resp.ok) throw new Error('export');
      var blob = await resp.blob();
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'tanqueos-' + this.consolidadoMes + '.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      Toast.error('No se pudo exportar el CSV');
    }
  },

  _renderConsolidado: function(resp) {
    var r = resp.resumen || {};
    var veh = resp.porVehiculo || [];

    var html = '';

    // Selector de mes + botón exportar
    html += '<div class="flex gap-sm items-center" style="margin-bottom:16px;">';
    html += '<label class="text-xs text-secondary">Mes</label>';
    html += '<input type="month" class="input input-sm" value="' + this.consolidadoMes + '" onchange="Tanqueos.consolidadoMes=this.value;Tanqueos.cargarConsolidado()" style="width:160px;">';
    html += '<button type="button" class="btn btn-secondary btn-sm" onclick="Tanqueos.exportarCsvConsolidado()">⬇️ Exportar CSV</button>';
    html += '</div>';

    // Resumen
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">';
    html += Tanqueos._cardResumen('Total tanqueos', r.total_tanqueos || 0);
    html += Tanqueos._cardResumen('Total galones', (r.total_galones || 0).toFixed(1));
    html += Tanqueos._cardResumen('Total pesos', '$' + (r.total_pesos || 0).toLocaleString('es-CO'));
    html += Tanqueos._cardResumen('Precio prom./gal', r.precio_promedio_galon ? '$' + parseInt(r.precio_promedio_galon, 10).toLocaleString('es-CO') : '-');
    html += '</div>';

    // Desglose convenio vs emergencia
    html += '<div class="flex gap-sm" style="margin-bottom:16px;">';
    html += '<span class="badge badge-info">Convenio: ' + (r.convenio || 0) + '</span>';
    html += '<span class="badge badge-warning">Emergencia: ' + (r.emergencia || 0) + '</span>';
    html += '</div>';

    // Tabla por vehículo
    if (veh.length === 0) {
      html += '<div class="text-secondary" style="text-align:center;padding:24px;">Sin tanqueos validados en este período.</div>';
      return html;
    }

    html += '<table class="table"><thead><tr>';
    html += '<th>Placa</th><th>Vehículo</th><th># Tanqueos</th><th>Galones</th><th>Litros</th><th>Total pesos</th><th>Rend. promedio</th>';
    html += '</tr></thead><tbody>';

    veh.forEach(function(v) {
      html += '<tr>';
      html += '<td><strong>' + v.placa + '</strong></td>';
      html += '<td>' + [v.marca, v.modelo].filter(Boolean).join(' ') + '</td>';
      html += '<td>' + v.tanqueos + '</td>';
      html += '<td>' + (v.total_galones || 0).toFixed(1) + '</td>';
      html += '<td>' + (v.total_litros || 0).toFixed(1) + '</td>';
      html += '<td>$' + (v.total_pesos || 0).toLocaleString('es-CO') + '</td>';
      html += '<td>' + (v.rendimiento_promedio ? v.rendimiento_promedio + ' km/u' : '-') + '</td>';
      html += '</tr>';
    });

    html += '</tbody></table>';
    return html;
  },

  _cardResumen: function(label, value) {
    return '<div style="background:var(--bg-tertiary);border-radius:8px;padding:12px;">' +
      '<div class="text-xs text-secondary">' + label + '</div>' +
      '<div style="font-size:1.4rem;font-weight:700;">' + value + '</div>' +
      '</div>';
  }

};
