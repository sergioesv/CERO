// ═══════════════════════════════════════════════════════════
// data/activos.js
// Capa de datos para la tabla activos e historial_estado_activo
// Centraliza todas las escrituras de cambio de estado de activos
// CERO — Arquitectura genérica de activos (v17+)
// ═══════════════════════════════════════════════════════════

'use strict';

var supabase = require('../config/config').supabase;

// ───────────────────────────────────────────────────────────
// Obtiene el activo_id dado una placa de vehículo
// Retorna: string UUID o null si no existe
// ───────────────────────────────────────────────────────────
async function obtenerActivoIdPorPlaca(placa) {
  var res = await supabase
    .from('vehiculos')
    .select('activo_id')
    .eq('placa', placa.toUpperCase())
    .single();

  if (res.error || !res.data || !res.data.activo_id) {
    console.error('❌ activos.js — no se encontró activo_id para placa:', placa);
    return null;
  }

  return res.data.activo_id;
}

// ───────────────────────────────────────────────────────────
// Obtiene el estado actual de un activo
// Retorna: string estado o null
// ───────────────────────────────────────────────────────────
async function obtenerEstadoActual(activoId) {
  var res = await supabase
    .from('activos')
    .select('estado')
    .eq('id', activoId)
    .single();

  if (res.error || !res.data) return null;
  return res.data.estado;
}

// ───────────────────────────────────────────────────────────
// Registra un cambio de estado de un activo
// - Actualiza activos.estado
// - Inserta registro en historial_estado_activo
//
// Parámetros:
//   placa           — placa del vehículo (string)
//   estadoNuevo     — nuevo estado: 'operativo'|'bloqueado'|'taller'|'retirado'
//   motivo          — texto descriptivo del motivo (string)
//   categoriaMotivo — 'alerta_documento'|'autorizacion'|'posoperacional'|'panel_admin'
//   referenciaId    — UUID del registro origen (puede ser null)
//   referenciaTipo  — nombre de la tabla origen (puede ser null)
//   cambiadoPor     — identificador del actor: 'sistema'|'supervisor'|'panel'
//
// Retorna: { ok: true } | { ok: false, error: string }
// Nunca lanza excepción — errores son no-bloqueantes para el flujo principal
// ───────────────────────────────────────────────────────────
async function registrarCambioEstado(placa, estadoNuevo, motivo, categoriaMotivo, referenciaId, referenciaTipo, cambiadoPor) {
  try {
    // 1. Obtener activo_id
    var activoId = await obtenerActivoIdPorPlaca(placa);
    if (!activoId) {
      // Vehículo sin activo_id aún migrado — no es error bloqueante
      console.warn('⚠️  activos.js — placa sin activo_id, omitiendo historial:', placa);
      return { ok: false, error: 'activo_id no encontrado para ' + placa };
    }

    // 2. Obtener estado anterior
    var estadoAnterior = await obtenerEstadoActual(activoId);

    // 3. Si el estado es igual, no registrar (evitar ruido en historial)
    if (estadoAnterior === estadoNuevo) {
      console.log('ℹ️  activos.js — estado sin cambio (' + estadoNuevo + '), omitiendo historial:', placa);
      return { ok: true };
    }

    // 4. Actualizar activos.estado
    var resActualizar = await supabase
      .from('activos')
      .update({ estado: estadoNuevo })
      .eq('id', activoId);

    if (resActualizar.error) {
      console.error('❌ activos.js — error actualizando activos.estado:', resActualizar.error.message);
      return { ok: false, error: resActualizar.error.message };
    }

    // 5. Insertar en historial_estado_activo
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

    console.log('✓ activos.js — cambio registrado:', placa, estadoAnterior, '→', estadoNuevo, '(' + categoriaMotivo + ')');
    return { ok: true };

  } catch (err) {
    // No propagar el error — el historial nunca debe bloquear el flujo principal
    console.error('❌ activos.js — excepción en registrarCambioEstado:', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = {
  registrarCambioEstado,
  obtenerActivoIdPorPlaca,
  obtenerEstadoActual
};
