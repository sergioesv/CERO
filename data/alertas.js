// ═══════════════════════════════════════════════════════════
// data/alertas.js
// Consultas a Supabase para vencimientos, bloqueos e historial
// CERO — Módulo 1.4 Alertas de documentos
// ═══════════════════════════════════════════════════════════

var config = require('../config/config');

// ───────────────────────────────────────────────────────────
// Obtiene vehículos con documentos próximos a vencer o vencidos
// Retorna: array de { placa, tipo_documento, fecha_vencimiento, dias_restantes }
// ───────────────────────────────────────────────────────────
async function obtenerVencimientosVehiculos() {
  var resultado = await config.supabase
    .from(config.TABLES.vehiculos)
    .select('placa, tipo, marca, modelo, soat_vencimiento, tecnomecanica_vencimiento')
    .eq('bloqueado', false);

  if (resultado.error || !Array.isArray(resultado.data)) {
    console.error('❌ Error consultando vencimientos de vehículos:', resultado.error?.message);
    return [];
  }

  var hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  var alertas = [];

  for (var i = 0; i < resultado.data.length; i++) {
    var v = resultado.data[i];

    // Verificar SOAT
    if (v.soat_vencimiento) {
      var diasSoat = calcularDiasRestantes(hoy, v.soat_vencimiento);
      if (diasSoat <= 30) {
        alertas.push({
          placa: v.placa,
          descripcion_vehiculo: (v.marca || '') + ' ' + (v.modelo || ''),
          tipo_documento: 'SOAT',
          fecha_vencimiento: v.soat_vencimiento,
          dias_restantes: diasSoat,
          bloquea: true
        });
      }
    }

    // Verificar Tecnomecánica
    if (v.tecnomecanica_vencimiento) {
      var diasTecno = calcularDiasRestantes(hoy, v.tecnomecanica_vencimiento);
      if (diasTecno <= 30) {
        alertas.push({
          placa: v.placa,
          descripcion_vehiculo: (v.marca || '') + ' ' + (v.modelo || ''),
          tipo_documento: 'Tecnomecánica',
          fecha_vencimiento: v.tecnomecanica_vencimiento,
          dias_restantes: diasTecno,
          bloquea: true
        });
      }
    }
  }

  return alertas;
}

// ───────────────────────────────────────────────────────────
// Obtiene conductores con licencia próxima a vencer o vencida
// Retorna: array de { conductor_id, nombre, telefono, fecha_vencimiento, dias_restantes }
// ───────────────────────────────────────────────────────────
async function obtenerVencimientosLicencias() {
  var resultado = await config.supabase
    .from(config.TABLES.conductores)
    .select('id, nombre, telefono, licencia_categoria, licencia_vencimiento, cargo')
    .eq('activo', true)
    .not('cargo', 'in', '("Administrador","Supervisor")');

  if (resultado.error || !Array.isArray(resultado.data)) {
    console.error('❌ Error consultando vencimientos de licencias:', resultado.error?.message);
    return [];
  }

  var hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  var alertas = [];

  for (var i = 0; i < resultado.data.length; i++) {
    var c = resultado.data[i];

    if (c.licencia_vencimiento) {
      var dias = calcularDiasRestantes(hoy, c.licencia_vencimiento);
      if (dias <= 30) {
        alertas.push({
          conductor_id: c.id,
          nombre: c.nombre,
          telefono: c.telefono,
          licencia_categoria: c.licencia_categoria,
          tipo_documento: 'Licencia',
          fecha_vencimiento: c.licencia_vencimiento,
          dias_restantes: dias,
          bloquea: false
        });
      }
    }
  }

  return alertas;
}

// ───────────────────────────────────────────────────────────
// Bloquea un vehículo por documento vencido
// ───────────────────────────────────────────────────────────
async function bloquearVehiculo(placa, motivo) {
  var resultado = await config.supabase
    .from(config.TABLES.vehiculos)
    .update({
      bloqueado: true,
      motivo_bloqueo: motivo
    })
    .eq('placa', placa);

  if (resultado.error) {
    console.error('❌ Error bloqueando vehículo ' + placa + ':', resultado.error.message);
    return false;
  }

  console.log('🔒 Vehículo ' + placa + ' bloqueado: ' + motivo);
  return true;
}

// ───────────────────────────────────────────────────────────
// Obtiene contactos por cargo (Administrador, Supervisor)
// Retorna: array de { nombre, telefono, cargo }
// ───────────────────────────────────────────────────────────
async function obtenerContactosPorCargo(cargo) {
  var resultado = await config.supabase
    .from(config.TABLES.conductores)
    .select('nombre, telefono, cargo')
    .eq('cargo', cargo)
    .neq('activo', false);

  if (resultado.error || !Array.isArray(resultado.data)) {
    console.error('❌ Error obteniendo contactos con cargo ' + cargo + ':', resultado.error?.message);
    return [];
  }

  var contactos = resultado.data.filter(function(c) { return c.telefono; });
  console.log('👥 Contactos con cargo ' + cargo + ': ' + contactos.length);
  return contactos;
}

// ───────────────────────────────────────────────────────────
// Calcula días entre hoy y una fecha de vencimiento
// Positivo = faltan días, Negativo = ya venció, 0 = vence hoy
// ───────────────────────────────────────────────────────────
function calcularDiasRestantes(hoy, fechaVencimiento) {
  var fecha = new Date(fechaVencimiento + 'T00:00:00');
  var diferencia = fecha.getTime() - hoy.getTime();
  return Math.floor(diferencia / (1000 * 60 * 60 * 24));
}

module.exports = {
  obtenerVencimientosVehiculos,
  obtenerVencimientosLicencias,
  bloquearVehiculo,
  obtenerContactosPorCargo,
  calcularDiasRestantes
};
