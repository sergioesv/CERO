// ═══════════════════════════════════════════════════════════
// data/autorizaciones.js
// Capa de datos para autorizaciones del panel web
// CERO — v26 — vehiculo_placa → activo_id
// ═══════════════════════════════════════════════════════════

'use strict';

var config = require('../config/config');
var notificador = require('../modulos/alertas/notificador');
var activosData = require('./activos');

// ─────────────────────────────────────────────────────────────────
// HELPERS DE DOCUMENTOS
// ─────────────────────────────────────────────────────────────────

function calcularDiasRestantes(fechaVencimiento) {
  if (!fechaVencimiento) return null;
  var hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  var vence = new Date(fechaVencimiento);
  vence.setHours(0, 0, 0, 0);
  return Math.ceil((vence - hoy) / (1000 * 60 * 60 * 24));
}

function clasificarEstado(diasRestantes) {
  if (diasRestantes === null || diasRestantes === undefined) return 'sin_dato';
  if (diasRestantes <= 0) return 'vencido';
  if (diasRestantes <= 7) return 'critico';
  if (diasRestantes <= 15) return 'urgente';
  if (diasRestantes <= 30) return 'proximo';
  return 'vigente';
}

function construirDocumento(fecha) {
  if (!fecha || fecha === '') return { vencimiento: null, dias_restantes: null, estado: 'sin_dato' };
  var dias = calcularDiasRestantes(fecha);
  return {
    vencimiento: fecha,
    dias_restantes: dias,
    estado: clasificarEstado(dias)
  };
}

// ─────────────────────────────────────────────────────────────────
// DOCUMENTOS DE ACTIVOS (antes: documentos de vehículos)
// GET /api/alertas/documentos
// ─────────────────────────────────────────────────────────────────

async function obtenerDocumentosActivos() {
  var resActivos = await config.supabase
    .from(config.TABLES.activos)
    .select('id, placa, nombre, estado, bloqueado, motivo_bloqueo, datos, documentos')
    .eq('activo', true)
    .not('placa', 'is', null)
    .order('placa');

  if (resActivos.error) throw resActivos.error;

  var activos = resActivos.data || [];

  var datos = await Promise.all(activos.map(async function(a) {
    var datosJson = a.datos || {};
    var docsJson = a.documentos || {};
    var licencia = { conductor: null, vencimiento: null, dias_restantes: null, estado: 'sin_dato' };

    // Buscar último conductor del activo desde preoperacionales
    var resPreop = await config.supabase
      .from(config.TABLES.preoperacionales)
      .select('conductor_id')
      .eq('activo_id', a.id)
      .order('fecha', { ascending: false })
      .order('hora', { ascending: false })
      .limit(1);

    if (!resPreop.error && resPreop.data && resPreop.data.length > 0 && resPreop.data[0].conductor_id) {
      var resConductor = await config.supabase
        .from(config.TABLES.conductores)
        .select('nombre, licencia_vencimiento')
        .eq('id', resPreop.data[0].conductor_id)
        .single();

      if (!resConductor.error && resConductor.data) {
        var dias = calcularDiasRestantes(resConductor.data.licencia_vencimiento);
        licencia = {
          conductor: resConductor.data.nombre,
          vencimiento: resConductor.data.licencia_vencimiento,
          dias_restantes: dias,
          estado: clasificarEstado(dias)
        };
      }
    }

    return {
      id: a.id,
      placa: a.placa,
      tipo: datosJson.tipo_vehiculo || datosJson.tipo || null,
      marca: datosJson.marca || null,
      modelo: datosJson.modelo || null,
      estado: a.estado || 'operativo',
      bloqueado: a.bloqueado || false,
      motivo_bloqueo: a.motivo_bloqueo || null,
      soat: construirDocumento(docsJson.soat_vencimiento),
      tecnomecanica: construirDocumento(docsJson.tecnomecanica_vencimiento),
      licencia: licencia
    };
  }));

  return datos;
}

// ─────────────────────────────────────────────────────────────────
// AUTORIZACIONES PENDIENTES
// ─────────────────────────────────────────────────────────────────

async function obtenerAutorizacionesPendientes() {
  var res = await config.supabase
    .from('autorizaciones_novedad')
    .select('*, activos:activo_id(id, placa, nombre), conductores:conductor_id(nombre, telefono)')
    .is('decision', null)
    .order('timestamp_alerta', { ascending: true });

  if (res.error) throw res.error;

  return (res.data || []).map(function(r) {
    var activo = r.activos || {};
    return {
      id: r.id,
      activo_id: r.activo_id,
      vehiculo_placa: activo.placa || null,
      conductor_nombre: r.conductores ? r.conductores.nombre : null,
      conductor_telefono: r.conductores ? r.conductores.telefono : null,
      novedades_bloqueo: r.novedades_bloqueo || [],
      decision: null,
      timestamp_alerta: r.timestamp_alerta
    };
  });
}

// ─────────────────────────────────────────────────────────────────
// AUTORIZACIONES RESUELTAS
// ─────────────────────────────────────────────────────────────────

async function obtenerAutorizacionesResueltas() {
  var res = await config.supabase
    .from('autorizaciones_novedad')
    .select('*, activos:activo_id(id, placa, nombre), conductores:conductor_id(nombre), supervisores:supervisor_id(nombre)')
    .not('decision', 'is', null)
    .order('timestamp_decision', { ascending: false })
    .limit(100);

  if (res.error) throw res.error;

  return (res.data || []).map(function(r) {
    var activo = r.activos || {};
    return {
      id: r.id,
      activo_id: r.activo_id,
      vehiculo_placa: activo.placa || null,
      conductor_nombre: r.conductores ? r.conductores.nombre : null,
      novedades_bloqueo: r.novedades_bloqueo || [],
      decision: r.decision,
      justificacion: r.justificacion || null,
      supervisor_nombre: r.supervisores ? r.supervisores.nombre : null,
      timestamp_alerta: r.timestamp_alerta,
      timestamp_decision: r.timestamp_decision
    };
  });
}

// ─────────────────────────────────────────────────────────────────
// REGISTRAR DECISIÓN
// ─────────────────────────────────────────────────────────────────

async function registrarDecision(autorizacionId, decision, justificacion, supervisorId) {
  // 1. Verificar que exista y no tenga decisión previa
  var resCheck = await config.supabase
    .from('autorizaciones_novedad')
    .select('id, decision, conductor_id, activo_id')
    .eq('id', autorizacionId)
    .single();

  if (resCheck.error || !resCheck.data) {
    return { ok: false, error: 'Autorización no encontrada' };
  }

  if (resCheck.data.decision !== null) {
    return { ok: false, error: 'Esta autorización ya fue resuelta' };
  }

  // 2. Actualizar registro en BD
  var ahora = new Date().toISOString();
  var resUpdate = await config.supabase
    .from('autorizaciones_novedad')
    .update({
      decision: decision,
      justificacion: justificacion || null,
      supervisor_id: supervisorId || null,
      timestamp_decision: ahora
    })
    .eq('id', autorizacionId)
    .select()
    .single();

  if (resUpdate.error) throw resUpdate.error;

  var autorizacion = resCheck.data;
  var activoId = autorizacion.activo_id;

  // 3. Sincronizar estado en activos e historial según decisión
  var estadoNuevoActivo = null;
  var motivoHistorial = 'Decisión supervisor: ' + decision;
  if (justificacion) motivoHistorial += ' — ' + justificacion;

  if (decision === 'taller' && activoId) {
    await config.supabase
      .from(config.TABLES.activos)
      .update({ estado: 'taller', updated_at: ahora })
      .eq('id', activoId);
    estadoNuevoActivo = 'taller';

  } else if (decision === 'restringir' && activoId) {
    await config.supabase
      .from(config.TABLES.activos)
      .update({ bloqueado: true, motivo_bloqueo: motivoHistorial, updated_at: ahora })
      .eq('id', activoId);
    estadoNuevoActivo = 'bloqueado';

  } else if (decision === 'autorizar' && activoId) {
    await config.supabase
      .from(config.TABLES.activos)
      .update({ bloqueado: false, motivo_bloqueo: null, estado: 'operativo', updated_at: ahora })
      .eq('id', activoId);
    estadoNuevoActivo = 'operativo';
  }

  // Registrar en historial_estado_activo si aplica
  if (estadoNuevoActivo && activoId) {
    activosData.registrarCambioEstado(
      activoId,
      estadoNuevoActivo,
      motivoHistorial,
      'autorizacion',
      autorizacionId,
      'autorizaciones_novedad',
      'supervisor'
    ).catch(function(err) {
      console.error('❌ Error registrando historial desde autorizacion:', err.message);
    });
  }

  // 4. Obtener placa del activo para notificación
  var placaActivo = null;
  if (activoId) {
    var resActivo = await config.supabase
      .from(config.TABLES.activos)
      .select('placa')
      .eq('id', activoId)
      .single();
    if (!resActivo.error && resActivo.data) {
      placaActivo = resActivo.data.placa;
    }
  }

  // 5. Buscar teléfono del conductor y notificar por WhatsApp
  if (autorizacion.conductor_id) {
    try {
      var resConductor = await config.supabase
        .from(config.TABLES.conductores)
        .select('nombre, telefono')
        .eq('id', autorizacion.conductor_id)
        .single();

      if (!resConductor.error && resConductor.data && resConductor.data.telefono) {
        var mensajeDecision = construirMensajeDecision(
          placaActivo || '—',
          resConductor.data.nombre,
          decision,
          justificacion
        );
        await notificador.enviarWhatsApp(resConductor.data.telefono, mensajeDecision);
      }
    } catch (errNotif) {
      console.error('Error notificando al conductor:', errNotif.message);
    }
  }

  return { ok: true };
}

function construirMensajeDecision(placa, conductorNombre, decision, justificacion) {
  var iconos = { autorizar: '✅', taller: '🔧', restringir: '🚫' };
  var textos = {
    autorizar: 'AUTORIZADO para salir',
    taller: 'Enviado a TALLER',
    restringir: 'RESTRINGIDO — no puede operar'
  };

  var icono = iconos[decision] || '📋';
  var texto = textos[decision] || decision;

  var msg = icono + ' *DECISIÓN SUPERVISOR*\n'
    + '━━━━━━━━━━━━━━━━━━\n'
    + 'Hola ' + (conductorNombre || 'Conductor') + ',\n\n'
    + 'Vehículo *' + placa + '*\n'
    + 'Estado: *' + texto + '*\n';

  if (justificacion) {
    msg += '\n_"' + justificacion + '"_\n';
  }

  msg += '━━━━━━━━━━━━━━━━━━\n'
    + '_CERO — Sistema de gestión de operaciones_';

  return msg;
}

// ─────────────────────────────────────────────────────────────────
// HISTORIAL DE ACTIVO
// GET /api/vehiculos/:placa/historial  (o /api/activos/:placa/historial)
// ─────────────────────────────────────────────────────────────────

async function obtenerHistorialActivo(placa) {
  var placaUpper = placa.toUpperCase();

  // Resolver placa a activo_id
  var activoId = await activosData.obtenerActivoIdPorPlaca(placaUpper);

  // Obtener datos del activo
  var resActivo = await config.supabase
    .from(config.TABLES.activos)
    .select('id, placa, nombre, estado, datos')
    .eq('placa', placaUpper)
    .single();

  var activo = null;
  if (!resActivo.error && resActivo.data) {
    var datosJson = resActivo.data.datos || {};
    activo = {
      placa: resActivo.data.placa,
      tipo: datosJson.tipo_vehiculo || datosJson.tipo || null,
      marca: datosJson.marca || null,
      modelo: datosJson.modelo || null,
      estado: resActivo.data.estado
    };
  } else {
    activo = { placa: placaUpper };
  }

  if (!activoId) {
    return { vehiculo: activo, historial: [] };
  }

  var [resPreop, resPosop, resTanqueos, resAutorizaciones] = await Promise.all([
    config.supabase
      .from(config.TABLES.preoperacionales)
      .select('id, fecha, hora, novedades')
      .eq('activo_id', activoId)
      .order('fecha', { ascending: false })
      .order('hora', { ascending: false })
      .limit(30),

    config.supabase
      .from(config.TABLES.posoperacionales)
      .select('id, created_at, novedades')
      .eq('activo_id', activoId)
      .order('created_at', { ascending: false })
      .limit(30),

    config.supabase
      .from(config.TABLES.tanqueos)
      .select('id, created_at, cantidad, tipo_combustible, estacion_servicio')
      .eq('activo_id', activoId)
      .order('created_at', { ascending: false })
      .limit(30),

    config.supabase
      .from('autorizaciones_novedad')
      .select('id, timestamp_alerta, timestamp_decision, decision, justificacion, novedades_bloqueo, supervisores:supervisor_id(nombre)')
      .eq('activo_id', activoId)
      .order('timestamp_alerta', { ascending: false })
      .limit(30)
  ]);

  var eventos = [];

  // Preoperacionales
  (resPreop.data || []).forEach(function(r) {
    var novedades = r.novedades || [];
    var criticos = novedades.filter(function(n) { return n.critico === true; });
    var tieneBloqueo = criticos.length > 0;
    var resumen = tieneBloqueo
      ? 'Con novedades — ' + criticos.length + ' bloqueo(s)'
      : (novedades.length > 0 ? 'Con novedades' : 'Sin novedades');

    eventos.push({
      tipo: 'preoperacional',
      fecha: r.fecha + 'T' + (r.hora || '00:00:00'),
      resumen: resumen,
      id: r.id,
      tiene_bloqueo: tieneBloqueo
    });
  });

  // Posoperacionales
  (resPosop.data || []).forEach(function(r) {
    var novedades = r.novedades || [];
    eventos.push({
      tipo: 'posoperacional',
      fecha: r.created_at,
      resumen: novedades.length > 0 ? 'Con novedades' : 'Sin novedades',
      id: r.id
    });
  });

  // Tanqueos
  (resTanqueos.data || []).forEach(function(r) {
    var partes = [];
    if (r.cantidad) partes.push(r.cantidad + ' ' + (r.tipo_combustible || 'comb.'));
    if (r.estacion_servicio) partes.push(r.estacion_servicio);
    eventos.push({
      tipo: 'tanqueo',
      fecha: r.created_at,
      resumen: partes.length > 0 ? partes.join(' — ') : 'Tanqueo registrado',
      id: r.id
    });
  });

  // Autorizaciones
  (resAutorizaciones.data || []).forEach(function(r) {
    if (r.timestamp_decision) {
      var supervisorNombre = r.supervisores ? r.supervisores.nombre : 'Supervisor';
      var novedadesBreve = (r.novedades_bloqueo && r.novedades_bloqueo.length > 0)
        ? (r.novedades_bloqueo[0].item || 'novedad')
        : 'novedad';
      eventos.push({
        tipo: 'autorizacion',
        fecha: r.timestamp_decision,
        resumen: (r.decision || 'decidido') + ' por ' + supervisorNombre + ' — ' + novedadesBreve,
        decision: r.decision
      });
    }
  });

  // Ordenar por fecha descendente y limitar a 50
  eventos.sort(function(a, b) {
    return new Date(b.fecha) - new Date(a.fecha);
  });
  eventos = eventos.slice(0, 50);

  return { vehiculo: activo, historial: eventos };
}

module.exports = {
  calcularDiasRestantes,
  clasificarEstado,
  obtenerDocumentosActivos,
  obtenerAutorizacionesPendientes,
  obtenerAutorizacionesResueltas,
  registrarDecision,
  obtenerHistorialActivo
};
