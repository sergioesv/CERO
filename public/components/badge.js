```javascript
const Badge = {
  render(text, type = 'neutral') {
    return `<span class="badge badge-${type}">${Utils.escaparHTML(text)}</span>`;
  },
  
  estadoVehiculo(bloqueado) {
    return bloqueado ? this.render('BLOQ', 'danger') : this.render('OK', 'success');
  },
  
  diasRestantes(dias) {
    if (dias === null || dias === undefined) return this.render('—', 'neutral');
    if (dias <= 0) return this.render('VENC', 'danger');
    const tipo = Utils.clasificarUrgencia(dias);
    return this.render(`${dias}d`, tipo);
  },
  
  documento(fechaVencimiento) {
    if (!fechaVencimiento) return '<span class="text-secondary">—</span>';
    const dias = Utils.diasHasta(fechaVencimiento);
    if (dias <= 0) return '<span class="text-danger">VENC</span>';
    if (dias <= 30) return `<span class="text-${Utils.clasificarUrgencia(dias)}">${dias}d</span>`;
    return `<span class="text-success">${Utils.formatearFechaCorta(fechaVencimiento)}</span>`;
  }
};

window.Badge = Badge;
```
