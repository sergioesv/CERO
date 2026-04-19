/**
 * baseFlujo.js — Clase base para máquinas de estado WhatsApp.
 * Centraliza: validación Twilio, bloqueo de concurrencia, navegación global,
 * y estados compartidos de placa + odómetro.
 *
 * Cada flujo (preoperacional, tanqueo, posoperacional) extiende esta clase
 * e implementa procesarEstado() con sus estados específicos.
 *
 * CERO — Gestión de Operaciones de Campo
 */

'use strict';

var sesiones = require('../../../servicios/sesiones');
var storage  = require('../../../servicios/storage');
var nav      = require('./navegacion');
var twiml    = require('./twiml');
var iniciadorFlujo = require('./iniciadorFlujo');
var kmCompartido   = require('./kilometraje');
var config         = require('../../../config/config');

/**
 * @param {Object} opciones
 * @param {string} opciones.tipo                — 'preoperacional' | 'tanqueo' | 'posoperacional'
 * @param {Object} opciones.ESTADOS             — Constantes de estado del flujo
 * @param {Object} opciones.mensajes            — Módulo de mensajes del flujo
 * @param {Object} opciones.validaciones        — Módulo de validaciones del flujo
 * @param {Function} opciones.mensajeConfirmacionPlaca  — fn(vehiculo, refKm) -> string
 * @param {Function} [opciones.mensajeConfirmacionOdometro]  — fn(sesion, prefijo) -> string
 * @param {Function} [opciones.mensajeKilometrajeFueraRango] — fn(sesion, evaluacion, maxKmSalto) -> string
 * @param {Function} [opciones.primerMensajeInspeccion]      — fn(sesion) -> string
 * @param {Function} [opciones.mensajeInicioOdometro]        — fn(sesion) -> string
 * @param {Function} [opciones.mensajeInicio]     — fn() -> string (mensaje cuando arranca el flujo)
 * @param {string}   [opciones.tipoFotoPlaca]     — tipo de foto para storage (default 'inicio_placa')
 * @param {Function} [opciones.onExitoPlaca]      — fn(sesion) callback tras placa exitosa
 * @param {Function} [opciones.onRegistrarKm]     — fn(sesion, km, origen) registrar km confirmado
 * @param {Function} [opciones.onConfirmarKm]     — fn(res, sesion) tras confirmar km OCR
 * @param {string}   [opciones.estadoEsperandoFotoPlaca] — estado tras inicializar (default ESTADOS.ESPERANDO_FOTO_PLACA)
 * @param {Function} [opciones.procesarLecturaPos] — Solo posoperacional: procesar lectura custom
 */
function FlujoBase(opciones) {
  this.tipo            = opciones.tipo;
  this.ESTADOS         = opciones.ESTADOS;
  this.mensajes        = opciones.mensajes;
  this.validaciones    = opciones.validaciones;
  this.tipoFotoPlaca   = opciones.tipoFotoPlaca || 'inicio_placa';

  // Callbacks específicos del flujo
  this._mensajeInicio                = opciones.mensajeInicio;
  this._mensajeInicioOdometro        = opciones.mensajeInicioOdometro;
  this._onExitoPlaca                 = opciones.onExitoPlaca || null;
  this._onRegistrarKm                = opciones.onRegistrarKm || null;
  this._onConfirmarKm                = opciones.onConfirmarKm || null;
  this._estadoEsperandoFotoPlaca     = opciones.estadoEsperandoFotoPlaca || null;

  // Crear manejadores de placa y odómetro con factory
  var self = this;
  var ESTADOS = this.ESTADOS;
  var mensajes = this.mensajes;
  var validaciones = this.validaciones;

  this._manejarPlaca = iniciadorFlujo.crearManejadorPlaca({
    ESTADOS: ESTADOS,
    mensajes: mensajes,
    validaciones: validaciones,
    tipoFlujo: this.tipo,
    mensajeConfirmacion: opciones.mensajeConfirmacionPlaca
  });

  this._procesarFotoPlaca = iniciadorFlujo.crearProcesadorFotoPlaca({
    ESTADOS: ESTADOS,
    mensajes: {
      mensajeConfirmacionPlacaSugerida: mensajes.mensajeConfirmacionPlacaSugerida || mensajes.confirmarPlacaSugerida,
      mensajeFallbackPlaca: mensajes.mensajeFallbackPlaca || mensajes.fallbackPlaca
    },
    validaciones: validaciones,
    manejarPlacaCompartido: this._manejarPlaca,
    tipoFotoPlaca: this.tipoFotoPlaca,
    onExitoPlaca: opciones.onExitoPlaca || null
  });

  // Odómetro — posoperacional usa procesarLecturaPos custom
  var optsOdometro = {
    ESTADOS: ESTADOS,
    mensajes: {
      mensajeConfirmacionOdometro: opciones.mensajeConfirmacionOdometro || mensajes.mensajeConfirmacionOdometro || mensajes.confirmarKmOcr,
      mensajeKilometrajeFueraRango: opciones.mensajeKilometrajeFueraRango || mensajes.mensajeKilometrajeFueraRango || mensajes.alertaKmFueraRango,
      primerMensajeInspeccion: opciones.primerMensajeInspeccion || mensajes.primerMensajeInspeccion
    },
    validaciones: validaciones,
    tipoFlujo: this.tipo,
    config: config
  };

  if (opciones.procesarLecturaPos) {
    optsOdometro.procesarLecturaPos = opciones.procesarLecturaPos;
  }

  this._procesarFotoOdometro = iniciadorFlujo.crearProcesadorFotoOdometro(optsOdometro);
}

// ============================================================================
// MÉTODO PRINCIPAL — manejar(req, res)
// ============================================================================

/**
 * Entry point para cada flujo. Reemplaza manejarPreoperacional, manejarTanqueo, etc.
 */
FlujoBase.prototype.manejar = async function(req, res) {
  if (!twiml.firmaTwilioValida(req)) {
    return res.status(403).send('Forbidden');
  }

  var telefono = req.body.From || '';
  var mensaje  = (req.body.Body || '').trim();
  var msgUpper = mensaje.toUpperCase();
  var mediaUrls = storage.obtenerMediaUrls(req);

  if (!sesiones.bloquear(telefono)) {
    return twiml.responderTwiml(res, 'Un momento, procesando tu mensaje anterior...');
  }

  try {
    var sesion = await sesiones.obtenerSesion(telefono);

    // Navegación global: 9 / MENU / INICIO / CANCELAR → menú principal
    if (nav.esMenu(mensaje)) {
      sesiones.eliminarSesion(telefono);
      return twiml.responderTwiml(res, nav.textoMenuPrincipal());
    }

    // Navegación global: 0 / ATRAS → retroceder un paso
    if (nav.esAtras(mensaje)) {
      return this.manejarAtras(res, sesion, telefono);
    }

    // Inicializar sesión si es nueva o de otro tipo
    if (sesion.tipo !== this.tipo || !sesion.estado || sesion.estado === this.ESTADOS.INICIO) {
      this.inicializarSesion(sesion);
      var estadoInicial = this._estadoEsperandoFotoPlaca ||
        this.ESTADOS.ESPERANDO_FOTO_PLACA ||
        this.ESTADOS.ESPERANDO_PLACA ||
        'ESPERANDO_FOTO_PLACA';
      sesion.estado = estadoInicial;
      return twiml.responderTwiml(res, this._mensajeInicio());
    }

    // Delegar al procesador de estados del flujo específico
    return await this.procesarEstado(res, sesion, telefono, mensaje, msgUpper, mediaUrls);

  } catch (err) {
    console.error('[' + this.tipo + '] Error handler:', err.message);
    return twiml.responderTwiml(res, 'Ocurrió un error. Escribe *9* para volver al menú.');
  } finally {
    sesiones.desbloquear(telefono);
    sesiones.guardarCambios();
  }
};

// ============================================================================
// ESTADOS COMPARTIDOS — Placa y Odómetro
// ============================================================================

/**
 * Procesa los estados compartidos de placa y odómetro.
 * Retorna la respuesta TwiML si el estado fue manejado, o null si no.
 * Los flujos hijos llaman a esto en su procesarEstado() antes de sus propios cases.
 */
FlujoBase.prototype.procesarEstadoCompartido = async function(res, sesion, telefono, mensaje, mediaUrls) {
  var msgLower = mensaje.toLowerCase();
  var numMedia = mediaUrls.length;
  var ESTADOS = this.ESTADOS;
  var self = this;

  switch (sesion.estado) {

    // ── FOTO PLACA ──────────────────────────────────────────
    case ESTADOS.ESPERANDO_FOTO_PLACA:
    case 'ESPERANDO_FOTO_FRONTAL': // preoperacional usa este string
      if (numMedia === 0) {
        // En preoperacional, también acepta texto como placa
        if (sesion.estado === 'ESPERANDO_FOTO_FRONTAL' || sesion.estado === (ESTADOS.ESPERANDO_PLACA)) {
          return twiml.responderTwiml(res, this._mensajeInicio());
        }
        return twiml.responderTwiml(res, this._mensajeInicio());
      }
      return await this._procesarFotoPlaca(res, sesion, telefono, mediaUrls[0]);

    // ── PLACA SUGERIDA ──────────────────────────────────────
    case ESTADOS.PLACA_CONFIRMACION_SUGERIDA:
      if (numMedia > 0) return await this._procesarFotoPlaca(res, sesion, telefono, mediaUrls[0]);

      if (msgLower === '1' || msgLower === '1️⃣' || msgLower === 'confirmar') {
        if (!sesion.placaSugerida) {
          var msjSugerida = this.mensajes.mensajeConfirmacionPlacaSugerida || this.mensajes.confirmarPlacaSugerida;
          return twiml.responderTwiml(res, msjSugerida(sesion));
        }
        var fotoSug = sesion.fotoPlacaTemporal;
        var mensajeSug = await this._manejarPlaca(sesion, telefono, sesion.placaSugerida);
        var esExito = this._esRespuestaExito(mensajeSug);
        if (esExito) {
          if (this._onExitoPlaca) await this._onExitoPlaca(sesion);
          if (fotoSug) {
            storage.guardarFotoUnica(sesion, {
              tipo: this.tipoFotoPlaca,
              url: fotoSug,
              descripcion: 'Placa OCR: ' + sesion.placaSugerida,
              validacion: 'Placa confirmada desde sugerencia: ' + sesion.placaSugerida +
                (sesion.placaDetectada ? (' (lectura inicial: ' + sesion.placaDetectada + ')') : ''),
              validada: true
            });
          }
          sesion.placaOcrFoto = sesion.placaSugerida;
          return twiml.responderTwiml(res, mensajeSug);
        }
        if (this._esVehiculoBloqueado(mensajeSug)) {
          return twiml.responderTwiml(res, mensajeSug);
        }
        return twiml.responderTwiml(res, mensajeSug || (this.mensajes.mensajeConfirmacionPlacaSugerida || this.mensajes.confirmarPlacaSugerida)(sesion));
      }
      if (msgLower === '2' || msgLower === '2️⃣' || msgLower === 'foto') {
        var estadoFoto = this._estadoEsperandoFotoPlaca ||
          ESTADOS.ESPERANDO_FOTO_PLACA ||
          'ESPERANDO_FOTO_FRONTAL';
        sesion.estado = estadoFoto;
        return twiml.responderTwiml(res, this._mensajeInicio());
      }
      if (msgLower === '3' || msgLower === '3️⃣') {
        sesion.estado = ESTADOS.PLACA_MANUAL;
        return twiml.responderTwiml(res, '⌨️ Escribe la placa manualmente.\nEjemplo: *IDL354*');
      }
      var msjConfSug = this.mensajes.mensajeConfirmacionPlacaSugerida || this.mensajes.confirmarPlacaSugerida;
      return twiml.responderTwiml(res, msjConfSug(sesion));

    // ── PLACA FALLBACK ──────────────────────────────────────
    case ESTADOS.PLACA_FALLBACK:
      if (numMedia > 0) return await this._procesarFotoPlaca(res, sesion, telefono, mediaUrls[0]);
      if (msgLower === '1' || msgLower === '1️⃣' || msgLower === 'foto') {
        var estadoFotoFb = this._estadoEsperandoFotoPlaca ||
          ESTADOS.ESPERANDO_FOTO_PLACA ||
          'ESPERANDO_FOTO_FRONTAL';
        sesion.estado = estadoFotoFb;
        return twiml.responderTwiml(res, this._mensajeInicio());
      }
      if (msgLower === '2' || msgLower === '2️⃣') {
        sesion.estado = ESTADOS.PLACA_MANUAL;
        return twiml.responderTwiml(res, '⌨️ Escribe la placa manualmente.\nEjemplo: *IDL354*');
      }
      var msjFb = this.mensajes.mensajeFallbackPlaca || this.mensajes.fallbackPlaca;
      return twiml.responderTwiml(res, msjFb(sesion));

    // ── PLACA MANUAL ────────────────────────────────────────
    case ESTADOS.PLACA_MANUAL:
      if (numMedia > 0 && mediaUrls[0]) return await this._procesarFotoPlaca(res, sesion, telefono, mediaUrls[0]);

      var placaManual = this.validaciones.normalizarPlaca(mensaje);
      if (!placaManual) {
        return twiml.responderTwiml(res, '⌨️ Escribe la placa sin espacios.\nEjemplo: *IDL354*');
      }
      var FORMATO_PLACA = /^[A-Z]{3}[0-9]{3}$/;
      if (!FORMATO_PLACA.test(placaManual)) {
        return twiml.responderTwiml(res, '⚠️ Formato de placa inválido.\nEjemplo: *ABC123*');
      }

      var fotoPlacaManual = sesion.fotoPlacaTemporal;
      var mensajeInicio = await this._manejarPlaca(sesion, telefono, placaManual);
      var esExitoManual = this._esRespuestaExito(mensajeInicio);
      if (esExitoManual) {
        if (this._onExitoPlaca) await this._onExitoPlaca(sesion);
        if (fotoPlacaManual) {
          storage.guardarFotoUnica(sesion, {
            tipo: this.tipoFotoPlaca,
            url: fotoPlacaManual,
            descripcion: 'Placa OCR: ' + placaManual,
            validacion: 'Placa registrada manualmente: ' + placaManual,
            validada: true
          });
        }
        sesion.placaOcrFoto = placaManual;
      }
      return twiml.responderTwiml(res, mensajeInicio);

    // ── FOTO ODÓMETRO ───────────────────────────────────────
    case ESTADOS.ESPERANDO_FOTO_ODOMETRO:
      if (numMedia === 0) {
        return twiml.responderTwiml(res, this._mensajeInicioOdometro(sesion));
      }
      return await this._procesarFotoOdometro(res, sesion, mediaUrls[0]);

    // ── CONFIRMACIÓN KM ─────────────────────────────────────
    case ESTADOS.CONFIRMACION_KM:
    case ESTADOS.ODOMETRO_CONFIRMACION:
      return await this._manejarConfirmacionKm(res, sesion, telefono, mensaje, numMedia, mediaUrls);

    // ── KM MANUAL ───────────────────────────────────────────
    case ESTADOS.KM_MANUAL:
    case ESTADOS.ODOMETRO_MANUAL:
      return await this._manejarKmManual(res, sesion, telefono, mensaje, numMedia, mediaUrls);

    default:
      return null; // No manejado — el flujo hijo se encarga
  }
};

// ============================================================================
// CONFIRMACIÓN DE KILÓMETROS — delegada a kmCompartido
// ============================================================================

FlujoBase.prototype._manejarConfirmacionKm = async function(res, sesion, telefono, mensaje, numMedia, mediaUrls) {
  var self = this;
  var ESTADOS = this.ESTADOS;
  var mensajes = this.mensajes;

  return await kmCompartido.manejarConfirmacionOdometro(
    res, sesion, mensaje, numMedia, mediaUrls,
    {
      mensajesModulo: {
        mensajeConfirmacionOdometro: mensajes.mensajeConfirmacionOdometro || mensajes.confirmarKmOcr,
        mensajeKilometrajeFueraRango: mensajes.mensajeKilometrajeFueraRango || mensajes.alertaKmFueraRango,
        mensajeSinPlantillaInspeccion: mensajes.mensajeSinPlantillaInspeccion,
        primerMensajeInspeccion: mensajes.primerMensajeInspeccion || function(s) {
          return self._primerMensajeTrasKm(s);
        }
      },
      responderFn: twiml.responderTwiml,
      estadoManual: ESTADOS.KM_MANUAL || ESTADOS.ODOMETRO_MANUAL,
      estadoEsperandoFoto: ESTADOS.ESPERANDO_FOTO_ODOMETRO,
      maxKmSalto: config.MAX_KM_SALTO,
      mensajeInicioOdometro: function(s) {
        return self._mensajeInicioOdometro(s);
      },
      procesarFotoOdometro: function(r, s, url) {
        return self._procesarFotoOdometro(r, s, url);
      },
      telefono: telefono,
      volverMenuPrincipal: function(r, t) {
        sesiones.eliminarSesion(t);
        return twiml.responderTwiml(r, nav.textoMenuPrincipal());
      },
      esAtrasOdometro: function(m) {
        var ml = String(m || '').trim().toLowerCase();
        return ml === '0' || ml === '0️⃣';
      },
      manejarAtrasDesdeOdometro: function(r, s) {
        return self.manejarAtras(r, s, telefono);
      },
      esOpcion: nav.esOpcion,
      registrarKilometrajePreoperacional: self._onRegistrarKm || function(s, km, origen) {
        self._registrarKmDefault(s, km, origen);
      },
      onConfirmarPreoperacional: async function(r, s, tel) {
        if (self._onConfirmarKm) return self._onConfirmarKm(r, s, tel);
        return self._confirmarKmDefault(r, s);
      }
    }
  );
};

FlujoBase.prototype._manejarKmManual = async function(res, sesion, telefono, mensaje, numMedia, mediaUrls) {
  var self = this;
  var ESTADOS = this.ESTADOS;
  var mensajes = this.mensajes;

  return await kmCompartido.manejarOdometroManual(
    res, sesion, mensaje,
    {
      mensajeConfirmacionOdometro: mensajes.mensajeConfirmacionOdometro || mensajes.confirmarKmOcr,
      mensajeKilometrajeFueraRango: mensajes.mensajeKilometrajeFueraRango || mensajes.alertaKmFueraRango,
      mensajeSinPlantillaInspeccion: mensajes.mensajeSinPlantillaInspeccion,
      primerMensajeInspeccion: mensajes.primerMensajeInspeccion || function(s) {
        return self._primerMensajeTrasKm(s);
      }
    },
    twiml.responderTwiml,
    {
      numMedia: numMedia,
      mediaUrls: mediaUrls,
      procesarFotoOdometro: function(r, s, url) {
        return self._procesarFotoOdometro(r, s, url);
      },
      esAtrasOdometro: function(m) {
        var ml = String(m || '').trim().toLowerCase();
        return ml === '0' || ml === '0️⃣';
      },
      manejarAtrasDesdeOdometro: function(r, s) {
        return self.manejarAtras(r, s, telefono);
      },
      volverMenuPrincipal: function(r, t) {
        sesiones.eliminarSesion(t);
        return twiml.responderTwiml(r, nav.textoMenuPrincipal());
      },
      telefono: telefono,
      esOpcion: nav.esOpcion,
      registrarKilometrajePreoperacional: self._onRegistrarKm || function(s, km, origen) {
        self._registrarKmDefault(s, km, origen);
      }
    }
  );
};

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

FlujoBase.prototype._esRespuestaExito = function(msg) {
  return typeof msg === 'string' && msg.length > 0 && msg.charCodeAt(0) === 0x2705; // ✅
};

FlujoBase.prototype._esVehiculoBloqueado = function(msg) {
  return typeof msg === 'string' && (msg.indexOf('\uD83D\uDEAB') !== -1 || /bloqueado/i.test(msg)); // 🚫
};

/** Mensaje por defecto tras confirmar km. Sobreescribir en hijos. */
FlujoBase.prototype._primerMensajeTrasKm = function(sesion) {
  return '✅ Kilometraje confirmado.';
};

/** Registrar km por defecto — sobreescribible. */
FlujoBase.prototype._registrarKmDefault = function(sesion, km, origen) {
  sesion.kilometraje = km;
  storage.guardarFotoUnica(sesion, {
    tipo: 'odometro',
    url: sesion.fotoOdometroTemporal,
    descripcion: 'Foto del odómetro',
    validacion: origen,
    validada: true
  });
  sesion.kmDetectado = null;
  sesion.kmLecturaFueraRango = false;
  sesion.fotoOdometroTemporal = null;
};

/** Confirmar km OCR por defecto — sobreescribible. */
FlujoBase.prototype._confirmarKmDefault = async function(res, sesion) {
  sesion.kilometraje = sesion.kmDetectado;
  this._registrarKmDefault(sesion, sesion.kmDetectado, 'Km confirmado: ' + sesion.kmDetectado + ' km');
  var msg = this._primerMensajeTrasKm(sesion);
  return twiml.responderTwiml(res, msg);
};

// ============================================================================
// MÉTODOS ABSTRACTOS — los hijos DEBEN implementar
// ============================================================================

/**
 * Procesa el estado actual de la sesión. Cada flujo implementa su switch aquí.
 * @abstract
 */
FlujoBase.prototype.procesarEstado = async function(/* res, sesion, telefono, mensaje, msgUpper, mediaUrls */) {
  throw new Error('procesarEstado() debe ser implementado por el flujo hijo');
};

/**
 * Inicializa/reinicia la sesión para un nuevo flujo.
 * @abstract
 */
FlujoBase.prototype.inicializarSesion = function(/* sesion */) {
  throw new Error('inicializarSesion() debe ser implementado por el flujo hijo');
};

/**
 * Maneja el retroceso (0 / ATRAS) según el estado actual.
 * @abstract
 */
FlujoBase.prototype.manejarAtras = function(/* res, sesion, telefono */) {
  throw new Error('manejarAtras() debe ser implementado por el flujo hijo');
};

module.exports = FlujoBase;
