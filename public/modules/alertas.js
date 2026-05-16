// ═══════════════════════════════════════════════════════════
// CERO — Módulo Alertas
// Patrón INBOX: lista izquierda + panel detalle derecho
// Fase 2.1 — 22/03/2026
// ═══════════════════════════════════════════════════════════

const AlertasModule = {
  datos: {
    documentos: [],
    pendientes: [],
    resueltas: [],
    resumen: {}
  },
  filtroActivo: 'todas',
  itemSeleccionado: null,
  busqueda: '',
  historialOffset: {},

  // ─────────────────────────────────────────────────────────
  // RENDER PRINCIPAL
  // ─────────────────────────────────────────────────────────

  async render() {
    var main = document.getElementById('main');
    main.innerHTML = `
      <div class="main-header">
        <div>
          <h1 class="main-title">Alertas</h1>
          <p class="main-subtitle">Autorizaciones, documentos y bloqueos de flota</p>
        </div>
      </div>
      <div class="main-content">
        <div id="alertas-stats" class="alertas-stats"></div>
        <div class="alertas-inbox">
          <div class="alertas-lista">
            <div class="alertas-lista-header">
              <input type="text" class="input input-sm" id="alertas-buscar" placeholder="Buscar placa..." style="flex:1; min-width:0;">
              <select class="input input-sm" id="alertas-filtro" style="width:140px; flex-shrink:0;">
                <option value="todas">Todas</option>
                <option value="pendientes">Autorizaciones</option>
                <option value="documentos">Documentos</option>
                <option value="bloqueados">Bloqueados</option>
                <option value="resueltas">Resueltas</option>
              </select>
            </div>
            <div id="alertas-lista-items"></div>
          </div>
          <div class="alertas-detalle" id="alertas-detalle">
            ${this.renderDetalleVacio()}
          </div>
        </div>
      </div>
    `;

    document.getElementById('alertas-buscar').addEventListener('input', Utils.debounce(function(e) {
      AlertasModule.busqueda = e.target.value;
      AlertasModule.renderLista();
    }, 250));

    document.getElementById('alertas-filtro').addEventListener('change', function(e) {
      AlertasModule.filtrarPorCategoria(e.target.value);
    });

    await this.cargarDatos();
    this.renderStats();
    this.renderLista();
  },

  // ─────────────────────────────────────────────────────────
  // CARGAR DATOS (4 endpoints en paralelo)
  // ─────────────────────────────────────────────────────────

  async cargarDatos() {
    try {
      var [resResumen, resDocumentos, resPendientes, resResueltas] = await Promise.all([
        API.get('/alertas/resumen').catch(function() { return {}; }),
        API.get('/alertas/documentos').catch(function() { return { datos: [] }; }),
        API.get('/autorizaciones/pendientes').catch(function() { return { datos: [] }; }),
        API.get('/autorizaciones/resueltas').catch(function() { return { datos: [] }; })
      ]);

      this.datos.resumen = resResumen || {};
      this.datos.documentos = resDocumentos.datos || [];
      this.datos.pendientes = resPendientes.datos || [];
      this.datos.resueltas = resResueltas.datos || [];

      // Deep-link desde dashboard: #alertas?autorizacion=<id>&accion=<decision>
      this._procesarDeepLink();
    } catch (error) {
      Toast.error('Error cargando alertas');
      this.datos.documentos = [];
      this.datos.pendientes = [];
      this.datos.resueltas = [];
    }
  },

  // ─────────────────────────────────────────────────────────
  // CONSTRUIR LISTA UNIFICADA
  // ─────────────────────────────────────────────────────────

  construirLista() {
    var items = [];

    // 1. Autorizaciones pendientes (más antigua primero — llevan más tiempo esperando)
    this.datos.pendientes.forEach(function(a) {
      items.push({
        _id: 'pend_' + a.id,
        _tipo: 'autorizacion_pendiente',
        _prioridad: 1,
        placa: a.vehiculo_placa,
        conductor: a.conductor_nombre,
        novedades: a.novedades || a.novedades_bloqueo || [],
        timestamp: a.timestamp_alerta,
        raw: a
      });
    });

    // 2. Vehículos bloqueados (excluir los que tienen autorización pendiente — esos van en "pendientes")
    var placasConPendiente = {};
    this.datos.pendientes.forEach(function(a) { placasConPendiente[a.vehiculo_placa] = true; });
    this.datos.documentos.filter(function(v) { return v.bloqueado && !placasConPendiente[v.placa]; }).forEach(function(v) {
      items.push({
        _id: 'bloq_' + v.placa,
        _tipo: 'bloqueado',
        _prioridad: 2,
        placa: v.placa,
        tipo: v.tipo,
        marca: v.marca,
        modelo: v.modelo,
        motivo: v.motivo_bloqueo,
        raw: v
      });
    });

    // 3 & 4 & 5. Documentos por vencer (crítico / urgente / próximo)
    this.datos.documentos.forEach(function(v) {
      var docs = [
        { nombre: 'SOAT', doc: v.soat },
        { nombre: 'Tecno', doc: v.tecnomecanica },
        { nombre: 'Licencia', doc: v.licencia }
      ];
      docs.forEach(function(d) {
        var doc = d.doc;
        if (!doc || doc.estado === 'vigente' || doc.estado === 'sin_dato') return;
        var prioridad = doc.estado === 'vencido' || doc.estado === 'critico' ? 3
          : doc.estado === 'urgente' ? 4 : 5;
        items.push({
          _id: 'doc_' + v.placa + '_' + d.nombre,
          _tipo: 'doc_vencer',
          _prioridad: prioridad,
          placa: v.placa,
          tipo: v.tipo,
          marca: v.marca,
          modelo: v.modelo,
          doc_nombre: d.nombre,
          doc_estado: doc.estado,
          doc_dias: doc.dias_restantes,
          doc_vencimiento: doc.vencimiento,
          timestamp: null,
          raw: v
        });
      });
    });

    // 6. Autorizaciones resueltas (más reciente primero)
    this.datos.resueltas.forEach(function(a) {
      items.push({
        _id: 'res_' + a.id,
        _tipo: 'autorizacion_resuelta',
        _prioridad: 6,
        placa: a.vehiculo_placa,
        conductor: a.conductor_nombre,
        decision: a.decision,
        justificacion: a.justificacion,
        supervisor: a.supervisor_nombre,
        novedades: a.novedades_bloqueo || [],
        timestamp: a.timestamp_decision,
        raw: a
      });
    });

    // Ordenar por prioridad; dentro de cada prioridad por timestamp
    items.sort(function(a, b) {
      if (a._prioridad !== b._prioridad) return a._prioridad - b._prioridad;
      var ta = a.timestamp ? new Date(a.timestamp) : new Date(0);
      var tb = b.timestamp ? new Date(b.timestamp) : new Date(0);
      // pendientes: más antigua primero; resueltas: más reciente primero
      if (a._prioridad === 1) return ta - tb;
      return tb - ta;
    });

    return items;
  },

  // ─────────────────────────────────────────────────────────
  // STAT CARDS
  // ─────────────────────────────────────────────────────────

  renderStats() {
    var pendientes = this.datos.pendientes.length;
    var bloqueados = this.datos.documentos.filter(function(v) { return v.bloqueado; }).length;

    var docsPorVencer = 0;
    this.datos.documentos.forEach(function(v) {
      [v.soat, v.tecnomecanica, v.licencia].forEach(function(d) {
        if (d && d.estado !== 'vigente' && d.estado !== 'sin_dato') docsPorVencer++;
      });
    });

    var hoy = fechaHoyBogota();
    var alertasHoy = this.datos.pendientes.filter(function(a) {
      return a.timestamp_alerta && a.timestamp_alerta.startsWith(hoy);
    }).length;

    var categorias = [
      { id: 'documentos', label: 'Docs por vencer', value: docsPorVencer, type: docsPorVencer > 0 ? 'warning' : null },
      { id: 'bloqueados', label: 'Bloqueados', value: bloqueados, type: bloqueados > 0 ? 'danger' : null },
      { id: 'pendientes', label: 'Auth. pendientes', value: pendientes, type: pendientes > 0 ? 'danger' : null },
      { id: 'todas', label: 'Alertas hoy', value: alertasHoy, type: alertasHoy > 0 ? 'warning' : null }
    ];

    var container = document.getElementById('alertas-stats');
    if (!container) return;

    var filtroActivo = this.filtroActivo;
    var html = '';
    categorias.forEach(function(c) {
      var activo = filtroActivo === c.id ? ' activo' : '';
      var colorClass = c.type ? ' alertas-stat-' + c.type : '';
      html += `
        <div class="stat-card alertas-stat-card${activo}${colorClass}" onclick="AlertasModule.filtrarPorCategoria('${c.id}')">
          <div class="stat-label">${c.label}</div>
          <div class="stat-value${c.type ? ' ' + c.type : ''}">${c.value}</div>
        </div>
      `;
    });

    container.innerHTML = html;
  },

  // ─────────────────────────────────────────────────────────
  // LISTA DE ITEMS
  // ─────────────────────────────────────────────────────────

  renderLista() {
    var lista = this.construirLista();

    // Filtrar por categoría activa
    if (this.filtroActivo !== 'todas') {
      var filtro = this.filtroActivo;
      lista = lista.filter(function(item) {
        if (filtro === 'pendientes') return item._tipo === 'autorizacion_pendiente';
        if (filtro === 'bloqueados') return item._tipo === 'bloqueado';
        if (filtro === 'documentos') return item._tipo === 'doc_vencer';
        if (filtro === 'resueltas') return item._tipo === 'autorizacion_resuelta';
        return true;
      });
    }

    // Filtrar por búsqueda de placa
    if (this.busqueda) {
      var busq = this.busqueda.toLowerCase();
      lista = lista.filter(function(item) {
        return item.placa && item.placa.toLowerCase().includes(busq);
      });
    }

    var container = document.getElementById('alertas-lista-items');
    if (!container) return;

    if (lista.length === 0) {
      container.innerHTML = `
        <div style="padding: 32px 16px; text-align:center; color: var(--text-secondary); font-size: var(--font-size-sm);">
          Sin alertas activas<br>la flota está al día ✓
        </div>
      `;
      return;
    }

    var selectedId = this.itemSeleccionado ? this.itemSeleccionado._id : null;
    var html = lista.map(function(item) {
      return AlertasModule.renderItemLista(item, item._id === selectedId);
    }).join('');
    container.innerHTML = html;
  },

  renderItemLista(item, seleccionado) {
    var severidad = this.calcularSeveridad(item);
    var badge = this.renderBadgeItem(item);
    var descripcion = this.calcularDescripcion(item);
    var tiempo = item.timestamp ? this.tiempoRelativo(new Date(item.timestamp)) : '';
    var claseSel = seleccionado ? ' seleccionado' : '';

    return `
      <div class="alertas-lista-item severidad-${severidad}${claseSel}" onclick="AlertasModule.seleccionarItem('${Utils.escaparHTML(item._id)}')">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;">
          <span style="font-weight:var(--font-weight-medium); font-size:13px;">${Utils.escaparHTML(item.placa || '')}</span>
          ${badge}
        </div>
        <div style="font-size:var(--font-size-xs); color:var(--text-secondary); margin-bottom:2px;">${Utils.escaparHTML(descripcion)}</div>
        ${tiempo ? `<div style="font-size:var(--font-size-xs); color:var(--text-tertiary);">${tiempo}</div>` : ''}
      </div>
    `;
  },

  calcularSeveridad(item) {
    if (item._tipo === 'autorizacion_pendiente' || item._tipo === 'bloqueado') return 'critica';
    if (item._tipo === 'doc_vencer') {
      if (item.doc_estado === 'vencido' || item.doc_estado === 'critico') return 'critica';
      if (item.doc_estado === 'urgente') return 'urgente';
      return 'proxima';
    }
    if (item._tipo === 'autorizacion_resuelta') return 'resuelta';
    return 'proxima';
  },

  renderBadgeItem(item) {
    if (item._tipo === 'autorizacion_pendiente') {
      return '<span class="badge badge-danger">Autorización</span>';
    }
    if (item._tipo === 'bloqueado') {
      return '<span class="badge badge-danger">Bloqueado</span>';
    }
    if (item._tipo === 'doc_vencer') {
      var tipo = item.doc_nombre === 'SOAT' ? 'badge-warning'
        : item.doc_nombre === 'Tecno' ? 'badge-warning' : 'badge-info';
      var dias = item.doc_dias !== null ? ' ' + item.doc_dias + 'd' : '';
      return `<span class="badge ${tipo}">${Utils.escaparHTML(item.doc_nombre)}${dias}</span>`;
    }
    if (item._tipo === 'autorizacion_resuelta') {
      return '<span class="badge badge-success">Resuelto</span>';
    }
    return '';
  },

  calcularDescripcion(item) {
    if (item._tipo === 'autorizacion_pendiente') {
      var novs = item.novedades || [];
      if (novs.length > 0) return novs[0].item || novs[0].nota || 'Novedad de bloqueo';
      return 'Pendiente de decisión';
    }
    if (item._tipo === 'bloqueado') {
      return item.motivo || 'Vehículo bloqueado';
    }
    if (item._tipo === 'doc_vencer') {
      var dias = item.doc_dias;
      if (dias === null) return item.doc_nombre + ' — Sin fecha';
      if (dias <= 0) return item.doc_nombre + ' vencido hace ' + Math.abs(dias) + ' días';
      return item.doc_nombre + ' vence en ' + dias + ' días';
    }
    if (item._tipo === 'autorizacion_resuelta') {
      var textos = { autorizar: 'Autorizado', taller: 'Enviado a taller', restringir: 'Restringido' };
      return (textos[item.decision] || item.decision) + (item.supervisor ? ' por ' + item.supervisor : '');
    }
    return '';
  },

  // ─────────────────────────────────────────────────────────
  // SELECCIONAR ITEM
  // ─────────────────────────────────────────────────────────

  async seleccionarItem(itemId) {
    var lista = this.construirLista();
    var item = lista.find(function(i) { return i._id === itemId; });
    if (!item) return;

    this.itemSeleccionado = item;
    this.renderLista();
    this.renderDetalleItem(item);

    // Cargar historial de forma lazy
    if (item.placa) {
      try {
        var res = await API.get('/activos/' + encodeURIComponent(item.placa) + '/historial');
        this.renderHistorial(res.historial || []);
      } catch (e) {
        var histContainer = document.getElementById('alertas-historial');
        if (histContainer) histContainer.innerHTML = '<p class="text-xs text-secondary">No se pudo cargar el historial.</p>';
      }
    }
  },

  // ─────────────────────────────────────────────────────────
  // DEEP-LINK DESDE DASHBOARD
  // ─────────────────────────────────────────────────────────

  _procesarDeepLink() {
    if (!window.Router || typeof Router.getQuery !== 'function') return;
    var params = Router.getQuery();
    var autorizacionId = params.get('autorizacion');
    if (!autorizacionId) return;
    var accionPre = params.get('accion');
    // Limpiar query del hash para que un refresh no re-dispare la accion
    if (window.history && history.replaceState) {
      history.replaceState(null, '', '#alertas');
    }
    this.abrirDetalleConAccion(autorizacionId, accionPre);
  },

  async abrirDetalleConAccion(autorizacionId, accionPre) {
    var itemId = 'pend_' + autorizacionId;
    var lista = this.construirLista();
    var existe = lista.find(function(i) { return i._id === itemId; });
    if (!existe) {
      Toast.error('Autorización ya resuelta o no encontrada');
      return;
    }
    await this.seleccionarItem(itemId);
    var accionesValidas = { autorizar: true, taller: true, restringir: true };
    if (accionPre && accionesValidas[accionPre]) {
      var btn = document.querySelector('#alertas-detalle [data-accion="' + accionPre + '"]');
      if (btn) btn.focus();
    }
  },

  // ─────────────────────────────────────────────────────────
  // PANEL DETALLE
  // ─────────────────────────────────────────────────────────

  renderDetalleVacio() {
    return `
      <div style="display:flex; align-items:center; justify-content:center; height:300px; color:var(--text-tertiary); font-size:var(--font-size-sm); text-align:center;">
        Selecciona una alerta para ver el detalle
      </div>
    `;
  },

  renderDetalleItem(item) {
    var detalle = document.getElementById('alertas-detalle');
    if (!detalle) return;

    var infoVehiculo = this.renderInfoVehiculo(item);
    var cuerpo = '';

    if (item._tipo === 'autorizacion_pendiente') {
      cuerpo = this.renderDetallePendiente(item);
    } else if (item._tipo === 'bloqueado') {
      cuerpo = this.renderDetalleBloqueado(item);
    } else if (item._tipo === 'doc_vencer') {
      cuerpo = this.renderDetalleDocumento(item);
    } else if (item._tipo === 'autorizacion_resuelta') {
      cuerpo = this.renderDetalleResuelta(item);
    }

    detalle.innerHTML = `
      ${infoVehiculo}
      ${cuerpo}
      <div class="alertas-historial-section">
        <div style="font-size:var(--font-size-xs); font-weight:var(--font-weight-medium); color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:var(--spacing-md);">Historial reciente</div>
        <div id="alertas-historial">
          <p class="text-xs text-secondary">Cargando historial...</p>
        </div>
      </div>
    `;
  },

  renderInfoVehiculo(item) {
    var raw = item.raw || {};
    var marca = raw.marca || item.marca || '';
    var modelo = raw.modelo || item.modelo || '';
    var tipo = raw.tipo || item.tipo || '';
    var subtitulo = [marca, modelo].filter(Boolean).join(' ') || tipo || '';

    return `
      <div style="margin-bottom:var(--spacing-lg);">
        <div style="display:flex; align-items:center; gap:var(--spacing-sm); margin-bottom:var(--spacing-xs);">
          <span style="font-size:var(--font-size-xl); font-weight:var(--font-weight-bold);">${Utils.escaparHTML(item.placa || '')}</span>
          ${this.renderBadgeItem(item)}
        </div>
        ${subtitulo ? `<div class="text-sm text-secondary">${Utils.escaparHTML(subtitulo)}</div>` : ''}
        ${item.conductor ? `<div class="text-sm text-secondary">${Utils.escaparHTML(item.conductor)}</div>` : ''}
      </div>
    `;
  },

  renderDetallePendiente(item) {
    var novedades = item.novedades || [];
    var raw = item.raw || {};
    var idAut = raw.id;

    var novedadesHtml = novedades.length > 0
      ? novedades.map(function(n) {
          var tipo = n.critico ? 'badge-danger' : 'badge-warning';
          var label = n.critico ? 'BLOQUEO' : 'ALERTA';
          var texto = [n.grupo, n.item, n.nota || n.estado].filter(Boolean).join(' — ');
          return `<div class="drawer-novedad${n.critico ? ' critica' : ''}" style="margin-bottom:8px;">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
              <span class="badge ${tipo}">${label}</span>
              <span class="text-sm font-medium">${Utils.escaparHTML(texto)}</span>
            </div>
          </div>`;
        }).join('')
      : '<p class="text-sm text-secondary">Sin novedades de bloqueo detalladas.</p>';

    var docsHtml = this.renderMiniDocs(item.raw);

    return `
      <div class="drawer-section" style="margin-bottom:var(--spacing-lg);">
        <div class="drawer-section-title">Novedades de bloqueo</div>
        ${novedadesHtml}
      </div>
      <div class="drawer-section" style="margin-bottom:var(--spacing-lg);">
        <div class="drawer-section-title">Documentos del vehículo</div>
        ${docsHtml}
      </div>
      <div style="display:flex; gap:var(--spacing-sm); margin-bottom:var(--spacing-xl);">
        <button data-accion="autorizar" class="btn btn-success btn-sm" onclick="AlertasModule.abrirModalAutorizar('${Utils.escaparHTML(idAut)}', '${Utils.escaparHTML(item.placa)}')">Autorizar</button>
        <button data-accion="taller" class="btn btn-warning btn-sm" onclick="AlertasModule.decidirAutorizacion('${Utils.escaparHTML(idAut)}', 'taller', '${Utils.escaparHTML(item.placa)}')">Taller</button>
        <button data-accion="restringir" class="btn btn-danger btn-sm" onclick="AlertasModule.decidirAutorizacion('${Utils.escaparHTML(idAut)}', 'restringir', '${Utils.escaparHTML(item.placa)}')">Restringir</button>
      </div>
    `;
  },

  renderDetalleBloqueado(item) {
    var raw = item.raw || {};
    var docsHtml = this.renderMiniDocs(raw);

    return `
      <div class="drawer-section" style="margin-bottom:var(--spacing-lg);">
        <div class="drawer-section-title">Motivo de bloqueo</div>
        <div class="drawer-novedad critica">
          <span class="text-sm">${Utils.escaparHTML(item.motivo || 'Bloqueado')}</span>
        </div>
      </div>
      <div class="drawer-section" style="margin-bottom:var(--spacing-lg);">
        <div class="drawer-section-title">Documentos del vehículo</div>
        ${docsHtml}
      </div>
      <div style="margin-bottom:var(--spacing-xl);">
        <button class="btn btn-success btn-sm" onclick="AlertasModule.desbloquearVehiculo('${Utils.escaparHTML(item.placa)}')">Desbloquear</button>
      </div>
    `;
  },

  renderDetalleDocumento(item) {
    var raw = item.raw || {};
    var docsHtml = this.renderMiniDocs(raw);
    var dias = item.doc_dias;
    var textoEstado = dias === null ? 'Sin fecha registrada'
      : dias <= 0 ? 'Vencido hace ' + Math.abs(dias) + ' días'
      : 'Vence en ' + dias + ' días (' + this.formatearFecha(item.doc_vencimiento) + ')';

    return `
      <div class="drawer-section" style="margin-bottom:var(--spacing-lg);">
        <div class="drawer-section-title">${Utils.escaparHTML(item.doc_nombre)}</div>
        <div class="drawer-novedad${(item.doc_estado === 'vencido' || item.doc_estado === 'critico') ? ' critica' : ''}">
          <span class="text-sm">${Utils.escaparHTML(textoEstado)}</span>
        </div>
      </div>
      <div class="drawer-section" style="margin-bottom:var(--spacing-lg);">
        <div class="drawer-section-title">Documentos del vehículo</div>
        ${docsHtml}
      </div>
    `;
  },

  renderDetalleResuelta(item) {
    var decisionTextos = { autorizar: 'Autorizado', taller: 'Enviado a taller', restringir: 'Restringido' };
    var decisionBadge = {
      autorizar: 'badge-success',
      taller: 'badge-warning',
      restringir: 'badge-danger'
    };
    var badgeClass = decisionBadge[item.decision] || 'badge-neutral';
    var texto = decisionTextos[item.decision] || item.decision || 'Decidido';

    var novedades = item.novedades || [];
    var novedadesHtml = novedades.length > 0
      ? novedades.map(function(n) {
          var t = [n.grupo, n.item, n.nota || n.estado].filter(Boolean).join(' — ');
          return `<div class="text-sm" style="padding:4px 0; border-bottom:1px solid var(--border-secondary);">${Utils.escaparHTML(t)}</div>`;
        }).join('')
      : '<p class="text-sm text-secondary">—</p>';

    return `
      <div class="drawer-section" style="margin-bottom:var(--spacing-lg);">
        <div class="drawer-section-title">Decisión tomada</div>
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
          <span class="badge ${badgeClass}">${Utils.escaparHTML(texto)}</span>
          ${item.supervisor ? `<span class="text-sm text-secondary">por ${Utils.escaparHTML(item.supervisor)}</span>` : ''}
        </div>
        ${item.timestamp ? `<div class="text-xs text-secondary">${this.formatearFechaHora(item.timestamp)}</div>` : ''}
        ${item.justificacion ? `<div class="drawer-observacion" style="margin-top:8px;">"${Utils.escaparHTML(item.justificacion)}"</div>` : ''}
      </div>
      <div class="drawer-section" style="margin-bottom:var(--spacing-lg);">
        <div class="drawer-section-title">Novedades que tenía</div>
        ${novedadesHtml}
      </div>
    `;
  },

  renderMiniDocs(raw) {
    if (!raw) return '';
    var self = this;
    var docs = [
      { nombre: 'SOAT', doc: raw.soat },
      { nombre: 'Tecnomecánica', doc: raw.tecnomecanica },
      { nombre: 'Licencia', doc: raw.licencia }
    ];

    return `<div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px;">` +
      docs.map(function(d) {
        var doc = d.doc;
        if (!doc || doc.estado === 'sin_dato' || doc.dias_restantes === null) {
          return `<div class="drawer-info-card"><div class="stat-label">${d.nombre}</div><div class="text-xs" style="color:var(--text-tertiary);">Sin registro</div></div>`;
        }
        var colorMap = { vigente: 'var(--success-text)', proximo: 'var(--warning-text)', urgente: 'var(--warning-text)', critico: 'var(--danger-text)', vencido: 'var(--danger-text)' };
        var color = colorMap[doc.estado] || 'inherit';
        var fecha = doc.vencimiento ? self.formatearFecha(doc.vencimiento) : '';
        var texto;
        if (doc.dias_restantes <= 0) {
          texto = 'VENCIDO' + (fecha ? ' — ' + fecha : '');
        } else if (doc.estado === 'vigente') {
          texto = 'Vigente' + (fecha ? ' — ' + fecha : '');
        } else {
          texto = 'Vence en ' + doc.dias_restantes + 'd' + (fecha ? ' — ' + fecha : '');
        }
        var conductor = (d.nombre === 'Licencia' && doc.conductor) ? `<div class="text-xs text-secondary" style="margin-top:2px;">${Utils.escaparHTML(doc.conductor)}</div>` : '';
        return `
          <div class="drawer-info-card">
            <div class="stat-label">${d.nombre}</div>
            <div class="text-xs font-medium" style="color:${color};">${Utils.escaparHTML(texto)}</div>
            ${conductor}
          </div>
        `;
      }).join('') +
      '</div>';
  },

  // ─────────────────────────────────────────────────────────
  // HISTORIAL TIMELINE
  // ─────────────────────────────────────────────────────────

  renderHistorial(historial) {
    var container = document.getElementById('alertas-historial');
    if (!container) return;

    if (!historial || historial.length === 0) {
      container.innerHTML = '<p class="text-xs text-secondary">Sin registros en el historial.</p>';
      return;
    }

    var primeros = historial.slice(0, 10);
    var resto = historial.length > 10;

    var html = '<div class="alertas-timeline">';
    primeros.forEach(function(ev) {
      var color = AlertasModule.colorEvento(ev);
      var fechaTexto = AlertasModule.formatearFechaHora(ev.fecha);
      html += `
        <div class="alertas-timeline-item">
          <div class="alertas-timeline-dot" style="background:${color};"></div>
          <div class="alertas-timeline-content">
            <div class="text-xs text-secondary">${fechaTexto}</div>
            <div style="font-size:13px;">${Utils.escaparHTML(ev.resumen || '')}</div>
          </div>
        </div>
      `;
    });
    html += '</div>';

    if (resto) {
      html += `<button class="btn btn-secondary btn-sm" style="margin-top:8px;" onclick="AlertasModule.verMasHistorial()">Ver más</button>`;
    }

    container.innerHTML = html;
  },

  colorEvento(ev) {
    if (ev.tipo === 'preoperacional') return ev.tiene_bloqueo ? 'var(--danger-border)' : 'var(--success-border)';
    if (ev.tipo === 'autorizacion') return 'var(--info-border)';
    if (ev.tipo === 'tanqueo') return 'var(--warning-border)';
    if (ev.tipo === 'posoperacional') return 'var(--text-tertiary)';
    if (ev.tipo === 'alerta_documento') return 'var(--warning-border)';
    return 'var(--border-primary)';
  },

  async verMasHistorial() {
    if (!this.itemSeleccionado) return;
    try {
      var res = await API.get('/activos/' + encodeURIComponent(this.itemSeleccionado.placa) + '/historial');
      var historial = res.historial || [];
      // Show all 50
      var container = document.getElementById('alertas-historial');
      if (!container) return;
      var html = '<div class="alertas-timeline">';
      historial.forEach(function(ev) {
        var color = AlertasModule.colorEvento(ev);
        var fechaTexto = AlertasModule.formatearFechaHora(ev.fecha);
        html += `
          <div class="alertas-timeline-item">
            <div class="alertas-timeline-dot" style="background:${color};"></div>
            <div class="alertas-timeline-content">
              <div class="text-xs text-secondary">${fechaTexto}</div>
              <div style="font-size:13px;">${Utils.escaparHTML(ev.resumen || '')}</div>
            </div>
          </div>
        `;
      });
      html += '</div>';
      container.innerHTML = html;
    } catch (e) {
      Toast.error('Error cargando historial completo');
    }
  },

  // ─────────────────────────────────────────────────────────
  // ACCIONES
  // ─────────────────────────────────────────────────────────

  abrirModalAutorizar(autorizacionId, placa) {
    Modal.open({
      title: 'Autorizar salida — ' + placa,
      size: 'md',
      content: `
        <p class="text-sm text-secondary" style="margin-bottom:var(--spacing-md);">
          Escriba la justificación para autorizar la salida del vehículo con esta novedad.
        </p>
        <textarea class="input" id="modal-justificacion" rows="4" placeholder="Escriba la justificación para autorizar la salida del vehículo con esta novedad..."
          oninput="AlertasModule.actualizarBtnAutorizar()" style="resize:vertical;"></textarea>
        <div id="modal-chars" class="text-xs text-secondary" style="margin-top:4px;">0 / mín 10 caracteres</div>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
        <button class="btn btn-success" id="btn-confirmar-autorizar" onclick="AlertasModule.confirmarAutorizar('${Utils.escaparHTML(autorizacionId)}')" disabled>Confirmar autorización</button>
      `
    });
  },

  actualizarBtnAutorizar() {
    var textarea = document.getElementById('modal-justificacion');
    var btn = document.getElementById('btn-confirmar-autorizar');
    var chars = document.getElementById('modal-chars');
    if (!textarea || !btn) return;
    var len = textarea.value.trim().length;
    if (chars) chars.textContent = len + ' / mín 10 caracteres';
    btn.disabled = len < 10;
  },

  async confirmarAutorizar(autorizacionId) {
    var textarea = document.getElementById('modal-justificacion');
    if (!textarea) return;
    var justificacion = textarea.value.trim();
    if (justificacion.length < 10) {
      Toast.error('Justificación debe tener al menos 10 caracteres');
      return;
    }
    Modal.close();
    await this._ejecutarDecision(autorizacionId, 'autorizar', justificacion);
  },

  async decidirAutorizacion(autorizacionId, decision, placa) {
    var textos = { taller: '¿Enviar ' + placa + ' a taller?', restringir: '¿Restringir ' + placa + '?' };
    var confirmado = await Modal.confirm({
      title: textos[decision] || 'Confirmar decisión',
      message: decision === 'taller' ? 'El vehículo pasará a estado "En taller".' : 'El vehículo quedará restringido de operar.',
      confirmText: 'Confirmar',
      cancelText: 'Cancelar',
      type: decision === 'restringir' ? 'danger' : null
    });
    if (!confirmado) return;
    await this._ejecutarDecision(autorizacionId, decision, '');
  },

  async _ejecutarDecision(autorizacionId, decision, justificacion) {
    try {
      await API.put('/autorizaciones/' + autorizacionId + '/decidir', {
        decision: decision,
        justificacion: justificacion,
        supervisor_id: null
      });

      Toast.success('Decisión registrada correctamente');
      this.itemSeleccionado = null;

      // Recargar datos y re-renderizar
      await this.cargarDatos();
      this.renderStats();
      this.renderLista();
      document.getElementById('alertas-detalle').innerHTML = this.renderDetalleVacio();
    } catch (error) {
      Toast.error(error.message || 'Error al registrar decisión');
    }
  },

  async desbloquearVehiculo(placa) {
    var confirmado = await Modal.confirm({
      title: '¿Desbloquear ' + placa + '?',
      message: 'El vehículo quedará en estado operativo.',
      confirmText: 'Desbloquear',
      cancelText: 'Cancelar'
    });
    if (!confirmado) return;

    try {
      await API.post('/activos/' + encodeURIComponent(placa) + '/desbloquear');
      Toast.success(placa + ' desbloqueado');
      this.itemSeleccionado = null;
      await this.cargarDatos();
      this.renderStats();
      this.renderLista();
      document.getElementById('alertas-detalle').innerHTML = this.renderDetalleVacio();
    } catch (error) {
      Toast.error(error.message || 'Error al desbloquear');
    }
  },

  // ─────────────────────────────────────────────────────────
  // FILTROS
  // ─────────────────────────────────────────────────────────

  filtrarPorCategoria(categoria) {
    this.filtroActivo = categoria;

    // Actualizar select
    var select = document.getElementById('alertas-filtro');
    if (select) select.value = categoria;

    this.renderStats();
    this.renderLista();
  },

  // ─────────────────────────────────────────────────────────
  // HELPERS DE FORMATO
  // ─────────────────────────────────────────────────────────

  tiempoRelativo(fecha) {
    if (!fecha || isNaN(fecha)) return '';
    var ahora = new Date();
    var diff = ahora - fecha;
    var min = Math.floor(diff / 60000);
    if (min < 1) return 'justo ahora';
    if (min < 60) return 'hace ' + min + ' min';
    var h = Math.floor(min / 60);
    if (h < 24) return 'hace ' + h + 'h';
    var d = Math.floor(h / 24);
    if (d === 1) return 'ayer';
    if (d < 7) return 'hace ' + d + ' días';
    return this.formatearFecha(fecha.toISOString());
  },

  formatearFecha(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('es-CO', {
      timeZone: 'America/Bogota',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  },

  formatearFechaHora(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('es-CO', {
      timeZone: 'America/Bogota',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }) + ' ' + d.toLocaleTimeString('es-CO', {
      timeZone: 'America/Bogota',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
};

window.AlertasModule = AlertasModule;
