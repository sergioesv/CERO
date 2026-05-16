/**
 * metricas.js — Vista comercial para superadmin
 * Tabs: Operativa (indice + grafica), Financiera (KPIs), Activos (KPIs + barras).
 * Consume /api/dashboard/general, /api/dashboard/activos, /api/dashboard/indice.
 * Visibilidad: solo superadmin_plataforma (demos comerciales).
 */

window.Metricas = {
  datos: { general: null, activos: null, indice: null },
  periodoActual: 'semana',
  tipoActivoActual: 'todos',
  tabActual: 'operativa',
  chartNovedades: null,
  _container: null,

  _escape(t) {
    if (t == null) return '';
    return String(t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  capitalizarNombre(texto) {
    if (!texto) return '';
    return texto.split(/\s+/).map(function (palabra) {
      if (!palabra) return '';
      if (/^[A-Z]{2,4}\d{2,4}[A-Z]?$/i.test(palabra)) return palabra.toUpperCase();
      if (/^\d[x×]\d$/i.test(palabra)) return palabra.replace(/×/g, 'x').toLowerCase();
      if (['de', 'con', 'y', 'en', 'el', 'la', 'los', 'las'].indexOf(palabra.toLowerCase()) !== -1) {
        return palabra.toLowerCase();
      }
      return palabra.charAt(0).toUpperCase() + palabra.slice(1).toLowerCase();
    }).filter(Boolean).join(' ');
  },

  formatearPesos(n) {
    if (n == null || isNaN(Number(n))) return '$0';
    return '$' + Math.round(Number(n)).toLocaleString('es-CO');
  },

  _chartDisponible() { return typeof window.Chart !== 'undefined'; },

  _chartThemeColors() {
    var oscuro = document.body.getAttribute('data-theme') === 'dark';
    return {
      grid: oscuro ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.05)',
      ticks: oscuro ? '#aaa' : '#666'
    };
  },

  _debeMostrarVacioPorTipo(kp) {
    var tipo = this.tipoActivoActual;
    var ins = kp && kp.inspecciones_periodo != null ? Number(kp.inspecciones_periodo) : 0;
    return tipo !== 'todos' && tipo !== 'vehiculo' && ins === 0;
  },

  renderDonutSVG(score, size) {
    var s = Math.max(0, Math.min(100, Number(score) || 0));
    var r = 46;
    var c = 2 * Math.PI * r;
    var offset = c - (c * s) / 100;
    var color = s >= 70 ? '#1D9E75' : s >= 40 ? '#EF9F27' : '#E24B4A';
    var w = size || 100;
    return (
      '<svg viewBox="0 0 110 110" width="' + w + '" height="' + w + '" class="dash-donut-svg" aria-hidden="true">' +
      '<circle cx="55" cy="55" r="' + r + '" fill="none" stroke="#E1F5EE" stroke-width="9"/>' +
      '<circle cx="55" cy="55" r="' + r + '" fill="none" stroke="' + color +
      '" stroke-width="9" stroke-dasharray="' + c.toFixed(2) +
      '" stroke-dashoffset="' + offset.toFixed(2) +
      '" stroke-linecap="round" transform="rotate(-90 55 55)"/>' +
      '<text x="55" y="50" text-anchor="middle" font-size="26" font-weight="600" fill="currentColor">' + Math.round(s) + '</text>' +
      '<text x="55" y="66" text-anchor="middle" font-size="10" fill="var(--text-tertiary)">de 100</text></svg>'
    );
  },

  renderBarrasHorizontales(items, mensajeVacio) {
    var self = this;
    var msgDefault = 'Sin novedades en el período';
    if (!items || !items.length) {
      return '<p class="dash-muted">' + self._escape(mensajeVacio || msgDefault) + '</p>';
    }
    var max = Math.max.apply(null, items.map(function (i) { return i.cantidad || 0; }));
    if (max <= 0) max = 1;
    var colores = { bloqueo: '#E24B4A', alerta: '#EF9F27', informativo: '#85B7EB' };
    var html = '<div class="dash-bar-list">';
    items.forEach(function (it) {
      var pct = Math.round(((it.cantidad || 0) / max) * 100);
      var col = colores[it.severidad_predominante] || colores.informativo;
      html += '<div class="dash-bar-row">' +
        '<span class="dash-bar-lab">' + self._escape(self.capitalizarNombre(it.item || '')) + '</span>' +
        '<div class="dash-bar-trk"><div class="dash-bar-fill" style="width:' + pct + '%;background:' + col +
        '"><span>' + (it.cantidad || 0) + '</span></div></div></div>';
    });
    html += '</div>';
    return html;
  },

  _textoHeroIndice(score, incidentes) {
    var n = incidentes != null ? incidentes : 0;
    var suf = n > 0
      ? ' Se detectaron y resolvieron ' + n + ' situación' + (n !== 1 ? 'es' : '') +
        ' de riesgo antes de que algún equipo saliera a operar.'
      : '';
    if (score >= 80) return 'La operación funciona en condiciones seguras.' + suf;
    if (score >= 60) return 'La operación tiene áreas de mejora. Revise las situaciones destacadas y el cumplimiento de inspecciones.' + suf;
    return 'Se requiere atención inmediata: priorice resolver bloqueos pendientes y documentación vencida.' + suf;
  },

  async render() {
    var main = document.getElementById('main');
    if (!main) return;
    this._container = main;

    if (this.chartNovedades) {
      try { this.chartNovedades.destroy(); } catch (e) { /* noop */ }
      this.chartNovedades = null;
    }

    main.innerHTML =
      '<div class="dashboard-wrap">' +
      '<div class="dash-load-banner" id="met-load-banner" style="display:none">Cargando…</div>' +
      '<div class="dash-header"><div class="dash-header-text">' +
      '<p class="dash-header-sub">Métricas — vista comercial</p>' +
      '<p class="dash-header-title" id="met-title-main">—</p></div></div>' +
      '<div class="dash-tabs" id="met-tabs">' +
      '<button type="button" class="dash-tab active" data-tab="operativa">Operativa</button>' +
      '<button type="button" class="dash-tab" data-tab="financiera">Financiera</button>' +
      '<button type="button" class="dash-tab" data-tab="activos">Activos</button>' +
      '</div>' +
      '<div id="met-panel-operativa" class="dash-panel active"></div>' +
      '<div id="met-panel-financiera" class="dash-panel"></div>' +
      '<div id="met-panel-activos" class="dash-panel"></div></div>';

    this._bindTabs();
    this.tabActual = 'operativa';

    this._setLoading(true);
    try {
      await Promise.all([this.cargarGeneral(), this.cargarActivos(), this.cargarIndice()]);
    } finally { this._setLoading(false); }

    this._actualizarTituloCabecera();
    this.renderOperativa();
  },

  _setLoading(on) {
    var el = document.getElementById('met-load-banner');
    if (el) el.style.display = on ? 'block' : 'none';
  },

  _actualizarTituloCabecera() {
    var el = document.getElementById('met-title-main');
    if (!el || !this.datos.general) return;
    var g = this.datos.general;
    el.textContent = (g.empresa || '—') + ' — ' + (g.sede || '—');
  },

  _bindTabs() {
    var self = this;
    document.querySelectorAll('#met-tabs .dash-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var t = btn.getAttribute('data-tab');
        if (t) self.cambiarTab(t);
      });
    });
  },

  _mostrarPanel(tab) {
    document.querySelectorAll('[id^="met-panel-"]').forEach(function (el) {
      el.classList.remove('active');
    });
    document.querySelectorAll('#met-tabs .dash-tab').forEach(function (b) {
      b.classList.remove('active');
    });
    var panel = document.getElementById('met-panel-' + tab);
    if (panel) panel.classList.add('active');
    var tb = document.querySelector('#met-tabs .dash-tab[data-tab="' + tab + '"]');
    if (tb) tb.classList.add('active');
  },

  async cambiarTab(tab) {
    this.tabActual = tab;
    this._mostrarPanel(tab);
    if (tab === 'operativa') this.renderOperativa();
    else if (tab === 'financiera') this.renderFinanciera();
    else if (tab === 'activos') {
      this._setLoading(true);
      try {
        if (!this.datos.activos) await this.cargarActivos();
        this.renderActivos();
      } finally { this._setLoading(false); }
    }
  },

  async cargarGeneral() {
    try { this.datos.general = await API.dashboard.seguridadGeneral(this.periodoActual); }
    catch (e) { console.error(e); this.datos.general = null; }
  },

  async cargarActivos() {
    try { this.datos.activos = await API.dashboard.seguridadActivos(this.periodoActual, this.tipoActivoActual); }
    catch (e) { console.error(e); this.datos.activos = null; }
  },

  async cargarIndice() {
    try { this.datos.indice = await API.dashboard.seguridadIndice(); }
    catch (e) { console.error(e); this.datos.indice = null; }
  },

  renderOperativa() {
    var panel = document.getElementById('met-panel-operativa');
    if (!panel) return;

    var indice = (this.datos.general && this.datos.general.indice_seguridad) || (this.datos.indice || {});
    var score = indice.score != null ? indice.score : 0;
    var delta = indice.delta_mes_anterior != null ? indice.delta_mes_anterior : 0;
    var inc = indice.incidentes_prevenidos != null ? indice.incidentes_prevenidos : 0;
    var deltaTxt = (delta >= 0 ? '+' : '') + delta + ' pts vs mes anterior';
    var deltaClass = delta >= 0 ? 'dash-badge dash-badge-ok' : 'dash-badge dash-badge-warn';

    var meses = (this.datos.activos && this.datos.activos.novedades_por_mes) || [];

    panel.innerHTML =
      '<div class="dash-hero">' +
      this.renderDonutSVG(score, 100) +
      '<div class="dash-hero-body">' +
      '<p class="dash-hero-heading">Índice de seguridad operativa</p>' +
      '<p class="dash-hero-desc">' + this._escape(this._textoHeroIndice(score, inc)) + '</p>' +
      '<div class="dash-hero-badges">' +
      '<span class="' + deltaClass + '">' + this._escape(deltaTxt) + '</span>' +
      '<span class="dash-badge dash-badge-info">' + inc + ' incidentes prevenidos</span>' +
      '</div></div></div>' +
      '<p class="dash-section-title">Novedades vs decisión del supervisor</p>' +
      '<div class="dash-chart-legend">' +
      '<span><span class="dash-ld" style="background:#E24B4A"></span>Bloqueos</span>' +
      '<span><span class="dash-ld" style="background:#378ADD"></span>A taller</span>' +
      '<span><span class="dash-ld" style="background:#1D9E75"></span>Autorizados</span></div>' +
      '<div class="dash-chart-wrap"><canvas id="met-chart-novedades" height="220"></canvas></div>';

    this._renderChartNovedades(meses);
  },

  _renderChartNovedades(meses) {
    if (!this._chartDisponible()) { console.warn('Chart.js no disponible'); return; }
    var canvas = document.getElementById('met-chart-novedades');
    if (!canvas) return;

    if (this.chartNovedades) {
      try { this.chartNovedades.destroy(); } catch (e) { /* noop */ }
      this.chartNovedades = null;
    }

    var labels = (meses || []).map(function (m) { return m.mes || ''; });
    var bloqueos = (meses || []).map(function (m) { return m.bloqueos || 0; });
    var taller = (meses || []).map(function (m) { return m.taller || 0; });
    var aut = (meses || []).map(function (m) { return m.autorizados || 0; });

    var tc = this._chartThemeColors();

    if (!window.__ceroMetricasChartThemeHook) {
      window.__ceroMetricasChartThemeHook = true;
      window.addEventListener('cero-theme-changed', function () {
        var M = window.Metricas;
        if (M && document.getElementById('met-chart-novedades')) {
          var da = M.datos && M.datos.activos;
          var ms = da && da.novedades_por_mes;
          if (ms) M._renderChartNovedades(ms);
        }
      });
    }

    this.chartNovedades = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: { labels: labels, datasets: [
        { label: 'Bloqueos', data: bloqueos, backgroundColor: '#E24B4A', borderRadius: 3 },
        { label: 'Taller', data: taller, backgroundColor: '#378ADD', borderRadius: 3 },
        { label: 'Autorizados', data: aut, backgroundColor: '#1D9E75', borderRadius: 3 }
      ]},
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { stacked: true, ticks: { color: tc.ticks }, grid: { color: tc.grid } },
          x: { stacked: true, ticks: { color: tc.ticks }, grid: { display: false } }
        }
      }
    });
  },

  renderFinanciera() {
    var panel = document.getElementById('met-panel-financiera');
    if (!panel) return;
    var kf = (this.datos.general && this.datos.general.kpis_financieros) || {};

    panel.innerHTML =
      '<p class="dash-section-title">Impacto financiero estimado</p>' +
      '<div class="dash-g3 dash-g3-fin">' +
      '<div class="dash-card-mini"><p class="dash-card-label">Ahorro estimado este mes</p>' +
      '<p class="dash-card-value-sm">' + this.formatearPesos(kf.ahorro_estimado_mes) + '</p>' +
      '<p class="dash-card-sub">Sanciones y paradas evitadas</p></div>' +
      '<div class="dash-card-mini"><p class="dash-card-label">Costo diario sin inspeccionar</p>' +
      '<p class="dash-card-value-sm">' + this.formatearPesos(kf.costo_diario_sin_inspeccionar) + '</p>' +
      '<p class="dash-card-sub">Cuadrilla inactiva + sanción</p></div>' +
      '<div class="dash-card-mini"><p class="dash-card-label">Sanciones prevenidas</p>' +
      '<p class="dash-card-value-sm">' + this.formatearPesos(kf.sanciones_prevenidas) + '</p>' +
      '<p class="dash-card-sub">Documentos bloqueados a tiempo</p></div>' +
      '</div>';
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
    var html = '<div class="dash-filter-pills">';
    tipos.forEach(function (x) {
      var on = t === x.id ? ' active' : '';
      var op = x.dim ? ' style="opacity:0.4"' : '';
      html += '<button type="button" class="dash-filter-pill' + on + '" data-tipo="' + x.id + '"' + op + '>' + x.label + '</button>';
    });
    html += '</div>';
    return html;
  },

  _bindFiltroTipo() {
    var self = this;
    document.querySelectorAll('#met-panel-activos .dash-filter-pill').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tipo = btn.getAttribute('data-tipo');
        document.querySelectorAll('#met-panel-activos .dash-filter-pill').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        self.cambiarTipoActivo(tipo);
      });
    });
  },

  async cambiarTipoActivo(tipo) {
    this.tipoActivoActual = tipo || 'todos';
    this._setLoading(true);
    try {
      await this.cargarActivos();
      this.renderActivos();
    } finally { this._setLoading(false); }
  },

  renderActivos() {
    var panel = document.getElementById('met-panel-activos');
    if (!panel) return;

    var d = this.datos.activos;
    var kpRaw = (d && d.kpis) || {};
    var vacioTipo = this._debeMostrarVacioPorTipo(kpRaw);

    var kp = vacioTipo
      ? { inspecciones_periodo: 0, inspecciones_delta: 0, con_novedades: 0, con_novedades_pct: 0,
          bloqueos: 0, bloqueos_resueltos: 0, promedio_dias_fuera_servicio: 0, activo_sube_promedio: '' }
      : kpRaw;

    var items = vacioTipo ? [] : (d && d.items_mas_novedades) || [];
    var atencion = vacioTipo ? [] : (d && d.activos_atencion) || [];
    var reinc = vacioTipo ? [] : (d && d.reincidencia) || [];

    var lblInspecciones = this.periodoActual === 'hoy' ? 'Inspecciones hoy'
                       : this.periodoActual === 'mes' ? 'Inspecciones este mes'
                       : 'Inspecciones esta semana';

    var deltaIns = kp.inspecciones_delta != null ? kp.inspecciones_delta : 0;
    var deltaColor = deltaIns >= 0 ? '#1D9E75' : '#E24B4A';

    var bloqueosSub = vacioTipo ? 'Sin datos para este tipo de activo'
      : ((kp.bloqueos_resueltos || 0) >= (kp.bloqueos || 0) && (kp.bloqueos || 0) > 0
          ? 'Todos resueltos'
          : (kp.bloqueos_resueltos || 0) + ' de ' + (kp.bloqueos || 0) + ' resueltos');

    var placaPeor = kp.activo_sube_promedio || '';
    var promSub = vacioTipo ? '—'
      : placaPeor ? '<span style="color:#D85A30">' + this._escape(this.capitalizarNombre(placaPeor)) + ' sube el promedio</span>'
      : 'Sin outliers destacados';

    panel.innerHTML =
      this._filtroTipoHtml() +
      '<div class="dash-g4">' +
      '<div class="dash-card"><p class="dash-card-label">' + lblInspecciones + '</p>' +
      '<p class="dash-card-value">' + (kp.inspecciones_periodo || 0) + '</p>' +
      '<p class="dash-card-sub" style="color:' + deltaColor + '">' + (deltaIns >= 0 ? '+' : '') + deltaIns + '% vs anterior</p></div>' +
      '<div class="dash-card"><p class="dash-card-label">Con novedades</p>' +
      '<p class="dash-card-value">' + (kp.con_novedades || 0) + '</p>' +
      '<p class="dash-card-sub">' + (kp.con_novedades_pct || 0) + '% del total</p></div>' +
      '<div class="dash-card"><p class="dash-card-label">Bloqueos</p>' +
      '<p class="dash-card-value" style="color:#E24B4A">' + (kp.bloqueos || 0) + '</p>' +
      '<p class="dash-card-sub">' + bloqueosSub + '</p></div>' +
      '<div class="dash-card"><p class="dash-card-label">Prom. días fuera servicio</p>' +
      '<p class="dash-card-value">' + (kp.promedio_dias_fuera_servicio != null ? kp.promedio_dias_fuera_servicio : '0') + '</p>' +
      '<p class="dash-card-sub">' + promSub + '</p></div>' +
      '</div>' +
      '<p class="dash-section-title">Ítems con más novedades</p>' +
      this.renderBarrasHorizontales(items, vacioTipo ? 'Sin datos para este tipo de activo' : null) +
      '<p class="dash-section-title">Activos que requieren atención</p>' +
      this._htmlActivosAtencion(atencion, vacioTipo) +
      '<p class="dash-section-title">Reincidencia</p>' +
      '<p class="dash-section-sub">Misma novedad 2+ veces en 90 días</p>' +
      this._htmlReincidencia(reinc, vacioTipo);

    this._bindFiltroTipo();
  },

  _htmlActivosAtencion(list, vacioTipo) {
    var self = this;
    if (vacioTipo) return '<p class="dash-muted">Sin datos para este tipo de activo</p>';
    if (!list.length) return '<p class="dash-muted">Ningún activo requiere atención urgente en este momento.</p>';
    var html = '';
    list.forEach(function (a) {
      var dias = a.dias_taller != null ? a.dias_taller : 0;
      var border = '#EF9F27';
      if (dias > 15 || (a.alertas || []).some(function (x) { return /vencid/i.test(x); })) border = '#E24B4A';
      else if (dias > 7) border = '#EF9F27';
      var badges = (a.alertas || []).map(function (al) {
        var cls = /vencid|Bloqueado|crít/i.test(al) ? 'dash-badge dash-badge-danger' : 'dash-badge dash-badge-warn';
        return '<span class="' + cls + '">' + self._escape(al) + '</span>';
      }).join('');
      html += '<div class="dash-alert-row" style="border-left:3px solid ' + border + '">' +
        '<div><span class="dash-placa">' + self._escape(a.codigo) + '</span>' +
        '<span class="dash-nombre-activo">' + self._escape(self.capitalizarNombre(a.nombre || '')) + '</span></div>' +
        '<div class="dash-badge-row">' + badges +
        (dias > 0 ? '<span class="dash-badge dash-badge-warn">' + dias + 'd taller</span>' : '') +
        '</div></div>';
    });
    return html;
  },

  _htmlReincidencia(list, vacioTipo) {
    var self = this;
    if (vacioTipo) return '<p class="dash-muted">Sin datos para este tipo de activo</p>';
    if (!list.length) return '<p class="dash-muted">Sin reincidencias detectadas</p>';
    var html = '';
    list.forEach(function (r) {
      var border = r.veces >= 3 ? '#E24B4A' : '#EF9F27';
      var badgeClass = r.veces >= 3 ? 'dash-badge dash-badge-danger' : 'dash-badge dash-badge-warn';
      var dias = r.periodo_dias != null ? r.periodo_dias : 90;
      html += '<div class="dash-alert-row" style="border-left:3px solid ' + border + '">' +
        '<div><span class="dash-placa">' + self._escape(r.codigo) + '</span>' +
        '<span class="dash-nombre-activo">' + self._escape(self.capitalizarNombre(r.item || '')) + '</span></div>' +
        '<span class="' + badgeClass + '">' + r.veces + '× / ' + dias + 'd</span></div>';
    });
    return html;
  }
};
