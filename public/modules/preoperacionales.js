const PreopAPI = {
  async listar(filtros) {
    var params = {};
    if (filtros.desde) params.desde = filtros.desde;
    if (filtros.hasta) params.hasta = filtros.hasta;
    if (filtros.placa) params.placa = filtros.placa;
    if (filtros.conductor) params.conductor = filtros.conductor;
    if (filtros.estado && filtros.estado !== 'todos') params.estado = filtros.estado;
    
    return API.preoperacionales.listar(params);
  },
  async obtener(id) {
    return API.preoperacionales.obtener(id);
  },
  async decidir(autorizacionId, decision, justificacion) {
    return API.put('/autorizaciones/' + autorizacionId + '/decidir', {
      decision: decision,
      justificacion: justificacion,
      supervisor_id: null
    });
  }
};

const PreopLogic = {
  filtrarData(data, estadoFiltro, placaFiltro) {
    let filtrada = data;
    if (placaFiltro) {
      filtrada = filtrada.filter(item => {
        const codigo = item.activos?.codigo || item.activo_codigo || '';
        const placa = item.activos?.placa || item.activo_placa || '';
        return codigo.toUpperCase().includes(placaFiltro) || placa.toUpperCase().includes(placaFiltro);
      });
    }
    return filtrada;
  },

  badgeClasificacion(clasificacion) {
    var badges = {
      'sin_novedades': { texto: 'OK', tipo: 'success' },
      'con_novedades': { texto: 'NOVEDAD', tipo: 'warning' },
      'critico': { texto: 'CRÍTICO', tipo: 'danger' }
    };
    var b = badges[clasificacion] || { texto: clasificacion || '—', tipo: 'neutral' };
    return Badge.render(b.texto, b.tipo);
  },

  drawerInfoCard(label, valor, sub) {
    return '<div class="drawer-info-card">' +
           '<div class="text-xs text-secondary">' + label + '</div>' +
           '<div class="font-medium">' + Utils.escaparHTML(valor || '—') + '</div>' +
           (sub ? '<div class="text-xs text-secondary">' + Utils.escaparHTML(sub) + '</div>' : '') +
           '</div>';
  },

  /**
   * Badge según severidad real de la novedad. Sin severidad: respaldo por critico (datos antiguos).
   */
  badgeHtmlNovedad(n) {
    var sev = (n.severidad && String(n.severidad).toLowerCase()) || '';
    if (sev === 'alerta') {
      return '<span class="badge badge-warning">ALERTA</span>';
    }
    if (sev === 'bloqueo') {
      return '<span class="badge badge-danger">BLOQUEO</span>';
    }
    if (sev === 'informativo') {
      return '<span class="badge badge-info">INFORMATIVO</span>';
    }
    if (n.critico === true) {
      return '<span class="badge badge-danger">CRÍTICO</span>';
    }
    return '<span class="badge badge-warning">ATENCIÓN</span>';
  },

  /** Novedades que requieren flujo de supervisor (bloqueo o legado por critico). */
  esNovedadBloqueoSupervisor(n) {
    if (n.severidad === 'bloqueo') return true;
    if (n.severidad == null && n.critico === true) return true;
    return false;
  }
};

const PreopRender = {
  stats(dataLength, stats) {
    var s = stats || {};
    return Card.statsGrid([
      { label: 'Inspecciones hoy', value: s.hoy || 0, type: (s.hoy || 0) > 0 ? 'success' : null },
      { label: 'Con novedades', value: s.con_novedades_hoy || 0, type: (s.con_novedades_hoy || 0) > 0 ? 'warning' : null },
      { label: 'Críticas', value: s.criticas_hoy || 0, type: (s.criticas_hoy || 0) > 0 ? 'danger' : null },
      { label: 'Mostrando', value: dataLength, suffix: 'registros' }
    ]);
  },

  tabla(data) {
    return Table.render({
      columns: [
        {
          key: 'fecha', label: 'Fecha / Hora', width: '130px',
          render: function (_, row) {
            var f = Utils.formatearFecha(row.fecha);
            var h = row.hora ? row.hora.substring(0, 5) : '';
            return '<span class="font-medium">' + f + '</span>' +
                   (h ? '<br><span class="text-xs text-secondary">' + h + '</span>' : '');
          }
        },
        {
          key: 'activo_codigo', label: 'Código/Placa', width: '90px',
          render: function (_, row) { 
            var ident = row.activos ? (row.activos.placa || row.activos.codigo) : (row.activo_placa || row.activo_codigo || '—');
            return '<span class="font-medium">' + Utils.escaparHTML(ident || '—') + '</span>'; 
          }
        },
        {
          key: 'activo', label: 'Activo', mobileHidden: true,
          render: function (_, row) {
            var nombre = row.activos ? row.activos.nombre : (row.activo_nombre || '—');
            return Utils.escaparHTML(nombre || '—');
          }
        },
        {
          key: 'conductor_nombre', label: 'Conductor', mobileHidden: true,
          render: function (v) { return Utils.escaparHTML(v || '—'); }
        },
        {
          key: 'kilometraje', label: 'Km', width: '90px', mobileHidden: true,
          render: function (v) { return Utils.formatearNumero(v); }
        },
        {
          key: 'total_novedades', label: 'Novedades', width: '90px', mobileHidden: true,
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
          key: 'clasificacion', label: 'Estado', width: '110px',
          render: function (v) { return PreopLogic.badgeClasificacion(v); }
        },
        {
          key: 'acciones', label: '', width: '60px',
          render: function (_, row) {
            return '<button class="btn btn-sm btn-secondary" onclick="Preoperacionales.abrirDetalle(\'' + row.id + '\')">Ver</button>';
          }
        }
      ],
      data: data,
      sticky: true,
      rowClass: function (row) { return row.clasificacion === 'critico' ? 'row-danger' : ''; },
      emptyMessage: 'No hay inspecciones para los filtros seleccionados'
    });
  },

  drawerContent(registro) {
    var conductorNombre = registro.conductores ? registro.conductores.nombre : '—';
    var conductorCedula = registro.conductores ? registro.conductores.cedula : '';
    var activoInfo = registro.activos ? registro.activos.nombre : '';
    var activoIdent = registro.activos ? (registro.activos.placa || registro.activos.codigo) : '—';
    var fechaFormateada = Utils.formatearFecha(registro.fecha);
    var hora = registro.hora ? registro.hora.substring(0, 5) : '';

    var html = '<div class="drawer-info-grid">';
    html += PreopLogic.drawerInfoCard('Conductor', conductorNombre, conductorCedula ? 'CC ' + conductorCedula : '');
    html += PreopLogic.drawerInfoCard('Fecha', fechaFormateada, hora);
    
    var unidadMedicion = registro.horometro != null ? 'horas' : 'km';
    var valorMedicion = registro.horometro != null ? registro.horometro : registro.kilometraje;
    html += PreopLogic.drawerInfoCard(unidadMedicion === 'horas' ? 'Horómetro' : 'Kilómetros', 
      Utils.formatearNumero(valorMedicion), 
      registro.diferencia_km != null ? '(+' + Utils.formatearNumero(registro.diferencia_km) + ' ' + unidadMedicion + ')' : ''
    );
    
    html += PreopLogic.drawerInfoCard('Activo', activoIdent, activoInfo);
    html += '</div>';

    var novedades = registro.novedades || [];
    if (novedades.length > 0) {
      html += '<div class="drawer-section">';
      html += '<div class="drawer-section-title"><span class="section-title-bar danger"></span>Novedades (' + novedades.length + ')</div>';
      novedades.forEach(function (n) {
        var badgeHtml = PreopLogic.badgeHtmlNovedad(n);
        var estiloCritica = PreopLogic.esNovedadBloqueoSupervisor(n);
        html += '<div class="drawer-novedad ' + (estiloCritica ? 'critica' : '') + '">';
        html += '<div class="flex items-center justify-between"><span class="font-medium">' + Utils.escaparHTML(n.item || n.grupo || '—') + '</span>' + badgeHtml + '</div>';
        if (n.nota) html += '<div class="text-sm text-secondary mt-sm">' + Utils.escaparHTML(n.nota) + '</div>';
        if (n.estado) html += '<div class="text-xs text-secondary mt-sm">Estado: ' + Utils.escaparHTML(n.estado) + '</div>';
        html += '</div>';
      });
      html += '</div>';
    } else {
      html += '<div class="drawer-section"><div class="drawer-all-ok">✓ Sin novedades — inspección limpia</div></div>';
    }

    var autorizacion = registro.autorizacion || null;
    var novedadesBloqueo = novedades.filter(function(n) { return PreopLogic.esNovedadBloqueoSupervisor(n); });

    if (novedadesBloqueo.length > 0 && autorizacion) {
      html += '<div class="drawer-section">';
      html += '<div class="drawer-section-title"><span class="section-title-bar danger"></span>Decisión del supervisor</div>';
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
        var autId = Utils.escaparHTML(String(autorizacion.id));
        var ident = Utils.escaparHTML(activoIdent);
        html += '<div style="display:flex;gap:var(--spacing-sm);">';
        html += '<button class="btn btn-success btn-sm" onclick="Preoperacionales.abrirModalAutorizar(\'' + autId + '\', \'' + ident + '\')">Autorizar</button>';
        html += '<button class="btn btn-warning btn-sm" onclick="Preoperacionales.decidirPreop(\'' + autId + '\', \'taller\', \'' + ident + '\')">Taller</button>';
        html += '<button class="btn btn-danger btn-sm" onclick="Preoperacionales.decidirPreop(\'' + autId + '\', \'restringir\', \'' + ident + '\')">Restringir</button>';
        html += '</div>';
      } else {
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

    var respuestas = registro.respuestas || {};
    var gruposIds = Object.keys(respuestas);

    if (gruposIds.length > 0) {
      html += '<div class="drawer-section"><div class="drawer-section-title">Bloques de inspección</div>';
      
      gruposIds.forEach(function(grupoId) {
        var datos = respuestas[grupoId];
        // Preferir nombre_grupo persistido en backend (Fix bloques UUID vs nombre)
        var nombreGrupo = datos.nombre_grupo || datos.nombre || datos.grupo || grupoId;
        var tieneNovedad = datos.estado && datos.estado.toUpperCase() !== 'OK';
        
        var iconBloque = tieneNovedad ? '⚠️' : '✓';
        var claseBloque = tieneNovedad ? 'drawer-bloque con-novedad' : 'drawer-bloque';

        html += '<div class="' + claseBloque + '">';
        html += '<div class="drawer-bloque-header" onclick="Preoperacionales.toggleBloque(this)">';
        html += '<span>' + iconBloque + ' ' + Utils.escaparHTML(nombreGrupo) + '</span><span class="drawer-bloque-arrow">▸</span>';
        html += '</div><div class="drawer-bloque-items" style="display:none;">';

        if (datos && datos.items && Array.isArray(datos.items) && datos.items.length > 0) {
          datos.items.forEach(function (item) {
            var esOk = !item.estado || item.estado.toUpperCase() === 'OK' || item.estado === 'Bueno';
            var claseItem = esOk ? 'text-success' : 'text-warning font-medium';
            html += '<div class="drawer-bloque-item"><span>' + Utils.escaparHTML(item.nombre || '—') + '</span><span class="' + claseItem + '">' + Utils.escaparHTML(item.estado || 'OK') + '</span></div>';
          });
        } else if (datos && datos.estado === 'ok') {
          html += '<div class="drawer-bloque-item"><span class="text-secondary">Todo OK — sin detalles individuales</span></div>';
        } else {
          html += '<div class="drawer-bloque-item"><span class="text-secondary">Sin datos</span></div>';
        }
        html += '</div></div>';
      });
      html += '</div>';
    }

    if (registro.observaciones) {
      html += '<div class="drawer-section"><div class="drawer-section-title">Observaciones</div><div class="drawer-observacion">' + Utils.escaparHTML(registro.observaciones) + '</div></div>';
    }
    
    if (registro.pdf_url) {
      html += '<div class="drawer-section"><a href="' + Utils.escaparHTML(registro.pdf_url) + '" target="_blank" class="btn btn-primary" style="width:100%;text-align:center;">📄 Ver PDF del preoperacional</a></div>';
    }
    
    if (registro.firma_operario) {
      html += '<div class="drawer-section"><div class="drawer-firma">✓ Firmado digitalmente — ' + (registro.firma_timestamp ? Utils.formatearFecha(registro.firma_timestamp) : '') + '</div></div>';
    }

    return html;
  }
};

const Preoperacionales = {
  data: [],
  stats: {},
  filtros: { desde: '', hasta: '', placa: '', estado: 'todos' },
  detalleActual: null,

  async render() {
    var hoy = fechaHoyBogota();
    var d7p = new Date(hoy + 'T00:00:00');
    d7p.setDate(d7p.getDate() - 6);
    var hace7dias = d7p.toISOString().split('T')[0];
    this.filtros.desde = this.filtros.desde || hace7dias;
    this.filtros.hasta = this.filtros.hasta || hoy;

    var main = document.getElementById('main');
    main.innerHTML = `
      <div class="main-header">
        <div>
          <h1 class="main-title">Preoperacionales</h1>
          <p class="main-subtitle">Historial de inspecciones diarias</p>
        </div>
      </div>
      <div class="main-content">
        <div id="preop-stats"></div>
        <div id="preop-filters"></div>
        <div id="preop-tabla"></div>
      </div>
    `;

    Filters.render({
      containerId: 'preop-filters',
      onFilterChange: (key, value) => {
        if (key === 'desde') this.filtros.desde = value;
        if (key === 'hasta') this.filtros.hasta = value;
        if (key === 'busqueda') this.filtros.placa = value;
        if (key === 'estado') this.filtros.estado = value;
        
        if (key === 'busqueda') {
          this.renderUIOnly();
        } else {
          this.cargarDatos();
        }
      },
      defaultState: this.filtros.estado,
      dateValues: { desde: this.filtros.desde, hasta: this.filtros.hasta, busqueda: this.filtros.placa },
      searchPlaceholder: 'Placa...',
      states: [
        { value: 'todos', label: 'Todas', colorClass: 'btn-primary' },
        { value: 'sin_novedades', label: 'Sin novedades', colorClass: 'btn-success' },
        { value: 'con_novedades', label: 'Con novedades', colorClass: 'btn-warning' },
        { value: 'critico', label: 'Críticas', colorClass: 'btn-danger' }
      ]
    });

    await this.cargarDatos();
  },

  async cargarDatos() {
    try {
      var resp = await PreopAPI.listar(this.filtros);
      this.data = resp.data || [];
      this.stats = resp.stats || {};
      this.renderUIOnly();
    } catch (error) {
      console.error('Error cargando preoperacionales:', error);
      this.data = [];
      this.stats = {};
      this.renderUIOnly();
      if (window.Toast) Toast.error('Error cargando inspecciones');
    }
  },

  renderUIOnly() {
    var dataFiltrada = PreopLogic.filtrarData(this.data, this.filtros.estado, this.filtros.placa);
    var statsContainer = document.getElementById('preop-stats');
    var tablaContainer = document.getElementById('preop-tabla');
    
    if (statsContainer) statsContainer.innerHTML = PreopRender.stats(dataFiltrada.length, this.stats);
    if (tablaContainer) tablaContainer.innerHTML = PreopRender.tabla(dataFiltrada);
  },

  async abrirDetalle(id) {
    Drawer.setLoading('Cargando detalle...');
    try {
      var resp = await PreopAPI.obtener(id);
      this.detalleActual = resp;
      Drawer.open({
        title: Utils.escaparHTML(resp.activos ? (resp.activos.placa || resp.activos.codigo) : 'Detalle'),
        content: PreopRender.drawerContent(resp),
        width: '780px'
      });
    } catch (error) {
      console.error('Error cargando detalle:', error);
      Drawer.open({ title: 'Error', content: '<div style="padding:40px;text-align:center;"><span class="text-danger">Error al cargar el detalle</span></div>' });
    }
  },

  toggleBloque(header) {
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

  abrirModalAutorizar(autorizacionId, placa) {
    Modal.open({
      title: 'Autorizar salida — ' + Utils.escaparHTML(placa),
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

  actualizarBtnAutorizar() {
    var textarea = document.getElementById('preop-modal-justificacion');
    var btn = document.getElementById('preop-btn-confirmar-autorizar');
    var chars = document.getElementById('preop-modal-chars');
    if (!textarea || !btn) return;
    var len = textarea.value.trim().length;
    if (chars) chars.textContent = len + ' / mín 10 caracteres';
    btn.disabled = len < 10;
  },

  async confirmarAutorizar(autorizacionId) {
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

  async decidirPreop(autorizacionId, decision, placa) {
    var textos = {
      taller: { title: '¿Enviar a taller?', msg: 'El activo pasará a estado "En taller".' },
      restringir: { title: '¿Restringir operación?', msg: 'El activo quedará restringido de operar.' }
    };
    var t = textos[decision] || { title: 'Confirmar decisión', msg: '' };
    var confirmado = await Modal.confirm({
      title: t.title,
      message: t.msg,
      confirmText: 'Confirmar',
      cancelText: 'Cancelar',
      type: decision === 'restringir' ? 'danger' : 'primary'
    });
    if (!confirmado) return;
    await this._ejecutarDecisionPreop(autorizacionId, decision, '');
  },

  async _ejecutarDecisionPreop(autorizacionId, decision, justificacion) {
    try {
      await PreopAPI.decidir(autorizacionId, decision, justificacion);
      if (window.Toast) Toast.success('Decisión registrada correctamente');
      if (this.detalleActual && this.detalleActual.id) {
        await this.abrirDetalle(this.detalleActual.id);
      }
    } catch (error) {
      if (window.Toast) Toast.error(error.message || 'Error al registrar decisión');
    }
  }
};

window.Preoperacionales = Preoperacionales;
