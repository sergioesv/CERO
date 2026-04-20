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
 * @param {Function} [opciones.onConfirmarKm]     — fn(res, sesion, telefono) tras confirmar km OCR
 * @param {Function} [opciones.onKilometrajeConfirmado] — fn({res, sesion, telefono, kilometraje, origen, alertas, contexto})
 * @param {string}   [opciones.estadoEsperandoFotoPlaca] — estado tras inicializar (default ESTADOS.ESPERANDO_FOTO_PLACA)
 * @param {Function} [opciones.procesarLecturaPos] — procesador opcional de lectura de odómetro
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
  this._onKilometrajeConfirmado      = opciones.onKilometrajeConfirmado || null;
  this._politicaKilometraje          = opciones.politicaKilometraje || null;
  this._estadoEsperandoFotoPlaca     = opciones.estadoEsperandoFotoPlaca || null;

  // Crear manejadores de placa y odómetro con factory
  var self = this;
  var ESTADOS = this.ESTADOS;
  var mensajes = this.mensajes;
  var validaciones = this.validaciones;

  this._manejarPlacaResultado = iniciadorFlujo.crearManejadorPlaca({
    ESTADOS: ESTADOS,
    mensajes: mensajes,
    validaciones: validaciones,
    tipoFlujo: this.tipo,
    mensajeConfirmacion: opciones.mensajeConfirmacionPlaca
  });

  // Adaptador temporal: mantiene compatibilidad con caminos legacy
  // que todavía esperan un string en lugar de resultado estructurado.
  this._manejarPlaca = async function(sesion, telefono, mensajePlaca) {
    var resultado = self._normalizarResultadoPlaca(
      await self._manejarPlacaResultado(sesion, telefono, mensajePlaca)
    );
    return resultado.userMessage;
  };

  this._procesarFotoPlaca = iniciadorFlujo.crearProcesadorFotoPlaca({
    ESTADOS: ESTADOS,
    mensajes: {
      mensajeConfirmacionPlacaSugerida: mensajes.mensajeConfirmacionPlacaSugerida || mensajes.confirmarPlacaSugerida,
      mensajeFallbackPlaca: mensajes.mensajeFallbackPlaca || mensajes.fallbackPlaca
    },
    validaciones: validaciones,
    manejarPlacaCompartido: this._manejarPlacaResultado,
    tipoFotoPlaca: this.tipoFotoPlaca,
    onExitoPlaca: opciones.onExitoPlaca || null,
    contextoFlujo: self
  });

  // Odómetro — permite inyectar procesador custom de lectura
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
    return twiml.responderTwiml(res, nav.MSG_ERROR_GENERICO);
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
  var estadoFotoPlaca = this._estadoEsperandoFotoPlaca ||
    ESTADOS.ESPERANDO_FOTO_PLACA ||
    'ESPERANDO_FOTO_FRONTAL';

  switch (sesion.estado) {

    // ── FOTO PLACA ──────────────────────────────────────────
    case ESTADOS.ESPERANDO_FOTO_PLACA:
    case 'ESPERANDO_FOTO_FRONTAL': // compatibilidad con estado legacy
      if (numMedia === 0) {
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
        var resultadoSug = this._normalizarResultadoPlaca(
          await this._manejarPlacaResultado(sesion, telefono, sesion.placaSugerida)
        );
        var esExito = resultadoSug.ok && resultadoSug.code === 'PLATE_CONFIRMED';
        if (esExito) {
          if (this._onExitoPlaca) await this._onExitoPlaca.call(this, sesion);
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
          return twiml.responderTwiml(res, resultadoSug.userMessage);
        }
        if (resultadoSug.code === 'PLATE_BLOCKED') {
          return twiml.responderTwiml(res, resultadoSug.userMessage);
        }
        return twiml.responderTwiml(
          res,
          resultadoSug.userMessage ||
            (this.mensajes.mensajeConfirmacionPlacaSugerida || this.mensajes.confirmarPlacaSugerida)(sesion)
        );
      }
      if (msgLower === '2' || msgLower === '2️⃣' || msgLower === 'foto') {
        sesion.estado = estadoFotoPlaca;
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
        sesion.estado = estadoFotoPlaca;
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
      var resultadoManual = this._normalizarResultadoPlaca(
        await this._manejarPlacaResultado(sesion, telefono, placaManual)
      );
      var esExitoManual = resultadoManual.ok && resultadoManual.code === 'PLATE_CONFIRMED';
      if (esExitoManual) {
        if (this._onExitoPlaca) await this._onExitoPlaca.call(this, sesion);
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
      return twiml.responderTwiml(res, resultadoManual.userMessage);

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

  var opcionesCompartidas = this._crearOpcionesCompartidasOdometro({
    telefono: telefono,
    etapa: 'confirmacion_km',
    estadoManual: ESTADOS.KM_MANUAL || ESTADOS.ODOMETRO_MANUAL,
    estadoEsperandoFoto: ESTADOS.ESPERANDO_FOTO_ODOMETRO,
    numMedia: numMedia,
    mediaUrls: mediaUrls
  });

  var resultado = await kmCompartido.manejarConfirmacionOdometro(
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
      maxKmSalto: config.MAX_KM_SALTO,
      mensajeInicioOdometro: opcionesCompartidas.mensajeInicioOdometro,
      procesarFotoOdometro: opcionesCompartidas.procesarFotoOdometro,
      telefono: opcionesCompartidas.telefono,
      volverMenuPrincipal: opcionesCompartidas.volverMenuPrincipal,
      esAtrasOdometro: opcionesCompartidas.esAtrasOdometro,
      manejarAtrasDesdeOdometro: opcionesCompartidas.manejarAtrasDesdeOdometro,
      esOpcion: opcionesCompartidas.esOpcion,
      onKilometrajeConfirmado: opcionesCompartidas.onKilometrajeConfirmado,
      politicaKilometraje: opcionesCompartidas.politicaKilometraje,
      contextoFlujo: opcionesCompartidas.contextoFlujo,
      estadoManual: opcionesCompartidas.estadoManual,
      estadoEsperandoFoto: opcionesCompartidas.estadoEsperandoFoto
    }
  );

  return this._resolverResultadoKilometraje(res, resultado);
};

FlujoBase.prototype._manejarKmManual = async function(res, sesion, telefono, mensaje, numMedia, mediaUrls) {
  var self = this;
  var mensajes = this.mensajes;

  var opcionesCompartidas = this._crearOpcionesCompartidasOdometro({
    telefono: telefono,
    etapa: 'km_manual',
    estadoManual: self.ESTADOS.KM_MANUAL || self.ESTADOS.ODOMETRO_MANUAL,
    estadoEsperandoFoto: self.ESTADOS.ESPERANDO_FOTO_ODOMETRO,
    numMedia: numMedia,
    mediaUrls: mediaUrls
  });

  var resultado = await kmCompartido.manejarOdometroManual(
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
      numMedia: opcionesCompartidas.numMedia,
      mediaUrls: opcionesCompartidas.mediaUrls,
      procesarFotoOdometro: opcionesCompartidas.procesarFotoOdometro,
      esAtrasOdometro: opcionesCompartidas.esAtrasOdometro,
      manejarAtrasDesdeOdometro: opcionesCompartidas.manejarAtrasDesdeOdometro,
      volverMenuPrincipal: opcionesCompartidas.volverMenuPrincipal,
      telefono: opcionesCompartidas.telefono,
      esOpcion: opcionesCompartidas.esOpcion,
      onKilometrajeConfirmado: opcionesCompartidas.onKilometrajeConfirmado,
      politicaKilometraje: opcionesCompartidas.politicaKilometraje,
      contextoFlujo: opcionesCompartidas.contextoFlujo
    }
  );

  return this._resolverResultadoKilometraje(res, resultado);
};

FlujoBase.prototype._crearOpcionesCompartidasOdometro = function(opciones) {
  var self = this;
  var telefono = opciones.telefono;
  // Prioridad de continuidad en km:
  // 1) Camino moderno principal
  var onKilometrajeConfirmado = self._onKilometrajeConfirmado
    ? async function(data) {
      return self._onKilometrajeConfirmado(data);
    }
    : null;

  return {
    telefono: telefono,
    etapa: opciones.etapa,
    estadoManual: opciones.estadoManual,
    estadoEsperandoFoto: opciones.estadoEsperandoFoto,
    numMedia: opciones.numMedia,
    mediaUrls: opciones.mediaUrls,
    mensajeInicioOdometro: function(s) {
      return self._mensajeInicioOdometro(s);
    },
    procesarFotoOdometro: function(r, s, url) {
      return self._procesarFotoOdometro(r, s, url);
    },
    volverMenuPrincipal: function(r, t) {
      sesiones.eliminarSesion(t);
      return twiml.responderTwiml(r, nav.textoMenuPrincipal());
    },
    esAtrasOdometro: nav.esAtras,
    manejarAtrasDesdeOdometro: function(r, s) {
      return self.manejarAtras(r, s, telefono);
    },
    esOpcion: nav.esOpcion,
    onKilometrajeConfirmado: onKilometrajeConfirmado,
    politicaKilometraje: self._politicaKilometraje,
    contextoFlujo: {
      tipoFlujo: self.tipo,
      etapa: opciones.etapa
    }
  };
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

FlujoBase.prototype._normalizarResultadoPlaca = function(resultado) {
  if (resultado && typeof resultado === 'object' && typeof resultado.userMessage === 'string') {
    return {
      ok: !!resultado.ok,
      code: resultado.code || (resultado.ok ? 'PLATE_CONFIRMED' : 'PLATE_RETRY'),
      userMessage: resultado.userMessage,
      payload: resultado.payload || null
    };
  }
  if (typeof resultado === 'string') {
    var esExito = this._esRespuestaExito(resultado);
    var esBloqueado = this._esVehiculoBloqueado(resultado);
    if (esExito) {
      return { ok: true, code: 'PLATE_CONFIRMED', userMessage: resultado, payload: null };
    }
    if (esBloqueado) {
      return { ok: false, code: 'PLATE_BLOCKED', userMessage: resultado, payload: null };
    }
    return { ok: false, code: 'PLATE_RETRY', userMessage: resultado, payload: null };
  }
  return { ok: false, code: 'PLATE_RETRY', userMessage: '', payload: null };
};

FlujoBase.prototype._normalizarResultadoKilometraje = function(resultado) {
  if (typeof kmCompartido.normalizarResultadoKm === 'function') {
    return kmCompartido.normalizarResultadoKm(resultado);
  }
  if (resultado && typeof resultado === 'object' && typeof resultado.userMessage === 'string') {
    return {
      ok: !!resultado.ok,
      code: resultado.code || (resultado.ok ? 'KM_CONFIRMED' : 'KM_RETRY'),
      userMessage: resultado.userMessage,
      payload: resultado.payload || null
    };
  }
  if (typeof resultado === 'string') {
    return { ok: false, code: 'KM_LEGACY_STRING', userMessage: resultado, payload: null };
  }
  return { ok: false, code: 'KM_RETRY', userMessage: '', payload: null };
};

FlujoBase.prototype._resolverResultadoKilometraje = function(res, resultado) {
  var normalizado = this._normalizarResultadoKilometraje(resultado);
  if (
    normalizado.code === 'KM_DELEGATED_RESPONSE' &&
    normalizado.payload &&
    normalizado.payload.response
  ) {
    return normalizado.payload.response;
  }
  return twiml.responderTwiml(res, normalizado.userMessage);
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

/**
 * Implementación default de onExitoPlaca.
 * Carga plantilla y asigna estado según tipo de medición.
 * Los flujos hijos sobreescriben onExitoPlaca para lógica adicional
 * PERO deben llamar a este método internamente.
 *
 * @param {Object} sesion
 * @param {string} tipoInspeccion — 'preoperacional' | 'posoperacional' | 'tanqueo'
 * @param {Object} opcionesExtra — { reiniciarFn, estadoSinMedicion, filtrarGrupos }
 */
FlujoBase.prototype._onExitoPlacaDefault = async function(sesion, tipoInspeccion, opcionesExtra) {
  var plantillasServ = require('../../../servicios/plantillas');
  var opts = opcionesExtra || {};
  var ESTADOS = this.ESTADOS;

  try {
    var plantilla = await plantillasServ.cargar(
      sesion.vehiculo.tipo_activo_id,
      tipoInspeccion,
      sesion.vehiculo.empresa_id
    );
    sesion.plantilla = plantilla;

    if (typeof opts.filtrarGrupos === 'function') {
      sesion.gruposInspeccion = opts.filtrarGrupos(plantilla.grupos);
    }

    var medicion = plantilla.config.medicion || 'km';

    if (medicion === 'horas') {
      sesion.estado = ESTADOS.ESPERANDO_FOTO_HOROMETRO;
    } else if (medicion === 'ambos') {
      sesion.estado = ESTADOS.ESPERANDO_FOTO_ODOMETRO;
    } else if (medicion === 'ninguna') {
      sesion.estado = opts.estadoSinMedicion || ESTADOS.ESPERANDO_FOTO_ODOMETRO;
    } else {
      sesion.estado = ESTADOS.ESPERANDO_FOTO_ODOMETRO;
    }
  } catch (error) {
    console.error('Error cargando plantilla en ' + tipoInspeccion + ':', error);
    sesion.sinPlantilla = true;
    sesion.plantilla = null;
    if (typeof opts.filtrarGrupos === 'function') {
      sesion.gruposInspeccion = [];
    }
    sesion.estado = ESTADOS.ESPERANDO_FOTO_ODOMETRO;
  }
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
