// =============================================================================
// Módulo Usuarios — Panel web CERO
// Patrón: stats cards + tabla + drawer lateral
// =============================================================================

window.UsuariosModule = (() => {
  // --------------------------------------------------------------------------
  // Estado interno
  // --------------------------------------------------------------------------
  let usuarios       = [];
  let usuarioSeleccionado = null;
  let filtroActivo   = 'todos';
  let rolesCatalogo  = []; // cache de GET /api/roles

  function authHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + (sessionStorage.getItem('cero_token') || '')
    };
  }

  function formatFecha(str) {
    if (!str) return 'Nunca';
    const d = new Date(str);
    return d.toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  // --------------------------------------------------------------------------
  // Punto de entrada
  // --------------------------------------------------------------------------
  function render() {
    const main = document.getElementById('main');
    main.innerHTML = `
      <div class="main-header">
        <div>
          <h1 class="main-title">Usuarios</h1>
          <p class="main-subtitle">Gestión de usuarios del panel</p>
        </div>
        <div class="main-actions">
          <button class="btn btn-primary" onclick="UsuariosModule.abrirNuevo()">+ Nuevo usuario</button>
        </div>
      </div>
      <div class="main-content">
        <div id="usuarios-stats" class="stats-grid"></div>

        <div class="filters-row">
          <div class="search-box">
            <input
              type="text"
              id="usuarios-search"
              class="input input-sm"
              placeholder="Buscar por nombre o email..."
              oninput="UsuariosModule.filtrar()"
            />
          </div>
          <select id="usuarios-filtro" class="input input-sm" onchange="UsuariosModule.filtrar()">
            <option value="todos">Todos</option>
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
          </select>
        </div>

        <div id="usuarios-tabla">
          <table class="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Empresa</th>
                <th>Roles</th>
                <th>Último acceso</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody id="usuarios-tbody">
              <tr><td colspan="6" class="table-empty">Cargando...</td></tr>
            </tbody>
          </table>
        </div>

        <div id="usuario-drawer" class="drawer">
          <div class="drawer-content" id="usuario-drawer-content"></div>
        </div>
        <div id="usuario-overlay" class="drawer-overlay" onclick="UsuariosModule.cerrarDrawer()"></div>
      </div>
    `;

    cargarDatos();
  }

  // --------------------------------------------------------------------------
  // Carga de datos
  // --------------------------------------------------------------------------
  async function cargarDatos() {
    try {
      const [resUsuarios, resRoles] = await Promise.all([
        fetch('/api/usuarios', { headers: authHeaders() }),
        fetch('/api/roles',    { headers: authHeaders() })
      ]);
      const dataU = await resUsuarios.json();
      const dataR = await resRoles.json();
      usuarios      = dataU.data || dataU || [];
      rolesCatalogo = dataR.data || dataR || [];
      renderStats();
      renderTabla(usuarios);
    } catch (err) {
      console.error('Error cargando usuarios:', err);
      const tbody = document.getElementById('usuarios-tbody');
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Error al cargar usuarios</td></tr>';
    }
  }

  // --------------------------------------------------------------------------
  // Stat cards
  // --------------------------------------------------------------------------
  function renderStats() {
    const activos   = usuarios.filter(u => u.activo);
    const inactivos = usuarios.filter(u => !u.activo);

    const el = document.getElementById('usuarios-stats');
    if (!el) return;

    el.innerHTML = `
      <div class="stat-card ${filtroActivo === 'todos'    ? 'active' : ''}" onclick="UsuariosModule.aplicarFiltroCard('todos')">
        <div class="stat-value">${usuarios.length}</div>
        <div class="stat-label">Total usuarios</div>
      </div>
      <div class="stat-card ${filtroActivo === 'activos'  ? 'active' : ''}" onclick="UsuariosModule.aplicarFiltroCard('activos')">
        <div class="stat-value">${activos.length}</div>
        <div class="stat-label">Activos</div>
      </div>
      <div class="stat-card ${filtroActivo === 'inactivos' ? 'active' : ''}" onclick="UsuariosModule.aplicarFiltroCard('inactivos')">
        <div class="stat-value">${inactivos.length}</div>
        <div class="stat-label">Inactivos</div>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // Tabla
  // --------------------------------------------------------------------------
  function renderTabla(lista) {
    const tbody = document.getElementById('usuarios-tbody');
    if (!tbody) return;

    if (!lista || lista.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Sin usuarios para mostrar</td></tr>';
      return;
    }

    tbody.innerHTML = lista.map(u => {
      const rolesTexto = (u.usuarios_roles || [])
        .map(r => r.roles?.nombre)
        .filter(Boolean)
        .join(', ') || '—';

      return `
        <tr class="table-row" onclick="UsuariosModule.abrirDrawer('${u.id}')">
          <td>${u.nombre}</td>
          <td>${u.email}</td>
          <td>${u.empresas?.nombre || '—'}</td>
          <td>${rolesTexto}</td>
          <td>${formatFecha(u.ultimo_acceso)}</td>
          <td>${u.activo
            ? '<span class="badge badge-success">Activo</span>'
            : '<span class="badge badge-danger">Inactivo</span>'
          }</td>
        </tr>
      `;
    }).join('');
  }

  // --------------------------------------------------------------------------
  // Filtro combinado
  // --------------------------------------------------------------------------
  function filtrar() {
    const texto  = (document.getElementById('usuarios-search')?.value || '').toLowerCase();
    const filtro = document.getElementById('usuarios-filtro')?.value || 'todos';

    const lista = usuarios.filter(u => {
      const matchTexto = !texto ||
        u.nombre.toLowerCase().includes(texto) ||
        u.email.toLowerCase().includes(texto);

      let matchFiltro = true;
      if      (filtro === 'activos')   matchFiltro = u.activo;
      else if (filtro === 'inactivos') matchFiltro = !u.activo;

      return matchTexto && matchFiltro;
    });

    renderTabla(lista);
  }

  function aplicarFiltroCard(valor) {
    filtroActivo = valor;
    const select = document.getElementById('usuarios-filtro');
    if (select) select.value = valor;
    renderStats();
    filtrar();
  }

  // --------------------------------------------------------------------------
  // Drawer
  // --------------------------------------------------------------------------
  async function abrirDrawer(id) {
    usuarioSeleccionado = usuarios.find(u => u.id === id);
    if (!usuarioSeleccionado) return;

    const u = usuarioSeleccionado;

    document.getElementById('usuario-drawer-content').innerHTML = `
      <div class="drawer-header">
        <h2 class="drawer-title">${u.nombre}</h2>
        <button class="drawer-close" onclick="UsuariosModule.cerrarDrawer()">✕</button>
      </div>

      <div class="drawer-section">
        <div class="detail-grid">
          <div class="detail-item">
            <span class="detail-label">Nombre</span>
            <span class="detail-value">${u.nombre}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Email</span>
            <span class="detail-value">${u.email}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Empresa</span>
            <span class="detail-value">${u.empresas?.nombre || u.empresa_id || 'Sin registro'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Último acceso</span>
            <span class="detail-value">${formatFecha(u.ultimo_acceso)}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Estado</span>
            <span class="detail-value">
              ${u.activo
                ? '<span class="badge badge-success">Activo</span>'
                : '<span class="badge badge-danger">Inactivo</span>'
              }
            </span>
          </div>
        </div>
      </div>

      <div class="drawer-actions">
        <button class="btn btn-primary" onclick="UsuariosModule.abrirEditar('${u.id}')">Editar</button>
        <button class="btn ${u.activo ? 'btn-danger' : 'btn-success'}"
          onclick="UsuariosModule.toggleEstado('${u.id}', ${!u.activo})">
          ${u.activo ? 'Desactivar' : 'Activar'}
        </button>
        <button class="btn btn-secondary" onclick="UsuariosModule.abrirCambiarPassword('${u.id}')">
          Cambiar password
        </button>
      </div>

      <div class="drawer-section" style="margin-top: 16px;">
        <div class="detail-label" style="margin-bottom: 8px;">Roles asignados</div>
        <div id="usuario-roles-lista"><p class="text-secondary text-sm">Cargando roles...</p></div>
        <div style="margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
          <select id="nuevo-rol-id" class="input input-sm" style="flex: 1; min-width: 120px;">
            <option value="">Seleccionar rol...</option>
            ${rolesCatalogo.map(r => `<option value="${r.id}">${r.nombre}</option>`).join('')}
          </select>
          <input type="text" id="nuevo-rol-sede" class="input input-sm" placeholder="Sede ID (opcional)" style="flex: 1; min-width: 100px;" />
          <button class="btn btn-sm btn-primary" onclick="UsuariosModule.asignarRol('${u.id}')">Asignar</button>
        </div>
      </div>
    `;

    document.getElementById('usuario-drawer').classList.add('open');
    document.getElementById('usuario-overlay').classList.add('open');

    await cargarRolesEnDrawer(u.id);
  }

  function cerrarDrawer() {
    document.getElementById('usuario-drawer')?.classList.remove('open');
    document.getElementById('usuario-overlay')?.classList.remove('open');
    usuarioSeleccionado = null;
  }

  // --------------------------------------------------------------------------
  // Roles en drawer
  // --------------------------------------------------------------------------
  async function cargarRolesEnDrawer(usuarioId) {
    const el = document.getElementById('usuario-roles-lista');
    if (!el) return;

    try {
      const res = await fetch(`/api/usuarios/${usuarioId}/roles`, { headers: authHeaders() });
      const data = await res.json();
      const roles = data.data || data || [];

      if (roles.length === 0) {
        el.innerHTML = '<p class="text-secondary text-sm">Sin roles asignados</p>';
        return;
      }

      el.innerHTML = roles.map(r => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid var(--border-light);">
          <span class="text-sm">
            <strong>${r.roles?.nombre || r.rol_id}</strong>
            ${r.sede_id ? `<span class="text-secondary"> · ${r.sedes?.nombre || r.sede_id}</span>` : ''}
          </span>
          <button class="btn btn-sm btn-danger" onclick="UsuariosModule.eliminarRol('${r.id}', '${usuarioId}')">×</button>
        </div>
      `).join('');
    } catch (err) {
      if (el) el.innerHTML = '<p class="text-secondary text-sm">Error cargando roles</p>';
    }
  }

  async function asignarRol(usuarioId) {
    const rol_id  = document.getElementById('nuevo-rol-id')?.value;
    const sede_id = document.getElementById('nuevo-rol-sede')?.value.trim() || null;

    if (!rol_id) return mostrarToast('Selecciona un rol', 'error');

    try {
      const res = await fetch(`/api/usuarios/${usuarioId}/roles`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ rol_id, sede_id })
      });
      if (!res.ok) {
        const err = await res.json();
        return mostrarToast(err.error || 'Error al asignar rol', 'error');
      }
      mostrarToast('Rol asignado', 'success');
      await cargarRolesEnDrawer(usuarioId);
      await cargarDatos();
    } catch (err) {
      mostrarToast('Error de conexión', 'error');
    }
  }

  async function eliminarRol(asignacionId, usuarioId) {
    try {
      const res = await fetch(`/api/usuarios_roles/${asignacionId}`, {
        method: 'DELETE',
        headers: authHeaders()
      });
      if (!res.ok) return mostrarToast('Error al eliminar rol', 'error');
      mostrarToast('Rol eliminado', 'success');
      await cargarRolesEnDrawer(usuarioId);
      await cargarDatos();
    } catch (err) {
      mostrarToast('Error de conexión', 'error');
    }
  }

  // --------------------------------------------------------------------------
  // Modal crear / editar
  // --------------------------------------------------------------------------
  function abrirNuevo()    { abrirModal(null); }
  function abrirEditar(id) { abrirModal(usuarios.find(u => u.id === id)); }

  function abrirModal(usuario) {
    const esEdicion = !!usuario;
    const u = usuario || {};

    document.getElementById('modal-usuario')?.remove();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'modal-usuario';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>${esEdicion ? 'Editar usuario' : 'Nuevo usuario'}</h3>
          <button class="modal-close" onclick="document.getElementById('modal-usuario').remove()">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Nombre completo *</label>
            <input type="text" id="fu-nombre" class="input" value="${u.nombre || ''}" placeholder="Nombre completo" />
          </div>
          <div class="form-group">
            <label>Email *</label>
            <input type="email" id="fu-email" class="input" value="${u.email || ''}" placeholder="correo@ejemplo.com" />
          </div>
          ${!esEdicion ? `
          <div class="form-group">
            <label>Password *</label>
            <input type="password" id="fu-password" class="input" placeholder="Contraseña inicial" />
          </div>
          ` : ''}
          <div class="form-group">
            <label>Empresa ID</label>
            <input type="text" id="fu-empresa" class="input" value="${u.empresa_id || ''}" placeholder="ID de la empresa" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('modal-usuario').remove()">Cancelar</button>
          <button class="btn btn-primary" onclick="UsuariosModule.guardar('${u.id || ''}')">
            ${esEdicion ? 'Guardar cambios' : 'Crear usuario'}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  // --------------------------------------------------------------------------
  // Guardar
  // --------------------------------------------------------------------------
  async function guardar(id) {
    const nombre     = document.getElementById('fu-nombre')?.value.trim();
    const email      = document.getElementById('fu-email')?.value.trim();
    const empresa_id = document.getElementById('fu-empresa')?.value.trim() || null;

    if (!nombre) return mostrarToast('El nombre es obligatorio', 'error');
    if (!email)  return mostrarToast('El email es obligatorio', 'error');

    const esEdicion = !!id;
    const body = { nombre, email, empresa_id };

    if (!esEdicion) {
      const password = document.getElementById('fu-password')?.value;
      if (!password) return mostrarToast('La contraseña es obligatoria', 'error');
      body.password = password;
    }

    try {
      const url    = esEdicion ? `/api/usuarios/${id}` : '/api/usuarios';
      const method = esEdicion ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: authHeaders(),
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const err = await res.json();
        return mostrarToast(err.error || 'Error al guardar', 'error');
      }

      document.getElementById('modal-usuario')?.remove();
      cerrarDrawer();
      mostrarToast(esEdicion ? 'Usuario actualizado' : 'Usuario creado', 'success');
      await cargarDatos();
    } catch (err) {
      console.error('Error guardando usuario:', err);
      mostrarToast('Error de conexión', 'error');
    }
  }

  // --------------------------------------------------------------------------
  // Activar / desactivar
  // --------------------------------------------------------------------------
  async function toggleEstado(id, nuevoEstado) {
    try {
      const res = await fetch(`/api/usuarios/${id}/estado`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ activo: nuevoEstado })
      });
      if (!res.ok) return mostrarToast('Error al actualizar estado', 'error');
      mostrarToast(nuevoEstado ? 'Usuario activado' : 'Usuario desactivado', 'success');
      cerrarDrawer();
      await cargarDatos();
    } catch (err) {
      mostrarToast('Error de conexión', 'error');
    }
  }

  // --------------------------------------------------------------------------
  // Cambiar password
  // --------------------------------------------------------------------------
  function abrirCambiarPassword(id) {
    document.getElementById('modal-password')?.remove();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'modal-password';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>Cambiar contraseña</h3>
          <button class="modal-close" onclick="document.getElementById('modal-password').remove()">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Nueva contraseña *</label>
            <input type="password" id="fp-nueva" class="input" placeholder="Nueva contraseña" />
          </div>
          <div class="form-group">
            <label>Confirmar contraseña *</label>
            <input type="password" id="fp-confirmar" class="input" placeholder="Repetir contraseña" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('modal-password').remove()">Cancelar</button>
          <button class="btn btn-primary" onclick="UsuariosModule.guardarPassword('${id}')">Cambiar</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  async function guardarPassword(id) {
    const nueva     = document.getElementById('fp-nueva')?.value;
    const confirmar = document.getElementById('fp-confirmar')?.value;

    if (!nueva)           return mostrarToast('La contraseña es obligatoria', 'error');
    if (nueva !== confirmar) return mostrarToast('Las contraseñas no coinciden', 'error');

    try {
      const res = await fetch(`/api/usuarios/${id}/password`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ password: nueva })
      });
      if (!res.ok) {
        const err = await res.json();
        return mostrarToast(err.error || 'Error al cambiar contraseña', 'error');
      }
      document.getElementById('modal-password')?.remove();
      mostrarToast('Contraseña actualizada', 'success');
    } catch (err) {
      mostrarToast('Error de conexión', 'error');
    }
  }

  // --------------------------------------------------------------------------
  // Helper toast
  // --------------------------------------------------------------------------
  function mostrarToast(msg, tipo) {
    if (window.Toast) window.Toast.show(msg, tipo);
    else console.log(`[${tipo}] ${msg}`);
  }

  // --------------------------------------------------------------------------
  // API pública
  // --------------------------------------------------------------------------
  return {
    render,
    filtrar,
    aplicarFiltroCard,
    abrirDrawer,
    cerrarDrawer,
    abrirNuevo,
    abrirEditar,
    guardar,
    toggleEstado,
    abrirCambiarPassword,
    guardarPassword,
    asignarRol,
    eliminarRol
  };
})();
