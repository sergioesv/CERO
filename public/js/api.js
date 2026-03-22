const API = {
  baseURL: '/api',
  
  async request(endpoint, options = {}) {
    const config = {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options
    };
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
  
  vehiculos: {
    listar(filtros = {}) {
      const params = new URLSearchParams(filtros).toString();
      return API.get(`/vehiculos${params ? '?' + params : ''}`);
    },
    obtener(placa) { return API.get(`/vehiculos/${placa}`); },
    crear(data) { return API.post('/vehiculos', data); },
    actualizar(placa, data) { return API.put(`/vehiculos/${placa}`, data); },
    bloquear(placa, motivo) { return API.post(`/vehiculos/${placa}/bloquear`, { motivo }); },
    desbloquear(placa) { return API.post(`/vehiculos/${placa}/desbloquear`); },
    eliminar(placa) { return API.delete(`/vehiculos/${placa}`); }
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
    hoy() { return API.get('/dashboard/hoy'); }
  },

  autorizaciones: {
    pendientes() { return API.get('/autorizaciones/pendientes'); },
    listar(filtros = {}) {
      const params = new URLSearchParams(filtros).toString();
      return API.get(`/autorizaciones${params ? '?' + params : ''}`);
    }
  }
};

window.API = API;
