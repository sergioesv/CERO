// =============================================================================
// Modulo Usuarios — Panel web CERO
// Patron: stats cards + tabla + drawer lateral
// Crea usuarios con password temporal autogenerada (mostrada 1 sola vez)
// =============================================================================

window.UsuariosModule = (() => {
  let usuarios           = [];
  let usuarioSeleccionado = null;
  let filtroActivo       = 'todos';
  let rolesCatalogo      = [];

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

  function puedeCrear() {
    const roles = (window.App && window.App.getCanonicalRoles && window.App.getCanonicalRoles()) || [];
    return roles.includes('superadmin_plataforma') || roles.includes('superadmin_emp');
  }

  function render() {
    const main = document.getElementById('main');
    const botonNuevo = puedeCrear()
      ? '<button class="btn btn-primary" onclick="UsuariosModule.abrirNuevo()">+ Nuevo usuario</button>'
      : '';

    main.innerHTML = `
      <div class="main-header">
        <div>
          <h1 class="main-title">Usuarios</h1>
          <p class="main-subtitle">Gestion de usuarios del panel</p>
        </div>
        <div class="main-actions">${botonNuevo}</div>
      </div>
      <div class="main-content">
        <div id="usuarios-stats" class="stats-grid"></div>

        <div class="filters-row">
          <div class="search-box">
            <input type="text" id="usuarios-search" class="input input-sm"
              placeholder="Buscar por nombre o email..."
              oninput="UsuariosModule.filtrar()" />
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
                <th>Ultimo acceso</th>
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

  async function cargarDatos() {
    try {
      const [resUsuarios, resRoles] = await Promise.all([
        fetch('/api/usuarios', { headers: authHeaders() }),
        fetch('/api/roles',    { headers: authHeaders() })
      ]);

      if (resUsuarios.status === 403) {
        usuarios = [];
        rolesCatalogo = [];
        renderStats();
        const tbody = document.getElementById('usuarios-tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Sin acceso</td></tr>';
        mostrarToast('Sin acceso', 'error');
        return;
      }

      if (!resUsuarios.ok || !resRoles.ok) {
        throw new Error(`Error HTTP ${resUsuarios.status}/${resRoles.status}`);
      }

      const dataU = await resUsuarios.json();
      const dataR = await resRoles.json();
      usuarios      = dataU.data || [];
      rolesCatalogo = dataR.data || [];
      renderStats();
      renderTabla(usuarios);
    } catch (err) {
      console.error('Error cargando usuarios:', err);
      const tbody = document.getElementById('usuarios-tbody');
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Error al cargar</td></tr>';
    }
  }

  function renderStats() {
    const activos   = usuarios.filter(u => u.activo);
    const inactivos = usuarios.filter(u => !u.activo);

    const el = document.getElementById('usuarios-stats');
    if (!el) return;

    el.innerHTML = `
      <div class="stat-card ${filtroActivo === 'todos' ? 'active' : ''}" onclick="UsuariosModule.aplicarFiltroCard('todos')">
        <div class="stat-value">${usuarios.length}</div>
        <div class="stat-label">Total</div>
      </div>
      <div class="stat-card ${filtroActivo === 'activos' ? 'active' : ''}" onclick="UsuariosModule.aplicarFiltroCard('activos')">
        <div class="stat-value">${activos.length}</div>
        <div class="stat-label">Activos</div>
      </div>
      <div class="stat-card ${filtroActivo === 'inactivos' ? 'active' : ''}" onclick="UsuariosModule.aplicarFiltroCard('inactivos')">
        <div class="stat-value">${inactivos.length}</div>
        <div class="stat-label">Inactivos</div>
      </div>
    `;
  }

  function renderTabla(lista) {
    const tbody = document.getElementById('usuarios-tbody');
    if (!tbody) return;

    if (!lista || lista.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Sin usuarios</td></tr>';
      return;
    }

    tbody.innerHTML = lista.map(u => {
      const rolesTexto = (u.usuarios_roles || [])
        .map(r => r.roles?.nombre)
        .filter(Boolean)
        .join(', ') || '—';

      const avisoCambio = u.debe_cambiar_password
        ? '<span class="badge badge-warning" title="Pendiente cambio de password">!</span> '
        : '';

      return `
        <tr class="table-row" onclick="UsuariosModule.abrirDrawer('${u.id}')">
          <td>${avisoCambio}${u.nombre}</td>
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

  async function abrirDrawer(id) {
    usuarioSeleccionado = usuarios.find(u => u.id === id);
    if (!usuarioSeleccionado) return;

    const u = usuarioSeleccionado;

    document.getElementById('usuario-drawer-content').innerHTML = `
      <div class="drawer-header">
        <h2 class="drawer-title">${u.nombre}</h2>
        <button class="drawer-close" onclick="UsuariosModule.cerrarDrawer()">&times;</button>
      </div>

      <div class="drawer-section">
        <div class="detail-grid">
          <div class="detail-item"><span class="detail-label">Nombre</span><span class="detail-value">${u.nombre}</span></div>
          <div class="detail-item"><span class="detail-label">Email</span><span class="detail-value">${u.email}</span></div>
          <div class="detail-item"><span class="detail-label">Empresa</span><span class="detail-value">${u.empresas?.nombre || '—'}</span></div>
          <div class="detail-item"><span class="detail-label">Ultimo acceso</span><span class="detail-value">${formatFecha(u.ultimo_acceso)}</span></div>
          <div class="detail-item"><span class="detail-label">Estado</span><span class="detail-value">${u.activo
            ? '<span class="badge badge-success">Activo</span>'
            : '<span class="badge badge-danger">Inactivo</span>'}</span></div>
          ${u.debe_cambiar_password ? '<div class="detail-item"><span class="detail-label">Password</span><span class="detail-value"><span class="badge badge-warning">Pendiente cambio</span></span></div>' : ''}
        </div>
      </div>

      <div class="drawer-actions">
        <button class="btn btn-primary" onclick="UsuariosModule.abrirEditar('${u.id}')">Editar</button>
        <button class="btn ${u.activo ? 'btn-danger' : 'btn-success'}"
          onclick="UsuariosModule.toggleEstado('${u.id}', ${!u.activo})">
          ${u.activo ? 'Desactivar' : 'Activar'}
        </button>
        <button class="btn btn-secondary" onclick="UsuariosModule.resetearPassword('${u.id}')">
          Resetear password
        </button>
      </div>

      <div class="drawer-section" style="margin-top: 16px;">
        <div class="detail-label" style="margin-bottom: 8px;">Roles asignados</div>
        <div id="usuario-roles-lista"><p class="text-secondary text-sm">Cargando...</p></div>
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

  async function cargarRolesEnDrawer(usuarioId) {
    const el = document.getElementById('usuario-roles-lista');
    if (!el) return;

    try {
      const res = await fetch(`/api/usuarios/${usuarioId}/roles`, { headers: authHeaders() });
      const data = await res.json();
      const roles = data.data || [];

      if (roles.length === 0) {
        el.innerHTML = '<p class="text-secondary text-sm">Sin roles asignados</p>';
        return;
      }

      el.innerHTML = roles.map(r => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid var(--border-light);">
          <span class="text-sm"><strong>${r.roles?.nombre || r.rol_id}</strong>${r.sede_id ? `<span class="text-secondary"> - ${r.sedes?.nombre || r.sede_id}</span>` : ''}</span>
          <button class="btn btn-sm btn-danger" onclick="UsuariosModule.eliminarRol('${r.id}', '${usuarioId}')">&times;</button>
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
      const data = await res.json();
      if (!res.ok) return mostrarToast(data.error || 'Error', 'error');
      mostrarToast('Rol asignado', 'success');
      await cargarRolesEnDrawer(usuarioId);
      await cargarDatos();
    } catch (err) {
      mostrarToast('Error de conexion', 'error');
    }
  }

  async function eliminarRol(asignacionId, usuarioId) {
    if (!confirm('Eliminar esta asignacion de rol?')) return;
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
      mostrarToast('Error de conexion', 'error');
    }
  }

  function abrirNuevo()    { abrirModal(null); }
  function abrirEditar(id) { abrirModal(usuarios.find(u => u.id === id)); }

  function abrirModal(usuario) {
    const esEdicion = !!usuario;
    const u = usuario || {};
    const empresaActual = (window.App && window.App.getEmpresaId && window.App.getEmpresaId()) || '';

    document.getElementById('modal-usuario')?.remove();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'modal-usuario';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>${esEdicion ? 'Editar usuario' : 'Nuevo usuario'}</h3>
          <button class="modal-close" onclick="document.getElementById('modal-usuario').remove()">&times;</button>
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
          <div class="form-group">
            <label>Telefono</label>
            <input type="tel" id="fu-telefono" class="input" value="${u.telefono || ''}" placeholder="3001234567" />
          </div>
          ${!esEdicion ? `
          <div class="form-group">
            <label>Empresa ID *</label>
            <input type="text" id="fu-empresa" class="input" value="${empresaActual}" placeholder="UUID de empresa" />
            <small class="text-secondary">Se generara una contrasena temporal automaticamente</small>
          </div>
          ` : ''}
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('modal-usuario').remove()">Cancelar</button>
          <button class="btn btn-primary" onclick="UsuariosModule.guardar('${u.id || ''}')">
            ${esEdicion ? 'Guardar' : 'Crear usuario'}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  async function guardar(id) {
    const nombre   = document.getElementById('fu-nombre')?.value.trim();
    const email    = document.getElementById('fu-email')?.value.trim();
    const telefono = document.getElementById('fu-telefono')?.value.trim() || null;

    if (!nombre) return mostrarToast('Nombre obligatorio', 'error');
    if (!email)  return mostrarToast('Email obligatorio', 'error');

    const esEdicion = !!id;
    const body = { nombre, email, telefono };

    if (!esEdicion) {
      const empresa_id = document.getElementById('fu-empresa')?.value.trim();
      if (!empresa_id) return mostrarToast('Empresa obligatoria', 'error');
      body.empresa_id = empresa_id;
    }

    try {
      const url    = esEdicion ? `/api/usuarios/${id}` : '/api/usuarios';
      const method = esEdicion ? 'PUT' : 'POST';

      const res  = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(body) });
      const data = await res.json();

      if (!res.ok) return mostrarToast(data.error || 'Error al guardar', 'error');

      document.getElementById('modal-usuario')?.remove();
      cerrarDrawer();

      if (!esEdicion && data.password_temporal) {
        mostrarModalPasswordTemporal(data.data.nombre, data.data.email, data.password_temporal);
      } else {
        mostrarToast(esEdicion ? 'Usuario actualizado' : 'Usuario creado', 'success');
      }

      await cargarDatos();
    } catch (err) {
      console.error('Error guardando usuario:', err);
      mostrarToast('Error de conexion', 'error');
    }
  }

  function mostrarModalPasswordTemporal(nombre, email, password) {
    document.getElementById('modal-password-temp')?.remove();
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'modal-password-temp';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>Usuario creado</h3>
        </div>
        <div class="modal-body">
          <p><strong>${nombre}</strong> (${email})</p>
          <p class="text-secondary text-sm">Contrasena temporal generada. Debe entregarla al usuario. <strong>Solo se mostrara una vez.</strong></p>
          <div style="background: var(--bg-secondary); padding: 12px; border-radius: 8px; font-family: monospace; font-size: 18px; text-align: center; letter-spacing: 2px; margin: 12px 0;">
            ${password}
          </div>
          <p class="text-secondary text-sm">El usuario debera cambiarla en su primer inicio de sesion.</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="UsuariosModule.copiarPassword('${password}')">Copiar</button>
          <button class="btn btn-primary" onclick="document.getElementById('modal-password-temp').remove()">Cerrar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  function copiarPassword(pass) {
    navigator.clipboard.writeText(pass).then(
      () => mostrarToast('Contrasena copiada', 'success'),
      () => mostrarToast('No se pudo copiar', 'error')
    );
  }

  async function toggleEstado(id, nuevoEstado) {
    if (!confirm(nuevoEstado ? 'Activar usuario?' : 'Desactivar usuario? No podra ingresar al panel.')) return;
    try {
      const res = await fetch(`/api/usuarios/${id}/estado`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ activo: nuevoEstado })
      });
      const data = await res.json();
      if (!res.ok) return mostrarToast(data.error || 'Error', 'error');
      mostrarToast(nuevoEstado ? 'Activado' : 'Desactivado', 'success');
      cerrarDrawer();
      await cargarDatos();
    } catch (err) {
      mostrarToast('Error de conexion', 'error');
    }
  }

  async function resetearPassword(id) {
    if (!confirm('Generar nueva contrasena temporal? La actual dejara de funcionar.')) return;
    try {
      const res = await fetch(`/api/usuarios/${id}/password`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (!res.ok) return mostrarToast(data.error || 'Error', 'error');
      const u = usuarios.find(x => x.id === id) || {};
      mostrarModalPasswordTemporal(u.nombre || 'Usuario', u.email || '', data.password_temporal);
      cerrarDrawer();
      await cargarDatos();
    } catch (err) {
      mostrarToast('Error de conexion', 'error');
    }
  }

  function mostrarToast(msg, tipo) {
    if (window.Toast) window.Toast.show(msg, tipo);
    else console.log(`[${tipo}] ${msg}`);
  }

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
    resetearPassword,
    asignarRol,
    eliminarRol,
    copiarPassword
  };
})();
