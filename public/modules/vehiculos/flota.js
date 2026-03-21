const VehiculosFlota = {
  data: [],
  filtro: 'operativo',
  mostrarRetirados: false,
  busqueda: '',
  
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
            <button class="btn btn-sm ${this.filtro === 'operativo' ? 'btn-primary' : 'btn-secondary'}" onclick="VehiculosFlota.filtrar('operativo')">Operativos</button>
            <button class="btn btn-sm ${this.filtro === 'bloqueado' ? 'btn-warning' : 'btn-secondary'}" onclick="VehiculosFlota.filtrar('bloqueado')">Bloqueados</button>
            <button class="btn btn-sm ${this.filtro === 'taller' ? 'btn-info' : 'btn-secondary'}" onclick="VehiculosFlota.filtrar('taller')">En taller</button>
          </div>
          <label class="flex items-center gap-sm text-sm" style="margin-left: auto;">
            <input type="checkbox" id="mostrar-retirados" ${this.mostrarRetirados ? 'checked' : ''} onchange="VehiculosFlota.toggleRetirados()">
            Mostrar retirados
          </label>
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
    const operativos = this.data.filter(v => v.estado === 'operativo').length;
    const bloqueados = this.data.filter(v => v.estado === 'bloqueado').length;
    const enTaller = this.data.filter(v => v.estado === 'taller').length;
    const retirados = this.data.filter(v => v.estado === 'retirado').length;
    
    document.getElementById('flota-stats').innerHTML = Card.statsGrid([
      { label: 'Operativos', value: operativos, type: 'success' },
      { label: 'Bloqueados', value: bloqueados, type: bloqueados > 0 ? 'danger' : null },
      { label: 'En taller', value: enTaller, type: enTaller > 0 ? 'warning' : null },
      { label: 'Retirados', value: retirados }
    ]);
  },
  
  renderTabla() {
    let datos = [...this.data];
    
    // Filtrar por estado
    if (this.filtro !== 'todos') {
      datos = datos.filter(v => v.estado === this.filtro);
    } else {
      // En "todos" no mostrar retirados a menos que esté marcado
      if (!this.mostrarRetirados) {
        datos = datos.filter(v => v.estado !== 'retirado');
      }
    }
    
    // Ocultar retirados si no está marcado el checkbox
    if (!this.mostrarRetirados && this.filtro !== 'todos') {
      datos = datos.filter(v => v.estado !== 'retirado');
    }
    
    // Búsqueda por placa
    if (this.busqueda) {
      datos = datos.filter(v => v.placa.toLowerCase().includes(this.busqueda.toLowerCase()));
    }
    
    const html = Table.render({
      columns: [
        { key: 'placa', label: 'Placa', width: '100px' },
        { key: 'vehiculo', label: 'Vehículo', render: (_, row) => `${row.marca || ''} ${row.modelo || ''}`.trim() || '—' },
        { key: 'soat_vencimiento', label: 'SOAT', render: v => Badge.documento(v) },
        { key: 'tecnomecanica_vencimiento', label: 'Tecno', render: v => Badge.documento(v) },
        { key: 'estado', label: 'Estado', render: v => this.badgeEstado(v) },
        { key: 'acciones', label: '', width: '80px', render: (_, row) => `
          <button class="btn btn-sm btn-secondary" onclick="VehiculosFlota.editar('${row.placa}')">Editar</button>
        ` }
      ],
      data: datos,
      rowClass: row => {
        if (row.estado === 'bloqueado') return 'row-danger';
        if (row.estado === 'retirado') return 'row-muted';
        return '';
      },
      emptyMessage: 'No hay vehículos'
    });
    
    document.getElementById('flota-tabla').innerHTML = html;
  },
  
  badgeEstado(estado) {
    const estados = {
      'operativo': { texto: 'OK', tipo: 'success' },
      'bloqueado': { texto: 'BLOQ', tipo: 'danger' },
      'taller': { texto: 'TALLER', tipo: 'warning' },
      'retirado': { texto: 'RETIRADO', tipo: 'neutral' }
    };
    const e = estados[estado] || { texto: estado, tipo: 'neutral' };
    return Badge.render(e.texto, e.tipo);
  },
  
  filtrar(filtro) {
    this.filtro = filtro;
    this.renderTabla();
  },
  
  toggleRetirados() {
    this.mostrarRetirados = document.getElementById('mostrar-retirados').checked;
    this.renderTabla();
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
      size: 'md',
      content: `
        <div class="flex items-center justify-between mb-md">
          ${this.badgeEstado(vehiculo.estado)}
          <div class="flex gap-sm">
            <select class="input input-sm" id="edit-estado" style="width: auto;">
              <option value="operativo" ${vehiculo.estado === 'operativo' ? 'selected' : ''}>Operativo</option>
              <option value="bloqueado" ${vehiculo.estado === 'bloqueado' ? 'selected' : ''}>Bloqueado</option>
              <option value="taller" ${vehiculo.estado === 'taller' ? 'selected' : ''}>En taller</option>
              <option value="retirado" ${vehiculo.estado === 'retirado' ? 'selected' : ''}>Retirado</option>
            </select>
            <button class="btn btn-sm btn-danger" onclick="VehiculosFlota.eliminar('${placa}')">Eliminar</button>
          </div>
        </div>
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
      tecnomecanica_vencimiento: document.getElementById('edit-tecno').value || null,
      estado: document.getElementById('edit-estado').value
    };
    
    try {
      await API.vehiculos.actualizar(placa, data);
      Modal.close();
      Toast.success('Vehículo actualizado');
      await this.cargarDatos();
      this.renderTabla();
      this.renderStats();
    } catch (error) {
      Toast.error(error.message || 'Error al guardar');
    }
  },
  
  async eliminar(placa) {
    const confirmado = await Modal.confirm({
      title: '¿Eliminar vehículo?',
      message: `Se eliminará permanentemente el vehículo ${placa}. Si tiene historial, use "Retirado" en su lugar.`,
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      type: 'danger'
    });
    
    if (confirmado) {
      try {
        await API.vehiculos.eliminar(placa);
        Modal.close();
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
      Toast.error(error.message || 'Error al crear vehículo');
    }
  }
};

window.VehiculosFlota = VehiculosFlota;
