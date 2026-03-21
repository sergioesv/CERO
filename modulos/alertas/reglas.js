// ═══════════════════════════════════════════════════════════
// modulos/alertas/reglas.js
// Define umbrales de alerta (30/15/7/0 días) y lógica de bloqueo
// CERO — Módulo 1.4 Alertas de documentos
// ═══════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────
// Umbrales de alerta en días
// ───────────────────────────────────────────────────────────
var UMBRALES = [
  { dias: 0,  tipo: 'BLOQUEO',     emoji: '🔴' },
  { dias: 7,  tipo: 'CRITICA',     emoji: '🟠' },
  { dias: 15, tipo: 'URGENTE',     emoji: '🟡' },
  { dias: 30, tipo: 'INFORMATIVA', emoji: '🔵' }
];

// ───────────────────────────────────────────────────────────
// Clasifica una alerta según los días restantes
// Retorna: { tipo, emoji, destinatarios[] }
// ───────────────────────────────────────────────────────────
function clasificarAlerta(diasRestantes) {
  // Vencido o vence hoy
  if (diasRestantes <= 0) {
    return {
      tipo: 'BLOQUEO',
      emoji: '🔴',
      destinatarios: ['Administrador', 'Supervisor']
    };
  }

  // Crítica — 7 días o menos
  if (diasRestantes <= 7) {
    return {
      tipo: 'CRITICA',
      emoji: '🟠',
      destinatarios: ['Administrador', 'Supervisor']
    };
  }

  // Urgente — 15 días o menos
  if (diasRestantes <= 15) {
    return {
      tipo: 'URGENTE',
      emoji: '🟡',
      destinatarios: ['Administrador']
    };
  }

  // Informativa — 30 días o menos
  if (diasRestantes <= 30) {
    return {
      tipo: 'INFORMATIVA',
      emoji: '🔵',
      destinatarios: ['Administrador']
    };
  }

  // Fuera de rango de alerta
  return null;
}

// ───────────────────────────────────────────────────────────
// Determina si un documento vencido debe bloquear el vehículo
// SOAT y Tecnomecánica vencidos = bloqueo
// Licencia vencida = alerta sin bloqueo (decisión del supervisor)
// ───────────────────────────────────────────────────────────
function debeBloquear(tipoDocumento, diasRestantes) {
  if (diasRestantes > 0) return false;

  var documentosQueBloquean = ['SOAT', 'Tecnomecánica'];
  return documentosQueBloquean.indexOf(tipoDocumento) >= 0;
}

// ───────────────────────────────────────────────────────────
// Formatea la fecha para mostrar en mensajes
// ───────────────────────────────────────────────────────────
function formatearFecha(fechaISO) {
  if (!fechaISO) return 'Sin fecha';
  var partes = fechaISO.split('-');
  if (partes.length !== 3) return fechaISO;
  return partes[2] + '/' + partes[1] + '/' + partes[0];
}

// ───────────────────────────────────────────────────────────
// Genera el texto del mensaje de alerta para vehículos
// ───────────────────────────────────────────────────────────
function generarMensajeVehiculo(alerta, clasificacion) {
  var estado = '';
  if (alerta.dias_restantes <= 0) {
    estado = '⛔ *VENCIDO* hace ' + Math.abs(alerta.dias_restantes) + ' día(s)';
  } else {
    estado = 'Vence en *' + alerta.dias_restantes + ' día(s)*';
  }

  var mensaje = clasificacion.emoji + ' *ALERTA ' + clasificacion.tipo + '*\n'
    + '━━━━━━━━━━━━━━━━━━\n'
    + '🚗 Vehículo: *' + alerta.placa + '* — ' + alerta.descripcion_vehiculo + '\n'
    + '📄 Documento: *' + alerta.tipo_documento + '*\n'
    + '📅 Vencimiento: ' + formatearFecha(alerta.fecha_vencimiento) + '\n'
    + '⏳ Estado: ' + estado + '\n'
    + '━━━━━━━━━━━━━━━━━━\n';

  if (alerta.dias_restantes <= 0 && alerta.bloquea) {
    mensaje += '🔒 *Vehículo bloqueado automáticamente*\n'
      + 'No podrá realizar preoperacional hasta renovar el documento.\n';
  }

  mensaje += '_CERO — Sistema de gestión de operaciones_';
  return mensaje;
}

// ───────────────────────────────────────────────────────────
// Genera el texto del mensaje de alerta para licencias
// ───────────────────────────────────────────────────────────
function generarMensajeLicencia(alerta, clasificacion) {
  var estado = '';
  if (alerta.dias_restantes <= 0) {
    estado = '⛔ *VENCIDA* hace ' + Math.abs(alerta.dias_restantes) + ' día(s)';
  } else {
    estado = 'Vence en *' + alerta.dias_restantes + ' día(s)*';
  }

  var mensaje = clasificacion.emoji + ' *ALERTA ' + clasificacion.tipo + ' — LICENCIA*\n'
    + '━━━━━━━━━━━━━━━━━━\n'
    + '👤 Conductor: *' + alerta.nombre + '*\n'
    + '🪪 Categoría: ' + (alerta.licencia_categoria || 'N/A') + '\n'
    + '📅 Vencimiento: ' + formatearFecha(alerta.fecha_vencimiento) + '\n'
    + '⏳ Estado: ' + estado + '\n'
    + '━━━━━━━━━━━━━━━━━━\n'
    + '_CERO — Sistema de gestión de operaciones_';

  return mensaje;
}

module.exports = {
  UMBRALES,
  clasificarAlerta,
  debeBloquear,
  formatearFecha,
  generarMensajeVehiculo,
  generarMensajeLicencia
};
