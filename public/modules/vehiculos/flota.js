const VehiculosFlota = {
  data: [],
  filtro: 'todos',
  
  async render() {
    const main = document.getElementById('main');
    main.innerHTML = `
      <div class="main-header">
        <div>
          <h1 class="main-title">Flota de vehículos</h1>
          <p class="main-subtitle">Gestión de vehículos registrados</p>
        </div>
        <div class="main-actions">
          <button class="btn btn-primary" onclick="VehiculosFlota.abrirModalNuevo()">+ Agregar vehículo</button>
        </div>
      </div>
      <div class="main-content">
        <div id="flota-stats"></div>
        <div class="filters-row">
          <div class="search-box">
            <input type="text" class="input input-sm" placeholder="Buscar placa..." id="flota-buscar">
          </div>
          <div class="flex gap-sm">
            <button class="btn btn-sm ${this.filtro === 'todos' ? 'btn-primary' : 'btn-secondary'}" onclick="VehiculosFlota.filtrar('todos')">Todos</button>
            <button class="btn btn-sm ${this.filtro === 'activos' ? 'btn-primary' : 'btn-secondary'}" onclick="VehiculosFlota.filtrar('activos')">Activos</button>
            <button class="btn btn-sm ${this.filtro === 'bloqueados' ? 'btn-danger' : 'btn-secondary'}" onclick="VehiculosFlota.filtrar('bloqueados')">Bloqueados</button>
          </div>
        </div>
        <div id="flota-tabla">Cargando...</div>
      </div>
    `;
    
    await this.cargarDatos();
    this.renderStats();
    this.renderTabla();
    
    document.getElementById('flota-buscar').addEventListener('input', Utils.debounce(e => {
      this.buscar(e.target.value);
    }));
  },
  
  async cargarDatos() {
    try {
      const resp = await API.vehiculos.listar();
      this.data = resp.data || resp || [];
    } catch (error) {
      this.data = [];
      Toast.error('Error cargando vehículos');
    }
  },
  
  renderStats() {
    const total = this.data.length;
    const activos = this.data.filter(v => !v.bloqueado).length;
    const bloqueados = this.data.filter(v => v.bloqueado).length;
    
    document.getElementById('flota-stats').innerHTML = Card.statsGrid([
      { label: 'Total vehículos', value: total },
      { label: 'Activos', value: activos, type: 'success' },
      { label: 'Bloqueados', value: bloqueados, type: bloqueados > 0 ? 'danger' : null }
    ]);
  },
  
  renderTabla() {
    let datos = [...this.data];
    
    if (this.filtro === 'activos') datos = datos.filter(v => !v.bloqueado);
    if (this.filtro === 'bloqueados') datos = datos.filter(v => v.bloqueado);
    if (this.busqueda) datos = datos.filter(v => v.placa.toLowerCase().includes(this.busqueda.toLowerCase()));
    
    const html = Table.render({
      columns: [
        { key: 'placa', label: 'Placa', width: '100px' },
        { key: 'vehiculo', label: 'Vehículo', render: (_, row) => `${row.marca || ''} ${row.modelo || ''}`.trim() || '—' },
        { key: 'soat_vencimiento', label: 'SOAT', render: v => Badge.documento(v) },
        { key: 'tecnomecanica_vencimiento', label: 'Tecno', render: v => Badge.documento(v) },
        { key: 'bloqueado', label: 'Estado', render: v => Badge.estadoVehiculo(v) },
        { key: 'acciones', label: '', width: '150px', render: (_, row) => `
          <div class="flex gap-sm">
            <button class="btn btn-sm btn-secondary" onclick="VehiculosFlota.editar('${row.placa}')">Editar</button>
            <button class="btn btn-sm btn-danger" onclick="VehiculosFlota.eliminar('${row.placa}')">Eliminar</button>
          </div>
        ` }
      ],
      data: datos,
      rowClass: row => row.bloqueado ? 'row-danger' : '',
      emptyMessage: 'No hay vehículos'
    });
    
    document.getElementById('flota-tabla').innerHTML = html;
  },
  
  filtrar(filtro) {
    this.filtro = filtro;
    this.render();
  },
  
  buscar(texto) {
    this.busqueda = texto;
    this.renderTabla();
  },
  
  async editar(placa) {
    const vehiculo = this.data.find(v => v.placa === placa);
    if (!vehiculo) return;
    
    Modal.open({
      title: `Editar ${placa}`,
      content: `
        <div class="mb-md">
          <label class="text-sm text-secondary">Marca</label>
          <input type="text" class="input" id="edit-marca" value="${vehiculo.marca || ''}">
        </div>
        <div class="mb-md">
          <label class="text-sm text-secondary">Modelo</label>
          <input type="text" class="input" id="edit-modelo" value="${vehiculo.modelo || ''}">
        </div>
        <div class="mb-md">
          <label class="text-sm text-secondary">SOAT vencimiento</label>
          <input type="date" class="input" id="edit-soat" value="${vehiculo.soat_vencimiento || ''}">
        </div>
        <div class="mb-md">
          <label class="text-sm text-secondary">Tecnomecánica vencimiento</label>
          <input type="date" class="input" id="edit-tecno" value="${vehiculo.tecnomecanica_vencimiento || ''}">
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
        <button class="btn btn-primary" onclick="VehiculosFlota.guardarEdicion('${placa}')">Guardar</button>
      `
    });
  },
  
  async guardarEdicion(placa) {
    const data = {
      marca: document.getElementById('edit-marca').value,
      modelo: document.getElementById('edit-modelo').value,
      soat_vencimiento: document.getElementById('edit-soat').value || null,
      tecnomecanica_vencimiento: document.getElementById('edit-tecno').value || null
    };
    
    try {
      await API.vehiculos.actualizar(placa, data);
      Modal.close();
      Toast.success('Vehículo actualizado');
      await this.cargarDatos();
      this.renderTabla();
      this.renderStats();
    } catch (error) {
      Toast.error('Error al guardar');
    }
  },
  
async eliminar(placa) {
    const confirmado = await Modal.confirm({
      title: '¿Eliminar vehículo?',
      message: `Se eliminará permanentemente el vehículo ${placa}. Esta acción no se puede deshacer.`,
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      type: 'danger'
    });
    
    if (confirmado) {
      try {
        await API.vehiculos.eliminar(placa);
        Toast.success(`Vehículo ${placa} eliminado`);
        await this.cargarDatos();
        this.renderTabla();
        this.renderStats();
      } catch (error) {
        Toast.error(error.message || 'Error al eliminar');
      }
    }
  },
  
  abrirModalNuevo() {
    Modal.open({
      title: 'Agregar vehículo',
      content: `
        <div class="mb-md">
          <label class="text-sm text-secondary">Placa *</label>
          <input type="text" class="input" id="nuevo-placa" placeholder="ABC123" style="text-transform: uppercase;">
        </div>
        <div class="mb-md">
          <label class="text-sm text-secondary">Marca</label>
          <input type="text" class="input" id="nuevo-marca">
        </div>
        <div class="mb-md">
          <label class="text-sm text-secondary">Modelo</label>
          <input type="text" class="input" id="nuevo-modelo">
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
        <button class="btn btn-primary" onclick="VehiculosFlota.guardarNuevo()">Crear</button>
      `
    });
  },
  
  async guardarNuevo() {
    const placa = document.getElementById('nuevo-placa').value.toUpperCase().trim();
    if (!placa) { Toast.error('Placa requerida'); return; }
    
    const data = {
      placa,
      marca: document.getElementById('nuevo-marca').value,
      modelo: document.getElementById('nuevo-modelo').value
    };
    
    try {
      await API.vehiculos.crear(data);
      Modal.close();
      Toast.success('Vehículo creado');
      await this.cargarDatos();
      this.renderTabla();
      this.renderStats();
    } catch (error) {
      Toast.error('Error al crear vehículo');
    }
  }
};

window.VehiculosFlota = VehiculosFlota;
