// ═══════════════════════════════════════════════════════════
// data/autorizaciones.js
// Consultas a Supabase para el sistema de autorizaciones
// de novedades que bloquean la salida de vehículos.
//
// Tabla: autorizaciones_novedad
// Una fila por preoperacional con novedades bloqueantes.
// El supervisor responde por WhatsApp: AUTORIZAR/TALLER/RESTRINGIR + placa
//
// SQL para crear la tabla en Supabase:
//
//   CREATE TABLE autorizaciones_novedad (
//     id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
//     preoperacional_id uuid NOT NULL REFERENCES preoperacionales(id),
//     vehiculo_placa    text NOT NULL,
//     conductor_id      uuid REFERENCES conductores(id),
//     novedades_bloqueo jsonb NOT NULL DEFAULT '[]',
//     decision          text DEFAULT NULL,  -- 'autorizado' | 'taller' | 'restringido'
//     justificacion     text DEFAULT NULL,
//     supervisor_id     uuid REFERENCES conductores(id),
//     timestamp_alerta  timestamptz NOT NULL DEFAULT now(),
//     timestamp_decision timestamptz DEFAULT NULL
//   );
//
//   CREATE INDEX idx_autorizaciones_placa_pendiente
//     ON autorizaciones_novedad(vehiculo_placa)
//     WHERE decision IS NULL;
//
// CERO — v12 — Sistema de autorizaciones de bloqueo
// ═══════════════════════════════════════════════════════════

var config = require('../config/config');

// ───────────────────────────────────────────────────────────
// crearAutorizacion — registra una nueva solicitud de
// autorización para un preoperacional con novedades bloqueantes.
//
// data = {
//   preoperacionalId: uuid,
//   placa: string,
//   conductorId: uuid,
//   novedadesBloqueo: array de novedades con severidad 'bloqueo'
// }
// ───────────────────────────────────────────────────────────

async function crearAutorizacion(data) {
  return await config.supabase
    .from(config.TABLES.autorizacionesNovedad)
    .insert({
      preoperacional_id: data.preoperacionalId,
      vehiculo_placa: data.placa.toUpperCase(),
      conductor_id: data.conductorId || null,
      novedades_bloqueo: data.novedadesBloqueo || [],
      timestamp_alerta: new Date().toISOString()
    })
    .select()
    .single();
}

// ───────────────────────────────────────────────────────────
// obtenerPendientePorPlaca — busca la autorización más reciente
// sin decisión para una placa dada.
// Retorna null si no hay pendiente.
// ───────────────────────────────────────────────────────────

async function obtenerPendientePorPlaca(placa) {
  var resultado = await config.supabase
    .from(config.TABLES.autorizacionesNovedad)
    .select('*')
    .eq('vehiculo_placa', placa.toUpperCase())
    .is('decision', null)
    .order('timestamp_alerta', { ascending: false })
    .limit(1)
    .single();

  if (resultado.error) return null;
  return resultado.data;
}

// ───────────────────────────────────────────────────────────
// registrarDecision — guarda la decisión del supervisor y
// actualiza el estado del preoperacional asociado.
//
// decision: 'autorizado' | 'taller' | 'restringido'
// supervisorId: uuid del conductor con cargo Supervisor
// ───────────────────────────────────────────────────────────

async function registrarDecision(id, preoperacionalId, decision, justificacion, supervisorId) {
  var ahora = new Date().toISOString();

  // Actualizar autorización
  var resAuth = await config.supabase
    .from(config.TABLES.autorizacionesNovedad)
    .update({
      decision: decision,
      justificacion: justificacion || null,
      supervisor_id: supervisorId || null,
      timestamp_decision: ahora
    })
    .eq('id', id)
    .select()
    .single();

  if (resAuth.error) {
    return { error: resAuth.error };
  }

  // Actualizar estado del preoperacional según la decisión
  var nuevoEstado;
  if (decision === 'autorizado') {
    nuevoEstado = 'completado';
  } else if (decision === 'taller') {
    nuevoEstado = 'en_taller';
  } else if (decision === 'restringido') {
    nuevoEstado = 'restringido';
  }

  if (nuevoEstado) {
    await config.supabase
      .from(config.TABLES.preoperacionales)
      .update({ estado: nuevoEstado })
      .eq('id', preoperacionalId);
  }

  return { error: null, data: resAuth.data };
}

// ───────────────────────────────────────────────────────────
// listarPendientes — retorna todas las autorizaciones sin
// decisión, ordenadas por timestamp_alerta (más antigua primero).
// Usada por el panel web.
// ───────────────────────────────────────────────────────────

async function listarPendientes() {
  var resultado = await config.supabase
    .from(config.TABLES.autorizacionesNovedad)
    .select('*, conductores:conductor_id(nombre, telefono)')
    .is('decision', null)
    .order('timestamp_alerta', { ascending: true });

  if (resultado.error) {
    console.error('Error listando autorizaciones pendientes:', resultado.error.message);
    return [];
  }

  return resultado.data || [];
}

// ───────────────────────────────────────────────────────────
// listarTodas — retorna autorizaciones con filtros opcionales.
// filtros = { placa, soloSinDecision, limite }
// ───────────────────────────────────────────────────────────

async function listarTodas(filtros) {
  filtros = filtros || {};

  var query = config.supabase
    .from(config.TABLES.autorizacionesNovedad)
    .select('*, conductores:conductor_id(nombre), supervisores:supervisor_id(nombre)')
    .order('timestamp_alerta', { ascending: false })
    .limit(filtros.limite || 100);

  if (filtros.placa) {
    query = query.eq('vehiculo_placa', filtros.placa.toUpperCase());
  }

  if (filtros.soloSinDecision) {
    query = query.is('decision', null);
  }

  var resultado = await query;
  if (resultado.error) {
    console.error('Error listando autorizaciones:', resultado.error.message);
    return [];
  }

  return resultado.data || [];
}

module.exports = {
  crearAutorizacion,
  obtenerPendientePorPlaca,
  registrarDecision,
  listarPendientes,
  listarTodas
};
