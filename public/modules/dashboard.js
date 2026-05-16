/**
 * dashboard.js — Mission control para supervisor SST
 * 3 zonas verticales: atención, esta semana, actividad reciente.
 * Consume /api/dashboard/general, /api/dashboard/activos y /api/autorizaciones/pendientes.
 */

window.Dashboard = {
  datos: { general: null, activos: null, pendientes: null },
  periodoActual: 'semana',
  /** Contenedor principal (#main) guardado en render */
  _container: null,

  /**
   * Escapa texto para insertar en HTML (respuestas del API).
   */
  _escape(t) {
    if (t == null) return '';
    return String(t)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  /**
   * Capitaliza texto: primera letra de cada palabra en mayúscula, resto en minúscula.
   * Excepciones: placas (2–4 letras + dígitos) se dejan en mayúscula, 4x2 / 4x4 se mantienen.
   */
  capitalizarNombre(texto) {
    if (!texto) return '';
    return texto
      .split(/\s+/)
      .map(function (palabra) {
        if (!palabra) return '';
        // Mantener placas en mayúscula (ej: IDL363, WDS340, MSO120)
        if (/^[A-Z]{2,4}\d{2,4}[A-Z]?$/i.test(palabra)) return palabra.toUpperCase();
        // Mantener 4x2, 4x4, etc.
        if (/^\d[x×]\d$/i.test(palabra)) return palabra.replace(/×/g, 'x').toLowerCase();
        // Palabras cortas de conexión en minúscula
        if (['de', 'con', 'y', 'en', 'el', 'la', 'los', 'las'].indexOf(palabra.toLowerCase()) !== -1) {
          return palabra.toLowerCase();
        }
        return palabra.charAt(0).toUpperCase() + palabra.slice(1).toLowerCase();
      })
      .filter(Boolean)
      .join(' ');
  },

  formatearPesos(n) {
    if (n == null || isNaN(Number(n))) return '$0';
    return '$' + Math.round(Number(n)).toLocaleString('es-CO');
  },

  /**
   * Fecha relativa en español; día calendario y hora según America/Bogota.
   */
  formatearFechaRelativa(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';

    var ymdBogota = function (dt) {
      return dt.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    };
    var partes = function (s) {
      var x = s.split('-');
      return { y: +x[0], m: +x[1], d: +x[2] };
    };
    var hoyStr = ymdBogota(new Date());
    var evStr = ymdBogota(d);
    var H = partes(hoyStr);
    var E = partes(evStr);
    var diffDias = Math.round(
      (Date.UTC(H.y, H.m - 1, H.d) - Date.UTC(E.y, E.m - 1, E.d)) / 86400000
    );

    var tStr = d.toLocaleTimeString('es-CO', {
      timeZone: 'America/Bogota',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    if (diffDias === 0) return 'Hoy ' + tStr;
    if (diffDias === 1) return 'Ayer ' + tStr;

    var hoy0 = new Date(Date.UTC(H.y, H.m - 1, H.d));
    var d0 = new Date(Date.UTC(E.y, E.m - 1, E.d));
    var inicioSemana = new Date(hoy0);
    inicioSemana.setUTCDate(hoy0.getUTCDate() - ((hoy0.getUTCDay() + 6) % 7));

    if (d0 >= inicioSemana && d0 < hoy0) {
      var diaSem = new Intl.DateTimeFormat('es-CO', {
        timeZone: 'America/Bogota',
        weekday: 'short'
      }).format(d);
      return diaSem + ' ' + tStr;
    }

    return (
      d.toLocaleDateString('es-CO', {
        timeZone: 'America/Bogota',
        day: '2-digit',
        month: '2-digit'
      }) +
      ' ' +
      tStr
    );
  },

  /**
   * Timeline de actividad reciente (HTML).
   */
  renderTimeline(eventos) {
    var self = this;
    if (!eventos || !eventos.length) {
      return '<p class="dash-muted dash-pad-sm">Sin actividad reciente en el período consultado.</p>';
    }
    var colores = {
      ok: '#1D9E75',
      critical: '#E24B4A',
      warning: '#EF9F27',
      info: '#85B7EB'
    };
    var html =
      '<div class="dash-timeline">';
    eventos.forEach(function (ev, idx) {
      var isLast = idx === eventos.length - 1;
      var sev = ev.severidad || 'info';
      var bg = colores[sev] || colores.info;
      var linea = self._escape(ev.descripcion || '');
      var detFmt = ev.detalle ? self.capitalizarNombre(ev.detalle) : '';
      var sub =
        self.formatearFechaRelativa(ev.fecha) +
        (detFmt ? ' — ' + self._escape(detFmt) : '');
      html +=
        '<div class="dash-timeline-item"' +
        (isLast ? ' style="padding-bottom:0"' : '') +
        '>' +
        '<div class="dash-timeline-dot" style="background:' +
        bg +
        ';border-color:var(--bg-primary)"></div>' +
        '<p class="dash-timeline-desc">' +
        linea +
        '</p>' +
        '<p class="dash-timeline-meta">' +
        self._escape(sub) +
        '</p></div>';
    });
    html += '</div>';
    return html;
  },

  async render() {
    var main = document.getElementById('main');
    if (!main) return;
    this._container = main;

    main.innerHTML =
      '<div class="dashboard-wrap">' +
      '<div class="dash-load-banner" id="dash-load-banner" style="display:none">Cargando…</div>' +
      '<div class="dash-header">' +
      '<div class="dash-header-text">' +
      '<p class="dash-header-sub">Dashboard</p>' +
      '<p class="dash-header-title" id="dash-title-main">—</p>' +
      '</div>' +
      '<div class="dash-pill-row" id="dash-period-pills">' +
      this._pillsPeriodoHtml() +
      '</div></div>' +
      '<section id="dash-zona-atencion" class="dash-zona"></section>' +
      '<section id="dash-zona-semana" class="dash-zona"></section>' +
      '<section id="dash-zona-actividad" class="dash-zona"></section>' +
      '</div>';

    this._bindPeriodoPills();
    await this.cargarTodo();
    this._actualizarTituloCabecera();
    this.renderZonaAtencion(this.datos.pendientes);
    this.renderZonaSemana(this.datos.general, this.datos.activos);
    this.renderZonaActividad(this.datos.general);
  },

  _pillsPeriodoHtml() {
    var p = this.periodoActual;
    return (
      '<button type="button" class="dash-pill' +
      (p === 'hoy' ? ' active' : '') +
      '" data-periodo="hoy">Hoy</button>' +
      '<button type="button" class="dash-pill' +
      (p === 'semana' ? ' active' : '') +
      '" data-periodo="semana">Semana</button>' +
      '<button type="button" class="dash-pill' +
      (p === 'mes' ? ' active' : '') +
      '" data-periodo="mes">Mes</button>'
    );
  },

  _setLoading(on) {
    var el = document.getElementById('dash-load-banner');
    if (el) el.style.display = on ? 'block' : 'none';
  },

  _bindPeriodoPills() {
    var self = this;
    var row = document.getElementById('dash-period-pills');
    if (!row) return;
    row.querySelectorAll('.dash-pill').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var per = btn.getAttribute('data-periodo');
        if (per) self.cambiarPeriodo(per);
      });
    });
  },

  _actualizarTituloCabecera() {
    var el = document.getElementById('dash-title-main');
    if (!el || !this.datos.general) return;
    var g = this.datos.general;
    el.textContent = (g.empresa || '—') + ' — ' + (g.sede || '—');
  },

  async cargarTodo() {
    this._setLoading(true);
    try {
      await Promise.all([
        this.cargarGeneral(),
        this.cargarActivos(),
        this.cargarPendientes()
      ]);
    } finally {
      this._setLoading(false);
    }
  },

  async cargarGeneral() {
    try {
      this.datos.general = await API.dashboard.seguridadGeneral(this.periodoActual);
    } catch (e) {
      console.error(e);
      this.datos.general = null;
      if (window.Toast) window.Toast.error('No se pudo cargar el dashboard general');
    }
  },

  async cargarActivos() {
    try {
      this.datos.activos = await API.dashboard.seguridadActivos(this.periodoActual, 'todos');
    } catch (e) {
      console.error(e);
      this.datos.activos = null;
    }
  },

  async cargarPendientes() {
    try {
      this.datos.pendientes = await API.autorizaciones.pendientes();
    } catch (e) {
      console.error(e);
      this.datos.pendientes = [];
      if (window.Toast) window.Toast.error('No se pudieron cargar autorizaciones pendientes');
    }
  },

  async cambiarPeriodo(periodo) {
    if (!['hoy', 'semana', 'mes'].includes(periodo)) return;
    this.periodoActual = periodo;
    var row = document.getElementById('dash-period-pills');
    if (row) row.innerHTML = this._pillsPeriodoHtml();
    this._bindPeriodoPills();

    this._setLoading(true);
    try {
      await Promise.all([this.cargarGeneral(), this.cargarActivos()]);
      this.renderZonaSemana(this.datos.general, this.datos.activos);
    } catch (e) {
      console.error(e);
    } finally {
      this._setLoading(false);
    }
  },

  renderZonaAtencion(pendientes) {
    var panel = document.getElementById('dash-zona-atencion');
    if (!panel) return;

    var lista = pendientes || [];

    if (!lista.length) {
      panel.innerHTML =
        '<p class="dash-section-title">Requiere tu atención</p>' +
        '<div class="dash-alert-row" style="border-left:3px solid #1D9E75">' +
        '<div><p class="dash-alert-title" style="color:#1D9E75">✓ Todo en orden</p>' +
        '<p class="dash-alert-desc">No hay novedades que requieran tu atención.</p></div></div>';
      return;
    }

    var p = lista[0];
    var bloqueo = (p.novedades_bloqueo && p.novedades_bloqueo[0]) || {};
    var itemNombre = bloqueo.item || bloqueo.nombre_item || 'novedad bloqueante';
    var severidad = bloqueo.severidad || 'crítica';
    var placa = p.vehiculo_placa || '—';
    var conductor = this.capitalizarNombre(p.conductor_nombre || 'sin conductor');
    var cuando = this.formatearFechaRelativa(p.timestamp_alerta);
    var idEsc = encodeURIComponent(p.id);

    var html =
      '<p class="dash-section-title">Requiere tu atención</p>' +
      '<div class="dash-alert-row" style="border-left:3px solid #E24B4A;flex-direction:column;align-items:stretch;gap:0.75rem">' +
      '<div>' +
      '<p class="dash-alert-title">🔴 ' + lista.length + ' bloqueo' + (lista.length !== 1 ? 's' : '') + ' pendiente' + (lista.length !== 1 ? 's' : '') +
      ' — ' + this._escape(placa) + ' (' + this._escape(conductor) + ') — ' + this._escape(cuando) + '</p>' +
      '<p class="dash-alert-desc">' + this._escape(this.capitalizarNombre(itemNombre)) +
      ' · severidad ' + this._escape(severidad) + '</p>' +
      '</div>' +
      '<div style="display:flex;gap:0.5rem;flex-wrap:wrap">' +
      '<a class="btn btn-primary btn-sm" href="#alertas?autorizacion=' + idEsc + '&accion=autorizar">Autorizar</a>' +
      '<a class="btn btn-secondary btn-sm" href="#alertas?autorizacion=' + idEsc + '&accion=taller">Enviar a taller</a>' +
      '<a class="btn btn-tertiary btn-sm" href="#alertas?autorizacion=' + idEsc + '&accion=restringir">Restringir</a>' +
      '</div></div>';

    if (lista.length > 1) {
      var mas = lista.length - 1;
      html += '<p class="dash-muted dash-pad-sm">+ ' + mas + ' más pendiente' + (mas !== 1 ? 's' : '') +
              ' — <a href="#alertas">Ver todas</a></p>';
    }

    panel.innerHTML = html;
  },

  renderZonaSemana(general, activos) {
    var panel = document.getElementById('dash-zona-semana');
    if (!panel) return;

    var lblPeriodo = this.periodoActual === 'hoy' ? 'Hoy'
                   : this.periodoActual === 'mes' ? 'Este mes'
                   : 'Esta semana';

    var kpG = (general && general.kpis_seguridad) || {};
    var kpA = (activos && activos.kpis) || {};

    var totalInsp = kpA.inspecciones_periodo != null ? kpA.inspecciones_periodo : 0;
    var pctCumpl = kpG.cumplimiento_inspecciones != null ? kpG.cumplimiento_inspecciones : 0;
    var criticas = kpA.bloqueos != null ? kpA.bloqueos : 0;
    var conNov = kpA.con_novedades != null ? kpA.con_novedades : 0;
    var pctDoc = kpG.documentacion_al_dia != null ? kpG.documentacion_al_dia : 0;
    var porVencer = kpG.documentos_por_vencer != null ? kpG.documentos_por_vencer : 0;

    panel.innerHTML =
      '<p class="dash-section-title">' + this._escape(lblPeriodo) + '</p>' +
      '<div class="dash-g3">' +
      '<div class="dash-card"><p class="dash-card-label">Inspecciones</p>' +
      '<p class="dash-card-value">' + totalInsp + '</p>' +
      '<p class="dash-card-sub">' + pctCumpl + '% cumplimiento</p></div>' +
      '<div class="dash-card"><p class="dash-card-label">Novedades</p>' +
      '<p class="dash-card-value"' + (criticas > 0 ? ' style="color:#E24B4A"' : '') + '>' +
      criticas + ' ' + (criticas === 1 ? 'crítica' : 'críticas') + '</p>' +
      '<p class="dash-card-sub">' + conNov + ' con novedades</p></div>' +
      '<div class="dash-card"><p class="dash-card-label">Documentación al día</p>' +
      '<p class="dash-card-value">' + pctDoc + '%</p>' +
      '<p class="dash-card-sub">' + porVencer + ' próximos a vencer</p></div>' +
      '</div>';
  },

  renderZonaActividad(general) {
    var panel = document.getElementById('dash-zona-actividad');
    if (!panel) return;
    var eventos = (general && general.actividad_reciente) || [];
    var top5 = eventos.slice(0, 5);
    var html =
      '<p class="dash-section-title">Actividad reciente</p>' +
      this.renderTimeline(top5);
    if (eventos.length > 5) {
      html += '<p class="dash-pad-sm"><a href="#preoperacionales">Ver toda la actividad →</a></p>';
    }
    panel.innerHTML = html;
  }
};
