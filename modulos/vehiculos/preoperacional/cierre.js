var sesiones = require('../../../servicios/sesiones');
var pdf = require('../../../servicios/pdf');
var config = require('../../../config/config');
var inspeccionesData = require('../../../data/inspecciones');
var vehiculosData = require('../../../data/vehiculos');
var autorizacionesData = require('../../../data/autorizaciones');
var alertasReglas = require('../../alertas/reglas');
var alertasNotificador = require('../../alertas/notificador');
var preop = require('./validaciones');

function construirAlertasKm(sesion, kmReferencia, diferenciaKm) {
  var alertas = [];

  if (kmReferencia == null || sesion.kilometraje == null) {
    return alertas;
  }

  if (sesion.kilometraje < kmReferencia) {
    alertas.push({
      tipo: 'menor',
      mensaje: 'Kilometraje menor al ultimo registro',
      valor_detectado: sesion.kilometraje,
      km_referencia: kmReferencia,
      diferencia_km: diferenciaKm
    });
  }

  if (sesion.kilometraje > (kmReferencia + config.MAX_KM_SALTO)) {
    alertas.push({
      tipo: 'alto',
      mensaje: 'Salto de kilometraje mayor al rango automatico',
      valor_detectado: sesion.kilometraje,
      km_referencia: kmReferencia,
      diferencia_km: diferenciaKm,
      max_km_salto: config.MAX_KM_SALTO
    });
  }

  return alertas;
}

async function asegurarConductorSesion(sesion, telefono) {
  if (sesion.conductor && sesion.conductor.id) {
    return sesion.conductor;
  }

  if (!sesion.placa) {
    return null;
  }

  var carga = await vehiculosData.cargarVehiculoYConductor(sesion.placa, telefono);
  if (!carga.error && carga.conductor) {
    sesion.conductor = carga.conductor;
    if (!sesion.vehiculo && carga.vehiculo) {
      sesion.vehiculo = carga.vehiculo;
    }
    return carga.conductor;
  }

  return null;
}

function construirDatosPreoperacional(sesion, ahora, hayBloqueo) {
  var kmReferencia = sesion.vehiculo && typeof sesion.vehiculo.kilometraje === 'number'
    ? sesion.vehiculo.kilometraje
    : null;
  var diferenciaKm = kmReferencia == null || sesion.kilometraje == null
    ? null
    : (sesion.kilometraje - kmReferencia);
  var alertasKm = construirAlertasKm(sesion, kmReferencia, diferenciaKm);

  return {
    vehiculo_placa: sesion.placa,
    conductor_id: sesion.conductor ? sesion.conductor.id : null,
    kilometraje: sesion.kilometraje,
    km_referencia: kmReferencia,
    diferencia_km: diferenciaKm,
    inconsistencia_km: alertasKm.length > 0,
    alertas_km: alertasKm,
    fecha: ahora.toISOString().split('T')[0],
    hora: ahora.toTimeString().split(' ')[0],
    estado: 'completado',
    motor_niveles: sesion.respuestas.motor_niveles || null,
    electrico_luces: sesion.respuestas.electrico_luces || null,
    frenos_direccion_llantas: sesion.respuestas.frenos_direccion_llantas || null,
    cabina_equipo: sesion.respuestas.cabina_equipo || null,
    novedades: sesion.novedades.map(function(n) {
      return {
        grupo: n.grupo,
        item: n.item,
        estado: n.estado || null,
        nota: n.nota || null,
        critico: !!n.critico,
        severidad: n.severidad || 'informativo'
      };
    }),
    observaciones: sesion.observacion || null,
    firma_operario: true,
    firma_timestamp: ahora.toISOString()
  };
}

function construirDatosSesionPdf(sesion, grupos, telefono, ahora) {
  var datosSesion = sesiones.copiarSesion(sesion);
  datosSesion.bloques = grupos.map(function(grupo) {
    var respGrupo = datosSesion.respuestas[grupo.id] || { items: [] };
    var itemsRespuesta = respGrupo.items || [];
    return {
      nombre: grupo.nombre,
      items: grupo.items.map(function(itemDef) {
        var encontrado = itemsRespuesta.find(function(r) { return r.nombre === itemDef.nombre; });
        return {
          nombre: itemDef.nombre,
          critico: itemDef.critico,
          estado: encontrado ? encontrado.estado : 'OK'
        };
      })
    };
  });
  datosSesion.items = datosSesion.novedades || [];
  datosSesion.telefono = telefono;
  datosSesion.fecha = ahora.toISOString();
  return datosSesion;
}

// ───────────────────────────────────────────────────────────
// construirMensajeSupervisorBloqueo — genera el mensaje de
// WhatsApp que recibe el supervisor cuando hay novedades
// que bloquean la salida del vehículo. Incluye las novedades
// y las opciones de respuesta.
// ───────────────────────────────────────────────────────────

function construirMensajeSupervisorBloqueo(placa, conductorNombre, novedadesBloqueo) {
  var lineas = novedadesBloqueo.map(function(n) {
    return '⛔ *' + (n.item || n.grupo || '—') + '* — ' + (n.estado || 'Mal estado');
  });

  return '🚨 *AUTORIZACIÓN REQUERIDA*\n' +
    '━━━━━━━━━━━━━━━━\n' +
    '🚗 Vehículo: *' + placa + '*\n' +
    '👤 Conductor: ' + (conductorNombre || 'No identificado') + '\n\n' +
    '⛔ *Novedades que BLOQUEAN la salida:*\n' +
    lineas.join('\n') + '\n\n' +
    '━━━━━━━━━━━━━━━━\n' +
    'Responde con la placa y tu decisión:\n\n' +
    '*AUTORIZAR ' + placa + '* — Autorizar salida\n' +
    '*TALLER ' + placa + '* — Enviar a taller\n' +
    '*RESTRINGIR ' + placa + '* — Restringir vehículo\n\n' +
    '_Sin respuesta, el vehículo permanece bloqueado._\n' +
    '_CERO — Sistema de gestión de operaciones_';
}

// ───────────────────────────────────────────────────────────
// notificarSupervisoresBloqueo — envía el mensaje de bloqueo
// a todos los supervisores y administradores registrados.
// Ejecución asíncrona sin bloquear el cierre.
// ───────────────────────────────────────────────────────────

async function notificarSupervisoresBloqueo(placa, conductorNombre, novedadesBloqueo) {
  try {
    var mensaje = construirMensajeSupervisorBloqueo(placa, conductorNombre, novedadesBloqueo);
    var alertasData = require('../../../data/alertas');
    var supervisores = await alertasData.obtenerContactosPorCargo('Supervisor');
    var administradores = await alertasData.obtenerContactosPorCargo('Administrador');
    var contactos = supervisores.concat(administradores);

    for (var i = 0; i < contactos.length; i++) {
      await alertasNotificador.enviarWhatsApp(contactos[i].telefono, mensaje);
    }

    console.log('🚨 Bloqueo notificado a ' + contactos.length + ' supervisor(es) — ' + placa);
  } catch (error) {
    console.error('❌ Error notificando bloqueo a supervisores:', error.message);
  }
}

async function guardarPreoperacionalCompleto(sesion, telefono, grupos) {
  var ahoraUTC = new Date();
  var ahora = new Date(ahoraUTC.getTime() - (5 * 60 * 60 * 1000));

  await asegurarConductorSesion(sesion, telefono);
  if (!sesion.conductor || !sesion.conductor.id) {
    throw new Error('Sesion incompleta: conductor no identificado para el telefono actual.');
  }

  // Detectar novedades bloqueantes (v12)
  var novedadesBloqueo = preop.obtenerNovedadesConBloqueo(sesion.novedades);
  var hayBloqueo = novedadesBloqueo.length > 0;

  var datosPreoperacional = construirDatosPreoperacional(sesion, ahora, hayBloqueo);

  var resPreop = await inspeccionesData.crearPreoperacional(datosPreoperacional);
  if (resPreop.error) {
    return { error: resPreop.error };
  }

  var preoperacional = resPreop.data;

  if (Array.isArray(sesion.fotos) && sesion.fotos.length > 0) {
    var resFotos = await inspeccionesData.guardarFotosEvidencia(preoperacional.id, sesion.fotos);
    if (resFotos.error) {
      console.error('Error guardando fotos:', resFotos.error);
    }
  }

  if (sesion.vehiculo && sesion.vehiculo.id && typeof sesion.kilometraje === 'number') {
    var resVehiculo = await inspeccionesData.actualizarKilometrajeVehiculo(sesion.vehiculo.id, sesion.kilometraje);
    if (resVehiculo.error) {
      console.error('Error actualizando kilometraje:', resVehiculo.error);
    }
  }

  // Crear registro de autorización si hay bloqueos — sin await para no bloquear respuesta
  if (hayBloqueo) {
    autorizacionesData.crearAutorizacion({
      preoperacionalId: preoperacional.id,
      placa: sesion.placa,
      conductorId: sesion.conductor.id,
      novedadesBloqueo: novedadesBloqueo.map(function(n) {
        return { grupo: n.grupo, item: n.item, estado: n.estado, severidad: n.severidad };
      })
    }).catch(function(err) {
      console.error('Error creando autorización:', err.message);
    });

    // Notificar a supervisores (fire-and-forget)
    notificarSupervisoresBloqueo(sesion.placa, sesion.conductor.nombre, novedadesBloqueo);
  } else {
    // Sin bloqueos — notificar novedades críticas normalmente (solo alertas)
    var novedadesCriticasAlerta = alertasReglas.obtenerNovedadesCriticas(sesion.novedades);
    alertasNotificador.notificarCriticas(sesion.placa, novedadesCriticasAlerta);
  }

  var novedadesCriticas = alertasReglas.obtenerNovedadesCriticas(sesion.novedades);
  var datosSesion = construirDatosSesionPdf(sesion, grupos, telefono, ahora);
  var pdfUrl = await pdf.subirYEnviarPDF(datosSesion, preoperacional.id, telefono);

  return {
    error: null,
    ahora: ahora,
    datosSesion: datosSesion,
    novedadesCriticas: novedadesCriticas,
    novedadesBloqueo: novedadesBloqueo,
    hayBloqueo: hayBloqueo,
    pdfUrl: pdfUrl,
    preop: preoperacional
  };
}

module.exports = {
  construirDatosPreoperacional,
  construirDatosSesionPdf,
  guardarPreoperacionalCompleto
};
