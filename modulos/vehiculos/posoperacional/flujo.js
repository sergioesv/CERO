/**
 * Flujo WhatsApp posoperacional — placa por texto, odómetro por OCR compartido,
 * novedades en texto libre, firma y cierre numéricos.
 */

'use strict';

var sesiones = require('../../../servicios/sesiones');
var storage = require('../../../servicios/storage');
var config = require('../../../config/config');
var validaciones = require('./validaciones');
var estadoPosop = require('./estado');
var mensajes = require('./mensajes');
var cierre = require('./cierre');
var nav = require('../compartido/navegacion');
var iniciadorFlujo = require('../compartido/iniciadorFlujo');
// Reservado para alinear con data/inspecciones (referencia km); iniciadorFlujo ya la usa internamente.
var inspeccionesData = require('../../../data/inspecciones'); // eslint-disable-line no-unused-vars

var ESTADOS = estadoPosop.ESTADOS;

// Manejadores configurados con factory
var manejarPlacaCompartido = iniciadorFlujo.crearManejadorPlaca({
  ESTADOS: ESTADOS,
  mensajes: mensajes,
  validaciones: validaciones,
  tipoFlujo: 'posoperacional',
  mensajeConfirmacion: mensajes.mensajeVehiculoConfirmado
});

var procesarFotoPlacaCompartido = iniciadorFlujo.crearProcesadorFotoPlaca({
  ESTADOS: ESTADOS,
  mensajes: mensajes,
  validaciones: validaciones,
  manejarPlacaCompartido: manejarPlacaCompartido,
  tipoFotoPlaca: 'inicio_placa'
});

var procesarFotoOdometroCompartido = iniciadorFlujo.crearProcesadorFotoOdometro({
  ESTADOS: ESTADOS,
  mensajes: mensajes,
  validaciones: validaciones,
  tipoFlujo: 'posoperacional',
  config: config,
  procesarLecturaPos: async function(res, sesion, km) {
    sesion.kmDetectado = km;
    sesion.kmLecturaFueraRango = false;

    if (km == null) {
      return validaciones.responderTwiml(
        res,
        '\u26A0\uFE0F No pude leer el kilometraje.\n\n' +
        '1\uFE0F\u20E3 Escribir kilometraje manualmente\n' +
        '2\uFE0F\u20E3 Enviar otra foto' +
        nav.PIE_NAV
      );
    }

    if (km != null && typeof sesion.kmReferencia === 'number') {
      sesion.diferenciaKm = km - sesion.kmReferencia;

      if (km < sesion.kmReferencia) {
        sesion.inconsistenciaKm = true;
        sesion.kmLecturaFueraRango = true;
        sesion.alertasKm = [{
          tipo: 'kilometraje_menor',
          mensaje: 'Kilometraje menor al último registrado'
        }];
      } else if (sesion.diferenciaKm > 500) {
        sesion.inconsistenciaKm = true;
        sesion.kmLecturaFueraRango = true;
        sesion.alertasKm = [{
          tipo: 'kilometraje_alto',
          mensaje: 'Diferencia superior a 500 km'
        }];
      }
    }

    return validaciones.responderTwiml(res, mensajes.mensajeConfirmacionSegunKilometraje(sesion));
  }
});

function inicializarSesionPosoperacional(sesion) {
  sesion.tipo = 'posoperacional';
  sesion.estado = ESTADOS.INICIO;
  sesion.fotos = Array.isArray(sesion.fotos) ? sesion.fotos : [];
  estadoPosop.reiniciarDatosOperativos(sesion);
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
    return validaciones.responderTwiml(res, '\uD83D\uDCF8 Necesito una foto del odómetro para continuar.');
  }
  return await procesarFotoOdometroCompartido(res, sesion, mediaUrl);
}

async function manejarConfirmacionKilometraje(sesion, mensaje) {
  var msgLower = String(mensaje || '').trim().toLowerCase();

  if (msgLower === '1' || msgLower === '1️⃣') {
    var origenFinal = sesion.kmLecturaFueraRango
      ? 'Confirmado con alerta: ' + sesion.kmDetectado + ' km'
      : 'OCR confirmado: ' + sesion.kmDetectado + ' km';

    estadoPosop.registrarFotoOdometro(sesion, sesion.fotoOdometroTemporal, sesion.kmDetectado, origenFinal);
    sesion.estado = ESTADOS.FOTO_ESTADO_GENERAL;
    return mensajes.mensajeFotoEstadoGeneral();
  }

  if (msgLower === '2' || msgLower === '2️⃣') {
    sesion.estado = ESTADOS.ODOMETRO_MANUAL;
    return '\u2328\uFE0F Escribe el kilometraje correcto.\nEjemplo: *267354*' + nav.PIE_NAV;
  }

  if (msgLower === '3' || msgLower === '3️⃣') {
    estadoPosop.volverAKilometraje(sesion);
    return mensajes.mensajeVehiculoConfirmado(sesion.vehiculo, sesion.kmReferenciaMeta);
  }

  return mensajes.mensajeConfirmacionSegunKilometraje(sesion);
}

async function manejarKilometrajeManual(sesion, mensaje) {
  var kmStr = String(mensaje || '').replace(/[^0-9]/g, '');
  var kmNum = kmStr ? parseInt(kmStr, 10) : null;

  if (kmNum == null || kmStr.length < 4) {
    return '\u2328\uFE0F Escribe el kilometraje con números.\nEjemplo: *127892*' + nav.PIE_NAV;
  }

  var alertasManual = [];
  if (typeof sesion.kmReferencia === 'number') {
    if (kmNum < sesion.kmReferencia) {
      alertasManual.push({
        tipo: 'kilometraje_menor',
        mensaje: 'Kilometraje menor al último registrado'
      });
    } else if (kmNum - sesion.kmReferencia > 500) {
      alertasManual.push({
        tipo: 'kilometraje_alto',
        mensaje: 'Diferencia superior a 500 km'
      });
    }
  }

  sesion.alertasKm = alertasManual;
  sesion.inconsistenciaKm = alertasManual.length > 0;
  sesion.diferenciaKm = typeof sesion.kmReferencia === 'number' ? kmNum - sesion.kmReferencia : null;

  var origenManual = 'Kilometraje manual: ' + kmNum + ' km';
  if (alertasManual.length > 0) {
    origenManual += ' (con alerta)';
  }

  estadoPosop.registrarFotoOdometro(sesion, sesion.fotoOdometroTemporal, kmNum, origenManual);
  sesion.estado = ESTADOS.FOTO_ESTADO_GENERAL;

  var aviso = alertasManual.length > 0
    ? '\u26A0\uFE0F Kilometraje registrado con alerta.\n\n'
    : '';

  return aviso + mensajes.mensajeFotoEstadoGeneral();
}

async function manejarAtras(res, sesion) {
  switch (sesion.estado) {
    case ESTADOS.ESPERANDO_PLACA:
    case ESTADOS.PLACA_CONFIRMACION_SUGERIDA:
    case ESTADOS.PLACA_FALLBACK:
    case ESTADOS.PLACA_MANUAL:
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
      case ESTADOS.ESPERANDO_PLACA:
        if (numMedia > 0 && mediaUrl) {
           return await procesarFotoPlacaCompartido(res, sesion, telefono, mediaUrl);
        }
        if (nav.esOpcion(msgLower, ['9', '9️⃣', '0', '0️⃣'])) return validaciones.responderTwiml(res, nav.textoMenuPrincipal());
        if (!mensaje || sesion.estado === ESTADOS.INICIO) {
           sesion.estado = ESTADOS.ESPERANDO_PLACA;
           return validaciones.responderTwiml(res, mensajes.mensajeInicioPosoperacional());
        }
        var mensajePlaca = await manejarPlacaCompartido(sesion, telefono, mensaje);
        return validaciones.responderTwiml(res, mensajePlaca);

      case ESTADOS.PLACA_CONFIRMACION_SUGERIDA:
        if (numMedia > 0 && mediaUrl) return await procesarFotoPlacaCompartido(res, sesion, telefono, mediaUrl);
        if (nav.esOpcion(msgLower, ['9', '9️⃣', '0', '0️⃣'])) {
          sesiones.eliminarSesion(telefono);
          sesiones.guardarCambios();
          return validaciones.responderTwiml(res, nav.textoMenuPrincipal());
        }

        if (msgLower === '1' || msgLower === '1️⃣' || msgLower === 'confirmar') {
          if (!sesion.placaSugerida) return validaciones.responderTwiml(res, mensajes.mensajeConfirmacionPlacaSugerida(sesion));
          
          var fotoPlacaRef = sesion.fotoPlacaTemporal;
          var mensajeSugerido = await manejarPlacaCompartido(sesion, telefono, sesion.placaSugerida);
          var esExito = typeof mensajeSugerido === 'string' && mensajeSugerido.length > 0 && mensajeSugerido.charCodeAt(0) === 0x2705;
          if (esExito) {
            estadoPosop.reiniciarDatosOperativos(sesion);
            if (fotoPlacaRef) {
              storage.guardarFotoUnica(sesion, {
                tipo: 'inicio_placa',
                url: fotoPlacaRef,
                validacion: 'Placa confirmada desde sugerencia: ' + sesion.placaSugerida,
                descripcion: 'Placa OCR: ' + sesion.placaSugerida,
                validada: true
              });
            }
          }
          return validaciones.responderTwiml(res, mensajeSugerido);
        }

        if (msgLower === '2' || msgLower === '2️⃣' || msgLower === 'foto') {
          sesion.estado = ESTADOS.ESPERANDO_PLACA;
          return validaciones.responderTwiml(res, mensajes.mensajeInicioPosoperacional());
        }

        if (msgLower === '3' || msgLower === '3️⃣') {
          sesion.estado = ESTADOS.PLACA_MANUAL;
          return validaciones.responderTwiml(res, '⌨️ Escribe la placa manualmente.\nEjemplo: *IDL354*');
        }

        return validaciones.responderTwiml(res, mensajes.mensajeConfirmacionPlacaSugerida(sesion));

      case ESTADOS.PLACA_FALLBACK:
        if (numMedia > 0 && mediaUrl) return await procesarFotoPlacaCompartido(res, sesion, telefono, mediaUrl);
        if (nav.esOpcion(msgLower, ['9', '9️⃣', '0', '0️⃣'])) {
          sesiones.eliminarSesion(telefono);
          sesiones.guardarCambios();
          return validaciones.responderTwiml(res, nav.textoMenuPrincipal());
        }
        
        if (msgLower === '1' || msgLower === '1️⃣' || msgLower === 'foto') {
          sesion.estado = ESTADOS.ESPERANDO_PLACA;
          return validaciones.responderTwiml(res, mensajes.mensajeInicioPosoperacional());
        }
        if (msgLower === '2' || msgLower === '2️⃣') {
          sesion.estado = ESTADOS.PLACA_MANUAL;
          return validaciones.responderTwiml(res, '⌨️ Escribe la placa manualmente.\nEjemplo: *IDL354*');
        }
        return validaciones.responderTwiml(res, mensajes.mensajeFallbackPlaca(sesion));

      case ESTADOS.PLACA_MANUAL:
        if (numMedia > 0 && mediaUrl) return await procesarFotoPlacaCompartido(res, sesion, telefono, mediaUrl);
        if (nav.esOpcion(msgLower, ['9', '9️⃣', '0', '0️⃣'])) {
          sesiones.eliminarSesion(telefono);
          sesiones.guardarCambios();
          return validaciones.responderTwiml(res, nav.textoMenuPrincipal());
        }

        var placaManual = validaciones.normalizarPlaca(mensaje);
        if (!placaManual) return validaciones.responderTwiml(res, '⌨️ Escribe la placa sin espacios.\nEjemplo: *IDL354*');

        var FORMATO_PLACA = /^[A-Z]{3}[0-9]{3}$/;
        if (!FORMATO_PLACA.test(placaManual)) {
          return validaciones.responderTwiml(res, '⚠️ Formato de placa inválido.\nEjemplo: *ABC123*');
        }

        var fotoPlacaManual = sesion.fotoPlacaTemporal;
        var mensajeInicioManual = await manejarPlacaCompartido(sesion, telefono, placaManual);
        var esExitoManual = typeof mensajeInicioManual === 'string' && mensajeInicioManual.length > 0 && mensajeInicioManual.charCodeAt(0) === 0x2705;
        
        if (esExitoManual) {
          estadoPosop.reiniciarDatosOperativos(sesion);
          if (fotoPlacaManual) {
            storage.guardarFotoUnica(sesion, {
              tipo: 'inicio_placa',
              url: fotoPlacaManual,
              validacion: 'Placa registrada manualmente: ' + placaManual,
              descripcion: 'Placa OCR: ' + placaManual,
              validada: true
            });
          }
        }
        return validaciones.responderTwiml(res, mensajeInicioManual);

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
