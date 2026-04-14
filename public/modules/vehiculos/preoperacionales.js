// ═══════════════════════════════════════════════════════════
// CERO — Módulo Preoperacionales
// Panel de consulta de inspecciones preoperacionales
// Fase 2.1 — 21/03/2026
// ═══════════════════════════════════════════════════════════

const Preoperacionales = {
  data: [],
  stats: {},
  filtros: {
    desde: '',
    hasta: '',
    placa: '',
    conductor: '',
    estado: 'todos'
  },
  drawerAbierto: false,
  detalleActual: null,

  // ─────────────────────────────────────────────────────────
  // RENDER PRINCIPAL
  // ─────────────────────────────────────────────────────────

  async render() {
    // Fecha de hoy como default
    var hoy = fechaHoyBogota();
    this.filtros.desde = this.filtros.desde || hoy;
    this.filtros.hasta = this.filtros.hasta || hoy;

    var main = document.getElementById('main');
    main.innerHTML = `
      <div class="main-header">
        <div>
          <h1 class="main-title">Preoperacionales</h1>
          <p class="main-subtitle">Historial de inspecciones diarias</p>
        </div>
        <div class="main-actions">
          <button class="btn btn-secondary btn-sm" onclick="Preoperacionales.resetFiltros()">Limpiar filtros</button>
        </div>
      </div>
      <div class="main-content">
        <div id="preop-stats"></div>
        <div class="filters-row">
          <div class="flex gap-sm items-center">
            <label class="text-xs text-secondary">Desde</label>
            <input type="date" class="input input-sm" id="preop-desde" value="${this.filtros.desde}" style="width:140px;">
            <label class="text-xs text-secondary">Hasta</label>
            <input type="date" class="input input-sm" id="preop-hasta" value="${this.filtros.hasta}" style="width:140px;">
          </div>
          <div class="search-box" style="min-width:130px;max-width:160px;">
            <input type="text" class="input input-sm" placeholder="Placa..." id="preop-placa" value="${this.filtros.placa}" style="text-transform:uppercase;">
          </div>
          <div class="flex gap-sm">
            <button class="btn btn-sm ${this.filtros.estado === 'todos' ? 'btn-primary' : 'btn-secondary'}" onclick="Preoperacionales.filtrarEstado('todos')">Todas</button>
            <button class="btn btn-sm ${this.filtros.estado === 'sin_novedades' ? 'btn-primary' : 'btn-secondary'}" onclick="Preoperacionales.filtrarEstado('sin_novedades')">Sin novedades</button>
            <button class="btn btn-sm ${this.filtros.estado === 'con_novedades' ? 'btn-warning' : 'btn-secondary'}" onclick="Preoperacionales.filtrarEstado('con_novedades')">Con novedades</button>
            <button class="btn btn-sm ${this.filtros.estado === 'critico' ? 'btn-danger' : 'btn-secondary'}" onclick="Preoperacionales.filtrarEstado('critico')">Críticas</button>
          </div>
        </div>
        <div id="preop-tabla">
          <div style="text-align:center;padding:40px;">
            <span class="text-secondary">Cargando inspecciones...</span>
          </div>
        </div>
      </div>

      <!-- Panel lateral (drawer) -->
      <div class="drawer-backdrop" id="drawer-backdrop" onclick="Preoperacionales.cerrarDrawer()"></div>
      <div class="drawer" id="drawer-panel">
        <div class="drawer-header">
          <h3 class="drawer-title" id="drawer-titulo">Detalle</h3>
          <button class="modal-close" onclick="Preoperacionales.cerrarDrawer()">&times;</button>
        </div>
        <div class="drawer-body" id="drawer-contenido"></div>
      </div>
    `;

    // Eventos de filtros
    document.getElementById('preop-desde').addEventListener('change', function () {
      Preoperacionales.filtros.desde = this.value;
      Preoperacionales.cargarYRenderizar();
    });
    document.getElementById('preop-hasta').addEventListener('change', function () {
      Preoperacionales.filtros.hasta = this.value;
      Preoperacionales.cargarYRenderizar();
    });
    document.getElementById('preop-placa').addEventListener('input', Utils.debounce(function (e) {
      Preoperacionales.filtros.placa = e.target.value.toUpperCase();
      Preoperacionales.cargarYRenderizar();
    }));

    await this.cargarYRenderizar();
  },

  // ─────────────────────────────────────────────────────────
  // CARGA DE DATOS
  // ─────────────────────────────────────────────────────────

  async cargarYRenderizar() {
    await this.cargarDatos();
    this.renderStats();
    this.renderTabla();
  },

  async cargarDatos() {
    try {
      var params = {};
      if (this.filtros.desde) params.desde = this.filtros.desde;
      if (this.filtros.hasta) params.hasta = this.filtros.hasta;
      if (this.filtros.placa) params.placa = this.filtros.placa;
      if (this.filtros.conductor) params.conductor = this.filtros.conductor;
      if (this.filtros.estado && this.filtros.estado !== 'todos') params.estado = this.filtros.estado;

      var resp = await API.preoperacionales.listar(params);
      this.data = resp.data || [];
      this.stats = resp.stats || {};
    } catch (error) {
      console.error('Error cargando preoperacionales:', error);
      this.data = [];
      this.stats = {};
      Toast.error('Error cargando inspecciones');
    }
  },

  // ─────────────────────────────────────────────────────────
  // STAT CARDS
  // ─────────────────────────────────────────────────────────

  renderStats() {
    var container = document.getElementById('preop-stats');
    if (!container) return;

    var s = this.stats;
    container.innerHTML = Card.statsGrid([
      { label: 'Inspecciones hoy', value: s.hoy || 0, type: (s.hoy || 0) > 0 ? 'success' : null },
      { label: 'Con novedades', value: s.con_novedades_hoy || 0, type: (s.con_novedades_hoy || 0) > 0 ? 'warning' : null },
      { label: 'Críticas', value: s.criticas_hoy || 0, type: (s.criticas_hoy || 0) > 0 ? 'danger' : null },
      { label: 'Mostrando', value: this.data.length, suffix: 'registros' }
    ]);
  },

  // ─────────────────────────────────────────────────────────
  // TABLA PRINCIPAL
  // ─────────────────────────────────────────────────────────

  renderTabla() {
    var container = document.getElementById('preop-tabla');
    if (!container) return;

    var html = Table.render({
      columns: [
        {
          key: 'fecha',
          label: 'Fecha / Hora',
          width: '130px',
          render: function (_, row) {
            var f = Utils.formatearFecha(row.fecha);
            var h = row.hora ? row.hora.substring(0, 5) : '';
            return '<span class="font-medium">' + f + '</span>' +
                   (h ? '<br><span class="text-xs text-secondary">' + h + '</span>' : '');
          }
        },
        {
          key: 'vehiculo_placa',
          label: 'Placa',
          width: '90px',
          render: function (v) {
            return '<span class="font-medium">' + Utils.escaparHTML(v || '—') + '</span>';
          }
        },
        {
          key: 'vehiculo',
          label: 'Vehículo',
          render: function (_, row) {
            var nombre = ((row.vehiculo_marca || '') + ' ' + (row.vehiculo_modelo || '')).trim();
            return nombre || '—';
          }
        },
        {
          key: 'conductor_nombre',
          label: 'Conductor',
          render: function (v) { return Utils.escaparHTML(v || '—'); }
        },
        {
          key: 'kilometraje',
          label: 'Km',
          width: '90px',
          render: function (v) { return Utils.formatearNumero(v); }
        },
        {
          key: 'total_novedades',
          label: 'Novedades',
          width: '90px',
          render: function (_, row) {
            if (row.total_novedades === 0) return '<span class="text-secondary">0</span>';
            var texto = String(row.total_novedades);
            if (row.novedades_criticas > 0) {
              texto += ' <span class="text-xs">(' + row.novedades_criticas + ' crít.)</span>';
            }
            return '<span class="text-' + (row.novedades_criticas > 0 ? 'danger' : 'warning') + ' font-medium">' + texto + '</span>';
          }
        },
        {
          key: 'clasificacion',
          label: 'Estado',
          width: '110px',
          render: function (v) { return Preoperacionales.badgeClasificacion(v); }
        },
        {
          key: 'acciones',
          label: '',
          width: '60px',
          render: function (_, row) {
            return '<button class="btn btn-sm btn-secondary" onclick="Preoperacionales.abrirDetalle(\'' + row.id + '\')">Ver</button>';
          }
        }
      ],
      data: this.data,
      rowClass: function (row) {
        if (row.clasificacion === 'critico') return 'row-danger';
        return '';
      },
      emptyMessage: 'No hay inspecciones para los filtros seleccionados'
    });

    container.innerHTML = html;
  },

  // ─────────────────────────────────────────────────────────
  // BADGES DE CLASIFICACIÓN
  // ─────────────────────────────────────────────────────────

  badgeClasificacion: function (clasificacion) {
    var badges = {
      'sin_novedades': { texto: 'OK', tipo: 'success' },
      'con_novedades': { texto: 'NOVEDAD', tipo: 'warning' },
      'critico': { texto: 'CRÍTICO', tipo: 'danger' }
    };
    var b = badges[clasificacion] || { texto: clasificacion || '—', tipo: 'neutral' };
    return Badge.render(b.texto, b.tipo);
  },

  // ─────────────────────────────────────────────────────────
  // FILTROS
  // ─────────────────────────────────────────────────────────

  filtrarEstado: function (estado) {
    this.filtros.estado = estado;
    this.cargarYRenderizar();

    // Actualizar botones activos
    var botones = document.querySelectorAll('.filters-row .btn-sm');
    // No hace falta re-render completo, se actualiza en cargarYRenderizar
  },

  resetFiltros: function () {
    var hoy = fechaHoyBogota();
    this.filtros = { desde: hoy, hasta: hoy, placa: '', conductor: '', estado: 'todos' };
    this.render();
  },

  // ─────────────────────────────────────────────────────────
  // DRAWER — PANEL LATERAL DE DETALLE
  // ─────────────────────────────────────────────────────────

  async abrirDetalle(id) {
    // Abrir drawer inmediatamente con loading
    var backdrop = document.getElementById('drawer-backdrop');
    var panel = document.getElementById('drawer-panel');
    var titulo = document.getElementById('drawer-titulo');
    var contenido = document.getElementById('drawer-contenido');

    titulo.textContent = 'Cargando...';
    contenido.innerHTML = '<div style="text-align:center;padding:40px;"><span class="text-secondary">Cargando detalle...</span></div>';

    backdrop.classList.add('active');
    panel.classList.add('active');
    this.drawerAbierto = true;

    // Cargar detalle completo
    try {
      var resp = await API.preoperacionales.obtener(id);
      this.detalleActual = resp;
      this.renderDrawer(resp);
    } catch (error) {
      console.error('Error cargando detalle:', error);
      contenido.innerHTML = '<div style="text-align:center;padding:40px;"><span class="text-danger">Error al cargar el detalle</span></div>';
    }
  },

  renderDrawer: function (registro) {
    var titulo = document.getElementById('drawer-titulo');
    var contenido = document.getElementById('drawer-contenido');

    // Título con placa
    titulo.textContent = registro.vehiculo_placa || 'Detalle';

    // Info general
    var conductorNombre = registro.conductores ? registro.conductores.nombre : '—';
    var conductorCedula = registro.conductores ? registro.conductores.cedula : '';
    var vehiculoInfo = registro.vehiculos ? ((registro.vehiculos.marca || '') + ' ' + (registro.vehiculos.modelo || '')).trim() : '';
    var fechaFormateada = Utils.formatearFecha(registro.fecha);
    var hora = registro.hora ? registro.hora.substring(0, 5) : '';

    var html = '';

    // ── Tarjetas de info ──
    html += '<div class="drawer-info-grid">';
    html += this.drawerInfoCard('Conductor', conductorNombre, conductorCedula ? 'CC ' + conductorCedula : '');
    html += this.drawerInfoCard('Fecha', fechaFormateada, hora);
    html += this.drawerInfoCard('Kilómetros', Utils.formatearNumero(registro.kilometraje), registro.diferencia_km != null ? '(+' + Utils.formatearNumero(registro.diferencia_km) + ' km)' : '');
    html += this.drawerInfoCard('Vehículo', registro.vehiculo_placa || '—', vehiculoInfo);
    html += '</div>';

    // ── Novedades destacadas ──
    var novedades = registro.novedades || [];
    if (novedades.length > 0) {
      html += '<div class="drawer-section">';
      html += '<div class="drawer-section-title">';
      html += '<span class="section-title-bar danger"></span>';
      html += 'Novedades (' + novedades.length + ')';
      html += '</div>';
      novedades.forEach(function (n) {
        var esCritico = n.critico === true;
        var badgeHtml = esCritico
          ? '<span class="badge badge-danger">CRÍTICO</span>'
          : '<span class="badge badge-warning">ATENCIÓN</span>';
        html += '<div class="drawer-novedad ' + (esCritico ? 'critica' : '') + '">';
        html += '<div class="flex items-center justify-between">';
        html += '<span class="font-medium">' + Utils.escaparHTML(n.item || n.grupo || '—') + '</span>';
        html += badgeHtml;
        html += '</div>';
        if (n.nota) {
          html += '<div class="text-sm text-secondary mt-sm">' + Utils.escaparHTML(n.nota) + '</div>';
        }
        if (n.estado) {
          html += '<div class="text-xs text-secondary mt-sm">Estado: ' + Utils.escaparHTML(n.estado) + '</div>';
        }
        html += '</div>';
      });
      html += '</div>';
    } else {
      html += '<div class="drawer-section">';
      html += '<div class="drawer-all-ok">✓ Sin novedades — inspección limpia</div>';
      html += '</div>';
    }

    // ── Sección de autorización ──
    var autorizacion = registro.autorizacion || null;
    var novedadesBloqueo = (novedades || []).filter(function(n) { return n.critico === true; });

    if (novedadesBloqueo.length > 0 && autorizacion) {
      html += '<div class="drawer-section">';
      html += '<div class="drawer-section-title">';
      html += '<span class="section-title-bar danger"></span>';
      html += 'Decisión del supervisor';
      html += '</div>';

      // Detalle de novedades de bloqueo
      html += '<div style="margin-bottom:var(--spacing-md);">';
      novedadesBloqueo.forEach(function(n) {
        var texto = [n.grupo, n.item, n.nota || n.estado].filter(Boolean).join(' — ');
        html += '<div class="drawer-novedad critica" style="margin-bottom:6px;">';
        html += '<div style="display:flex;align-items:center;gap:6px;">';
        html += '<span class="badge badge-danger">BLOQUEO</span>';
        html += '<span class="text-sm font-medium">' + Utils.escaparHTML(texto || 'Novedad de bloqueo') + '</span>';
        html += '</div></div>';
      });
      html += '</div>';

      if (autorizacion.decision === null || autorizacion.decision === undefined) {
        // Pendiente: mostrar botones de acción
        var autId = Utils.escaparHTML(String(autorizacion.id));
        var placa = Utils.escaparHTML(registro.vehiculo_placa || '');
        html += '<div style="display:flex;gap:var(--spacing-sm);">';
        html += '<button class="btn btn-success btn-sm" onclick="Preoperacionales.abrirModalAutorizar(\'' + autId + '\', \'' + placa + '\')">Autorizar</button>';
        html += '<button class="btn btn-warning btn-sm" onclick="Preoperacionales.decidirPreop(\'' + autId + '\', \'taller\', \'' + placa + '\')">Taller</button>';
        html += '<button class="btn btn-danger btn-sm" onclick="Preoperacionales.decidirPreop(\'' + autId + '\', \'restringir\', \'' + placa + '\')">Restringir</button>';
        html += '</div>';
      } else {
        // Ya resuelta: mostrar badge con la decisión
        var decisionTextos = { autorizar: 'Autorizado', taller: 'En taller', restringir: 'Restringido' };
        var decisionBadges = { autorizar: 'badge-success', taller: 'badge-warning', restringir: 'badge-danger' };
        var textoDecision = decisionTextos[autorizacion.decision] || autorizacion.decision;
        var badgeDecision = decisionBadges[autorizacion.decision] || 'badge-neutral';
        html += '<div style="display:flex;align-items:center;gap:8px;">';
        html += '<span class="badge ' + badgeDecision + '">' + Utils.escaparHTML(textoDecision) + '</span>';
        html += '</div>';
        if (autorizacion.justificacion) {
          html += '<div class="drawer-observacion" style="margin-top:var(--spacing-sm);">"' + Utils.escaparHTML(autorizacion.justificacion) + '"</div>';
        }
      }

      html += '</div>';
    }

    // ── Bloques de inspección ──
    var bloques = [
      { id: 'motor_niveles', nombre: 'Motor y Niveles' },
      { id: 'electrico_luces', nombre: 'Eléctrico y Luces' },
      { id: 'frenos_direccion_llantas', nombre: 'Frenos, Dirección y Llantas' },
      { id: 'cabina_equipo', nombre: 'Cabina y Equipo' }
    ];

    html += '<div class="drawer-section">';
    html += '<div class="drawer-section-title">Bloques de inspección</div>';
    bloques.forEach(function (bloque) {
      var datos = registro[bloque.id];
      var tieneNovedad = false;

      // Verificar si el bloque tiene novedades
      if (datos && datos.items && Array.isArray(datos.items)) {
        tieneNovedad = datos.items.some(function (item) {
          return item.estado && item.estado !== 'OK' && item.estado !== 'Bueno';
        });
      }

      var iconBloque = tieneNovedad ? '⚠️' : '✓';
      var claseBloque = tieneNovedad ? 'drawer-bloque con-novedad' : 'drawer-bloque';

      html += '<div class="' + claseBloque + '">';
      html += '<div class="drawer-bloque-header" onclick="Preoperacionales.toggleBloque(this)">';
      html += '<span>' + iconBloque + ' ' + bloque.nombre + '</span>';
      html += '<span class="drawer-bloque-arrow">▸</span>';
      html += '</div>';
      html += '<div class="drawer-bloque-items" style="display:none;">';

      if (datos && datos.items && Array.isArray(datos.items)) {
        datos.items.forEach(function (item) {
          var esOk = !item.estado || item.estado === 'OK' || item.estado === 'Bueno';
          var claseItem = esOk ? 'text-success' : 'text-warning font-medium';
          html += '<div class="drawer-bloque-item">';
          html += '<span>' + Utils.escaparHTML(item.nombre || '—') + '</span>';
          html += '<span class="' + claseItem + '">' + Utils.escaparHTML(item.estado || 'OK') + '</span>';
          html += '</div>';
        });
      } else if (datos && datos.estado === 'ok') {
        html += '<div class="drawer-bloque-item"><span class="text-secondary">Todo OK — sin detalles individuales</span></div>';
      } else {
        html += '<div class="drawer-bloque-item"><span class="text-secondary">Sin datos</span></div>';
      }

      html += '</div></div>';
    });
    html += '</div>';

    // ── Observaciones ──
    if (registro.observaciones) {
      html += '<div class="drawer-section">';
      html += '<div class="drawer-section-title">Observaciones</div>';
      html += '<div class="drawer-observacion">' + Utils.escaparHTML(registro.observaciones) + '</div>';
      html += '</div>';
    }
    
    // ── Botón PDF ──
    if (registro.pdf_url) {
      html += '<div class="drawer-section">';
      html += '<a href="' + registro.pdf_url + '" target="_blank" class="btn btn-primary" style="width:100%;text-align:center;">📄 Ver PDF del preoperacional</a>';
      html += '</div>';
    }
    
    // ── Firma ──
    if (registro.firma_operario) {
      html += '<div class="drawer-section">';
      html += '<div class="drawer-firma">';
      html += '✓ Firmado digitalmente — ' + (registro.firma_timestamp ? Utils.formatearFecha(registro.firma_timestamp) : '');
      html += '</div>';
      html += '</div>';
    }

    contenido.innerHTML = html;
  },

  // ── Helpers del drawer ──

  drawerInfoCard: function (label, valor, sub) {
    return '<div class="drawer-info-card">' +
           '<div class="text-xs text-secondary">' + label + '</div>' +
           '<div class="font-medium">' + Utils.escaparHTML(valor || '—') + '</div>' +
           (sub ? '<div class="text-xs text-secondary">' + Utils.escaparHTML(sub) + '</div>' : '') +
           '</div>';
  },

  toggleBloque: function (header) {
    var items = header.nextElementSibling;
    var arrow = header.querySelector('.drawer-bloque-arrow');
    if (items.style.display === 'none') {
      items.style.display = 'block';
      arrow.textContent = '▾';
    } else {
      items.style.display = 'none';
      arrow.textContent = '▸';
    }
  },

  cerrarDrawer: function () {
    var backdrop = document.getElementById('drawer-backdrop');
    var panel = document.getElementById('drawer-panel');
    if (backdrop) backdrop.classList.remove('active');
    if (panel) panel.classList.remove('active');
    this.drawerAbierto = false;
    this.detalleActual = null;
  },

  // ─────────────────────────────────────────────────────────
  // ACCIONES DE AUTORIZACIÓN EN DRAWER
  // ─────────────────────────────────────────────────────────

  abrirModalAutorizar: function (autorizacionId, placa) {
    Modal.open({
      title: 'Autorizar salida — ' + placa,
      size: 'md',
      content: `
        <p class="text-sm text-secondary" style="margin-bottom:var(--spacing-md);">
          Escriba la justificación para autorizar la salida del vehículo con esta novedad.
        </p>
        <textarea class="input" id="preop-modal-justificacion" rows="4"
          placeholder="Escriba la justificación (mínimo 10 caracteres)..."
          oninput="Preoperacionales.actualizarBtnAutorizar()" style="resize:vertical;"></textarea>
        <div id="preop-modal-chars" class="text-xs text-secondary" style="margin-top:4px;">0 / mín 10 caracteres</div>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
        <button class="btn btn-success" id="preop-btn-confirmar-autorizar"
          onclick="Preoperacionales.confirmarAutorizar('${Utils.escaparHTML(autorizacionId)}')" disabled>
          Confirmar autorización
        </button>
      `
    });
  },

  actualizarBtnAutorizar: function () {
    var textarea = document.getElementById('preop-modal-justificacion');
    var btn = document.getElementById('preop-btn-confirmar-autorizar');
    var chars = document.getElementById('preop-modal-chars');
    if (!textarea || !btn) return;
    var len = textarea.value.trim().length;
    if (chars) chars.textContent = len + ' / mín 10 caracteres';
    btn.disabled = len < 10;
  },

  confirmarAutorizar: async function (autorizacionId) {
    var textarea = document.getElementById('preop-modal-justificacion');
    if (!textarea) return;
    var justificacion = textarea.value.trim();
    if (justificacion.length < 10) {
      Toast.error('Justificación debe tener al menos 10 caracteres');
      return;
    }
    Modal.close();
    await this._ejecutarDecisionPreop(autorizacionId, 'autorizar', justificacion);
  },

  decidirPreop: async function (autorizacionId, decision, placa) {
    var textos = {
      taller: { title: '¿Enviar ' + placa + ' a taller?', msg: 'El vehículo pasará a estado "En taller".' },
      restringir: { title: '¿Restringir operación de ' + placa + '?', msg: 'El vehículo quedará restringido de operar.' }
    };
    var t = textos[decision] || { title: 'Confirmar decisión', msg: '' };
    var confirmado = await Modal.confirm({
      title: t.title,
      message: t.msg,
      confirmText: 'Confirmar',
      cancelText: 'Cancelar',
      type: decision === 'restringir' ? 'danger' : null
    });
    if (!confirmado) return;
    await this._ejecutarDecisionPreop(autorizacionId, decision, '');
  },

  _ejecutarDecisionPreop: async function (autorizacionId, decision, justificacion) {
    try {
      await API.put('/autorizaciones/' + autorizacionId + '/decidir', {
        decision: decision,
        justificacion: justificacion,
        supervisor_id: null
      });
      Toast.success('Decisión registrada correctamente');
      // Recargar drawer con datos actualizados
      if (this.detalleActual && this.detalleActual.id) {
        await this.abrirDetalle(this.detalleActual.id);
      }
    } catch (error) {
      Toast.error(error.message || 'Error al registrar decisión');
    }
  }
};

window.Preoperacionales = Preoperacionales;
