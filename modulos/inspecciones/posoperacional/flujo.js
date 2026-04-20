/**
 * Flujo WhatsApp posoperacional — placa por foto/texto, odómetro por OCR,
 * fotos de estado, novedades en texto libre, firma y cierre numéricos.
 * Extiende FlujoBase.
 * CERO — Gestión de Operaciones de Campo
 */

'use strict';

var FlujoBase    = require('../compartido/baseFlujo');
var twiml        = require('../compartido/twiml');
var sesiones     = require('../../../servicios/sesiones');
var storage      = require('../../../servicios/storage');
var config       = require('../../../config/config');
var nav          = require('../compartido/navegacion');
var validaciones = require('./validaciones');
var estadoPosop  = require('./estado');
var mensajes     = require('./mensajes');
var cierre       = require('./cierre');
// Reservado para alinear con data/inspecciones (referencia km); iniciadorFlujo ya la usa internamente.
var inspeccionesData = require('../../../data/inspecciones'); // eslint-disable-line no-unused-vars

var ESTADOS = estadoPosop.ESTADOS;

// ============================================================================
// CONFIGURAR FLUJO BASE
// ============================================================================

function crearFlujoPosoperacional() {
  var flujo = new FlujoBase({
    tipo: 'posoperacional',
    ESTADOS: ESTADOS,
    mensajes: mensajes,
    validaciones: validaciones,

    mensajeInicio: function() {
      return mensajes.mensajeInicioPosoperacional();
    },

    mensajeConfirmacionPlaca: mensajes.mensajeVehiculoConfirmado,

    mensajeInicioOdometro: function(sesion) {
      return mensajes.mensajeVehiculoConfirmado(sesion.vehiculo, sesion.kmReferenciaMeta);
    },

    politicaKilometraje: crearPoliticaKilometrajePosoperacional(),

    onKilometrajeConfirmado: async function(datosKm) {
      return resolverKilometrajeConfirmadoPosoperacional(datosKm);
    },

    onExitoPlaca: async function(sesion) {
      var vehiculo = sesion.vehiculo;
      var conductor = sesion.conductor;
      estadoPosop.reiniciarDatosOperativos(sesion);
      sesion.vehiculo = vehiculo;
      sesion.conductor = conductor;

      await this._onExitoPlacaDefault(sesion, 'posoperacional', {
        estadoSinMedicion: ESTADOS.FOTO_ESTADO_GENERAL
      });
    },

    // Posoperacional usa procesamiento custom de lectura de odómetro
    procesarLecturaPos: async function(res, sesion, km) {
      sesion.kmDetectado = km;
      sesion.kmLecturaFueraRango = false;

      if (km == null) {
        return twiml.responderTwiml(
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
        } else if (sesion.diferenciaKm > config.MAX_KM_SALTO) {
          sesion.inconsistenciaKm = true;
          sesion.kmLecturaFueraRango = true;
          sesion.alertasKm = [{
            tipo: 'kilometraje_alto',
            mensaje: 'Diferencia superior a ' + config.MAX_KM_SALTO + ' km'
          }];
        }
      }

      return twiml.responderTwiml(res, mensajes.mensajeConfirmacionSegunKilometraje(sesion));
    }
  });

  // Sobreescribir métodos abstractos
  flujo.inicializarSesion = inicializarSesionPosoperacional;
  flujo.manejarAtras = manejarAtras;
  flujo.procesarEstado = procesarEstado;

  return flujo;
}

// ============================================================================
// HELPERS
// ============================================================================

function inicializarSesionPosoperacional(sesion) {
  sesion.tipo = 'posoperacional';
  sesion.estado = ESTADOS.INICIO;
  sesion.fotos = Array.isArray(sesion.fotos) ? sesion.fotos : [];
  estadoPosop.reiniciarDatosOperativos(sesion);
}

/**
 * Construye arreglo novedades para guardado/PDF si solo hay texto libre.
 */
function asegurarNovedadesDesdeTextoLibre(sesion) {
  if (sesion.novedades && sesion.novedades.length > 0) return;

  if (sesion.novedadesTexto && (!sesion.novedades || sesion.novedades.length === 0)) {
    sesion.novedades = [{
      id:             'nov_libre_' + Date.now(),
      item:           'Novedades al cierre',
      estado:         sesion.novedadesTexto,
      texto:          sesion.novedadesTexto,
      texto_original: sesion.novedadesTexto,
      critico:        false,
      categoria:      'otro',
      severidad:      'leve',
      fuente:         'texto_libre'
    }];
  }
}

function resolverKilometrajeConfirmadoPosoperacional(datosKm) {
  var sesion = datosKm.sesion;
  var contexto = datosKm.contexto || {};
  var kilometraje = datosKm.kilometraje;
  var alertas = Array.isArray(datosKm.alertas) ? datosKm.alertas : [];
  var origen = datosKm.origen;

  sesion.alertasKm = alertas;
  sesion.inconsistenciaKm = alertas.length > 0;
  sesion.diferenciaKm = typeof sesion.kmReferencia === 'number' ? kilometraje - sesion.kmReferencia : null;

  if (contexto.fuente === 'confirmacion_ocr' && sesion.inconsistenciaKm) {
    origen = 'Confirmado con alerta: ' + kilometraje + ' km';
  } else if (contexto.fuente === 'confirmacion_ocr') {
    origen = 'OCR confirmado: ' + kilometraje + ' km';
  }

  estadoPosop.registrarFotoOdometro(sesion, sesion.fotoOdometroTemporal, kilometraje, origen);
  sesion.estado = ESTADOS.FOTO_ESTADO_GENERAL;

  return {
    ok: true,
    code: sesion.inconsistenciaKm ? 'KM_RECORDED_WITH_ALERT' : 'KM_RECORDED',
    userMessage: (contexto.prefijoMensaje || '') + mensajes.mensajeFotoEstadoGeneral(),
    payload: {
      kilometraje: kilometraje,
      estadoSiguiente: ESTADOS.FOTO_ESTADO_GENERAL
    }
  };
}

function crearPoliticaKilometrajePosoperacional() {
  return {
    mensajeEntradaManual: function() {
      return '⌨️ Escribe el kilometraje correcto.\nEjemplo: *267354*' + nav.PIE_NAV;
    },
    mensajeEntradaManualInvalida: function() {
      return '⌨️ Escribe el kilometraje con números.\nEjemplo: *127892*' + nav.PIE_NAV;
    },
    resolverConfirmacionFueraRango: async function(ctx) {
      var msgLower = ctx.msgLower;
      var sesion = ctx.sesion;
      var opciones = ctx.opciones;
      var crearResultadoKm = ctx.crearResultadoKm;
      var resolverKilometrajeConfirmadoExitoso = ctx.resolverKilometrajeConfirmadoExitoso;

      if (msgLower === '1' || msgLower === '1️⃣' || msgLower === 'confirmar') {
        return resolverKilometrajeConfirmadoExitoso(
          ctx.res,
          sesion,
          opciones.telefono,
          opciones,
          {
            kilometraje: sesion.kmDetectado,
            origen: 'Confirmado con alerta: ' + sesion.kmDetectado + ' km',
            alertas: Array.isArray(sesion.alertasKm) ? sesion.alertasKm : [{ tipo: 'lectura_fuera_rango' }],
            fuente: 'confirmacion_ocr_alerta',
            evaluacion: null,
            prefijoMensaje: ''
          }
        );
      }
      if (msgLower === '2' || msgLower === '2️⃣') {
        sesion.estado = opciones.estadoManual;
        return crearResultadoKm(
          false,
          'KM_MANUAL_ENTRY_REQUIRED',
          '⌨️ Escribe el kilometraje correcto.\nEjemplo: *267354*' + nav.PIE_NAV,
          { motivo: 'lectura_fuera_rango' }
        );
      }
      if (msgLower === '3' || msgLower === '3️⃣' || msgLower === 'foto') {
        sesion.kmDetectado = null;
        sesion.kmLecturaFueraRango = false;
        sesion.inconsistenciaKm = false;
        sesion.alertasKm = [];
        sesion.diferenciaKm = null;
        sesion.estado = opciones.estadoEsperandoFoto;
        return crearResultadoKm(
          false,
          'KM_RETAKE_PHOTO_REQUESTED',
          opciones.mensajeInicioOdometro(sesion),
          null
        );
      }
      return crearResultadoKm(
        false,
        'KM_OUT_OF_RANGE_CONFIRMATION_REQUIRED',
        ctx.mensajesModulo.mensajeConfirmacionOdometro(sesion),
        { kmDetectado: sesion.kmDetectado }
      );
    },
    resolverIngresoManual: async function(ctx) {
      var sesion = ctx.sesion;
      var kmManual = ctx.kmManual;
      var kmStr = String(ctx.mensaje || '').replace(/[^0-9]/g, '');
      var crearResultadoKm = ctx.crearResultadoKm;

      if (kmManual == null || kmStr.length < 4) {
        return crearResultadoKm(
          false,
          'KM_INVALID_MANUAL_INPUT',
          '⌨️ Escribe el kilometraje con números.\nEjemplo: *127892*' + nav.PIE_NAV,
          null
        );
      }

      var alertasPos = [];
      if (typeof sesion.kmReferencia === 'number') {
        if (kmManual < sesion.kmReferencia) {
          alertasPos.push({ tipo: 'kilometraje_menor', mensaje: 'Kilometraje menor al último registrado' });
        } else if (kmManual - sesion.kmReferencia > config.MAX_KM_SALTO) {
          alertasPos.push({ tipo: 'kilometraje_alto', mensaje: 'Diferencia superior a ' + config.MAX_KM_SALTO + ' km' });
        }
        sesion.diferenciaKm = kmManual - sesion.kmReferencia;
      } else {
        sesion.diferenciaKm = null;
      }
      sesion.alertasKm = alertasPos;
      sesion.inconsistenciaKm = alertasPos.length > 0;

      var origenPos = 'Kilometraje manual: ' + kmManual + ' km';
      if (alertasPos.length > 0) origenPos += ' (con alerta)';
      var avisoPos = alertasPos.length > 0 ? '⚠️ Kilometraje registrado con alerta.\n\n' : '';

      return ctx.resolverKilometrajeConfirmadoExitoso(
        ctx.res,
        sesion,
        ctx.opciones.telefono,
        {
          mensajesModulo: ctx.mensajesModulo,
          registrarKilometrajePreoperacional: ctx.opciones.registrarKilometrajePreoperacional,
          onKilometrajeConfirmado: ctx.opciones.onKilometrajeConfirmado,
          contextoFlujo: ctx.opciones.contextoFlujo
        },
        {
          kilometraje: kmManual,
          origen: origenPos,
          alertas: alertasPos,
          fuente: 'manual',
          evaluacion: null,
          prefijoMensaje: avisoPos
        }
      );
    }
  };
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

// ============================================================================
// MANEJAR ATRÁS
// ============================================================================

function manejarAtras(res, sesion) {
  switch (sesion.estado) {
    case ESTADOS.ESPERANDO_PLACA:
    case ESTADOS.PLACA_CONFIRMACION_SUGERIDA:
    case ESTADOS.PLACA_FALLBACK:
    case ESTADOS.PLACA_MANUAL:
      sesion.estado = ESTADOS.INICIO;
      return twiml.responderTwiml(res, mensajes.mensajeInicioPosoperacional());

    case ESTADOS.ESPERANDO_FOTO_ODOMETRO:
    case ESTADOS.ODOMETRO_CONFIRMACION:
    case ESTADOS.ODOMETRO_MANUAL:
      sesion.estado = ESTADOS.ESPERANDO_PLACA;
      return twiml.responderTwiml(res, '◀️ Volvemos a la placa.\n\n' + mensajes.mensajeInicioPosoperacional());

    case ESTADOS.NOVEDADES:
      sesion.estado = ESTADOS.FOTO_ESTADO_GENERAL;
      return twiml.responderTwiml(res, mensajes.mensajeFotoEstadoGeneral());

    case ESTADOS.FOTO_ESTADO_GENERAL:
      storage.limpiarFotosPorTipo(sesion, ['estado_general']);
      sesion.estado = ESTADOS.ODOMETRO_CONFIRMACION;
      return twiml.responderTwiml(res, mensajes.mensajeConfirmacionSegunKilometraje(sesion));

    case ESTADOS.DESCRIBIR_NOVEDADES:
      sesion.novedadesTexto = null;
      sesion.novedadTexto = null;
      sesion.estado = ESTADOS.NOVEDADES;
      return twiml.responderTwiml(res, mensajes.mensajeNovedades());

    case ESTADOS.FOTO_NOVEDAD:
      storage.limpiarFotosPorTipo(sesion, ['novedad']);
      sesion.estado = ESTADOS.DESCRIBIR_NOVEDADES;
      return twiml.responderTwiml(res, mensajes.mensajeDescribirNovedades());

    case ESTADOS.GRAVEDAD_NOVEDAD:
      sesion.estado = ESTADOS.FOTO_NOVEDAD;
      return twiml.responderTwiml(res, mensajes.mensajeFotoNovedad());

    case ESTADOS.OBSERVACION:
      if (sesion.novedades && sesion.novedades.length > 0 && sesion.novedadTexto) {
        sesion.novedades = [];
        sesion.novedadSeveridad = null;
        sesion.estado = ESTADOS.GRAVEDAD_NOVEDAD;
        return twiml.responderTwiml(res, mensajes.mensajeGravedadNovedad());
      }
      if (sesion.novedadesTexto) {
        sesion.estado = ESTADOS.DESCRIBIR_NOVEDADES;
        return twiml.responderTwiml(res, mensajes.mensajeDescribirNovedades());
      }
      sesion.estado = ESTADOS.NOVEDADES;
      return twiml.responderTwiml(res, mensajes.mensajeNovedades());

    case ESTADOS.OBSERVACION_TEXTO:
      sesion.estado = ESTADOS.OBSERVACION;
      return twiml.responderTwiml(res, mensajes.mensajeObservacion());

    case ESTADOS.CONFIRMACION:
      sesion.estado = ESTADOS.OBSERVACION;
      return twiml.responderTwiml(res, mensajes.mensajeObservacion());

    default:
      return twiml.responderTwiml(res, 'No se puede retroceder desde aquí. Escribe *9* para el menú.');
  }
}

// ============================================================================
// PROCESADOR DE ESTADOS — solo los estados propios del posoperacional
// ============================================================================

async function procesarEstado(res, sesion, telefono, mensaje, msgUpper, mediaUrls) {
  var msgLower = mensaje.toLowerCase();
  var numMedia = mediaUrls.length;
  var mediaUrl = mediaUrls[0] || null;

  // Primero intentar con los estados compartidos (placa/odómetro)
  // Nota: posoperacional también acepta texto como placa en ESPERANDO_PLACA
  if (sesion.estado === ESTADOS.ESPERANDO_PLACA || sesion.estado === ESTADOS.INICIO) {
    if (numMedia > 0 && mediaUrl) {
      return await this._procesarFotoPlaca(res, sesion, telefono, mediaUrl);
    }
    if (!mensaje || sesion.estado === ESTADOS.INICIO) {
      sesion.estado = ESTADOS.ESPERANDO_PLACA;
      return twiml.responderTwiml(res, mensajes.mensajeInicioPosoperacional());
    }
    // Texto como placa
    var mensajePlaca = await this._manejarPlaca(sesion, telefono, mensaje);
    return twiml.responderTwiml(res, mensajePlaca);
  }

  var resultadoCompartido = await this.procesarEstadoCompartido(res, sesion, telefono, mensaje, mediaUrls);
  if (resultadoCompartido !== null) return resultadoCompartido;

  // Estados propios del posoperacional
  switch (sesion.estado) {

    // ── FOTO ESTADO GENERAL ─────────────────────────────────
    case ESTADOS.FOTO_ESTADO_GENERAL:
      if (mediaUrl) {
        sesion.fotos.push({
          tipo: 'estado_general',
          url: mediaUrl,
          descripcion: 'Estado general del vehículo al cierre',
          validada: true
        });
        return twiml.responderTwiml(res, mensajes.mensajeFotoEstadoGeneral('✅ Foto guardada'));
      }
      if (msgLower === '1' || msgLower === '1️⃣') {
        sesion.estado = ESTADOS.NOVEDADES;
        return twiml.responderTwiml(res, mensajes.mensajeNovedades());
      }
      return twiml.responderTwiml(res, mensajes.mensajeFotoEstadoGeneral());

    // ── NOVEDADES ───────────────────────────────────────────
    case ESTADOS.NOVEDADES:
      if (msgLower === '1' || msgLower === '1️⃣') {
        sesion.estado = ESTADOS.DESCRIBIR_NOVEDADES;
        return twiml.responderTwiml(res, mensajes.mensajeDescribirNovedades());
      }
      if (msgLower === '2' || msgLower === '2️⃣') {
        sesion.novedadesTexto = null;
        sesion.novedadTexto = null;
        sesion.novedadSeveridad = null;
        sesion.novedades = [];
        sesion.estado = ESTADOS.OBSERVACION;
        return twiml.responderTwiml(res, mensajes.mensajeObservacion());
      }
      return twiml.responderTwiml(res, mensajes.mensajeNovedades());

    case ESTADOS.DESCRIBIR_NOVEDADES:
      if (mediaUrl) {
        return twiml.responderTwiml(res, 'En este paso necesito texto.\n\n' + mensajes.mensajeDescribirNovedades());
      }
      if (!mensaje) {
        return twiml.responderTwiml(res, mensajes.mensajeDescribirNovedades());
      }
      sesion.novedadTexto = String(mensaje).trim();
      sesion.novedades = [];
      sesion.estado = ESTADOS.FOTO_NOVEDAD;
      return twiml.responderTwiml(res, mensajes.mensajeFotoNovedad());

    case ESTADOS.FOTO_NOVEDAD:
      if (mediaUrl) {
        sesion.fotos.push({
          tipo: 'novedad', url: mediaUrl,
          descripcion: 'Foto de novedad al cierre', validada: true
        });
        sesion.estado = ESTADOS.GRAVEDAD_NOVEDAD;
        return twiml.responderTwiml(res, mensajes.mensajeGravedadNovedad());
      }
      if (msgLower === '1' || msgLower === '1️⃣') {
        sesion.estado = ESTADOS.GRAVEDAD_NOVEDAD;
        return twiml.responderTwiml(res, mensajes.mensajeGravedadNovedad());
      }
      return twiml.responderTwiml(res, mensajes.mensajeFotoNovedad());

    case ESTADOS.GRAVEDAD_NOVEDAD:
      if (mediaUrl) {
        return twiml.responderTwiml(res,
          '⌨️ En este paso necesito un número (1, 2 o 3).\n\n' + mensajes.mensajeGravedadNovedad()
        );
      }
      var severidad, esCritica;
      if (msgLower === '1' || msgLower === '1️⃣') { severidad = 'critica'; esCritica = true; }
      else if (msgLower === '2' || msgLower === '2️⃣') { severidad = 'moderada'; esCritica = false; }
      else if (msgLower === '3' || msgLower === '3️⃣') { severidad = 'leve'; esCritica = false; }
      else { return twiml.responderTwiml(res, mensajes.mensajeGravedadNovedad()); }

      sesion.novedadSeveridad = severidad;
      sesion.novedades = [{
        item: 'Novedades al cierre',
        estado: sesion.novedadTexto || '',
        texto: sesion.novedadTexto || '',
        texto_original: sesion.novedadTexto || '',
        severidad: severidad,
        critico: esCritica,
        categoria: 'cierre',
        fuente: 'texto_libre'
      }];

      sesion.estado = ESTADOS.OBSERVACION;
      if (esCritica) {
        return twiml.responderTwiml(res,
          '🚨 *Novedad crítica registrada*\n_El supervisor será notificado_\n\n' + mensajes.mensajeObservacion()
        );
      }
      return twiml.responderTwiml(res, mensajes.mensajeObservacion());

    // ── OBSERVACIÓN ─────────────────────────────────────────
    case ESTADOS.OBSERVACION:
      if (msgLower === '1' || msgLower === '1️⃣') {
        sesion.observacion = null;
        sesion.estado = ESTADOS.CONFIRMACION;
        asegurarNovedadesDesdeTextoLibre(sesion);
        return twiml.responderTwiml(res,
          mensajes.mensajeResumenPosoperacional(sesion, validaciones.generarResumenPosoperacional(sesion))
        );
      }
      if (msgLower === '2' || msgLower === '2️⃣') {
        sesion.estado = ESTADOS.OBSERVACION_TEXTO;
        return twiml.responderTwiml(res, '✍️ Escribe la observación final.');
      }
      return twiml.responderTwiml(res, mensajes.mensajeObservacion());

    case ESTADOS.OBSERVACION_TEXTO:
      if (mediaUrl) {
        return twiml.responderTwiml(res, 'En este paso solo texto.\n\nEscribe la observación.');
      }
      sesion.observacion = String(mensaje || '').trim() || null;
      sesion.estado = ESTADOS.CONFIRMACION;
      asegurarNovedadesDesdeTextoLibre(sesion);
      return twiml.responderTwiml(res,
        mensajes.mensajeResumenPosoperacional(sesion, validaciones.generarResumenPosoperacional(sesion))
      );

    // ── CONFIRMACIÓN FINAL ──────────────────────────────────
    case ESTADOS.CONFIRMACION:
      return twiml.responderTwiml(res, await manejarConfirmacionFinal(sesion, telefono, mensaje));

    default:
      sesion.estado = ESTADOS.ESPERANDO_PLACA;
      return twiml.responderTwiml(res, mensajes.mensajeInicioPosoperacional());
  }
}

// ============================================================================
// SINGLETON Y EXPORTS
// ============================================================================

var instancia = crearFlujoPosoperacional();

function registrarPosoperacional(app) {
  app.post('/webhook/posoperacional', function(req, res) { return instancia.manejar(req, res); });
}

module.exports = {
  ESTADOS: ESTADOS,
  registrarPosoperacional: registrarPosoperacional,
  manejarPosoperacional: function(req, res) { return instancia.manejar(req, res); },
  manejar: function(req, res) { return instancia.manejar(req, res); }
};
