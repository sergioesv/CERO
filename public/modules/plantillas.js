// ═══════════════════════════════════════════════════════════
// CERO — Módulo Plantillas de Inspección
// ═══════════════════════════════════════════════════════════

const PlantillasModule = {
  data: [],
  plantillaActual: null,

  async render() {
    const main = document.getElementById('main');
    main.innerHTML = `
      <div class="main-header">
        <div>
          <h1 class="main-title">Plantillas de Inspección</h1>
          <p class="main-subtitle">Gestión de plantillas dinámicas para preoperacionales</p>
        </div>
        <button class="btn btn-primary" onclick="PlantillasModule.abrirModalPlantilla()">+ Nueva Plantilla</button>
      </div>
      <div class="main-content">
        <div id="plantillas-tabla"></div>
      </div>
    `;
    await this.cargarDatos();
  },

  async cargarDatos() {
    try {
      this.data = await API.plantillas.listar();
      this.renderTabla();
    } catch (error) {
      console.error('Error cargando plantillas:', error);
      if (window.Toast) Toast.error('Error cargando plantillas');
    }
  },

  renderTabla() {
    const container = document.getElementById('plantillas-tabla');
    if (!container) return;

    container.innerHTML = Table.render({
      columns: [
        { 
          key: 'nombre', 
          label: 'Nombre', 
          render: v => `<span class="font-medium">${Utils.escaparHTML(v)}</span>` 
        },
        { 
          key: 'tipo_activo', 
          label: 'Tipo Activo', 
          render: v => Utils.escaparHTML(v || 'General') 
        },
        { 
          key: 'estado', 
          label: 'Estado', 
          width: '100px',
          render: v => Badge.render(v === 'activa' ? 'Activa' : 'Inactiva', v === 'activa' ? 'success' : 'neutral') 
        },
        {
          key: 'acciones', 
          label: '', 
          width: '200px',
          render: (_, row) => `
            <div style="display:flex;gap:4px;justify-content:flex-end;">
              <button class="btn btn-sm btn-primary" onclick="PlantillasModule.abrirConstructor('${row.id}')">Constructor</button>
              <button class="btn btn-sm btn-secondary" onclick="PlantillasModule.abrirModalPlantilla('${row.id}')">Editar</button>
            </div>
          `
        }
      ],
      data: this.data,
      sticky: true,
      emptyMessage: 'No hay plantillas registradas.'
    });
  },

  // ─────────────────────────────────────────────────────────
  // CRUD PLANTILLA BÁSICA
  // ─────────────────────────────────────────────────────────

  abrirModalPlantilla(id = null) {
    const plantilla = id ? this.data.find(p => p.id === id) : null;
    const esNuevo = !plantilla;

    Modal.open({
      title: esNuevo ? 'Nueva Plantilla' : 'Editar Plantilla',
      content: `
        <div class="form-group">
          <label class="label">Nombre de la Plantilla *</label>
          <input type="text" id="plantilla-nombre" class="input" value="${plantilla ? Utils.escaparHTML(plantilla.nombre) : ''}" placeholder="Ej: Preoperacional Livianos">
        </div>
        <div class="form-group">
          <label class="label">Tipo de Activo Relacionado</label>
          <input type="text" id="plantilla-tipo" class="input" value="${plantilla ? Utils.escaparHTML(plantilla.tipo_activo || '') : ''}" placeholder="Ej: Camioneta, Moto, etc.">
        </div>
        <div class="form-group">
          <label class="label">Estado</label>
          <select id="plantilla-estado" class="input">
            <option value="activa" ${plantilla && plantilla.estado === 'activa' ? 'selected' : ''}>Activa</option>
            <option value="inactiva" ${plantilla && plantilla.estado === 'inactiva' ? 'selected' : ''}>Inactiva</option>
          </select>
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
        <button class="btn btn-primary" onclick="PlantillasModule.guardarPlantilla('${id || ''}')">Guardar</button>
      `
    });
  },

  async guardarPlantilla(id) {
    const nombre = document.getElementById('plantilla-nombre').value.trim();
    const tipo = document.getElementById('plantilla-tipo').value.trim();
    const estado = document.getElementById('plantilla-estado').value;

    if (!nombre) return Toast.error('El nombre es obligatorio');

    const data = { nombre, tipo_activo: tipo, estado };

    try {
      if (id) {
        await API.plantillas.actualizar(id, data);
        Toast.success('Plantilla actualizada');
      } else {
        await API.plantillas.crear(data);
        Toast.success('Plantilla creada');
      }
      Modal.close();
      this.cargarDatos();
    } catch (e) {
      Toast.error('Error guardando plantilla');
    }
  },

  // ─────────────────────────────────────────────────────────
  // CONSTRUCTOR DE GRUPOS E ÍTEMS (DRAWER)
  // ─────────────────────────────────────────────────────────

  async abrirConstructor(id) {
    Drawer.setLoading('Cargando estructura...');
    try {
      this.plantillaActual = await API.plantillas.obtener(id);
      this.renderConstructorDrawer();
    } catch (e) {
      Drawer.open({ title: 'Error', content: '<p class="text-danger">Error cargando plantilla.</p>' });
    }
  },

  renderConstructorDrawer() {
    const p = this.plantillaActual;
    const grupos = p.grupos || [];

    let html = `
      <div style="margin-bottom:var(--spacing-lg);">
        <p class="text-secondary text-sm">Gestiona los grupos e ítems de inspección para esta plantilla.</p>
        <button class="btn btn-sm btn-primary mt-sm" onclick="PlantillasModule.modalGrupo()">+ Añadir Grupo</button>
      </div>
      <div class="constructor-grupos">
    `;

    if (grupos.length === 0) {
      html += '<p class="text-tertiary text-sm text-center" style="padding:20px;">No hay grupos configurados. Añade uno para empezar.</p>';
    } else {
      grupos.forEach((g, index) => {
        html += `
          <div class="drawer-bloque" style="margin-bottom:12px;">
            <div class="drawer-bloque-header" style="background:var(--bg-secondary); border-radius:4px; padding:10px;">
              <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                <span class="font-medium">${index + 1}. ${Utils.escaparHTML(g.nombre)}</span>
                <div style="display:flex; gap:6px;">
                  <button class="btn btn-sm" style="padding:2px 6px;" onclick="PlantillasModule.modalItem('${g.id}')" title="Añadir Ítem">+ Ítem</button>
                  <button class="btn btn-sm" style="padding:2px 6px;" onclick="PlantillasModule.modalGrupo('${g.id}')">✏️</button>
                  <button class="btn btn-sm" style="padding:2px 6px;color:var(--danger-text);" onclick="PlantillasModule.eliminarGrupo('${g.id}')">🗑️</button>
                </div>
              </div>
            </div>
            <div style="padding: 10px 10px 0 10px;">
        `;

        const items = g.items || [];
        if (items.length === 0) {
          html += '<p class="text-xs text-tertiary">Sin ítems</p>';
        } else {
          items.forEach(it => {
            html += `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:6px;border-bottom:1px solid var(--border-primary);">
                <span class="text-sm">${Utils.escaparHTML(it.nombre)} ${it.critico ? '<span class="badge badge-danger text-xs">CRÍTICO</span>' : ''}</span>
                <div style="display:flex;gap:4px;">
                  <button class="btn btn-sm" style="padding:2px 6px;font-size:10px;" onclick="PlantillasModule.modalItem('${g.id}', '${it.id}')">✏️</button>
                  <button class="btn btn-sm" style="padding:2px 6px;font-size:10px;color:var(--danger-text);" onclick="PlantillasModule.eliminarItem('${it.id}')">🗑️</button>
                </div>
              </div>
            `;
          });
        }
        html += `</div></div>`;
      });
    }

    html += `</div>`;

    Drawer.open({
      title: `Estructura: ${Utils.escaparHTML(p.nombre)}`,
      content: html,
      width: '600px'
    });
  },

  // ─────────────────────────────────────────────────────────
  // GESTIÓN DE GRUPOS
  // ─────────────────────────────────────────────────────────

  modalGrupo(grupoId = null) {
    let grupo = null;
    if (grupoId && this.plantillaActual.grupos) {
      grupo = this.plantillaActual.grupos.find(g => g.id === grupoId);
    }
    
    Modal.open({
      title: grupo ? 'Editar Grupo' : 'Nuevo Grupo',
      content: `
        <div class="form-group">
          <label class="label">Nombre del Grupo *</label>
          <input type="text" id="grupo-nombre" class="input" value="${grupo ? Utils.escaparHTML(grupo.nombre) : ''}" placeholder="Ej: Motor y Niveles">
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
        <button class="btn btn-primary" onclick="PlantillasModule.guardarGrupo('${grupoId || ''}')">Guardar</button>
      `
    });
  },

  async guardarGrupo(grupoId) {
    const nombre = document.getElementById('grupo-nombre').value.trim();
    if (!nombre) return Toast.error('El nombre es obligatorio');

    try {
      if (grupoId) {
        await API.plantillas.actualizarGrupo(grupoId, { nombre });
      } else {
        await API.plantillas.crearGrupo(this.plantillaActual.id, { nombre, orden: (this.plantillaActual.grupos?.length || 0) + 1 });
      }
      Modal.close();
      Toast.success('Grupo guardado');
      await this.abrirConstructor(this.plantillaActual.id); // Recargar
    } catch (e) {
      Toast.error('Error al guardar grupo');
    }
  },

  async eliminarGrupo(grupoId) {
    if (!await Modal.confirm({ title: '¿Eliminar grupo?', message: 'Se eliminarán también todos sus ítems.', type: 'danger' })) return;
    try {
      await API.plantillas.eliminarGrupo(grupoId);
      Toast.success('Grupo eliminado');
      await this.abrirConstructor(this.plantillaActual.id);
    } catch (e) {
      Toast.error('Error al eliminar grupo');
    }
  },

  // ─────────────────────────────────────────────────────────
  // GESTIÓN DE ÍTEMS
  // ─────────────────────────────────────────────────────────

  modalItem(grupoId, itemId = null) {
    const grupo = this.plantillaActual.grupos.find(g => g.id === grupoId);
    let item = null;
    if (itemId) {
      item = grupo.items.find(i => i.id === itemId);
    }

    Modal.open({
      title: item ? 'Editar Ítem' : 'Nuevo Ítem',
      content: `
        <div class="form-group">
          <label class="label">Nombre del Ítem *</label>
          <input type="text" id="item-nombre" class="input" value="${item ? Utils.escaparHTML(item.nombre) : ''}" placeholder="Ej: Nivel de Aceite">
        </div>
        <div class="form-group" style="display:flex;align-items:center;gap:10px;">
          <input type="checkbox" id="item-critico" ${item && item.critico ? 'checked' : ''}>
          <label for="item-critico" class="label" style="margin:0;cursor:pointer;">Ítem Crítico (Novedad en este ítem bloqueará el vehículo)</label>
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
        <button class="btn btn-primary" onclick="PlantillasModule.guardarItem('${grupoId}', '${itemId || ''}')">Guardar</button>
      `
    });
  },

  async guardarItem(grupoId, itemId) {
    const nombre = document.getElementById('item-nombre').value.trim();
    const critico = document.getElementById('item-critico').checked;

    if (!nombre) return Toast.error('El nombre es obligatorio');

    const grupo = this.plantillaActual.grupos.find(g => g.id === grupoId);

    try {
      if (itemId) {
        await API.plantillas.actualizarItem(itemId, { nombre, critico });
      } else {
        await API.plantillas.crearItem(grupoId, { nombre, critico, orden: (grupo.items?.length || 0) + 1 });
      }
      Modal.close();
      Toast.success('Ítem guardado');
      await this.abrirConstructor(this.plantillaActual.id); // Recargar
    } catch (e) {
      Toast.error('Error al guardar ítem');
    }
  },

  async eliminarItem(itemId) {
    if (!await Modal.confirm({ title: '¿Eliminar ítem?', message: 'Se eliminará el ítem de la plantilla.', type: 'danger' })) return;
    try {
      await API.plantillas.eliminarItem(itemId);
      Toast.success('Ítem eliminado');
      await this.abrirConstructor(this.plantillaActual.id);
    } catch (e) {
      Toast.error('Error al eliminar ítem');
    }
  }
};

window.PlantillasModule = PlantillasModule;
