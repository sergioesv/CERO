// ═══════════════════════════════════════════════════════════
// data/activos.js
// Capa de datos para la tabla activos e historial_estado_activo
// CERO — v26 — Tabla vehiculos eliminada, todo opera sobre activos
// ═══════════════════════════════════════════════════════════

'use strict';

var config = require('../config/config');
var supabase = config.supabase;
var preop = require('../modulos/vehiculos/preoperacional/validaciones');

// ───────────────────────────────────────────────────────────
// UTILIDADES DE PLACA (migradas desde data/vehiculos.js)
// ───────────────────────────────────────────────────────────

function costoCaracterPlaca(a, b) {
  if (a === b) return 0;
  var confusiones = {
    '0': ['O', 'Q', 'D'], 'O': ['0', 'Q', 'D'], 'Q': ['0', 'O'],
    '1': ['I', 'L'], 'I': ['1', 'L'], 'L': ['1', 'I'],
    '2': ['Z'], 'Z': ['2'], '5': ['S'], 'S': ['5'],
    '6': ['G'], 'G': ['6'], '7': ['T'], 'T': ['7'],
    '8': ['B'], 'B': ['8']
  };
  return confusiones[a] && confusiones[a].indexOf(b) >= 0 ? 0.35 : 1;
}

function distanciaPlaca(a, b) {
  var placaA = preop.normalizarPlaca(a);
  var placaB = preop.normalizarPlaca(b);
  if (!placaA || !placaB || placaA.length !== placaB.length) return Number.MAX_SAFE_INTEGER;
  var total = 0;
  for (var i = 0; i < placaA.length; i++) {
    total += costoCaracterPlaca(placaA.charAt(i), placaB.charAt(i));
  }
  return total;
}

// ───────────────────────────────────────────────────────────
// UTILIDADES DE TELÉFONO (migradas desde data/vehiculos.js)
// ───────────────────────────────────────────────────────────

function normalizarTelefono(valor) {
  return String(valor || '')
    .replace(/^whatsapp:/i, '')
    .replace(/[^0-9]/g, '')
    .trim();
}

function posiblesTelefonos(telefono) {
  var base = normalizarTelefono(telefono);
  var lista = [];

  function agregar(valor) {
    if (!valor) return;
    if (lista.indexOf(valor) >= 0) return;
    lista.push(valor);
  }

  agregar(base);
  agregar('+' + base);
  agregar('whatsapp:' + base);
  agregar('whatsapp:+' + base);

  if (base.length === 12 && base.indexOf('57') === 0) {
    var local = base.slice(2);
    agregar(local);
    agregar('+' + local);
    agregar('whatsapp:' + local);
    agregar('whatsapp:+' + local);
  }

  if (base.length === 10) {
    agregar('57' + base);
    agregar('+57' + base);
    agregar('whatsapp:57' + base);
    agregar('whatsapp:+57' + base);
  }

  return lista;
}

// ───────────────────────────────────────────────────────────
// APLANAR ACTIVO — extrae datos JSONB a propiedades planas
// para compatibilidad con código que espera vehiculo.marca, etc.
// ───────────────────────────────────────────────────────────

function aplanarActivo(activo) {
  if (!activo) return null;
  var datos = activo.datos || {};
  var docs = activo.documentos || {};

  activo.marca = datos.marca || null;
  activo.modelo = datos.modelo || null;
  activo.tipo = datos.tipo_vehiculo || datos.tipo || null;
  activo.tipo_combustible = datos.tipo_combustible || null;
  activo.rendimiento_min = datos.rendimiento_min || null;
  activo.rendimiento_max = datos.rendimiento_max || null;
  activo.exento_pico_placa = datos.exento_pico_placa || false;
  activo.motivo_exencion = datos.motivo_exencion || null;
  activo.ciudad_base = datos.ciudad_base || null;
  activo.tarjeta_propiedad = datos.tarjeta_propiedad || null;
  activo.anio = datos.anio || null;

  activo.soat_vencimiento = docs.soat_vencimiento || null;
  activo.tecnomecanica_vencimiento = docs.tecnomecanica_vencimiento || null;

  return activo;
}

// ───────────────────────────────────────────────────────────
// BUSCAR CONDUCTOR POR TELÉFONO (migrado de vehiculos.js)
// ───────────────────────────────────────────────────────────

async function buscarConductorPorTelefono(telefono) {
  var candidatos = posiblesTelefonos(telefono);
  if (!candidatos.length) return null;

  var resultado = await supabase
    .from(config.TABLES.conductores)
    .select('*')
    .in('telefono', candidatos)
    .eq('activo', true)
    .limit(5);

  if (!resultado.error && Array.isArray(resultado.data) && resultado.data.length) {
    return resultado.data[0];
  }

  var todos = await supabase
    .from(config.TABLES.conductores)
    .select('*')
    .eq('activo', true)
    .limit(2000);

  if (todos.error || !Array.isArray(todos.data)) {
    return null;
  }

  var base = normalizarTelefono(telefono);
  for (var i = 0; i < todos.data.length; i++) {
    var conductor = todos.data[i];
    if (normalizarTelefono(conductor.telefono) === base) {
      return conductor;
    }
  }

  return null;
}

// ───────────────────────────────────────────────────────────
// CARGAR ACTIVO Y CONDUCTOR (reemplaza cargarVehiculoYConductor)
// Busca activo por placa en tabla activos, conductor por teléfono.
// Retorna objeto aplanado para compat con sesion.vehiculo
// ───────────────────────────────────────────────────────────

async function cargarActivoYConductor(placa, telefono) {
  var placaNormalizada = preop.normalizarPlaca(placa);

  var resultado = await supabase
    .from(config.TABLES.activos)
    .select('*')
    .eq('placa', placaNormalizada)
    .single();

  if (resultado.error || !resultado.data) {
    return { error: resultado.error || new Error('Activo no encontrado'), vehiculo: null, conductor: null };
  }

  var activo = aplanarActivo(resultado.data);
  var conductor = await buscarConductorPorTelefono(telefono);
  return { error: null, vehiculo: activo, conductor: conductor || null };
}

// ───────────────────────────────────────────────────────────
// BUSCAR PLACA SUGERIDA (fuzzy match contra activos)
// ───────────────────────────────────────────────────────────

async function buscarPlacaSugerida(placaDetectada) {
  var placaBase = preop.normalizarPlaca(placaDetectada);
  if (!placaBase || placaBase.length < 5) return null;

  try {
    var resultado = await supabase
      .from(config.TABLES.activos)
      .select('placa')
      .not('placa', 'is', null);

    if (resultado.error || !Array.isArray(resultado.data)) return null;

    var mejor = null;
    for (var i = 0; i < resultado.data.length; i++) {
      var placa = preop.normalizarPlaca(resultado.data[i].placa || '');
      if (!placa) continue;
      var distancia = distanciaPlaca(placaBase, placa);
      if (distancia === Number.MAX_SAFE_INTEGER) continue;
      if (!mejor || distancia < mejor.distancia) {
        mejor = { placa: placa, distancia: distancia };
      }
    }

    if (mejor && mejor.distancia <= 1) return mejor.placa;
  } catch (error) {
    console.error('Error buscando placa sugerida:', error.message);
  }

  return null;
}

// ───────────────────────────────────────────────────────────
// OBTENER ACTIVO ID POR PLACA
// Retorna: string UUID o null si no existe
// ───────────────────────────────────────────────────────────

async function obtenerActivoIdPorPlaca(placa) {
  var res = await supabase
    .from(config.TABLES.activos)
    .select('id')
    .eq('placa', placa.toUpperCase())
    .single();

  if (res.error || !res.data || !res.data.id) {
    console.error('❌ activos.js — no se encontró activo para placa:', placa);
    return null;
  }

  return res.data.id;
}

// ───────────────────────────────────────────────────────────
// OBTENER ESTADO ACTUAL DE UN ACTIVO
// ───────────────────────────────────────────────────────────

async function obtenerEstadoActual(activoId) {
  var res = await supabase
    .from(config.TABLES.activos)
    .select('estado')
    .eq('id', activoId)
    .single();

  if (res.error || !res.data) return null;
  return res.data.estado;
}

// ───────────────────────────────────────────────────────────
// ACTUALIZAR KILOMETRAJE DE UN ACTIVO
// ───────────────────────────────────────────────────────────

async function actualizarKilometrajeActivo(activoId, kilometraje) {
  return await supabase
    .from(config.TABLES.activos)
    .update({ kilometraje: kilometraje, updated_at: new Date().toISOString() })
    .eq('id', activoId);
}

// ───────────────────────────────────────────────────────────
// REGISTRAR CAMBIO DE ESTADO
// Acepta activoId directamente O placa (resuelve internamente)
// ───────────────────────────────────────────────────────────

async function registrarCambioEstado(activoIdOrPlaca, estadoNuevo, motivo, categoriaMotivo, referenciaId, referenciaTipo, cambiadoPor) {
  try {
    // Determinar activoId: si parece UUID, usarlo directo; si no, resolver por placa
    var activoId = activoIdOrPlaca;
    if (typeof activoIdOrPlaca === 'string' && activoIdOrPlaca.length < 36) {
      activoId = await obtenerActivoIdPorPlaca(activoIdOrPlaca);
      if (!activoId) {
        console.warn('⚠️  activos.js — placa sin activo, omitiendo historial:', activoIdOrPlaca);
        return { ok: false, error: 'activo_id no encontrado para ' + activoIdOrPlaca };
      }
    }

    // Obtener estado anterior
    var estadoAnterior = await obtenerEstadoActual(activoId);

    // Si el estado es igual, no registrar
    if (estadoAnterior === estadoNuevo) {
      console.log('ℹ️  activos.js — estado sin cambio (' + estadoNuevo + '), omitiendo historial');
      return { ok: true };
    }

    // Actualizar activos.estado
    var resActualizar = await supabase
      .from(config.TABLES.activos)
      .update({ estado: estadoNuevo, updated_at: new Date().toISOString() })
      .eq('id', activoId);

    if (resActualizar.error) {
      console.error('❌ activos.js — error actualizando activos.estado:', resActualizar.error.message);
      return { ok: false, error: resActualizar.error.message };
    }

    // Insertar en historial_estado_activo
    var registroHistorial = {
      activo_id: activoId,
      estado_anterior: estadoAnterior,
      estado_nuevo: estadoNuevo,
      motivo: motivo || null,
      categoria_motivo: categoriaMotivo || null,
      referencia_id: referenciaId || null,
      referencia_tipo: referenciaTipo || null,
      cambiado_por: cambiadoPor || 'sistema'
    };

    var resHistorial = await supabase
      .from('historial_estado_activo')
      .insert([registroHistorial]);

    if (resHistorial.error) {
      console.error('❌ activos.js — error insertando historial:', resHistorial.error.message);
      return { ok: false, error: resHistorial.error.message };
    }

    console.log('✓ activos.js — cambio registrado:', activoId, estadoAnterior, '→', estadoNuevo, '(' + categoriaMotivo + ')');
    return { ok: true };

  } catch (err) {
    // No propagar el error — el historial nunca debe bloquear el flujo principal
    console.error('❌ activos.js — excepción en registrarCambioEstado:', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = {
  // Funciones principales
  cargarActivoYConductor,
  buscarPlacaSugerida,
  buscarConductorPorTelefono,
  obtenerActivoIdPorPlaca,
  obtenerEstadoActual,
  actualizarKilometrajeActivo,
  registrarCambioEstado,
  aplanarActivo,

  // Utilidades
  normalizarTelefono,
  posiblesTelefonos,
  distanciaPlaca
};
