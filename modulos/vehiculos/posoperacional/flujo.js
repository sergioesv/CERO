var config = require('../../../config/config');
var sesiones = require('../../../servicios/sesiones');
var storage = require('../../../servicios/storage');
var visual = require('../compartido/validacionVisual');
var vehiculosData = require('../../../data/vehiculos');
var posoperacionalesData = require('../../../data/posoperacionales');
var validaciones = require('./validaciones');
var estadoPosop = require('./estado');
var mensajes = require('./mensajes');
var cierre = require('./cierre');

var ESTADOS = {
  INICIO: 'POSOP_INICIO',
  ESPERANDO_PLACA: 'POSOP_ESPERANDO_PLACA',
  ESPERANDO_FOTO_ODOMETRO: 'POSOP_ESPERANDO_FOTO_ODOMETRO',
  CONFIRMACION_KM: 'POSOP_CONFIRMACION_KM',
  KM_MANUAL: 'POSOP_KM_MANUAL',
  TIENE_NOVEDADES: 'POSOP_TIENE_NOVEDADES',
  DESCRIBIR_NOVEDAD: 'POSOP_DESCRIBIR_NOVEDAD',
  CONFIRMAR_NOVEDAD: 'POSOP_CONFIRMAR_NOVEDAD',
  FOTO_NOVEDAD: 'POSOP_FOTO_NOVEDAD',
  AGREGAR_OTRA_NOVEDAD: 'POSOP_AGREGAR_OTRA_NOVEDAD',
  OBSERVACIONES: 'POSOP_OBSERVACIONES',
  CONFIRMACION_FINAL: 'POSOP_CONFIRMACION_FINAL'
};

function inicializarSesionPosoperacional(sesion) {
  sesion.tipo = 'posoperacional';
  sesion.estado = ESTADOS.INICIO;
  sesion.fotos = Array.isArray(sesion.fotos) ? sesion.fotos : [];
  estadoPosop.reiniciarDatosOperativos(sesion);
}

function aplicarResultadoKilometraje(sesion, kilometraje, origen) {
  sesion.kmDetectado = kilometraje;
  sesion.origenKilometrajePendiente = origen || 'ocr';

  var evaluacion = validaciones.validarKilometrajeFinal(
    kilometraje,
    sesion.kmReferenciaMeta,
    validaciones.MAX_KM_SALTO_POSOP
  );

  sesion.kmReferencia = evaluacion.kmReferencia;
  sesion.diferenciaKm = evaluacion.diferenciaKm;
  sesion.alertasKm = evaluacion.alertasKm;
  sesion.inconsistenciaKm = evaluacion.inconsistenciaKm;

  return evaluacion;
}

function mensajeConfirmacionSegunKilometraje(sesion) {
  if (sesion.inconsistenciaKm && sesion.alertasKm && sesion.alertasKm.length) {
    return mensajes.mensajeAlertaKilometraje(sesion);
  }
  return mensajes.mensajeConfirmacionKilometraje(sesion);
}

async function manejarAtras(res, sesion) {
  switch (sesion.estado) {
    case ESTADOS.ESPERANDO_PLACA:
      sesion.estado = ESTADOS.INICIO;
      return validaciones.responderTwiml(res, mensajes.mensajeInicio());

    case ESTADOS.ESPERANDO_FOTO_ODOMETRO:
    case ESTADOS.CONFIRMACION_KM:
    case ESTADOS.KM_MANUAL:
      sesion.estado = ESTADOS.ESPERANDO_PLACA;
      return validaciones.responderTwiml(res, '◀️ Volvemos a la placa.\n\n' + mensajes.mensajeInicio());

    case ESTADOS.TIENE_NOVEDADES:
      estadoPosop.volverAKilometraje(sesion);
      return validaciones.responderTwiml(res, '◀️ Volvemos al kilometraje.\n\n' + mensajes.mensajeSolicitudOdometro(sesion.vehiculo || {}, sesion.kmReferenciaMeta));

    case ESTADOS.DESCRIBIR_NOVEDAD:
    case ESTADOS.CONFIRMAR_NOVEDAD:
      sesion.estado = ESTADOS.TIENE_NOVEDADES;
      return validaciones.responderTwiml(res, '◀️ Volvemos a la pregunta de novedades.\n\n' + mensajes.mensajePreguntaNovedades());

    case ESTADOS.FOTO_NOVEDAD:
    case ESTADOS.AGREGAR_OTRA_NOVEDAD:
      sesion.estado = ESTADOS.DESCRIBIR_NOVEDAD;
      return validaciones.responderTwiml(res, '◀️ Volvemos a registrar la novedad.\n\n' + mensajes.mensajeSolicitarNovedad());

    case ESTADOS.OBSERVACIONES:
      if (sesion.novedades && sesion.novedades.length) {
        sesion.estado = ESTADOS.AGREGAR_OTRA_NOVEDAD;
        return validaciones.responderTwiml(res, '◀️ Volvemos a las novedades.\n\n' + mensajes.mensajeAgregarOtraNovedad());
      }
      sesion.estado = ESTADOS.TIENE_NOVEDADES;
      return validaciones.responderTwiml(res, '◀️ Volvemos a la pregunta de novedades.\n\n' + mensajes.mensajePreguntaNovedades());

    case ESTADOS.CONFIRMACION_FINAL:
      sesion.estado = ESTADOS.OBSERVACIONES;
      return validaciones.responderTwiml(res, '◀️ Volvemos a observaciones.\n\n' + mensajes.mensajeObservaciones());

    default:
      return validaciones.responderTwiml(res, 'No se puede retroceder desde aquí. Escribe *CANCELAR* para salir.');
  }
}

async function manejarPlaca(sesion, telefono, mensaje) {
  var placa = validaciones.normalizarPlaca(mensaje);
  if (!placa || placa.length < 5 || placa.length > 10) {
    return '❌ Placa inválida.\n\nEscribe la placa correcta.\nEjemplo: *TKJ933*';
  }

  var carga = await vehiculosData.cargarVehiculoYConductor(placa, telefono);
  if (carga.error || !carga.vehiculo) {
    return '❌ El vehículo *' + placa + '* no existe en la base.\n\nVerifica la placa.';
  }

  if (carga.vehiculo.bloqueado) {
    return '🚫 *Vehículo bloqueado*\n' + placa + '\n' + (carga.vehiculo.motivo_bloqueo || 'Contacta al supervisor.');
  }

  sesion.placa = placa;
  sesion.vehiculo = carga.vehiculo;
  sesion.conductor = carga.conductor || null;
  sesion.kmReferenciaMeta = await posoperacionalesData.obtenerReferenciaKilometraje(placa);
  sesion.kmReferencia = sesion.kmReferenciaMeta.kilometraje;
  sesion.estado = ESTADOS.ESPERANDO_FOTO_ODOMETRO;

  return mensajes.mensajeSolicitudOdometro(carga.vehiculo, sesion.kmReferenciaMeta);
}

async function manejarFotoOdometro(sesion, mediaUrl) {
  if (!mediaUrl) {
    return '📸 Necesito una foto del odómetro para continuar.';
  }

  sesion.fotoOdometroTemporal = mediaUrl;
  var resultado = await visual.resolverFotoOdometroOperativa(
    mediaUrl,
    sesion.kmReferenciaMeta,
    validaciones.MAX_KM_SALTO_POSOP
  );

  if (resultado.tipo === 'manual') {
    sesion.estado = ESTADOS.KM_MANUAL;
    return '⚠️ No pude leer el odómetro con seguridad.\n\nEscribe el kilometraje manualmente.';
  }

  aplicarResultadoKilometraje(sesion, resultado.kilometraje, 'ocr');
  sesion.estado = ESTADOS.CONFIRMACION_KM;
  return mensajeConfirmacionSegunKilometraje(sesion);
}

function parsearKilometraje(mensaje) {
  return visual.parsearKilometraje(mensaje);
}

async function manejarKilometrajeManual(sesion, mensaje) {
  var kilometraje = parsearKilometraje(mensaje);
  if (kilometraje === null) {
    return '❌ Escribe solo números para el kilometraje.\n\nEjemplo: *47889*';
  }

  aplicarResultadoKilometraje(sesion, kilometraje, 'manual');
  sesion.estado = ESTADOS.CONFIRMACION_KM;
  return mensajeConfirmacionSegunKilometraje(sesion);
}

async function manejarConfirmacionKilometraje(sesion, mensaje) {
  if (mensaje === '1') {
    estadoPosop.registrarFotoOdometro(
      sesion,
      sesion.fotoOdometroTemporal,
      sesion.kmDetectado,
      sesion.origenKilometrajePendiente || 'ocr'
    );
    sesion.estado = ESTADOS.TIENE_NOVEDADES;
    return mensajes.mensajePreguntaNovedades();
  }

  if (mensaje === '2') {
    sesion.estado = ESTADOS.KM_MANUAL;
    return '✍️ Escribe el kilometraje correcto.';
  }

  if (mensaje === '3') {
    sesion.fotoOdometroTemporal = null;
    sesion.kmDetectado = null;
    sesion.estado = ESTADOS.ESPERANDO_FOTO_ODOMETRO;
    return '📸 Envía otra foto del odómetro.';
  }

  return 'Responde con *1*, *2* o *3*.';
}

async function manejarPreguntaNovedades(sesion, mensaje) {
  if (mensaje === '1') {
    sesion.estado = ESTADOS.DESCRIBIR_NOVEDAD;
    return mensajes.mensajeSolicitarNovedad();
  }

  if (mensaje === '2') {
    sesion.estado = ESTADOS.OBSERVACIONES;
    return mensajes.mensajeObservaciones();
  }

  if (mensaje === '3') {
    return manejarAtrasInternoNovedades(sesion);
  }

  return 'Responde con *1* si hubo novedades, *2* si no hubo, o *3* para atrás.';
}

function manejarAtrasInternoNovedades(sesion) {
  estadoPosop.volverAKilometraje(sesion);
  return '◀️ Volvemos al kilometraje.\n\n' + mensajes.mensajeSolicitudOdometro(sesion.vehiculo || {}, sesion.kmReferenciaMeta);
}

async function manejarDescripcionNovedad(sesion, mensaje) {
  if (!mensaje) {
    return mensajes.mensajeSolicitarNovedad();
  }

  var interpretadas = await validaciones.interpretarNovedadLibre(mensaje);
  sesion.novedadesInterpretadasTemp = interpretadas;
  sesion.estado = ESTADOS.CONFIRMAR_NOVEDAD;
  return mensajes.mensajeConfirmarNovedadInterpretada(interpretadas);
}

async function manejarConfirmacionNovedad(sesion, mensaje) {
  if (mensaje === '1') {
    estadoPosop.agregarNovedades(sesion, sesion.novedadesInterpretadasTemp || []);
    sesion.novedadesInterpretadasTemp = [];

    var siguiente = estadoPosop.siguienteNovedadConFoto(sesion);
    if (siguiente) {
      sesion.estado = ESTADOS.FOTO_NOVEDAD;
      return mensajes.mensajeSolicitarFotoNovedad(siguiente, sesion.fotosNovedadPendientes.length);
    }

    sesion.estado = ESTADOS.AGREGAR_OTRA_NOVEDAD;
    return mensajes.mensajeAgregarOtraNovedad();
  }

  if (mensaje === '2') {
    sesion.estado = ESTADOS.DESCRIBIR_NOVEDAD;
    return '✍️ Escribe de nuevo la novedad.';
  }

  if (mensaje === '3') {
    sesion.novedadesInterpretadasTemp = [];
    sesion.estado = ESTADOS.AGREGAR_OTRA_NOVEDAD;
    return mensajes.mensajeAgregarOtraNovedad();
  }

  return 'Responde con *1*, *2* o *3*.';
}

async function manejarFotoNovedad(sesion, mensaje, mediaUrl) {
  var actual = estadoPosop.siguienteNovedadConFoto(sesion);
  if (!actual) {
    sesion.estado = ESTADOS.AGREGAR_OTRA_NOVEDAD;
    return mensajes.mensajeAgregarOtraNovedad();
  }

  if (!mediaUrl) {
    if (String(mensaje || '').toUpperCase() === 'NO') {
      sesion.estado = ESTADOS.AGREGAR_OTRA_NOVEDAD;
      return mensajes.mensajeAgregarOtraNovedad();
    }
    return '📸 En este paso necesito una foto.\n\nEnvía la evidencia o escribe *NO* para continuar sin foto.';
  }

  estadoPosop.registrarFotoNovedad(sesion, actual, mediaUrl);
  var siguiente = estadoPosop.siguienteNovedadConFoto(sesion);
  if (siguiente) {
    sesion.estado = ESTADOS.FOTO_NOVEDAD;
    return mensajes.mensajeSolicitarFotoNovedad(siguiente, sesion.fotosNovedadPendientes.length);
  }

  sesion.estado = ESTADOS.AGREGAR_OTRA_NOVEDAD;
  return mensajes.mensajeAgregarOtraNovedad();
}

async function manejarAgregarOtraNovedad(sesion, mensaje) {
  if (mensaje === '1') {
    sesion.estado = ESTADOS.DESCRIBIR_NOVEDAD;
    return mensajes.mensajeSolicitarNovedad();
  }

  if (mensaje === '2') {
    sesion.estado = ESTADOS.OBSERVACIONES;
    return mensajes.mensajeObservaciones();
  }

  return 'Responde con *1* para agregar otra novedad o *2* para continuar.';
}

async function manejarObservaciones(sesion, mensaje) {
  sesion.observacion = String(mensaje || '').trim().toLowerCase() === 'no' ? null : String(mensaje || '').trim();
  sesion.estado = ESTADOS.CONFIRMACION_FINAL;
  return mensajes.mensajeConfirmacionFinal(sesion, validaciones.generarResumenPosoperacional(sesion));
}

async function manejarConfirmacionFinal(sesion, telefono, mensaje) {
  if (String(mensaje || '').toUpperCase() !== 'SI') {
    return 'Escribe *SI* para firmar y cerrar el posoperacional.\nTambién puedes escribir *ATRAS* o *CANCELAR*.';
  }

  var guardado = await cierre.guardarPosoperacionalCompleto(sesion, telefono);
  if (guardado.error) {
    console.error('Error guardando posoperacional:', guardado.error.message || guardado.error);
    return '❌ No pude guardar el posoperacional. Intenta de nuevo o contacta al supervisor.';
  }

  sesiones.eliminarSesion(telefono);
  return mensajes.mensajeFinalizado(guardado.datosSesion, guardado.pdfUrl);
}

async function manejarPosoperacional(req, res) {
  var telefono = req.body.From || '';
  var mensaje = (req.body.Body || '').trim();
  var mediaUrls = storage.obtenerMediaUrls(req);
  var mediaUrl = mediaUrls[0] || null;
  var sesion;

  if (!sesiones.bloquear(telefono)) {
    return validaciones.responderTwiml(res, 'Un momento, procesando tu mensaje anterior...');
  }

  try {
    sesion = await sesiones.obtenerSesion(telefono);

    if (sesion.tipo !== 'posoperacional' || !Array.isArray(sesion.novedades) || !Array.isArray(sesion.fotos)) {
      inicializarSesionPosoperacional(sesion);
    }

    var msgUpper = mensaje.toUpperCase();

    if (msgUpper === 'CANCELAR') {
      sesiones.eliminarSesion(telefono);
      return validaciones.responderTwiml(res, '❌ Posoperacional cancelado.\nEscribe MENU para volver al inicio.');
    }

    if (msgUpper === 'ATRAS') {
      return await manejarAtras(res, sesion);
    }

    switch (sesion.estado) {
      case ESTADOS.INICIO:
        sesion.estado = ESTADOS.ESPERANDO_PLACA;
        return validaciones.responderTwiml(res, mensajes.mensajeInicio());

      case ESTADOS.ESPERANDO_PLACA:
        if (mediaUrl) {
          return validaciones.responderTwiml(res, 'En este paso necesito texto.\n\nEscribe la placa del vehículo.');
        }
        return validaciones.responderTwiml(res, await manejarPlaca(sesion, telefono, mensaje));

      case ESTADOS.ESPERANDO_FOTO_ODOMETRO:
        return validaciones.responderTwiml(res, await manejarFotoOdometro(sesion, mediaUrl));

      case ESTADOS.KM_MANUAL:
        if (mediaUrl) {
          sesion.estado = ESTADOS.ESPERANDO_FOTO_ODOMETRO;
          return validaciones.responderTwiml(res, await manejarFotoOdometro(sesion, mediaUrl));
        }
        return validaciones.responderTwiml(res, await manejarKilometrajeManual(sesion, mensaje));

      case ESTADOS.CONFIRMACION_KM:
        return validaciones.responderTwiml(res, await manejarConfirmacionKilometraje(sesion, mensaje));

      case ESTADOS.TIENE_NOVEDADES:
        return validaciones.responderTwiml(res, await manejarPreguntaNovedades(sesion, mensaje));

      case ESTADOS.DESCRIBIR_NOVEDAD:
        if (mediaUrl) {
          return validaciones.responderTwiml(res, 'En este paso necesito texto.\n\n' + mensajes.mensajeSolicitarNovedad());
        }
        return validaciones.responderTwiml(res, await manejarDescripcionNovedad(sesion, mensaje));

      case ESTADOS.CONFIRMAR_NOVEDAD:
        return validaciones.responderTwiml(res, await manejarConfirmacionNovedad(sesion, mensaje));

      case ESTADOS.FOTO_NOVEDAD:
        return validaciones.responderTwiml(res, await manejarFotoNovedad(sesion, mensaje, mediaUrl));

      case ESTADOS.AGREGAR_OTRA_NOVEDAD:
        return validaciones.responderTwiml(res, await manejarAgregarOtraNovedad(sesion, mensaje));

      case ESTADOS.OBSERVACIONES:
        if (mediaUrl) {
          return validaciones.responderTwiml(res, 'En este paso solo necesito texto.\n\n' + mensajes.mensajeObservaciones());
        }
        if (!mensaje) {
          return validaciones.responderTwiml(res, mensajes.mensajeObservaciones());
        }
        return validaciones.responderTwiml(res, await manejarObservaciones(sesion, mensaje));

      case ESTADOS.CONFIRMACION_FINAL:
        return validaciones.responderTwiml(res, await manejarConfirmacionFinal(sesion, telefono, mensaje));

      default:
        sesion.estado = ESTADOS.ESPERANDO_PLACA;
        return validaciones.responderTwiml(res, mensajes.mensajeInicio());
    }
  } catch (error) {
    console.error('Error en flujo posoperacional:', error.message || error);
    return validaciones.responderTwiml(res, '❌ Ocurrió un error. Escribe MENU para reiniciar.');
  } finally {
    sesiones.desbloquear(telefono);
    sesiones.guardarCambios();
  }
}

function registrarPosoperacional(app) {
  app.post('/webhook/posoperacional', manejarPosoperacional);
}

module.exports = {
  ESTADOS,
  registrarPosoperacional,
  manejarPosoperacional
};
