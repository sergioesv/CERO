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
  }
};

window.Utils = Utils;

