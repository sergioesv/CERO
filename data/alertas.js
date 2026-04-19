// ═══════════════════════════════════════════════════════════
// data/alertas.js
// Consultas a Supabase para vencimientos, bloqueos e historial
// CERO — v26 — Queries sobre activos (vehiculos eliminado)
// ═══════════════════════════════════════════════════════════

var config = require('../config/config');
var activosData = require('./activos');

// ───────────────────────────────────────────────────────────
// Obtiene activos con documentos próximos a vencer o vencidos
// Lee soat/tecnomecanica desde activos.documentos JSONB
// ───────────────────────────────────────────────────────────
async function obtenerVencimientosActivos() {
  var resultado = await config.supabase
    .from(config.TABLES.activos)
    .select('id, placa, datos, documentos, bloqueado')
    .eq('activo', true)
    .eq('bloqueado', false);

  if (resultado.error || !Array.isArray(resultado.data)) {
    console.error('❌ Error consultando vencimientos de activos:', resultado.error?.message);
    return [];
  }

  var hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  var alertas = [];

  for (var i = 0; i < resultado.data.length; i++) {
    var a = resultado.data[i];
    var docs = a.documentos || {};
    var datos = a.datos || {};

    // Verificar SOAT
    if (docs.soat_vencimiento) {
      var diasSoat = calcularDiasRestantes(hoy, docs.soat_vencimiento);
      if (diasSoat <= 30) {
        alertas.push({
          placa: a.placa,
          descripcion_vehiculo: (datos.marca || '') + ' ' + (datos.modelo || ''),
          tipo_documento: 'SOAT',
          fecha_vencimiento: docs.soat_vencimiento,
          dias_restantes: diasSoat,
          bloquea: true
        });
      }
    }

    // Verificar Tecnomecánica
    if (docs.tecnomecanica_vencimiento && docs.tecnomecanica_vencimiento !== '') {
      var diasTecno = calcularDiasRestantes(hoy, docs.tecnomecanica_vencimiento);
      if (diasTecno <= 30) {
        alertas.push({
          placa: a.placa,
          descripcion_vehiculo: (datos.marca || '') + ' ' + (datos.modelo || ''),
          tipo_documento: 'Tecnomecánica',
          fecha_vencimiento: docs.tecnomecanica_vencimiento,
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
// Bloquea un activo por documento vencido
// Acepta activoId (UUID) o placa (string corto)
// ───────────────────────────────────────────────────────────
async function bloquearActivo(activoIdOrPlaca, motivo) {
  // Resolver a activoId si es placa
  var activoId = activoIdOrPlaca;
  if (typeof activoIdOrPlaca === 'string' && activoIdOrPlaca.length < 36) {
    activoId = await activosData.obtenerActivoIdPorPlaca(activoIdOrPlaca);
    if (!activoId) {
      console.error('❌ activo no encontrado para placa: ' + activoIdOrPlaca);
      return false;
    }
  }

  var resultado = await config.supabase
    .from(config.TABLES.activos)
    .update({
      bloqueado: true,
      motivo_bloqueo: motivo,
      updated_at: new Date().toISOString()
    })
    .eq('id', activoId);

  if (resultado.error) {
    console.error('❌ Error bloqueando activo ' + activoIdOrPlaca + ':', resultado.error.message);
    return false;
  }

  console.log('🔒 Activo ' + activoIdOrPlaca + ' bloqueado: ' + motivo);

  // Registrar en historial (no bloqueante)
  activosData.registrarCambioEstado(
    activoId,
    'bloqueado',
    motivo,
    'alerta_documento',
    null,
    null,
    'sistema'
  ).catch(function(err) {
    console.error('❌ Error registrando historial desde alertas:', err.message);
  });

  return true;
}

// ───────────────────────────────────────────────────────────
// Obtiene contactos por cargo (Administrador, Supervisor)
// ───────────────────────────────────────────────────────────
async function obtenerContactosPorCargo(cargo) {
  var resultado = await config.supabase
    .from(config.TABLES.conductores)
    .select('nombre, telefono, cargo')
    .eq('cargo', cargo)
    .eq('activo', true);

  if (resultado.error || !Array.isArray(resultado.data)) {
    console.error('❌ Error obteniendo contactos con cargo ' + cargo + ':', resultado.error?.message);
    return [];
  }

  return resultado.data;
}

// ───────────────────────────────────────────────────────────
// Calcula días entre hoy y una fecha de vencimiento
// ───────────────────────────────────────────────────────────
function calcularDiasRestantes(hoy, fechaVencimiento) {
  var fecha = new Date(fechaVencimiento + 'T00:00:00');
  var diferencia = fecha.getTime() - hoy.getTime();
  return Math.floor(diferencia / (1000 * 60 * 60 * 24));
}

module.exports = {
  obtenerVencimientosActivos,
  obtenerVencimientosLicencias,
  bloquearActivo,
  obtenerContactosPorCargo,
  calcularDiasRestantes
};
