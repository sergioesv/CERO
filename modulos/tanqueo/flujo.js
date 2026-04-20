/**
 * flujo.js — FlujoTanqueo: máquina de estados del módulo de tanqueo v3.
 * Extiende FlujoBase — solo implementa estados propios del tanqueo.
 * Flujo: foto placa → odómetro → foto factura (OCR con score) → confirmación / fallback
 * CERO — Gestión de Operaciones de Campo
 */

'use strict';

var FlujoBase  = require('../inspecciones/compartido/baseFlujo');
var twiml      = require('../inspecciones/compartido/twiml');
var storage    = require('../../servicios/storage');
var ocr        = require('../../servicios/ocr');
var sesiones   = require('../../servicios/sesiones');
var nav        = require('../inspecciones/compartido/navegacion');
var validaciones = require('./validaciones');
var estadoMod    = require('./estado');
var ESTADOS      = estadoMod.ESTADOS;
var mensajes     = require('./mensajes');
var cierre       = require('./cierre');

// ============================================================================
// CONFIGURAR FLUJO BASE
// ============================================================================

function crearFlujoTanqueo() {
  var flujo = new FlujoBase({
    tipo: 'tanqueo',
    ESTADOS: ESTADOS,
    mensajes: mensajes,
    validaciones: validaciones,
    tipoFotoPlaca: 'placa',

    mensajeInicio: function() {
      return mensajes.inicio();
    },

    mensajeConfirmacionPlaca: function(vehiculo, refKm) {
      return '\u2705 *' + vehiculo.placa + '*\n' +
        [vehiculo.tipo, vehiculo.marca, vehiculo.modelo].filter(Boolean).join(' ') +
        '\n\n' + mensajes.solicitarFotoOdometro(refKm);
    },

    mensajeInicioOdometro: function(sesion) {
      return mensajes.solicitarFotoOdometro(sesion.kmReferenciaMeta);
    },

    onExitoPlaca: async function(sesion) {
      await this._onExitoPlacaDefault(sesion, 'tanqueo', {});
    },

    mensajeConfirmacionOdometro: function(sesion, prefijo) {
      if (sesion.kmDetectado == null) {
        return mensajes.solicitarKmManual(sesion.kmReferenciaMeta);
      }
      var ult = sesion.kmReferenciaMeta && typeof sesion.kmReferenciaMeta.kilometraje === 'number'
        ? sesion.kmReferenciaMeta.kilometraje
        : (sesion.vehiculo && typeof sesion.vehiculo.kilometraje === 'number' ? sesion.vehiculo.kilometraje : null);
      if (typeof ult === 'number' && sesion.kmDetectado != null) {
        sesion.kmReferencia = ult;
        sesion.diferenciaKm = sesion.kmDetectado - ult;
      }
      return mensajes.confirmarKmOcr(sesion);
    },

    mensajeKilometrajeFueraRango: function(sesion, evaluacion, maxKmSalto) {
      var ult = sesion.kmReferenciaMeta && typeof sesion.kmReferenciaMeta.kilometraje === 'number'
        ? sesion.kmReferenciaMeta.kilometraje
        : (sesion.vehiculo && typeof sesion.vehiculo.kilometraje === 'number' ? sesion.vehiculo.kilometraje : null);
      if (typeof ult === 'number' && sesion.kmDetectado != null) {
        sesion.kmReferencia = ult;
        sesion.diferenciaKm = sesion.kmDetectado - ult;
      }
      sesion.alertasKm = evaluacion && evaluacion.mensaje
        ? [{ mensaje: evaluacion.mensaje, mensajeCorto: evaluacion.mensajeCorto || '' }]
        : [];
      return mensajes.alertaKmFueraRango(sesion);
    },

    primerMensajeInspeccion: function(s) {
      return mensajes.kilometrajeConfirmadoPrefijo(s.kilometraje) + mensajes.solicitarFotoFactura();
    },

    onKilometrajeConfirmado: async function(datosKm) {
      return resolverKilometrajeConfirmadoTanqueo(datosKm);
    },

    // Compatibilidad temporal: mantener callbacks legacy mientras conviven rutas antiguas.
    onRegistrarKm: function(sesion, km, origen) {
      resolverKilometrajeConfirmadoTanqueo({
        sesion: sesion,
        kilometraje: km,
        origen: origen,
        alertas: [],
        contexto: { fuente: 'legacy_registrar', prefijoMensaje: '' }
      });
    },

    onConfirmarKm: async function(res, sesion) {
      var resultado = await resolverKilometrajeConfirmadoTanqueo({
        res: res,
        sesion: sesion,
        kilometraje: sesion.kmDetectado,
        origen: 'Km confirmado: ' + sesion.kmDetectado + ' km',
        alertas: [],
        contexto: { fuente: 'legacy_confirmar', prefijoMensaje: '' }
      });
      return twiml.responderTwiml(res, resultado.userMessage);
    }
  });

  // Sobreescribir métodos abstractos
  flujo.inicializarSesion = inicializarSesionTanqueo;
  flujo.manejarAtras = manejarAtras;
  flujo.procesarEstado = procesarEstado;

  return flujo;
}

// ============================================================================
// HELPERS
// ============================================================================

function aplicarReferenciaKm(sesion) {
  var km = sesion.kilometraje;
  if (km == null) return;
  var ev = validaciones.evaluarKilometrajeContraReferencia(km, sesion.kmReferenciaMeta);
  sesion.kmReferencia = ev.kmReferencia;
  sesion.diferenciaKm = ev.diferenciaKm;
  sesion.inconsistenciaKm = ev.inconsistenciaKm;
  sesion.alertasKm = ev.alertasKm;
}

async function resolverKilometrajeConfirmadoTanqueo(datosKm) {
  var sesion = datosKm.sesion;
  var kilometraje = datosKm.kilometraje;
  var contexto = datosKm.contexto || {};
  var origen = datosKm.origen;
  var prefijo = contexto.prefijoMensaje || '';

  sesion.kilometraje = kilometraje;
  sesion.kmOcrOdometro = kilometraje;
  aplicarReferenciaKm(sesion);

  if (contexto.fuente === 'confirmacion_ocr' && typeof kilometraje === 'number') {
    origen = 'Km confirmado: ' + kilometraje + ' km';
  }

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
  sesion.estado = ESTADOS.ESPERANDO_FOTO_FACTURA;

  return {
    ok: true,
    code: datosKm.alertas && datosKm.alertas.length ? 'KM_RECORDED_WITH_ALERT' : 'KM_RECORDED',
    userMessage: prefijo + mensajes.kilometrajeConfirmadoPrefijo(sesion.kilometraje) + mensajes.solicitarFotoFactura(),
    payload: {
      kilometraje: kilometraje,
      estadoSiguiente: ESTADOS.ESPERANDO_FOTO_FACTURA
    }
  };
}

function extraerCamposOcr(sesion, datosOcr) {
  if (datosOcr.factura_numero && datosOcr.factura_numero.leido) {
    sesion.facturaNumeroOcr = String(datosOcr.factura_numero.valor || '').trim();
  }
  if (datosOcr.placa && datosOcr.placa.leido) {
    sesion.placaOcrFactura = validaciones.normalizarPlaca(datosOcr.placa.valor);
  }
  if (datosOcr.kilometraje && datosOcr.kilometraje.leido) {
    sesion.kmOcrFactura = String(datosOcr.kilometraje.valor || '').replace(/\D/g, '') || null;
  }
  if (datosOcr.cantidad && datosOcr.cantidad.leido) {
    var cantParsed = parseFloat(String(datosOcr.cantidad.valor).replace(',', '.'));
    sesion.cantidadOcr = isNaN(cantParsed) ? null : cantParsed;
  }
  if (datosOcr.unidad_medida && datosOcr.unidad_medida.leido) {
    var u = String(datosOcr.unidad_medida.valor || '').toLowerCase();
    sesion.unidadMedida = /gal/.test(u) ? 'galones' : 'litros';
  }
  if (datosOcr.producto && datosOcr.producto.leido) {
    var validTipo = validaciones.validarTipoCombustible(datosOcr.producto.valor);
    if (validTipo.ok) sesion.tipoCombustible = validTipo.valor;
  }
  if (datosOcr.valor_total && datosOcr.valor_total.leido) {
    var vt = parseFloat(String(datosOcr.valor_total.valor || '').replace(/[^0-9.]/g, ''));
    if (!isNaN(vt)) sesion.valorTotal = vt;
  }
  if (datosOcr.estacion && datosOcr.estacion.leido) {
    sesion.estacionServicio = String(datosOcr.estacion.valor || '').trim() || null;
  }
}

async function procesarOcrFactura(sesion, fotoUrl) {
  storage.guardarFotoUnica(sesion, {
    tipo: 'factura',
    url: fotoUrl,
    descripcion: 'Foto del recibo de tanqueo',
    validacion: 'Foto recibo cargada',
    validada: true
  });
  sesion.fotoFacturaTemporal = fotoUrl;

  try {
    var datosOcr = await ocr.extraerDatosFacturaCombustible(fotoUrl);
    sesion.datosOcrFactura = datosOcr;
    sesion.scoreOcrGlobal  = datosOcr.score_global || 0;
    sesion.tierOcr         = datosOcr.tier_ocr     || 3;
    extraerCamposOcr(sesion, datosOcr);
    console.log('[Tanqueo] OCR score: ' + sesion.scoreOcrGlobal + ' tier: ' + sesion.tierOcr);
  } catch (eOcr) {
    console.error('[Tanqueo] Error OCR factura:', eOcr.message);
    sesion.tierOcr = 3;
  }
}

function respuestaPorTier(res, sesion) {
  if (sesion.tierOcr === 1) {
    sesion.estado = ESTADOS.CONFIRMACION_RESUMEN;
    return twiml.responderTwiml(res, mensajes.resumenOcrCompleto(sesion));
  }
  if (sesion.tierOcr === 2) {
    sesion.estado = ESTADOS.CONFIRMACION_RESUMEN;
    return twiml.responderTwiml(res, mensajes.resumenOcrParcial(sesion));
  }
  // tier 3 — fallback
  sesion.estado = ESTADOS.FALLBACK_FACTURA;
  return twiml.responderTwiml(res, mensajes.fallbackFactura());
}

// ============================================================================
// INICIALIZACIÓN
// ============================================================================

function inicializarSesionTanqueo(sesion) {
  sesion.tipo   = 'tanqueo';
  sesion.estado = ESTADOS.INICIO;

  // Vehículo y conductor
  sesion.placa              = null;
  sesion.vehiculo           = null;
  sesion.conductor          = null;
  sesion.fotoPlacaTemporal  = null;
  sesion.placaDetectada     = null;
  sesion.placaSugerida      = null;

  // Kilometraje
  sesion.kilometraje          = null;
  sesion.kmDetectado          = null;
  sesion.kmLecturaFueraRango  = false;
  sesion.fotoOdometroTemporal = null;
  sesion.kmReferenciaMeta     = null;
  sesion.kmReferencia         = null;
  sesion.diferenciaKm         = null;
  sesion.inconsistenciaKm     = false;
  sesion.alertasKm            = [];

  // OCR factura
  sesion.datosOcrFactura      = null;
  sesion.scoreOcrGlobal       = 0;
  sesion.tierOcr              = 3;
  sesion.fotoFacturaTemporal  = null;

  // Campos de OCR / manual
  sesion.facturaNumeroOcr     = null;
  sesion.facturaNumeroManual  = null;
  sesion.placaOcrFactura      = null;
  sesion.placaOcrFoto         = null;
  sesion.kmOcrFactura         = null;
  sesion.kmOcrOdometro        = null;
  sesion.cantidadOcr          = null;
  sesion.cantidadManual       = null;
  sesion.unidadMedida         = 'litros';
  sesion.tipoCombustible      = null;
  sesion.valorTotal           = null;
  sesion.estacionServicio     = null;

  // Control de flujo
  sesion.conductorCorrigioDato = false;
  sesion.fotoTableroTemporal   = null;
  sesion.flagSinFactura        = false;
  sesion.fotos = [];
}

// ============================================================================
// MANEJAR ATRÁS
// ============================================================================

function manejarAtras(res, sesion) {
  switch (sesion.estado) {
    // Desde placa → reiniciar
    case ESTADOS.ESPERANDO_FOTO_PLACA:
    case ESTADOS.PLACA_FALLBACK:
    case ESTADOS.PLACA_CONFIRMACION_SUGERIDA:
    case ESTADOS.PLACA_MANUAL:
      sesion.placaDetectada    = null;
      sesion.placaSugerida     = null;
      sesion.fotoPlacaTemporal = null;
      sesion.estado = ESTADOS.ESPERANDO_FOTO_PLACA;
      return twiml.responderTwiml(res, mensajes.inicio());

    // Desde odómetro → placa
    case ESTADOS.ESPERANDO_FOTO_ODOMETRO:
    case ESTADOS.CONFIRMACION_KM:
    case ESTADOS.KM_MANUAL:
      sesion.placa            = null;
      sesion.vehiculo         = null;
      sesion.conductor        = null;
      sesion.kmReferenciaMeta = null;
      sesion.placaOcrFoto     = null;
      sesion.kmDetectado      = null;
      sesion.kmLecturaFueraRango = false;
      sesion.kmReferencia     = null;
      sesion.diferenciaKm     = null;
      sesion.inconsistenciaKm = false;
      sesion.alertasKm        = [];
      storage.limpiarFotosPorTipo(sesion, ['odometro', 'placa']);
      sesion.estado = ESTADOS.ESPERANDO_FOTO_PLACA;
      return twiml.responderTwiml(res, '◀️ Volvemos a la placa.\n\n' + mensajes.inicio());

    // Desde factura → odómetro
    case ESTADOS.ESPERANDO_FOTO_FACTURA:
      sesion.estado = ESTADOS.ESPERANDO_FOTO_ODOMETRO;
      return twiml.responderTwiml(res,
        '◀️ Volvemos al odómetro.\n\n' + mensajes.solicitarFotoOdometro(sesion.kmReferenciaMeta)
      );

    // Desde resumen → volver a pedir foto factura
    case ESTADOS.CONFIRMACION_RESUMEN:
      sesion.datosOcrFactura     = null;
      sesion.scoreOcrGlobal      = 0;
      sesion.tierOcr             = 3;
      sesion.facturaNumeroOcr    = null;
      sesion.facturaNumeroManual = null;
      sesion.cantidadOcr         = null;
      sesion.cantidadManual      = null;
      sesion.valorTotal          = null;
      sesion.conductorCorrigioDato = false;
      storage.limpiarFotosPorTipo(sesion, ['factura']);
      sesion.estado = ESTADOS.ESPERANDO_FOTO_FACTURA;
      return twiml.responderTwiml(res,
        '◀️ Volvemos al recibo.\n\n' + mensajes.solicitarFotoFactura()
      );

    // Desde corrección → resumen
    case ESTADOS.CORREGIR_CAMPO:
      sesion.facturaNumeroManual   = null;
      sesion.conductorCorrigioDato = false;
      sesion.estado = ESTADOS.CONFIRMACION_RESUMEN;
      var msgResumen = sesion.tierOcr === 1
        ? mensajes.resumenOcrCompleto(sesion)
        : mensajes.resumenOcrParcial(sesion);
      return twiml.responderTwiml(res, msgResumen);

    // Desde cantidad manual → corrección o manual
    case ESTADOS.CANTIDAD_MANUAL:
      sesion.cantidadManual = null;
      sesion.estado = sesion.tierOcr < 3
        ? ESTADOS.CORREGIR_CAMPO
        : ESTADOS.FACTURA_MANUAL;
      return twiml.responderTwiml(res, mensajes.solicitarFacturaManualSimple());

    // Desde fallback factura → volver a pedir foto
    case ESTADOS.FALLBACK_FACTURA:
      storage.limpiarFotosPorTipo(sesion, ['factura']);
      sesion.datosOcrFactura = null;
      sesion.estado = ESTADOS.ESPERANDO_FOTO_FACTURA;
      return twiml.responderTwiml(res,
        '◀️ Volvemos al recibo.\n\n' + mensajes.solicitarFotoFactura()
      );

    // Desde factura manual → fallback
    case ESTADOS.FACTURA_MANUAL:
      sesion.estado = ESTADOS.FALLBACK_FACTURA;
      return twiml.responderTwiml(res, mensajes.fallbackFactura());

    // Desde foto tablero → fallback
    case ESTADOS.ESPERANDO_FOTO_TABLERO:
      sesion.estado = ESTADOS.FALLBACK_FACTURA;
      return twiml.responderTwiml(res, mensajes.fallbackFactura());

    default:
      return twiml.responderTwiml(res,
        'No hay paso anterior.\n\n0️⃣ _Atrás_  •  9️⃣ _Menú principal_'
      );
  }
}

// ============================================================================
// PROCESADOR DE ESTADOS — solo los estados propios del tanqueo
// ============================================================================

async function procesarEstado(res, sesion, telefono, mensaje, msgUpper, mediaUrls) {
  var msgLower = mensaje.toLowerCase();
  var numMedia = mediaUrls.length;

  // Primero intentar con los estados compartidos (placa/odómetro)
  var resultadoCompartido = await this.procesarEstadoCompartido(res, sesion, telefono, mensaje, mediaUrls);
  if (resultadoCompartido !== null) return resultadoCompartido;

  // Estados propios del tanqueo
  switch (sesion.estado) {

    // ── FOTO FACTURA ────────────────────────────────────────
    case ESTADOS.ESPERANDO_FOTO_FACTURA:
      if (numMedia === 0) {
        return twiml.responderTwiml(res, mensajes.solicitarFotoFactura());
      }
      await procesarOcrFactura(sesion, mediaUrls[0]);
      return respuestaPorTier(res, sesion);

    // ── RESUMEN (tier 1 o 2) ────────────────────────────────
    case ESTADOS.CONFIRMACION_RESUMEN:
      if (msgLower === '1' || msgLower === '1️⃣') {
        var guardado = await cierre.guardarTanqueo(sesion, telefono);
        if (guardado.error) {
          console.error('[Tanqueo] Error guardando:', guardado.error);
          return twiml.responderTwiml(res, mensajes.errorGenericoTanqueo());
        }
        sesiones.eliminarSesion(telefono);
        var esAutoValidado = guardado.estadoValidacion === 'auto_validado';
        var msgGuardado = esAutoValidado
          ? mensajes.tanqueoGuardadoAutoValidado(guardado.tanqueo)
          : mensajes.tanqueoGuardadoPendiente(guardado.tanqueo, false);
        return twiml.responderTwiml(res, msgGuardado);
      }
      if (msgLower === '2' || msgLower === '2️⃣') {
        sesion.conductorCorrigioDato = true;
        sesion.estado = ESTADOS.CORREGIR_CAMPO;
        return twiml.responderTwiml(res, mensajes.solicitarFacturaManualSimple());
      }
      var msgRep = sesion.tierOcr === 1
        ? mensajes.resumenOcrCompleto(sesion)
        : mensajes.resumenOcrParcial(sesion);
      return twiml.responderTwiml(res, msgRep);

    // ── CORREGIR CAMPO ──────────────────────────────────────
    case ESTADOS.CORREGIR_CAMPO:
      if (!mensaje || mensaje.length < 1) {
        return twiml.responderTwiml(res, mensajes.solicitarFacturaManualSimple());
      }
      sesion.facturaNumeroManual = mensaje.trim();
      sesion.conductorCorrigioDato = true;
      sesion.estado = ESTADOS.CANTIDAD_MANUAL;
      return twiml.responderTwiml(res, mensajes.solicitarCantidadManual());

    // ── FALLBACK FACTURA ────────────────────────────────────
    case ESTADOS.FALLBACK_FACTURA:
      if (numMedia > 0) {
        storage.limpiarFotosPorTipo(sesion, ['factura']);
        sesion.datosOcrFactura = null;
        await procesarOcrFactura(sesion, mediaUrls[0]);
        return respuestaPorTier(res, sesion);
      }
      if (msgLower === '1' || msgLower === '1️⃣') {
        storage.limpiarFotosPorTipo(sesion, ['factura']);
        sesion.estado = ESTADOS.ESPERANDO_FOTO_FACTURA;
        return twiml.responderTwiml(res, mensajes.solicitarFotoFactura());
      }
      if (msgLower === '2' || msgLower === '2️⃣') {
        sesion.estado = ESTADOS.FACTURA_MANUAL;
        return twiml.responderTwiml(res, mensajes.solicitarFacturaManualSimple());
      }
      if (msgLower === '3' || msgLower === '3️⃣') {
        sesion.estado = ESTADOS.ESPERANDO_FOTO_TABLERO;
        return twiml.responderTwiml(res, mensajes.solicitarFotoTablero());
      }
      return twiml.responderTwiml(res, mensajes.fallbackFactura());

    // ── FACTURA MANUAL ──────────────────────────────────────
    case ESTADOS.FACTURA_MANUAL:
      if (!mensaje || mensaje.length < 1) {
        return twiml.responderTwiml(res, mensajes.solicitarFacturaManualSimple());
      }
      sesion.facturaNumeroManual   = mensaje.trim();
      sesion.conductorCorrigioDato = true;
      sesion.estado = ESTADOS.CANTIDAD_MANUAL;
      return twiml.responderTwiml(res, mensajes.solicitarCantidadManual());

    // ── CANTIDAD MANUAL ─────────────────────────────────────
    case ESTADOS.CANTIDAD_MANUAL: {
      var parsedCant = validaciones.parsearCantidad(mensaje);
      if (!parsedCant.ok) {
        return twiml.responderTwiml(res, parsedCant.mensaje);
      }
      sesion.cantidadManual        = parsedCant.cantidad;
      sesion.unidadMedida          = parsedCant.unidadMedida;
      sesion.conductorCorrigioDato = true;
      sesion.estado = ESTADOS.CONFIRMACION_RESUMEN;
      return twiml.responderTwiml(res, mensajes.resumenOcrParcial(sesion));
    }

    // ── FOTO TABLERO ────────────────────────────────────────
    case ESTADOS.ESPERANDO_FOTO_TABLERO:
      if (numMedia === 0) {
        return twiml.responderTwiml(res, mensajes.solicitarFotoTablero());
      }
      storage.guardarFotoUnica(sesion, {
        tipo: 'tablero',
        url: mediaUrls[0],
        descripcion: 'Foto del tablero de combustible',
        validacion: 'Sin factura física — evidencia tablero',
        validada: true
      });
      sesion.fotoTableroTemporal = mediaUrls[0];
      sesion.flagSinFactura      = true;
      {
        var guardadoTablero = await cierre.guardarTanqueo(sesion, telefono);
        if (guardadoTablero.error) {
          console.error('[Tanqueo] Error guardando (tablero):', guardadoTablero.error);
          return twiml.responderTwiml(res, mensajes.errorGenericoTanqueo());
        }
        sesiones.eliminarSesion(telefono);
        return twiml.responderTwiml(res,
          mensajes.tanqueoGuardadoPendiente(guardadoTablero.tanqueo, true)
        );
      }

    // ── DEFAULT ─────────────────────────────────────────────
    default:
      this.inicializarSesion(sesion);
      sesion.estado = ESTADOS.ESPERANDO_FOTO_PLACA;
      return twiml.responderTwiml(res, mensajes.inicio());
  }
}

// ============================================================================
// SINGLETON Y EXPORTS
// ============================================================================

var instancia = crearFlujoTanqueo();

module.exports = {
  manejarTanqueo: function(req, res) { return instancia.manejar(req, res); },
  manejar: function(req, res) { return instancia.manejar(req, res); },
  ESTADOS: ESTADOS,
  reiniciarSesionTanqueo: inicializarSesionTanqueo
};
