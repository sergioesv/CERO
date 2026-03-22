// ═══════════════════════════════════════════════════════════
// data/autorizaciones.js
// Capa de datos para autorizaciones del panel web
// CERO — Módulo Alertas (Fase 2.1)
// ═══════════════════════════════════════════════════════════

'use strict';

var config = require('../config/config');
var notificador = require('../modulos/alertas/notificador');

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
  if (!fecha) return { vencimiento: null, dias_restantes: null, estado: 'sin_dato' };
  var dias = calcularDiasRestantes(fecha);
  return {
    vencimiento: fecha,
    dias_restantes: dias,
    estado: clasificarEstado(dias)
  };
}

// ─────────────────────────────────────────────────────────────────
// DOCUMENTOS DE VEHÍCULOS
// GET /api/alertas/documentos
// ─────────────────────────────────────────────────────────────────

async function obtenerDocumentosVehiculos() {
  var resVehiculos = await config.supabase
    .from(config.TABLES.vehiculos)
    .select('placa, tipo, marca, modelo, estado, bloqueado, motivo_bloqueo, soat_vencimiento, tecnomecanica_vencimiento')
    .neq('estado', 'retirado')
    .order('placa');

  if (resVehiculos.error) throw resVehiculos.error;

  var vehiculos = resVehiculos.data || [];

  var datos = await Promise.all(vehiculos.map(async function(v) {
    var licencia = { conductor: null, vencimiento: null, dias_restantes: null, estado: 'sin_dato' };

    // Buscar último conductor del vehículo desde preoperacionales
    var resPreop = await config.supabase
      .from(config.TABLES.preoperacionales)
      .select('conductor_id')
      .eq('vehiculo_placa', v.placa)
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
      placa: v.placa,
      tipo: v.tipo || null,
      marca: v.marca || null,
      modelo: v.modelo || null,
      estado: v.estado || 'operativo',
      bloqueado: v.bloqueado || false,
      motivo_bloqueo: v.motivo_bloqueo || null,
      soat: construirDocumento(v.soat_vencimiento),
      tecnomecanica: construirDocumento(v.tecnomecanica_vencimiento),
      licencia: licencia
    };
  }));

  return datos;
}

// ─────────────────────────────────────────────────────────────────
// AUTORIZACIONES PENDIENTES
// GET /api/autorizaciones/pendientes
// ─────────────────────────────────────────────────────────────────

async function obtenerAutorizacionesPendientes() {
  var res = await config.supabase
    .from('autorizaciones_novedad')
    .select('*, conductores:conductor_id(nombre, telefono)')
    .is('decision', null)
    .order('timestamp_alerta', { ascending: true });

  if (res.error) throw res.error;

  return (res.data || []).map(function(r) {
    return {
      id: r.id,
      vehiculo_placa: r.vehiculo_placa,
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
// GET /api/autorizaciones/resueltas
// ─────────────────────────────────────────────────────────────────

async function obtenerAutorizacionesResueltas() {
  var res = await config.supabase
    .from('autorizaciones_novedad')
    .select('*, conductores:conductor_id(nombre), supervisores:supervisor_id(nombre)')
    .not('decision', 'is', null)
    .order('timestamp_decision', { ascending: false })
    .limit(100);

  if (res.error) throw res.error;

  return (res.data || []).map(function(r) {
    return {
      id: r.id,
      vehiculo_placa: r.vehiculo_placa,
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
// REGISTRAR DECISIÓN — función reutilizable
// Usada por el panel web (PUT /api/autorizaciones/:id/decidir)
// y puede ser usada por el flujo WhatsApp
// ─────────────────────────────────────────────────────────────────

async function registrarDecision(autorizacionId, decision, justificacion, supervisorId) {
  // 1. Verificar que exista y no tenga decisión previa
  var resCheck = await config.supabase
    .from('autorizaciones_novedad')
    .select('id, decision, conductor_id, vehiculo_placa')
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

  // 3. Si decision = taller, cambiar estado del vehículo
  if (decision === 'taller' && autorizacion.vehiculo_placa) {
    await config.supabase
      .from(config.TABLES.vehiculos)
      .update({ estado: 'taller' })
      .eq('placa', autorizacion.vehiculo_placa);
  }

  // 4. Buscar teléfono del conductor y notificar por WhatsApp
  if (autorizacion.conductor_id) {
    try {
      var resConductor = await config.supabase
        .from(config.TABLES.conductores)
        .select('nombre, telefono')
        .eq('id', autorizacion.conductor_id)
        .single();

      if (!resConductor.error && resConductor.data && resConductor.data.telefono) {
        var mensajeDecision = construirMensajeDecision(
          autorizacion.vehiculo_placa,
          resConductor.data.nombre,
          decision,
          justificacion
        );
        await notificador.enviarWhatsApp(resConductor.data.telefono, mensajeDecision);
      }
    } catch (errNotif) {
      console.error('Error notificando al conductor:', errNotif.message);
      // No bloquear la respuesta si falla la notificación
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
// HISTORIAL DE VEHÍCULO
// GET /api/vehiculos/:placa/historial
// ─────────────────────────────────────────────────────────────────

async function obtenerHistorialVehiculo(placa) {
  var placaUpper = placa.toUpperCase();

  var [resPreop, resPosop, resTanqueos, resAutorizaciones, resVehiculo] = await Promise.all([
    config.supabase
      .from(config.TABLES.preoperacionales)
      .select('id, fecha, hora, novedades')
      .eq('vehiculo_placa', placaUpper)
      .order('fecha', { ascending: false })
      .order('hora', { ascending: false })
      .limit(30),

    config.supabase
      .from(config.TABLES.posoperacionales)
      .select('id, fecha, hora, novedades')
      .eq('vehiculo_placa', placaUpper)
      .order('fecha', { ascending: false })
      .order('hora', { ascending: false })
      .limit(30),

    config.supabase
      .from(config.TABLES.tanqueos)
      .select('id, fecha, hora, cantidad, tipo_combustible, estacion_servicio')
      .eq('vehiculo_placa', placaUpper)
      .order('fecha', { ascending: false })
      .order('hora', { ascending: false })
      .limit(30),

    config.supabase
      .from('autorizaciones_novedad')
      .select('id, timestamp_alerta, timestamp_decision, decision, justificacion, novedades_bloqueo, supervisores:supervisor_id(nombre)')
      .eq('vehiculo_placa', placaUpper)
      .order('timestamp_alerta', { ascending: false })
      .limit(30),

    config.supabase
      .from(config.TABLES.vehiculos)
      .select('placa, tipo, marca, modelo, estado')
      .eq('placa', placaUpper)
      .single()
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
      fecha: r.fecha + 'T' + (r.hora || '00:00:00'),
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
      fecha: r.fecha + 'T' + (r.hora || '00:00:00'),
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

  var vehiculo = (!resVehiculo.error && resVehiculo.data) ? resVehiculo.data : { placa: placaUpper };

  return { vehiculo: vehiculo, historial: eventos };
}

module.exports = {
  calcularDiasRestantes,
  clasificarEstado,
  obtenerDocumentosVehiculos,
  obtenerAutorizacionesPendientes,
  obtenerAutorizacionesResueltas,
  registrarDecision,
  obtenerHistorialVehiculo
};
