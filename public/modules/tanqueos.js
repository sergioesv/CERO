// ═══════════════════════════════════════════════════════════
// CERO — Módulo Tanqueos (refactor API/Logic/Render/Orquestación)
// ═══════════════════════════════════════════════════════════

const TanqueosAPI = {
  async listar(filtros) {
    var params = new URLSearchParams();
    if (filtros.fecha_inicio) params.append('fecha_inicio', filtros.fecha_inicio);
    if (filtros.fecha_fin) params.append('fecha_fin', filtros.fecha_fin);
    if (filtros.placa) params.append('placa', filtros.placa);
    if (filtros.estado_validacion === 'pendiente_revision') {
      params.append('estado_validacion', 'pendiente_revision');
    }
    if (filtros.estado_validacion === 'revisados') {
      params.append('estado_validacion', 'revisados');
    }
    var qs = params.toString();
    var resp = await API.get('/tanqueos' + (qs ? '?' + qs : ''));
    return {
      data: resp.data || [],
      stats: resp.stats || {}
    };
  },

  async obtenerDetalle(id) {
    var resp = await API.get('/tanqueos/' + id);
    return resp.data;
  },

  async marcarRevisado(id, notas) {
    return API.put('/tanqueos/' + id + '/validar', {
      decision: 'validar',
      notas_admin: notas || ''
    });
  },

  async revisarLote(ids) {
    return API.put('/tanqueos/validar-lote', { ids: ids });
  },

  async obtenerConsolidado(mes) {
    return API.get('/tanqueos/consolidado?mes=' + encodeURIComponent(mes));
  },

  async exportarCsv(mes) {
    var token = sessionStorage.getItem('cero_token');
    var url = '/api/tanqueos/consolidado/exportar?mes=' + encodeURIComponent(mes);
    var resp = await fetch(url, {
      method: 'GET',
      headers: token ? { Authorization: 'Bearer ' + token } : {}
    });
    if (!resp.ok) throw new Error('export');
    var blob = await resp.blob();
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tanqueos-' + mes + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }
};

const TanqueosLogic = {
  ordenarDatos(data) {
    var orden = { pendiente_revision: 0, auto_validado: 1, revisado: 2, validado: 2 };
    return (data || []).slice().sort(function(a, b) {
      var pa = orden[a.estado_validacion] == null ? 9 : orden[a.estado_validacion];
      var pb = orden[b.estado_validacion] == null ? 9 : orden[b.estado_validacion];
      if (pa !== pb) return pa - pb;
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });
  },

  badgeEstado(estado) {
    var mapa = {
      pendiente_revision: '<span class="badge badge-warning">Pendiente</span>',
      auto_validado: '<span class="badge badge-info">Auto-validado</span>',
      revisado: '<span class="badge badge-success">Revisado</span>',
      validado: '<span class="badge badge-success">Revisado</span>'
    };
    return mapa[estado] || '<span class="badge">' + Utils.escaparHTML(estado || '-') + '</span>';
  },

  proxyUrl(foto) {
    if (!foto) return null;
    var candidata = foto.url_firmada || foto.foto_url || '';
    if (typeof candidata === 'string' && candidata.indexOf('https://api.twilio.com') === 0 && foto.id) {
      var base = '/api/tanqueos/media/' + foto.id;
      var tok = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('cero_token') : null;
      return tok ? base + '?token=' + encodeURIComponent(tok) : base;
    }
    return candidata || null;
  },

  indicadorCruce(discrepancias, campo) {
    var hay = (discrepancias || []).some(function(d) { return d.campo === campo; });
    if (hay) return '<span style="color:var(--color-danger);font-weight:700;">✗</span>';
    return '<span style="color:var(--color-success);font-weight:700;">✓</span>';
  },

  tieneDiscrepancias(t) {
    return !!(t && Array.isArray(t.discrepancias) && t.discrepancias.length > 0);
  },

  formatearCantidad(cantidad, unidad) {
    if (!cantidad) return '-';
    return parseFloat(cantidad).toFixed(3) + ' ' + Utils.escaparHTML(unidad || 'L');
  },

  formatearRendimiento(t) {
    if (!t) return '-';
    var valor = parseFloat(t.rendimiento_calculado || 0);
    if (t.es_primer_tanqueo === true || valor >= 500) return 'Línea base';
    if (t.rendimiento_calculado) return valor.toFixed(2) + ' km/u';
    return '-';
  },

  formatearValor(valor) {
    if (!valor) return '-';
    return '$' + parseInt(valor, 10).toLocaleString('es-CO');
  },

  formatearLitrosOGalones(s) {
    var c = s && s.combustible_total ? s.combustible_total : {};
    var gal = parseFloat(c.galones || s.galones_total || 0);
    var lit = parseFloat(c.litros || s.litros_total || 0);
    var partes = [];
    if (gal > 0) partes.push(gal.toFixed(3) + ' gal');
    if (lit > 0) partes.push(lit.toFixed(3) + ' lit');
    return partes.length ? partes.join(' + ') : '-';
  }
};

const TanqueosRender = {
  stats(s) {
    return Card.statsGrid([
      { label: 'Tanqueos período', value: s.total || 0 },
      { label: 'Combustible período', value: TanqueosLogic.formatearLitrosOGalones(s) },
      { label: 'Pendientes revisión', value: s.pendientes || 0, type: (s.pendientes || 0) > 0 ? 'danger' : null },
      { label: 'Anomalías rendimiento', value: s.anomalias || 0, type: (s.anomalias || 0) > 0 ? 'warning' : null }
    ]);
  },

  filaTabla(t) {
    var fecha = t.created_at ? Utils.formatearFecha(t.created_at) : '-';
    var conductor = t.conductores ? t.conductores.nombre : '-';
    var alerta = TanqueosLogic.tieneDiscrepancias(t) ? ' <span title="Con discrepancias">⚠</span>' : '';
    var check = (t.estado_validacion === 'pendiente_revision' || t.estado_validacion === 'auto_validado')
      ? '<input type="checkbox" class="tanq-check" data-id="' + Utils.escaparHTML(t.id) + '" onchange="Tanqueos.toggleSeleccion(\'' + Utils.escaparHTML(t.id) + '\')">'
      : '';

    return '<tr class="table-row-clickable" onclick="Tanqueos.abrirDetalle(\'' + Utils.escaparHTML(t.id) + '\')" style="cursor:pointer;" data-testid="row-tanqueo-' + Utils.escaparHTML(t.id) + '">' +
      '<td onclick="event.stopPropagation()" style="width:36px;">' + check + '</td>' +
      '<td>' + Utils.escaparHTML(fecha) + '</td>' +
      '<td><strong>' + Utils.escaparHTML(t.vehiculo_placa || '-') + '</strong></td>' +
      '<td class="col-hidden-mobile">' + Utils.escaparHTML(conductor) + '</td>' +
      '<td class="col-hidden-mobile">' + Utils.escaparHTML(TanqueosLogic.formatearCantidad(t.cantidad, t.unidad_medida)) + '</td>' +
      '<td class="col-hidden-mobile">' + Utils.escaparHTML(TanqueosLogic.formatearValor(t.valor_total)) + '</td>' +
      '<td>' + TanqueosLogic.badgeEstado(t.estado_validacion) + alerta + '</td>' +
      '</tr>';
  },

  tabla(data) {
    if (!data || !data.length) {
      return '<div style="text-align:center;padding:40px;"><span class="text-secondary">Sin tanqueos para los filtros seleccionados</span></div>';
    }
    var datos = TanqueosLogic.ordenarDatos(data);
    var filas = datos.map(TanqueosRender.filaTabla).join('');
    var haySeleccionables = datos.some(function(t) {
      return t.estado_validacion === 'pendiente_revision' || t.estado_validacion === 'auto_validado';
    });
    return '<table class="table" data-testid="tabla-tanqueos">' +
      '<thead><tr>' +
      '<th style="width:36px;">' + (haySeleccionables ? '<input type="checkbox" onchange="Tanqueos.toggleTodos(this.checked)" data-testid="check-todos">' : '') + '</th>' +
      '<th>Fecha</th><th>Placa</th><th class="col-hidden-mobile">Conductor</th><th class="col-hidden-mobile">Cantidad</th><th class="col-hidden-mobile">Valor</th><th>Estado</th>' +
      '</tr></thead>' +
      '<tbody>' + filas + '</tbody>' +
      '</table>';
  },

  drawer(t) {
    var fotos = t.fotos || [];
    var fotoFact = fotos.find(function(f) { return f.tipo === 'factura'; });
    var fotoOdom = fotos.find(function(f) { return f.tipo === 'odometro'; });
    var urlFact = TanqueosLogic.proxyUrl(fotoFact);
    var urlOdom = TanqueosLogic.proxyUrl(fotoOdom);
    var disc = t.discrepancias || [];
    var puedeRevisar = t.estado_validacion === 'pendiente_revision' || t.estado_validacion === 'auto_validado';
    var kmOcrFact = t.km_ocr_factura != null && t.km_ocr_factura !== '' ? String(t.km_ocr_factura) : '-';
    var kmOdom = t.km_ocr_odometro != null && t.km_ocr_odometro !== '' ? String(t.km_ocr_odometro) : '-';
    var camposDisc = disc.map(function(d) { return Utils.escaparHTML(d.campo); }).join(', ');

    var html = '';

    html += '<div style="padding:14px;border-bottom:1px solid var(--border-color);position:sticky;top:0;background:var(--bg-primary);z-index:2;">';
    html += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">';
    html += '<span style="font-size:1.05rem;">' + TanqueosLogic.badgeEstado(t.estado_validacion) + '</span>';
    if (puedeRevisar) html += '<button id="tanq-btn-revisado" class="btn btn-success btn-sm" data-testid="btn-marcar-revisado">Marcar revisado</button>';
    html += '<button id="tanq-btn-notas" class="btn btn-secondary btn-sm" data-testid="btn-add-notas">+ Notas</button>';
    html += '</div></div>';

    html += '<div style="padding:16px;">';
    html += '<div style="margin-bottom:16px;">';
    html += '<div class="text-xs text-secondary" style="margin-bottom:6px;">FOTO FACTURA</div>';
    if (urlFact) {
      html += '<img id="tanq-foto-factura" data-url="' + Utils.escaparHTML(urlFact) + '" src="' + Utils.escaparHTML(urlFact) + '" style="width:100%;max-width:100%;border-radius:8px;border:1px solid var(--border-color);cursor:zoom-in;" />';
    } else {
      html += '<div style="padding:18px;border:1px dashed var(--border-color);border-radius:8px;text-align:center;" class="text-secondary">Sin foto de recibo</div>';
    }
    if (urlOdom) {
      html += '<div style="margin-top:8px;">';
      html += '<div class="text-xs text-secondary" style="margin-bottom:6px;">Odómetro</div>';
      html += '<img id="tanq-foto-odometro" data-url="' + Utils.escaparHTML(urlOdom) + '" src="' + Utils.escaparHTML(urlOdom) + '" style="width:120px;height:80px;object-fit:cover;border-radius:6px;border:1px solid var(--border-color);cursor:zoom-in;" />';
      html += '</div>';
    }
    html += '</div>';

    html += '<div style="margin-bottom:16px;">';
    html += '<div style="font-size:0.78rem;letter-spacing:.08em;color:var(--text-secondary);font-weight:700;margin-bottom:8px;">CRUCE TERPEL</div>';
    html += '<table class="table"><tbody>';
    html += '<tr><td>Placa recibo OCR</td><td><strong>' + Utils.escaparHTML(t.placa_ocr_factura || '-') + '</strong> ' + TanqueosLogic.indicadorCruce(disc, 'placa') + '</td></tr>';
    html += '<tr><td>Placa BD</td><td><strong>' + Utils.escaparHTML(t.vehiculo_placa || '-') + '</strong></td></tr>';
    html += '<tr><td>Km recibo OCR</td><td><strong>' + Utils.escaparHTML(kmOcrFact) + '</strong> ' + TanqueosLogic.indicadorCruce(disc, 'kilometraje') + '</td></tr>';
    html += '<tr><td>Km odómetro foto</td><td><strong>' + Utils.escaparHTML(kmOdom) + '</strong></td></tr>';
    html += '<tr><td>Cantidad OCR</td><td><strong>' + Utils.escaparHTML(TanqueosLogic.formatearCantidad(t.cantidad_ocr, t.unidad_medida)) + '</strong> ' + TanqueosLogic.indicadorCruce(disc, 'cantidad') + '</td></tr>';
    html += '<tr><td>Valor total</td><td><strong>' + Utils.escaparHTML(TanqueosLogic.formatearValor(t.valor_total)) + '</strong></td></tr>';
    html += '</tbody></table>';
    if (disc.length) {
      html += '<div style="margin-top:8px;padding:8px 10px;border-radius:6px;background:rgba(239,68,68,.12);color:var(--color-danger);font-size:.85rem;">Conflictos detectados: ' + camposDisc + '</div>';
    }
    html += '</div>';

    html += '<div id="tanq-notas-wrap" style="display:none;margin-bottom:16px;">';
    html += '<div class="text-xs text-secondary" style="margin-bottom:6px;">Notas internas</div>';
    html += '<textarea id="tanq-notas-input" class="input" rows="3" placeholder="Agregar nota interna..." style="width:100%;">' + Utils.escaparHTML(Tanqueos.notasDrawer || '') + '</textarea>';
    html += '</div>';

    html += '<div style="margin-bottom:16px;">';
    html += '<button id="tanq-toggle-adicionales" class="btn btn-secondary btn-sm">Datos adicionales ▼</button>';
    html += '<div id="tanq-datos-adicionales" style="display:none;margin-top:10px;">';
    html += '<div class="flex gap-sm" style="margin-bottom:4px;"><span class="text-secondary" style="min-width:180px;">Conductor</span><strong>' + Utils.escaparHTML(t.conductores ? t.conductores.nombre : '-') + '</strong></div>';
    html += '<div class="flex gap-sm" style="margin-bottom:4px;"><span class="text-secondary" style="min-width:180px;">Fecha</span><strong>' + Utils.escaparHTML(t.created_at ? Utils.formatearFecha(t.created_at) : '-') + '</strong></div>';
    html += '<div class="flex gap-sm" style="margin-bottom:4px;"><span class="text-secondary" style="min-width:180px;">Tipo tanqueo</span><strong>' + Utils.escaparHTML(t.tipo_tanqueo || '-') + '</strong></div>';
    html += '<div class="flex gap-sm" style="margin-bottom:4px;"><span class="text-secondary" style="min-width:180px;">Número factura OCR</span><strong>' + Utils.escaparHTML(t.factura_numero_ocr || '-') + '</strong></div>';
    html += '<div class="flex gap-sm" style="margin-bottom:4px;"><span class="text-secondary" style="min-width:180px;">Número manual</span><strong>' + Utils.escaparHTML(t.factura_numero_manual || t.factura_numero || '-') + '</strong></div>';
    html += '<div class="flex gap-sm" style="margin-bottom:4px;"><span class="text-secondary" style="min-width:180px;">Score OCR</span><strong>' + Utils.escaparHTML(t.ocr_score || '-') + '</strong></div>';
    html += '<div class="flex gap-sm" style="margin-bottom:4px;"><span class="text-secondary" style="min-width:180px;">Tier OCR</span><strong>' + Utils.escaparHTML(t.ocr_tier || '-') + '</strong></div>';
    html += '<div class="flex gap-sm" style="margin-bottom:4px;"><span class="text-secondary" style="min-width:180px;">Serial iButton</span><strong>' + Utils.escaparHTML(t.ibutton_serial || '-') + '</strong></div>';
    html += '<div class="flex gap-sm" style="margin-bottom:4px;"><span class="text-secondary" style="min-width:180px;">Rendimiento calculado</span><strong>' + Utils.escaparHTML(TanqueosLogic.formatearRendimiento(t)) + '</strong></div>';
    if (t.vehiculos && t.vehiculos.rendimiento_min && t.vehiculos.rendimiento_max) {
      html += '<div class="flex gap-sm"><span class="text-secondary" style="min-width:180px;">Rango esperado</span><strong>' + Utils.escaparHTML(t.vehiculos.rendimiento_min) + ' - ' + Utils.escaparHTML(t.vehiculos.rendimiento_max) + ' km/u</strong></div>';
    }
    html += '</div></div>';

    html += '</div>';
    return html;
  },

  lightbox() {
    return '<div id="tanq-lightbox" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:9999;cursor:zoom-out;align-items:center;justify-content:center;">' +
      '<button id="tanq-lightbox-close" class="btn btn-secondary btn-sm" style="position:absolute;top:14px;right:14px;">✕</button>' +
      '<img id="tanq-lightbox-img" src="" style="max-width:95vw;max-height:95vh;">' +
      '</div>';
  },

  consolidado(resp, mes) {
    var r = resp.resumen || {};
    var veh = resp.porVehiculo || [];
    var html = '';
    html += '<div class="flex gap-sm items-center" style="margin-bottom:16px;">';
    html += '<label class="text-xs text-secondary">Mes</label>';
    html += '<input type="month" class="input input-sm" value="' + Utils.escaparHTML(mes) + '" id="tanq-consolidado-mes" style="width:160px;">';
    html += '<button type="button" class="btn btn-secondary btn-sm" onclick="Tanqueos.exportarCsvConsolidado()">⬇️ Exportar CSV</button>';
    html += '</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">';
    html += Tanqueos._cardResumen('Total tanqueos', Utils.escaparHTML(r.total_tanqueos || 0));
    html += Tanqueos._cardResumen('Total galones', Utils.escaparHTML((r.total_galones || 0).toFixed(1)));
    html += Tanqueos._cardResumen('Total pesos', Utils.escaparHTML(TanqueosLogic.formatearValor(r.total_pesos)));
    html += Tanqueos._cardResumen('Precio prom./gal', r.precio_promedio_galon ? Utils.escaparHTML(TanqueosLogic.formatearValor(r.precio_promedio_galon)) : '-');
    html += '</div>';
    html += '<div class="flex gap-sm" style="margin-bottom:16px;">';
    html += '<span class="badge badge-info">Convenio: ' + Utils.escaparHTML(r.convenio || 0) + '</span>';
    html += '<span class="badge badge-warning">Emergencia: ' + Utils.escaparHTML(r.emergencia || 0) + '</span>';
    html += '</div>';
    if (veh.length === 0) {
      html += '<div class="text-secondary" style="text-align:center;padding:24px;">Sin tanqueos validados en este período.</div>';
      return html;
    }
    html += '<table class="table"><thead><tr>';
    html += '<th>Placa</th><th>Vehículo</th><th># Tanqueos</th><th>Galones</th><th>Litros</th><th>Total pesos</th><th>Rend. promedio</th>';
    html += '</tr></thead><tbody>';
    veh.forEach(function(v) {
      html += '<tr>';
      html += '<td><strong>' + Utils.escaparHTML(v.placa) + '</strong></td>';
      html += '<td>' + Utils.escaparHTML([v.marca, v.modelo].filter(Boolean).join(' ')) + '</td>';
      html += '<td>' + Utils.escaparHTML(v.tanqueos) + '</td>';
      html += '<td>' + Utils.escaparHTML((v.total_galones || 0).toFixed(1)) + '</td>';
      html += '<td>' + Utils.escaparHTML((v.total_litros || 0).toFixed(1)) + '</td>';
      html += '<td>' + Utils.escaparHTML(TanqueosLogic.formatearValor(v.total_pesos)) + '</td>';
      html += '<td>' + Utils.escaparHTML(v.rendimiento_promedio ? v.rendimiento_promedio + ' km/u' : '-') + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table>';
    return html;
  }
};

const Tanqueos = {
  data: [],
  stats: {},
  filtros: {
    fecha_inicio: '',
    fecha_fin: '',
    placa: '',
    estado_validacion: 'todos'
  },
  detalleActual: null,
  seleccionados: [],
  consolidadoMes: '',
  notasDrawer: '',
  _lightboxEscHandler: null,
  _lightboxEventosBindeados: false,

  async render() {
    var hoy = fechaHoyBogota();
    var d7 = new Date(hoy + 'T00:00:00');
    d7.setDate(d7.getDate() - 6);
    var hace7 = d7.toISOString().split('T')[0];
    this.filtros.fecha_inicio = this.filtros.fecha_inicio || hace7;
    this.filtros.fecha_fin = this.filtros.fecha_fin || hoy;
    if (!this.consolidadoMes) this.consolidadoMes = hoy.substring(0, 7);

    var main = document.getElementById('main');
    main.innerHTML = '' +
      '<div class="main-header">' +
      '<div><h1 class="main-title">Tanqueos</h1><p class="main-subtitle">Control de combustible y validación cruzada</p></div>' +
      '<div class="main-actions">' +
      '<button class="btn btn-secondary btn-sm" onclick="Tanqueos.abrirConsolidado()">📊 Consolidado mensual</button>' +
      '<button class="btn btn-secondary btn-sm" onclick="Tanqueos.resetFiltros()">Limpiar filtros</button>' +
      '</div></div>' +
      '<div class="main-content">' +
      '<div id="tanq-stats"></div>' +
      '<div id="tanq-filters"></div>' +
      '<div id="tanq-acciones-lote" class="flex gap-sm" style="display:none;margin-bottom:8px;">' +
      '<span id="tanq-seleccionados-count" class="text-sm text-secondary"></span>' +
      '<button class="btn btn-sm btn-success" onclick="Tanqueos.validarLote()">Marcar revisados</button>' +
      '</div>' +
      '<div id="tanq-tabla"><div style="text-align:center;padding:40px;"><span class="text-secondary">Cargando tanqueos...</span></div></div>' +
      '</div>' +
      '<div class="modal-overlay" id="modal-consolidado" style="display:none;" onclick="if(event.target===this)Tanqueos.cerrarConsolidado()">' +
      '<div class="modal" style="max-width:860px;width:95vw;">' +
      '<div class="modal-header"><h3 class="modal-title">📊 Consolidado mensual</h3><button class="modal-close" onclick="Tanqueos.cerrarConsolidado()">&times;</button></div>' +
      '<div class="modal-body" id="modal-consolidado-body">Cargando...</div>' +
      '</div></div>';

    if (!document.getElementById('tanq-lightbox')) {
      document.body.insertAdjacentHTML('beforeend', TanqueosRender.lightbox());
    }
    this._bindLightboxEvents();

    Filters.render({
      containerId: 'tanq-filters',
      onFilterChange: (key, value) => {
        if (key === 'desde') this.filtros.fecha_inicio = value;
        if (key === 'hasta') this.filtros.fecha_fin = value;
        if (key === 'busqueda') this.filtros.placa = value;
        if (key === 'estado') this.filtros.estado_validacion = value;
        
        this.cargarDatos();
      },
      defaultState: this.filtros.estado_validacion,
      dateValues: { desde: this.filtros.fecha_inicio, hasta: this.filtros.fecha_fin, busqueda: this.filtros.placa },
      searchPlaceholder: 'Buscar placa...',
      states: [
        { value: 'todos', label: 'Todos', colorClass: 'btn-primary' },
        { value: 'pendiente_revision', label: 'Pendientes', colorClass: 'btn-warning' },
        { value: 'revisados', label: 'Revisados', colorClass: 'btn-success' }
      ]
    });

    await this.cargarDatos();
  },

  _bindLightboxEvents() {
    if (this._lightboxEventosBindeados) return;
    var overlay = document.getElementById('tanq-lightbox');
    var closeBtn = document.getElementById('tanq-lightbox-close');
    if (!overlay || !closeBtn) return;
    overlay.addEventListener('click', function() { Tanqueos.cerrarLightbox(); });
    closeBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      Tanqueos.cerrarLightbox();
    });
    this._lightboxEventosBindeados = true;
  },

  async cargarDatos() {
    try {
      var resp = await TanqueosAPI.listar(this.filtros);
      this.data = resp.data || [];
      this.stats = resp.stats || {};
      this.seleccionados = [];
      document.getElementById('tanq-stats').innerHTML = TanqueosRender.stats(this.stats);
      document.getElementById('tanq-tabla').innerHTML = TanqueosRender.tabla(this.data);
      this._actualizarBarraLote();
    } catch (error) {
      this.data = [];
      Toast.error('Error cargando tanqueos');
      document.getElementById('tanq-tabla').innerHTML = TanqueosRender.tabla([]);
    }
  },

  resetFiltros() {
    this.filtros = { fecha_inicio: '', fecha_fin: '', placa: '', estado_validacion: 'todos' };
    this.render();
  },

  async abrirDetalle(id) {
    Drawer.setLoading('Cargando detalle...');
    this.notasDrawer = '';

    try {
      var t = await TanqueosAPI.obtenerDetalle(id);
      this.detalleActual = t;

      Drawer.open({
        title: 'Tanqueo — ' + Utils.escaparHTML(t.vehiculo_placa || '-'),
        content: TanqueosRender.drawer(t),
        width: '780px'
      });

      var btnRevisado = document.getElementById('tanq-btn-revisado');
      var btnNotas = document.getElementById('tanq-btn-notas');
      var notasWrap = document.getElementById('tanq-notas-wrap');
      var notasInput = document.getElementById('tanq-notas-input');
      var fotoFact = document.getElementById('tanq-foto-factura');
      var fotoOdom = document.getElementById('tanq-foto-odometro');
      var toggleAdicionales = document.getElementById('tanq-toggle-adicionales');
      var panelAdicionales = document.getElementById('tanq-datos-adicionales');

      if (btnRevisado) {
        btnRevisado.addEventListener('click', function() { Tanqueos.accionRevisar(id); });
      }
      if (btnNotas && notasWrap) {
        btnNotas.addEventListener('click', function() {
          notasWrap.style.display = notasWrap.style.display === 'none' ? 'block' : 'none';
          if (notasInput) notasInput.focus();
        });
      }
      if (notasInput) {
        notasInput.addEventListener('input', function() {
          Tanqueos.notasDrawer = this.value || '';
        });
      }
      if (fotoFact) {
        fotoFact.addEventListener('click', function() {
          Tanqueos.abrirLightbox(fotoFact.getAttribute('data-url'));
        });
      }
      if (fotoOdom) {
        fotoOdom.addEventListener('click', function() {
          Tanqueos.abrirLightbox(fotoOdom.getAttribute('data-url'));
        });
      }
      if (toggleAdicionales && panelAdicionales) {
        toggleAdicionales.addEventListener('click', function() {
          var abierto = panelAdicionales.style.display === 'block';
          panelAdicionales.style.display = abierto ? 'none' : 'block';
          toggleAdicionales.textContent = abierto ? 'Datos adicionales ▼' : 'Datos adicionales ▲';
        });
      }
    } catch (e) {
      Drawer.open({ title: 'Error', content: '<div style="padding:24px;"><span class="badge badge-danger">Error cargando detalle</span></div>' });
    }
  },

  abrirLightbox(url) {
    if (!url) return;
    var img = document.getElementById('tanq-lightbox-img');
    var box = document.getElementById('tanq-lightbox');
    if (!img || !box) return;
    img.src = url;
    box.style.display = 'flex';
    this._lightboxEscHandler = function(e) {
      if (e.key === 'Escape') Tanqueos.cerrarLightbox();
    };
    document.addEventListener('keydown', this._lightboxEscHandler);
  },

  cerrarLightbox() {
    var box = document.getElementById('tanq-lightbox');
    if (box) box.style.display = 'none';
    if (this._lightboxEscHandler) {
      document.removeEventListener('keydown', this._lightboxEscHandler);
      this._lightboxEscHandler = null;
    }
  },

  async accionRevisar(id) {
    var notas = this.notasDrawer || '';
    if (!confirm('¿Marcar este tanqueo como revisado?')) return;
    try {
      await TanqueosAPI.marcarRevisado(id, notas);
      Toast.success('Tanqueo marcado como revisado');
      Drawer.close();
      await this.cargarDatos();
    } catch (e) {
      Toast.error('Error al procesar la acción');
    }
  },

  async validarLote() {
    if (!this.seleccionados.length) return;
    if (!confirm('¿Marcar ' + this.seleccionados.length + ' tanqueo(s) como revisados?')) return;
    try {
      await TanqueosAPI.revisarLote(this.seleccionados);
      Toast.success('Tanqueos marcados como revisados');
      this.seleccionados = [];
      await this.cargarDatos();
    } catch (e) {
      Toast.error('Error al procesar en lote');
    }
  },

  toggleSeleccion(id) {
    var idx = this.seleccionados.indexOf(id);
    if (idx === -1) this.seleccionados.push(id);
    else this.seleccionados.splice(idx, 1);
    this._actualizarBarraLote();
  },

  toggleTodos(checked) {
    var checks = document.querySelectorAll('.tanq-check');
    this.seleccionados = [];
    checks.forEach(function(c) {
      c.checked = checked;
      if (checked) Tanqueos.seleccionados.push(c.dataset.id);
    });
    this._actualizarBarraLote();
  },

  _actualizarBarraLote() {
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

  async abrirConsolidado() {
    var modal = document.getElementById('modal-consolidado');
    var body = document.getElementById('modal-consolidado-body');
    if (!modal) return;
    modal.style.display = 'flex';
    body.innerHTML = '<div style="padding:24px;text-align:center;"><span class="text-secondary">Cargando consolidado...</span></div>';
    await this.cargarConsolidado();
  },

  cerrarConsolidado() {
    var modal = document.getElementById('modal-consolidado');
    if (modal) modal.style.display = 'none';
  },

  async cargarConsolidado() {
    var body = document.getElementById('modal-consolidado-body');
    try {
      var resp = await TanqueosAPI.obtenerConsolidado(this.consolidadoMes);
      body.innerHTML = TanqueosRender.consolidado(resp, this.consolidadoMes);
      var mesInput = document.getElementById('tanq-consolidado-mes');
      if (mesInput) {
        mesInput.addEventListener('change', function() {
          Tanqueos.consolidadoMes = this.value;
          Tanqueos.cargarConsolidado();
        });
      }
    } catch (e) {
      body.innerHTML = '<div style="padding:24px;"><span class="badge badge-danger">Error cargando consolidado</span></div>';
    }
  },

  async exportarCsvConsolidado() {
    try {
      await TanqueosAPI.exportarCsv(this.consolidadoMes);
    } catch (e) {
      Toast.error('No se pudo exportar el CSV');
    }
  },

  _cardResumen(label, value) {
    return '<div style="background:var(--bg-tertiary);border-radius:8px;padding:12px;">' +
      '<div class="text-xs text-secondary">' + label + '</div>' +
      '<div style="font-size:1.4rem;font-weight:700;">' + value + '</div>' +
      '</div>';
  }
};

window.Tanqueos = Tanqueos;
