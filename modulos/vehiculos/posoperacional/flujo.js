/**
 * Flujo WhatsApp posoperacional — placa por texto, odómetro por OCR compartido,
 * novedades en texto libre, firma y cierre numéricos.
 */

'use strict';

var sesiones = require('../../../servicios/sesiones');
var storage = require('../../../servicios/storage');
var visual = require('../compartido/validacionVisual');
var vehiculosData = require('../../../data/vehiculos');
var posoperacionalesData = require('../../../data/posoperacionales');
var validaciones = require('./validaciones');
var estadoPosop = require('./estado');
var mensajes = require('./mensajes');
var cierre = require('./cierre');
var kilometrajeCompartido = require('../compartido/kilometraje');
var nav = require('../compartido/navegacion');

var ESTADOS = estadoPosop.ESTADOS;

function inicializarSesionPosoperacional(sesion) {
  sesion.tipo = 'posoperacional';
  sesion.estado = ESTADOS.INICIO;
  sesion.fotos = Array.isArray(sesion.fotos) ? sesion.fotos : [];
  estadoPosop.reiniciarDatosOperativos(sesion);
}

/**
 * Aplica km detectado o manual con validación contra referencia (posoperacional).
 */
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
  return mensajes.mensajeConfirmacionSegunKilometraje(sesion);
}

/**
 * Construye arreglo novedades para guardado/PDF si solo hay texto libre (flujo legacy).
 * Si ya hay novedades con severidad desde el flujo nuevo, no modifica.
 */
function asegurarNovedadesDesdeTextoLibre(sesion) {
  if (sesion.novedades && sesion.novedades.length > 0) return;

  if (sesion.novedadesTexto && (!sesion.novedades || sesion.novedades.length === 0)) {
    sesion.novedades = [
      {
        id:             'nov_libre_' + Date.now(),
        item:           'Novedades al cierre',
        estado:         sesion.novedadesTexto,
        texto:          sesion.novedadesTexto,
        texto_original: sesion.novedadesTexto,
        critico:        false,
        categoria:      'otro',
        severidad:      'leve',
        fuente:         'texto_libre'
      }
    ];
  }
}

async function procesarFotoOdometroPosop(res, sesion, mediaUrl) {
  if (!mediaUrl) {
    return validaciones.responderTwiml(res, '📸 Necesito una foto del odómetro para continuar.');
  }

  return await kilometrajeCompartido.procesarFotoOdometro(res, sesion, mediaUrl, {
    tipoFlujo: 'posoperacional',
    estadoConfirmacion: ESTADOS.ODOMETRO_CONFIRMACION,
    responderFn: validaciones.responderTwiml,
    procesarLecturaPos: async function(res, sesion, km, lecturaKm) {
      sesion.kmDetectado = km;
      sesion.kmLecturaFueraRango = false;

      if (km == null) {
        sesion.estado = ESTADOS.ODOMETRO_MANUAL;
        return validaciones.responderTwiml(
          res,
          '⚠️ No pude leer el odómetro con seguridad.\n\nEscribe el kilometraje manualmente usando solo números.'
        );
      }

      aplicarResultadoKilometraje(sesion, km, 'ocr');
      sesion.estado = ESTADOS.ODOMETRO_CONFIRMACION;
      return validaciones.responderTwiml(res, mensajeConfirmacionSegunKilometraje(sesion));
    }
  });
}

async function manejarKilometrajeManual(sesion, mensaje) {
  var kilometraje = visual.parsearKilometraje(mensaje);
  if (kilometraje === null) {
    return '❌ Escribe solo números para el kilometraje.\n\nEjemplo: *47889*';
  }

  aplicarResultadoKilometraje(sesion, kilometraje, 'manual');
  sesion.estado = ESTADOS.ODOMETRO_CONFIRMACION;
  return mensajeConfirmacionSegunKilometraje(sesion);
}

async function manejarConfirmacionKilometraje(sesion, mensaje) {
  var ml = String(mensaje || '').trim().toLowerCase();

  if (ml === '1' || ml === '1️⃣') {
    estadoPosop.registrarFotoOdometro(
      sesion,
      sesion.fotoOdometroTemporal,
      sesion.kmDetectado,
      sesion.origenKilometrajePendiente || 'ocr'
    );
    sesion.estado = ESTADOS.FOTO_ESTADO_GENERAL;
    return mensajes.mensajeFotoEstadoGeneral();
  }

  if (ml === '2' || ml === '2️⃣') {
    sesion.estado = ESTADOS.ODOMETRO_MANUAL;
    return '✍️ Escribe el kilometraje correcto (solo números).';
  }

  if (ml === '3' || ml === '3️⃣') {
    sesion.fotoOdometroTemporal = null;
    sesion.kmDetectado = null;
    sesion.estado = ESTADOS.ESPERANDO_FOTO_ODOMETRO;
    return '📸 Envía otra foto del odómetro.';
  }

  return 'Responde con *1*, *2* o *3*.';
}

async function manejarPlaca(sesion, telefono, mensaje) {
  var placa = validaciones.normalizarPlaca(mensaje);
  if (!placa || placa.length < 5 || placa.length > 10) {
    return '❌ Placa inválida.\n\nEscribe la placa correcta.\nEjemplo: *TKJ933*';
  }

  var carga = await vehiculosData.cargarVehiculoYConductor(placa, telefono);
  if (carga.error || !carga.vehiculo) {
    return '❌ Placa no encontrada. Verifica e intenta de nuevo.';
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

  return mensajes.mensajeVehiculoConfirmado(carga.vehiculo, sesion.kmReferenciaMeta);
}

async function manejarAtras(res, sesion) {
  switch (sesion.estado) {
    case ESTADOS.ESPERANDO_PLACA:
      sesion.estado = ESTADOS.INICIO;
      return validaciones.responderTwiml(res, mensajes.mensajeInicioPosoperacional());

    case ESTADOS.ESPERANDO_FOTO_ODOMETRO:
    case ESTADOS.ODOMETRO_CONFIRMACION:
    case ESTADOS.ODOMETRO_MANUAL:
      sesion.estado = ESTADOS.ESPERANDO_PLACA;
      return validaciones.responderTwiml(
        res,
        '◀️ Volvemos a la placa.\n\n' + mensajes.mensajeInicioPosoperacional()
      );

    // Volver al paso de fotos de estado (después del odómetro confirmado)
    case ESTADOS.NOVEDADES:
      sesion.estado = ESTADOS.FOTO_ESTADO_GENERAL;
      return validaciones.responderTwiml(res, mensajes.mensajeFotoEstadoGeneral());

    case ESTADOS.FOTO_ESTADO_GENERAL:
      storage.limpiarFotosPorTipo(sesion, ['estado_general']);
      sesion.estado = ESTADOS.ODOMETRO_CONFIRMACION;
      return validaciones.responderTwiml(res, mensajes.mensajeConfirmacionSegunKilometraje(sesion));

    case ESTADOS.DESCRIBIR_NOVEDADES:
      sesion.novedadesTexto = null;
      sesion.novedadTexto = null;
      sesion.estado = ESTADOS.NOVEDADES;
      return validaciones.responderTwiml(res, mensajes.mensajeNovedades());

    case ESTADOS.FOTO_NOVEDAD:
      storage.limpiarFotosPorTipo(sesion, ['novedad']);
      sesion.estado = ESTADOS.DESCRIBIR_NOVEDADES;
      return validaciones.responderTwiml(res, mensajes.mensajeDescribirNovedades());

    case ESTADOS.GRAVEDAD_NOVEDAD:
      sesion.estado = ESTADOS.FOTO_NOVEDAD;
      return validaciones.responderTwiml(res, mensajes.mensajeFotoNovedad());

    case ESTADOS.OBSERVACION:
      // Flujo con novedad clasificada: volver a elegir gravedad
      if (sesion.novedades && sesion.novedades.length > 0 && sesion.novedadTexto) {
        sesion.novedades = [];
        sesion.novedadSeveridad = null;
        sesion.estado = ESTADOS.GRAVEDAD_NOVEDAD;
        return validaciones.responderTwiml(res, mensajes.mensajeGravedadNovedad());
      }
      if (sesion.novedadesTexto) {
        sesion.estado = ESTADOS.DESCRIBIR_NOVEDADES;
        return validaciones.responderTwiml(res, mensajes.mensajeDescribirNovedades());
      }
      sesion.estado = ESTADOS.NOVEDADES;
      return validaciones.responderTwiml(res, mensajes.mensajeNovedades());

    case ESTADOS.OBSERVACION_TEXTO:
      sesion.estado = ESTADOS.OBSERVACION;
      return validaciones.responderTwiml(res, mensajes.mensajeObservacion());

    case ESTADOS.CONFIRMACION:
      sesion.estado = ESTADOS.OBSERVACION;
      return validaciones.responderTwiml(res, mensajes.mensajeObservacion());

    default:
      return validaciones.responderTwiml(res, 'No se puede retroceder desde aquí. Escribe *9* para el menú.');
  }
}

async function manejarConfirmacionFinal(sesion, telefono, mensaje) {
  var ml = String(mensaje || '').trim().toLowerCase();

  if (ml === '1' || ml === '1️⃣') {
    asegurarNovedadesDesdeTextoLibre(sesion);
    var guardado = await cierre.guardarPosoperacionalCompleto(sesion, telefono);
    if (guardado.error) {
      console.error('Error guardando posoperacional:', guardado.error.message || guardado.error);
      return '❌ No pude guardar el posoperacional. Intenta de nuevo o contacta al supervisor.';
    }

    sesiones.eliminarSesion(telefono);
    return mensajes.mensajeFirmaPosoperacional(guardado.datosSesion, guardado.pdfUrl);
  }

  if (ml === '2' || ml === '2️⃣') {
    sesion.estado = ESTADOS.OBSERVACION;
    return '◀️ Corregir observación.\n\n' + mensajes.mensajeObservacion();
  }

  return 'Responde *1* para firmar y cerrar o *2* para corregir. *0* atrás.';
}

async function manejarPosoperacional(req, res) {
  var telefono = req.body.From || '';
  var mensaje = (req.body.Body || '').trim();
  var mediaUrls = storage.obtenerMediaUrls(req);
  var mediaUrl = mediaUrls[0] || null;
  var numMedia = mediaUrls.length;
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
    var msgLower = mensaje.toLowerCase();

    if (nav.esMenu(mensaje)) {
      sesiones.eliminarSesion(telefono);
      sesiones.guardarCambios();
      return validaciones.responderTwiml(res, nav.textoMenuPrincipal());
    }

    if (nav.esAtras(mensaje)) {
      return await manejarAtras(res, sesion);
    }

    switch (sesion.estado) {
      case ESTADOS.INICIO:
        sesion.estado = ESTADOS.ESPERANDO_PLACA;
        return validaciones.responderTwiml(res, mensajes.mensajeInicioPosoperacional());

      case ESTADOS.ESPERANDO_PLACA:
        if (mediaUrl) {
          return validaciones.responderTwiml(res, 'En este paso necesito texto.\n\nEscribe la placa del vehículo.');
        }
        return validaciones.responderTwiml(res, await manejarPlaca(sesion, telefono, mensaje));

      case ESTADOS.ESPERANDO_FOTO_ODOMETRO:
        return await procesarFotoOdometroPosop(res, sesion, mediaUrl);

      case ESTADOS.ODOMETRO_MANUAL:
        if (mediaUrl) {
          sesion.estado = ESTADOS.ESPERANDO_FOTO_ODOMETRO;
          return await procesarFotoOdometroPosop(res, sesion, mediaUrl);
        }
        return validaciones.responderTwiml(res, await manejarKilometrajeManual(sesion, mensaje));

      case ESTADOS.ODOMETRO_CONFIRMACION:
        if (numMedia > 0 && mediaUrl) {
          return await procesarFotoOdometroPosop(res, sesion, mediaUrl);
        }
        return validaciones.responderTwiml(res, await manejarConfirmacionKilometraje(sesion, mensaje));

      case ESTADOS.FOTO_ESTADO_GENERAL: {
        // El conductor envía fotos del estado del vehículo al entregarlo
        if (mediaUrl) {
          sesion.fotos.push({
            tipo:        'estado_general',
            url:         mediaUrl,
            descripcion: 'Estado general del vehículo al cierre',
            validada:    true
          });
          return validaciones.responderTwiml(
            res,
            mensajes.mensajeFotoEstadoGeneral('✅ Foto guardada')
          );
        }

        if (msgLower === '1' || msgLower === '1️⃣') {
          sesion.estado = ESTADOS.NOVEDADES;
          return validaciones.responderTwiml(res, mensajes.mensajeNovedades());
        }

        return validaciones.responderTwiml(
          res,
          mensajes.mensajeFotoEstadoGeneral()
        );
      }

      case ESTADOS.NOVEDADES: {
        if (msgLower === '1' || msgLower === '1️⃣') {
          sesion.estado = ESTADOS.DESCRIBIR_NOVEDADES;
          return validaciones.responderTwiml(res, mensajes.mensajeDescribirNovedades());
        }
        if (msgLower === '2' || msgLower === '2️⃣') {
          sesion.novedadesTexto = null;
          sesion.novedadTexto = null;
          sesion.novedadSeveridad = null;
          sesion.novedades = [];
          sesion.estado = ESTADOS.OBSERVACION;
          return validaciones.responderTwiml(res, mensajes.mensajeObservacion());
        }
        return validaciones.responderTwiml(res, mensajes.mensajeNovedades());
      }

      case ESTADOS.DESCRIBIR_NOVEDADES:
        if (mediaUrl) {
          return validaciones.responderTwiml(res, 'En este paso necesito texto.\n\n' + mensajes.mensajeDescribirNovedades());
        }
        if (!mensaje) {
          return validaciones.responderTwiml(res, mensajes.mensajeDescribirNovedades());
        }
        sesion.novedadTexto = String(mensaje).trim();
        sesion.novedades = [];
        sesion.estado = ESTADOS.FOTO_NOVEDAD;
        return validaciones.responderTwiml(res, mensajes.mensajeFotoNovedad());

      case ESTADOS.FOTO_NOVEDAD: {
        if (mediaUrl) {
          sesion.fotos.push({
            tipo:        'novedad',
            url:         mediaUrl,
            descripcion: 'Foto de novedad al cierre',
            validada:    true
          });
          sesion.estado = ESTADOS.GRAVEDAD_NOVEDAD;
          return validaciones.responderTwiml(
            res,
            mensajes.mensajeGravedadNovedad()
          );
        }

        if (msgLower === '1' || msgLower === '1️⃣') {
          sesion.estado = ESTADOS.GRAVEDAD_NOVEDAD;
          return validaciones.responderTwiml(
            res,
            mensajes.mensajeGravedadNovedad()
          );
        }

        return validaciones.responderTwiml(
          res,
          mensajes.mensajeFotoNovedad()
        );
      }

      case ESTADOS.GRAVEDAD_NOVEDAD: {
        if (mediaUrl) {
          return validaciones.responderTwiml(
            res,
            '⌨️ En este paso necesito un número (1, 2 o 3).\n\n' +
            mensajes.mensajeGravedadNovedad()
          );
        }

        var severidad;
        var esCritica;

        if (msgLower === '1' || msgLower === '1️⃣') {
          severidad = 'critica';
          esCritica = true;
        } else if (msgLower === '2' || msgLower === '2️⃣') {
          severidad = 'moderada';
          esCritica = false;
        } else if (msgLower === '3' || msgLower === '3️⃣') {
          severidad = 'leve';
          esCritica = false;
        } else {
          return validaciones.responderTwiml(
            res,
            mensajes.mensajeGravedadNovedad()
          );
        }

        sesion.novedadSeveridad = severidad;
        sesion.novedades = [{
          item:           'Novedades al cierre',
          estado:         sesion.novedadTexto || '',
          texto:          sesion.novedadTexto || '',
          texto_original: sesion.novedadTexto || '',
          severidad:      severidad,
          critico:        esCritica,
          categoria:      'cierre',
          fuente:         'texto_libre'
        }];

        if (esCritica) {
          sesion.estado = ESTADOS.OBSERVACION;
          return validaciones.responderTwiml(
            res,
            '🚨 *Novedad crítica registrada*\n_El supervisor será notificado_\n\n' +
            mensajes.mensajeObservacion()
          );
        }

        sesion.estado = ESTADOS.OBSERVACION;
        return validaciones.responderTwiml(res, mensajes.mensajeObservacion());
      }

      case ESTADOS.OBSERVACION: {
        if (msgLower === '1' || msgLower === '1️⃣') {
          sesion.observacion = null;
          sesion.estado = ESTADOS.CONFIRMACION;
          asegurarNovedadesDesdeTextoLibre(sesion);
          return validaciones.responderTwiml(
            res,
            mensajes.mensajeResumenPosoperacional(
              sesion,
              validaciones.generarResumenPosoperacional(sesion)
            )
          );
        }
        if (msgLower === '2' || msgLower === '2️⃣') {
          sesion.estado = ESTADOS.OBSERVACION_TEXTO;
          return validaciones.responderTwiml(res, '✍️ Escribe la observación final.');
        }
        return validaciones.responderTwiml(res, mensajes.mensajeObservacion());
      }

      case ESTADOS.OBSERVACION_TEXTO:
        if (mediaUrl) {
          return validaciones.responderTwiml(res, 'En este paso solo texto.\n\nEscribe la observación.');
        }
        sesion.observacion = String(mensaje || '').trim() || null;
        sesion.estado = ESTADOS.CONFIRMACION;
        asegurarNovedadesDesdeTextoLibre(sesion);
        return validaciones.responderTwiml(
          res,
          mensajes.mensajeResumenPosoperacional(
            sesion,
            validaciones.generarResumenPosoperacional(sesion)
          )
        );

      case ESTADOS.CONFIRMACION:
        return validaciones.responderTwiml(res, await manejarConfirmacionFinal(sesion, telefono, mensaje));

      default:
        sesion.estado = ESTADOS.ESPERANDO_PLACA;
        return validaciones.responderTwiml(res, mensajes.mensajeInicioPosoperacional());
    }
  } catch (error) {
    console.error('Error en flujo posoperacional:', error.message || error);
    return validaciones.responderTwiml(res, '❌ Ocurrió un error.\n\nEscribe *9* para volver al menú.');
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
