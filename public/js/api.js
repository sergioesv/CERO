const API = {
  baseURL: '/api',
  
  async request(endpoint, options = {}) {
    const config = {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options
    };
    const token = sessionStorage.getItem('cero_token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    if (config.body && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }
    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, config);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Error ${response.status}`);
      return data;
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error);
      throw error;
    }
  },
  
  get(endpoint) { return this.request(endpoint, { method: 'GET' }); },
  post(endpoint, body) { return this.request(endpoint, { method: 'POST', body }); },
  put(endpoint, body) { return this.request(endpoint, { method: 'PUT', body }); },
  delete(endpoint) { return this.request(endpoint, { method: 'DELETE' }); },
  
  activos: {
    listar(filtros = {}) {
      const params = new URLSearchParams(filtros).toString();
      return API.get(`/activos${params ? '?' + params : ''}`);
    },
    obtener(id) { return API.get(`/activos/${id}`); },
    obtenerPorPlaca(placa) { return API.get(`/activos/placa/${placa}`); },
    crear(data) { return API.post('/activos', data); },
    actualizar(id, data) { return API.put(`/activos/${id}`, data); },
    bloquear(id, motivo) { return API.post(`/activos/${id}/bloquear`, { motivo }); },
    desbloquear(id) { return API.post(`/activos/${id}/desbloquear`); },
    eliminar(id) { return API.delete(`/activos/${id}`); }
  },

  plantillas: {
    listar(filtros = {}) {
      const params = new URLSearchParams(filtros).toString();
      return API.get(`/plantillas${params ? '?' + params : ''}`);
    },
    obtener(id) { return API.get(`/plantillas/${id}`); },
    crear(data) { return API.post('/plantillas', data); },
    actualizar(id, data) { return API.put(`/plantillas/${id}`, data); },
    clonar(id, data) { return API.post(`/plantillas/${id}/clonar`, data); },
    eliminar(id) { return API.delete(`/plantillas/${id}`); },
    // Grupos
    crearGrupo(plantillaId, data) { return API.post(`/plantillas/${plantillaId}/grupos`, data); },
    actualizarGrupo(grupoId, data) { return API.put(`/plantillas/grupos/${grupoId}`, data); },
    eliminarGrupo(grupoId) { return API.delete(`/plantillas/grupos/${grupoId}`); },
    reordenarGrupos(ids) { return API.put('/plantillas/grupos/reordenar', { ids }); },
    // Items
    crearItem(grupoId, data) { return API.post(`/plantillas/grupos/${grupoId}/items`, data); },
    actualizarItem(itemId, data) { return API.put(`/plantillas/items/${itemId}`, data); },
    eliminarItem(itemId) { return API.delete(`/plantillas/items/${itemId}`); },
    reordenarItems(ids) { return API.put('/plantillas/items/reordenar', { ids }); }
  },
  
  conductores: {
    listar(filtros = {}) {
      const params = new URLSearchParams(filtros).toString();
      return API.get(`/conductores${params ? '?' + params : ''}`);
    },
    obtener(id) { return API.get(`/conductores/${id}`); },
    crear(data) { return API.post('/conductores', data); },
    actualizar(id, data) { return API.put(`/conductores/${id}`, data); },
    eliminar(id) { return API.delete(`/conductores/${id}`); }
  },

  preoperacionales: {
    listar(filtros = {}) {
      const params = new URLSearchParams(filtros).toString();
      return API.get(`/preoperacionales${params ? '?' + params : ''}`);
    },
    obtener(id) { return API.get(`/preoperacionales/${id}`); }
  },
  
  alertas: {
    listar(filtros = {}) {
      const params = new URLSearchParams(filtros).toString();
      return API.get(`/alertas${params ? '?' + params : ''}`);
    },
    ejecutar() { return API.post('/alertas/ejecutar'); },
    resumen() { return API.get('/alertas/resumen'); }
  },
  
  dashboard: {
    resumen() { return API.get('/dashboard/resumen'); },
    hoy() { return API.get('/dashboard/hoy'); },
    /** Dashboard de seguridad operativa (v16) — rutas bajo /api/dashboard */
    seguridadGeneral(periodo) {
      var q = periodo ? '?periodo=' + encodeURIComponent(periodo) : '';
      return API.get('/dashboard/general' + q);
    },
    seguridadActivos(periodo, tipo) {
      var params = new URLSearchParams();
      if (periodo) params.set('periodo', periodo);
      if (tipo) params.set('tipo', tipo);
      var s = params.toString();
      return API.get('/dashboard/activos' + (s ? '?' + s : ''));
    },
    seguridadIndice() {
      return API.get('/dashboard/indice');
    }
  }
};

window.API = API;
