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
          <h1 class="main-title">Flota de activos</h1>
          <p class="main-subtitle">Gestión de vehículos y equipos</p>
        </div>
        <div class="main-actions">
          <button class="btn btn-primary" onclick="VehiculosFlota.abrirModalNuevo()">+ Agregar activo</button>
        </div>
      </div>
      <div class="main-content">
        <div id="flota-stats"></div>
        <div class="filters-row">
          <div class="search-box">
            <input type="text" class="input input-sm" placeholder="Buscar placa/código..." id="flota-buscar">
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
      const resp = await API.activos.listar();
      this.data = resp.data || resp || [];
    } catch (error) {
      this.data = [];
      Toast.error('Error cargando activos');
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
    
    // Búsqueda por placa o código
    if (this.busqueda) {
      datos = datos.filter(v => 
        (v.placa && v.placa.toLowerCase().includes(this.busqueda.toLowerCase())) ||
        (v.codigo && v.codigo.toLowerCase().includes(this.busqueda.toLowerCase()))
      );
    }
    
    const html = Table.render({
      columns: [
        { key: 'codigo', label: 'Código / Placa', width: '130px', render: (_, row) => row.placa || row.codigo },
        { key: 'nombre', label: 'Nombre', render: (_, row) => row.nombre || '—' },
        { key: 'soat_vencimiento', label: 'SOAT', render: (_, row) => Badge.documento(row.documentos?.soat_vencimiento) },
        { key: 'tecnomecanica_vencimiento', label: 'Tecno', render: (_, row) => Badge.documento(row.documentos?.tecnomecanica_vencimiento) },
        { key: 'estado', label: 'Estado', render: v => this.badgeEstado(v) },
        { key: 'acciones', label: '', width: '80px', render: (_, row) => `
          <button class="btn btn-sm btn-secondary" onclick="VehiculosFlota.editar('${row.id}')">Editar</button>
        ` }
      ],
      data: datos,
      rowClass: row => {
        if (row.estado === 'bloqueado') return 'row-danger';
        if (row.estado === 'retirado') return 'row-muted';
        return '';
      },
      emptyMessage: 'No hay activos registrados'
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
  
  async editar(id) {
    const activo = this.data.find(v => v.id === id);
    if (!activo) return;
    
    Modal.open({
      title: `Editar ${activo.placa || activo.codigo}`,
      size: 'md',
      content: `
        <div class="flex items-center justify-between mb-md">
          ${this.badgeEstado(activo.estado)}
          <div class="flex gap-sm">
            <select class="input input-sm" id="edit-estado" style="width: auto;">
              <option value="operativo" ${activo.estado === 'operativo' ? 'selected' : ''}>Operativo</option>
              <option value="bloqueado" ${activo.estado === 'bloqueado' ? 'selected' : ''}>Bloqueado</option>
              <option value="taller" ${activo.estado === 'taller' ? 'selected' : ''}>En taller</option>
              <option value="retirado" ${activo.estado === 'retirado' ? 'selected' : ''}>Retirado</option>
            </select>
            <button class="btn btn-sm btn-danger" onclick="VehiculosFlota.eliminar('${id}', '${activo.codigo}')">Eliminar</button>
          </div>
        </div>
        <div class="mb-md">
          <label class="text-sm text-secondary">Nombre (ej: Camioneta NHR)</label>
          <input type="text" class="input" id="edit-nombre" value="${activo.nombre || ''}">
        </div>
        <div class="mb-md">
          <label class="text-sm text-secondary">Código / Placa</label>
          <input type="text" class="input" id="edit-codigo" value="${activo.codigo || ''}">
        </div>
        <div class="mb-md">
          <label class="text-sm text-secondary">Marca</label>
          <input type="text" class="input" id="edit-marca" value="${activo.datos?.marca || ''}">
        </div>
        <div class="mb-md">
          <label class="text-sm text-secondary">SOAT vencimiento</label>
          <input type="date" class="input" id="edit-soat" value="${activo.documentos?.soat_vencimiento || ''}">
        </div>
        <div class="mb-md">
          <label class="text-sm text-secondary">Tecnomecánica vencimiento</label>
          <input type="date" class="input" id="edit-tecno" value="${activo.documentos?.tecnomecanica_vencimiento || ''}">
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
        <button class="btn btn-primary" onclick="VehiculosFlota.guardarEdicion('${id}')">Guardar</button>
      `
    });
  },
  
  async guardarEdicion(id) {
    const soat = document.getElementById('edit-soat').value || null;
    const tecno = document.getElementById('edit-tecno').value || null;
    const marca = document.getElementById('edit-marca').value || null;
    
    const data = {
      nombre: document.getElementById('edit-nombre').value,
      codigo: document.getElementById('edit-codigo').value,
      estado: document.getElementById('edit-estado').value,
      datos: { marca },
      documentos: { 
        soat_vencimiento: soat, 
        tecnomecanica_vencimiento: tecno 
      }
    };
    
    try {
      await API.activos.actualizar(id, data);
      Modal.close();
      Toast.success('Activo actualizado');
      await this.cargarDatos();
      this.renderTabla();
      this.renderStats();
    } catch (error) {
      Toast.error(error.message || 'Error al guardar');
    }
  },
  
  async eliminar(id, codigo) {
    const confirmado = await Modal.confirm({
      title: '¿Eliminar activo?',
      message: `Se eliminará permanentemente el activo ${codigo}. Si tiene historial, use "Retirado" en su lugar.`,
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      type: 'danger'
    });
    
    if (confirmado) {
      try {
        await API.activos.eliminar(id);
        Modal.close();
        Toast.success(`Activo ${codigo} eliminado`);
        await this.cargarDatos();
        this.renderTabla();
        this.renderStats();
      } catch (error) {
        Toast.error(error.message || 'Error al eliminar');
      }
    }
  },
  
  abrirModalNuevo() {
    // TODO: Obtener tipos de activos reales de la base de datos
    Modal.open({
      title: 'Agregar activo',
      content: `
        <div class="mb-md">
          <label class="text-sm text-secondary">Tipo de activo *</label>
          <select class="input" id="nuevo-tipo">
            <option value="">Seleccione...</option>
            <option value="vehiculo_liviano">Vehículo Liviano</option>
            <option value="grua">Grúa / Canasta</option>
            <option value="moto">Motocicleta</option>
            <option value="maquina_estatica">Máquina Estática</option>
            <option value="camioneta">Camioneta</option>
          </select>
        </div>
        <div class="mb-md">
          <label class="text-sm text-secondary">Código / Placa *</label>
          <input type="text" class="input" id="nuevo-codigo" placeholder="ABC123" style="text-transform: uppercase;">
        </div>
        <div class="mb-md">
          <label class="text-sm text-secondary">Nombre (ej: Camioneta NHR)</label>
          <input type="text" class="input" id="nuevo-nombre">
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
        <button class="btn btn-primary" onclick="VehiculosFlota.guardarNuevo()">Crear</button>
      `
    });
  },
  
  async guardarNuevo() {
    const codigo = document.getElementById('nuevo-codigo').value.toUpperCase().trim();
    const tipo = document.getElementById('nuevo-tipo').value;
    const nombre = document.getElementById('nuevo-nombre').value;
    
    if (!codigo) { Toast.error('Código requerido'); return; }
    if (!tipo) { Toast.error('Tipo de activo requerido'); return; }
    if (!nombre) { Toast.error('Nombre requerido'); return; }
    
    const data = {
      codigo,
      placa: codigo, // Temporal: asumiendo que el código es la placa para vehículos
      tipo_activo_id: tipo, // NOTA: Backend debe aceptar el código y buscar el UUID
      nombre,
      estado: 'operativo'
    };
    
    try {
      await API.activos.crear(data);
      Modal.close();
      Toast.success('Activo creado');
      await this.cargarDatos();
      this.renderTabla();
      this.renderStats();
    } catch (error) {
      Toast.error(error.message || 'Error al crear vehículo');
    }
  }
};

window.VehiculosFlota = VehiculosFlota;
