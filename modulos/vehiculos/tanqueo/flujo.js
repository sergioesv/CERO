/**
 * flujo.js — Máquina de estados del módulo de tanqueo v3
 * Basado en el patrón real del preoperacional.
 * Flujo: foto placa → odómetro → foto factura (OCR con score) → confirmación / fallback
 * CERO — Gestión de Operaciones de Campo
 */

'use strict';

var twilio = require('twilio');
var config = require('../../../config/config');
var ocr = require('../../../servicios/ocr');
var storage = require('../../../servicios/storage');
var sesiones = require('../../../servicios/sesiones');
var vehiculosData = require('../../../data/vehiculos');
var tanqueosData = require('../../../data/tanqueos');
var nav = require('../compartido/navegacion');
var kmCompartido = require('../compartido/kilometraje');
var validaciones = require('./validaciones');
var estadoMod = require('./estado');
var ESTADOS = estadoMod.ESTADOS;
var mensajes = require('./mensajes');
var cierre = require('./cierre');

function obtenerUrlWebhook(req) {
  if (config.TWILIO_WEBHOOK_URL) return config.TWILIO_WEBHOOK_URL;
  var proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  var host = req.headers['x-forwarded-host'] || req.get('host') || '';
  return proto + '://' + host + req.originalUrl;
}

function firmaTwilioValida(req) {
  var esDesarrollo = process.env.NODE_ENV !== 'production';
  if (esDesarrollo && String(process.env.DISABLE_TWILIO_SIGNATURE_VALIDATION || '').toLowerCase() === 'true') {
    return true;
  }
  if (!esDesarrollo && String(process.env.DISABLE_TWILIO_SIGNATURE_VALIDATION || '').toLowerCase() === 'true') {
    console.warn('⚠️ Validación de firma desactivada en producción — bloqueado');
    return false;
  }
  if (!config.TWILIO_AUTH_TOKEN) {
    console.warn('TWILIO_AUTH_TOKEN no configurado; se omite validación de firma.');
    return true;
  }
  var signature = req.headers['x-twilio-signature'];
  if (!signature) return false;
  try {
    return twilio.validateRequest(config.TWILIO_AUTH_TOKEN, signature, obtenerUrlWebhook(req), req.body || {});
  } catch (e) {
    console.error('Error validando firma Twilio:', e.message);
    return false;
  }
}

function volverMenuPrincipal(res, telefono) {
  sesiones.eliminarSesion(telefono);
  return validaciones.responderTwiml(res, nav.textoMenuPrincipal());
}

function aplicarReferenciaKilometrajeTanqueo(sesion) {
  var km = sesion.kilometraje;
  if (km == null) return;
  var ev = validaciones.evaluarKilometrajeContraReferencia(km, sesion.kmReferenciaMeta);
  sesion.kmReferencia = ev.kmReferencia;
  sesion.diferenciaKm = ev.diferenciaKm;
  sesion.inconsistenciaKm = ev.inconsistenciaKm;
  sesion.alertasKm = ev.alertasKm;
}

function mensajeConfirmacionOdometroTanqueo(sesion, prefijo) {
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
}

function mensajeKilometrajeFueraRangoTanqueo(sesion, evaluacion, maxKmSalto) {
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
}

function reiniciarSesionTanqueo(sesion) {
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

  // Campos extraídos de OCR o ingresados manualmente
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

async function iniciarSesionConVehiculo(sesion, telefono, placa, fotoUrl, validacionTexto) {
  var carga = await vehiculosData.cargarVehiculoYConductor(placa, telefono);

  if (carga.error || !carga.vehiculo) {
    return { ok: false, tipo: 'no_encontrado', mensaje: mensajes.vehiculoNoEncontrado(placa) };
  }

  if (carga.vehiculo.bloqueado) {
    return {
      ok: false,
      tipo: 'bloqueado',
      mensaje: mensajes.vehiculoBloqueado(placa, carga.vehiculo.motivo_bloqueo)
    };
  }

  sesion.placa = placa;
  sesion.vehiculo = carga.vehiculo;
  sesion.conductor = carga.conductor || null;
  sesion.kmReferenciaMeta = await tanqueosData.obtenerReferenciaKilometraje(placa);

  storage.guardarFotoUnica(sesion, {
    tipo: 'placa',
    url: fotoUrl,
    descripcion: 'Foto frontal con placa',
    validacion: validacionTexto || ('Placa registrada: ' + placa),
    validada: true
  });

  sesion.placaOcrFoto = placa;
  sesion.estado = ESTADOS.ESPERANDO_FOTO_ODOMETRO;

  return {
    ok: true,
    mensaje: '✅ *' + placa + '*\n' +
      [carga.vehiculo.tipo, carga.vehiculo.marca, carga.vehiculo.modelo].filter(Boolean).join(' ') +
      '\n\n' + mensajes.solicitarFotoOdometro(sesion.kmReferenciaMeta)
  };
}

async function procesarFotoPlaca(res, sesion, telefono, fotoUrl) {
  var lecturaPlaca = await ocr.extraerPlacaFoto(fotoUrl);
  var placaDetectada = validaciones.normalizarPlaca(lecturaPlaca.placa || '');

  if (lecturaPlaca.valida && placaDetectada) {
    var inicio = await iniciarSesionConVehiculo(sesion, telefono, placaDetectada, fotoUrl, 'Placa validada por foto: ' + placaDetectada);
    if (inicio.ok) return validaciones.responderTwiml(res, inicio.mensaje);
    if (inicio.tipo === 'bloqueado') return validaciones.responderTwiml(res, inicio.mensaje);
  }

  sesion.fotoPlacaTemporal = fotoUrl;
  sesion.placaDetectada = placaDetectada || null;
  sesion.placaSugerida = null;

  if (placaDetectada) {
    var sugerida = await vehiculosData.buscarPlacaSugerida(placaDetectada);
    if (sugerida && sugerida !== placaDetectada) {
      sesion.placaSugerida = sugerida;
      sesion.estado = ESTADOS.PLACA_CONFIRMACION_SUGERIDA;
      return validaciones.responderTwiml(res, mensajes.confirmarPlacaSugerida(sesion));
    }
  }

  sesion.estado = ESTADOS.PLACA_FALLBACK;
  var motivo = lecturaPlaca.razon || 'La placa no se pudo validar con seguridad.';
  if (placaDetectada && lecturaPlaca.valida) {
    motivo = 'La placa *' + placaDetectada + '* no existe en la base.';
  }
  return validaciones.responderTwiml(res, mensajes.fallbackPlaca(sesion, motivo));
}

async function procesarFotoOdometroTanqueo(res, sesion, fotoUrl) {
  return await kmCompartido.procesarFotoOdometro(res, sesion, fotoUrl, {
    tipoFlujo: 'preoperacional',
    estadoConfirmacion: ESTADOS.CONFIRMACION_KM,
    responderFn: validaciones.responderTwiml,
    mensajesModulo: {
      mensajeConfirmacionOdometro: mensajeConfirmacionOdometroTanqueo,
      mensajeKilometrajeFueraRango: mensajeKilometrajeFueraRangoTanqueo
    },
    maxKmSalto: config.MAX_KM_SALTO
  });
}

function manejarAtras(res, sesion) {
  switch (sesion.estado) {

    // Desde placa → reiniciar
    case ESTADOS.ESPERANDO_FOTO_PLACA:
    case ESTADOS.PLACA_FALLBACK:
    case ESTADOS.PLACA_CONFIRMACION_SUGERIDA:
    case ESTADOS.PLACA_MANUAL:
      sesion.placaDetectada   = null;
      sesion.placaSugerida    = null;
      sesion.fotoPlacaTemporal = null;
      sesion.estado = ESTADOS.ESPERANDO_FOTO_PLACA;
      return validaciones.responderTwiml(res, mensajes.inicio());

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
      return validaciones.responderTwiml(res, '◀️ Volvemos a la placa.\n\n' + mensajes.inicio());

    // Desde factura → odómetro
    case ESTADOS.ESPERANDO_FOTO_FACTURA:
      sesion.estado = ESTADOS.ESPERANDO_FOTO_ODOMETRO;
      return validaciones.responderTwiml(res,
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
      return validaciones.responderTwiml(res,
        '◀️ Volvemos al recibo.\n\n' + mensajes.solicitarFotoFactura()
      );

    // Desde corrección → resumen
    case ESTADOS.CORREGIR_CAMPO:
      sesion.facturaNumeroManual  = null;
      sesion.conductorCorrigioDato = false;
      sesion.estado = ESTADOS.CONFIRMACION_RESUMEN;
      var msgResumen = sesion.tierOcr === 1
        ? mensajes.resumenOcrCompleto(sesion)
        : mensajes.resumenOcrParcial(sesion);
      return validaciones.responderTwiml(res, msgResumen);

    // Desde cantidad manual → número factura (corrección o manual)
    case ESTADOS.CANTIDAD_MANUAL:
      sesion.cantidadManual = null;
      sesion.estado = sesion.tierOcr < 3
        ? ESTADOS.CORREGIR_CAMPO
        : ESTADOS.FACTURA_MANUAL;
      return validaciones.responderTwiml(res, mensajes.solicitarFacturaManualSimple());

    // Desde fallback factura → volver a pedir foto
    case ESTADOS.FALLBACK_FACTURA:
      storage.limpiarFotosPorTipo(sesion, ['factura']);
      sesion.datosOcrFactura = null;
      sesion.estado = ESTADOS.ESPERANDO_FOTO_FACTURA;
      return validaciones.responderTwiml(res,
        '◀️ Volvemos al recibo.\n\n' + mensajes.solicitarFotoFactura()
      );

    // Desde factura manual → fallback
    case ESTADOS.FACTURA_MANUAL:
      sesion.estado = ESTADOS.FALLBACK_FACTURA;
      return validaciones.responderTwiml(res, mensajes.fallbackFactura());

    // Desde foto tablero → fallback
    case ESTADOS.ESPERANDO_FOTO_TABLERO:
      sesion.estado = ESTADOS.FALLBACK_FACTURA;
      return validaciones.responderTwiml(res, mensajes.fallbackFactura());

    default:
      return validaciones.responderTwiml(res,
        'No hay paso anterior.\n\n0️⃣ _Atrás_  •  9️⃣ _Menú principal_'
      );
  }
}

async function manejarTanqueo(req, res) {
  if (!firmaTwilioValida(req)) {
    return res.status(403).send('Forbidden');
  }

  var telefono = req.body.From || '';
  var mensaje = (req.body.Body || '').trim();
  var msgLower = mensaje.toLowerCase();
  var msgUpper = mensaje.toUpperCase();
  var mediaUrls = storage.obtenerMediaUrls(req);
  var numMedia = mediaUrls.length;

  if (!sesiones.bloquear(telefono)) {
    return validaciones.responderTwiml(res, 'Un momento, procesando tu mensaje anterior...');
  }

  try {
    var sesion = await sesiones.obtenerSesion(telefono);

    if (mensaje === '9' || msgUpper === 'CANCELAR' || msgUpper === 'MENU' || msgUpper === 'INICIO') {
      sesiones.eliminarSesion(telefono);
      return validaciones.responderTwiml(res, nav.textoMenuPrincipal());
    }

    if (mensaje === '0' || msgUpper === 'ATRAS') {
      return manejarAtras(res, sesion);
    }

    if (sesion.tipo !== 'tanqueo' || !sesion.estado || sesion.estado === ESTADOS.INICIO) {
      reiniciarSesionTanqueo(sesion);
      sesion.estado = ESTADOS.ESPERANDO_FOTO_PLACA;
      return validaciones.responderTwiml(res, mensajes.inicio());
    }

    switch (sesion.estado) {
      case ESTADOS.ESPERANDO_FOTO_PLACA:
        if (numMedia === 0) return validaciones.responderTwiml(res, mensajes.inicio());
        return await procesarFotoPlaca(res, sesion, telefono, mediaUrls[0]);

      case ESTADOS.PLACA_CONFIRMACION_SUGERIDA:
        if (numMedia > 0) return await procesarFotoPlaca(res, sesion, telefono, mediaUrls[0]);

        if (msgLower === '1' || msgLower === '1️⃣') {
          if (!sesion.placaSugerida) {
            return validaciones.responderTwiml(res, mensajes.confirmarPlacaSugerida(sesion));
          }
          var inicioSug = await iniciarSesionConVehiculo(
            sesion, telefono, sesion.placaSugerida,
            sesion.fotoPlacaTemporal,
            'Placa confirmada desde sugerencia: ' + sesion.placaSugerida
          );
          if (inicioSug.ok) return validaciones.responderTwiml(res, inicioSug.mensaje);
          if (inicioSug.tipo === 'bloqueado') return validaciones.responderTwiml(res, inicioSug.mensaje);
          return validaciones.responderTwiml(res, inicioSug.mensaje || mensajes.confirmarPlacaSugerida(sesion));
        }
        if (msgLower === '2' || msgLower === '2️⃣') {
          sesion.estado = ESTADOS.ESPERANDO_FOTO_PLACA;
          return validaciones.responderTwiml(res, mensajes.inicio());
        }
        if (msgLower === '3' || msgLower === '3️⃣') {
          sesion.estado = ESTADOS.PLACA_MANUAL;
          return validaciones.responderTwiml(res, mensajes.solicitarPlacaManual());
        }
        return validaciones.responderTwiml(res, mensajes.confirmarPlacaSugerida(sesion));

      case ESTADOS.PLACA_FALLBACK:
        if (numMedia > 0) return await procesarFotoPlaca(res, sesion, telefono, mediaUrls[0]);
        if (msgLower === '1' || msgLower === '1️⃣') {
          sesion.estado = ESTADOS.ESPERANDO_FOTO_PLACA;
          return validaciones.responderTwiml(res, mensajes.inicio());
        }
        if (msgLower === '2' || msgLower === '2️⃣') {
          sesion.estado = ESTADOS.PLACA_MANUAL;
          return validaciones.responderTwiml(res, mensajes.solicitarPlacaManual());
        }
        return validaciones.responderTwiml(res, mensajes.fallbackPlaca(sesion));

      case ESTADOS.PLACA_MANUAL:
        if (numMedia > 0) return await procesarFotoPlaca(res, sesion, telefono, mediaUrls[0]);
        var placaManual = validaciones.normalizarPlaca(mensaje);
        if (!placaManual) {
          return validaciones.responderTwiml(res, mensajes.escribePlacaSinEspacios());
        }
        var FORMATO_PLACA = /^[A-Z]{3}[0-9]{3}$/;
        if (!FORMATO_PLACA.test(placaManual)) {
          return validaciones.responderTwiml(res, mensajes.formatoPlacaEstandarInvalido());
        }
        var inicioManual = await iniciarSesionConVehiculo(
          sesion, telefono, placaManual,
          sesion.fotoPlacaTemporal,
          'Placa registrada manualmente: ' + placaManual
        );
        if (inicioManual.ok) return validaciones.responderTwiml(res, inicioManual.mensaje);
        if (inicioManual.tipo === 'bloqueado') return validaciones.responderTwiml(res, inicioManual.mensaje);
        return validaciones.responderTwiml(res, mensajes.vehiculoNoEncontrado(placaManual));

      case ESTADOS.ESPERANDO_FOTO_ODOMETRO:
        if (numMedia === 0) return validaciones.responderTwiml(res, mensajes.solicitarFotoOdometro(sesion.kmReferenciaMeta));
        return await procesarFotoOdometroTanqueo(res, sesion, mediaUrls[0]);

      case ESTADOS.CONFIRMACION_KM:
        return await kmCompartido.manejarConfirmacionOdometro(
          res, sesion, mensaje, numMedia, mediaUrls,
          {
            mensajesModulo: {
              mensajeConfirmacionOdometro: mensajeConfirmacionOdometroTanqueo,
              mensajeKilometrajeFueraRango: mensajeKilometrajeFueraRangoTanqueo
            },
            responderFn: validaciones.responderTwiml,
            estadoManual: ESTADOS.KM_MANUAL,
            estadoEsperandoFoto: ESTADOS.ESPERANDO_FOTO_ODOMETRO,
            maxKmSalto: config.MAX_KM_SALTO,
            mensajeInicioOdometro: function(s) {
              return mensajes.solicitarFotoOdometro(s.kmReferenciaMeta);
            },
            procesarFotoOdometro: procesarFotoOdometroTanqueo,
            telefono: telefono,
            volverMenuPrincipal: volverMenuPrincipal,
            esAtrasOdometro: function(m) {
              var ml = String(m || '').trim().toLowerCase();
              return ml === '0' || ml === '0️⃣';
            },
            manejarAtrasDesdeOdometro: manejarAtras,
            esOpcion: nav.esOpcion,
            onConfirmarPreoperacional: async function(res2, s) {
              s.kilometraje = s.kmDetectado;
              s.kmOcrOdometro = s.kmDetectado;
              aplicarReferenciaKilometrajeTanqueo(s);
              storage.guardarFotoUnica(s, {
                tipo: 'odometro',
                url: s.fotoOdometroTemporal,
                descripcion: 'Foto del odómetro',
                validacion: 'Km confirmado: ' + s.kmDetectado + ' km',
                validada: true
              });
              s.kmDetectado = null;
              s.kmLecturaFueraRango = false;
              s.fotoOdometroTemporal = null;
              s.estado = ESTADOS.ESPERANDO_FOTO_FACTURA;
              return validaciones.responderTwiml(res2,
                mensajes.kilometrajeConfirmadoPrefijo(s.kilometraje) + mensajes.solicitarFotoFactura()
              );
            }
          }
        );

      case ESTADOS.KM_MANUAL:
        return await kmCompartido.manejarOdometroManual(
          res, sesion, mensaje,
          {
            mensajeConfirmacionOdometro: mensajeConfirmacionOdometroTanqueo,
            mensajeKilometrajeFueraRango: mensajeKilometrajeFueraRangoTanqueo,
            primerMensajeInspeccion: function(s) {
              return mensajes.solicitarFotoFactura();
            }
          },
          validaciones.responderTwiml,
          {
            numMedia: numMedia,
            mediaUrls: mediaUrls,
            procesarFotoOdometro: procesarFotoOdometroTanqueo,
            esAtrasOdometro: function(m) {
              var ml = String(m || '').trim().toLowerCase();
              return ml === '0' || ml === '0️⃣';
            },
            manejarAtrasDesdeOdometro: manejarAtras,
            volverMenuPrincipal: volverMenuPrincipal,
            telefono: telefono,
            esOpcion: nav.esOpcion,
            registrarKilometrajePreoperacional: function(s, km, origen) {
              s.kilometraje = km;
              s.kmOcrOdometro = km;
              aplicarReferenciaKilometrajeTanqueo(s);
              storage.guardarFotoUnica(s, {
                tipo: 'odometro',
                url: s.fotoOdometroTemporal,
                descripcion: 'Foto del odómetro',
                validacion: origen,
                validada: true
              });
              s.kmDetectado = null;
              s.kmLecturaFueraRango = false;
              s.fotoOdometroTemporal = null;
              s.estado = ESTADOS.ESPERANDO_FOTO_FACTURA;
            }
          }
        );

      case ESTADOS.ESPERANDO_FOTO_FACTURA:
        if (numMedia === 0) {
          return validaciones.responderTwiml(res, mensajes.solicitarFotoFactura());
        }

        // Guardar foto factura
        storage.guardarFotoUnica(sesion, {
          tipo:        'factura',
          url:         mediaUrls[0],
          descripcion: 'Foto del recibo de tanqueo',
          validacion:  'Foto recibo cargada',
          validada:    true
        });
        sesion.fotoFacturaTemporal = mediaUrls[0];

        // OCR
        try {
          var datosOcr = await ocr.extraerDatosFacturaCombustible(mediaUrls[0]);
          sesion.datosOcrFactura = datosOcr;
          sesion.scoreOcrGlobal  = datosOcr.score_global  || 0;
          sesion.tierOcr         = datosOcr.tier_ocr      || 3;

          // Extraer campos a la sesión
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

          console.log('[Tanqueo] OCR score: ' + sesion.scoreOcrGlobal + ' tier: ' + sesion.tierOcr);
        } catch (eOcr) {
          console.error('[Tanqueo] Error OCR factura:', eOcr.message);
          sesion.tierOcr = 3;
        }

        // Enrutamiento por tier
        if (sesion.tierOcr === 1) {
          sesion.estado = ESTADOS.CONFIRMACION_RESUMEN;
          return validaciones.responderTwiml(res, mensajes.resumenOcrCompleto(sesion));
        }
        if (sesion.tierOcr === 2) {
          sesion.estado = ESTADOS.CONFIRMACION_RESUMEN;
          return validaciones.responderTwiml(res, mensajes.resumenOcrParcial(sesion));
        }
        // tier 3 — fallback
        sesion.estado = ESTADOS.FALLBACK_FACTURA;
        return validaciones.responderTwiml(res, mensajes.fallbackFactura());

      case ESTADOS.CONFIRMACION_RESUMEN:
        if (msgLower === '1' || msgLower === '1️⃣') {
          // Guardar
          var guardado = await cierre.guardarTanqueo(sesion, telefono);
          if (guardado.error) {
            console.error('[Tanqueo] Error guardando:', guardado.error);
            return validaciones.responderTwiml(res, mensajes.errorGenericoTanqueo());
          }
          sesiones.eliminarSesion(telefono);
          var esAutoValidado = guardado.estadoValidacion === 'auto_validado';
          var msgGuardado = esAutoValidado
            ? mensajes.tanqueoGuardadoAutoValidado(guardado.tanqueo)
            : mensajes.tanqueoGuardadoPendiente(guardado.tanqueo, false);
          return validaciones.responderTwiml(res, msgGuardado);
        }
        if (msgLower === '2' || msgLower === '2️⃣') {
          sesion.conductorCorrigioDato = true;
          sesion.estado = ESTADOS.CORREGIR_CAMPO;
          return validaciones.responderTwiml(res, mensajes.solicitarFacturaManualSimple());
        }
        // Respuesta inválida — repetir resumen
        var msgRep = sesion.tierOcr === 1
          ? mensajes.resumenOcrCompleto(sesion)
          : mensajes.resumenOcrParcial(sesion);
        return validaciones.responderTwiml(res, msgRep);

      case ESTADOS.CORREGIR_CAMPO:
        if (!mensaje || mensaje.length < 1) {
          return validaciones.responderTwiml(res, mensajes.solicitarFacturaManualSimple());
        }
        sesion.facturaNumeroManual = mensaje.trim();
        sesion.conductorCorrigioDato = true;
        sesion.estado = ESTADOS.CANTIDAD_MANUAL;
        return validaciones.responderTwiml(res, mensajes.solicitarCantidadManual());

      case ESTADOS.FALLBACK_FACTURA:
        // Si envían foto — re-procesar como nueva foto de factura
        if (numMedia > 0) {
          storage.limpiarFotosPorTipo(sesion, ['factura']);
          sesion.datosOcrFactura = null;
          sesion.estado = ESTADOS.ESPERANDO_FOTO_FACTURA;
          storage.guardarFotoUnica(sesion, {
            tipo: 'factura', url: mediaUrls[0],
            descripcion: 'Foto del recibo (reintento)', validacion: 'Foto recibo cargada', validada: true
          });
          sesion.fotoFacturaTemporal = mediaUrls[0];
          try {
            var datosOcr2 = await ocr.extraerDatosFacturaCombustible(mediaUrls[0]);
            sesion.datosOcrFactura = datosOcr2;
            sesion.scoreOcrGlobal  = datosOcr2.score_global || 0;
            sesion.tierOcr         = datosOcr2.tier_ocr     || 3;
            if (datosOcr2.factura_numero && datosOcr2.factura_numero.leido) {
              sesion.facturaNumeroOcr = String(datosOcr2.factura_numero.valor || '').trim();
            }
            if (datosOcr2.cantidad && datosOcr2.cantidad.leido) {
              var cp2 = parseFloat(String(datosOcr2.cantidad.valor).replace(',', '.'));
              sesion.cantidadOcr = isNaN(cp2) ? null : cp2;
            }
            if (datosOcr2.unidad_medida && datosOcr2.unidad_medida.leido) {
              sesion.unidadMedida = /gal/.test(String(datosOcr2.unidad_medida.valor || '').toLowerCase()) ? 'galones' : 'litros';
            }
            if (datosOcr2.valor_total && datosOcr2.valor_total.leido) {
              var vt2 = parseFloat(String(datosOcr2.valor_total.valor || '').replace(/[^0-9.]/g, ''));
              if (!isNaN(vt2)) sesion.valorTotal = vt2;
            }
          } catch (eOcr2) {
            console.error('[Tanqueo] Error OCR reintento:', eOcr2.message);
            sesion.tierOcr = 3;
          }
          if (sesion.tierOcr === 1) {
            sesion.estado = ESTADOS.CONFIRMACION_RESUMEN;
            return validaciones.responderTwiml(res, mensajes.resumenOcrCompleto(sesion));
          }
          if (sesion.tierOcr === 2) {
            sesion.estado = ESTADOS.CONFIRMACION_RESUMEN;
            return validaciones.responderTwiml(res, mensajes.resumenOcrParcial(sesion));
          }
          return validaciones.responderTwiml(res, mensajes.fallbackFactura());
        }
        if (msgLower === '1' || msgLower === '1️⃣') {
          storage.limpiarFotosPorTipo(sesion, ['factura']);
          sesion.estado = ESTADOS.ESPERANDO_FOTO_FACTURA;
          return validaciones.responderTwiml(res, mensajes.solicitarFotoFactura());
        }
        if (msgLower === '2' || msgLower === '2️⃣') {
          sesion.estado = ESTADOS.FACTURA_MANUAL;
          return validaciones.responderTwiml(res, mensajes.solicitarFacturaManualSimple());
        }
        if (msgLower === '3' || msgLower === '3️⃣') {
          sesion.estado = ESTADOS.ESPERANDO_FOTO_TABLERO;
          return validaciones.responderTwiml(res, mensajes.solicitarFotoTablero());
        }
        return validaciones.responderTwiml(res, mensajes.fallbackFactura());

      case ESTADOS.FACTURA_MANUAL:
        if (!mensaje || mensaje.length < 1) {
          return validaciones.responderTwiml(res, mensajes.solicitarFacturaManualSimple());
        }
        sesion.facturaNumeroManual   = mensaje.trim();
        sesion.conductorCorrigioDato = true;
        sesion.estado = ESTADOS.CANTIDAD_MANUAL;
        return validaciones.responderTwiml(res, mensajes.solicitarCantidadManual());

      case ESTADOS.CANTIDAD_MANUAL: {
        var parsedCant = validaciones.parsearCantidad(mensaje);
        if (!parsedCant.ok) {
          return validaciones.responderTwiml(res, parsedCant.mensaje);
        }
        sesion.cantidadManual        = parsedCant.cantidad;
        sesion.unidadMedida          = parsedCant.unidadMedida;
        sesion.conductorCorrigioDato = true;
        sesion.estado = ESTADOS.CONFIRMACION_RESUMEN;
        return validaciones.responderTwiml(res, mensajes.resumenOcrParcial(sesion));
      }

      case ESTADOS.ESPERANDO_FOTO_TABLERO:
        if (numMedia === 0) {
          return validaciones.responderTwiml(res, mensajes.solicitarFotoTablero());
        }
        storage.guardarFotoUnica(sesion, {
          tipo:        'tablero',
          url:         mediaUrls[0],
          descripcion: 'Foto del tablero de combustible',
          validacion:  'Sin factura física — evidencia tablero',
          validada:    true
        });
        sesion.fotoTableroTemporal = mediaUrls[0];
        sesion.flagSinFactura      = true;
        {
          var guardadoTablero = await cierre.guardarTanqueo(sesion, telefono);
          if (guardadoTablero.error) {
            console.error('[Tanqueo] Error guardando (tablero):', guardadoTablero.error);
            return validaciones.responderTwiml(res, mensajes.errorGenericoTanqueo());
          }
          sesiones.eliminarSesion(telefono);
          return validaciones.responderTwiml(res,
            mensajes.tanqueoGuardadoPendiente(guardadoTablero.tanqueo, true)
          );
        }

      default:
        reiniciarSesionTanqueo(sesion);
        sesion.estado = ESTADOS.ESPERANDO_FOTO_PLACA;
        return validaciones.responderTwiml(res, mensajes.inicio());
    }
  } catch (err) {
    console.error('[Tanqueo] Error handler:', err.message);
    return validaciones.responderTwiml(res, mensajes.errorGenericoTanqueo());
  } finally {
    sesiones.desbloquear(telefono);
    sesiones.guardarCambios();
  }
}

module.exports = {
  manejarTanqueo: manejarTanqueo,
  ESTADOS: ESTADOS,
  reiniciarSesionTanqueo: reiniciarSesionTanqueo
};
