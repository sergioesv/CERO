/**
 * dashboard.js — Dashboard de seguridad operativa (v16)
 * Consume /api/dashboard/general, /activos, /indice
 * Referencia visual: cero_dashboard_mockup_v16.html
 */

window.Dashboard = {
  datos: { general: null, activos: null, indice: null },
  periodoActual: 'semana',
  tipoActivoActual: 'todos',
  tabActual: 'general',
  chartNovedades: null,
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

  /**
   * Tipos distintos de vehículo aún sin tablas de inspección: el backend puede devolver
   * datos de flota; forzamos vista vacía cuando no hay inspecciones en el período.
   */
  _debeMostrarVacioPorTipo(kp) {
    var tipo = this.tipoActivoActual;
    var ins = kp && kp.inspecciones_periodo != null ? Number(kp.inspecciones_periodo) : 0;
    return tipo !== 'todos' && tipo !== 'vehiculo' && ins === 0;
  },

  /**
   * Indica si Chart.js está cargado.
   */
  _chartDisponible() {
    return typeof window.Chart !== 'undefined';
  },

  /**
   * Colores de ejes/grid según tema del panel.
   */
  _chartThemeColors() {
    var oscuro = document.body.getAttribute('data-theme') === 'dark';
    return {
      grid: oscuro ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.05)',
      ticks: oscuro ? '#aaa' : '#666'
    };
  },

  formatearPesos(n) {
    if (n == null || isNaN(Number(n))) return '$0';
    return '$' + Math.round(Number(n)).toLocaleString('es-CO');
  },

  /**
   * Fecha relativa en español (zona local del navegador).
   */
  formatearFechaRelativa(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';

    var ahora = new Date();
    var hoy0 = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    var d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var diffDias = Math.round((hoy0 - d0) / 86400000);

    var h = d.getHours();
    var m = d.getMinutes();
    var ampm = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12;
    if (h12 === 0) h12 = 12;
    var tStr = h12 + ':' + String(m).padStart(2, '0') + ' ' + ampm;

    if (diffDias === 0) return 'Hoy ' + tStr;
    if (diffDias === 1) return 'Ayer ' + tStr;

    var inicioSemana = new Date(hoy0);
    inicioSemana.setDate(hoy0.getDate() - hoy0.getDay() + 1);
    if (d0 >= inicioSemana && d0 < hoy0) {
      var dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
      return dias[d.getDay()] + ' ' + tStr;
    }

    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + ' ' + tStr;
  },

  /**
   * Donut SVG (score 0–100). Circunferencia ≈ 289 con r=46.
   */
  renderDonutSVG(score, size) {
    var s = Math.max(0, Math.min(100, Number(score) || 0));
    var r = 46;
    var c = 2 * Math.PI * r;
    var offset = c - (c * s) / 100;
    var color =
      s >= 70 ? '#1D9E75' : s >= 40 ? '#EF9F27' : '#E24B4A';
    var w = size || 100;
    return (
      '<svg viewBox="0 0 110 110" width="' +
      w +
      '" height="' +
      w +
      '" class="dash-donut-svg" aria-hidden="true">' +
      '<circle cx="55" cy="55" r="' +
      r +
      '" fill="none" stroke="#E1F5EE" stroke-width="9"/>' +
      '<circle cx="55" cy="55" r="' +
      r +
      '" fill="none" stroke="' +
      color +
      '" stroke-width="9" stroke-dasharray="' +
      c.toFixed(2) +
      '" stroke-dashoffset="' +
      offset.toFixed(2) +
      '" stroke-linecap="round" transform="rotate(-90 55 55)"/>' +
      '<text x="55" y="50" text-anchor="middle" font-size="26" font-weight="600" fill="currentColor">' +
      Math.round(s) +
      '</text>' +
      '<text x="55" y="66" text-anchor="middle" font-size="10" fill="var(--text-tertiary)">de 100</text>' +
      '</svg>'
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

  /**
   * Barras horizontales para ítems con más novedades.
   */
  renderBarrasHorizontales(items, mensajeVacio) {
    var self = this;
    var msgDefault = 'Sin novedades en el período';
    if (!items || !items.length) {
      return '<p class="dash-muted">' + self._escape(mensajeVacio || msgDefault) + '</p>';
    }
    var max = Math.max.apply(
      null,
      items.map(function (i) {
        return i.cantidad || 0;
      })
    );
    if (max <= 0) max = 1;
    var colores = {
      bloqueo: '#E24B4A',
      alerta: '#EF9F27',
      informativo: '#85B7EB'
    };
    var html = '<div class="dash-bar-list">';
    items.forEach(function (it) {
      var pct = Math.round(((it.cantidad || 0) / max) * 100);
      var col = colores[it.severidad_predominante] || colores.informativo;
      html +=
        '<div class="dash-bar-row">' +
        '<span class="dash-bar-lab">' +
        self._escape(self.capitalizarNombre(it.item || '')) +
        '</span>' +
        '<div class="dash-bar-trk">' +
        '<div class="dash-bar-fill" style="width:' +
        pct +
        '%;background:' +
        col +
        '"><span>' +
        (it.cantidad || 0) +
        '</span></div></div></div>';
    });
    html += '</div>';
    return html;
  },

  /**
   * Texto descriptivo del hero según score del índice.
   */
  _textoHeroIndice(score, incidentes) {
    var n = incidentes != null ? incidentes : 0;
    var suf =
      n > 0
        ? ' Se detectaron y resolvieron ' +
          n +
          ' situación' +
          (n !== 1 ? 'es' : '') +
          ' de riesgo antes de que algún equipo saliera a operar.'
        : '';
    if (score >= 80) {
      return 'La operación funciona en condiciones seguras.' + suf;
    }
    if (score >= 60) {
      return (
        'La operación tiene áreas de mejora. Revise las situaciones destacadas y el cumplimiento de inspecciones.' +
        suf
      );
    }
    return (
      'Se requiere atención inmediata: priorice resolver bloqueos pendientes y documentación vencida.' + suf
    );
  },

  async render() {
    var main = document.getElementById('main');
    if (!main) return;
    this._container = main;

    if (this.chartNovedades) {
      try {
        this.chartNovedades.destroy();
      } catch (e) {
        /* noop */
      }
      this.chartNovedades = null;
    }

    main.innerHTML =
      '<div class="dashboard-wrap">' +
      '<div class="dash-load-banner" id="dash-load-banner" style="display:none">Cargando…</div>' +
      '<div class="dash-header">' +
      '<div class="dash-header-text">' +
      '<p class="dash-header-sub">Dashboard de seguridad operativa</p>' +
      '<p class="dash-header-title" id="dash-title-main">—</p>' +
      '</div>' +
      '<div class="dash-pill-row" id="dash-period-pills">' +
      this._pillsPeriodoHtml() +
      '</div></div>' +
      '<div class="dash-tabs" id="dash-tabs">' +
      '<button type="button" class="dash-tab active" data-tab="general">General</button>' +
      '<button type="button" class="dash-tab" data-tab="activos">Activos</button>' +
      '<button type="button" class="dash-tab" data-tab="seguridad">Seguridad y permisos</button>' +
      '<button type="button" class="dash-tab" data-tab="reportes">Reportes</button>' +
      '</div>' +
      '<div id="dash-panel-general" class="dash-panel active"></div>' +
      '<div id="dash-panel-activos" class="dash-panel"></div>' +
      '<div id="dash-panel-seguridad" class="dash-panel">' +
      this._htmlSeguridadEstatico() +
      '</div>' +
      '<div id="dash-panel-reportes" class="dash-panel">' +
      this._htmlReportesEstatico() +
      '</div></div>';

    this._bindTabs();
    this._bindPeriodoPills();

    this.tabActual = 'general';
    await this.cargarIndice();
    await this.cargarGeneral();
    this._actualizarTituloCabecera();
    if (this.datos.general) this.renderGeneral(this.datos.general);
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

  _bindTabs() {
    var self = this;
    document.querySelectorAll('#dash-tabs .dash-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var t = btn.getAttribute('data-tab');
        if (t) self.cambiarTab(t);
      });
    });
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

  _mostrarPanel(tab) {
    document.querySelectorAll('.dash-panel').forEach(function (el) {
      el.classList.remove('active');
    });
    document.querySelectorAll('#dash-tabs .dash-tab').forEach(function (b) {
      b.classList.remove('active');
    });
    var panel = document.getElementById('dash-panel-' + tab);
    if (panel) panel.classList.add('active');
    var tb = document.querySelector('#dash-tabs .dash-tab[data-tab="' + tab + '"]');
    if (tb) tb.classList.add('active');
  },

  cambiarTab(tab) {
    this.tabActual = tab;
    this._mostrarTab(tab);
  },

  async _mostrarTab(tab) {
    this._mostrarPanel(tab);
    if (tab === 'activos') {
      this._setLoading(true);
      try {
        await this.cargarActivos();
        this.renderActivos(this.datos.activos);
      } finally {
        this._setLoading(false);
      }
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
      if (this.tabActual === 'general') {
        await this.cargarGeneral();
        await this.cargarIndice();
        this._actualizarTituloCabecera();
        if (this.datos.general) this.renderGeneral(this.datos.general);
      } else if (this.tabActual === 'activos') {
        await this.cargarActivos();
        this.renderActivos(this.datos.activos);
      }
    } catch (e) {
      console.error(e);
    } finally {
      this._setLoading(false);
    }
  },

  async cambiarTipoActivo(tipo) {
    this.tipoActivoActual = tipo || 'todos';
    this._setLoading(true);
    try {
      await this.cargarActivos();
      this.renderActivos(this.datos.activos);
    } finally {
      this._setLoading(false);
    }
  },

  _actualizarTituloCabecera() {
    var el = document.getElementById('dash-title-main');
    if (!el || !this.datos.general) return;
    var g = this.datos.general;
    el.textContent = (g.empresa || '—') + ' — ' + (g.sede || '—');
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
      this.datos.activos = await API.dashboard.seguridadActivos(
        this.periodoActual,
        this.tipoActivoActual
      );
    } catch (e) {
      console.error(e);
      this.datos.activos = null;
      if (window.Toast) window.Toast.error('No se pudieron cargar datos de activos');
    }
  },

  async cargarIndice() {
    try {
      this.datos.indice = await API.dashboard.seguridadIndice();
    } catch (e) {
      console.error(e);
      this.datos.indice = null;
    }
  },

  renderGeneral(d) {
    var self = this;
    var panel = document.getElementById('dash-panel-general');
    if (!panel) return;

    if (!d) {
      panel.innerHTML =
        '<p class="dash-muted">Sin datos. Verifique la conexión o los permisos del API.</p>';
      return;
    }

    var indice = d.indice_seguridad || {};
    var score = indice.score != null ? indice.score : 0;
    var delta = indice.delta_mes_anterior != null ? indice.delta_mes_anterior : 0;
    var inc = indice.incidentes_prevenidos != null ? indice.incidentes_prevenidos : 0;
    var deltaTxt =
      (delta >= 0 ? '+' : '') + delta + ' pts vs mes anterior';
    var deltaClass = delta >= 0 ? 'dash-badge dash-badge-ok' : 'dash-badge dash-badge-warn';

    var kp = d.kpis_seguridad || {};
    var kf = d.kpis_financieros || {};
    var dec = d.decisiones_supervisor || {};
    var sit = d.situaciones_atencion || [];

    var riesgoClass = (kp.riesgos_prevenidos || 0) > 0 ? ' style="color:#1D9E75"' : '';
    var cumplDeltaColor =
      (kp.cumplimiento_delta || 0) >= 0 ? 'color:#1D9E75' : 'color:#E24B4A';
    var docPv = kp.documentos_por_vencer || 0;
    var docSubStyle = docPv > 0 ? ' style="color:#D85A30"' : '';

    var htmlSit = '';
    if (!sit.length) {
      htmlSit =
        '<p class="dash-muted dash-sit-empty">No se detectaron anomalías en el período analizado.</p>';
    } else {
      sit.forEach(function (s) {
        var border = '#EF9F27';
        var badgeClass = 'dash-badge dash-badge-warn';
        var badgeLabel = 'Patrón';
        if (s.tipo === 'reincidencia') {
          border = '#E24B4A';
          badgeClass = 'dash-badge dash-badge-danger';
          badgeLabel = 'Reincidencia';
        } else if (s.tipo === 'anomalia') {
          badgeLabel = 'Anomalía';
        }
        htmlSit +=
          '<div class="dash-alert-row" style="border-left:3px solid ' +
          border +
          '"><div><p class="dash-alert-title">' +
          self._escape(s.titulo) +
          '</p><p class="dash-alert-desc">' +
          self._escape(s.descripcion) +
          '</p></div><span class="' +
          badgeClass +
          '">' +
          badgeLabel +
          '</span></div>';
      });
    }

    var pendTime = dec.tiempo_pendiente_max ? dec.tiempo_pendiente_max : '';

    panel.innerHTML =
      '<div class="dash-hero">' +
      this.renderDonutSVG(score, 100) +
      '<div class="dash-hero-body">' +
      '<p class="dash-hero-heading">Índice de seguridad operativa</p>' +
      '<p class="dash-hero-desc">' +
      this._escape(this._textoHeroIndice(score, inc)) +
      '</p>' +
      '<div class="dash-hero-badges">' +
      '<span class="' +
      deltaClass +
      '">' +
      this._escape(deltaTxt) +
      '</span>' +
      '<span class="dash-badge dash-badge-info">' +
      inc +
      ' incidentes prevenidos</span></div></div></div>' +
      '<div class="dash-g4">' +
      '<div class="dash-card"><p class="dash-card-label">Riesgos prevenidos</p>' +
      '<p class="dash-card-value"' +
      riesgoClass +
      '>' +
      (kp.riesgos_prevenidos || 0) +
      '</p><p class="dash-card-sub">Detectados antes de operar</p></div>' +
      '<div class="dash-card"><p class="dash-card-label">Cumplimiento inspecciones</p>' +
      '<p class="dash-card-value">' +
      (kp.cumplimiento_inspecciones || 0) +
      '%</p><p class="dash-card-sub" style="' +
      cumplDeltaColor +
      '">' +
      (kp.cumplimiento_delta >= 0 ? '+' : '') +
      (kp.cumplimiento_delta || 0) +
      '% vs mes anterior</p></div>' +
      '<div class="dash-card"><p class="dash-card-label">Activos operativos</p>' +
      '<p class="dash-card-value">' +
      (kp.activos_operativos || 0) +
      ' <span class="dash-op-total">/ ' +
      (kp.activos_total || 0) +
      '</span></p><p class="dash-card-sub">' +
      (kp.activos_fuera_servicio || 0) +
      ' fuera de servicio</p></div>' +
      '<div class="dash-card"><p class="dash-card-label">Documentación al día</p>' +
      '<p class="dash-card-value">' +
      (kp.documentacion_al_dia || 0) +
      '%</p><p class="dash-card-sub"' +
      docSubStyle +
      '>' +
      docPv +
      ' por vencer</p></div></div>' +
      '<div class="dash-g3 dash-g3-fin">' +
      '<div class="dash-card-mini"><p class="dash-card-label">Ahorro estimado este mes</p>' +
      '<p class="dash-card-value-sm">' +
      this.formatearPesos(kf.ahorro_estimado_mes) +
      '</p><p class="dash-card-sub">Sanciones y paradas evitadas</p></div>' +
      '<div class="dash-card-mini"><p class="dash-card-label">Costo diario sin inspeccionar</p>' +
      '<p class="dash-card-value-sm">' +
      this.formatearPesos(kf.costo_diario_sin_inspeccionar) +
      '</p><p class="dash-card-sub">Cuadrilla inactiva + sanción</p></div>' +
      '<div class="dash-card-mini"><p class="dash-card-label">Sanciones prevenidas</p>' +
      '<p class="dash-card-value-sm">' +
      this.formatearPesos(kf.sanciones_prevenidas) +
      '</p><p class="dash-card-sub">Documentos bloqueados a tiempo</p></div></div>' +
      '<p class="dash-section-title">Situaciones que requieren atención</p>' +
      htmlSit +
      '<p class="dash-section-title">Decisiones del supervisor</p>' +
      '<div class="dash-dc">' +
      '<div class="dash-dci"><p class="dash-card-value-lg" style="color:#1D9E75">' +
      (dec.autorizadas || 0) +
      '</p><p class="dash-dci-label">Autorizadas</p></div>' +
      '<div class="dash-dci"><p class="dash-card-value-lg" style="color:#D85A30">' +
      (dec.taller || 0) +
      '</p><p class="dash-dci-label">A taller</p></div>' +
      '<div class="dash-dci"><p class="dash-card-value-lg" style="color:#E24B4A">' +
      (dec.pendientes || 0) +
      '</p><p class="dash-dci-label">Pendiente</p>' +
      (pendTime
        ? '<p class="dash-pend-time">' + this._escape(pendTime) + ' sin respuesta</p>'
        : '') +
      '</div></div>' +
      '<p class="dash-section-title">Actividad reciente</p>' +
      this.renderTimeline(d.actividad_reciente || []);
  },

  _filtroTipoHtml() {
    var t = this.tipoActivoActual;
    var tipos = [
      { id: 'todos', label: 'Todos' },
      { id: 'vehiculo', label: 'Vehículos' },
      { id: 'escalera', label: 'Escaleras', dim: true },
      { id: 'taladro', label: 'Taladros', dim: true },
      { id: 'arnes', label: 'Arnés / EPP', dim: true }
    ];
    var self = this;
    var html = '<div class="dash-filter-pills">';
    tipos.forEach(function (x) {
      var on = t === x.id ? ' active' : '';
      var op = x.dim ? ' style="opacity:0.4"' : '';
      html +=
        '<button type="button" class="dash-filter-pill' +
        on +
        '" data-tipo="' +
        x.id +
        '"' +
        op +
        '>' +
        x.label +
        '</button>';
    });
    html += '</div>';
    return html;
  },

  _bindFiltroTipo() {
    var self = this;
    document.querySelectorAll('.dash-filter-pill').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tipo = btn.getAttribute('data-tipo');
        document.querySelectorAll('.dash-filter-pill').forEach(function (b) {
          b.classList.remove('active');
        });
        btn.classList.add('active');
        self.cambiarTipoActivo(tipo);
      });
    });
  },

  renderActivos(d) {
    var panel = document.getElementById('dash-panel-activos');
    if (!panel) return;

    panel.innerHTML =
      this._filtroTipoHtml() +
      '<div id="dash-activos-body"></div>';

    var body = document.getElementById('dash-activos-body');
    this._bindFiltroTipo();

    if (!d || !body) {
      if (body) {
        body.innerHTML =
          '<p class="dash-muted">Sin datos de activos para este período.</p>';
      }
      return;
    }

    var kpRaw = d.kpis || {};
    var vacioTipo = this._debeMostrarVacioPorTipo(kpRaw);

    var kp = vacioTipo
      ? {
          inspecciones_periodo: 0,
          inspecciones_delta: 0,
          con_novedades: 0,
          con_novedades_pct: 0,
          bloqueos: 0,
          bloqueos_resueltos: 0,
          promedio_dias_fuera_servicio: 0,
          activo_sube_promedio: ''
        }
      : kpRaw;

    var meses = vacioTipo ? [] : d.novedades_por_mes || [];
    var items = vacioTipo ? [] : d.items_mas_novedades || [];
    var atencion = vacioTipo ? [] : d.activos_atencion || [];
    var reinc = vacioTipo ? [] : d.reincidencia || [];

    var lblInspecciones =
      this.periodoActual === 'hoy'
        ? 'Inspecciones hoy'
        : this.periodoActual === 'mes'
          ? 'Inspecciones este mes'
          : 'Inspecciones esta semana';

    var deltaIns = kp.inspecciones_delta != null ? kp.inspecciones_delta : 0;
    var deltaColor = deltaIns >= 0 ? '#1D9E75' : '#E24B4A';

    var bloqueosSub;
    if (vacioTipo) {
      bloqueosSub = 'Sin datos para este tipo de activo';
    } else {
      bloqueosSub =
        (kp.bloqueos_resueltos || 0) >= (kp.bloqueos || 0) && (kp.bloqueos || 0) > 0
          ? 'Todos resueltos'
          : (kp.bloqueos_resueltos || 0) + ' de ' + (kp.bloqueos || 0) + ' resueltos';
    }

    var placaPeor = kp.activo_sube_promedio || '';
    var promSub;
    if (vacioTipo) {
      promSub = '—';
    } else if (placaPeor) {
      promSub =
        '<span style="color:#D85A30">' +
        this._escape(this.capitalizarNombre(placaPeor)) +
        ' sube el promedio</span>';
    } else {
      promSub = 'Sin outliers destacados';
    }

    var chartBlock = vacioTipo
      ? '<div class="dash-chart-empty">Sin datos para este tipo de activo</div>'
      : '<div class="dash-chart-wrap"><canvas id="chart-novedades" height="220"></canvas></div>';

    var msgListaVacio = 'Sin datos para este tipo de activo';

    body.innerHTML =
      '<div class="dash-g4">' +
      '<div class="dash-card"><p class="dash-card-label">' +
      lblInspecciones +
      '</p><p class="dash-card-value">' +
      (kp.inspecciones_periodo || 0) +
      '</p><p class="dash-card-sub" style="color:' +
      deltaColor +
      '">' +
      (deltaIns >= 0 ? '+' : '') +
      deltaIns +
      '% vs anterior</p></div>' +
      '<div class="dash-card"><p class="dash-card-label">Con novedades</p>' +
      '<p class="dash-card-value">' +
      (kp.con_novedades || 0) +
      '</p><p class="dash-card-sub">' +
      (kp.con_novedades_pct || 0) +
      '% del total</p></div>' +
      '<div class="dash-card"><p class="dash-card-label">Bloqueos</p>' +
      '<p class="dash-card-value" style="color:#E24B4A">' +
      (kp.bloqueos || 0) +
      '</p><p class="dash-card-sub">' +
      bloqueosSub +
      '</p></div>' +
      '<div class="dash-card"><p class="dash-card-label">Prom. días fuera servicio</p>' +
      '<p class="dash-card-value">' +
      (kp.promedio_dias_fuera_servicio != null ? kp.promedio_dias_fuera_servicio : '0') +
      '</p><p class="dash-card-sub">' +
      promSub +
      '</p></div></div>' +
      '<p class="dash-section-title" style="margin-top:0.5rem">Novedades vs decisión del supervisor</p>' +
      '<div class="dash-chart-legend">' +
      '<span><span class="dash-ld" style="background:#E24B4A"></span>Bloqueos</span>' +
      '<span><span class="dash-ld" style="background:#378ADD"></span>A taller</span>' +
      '<span><span class="dash-ld" style="background:#1D9E75"></span>Autorizados</span></div>' +
      chartBlock +
      '<p class="dash-section-title">Ítems con más novedades</p>' +
      this.renderBarrasHorizontales(items, vacioTipo ? msgListaVacio : null) +
      '<p class="dash-section-title">Activos que requieren atención</p>' +
      this._htmlActivosAtencion(atencion, vacioTipo) +
      '<p class="dash-section-title">Reincidencia</p>' +
      '<p class="dash-section-sub">Misma novedad 2+ veces en 90 días</p>' +
      this._htmlReincidencia(reinc, vacioTipo);

    if (vacioTipo) {
      if (this.chartNovedades) {
        try {
          this.chartNovedades.destroy();
        } catch (e) {
          /* noop */
        }
        this.chartNovedades = null;
      }
    } else {
      this._renderChartNovedades(meses);
    }
  },

  _htmlActivosAtencion(list, vacioTipo) {
    var self = this;
    if (vacioTipo) {
      return '<p class="dash-muted">Sin datos para este tipo de activo</p>';
    }
    if (!list.length) {
      return '<p class="dash-muted">Ningún activo requiere atención urgente en este momento.</p>';
    }
    var html = '';
    list.forEach(function (a) {
      var dias = a.dias_taller != null ? a.dias_taller : 0;
      var border = '#EF9F27';
      if (dias > 15 || (a.alertas || []).some(function (x) { return /vencid/i.test(x); })) {
        border = '#E24B4A';
      } else if (dias > 7) {
        border = '#EF9F27';
      }
      var badges = (a.alertas || [])
        .map(function (al) {
          var cls = /vencid|Bloqueado|crít/i.test(al) ? 'dash-badge dash-badge-danger' : 'dash-badge dash-badge-warn';
          return '<span class="' + cls + '">' + self._escape(al) + '</span>';
        })
        .join('');
      html +=
        '<div class="dash-alert-row" style="border-left:3px solid ' +
        border +
        '"><div><span class="dash-placa">' +
        self._escape(a.codigo) +
        '</span><span class="dash-nombre-activo">' +
        self._escape(self.capitalizarNombre(a.nombre || '')) +
        '</span></div><div class="dash-badge-row">' +
        badges +
        (dias > 0 ? '<span class="dash-badge dash-badge-warn">' + dias + 'd taller</span>' : '') +
        '</div></div>';
    });
    return html;
  },

  _htmlReincidencia(list, vacioTipo) {
    var self = this;
    if (vacioTipo) {
      return '<p class="dash-muted">Sin datos para este tipo de activo</p>';
    }
    if (!list.length) {
      return '<p class="dash-muted">Sin reincidencias detectadas</p>';
    }
    var html = '';
    list.forEach(function (r) {
      var border = r.veces >= 3 ? '#E24B4A' : '#EF9F27';
      var badgeClass = r.veces >= 3 ? 'dash-badge dash-badge-danger' : 'dash-badge dash-badge-warn';
      var dias = r.periodo_dias != null ? r.periodo_dias : 90;
      html +=
        '<div class="dash-alert-row" style="border-left:3px solid ' +
        border +
        '"><div><span class="dash-placa">' +
        self._escape(r.codigo) +
        '</span><span class="dash-nombre-activo">' +
        self._escape(self.capitalizarNombre(r.item || '')) +
        '</span></div><span class="' +
        badgeClass +
        '">' +
        r.veces +
        '× / ' +
        dias +
        'd</span></div>';
    });
    return html;
  },

  _renderChartNovedades(meses) {
    if (!this._chartDisponible()) {
      console.warn('Chart.js no disponible');
      return;
    }
    var canvas = document.getElementById('chart-novedades');
    if (!canvas) return;

    if (this.chartNovedades) {
      try {
        this.chartNovedades.destroy();
      } catch (e) {
        /* noop */
      }
      this.chartNovedades = null;
    }

    var labels = (meses || []).map(function (m) {
      return m.mes || '';
    });
    var bloqueos = (meses || []).map(function (m) {
      return m.bloqueos || 0;
    });
    var taller = (meses || []).map(function (m) {
      return m.taller || 0;
    });
    var aut = (meses || []).map(function (m) {
      return m.autorizados || 0;
    });

    var tc = this._chartThemeColors();

    if (!window.__ceroDashboardChartThemeHook) {
      window.__ceroDashboardChartThemeHook = true;
      window.addEventListener('cero-theme-changed', function () {
        var D = window.Dashboard;
        var da = D && D.datos && D.datos.activos;
        if (
          D &&
          D.tabActual === 'activos' &&
          document.getElementById('chart-novedades') &&
          da &&
          da.novedades_por_mes &&
          !D._debeMostrarVacioPorTipo(da.kpis || {})
        ) {
          D._renderChartNovedades(da.novedades_por_mes);
        }
      });
    }

    this.chartNovedades = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Bloqueos',
            data: bloqueos,
            backgroundColor: '#E24B4A',
            borderRadius: 3
          },
          {
            label: 'Taller',
            data: taller,
            backgroundColor: '#378ADD',
            borderRadius: 3
          },
          {
            label: 'Autorizados',
            data: aut,
            backgroundColor: '#1D9E75',
            borderRadius: 3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            stacked: true,
            ticks: { color: tc.ticks },
            grid: { color: tc.grid }
          },
          x: {
            stacked: true,
            ticks: { color: tc.ticks },
            grid: { display: false }
          }
        }
      }
    });
  },

  /** Placeholder Fase 3 — mismo contenido que mockup (sin marca de agua). */
  _htmlSeguridadEstatico() {
    return (
      '<div class="dash-fase-banner">' +
      '<p class="dash-fase-title">Fase 3 — Próximamente</p>' +
      '<p class="dash-fase-sub">Se activará con inspecciones de equipos y permisos de trabajo</p></div>' +
      '<div class="dash-g4 dash-opacity-soft">' +
      '<div class="dash-card"><p class="dash-card-label">Equipos inspeccionados</p><p class="dash-card-value">—</p></div>' +
      '<div class="dash-card"><p class="dash-card-label">Equipos bloqueados</p><p class="dash-card-value">—</p></div>' +
      '<div class="dash-card"><p class="dash-card-label">Permisos activos</p><p class="dash-card-value">—</p></div>' +
      '<div class="dash-card"><p class="dash-card-label">Pendientes firma SST</p><p class="dash-card-value">—</p></div></div>' +
      '<p class="dash-section-title dash-opacity-soft">Inspecciones de equipos</p>' +
      '<div class="dash-opacity-soft">' +
      '<div class="dash-pr-row"><span>Escaleras</span><span class="dash-badge dash-badge-neutral">Sin datos</span></div>' +
      '<div class="dash-pr-row"><span>Taladros y herramienta eléctrica</span><span class="dash-badge dash-badge-neutral">Sin datos</span></div>' +
      '<div class="dash-pr-row"><span>Arnés y línea de vida</span><span class="dash-badge dash-badge-neutral">Sin datos</span></div>' +
      '<div class="dash-pr-row"><span>EPP (casco, guantes, botas)</span><span class="dash-badge dash-badge-neutral">Sin datos</span></div></div>' +
      '<p class="dash-section-title dash-opacity-soft" style="margin-top:1.5rem">Permisos de trabajo</p>' +
      '<div class="dash-opacity-soft">' +
      '<div class="dash-pr-row"><span>ATS — Análisis de trabajo seguro</span><span class="dash-badge dash-badge-neutral">Sin datos</span></div>' +
      '<div class="dash-pr-row"><span>Permiso de trabajo en altura</span><span class="dash-badge dash-badge-neutral">Sin datos</span></div>' +
      '<div class="dash-pr-row"><span>Permiso de riesgo eléctrico</span><span class="dash-badge dash-badge-neutral">Sin datos</span></div>' +
      '<div class="dash-pr-row"><span>Permiso de espacio confinado</span><span class="dash-badge dash-badge-neutral">Sin datos</span></div></div>'
    );
  },

  /** Reportes Power BI — SVG e iconos del mockup. */
  _htmlReportesEstatico() {
    return (
      '<div class="dash-hero dash-hero-report">' +
      '<svg class="dash-rp-illus" viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<rect x="10" y="8" width="180" height="120" rx="8" fill="var(--dash-rp-rect)" stroke="var(--border-secondary)" stroke-width="0.5"/>' +
      '<rect x="10" y="8" width="180" height="18" rx="8" fill="var(--dash-rp-head)"/>' +
      '<rect x="10" y="18" width="180" height="8" fill="var(--dash-rp-head)"/>' +
      '<circle cx="22" cy="17" r="3" fill="#E24B4A"/><circle cx="31" cy="17" r="3" fill="#EF9F27"/><circle cx="40" cy="17" r="3" fill="#1D9E75"/>' +
      '<rect x="10" y="26" width="40" height="102" fill="var(--dash-rp-side)" opacity=".5"/>' +
      '<rect x="16" y="34" width="28" height="4" rx="2" fill="var(--dash-rp-line)"/>' +
      '<rect x="16" y="43" width="22" height="3" rx="1.5" fill="var(--dash-rp-line2)"/>' +
      '<rect x="16" y="50" width="26" height="3" rx="1.5" fill="var(--dash-rp-line2)"/>' +
      '<rect x="16" y="57" width="20" height="3" rx="1.5" fill="var(--dash-rp-line2)"/>' +
      '<rect x="60" y="90" width="14" height="28" rx="2" fill="#1D9E75" opacity=".7"/>' +
      '<rect x="78" y="78" width="14" height="40" rx="2" fill="#1D9E75" opacity=".8"/>' +
      '<rect x="96" y="66" width="14" height="52" rx="2" fill="#1D9E75" opacity=".85"/>' +
      '<rect x="114" y="54" width="14" height="64" rx="2" fill="#1D9E75"/>' +
      '<rect x="132" y="72" width="14" height="46" rx="2" fill="#378ADD" opacity=".8"/>' +
      '<rect x="150" y="84" width="14" height="34" rx="2" fill="#378ADD" opacity=".7"/>' +
      '<polyline points="67,86 85,72 103,60 121,48 139,64 157,78" fill="none" stroke="#D85A30" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="67" cy="86" r="3" fill="#D85A30"/><circle cx="85" cy="72" r="3" fill="#D85A30"/><circle cx="103" cy="60" r="3" fill="#D85A30"/>' +
      '<circle cx="121" cy="48" r="3" fill="#D85A30"/><circle cx="139" cy="64" r="3" fill="#D85A30"/><circle cx="157" cy="78" r="3" fill="#D85A30"/>' +
      '<rect x="58" y="32" width="36" height="22" rx="4" fill="var(--bg-primary)" stroke="var(--border-secondary)" stroke-width="0.5"/>' +
      '<text x="76" y="42" text-anchor="middle" font-size="7" font-weight="600" fill="#1D9E75">92</text>' +
      '<text x="76" y="50" text-anchor="middle" font-size="4" fill="var(--text-tertiary)">Score</text>' +
      '<rect x="98" y="32" width="36" height="22" rx="4" fill="var(--bg-primary)" stroke="var(--border-secondary)" stroke-width="0.5"/>' +
      '<text x="116" y="42" text-anchor="middle" font-size="7" font-weight="600" fill="var(--text-primary)">96%</text>' +
      '<text x="116" y="50" text-anchor="middle" font-size="4" fill="var(--text-tertiary)">Cumpl.</text>' +
      '<rect x="138" y="32" width="36" height="22" rx="4" fill="var(--bg-primary)" stroke="var(--border-secondary)" stroke-width="0.5"/>' +
      '<text x="156" y="42" text-anchor="middle" font-size="7" font-weight="600" fill="#E24B4A">3</text>' +
      '<text x="156" y="50" text-anchor="middle" font-size="4" fill="var(--text-tertiary)">Bloq.</text>' +
      '<circle cx="170" cy="110" r="12" fill="none" stroke="#E1F5EE" stroke-width="4"/>' +
      '<circle cx="170" cy="110" r="12" fill="none" stroke="#1D9E75" stroke-width="4" stroke-dasharray="62" stroke-dashoffset="15" transform="rotate(-90 170 110)"/>' +
      '<text x="170" y="112" text-anchor="middle" font-size="6" font-weight="600" fill="var(--text-primary)">82%</text>' +
      '</svg>' +
      '<div class="dash-hero-body">' +
      '<p class="dash-rp-heading">Reportes avanzados con Power BI</p>' +
      '<p class="dash-rp-desc">CERO almacena cada inspección, novedad, decisión y cambio de estado. Con Power BI conectado directamente a la base de datos, la información se transforma en análisis profundo.</p>' +
      '<div class="dash-hero-badges">' +
      '<span class="dash-badge dash-badge-ok">Conexión directa PostgreSQL</span>' +
      '<span class="dash-badge dash-badge-info">Actualización automática</span>' +
      '<span class="dash-badge dash-badge-neutral">Sin costo adicional</span></div></div></div>' +
      '<p class="dash-section-title">Con 3+ meses de operación</p>' +
      '<div class="dash-rp-card">' +
      this._rpRow(
        '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 15L7 9L11 12L17 5" stroke="#1D9E75" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="17" cy="5" r="2" fill="#1D9E75"/></svg>',
        '#E1F5EE',
        'Tendencia del índice de seguridad operativa',
        'Evolución mensual del score desglosado por tipo de activo.'
      ) +
      this._rpRow(
        '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 3V10L14 14" stroke="#E24B4A" stroke-width="2" stroke-linecap="round"/><circle cx="10" cy="10" r="7" stroke="#E24B4A" stroke-width="1.5" fill="none"/></svg>',
        '#FCEBEB',
        'Análisis de reincidencia por activo',
        'Drill-down por vehículo, escalera o equipo. Detecta fallas repetidas.'
      ) +
      this._rpRow(
        '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="3" y="12" width="3" height="5" rx="1" fill="#EF9F27"/><rect x="8.5" y="8" width="3" height="9" rx="1" fill="#EF9F27"/><rect x="14" y="4" width="3" height="13" rx="1" fill="#EF9F27"/></svg>',
        '#FAEEDA',
        'Novedades por severidad — comparativo mensual',
        'Bloqueos vs alertas vs informativos. Filtra por activo, sede, turno.'
      ) +
      this._rpRow(
        '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="3" y="5" width="14" height="3" rx="1.5" fill="#378ADD" opacity=".3"/><rect x="3" y="5" width="10" height="3" rx="1.5" fill="#378ADD"/><rect x="3" y="10" width="14" height="3" rx="1.5" fill="#378ADD" opacity=".3"/><rect x="3" y="10" width="6" height="3" rx="1.5" fill="#378ADD"/><rect x="3" y="15" width="14" height="3" rx="1.5" fill="#378ADD" opacity=".3"/><rect x="3" y="15" width="12" height="3" rx="1.5" fill="#378ADD"/></svg>',
        '#E6F1FB',
        'Días fuera de servicio y motivos de parada',
        'Tiempo por activo, motivo, vs promedio. Cuellos de botella.'
      ) +
      this._rpRow(
        '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 3C6.13 3 3 6.13 3 10C3 13.87 6.13 17 10 17C13.87 17 17 13.87 17 10" stroke="#534AB7" stroke-width="1.5" stroke-linecap="round"/><path d="M10 10L15 5" stroke="#534AB7" stroke-width="2" stroke-linecap="round"/><circle cx="10" cy="10" r="2" fill="#534AB7"/></svg>',
        '#EEEDFE',
        'Decisiones del supervisor — análisis de respuesta',
        'Ratio autorizados vs taller. Tiempo de respuesta. Justificaciones.'
      ) +
      this._rpRow(
        '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 16L8 10L12 13L16 4" stroke="#D4537E" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M13 4H16V7" stroke="#D4537E" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        '#FBEAF0',
        'Impacto financiero — ROI de CERO',
        'Multas prevenidas, costo inactividad, ahorro acumulado.'
      ) +
      this._rpRow(
        '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="4" y="3" width="12" height="14" rx="2" stroke="#1D9E75" stroke-width="1.5" fill="none"/><path d="M7 7H13M7 10H13M7 13H11" stroke="#1D9E75" stroke-width="1.2" stroke-linecap="round"/></svg>',
        '#E1F5EE',
        'Reporte PESV para Supertransporte',
        'Indicadores IF, IS, ILI. Exportable para auditorías ARL.',
        true
      ) +
      '</div>' +
      '<p class="dash-section-title">Con 6+ meses de operación</p>' +
      '<div class="dash-rp-card">' +
      this._rpRow(
        '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 17H17" stroke="#378ADD" stroke-width="1.2"/><path d="M5 13C6 10 8 8 10 9C12 10 14 6 16 3" stroke="#378ADD" stroke-width="2" stroke-linecap="round" fill="none"/><circle cx="10" cy="9" r="2" fill="#E24B4A"/></svg>',
        '#E6F1FB',
        'Anomalías de combustible (IA)',
        'Consumos atípicos. Km vs litros. Fugas o uso indebido.'
      ) +
      this._rpRow(
        '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="7" r="4" stroke="#854F0B" stroke-width="1.5" fill="none"/><path d="M4 17C4 13.69 6.69 11 10 11C13.31 11 16 13.69 16 17" stroke="#854F0B" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>',
        '#FAEEDA',
        'Indicadores de conducción por operario',
        'Novedades por conductor, cumplimiento, capacitación.'
      ) +
      this._rpRow(
        '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="3" y="6" width="6" height="10" rx="1.5" stroke="#534AB7" stroke-width="1.5" fill="none"/><rect x="11" y="3" width="6" height="13" rx="1.5" stroke="#534AB7" stroke-width="1.5" fill="none"/><path d="M5 10H7M5 13H7M13 7H15M13 10H15M13 13H15" stroke="#534AB7" stroke-width="1" stroke-linecap="round"/></svg>',
        '#EEEDFE',
        'Benchmark entre sedes',
        'Comparativo de seguridad y costos entre sedes.',
        true
      ) +
      '</div>'
    );
  },

  _rpRow(svgInner, bg, title, desc, last) {
    return (
      '<div class="dash-rp-row"' +
      (last ? ' style="margin-bottom:0"' : '') +
      '><div class="dash-rp-icon" style="background:' +
      bg +
      '">' +
      svgInner +
      '</div><div><p class="dash-rp-item-title">' +
      title +
      '</p><p class="dash-rp-item-desc">' +
      desc +
      '</p></div></div>'
    );
  },

  /** Pestaña Fase 3 — contenido estático (sin API). */
  renderSeguridad() {
    return this._htmlSeguridadEstatico();
  },

  /** Pestaña visión Power BI — contenido estático. */
  renderReportes() {
    return this._htmlReportesEstatico();
  }
};
