const Utils = {
  formatearFecha(fecha) {
    if (!fecha) return '—';
    const d = new Date(fecha);
    if (isNaN(d.getTime())) return '—';
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    return `${dia}/${mes}/${d.getFullYear()}`;
  },
  
  formatearFechaCorta(fecha) {
    if (!fecha) return '—';
    const d = new Date(fecha);
    if (isNaN(d.getTime())) return '—';
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  },
  
  diasHasta(fecha) {
    if (!fecha) return null;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const objetivo = new Date(fecha);
    objetivo.setHours(0, 0, 0, 0);
    return Math.ceil((objetivo - hoy) / (1000 * 60 * 60 * 24));
  },
  
  formatearNumero(num) {
    if (num === null || num === undefined) return '—';
    return num.toLocaleString('es-CO');
  },
  
  escaparHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },
  
  clasificarUrgencia(dias) {
    if (dias === null) return 'neutral';
    if (dias <= 0) return 'danger';
    if (dias <= 7) return 'danger';
    if (dias <= 15) return 'warning';
    if (dias <= 30) return 'warning';
    return 'success';
  },
  
  debounce(func, wait = 300) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  },
  
  getJwtPayload() {
    const token = sessionStorage.getItem('cero_token');
    if (!token) return null;
    try {
      const payloadBase64 = token.split('.')[1];
      if (!payloadBase64) return null;
      const base64 = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
      return JSON.parse(atob(padded));
    } catch (e) {
      console.error('Error decodificando JWT:', e);
      return null;
    }
  },

  getRoles() {
    const payload = this.getJwtPayload();
    return payload && Array.isArray(payload.roles) ? payload.roles : [];
  },

  getEmpresaId() {
    const payload = this.getJwtPayload();
    return payload ? payload.empresa_id : null;
  }
};

window.Utils = Utils;

/**
 * Retorna la fecha de hoy en zona horaria Colombia (UTC-5) formato YYYY-MM-DD.
 * Usar siempre en lugar de new Date().toISOString().split('T')[0]
 */
function fechaHoyBogota() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }))
    .toISOString()
    .split('T')[0];
}

window.fechaHoyBogota = fechaHoyBogota;
