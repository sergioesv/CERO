/**
 * Factory de funciones comunes para inicio de flujos vehiculares.
 * Centraliza lógica de validación de placa y procesamiento de odómetro.
 * Usado por: preoperacional, tanqueo, posoperacional.
 */

'use strict';

var activosData = require('../../../data/activos');
var inspeccionesData = require('../../../data/inspecciones');
var kmCompartido = require('./kilometraje');
var ocr = require('../../../servicios/ocr');
var storage = require('../../../servicios/storage');

/**
 * Crea manejador de placa configurado para un flujo específico.
 *
 * @param {Object} opciones
 * @param {Object} opciones.ESTADOS - Constantes de estado del flujo
 * @param {Object} opciones.mensajes - Módulo de mensajes del flujo
 * @param {Object} opciones.validaciones - Módulo de validaciones del flujo
 * @param {string} opciones.tipoFlujo - 'preoperacional' | 'tanqueo' | 'posoperacional'
 * @param {Function} opciones.mensajeConfirmacion - fn(vehiculo, refKm) -> string
 * @param {Function} [opciones.validadorFormato] - fn(placa) -> boolean (opcional)
 *
 * @returns {Function} async (sesion, telefono, mensaje) -> string
 */
function crearManejadorPlaca(opciones) {
  var ESTADOS = opciones.ESTADOS;
  var mensajes = opciones.mensajes;
  var validaciones = opciones.validaciones;
  var tipoFlujo = opciones.tipoFlujo;
  var mensajeConfirmacion = opciones.mensajeConfirmacion;
  var validadorFormato = opciones.validadorFormato;

  return async function(sesion, telefono, mensaje) {
    console.log('[iniciadorFlujo] Procesando placa para ' + tipoFlujo);

    // 1. Normalizar placa
    var placa = validaciones.normalizarPlaca(mensaje);
    if (!placa) {
      return 'Escribe la placa sin espacios.\nEjemplo: *ABC123*';
    }

    // 2. Validar formato si se proveyó validador
    if (validadorFormato && !validadorFormato(placa)) {
      return '\u26A0\uFE0F Formato de placa inválido.\nEjemplo: *ABC123*';
    }

    // 3. Buscar activo y conductor (función combinada)
    var carga = await activosData.cargarActivoYConductor(placa, telefono);
    if (carga.error || !carga.vehiculo) {
      console.log('[iniciadorFlujo] Activo no encontrado: ' + placa);
      return 'Vehículo *' + placa + '* no encontrado.\n\nVerifica la placa y vuelve a intentarlo.';
    }

    var vehiculo = carga.vehiculo;
    var conductor = carga.conductor;

    // 4. Validar no bloqueado
    if (vehiculo.bloqueado) {
      console.log('[iniciadorFlujo] Vehículo bloqueado: ' + placa);
      return '\uD83D\uDEAB Vehículo *' + placa + '* bloqueado.\nMotivo: ' +
        (vehiculo.motivo_bloqueo || 'Requiere autorización') +
        '\n\nContacta al supervisor.';
    }

    // 5. Validar conductor encontrado
    if (!conductor) {
      console.log('[iniciadorFlujo] Conductor no encontrado: ' + telefono);
      return '\u26A0\uFE0F Tu número no está registrado como conductor.\n\nContacta al administrador.';
    }

    // 6. Obtener referencia de kilometraje (usando activo_id)
    var refKm = await inspeccionesData.obtenerReferenciaKilometraje(vehiculo.id, tipoFlujo);
    console.log('[iniciadorFlujo] Referencia km:', refKm);

    // 7. Actualizar sesión
    sesion.placa = placa;
    sesion.vehiculo = vehiculo;
    sesion.conductor = conductor;
    sesion.kmReferencia = refKm.kilometraje;
    sesion.kmReferenciaMeta = refKm;

    // 8. Cambiar estado (detectar si usa strings o constantes)
    var estadoSiguiente = ESTADOS.ESPERANDO_FOTO_ODOMETRO || 'ESPERANDO_FOTO_ODOMETRO';
    sesion.estado = estadoSiguiente;

    console.log('[iniciadorFlujo] Placa confirmada: ' + placa + ' -> estado: ' + estadoSiguiente);

    // 9. Retornar mensaje de confirmación
    return mensajeConfirmacion(vehiculo, refKm);
  };
}

/**
 * Crea procesador de foto de odómetro configurado para un flujo específico.
 *
 * @param {Object} opciones
 * @param {Object} opciones.ESTADOS - Constantes de estado del flujo
 * @param {Object} opciones.mensajes - Módulo de mensajes del flujo
 * @param {Object} opciones.validaciones - Módulo de validaciones del flujo
 * @param {string} opciones.tipoFlujo - 'preoperacional' | 'tanqueo' | 'posoperacional'
 * @param {Object} opciones.config - { MAX_KM_SALTO: number }
 * @param {Function} [opciones.procesarLecturaPos] - Solo para posoperacional
 *
 * @returns {Function} async (res, sesion, fotoUrl) -> TwilML response
 */
function crearProcesadorFotoOdometro(opciones) {
  var ESTADOS = opciones.ESTADOS;
  var mensajes = opciones.mensajes;
  var validaciones = opciones.validaciones;
  var tipoFlujo = opciones.tipoFlujo;
  var config = opciones.config;
  var procesarLecturaPos = opciones.procesarLecturaPos;

  return async function(res, sesion, fotoUrl) {
    console.log('[iniciadorFlujo] Procesando foto odómetro para ' + tipoFlujo);

    // Detectar estado de confirmación según flujo
    var estadoConfirmacion;
    if (tipoFlujo === 'tanqueo') {
      estadoConfirmacion = ESTADOS.CONFIRMACION_KM;
    } else {
      estadoConfirmacion = ESTADOS.ODOMETRO_CONFIRMACION || 'ODOMETRO_CONFIRMACION';
    }

    // Configurar opciones para kmCompartido
    var opcionesKm = {
      tipoFlujo: tipoFlujo,
      estadoConfirmacion: estadoConfirmacion,
      responderFn: validaciones.responderTwiml,
      maxKmSalto: config.MAX_KM_SALTO
    };

    // Mensajes específicos del flujo
    if (tipoFlujo === 'posoperacional' && procesarLecturaPos) {
      opcionesKm.procesarLecturaPos = procesarLecturaPos;
    } else {
      opcionesKm.mensajesModulo = mensajes;
    }

    return await kmCompartido.procesarFotoOdometro(res, sesion, fotoUrl, opcionesKm);
  };
}

/**
 * Crea un procesador para extraer y validar la placa desde una foto.
 *
 * @param {Object} opciones
 * @param {Object} opciones.ESTADOS - Constantes de estado del flujo
 * @param {Object} opciones.mensajes - Módulo de mensajes del flujo
 * @param {Object} opciones.validaciones - Módulo de validaciones del flujo
 * @param {Function} opciones.manejarPlacaCompartido - Función generada por crearManejadorPlaca
 *
 * @returns {Function} async (res, sesion, telefono, fotoUrl) -> TwilML response
 */
function crearProcesadorFotoPlaca(opciones) {
  var ESTADOS = opciones.ESTADOS;
  var mensajes = opciones.mensajes;
  var validaciones = opciones.validaciones;
  var manejarPlacaCompartido = opciones.manejarPlacaCompartido;

  function respuestaExitoAlIniciarPlaca(msg) {
    return typeof msg === 'string' && msg.length > 0 && msg.charCodeAt(0) === 0x2705;
  }

  function respuestaVehiculoBloqueadoPlaca(msg) {
    return typeof msg === 'string' && (msg.indexOf('\uD83D\uDEAB') !== -1 || /bloqueado/i.test(msg));
  }

  return async function(res, sesion, telefono, fotoUrl) {
    var lecturaPlaca = await ocr.extraerPlacaFoto(fotoUrl);
    var placaDetectada = validaciones.normalizarPlaca(lecturaPlaca.placa || '');

    if (lecturaPlaca.valida && placaDetectada) {
      var mensajeInicio = await manejarPlacaCompartido(sesion, telefono, placaDetectada);
      if (respuestaExitoAlIniciarPlaca(mensajeInicio)) {
        if (typeof opciones.onExitoPlaca === 'function') {
           await opciones.onExitoPlaca(sesion);
        }
        storage.guardarFotoUnica(sesion, {
          tipo: opciones.tipoFotoPlaca || 'inicio_placa',
          url: fotoUrl,
          validacion: 'Placa validada por foto: ' + placaDetectada,
          descripcion: 'Placa OCR: ' + placaDetectada,
          validada: true
        });
        sesion.placaOcrFoto = placaDetectada; // Para tanqueo o uso futuro
        return validaciones.responderTwiml(res, mensajeInicio);
      }
      if (respuestaVehiculoBloqueadoPlaca(mensajeInicio)) {
        return validaciones.responderTwiml(res, mensajeInicio);
      }
    }

    sesion.fotoPlacaTemporal = fotoUrl;
    sesion.placaDetectada = placaDetectada || null;
    sesion.placaSugerida = null;

    if (placaDetectada) {
      var placaSugerida = await activosData.buscarPlacaSugerida(placaDetectada);
      if (placaSugerida && placaSugerida !== placaDetectada) {
        sesion.placaSugerida = placaSugerida;
        sesion.estado = ESTADOS.PLACA_CONFIRMACION_SUGERIDA || 'PLACA_CONFIRMACION_SUGERIDA';
        var msjSugerida = mensajes.mensajeConfirmacionPlacaSugerida || mensajes.confirmarPlacaSugerida;
        return validaciones.responderTwiml(
          res,
          msjSugerida(sesion, 'La lectura no coincide exactamente con la base. Confirma la placa si es correcta.')
        );
      }
    }

    sesion.estado = ESTADOS.PLACA_FALLBACK || 'PLACA_FALLBACK';
    var motivo = lecturaPlaca.razon || 'La placa no se pudo validar con seguridad.';
    if (placaDetectada && lecturaPlaca.valida) {
      motivo = 'La placa *' + placaDetectada + '* no existe en la base.';
    }
    var msjFallback = mensajes.mensajeFallbackPlaca || mensajes.fallbackPlaca;
    return validaciones.responderTwiml(res, msjFallback(sesion, motivo));
  };
}

module.exports = {
  crearManejadorPlaca,
  crearProcesadorFotoOdometro,
  crearProcesadorFotoPlaca
};
