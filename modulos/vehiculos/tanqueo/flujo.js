/**
 * flujo.js — Máquina de estados del módulo de tanqueo v2
 * Basado en el patrón real del preoperacional.
 * Flujo: foto placa → odómetro → foto recibo (OCR) → factura manual → litros manual
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
  sesion.tipo = 'tanqueo';
  sesion.estado = ESTADOS.INICIO;

  sesion.placa = null;
  sesion.vehiculo = null;
  sesion.conductor = null;
  sesion.fotoPlacaTemporal = null;
  sesion.placaDetectada = null;
  sesion.placaSugerida = null;

  sesion.kilometraje = null;
  sesion.kmDetectado = null;
  sesion.kmLecturaFueraRango = false;
  sesion.fotoOdometroTemporal = null;
  sesion.kmReferenciaMeta = null;
  sesion.kmReferencia = null;
  sesion.diferenciaKm = null;
  sesion.inconsistenciaKm = false;
  sesion.alertasKm = [];

  sesion.datosOcrFactura = null;
  sesion.facturaNumeroOcr = null;
  sesion.facturaNumeroManual = null;
  sesion.placaOcrFactura = null;
  sesion.placaOcrFoto = null;
  sesion.kmOcrFactura = null;
  sesion.kmOcrOdometro = null;
  sesion.cantidadOcr = null;
  sesion.cantidadManual = null;
  sesion.unidadMedida = 'litros';
  sesion.tipoCombustible = null;
  sesion.valorTotal = null;
  sesion.estacionServicio = null;
  sesion.fotoFacturaTemporal = null;

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

function siguienteEstadoCompletarCampos(sesion) {
  if (!sesion.tipoCombustible) return ESTADOS.COMPLETAR_TIPO_COMBUSTIBLE;
  if (!sesion.valorTotal) return ESTADOS.COMPLETAR_VALOR;
  if (!sesion.estacionServicio) return ESTADOS.COMPLETAR_ESTACION;
  return ESTADOS.CONFIRMACION_FINAL;
}

function manejarAtras(res, sesion) {
  switch (sesion.estado) {
    case ESTADOS.ESPERANDO_FOTO_PLACA:
    case ESTADOS.PLACA_FALLBACK:
    case ESTADOS.PLACA_CONFIRMACION_SUGERIDA:
    case ESTADOS.PLACA_MANUAL:
      sesion.placaDetectada = null;
      sesion.placaSugerida = null;
      sesion.fotoPlacaTemporal = null;
      sesion.estado = ESTADOS.ESPERANDO_FOTO_PLACA;
      return validaciones.responderTwiml(res, '◀️ Volvemos al inicio.\n\n' + mensajes.inicio());

    case ESTADOS.ESPERANDO_FOTO_ODOMETRO:
    case ESTADOS.CONFIRMACION_KM:
    case ESTADOS.KM_MANUAL:
      sesion.placa = null;
      sesion.vehiculo = null;
      sesion.conductor = null;
      sesion.kmReferenciaMeta = null;
      sesion.placaOcrFoto = null;
      sesion.kmDetectado = null;
      sesion.kmLecturaFueraRango = false;
      sesion.kmReferencia = null;
      sesion.diferenciaKm = null;
      sesion.inconsistenciaKm = false;
      sesion.alertasKm = [];
      storage.limpiarFotosPorTipo(sesion, ['odometro', 'placa']);
      sesion.estado = ESTADOS.ESPERANDO_FOTO_PLACA;
      return validaciones.responderTwiml(res, '◀️ Volvemos a la placa.\n\n' + mensajes.inicio());

    case ESTADOS.ESPERANDO_FOTO_FACTURA:
      sesion.estado = ESTADOS.ESPERANDO_FOTO_ODOMETRO;
      return validaciones.responderTwiml(res,
        '◀️ Volvemos al odómetro.\n\n' + mensajes.solicitarFotoOdometro(sesion.kmReferenciaMeta)
      );

    case ESTADOS.ESPERANDO_FACTURA_MANUAL:
      sesion.estado = ESTADOS.ESPERANDO_FOTO_FACTURA;
      sesion.datosOcrFactura = null;
      storage.limpiarFotosPorTipo(sesion, ['factura']);
      return validaciones.responderTwiml(res,
        '◀️ Volvemos al recibo.\n\n' + mensajes.solicitarFotoFactura()
      );

    case ESTADOS.ESPERANDO_LITROS_MANUAL:
      sesion.estado = ESTADOS.ESPERANDO_FACTURA_MANUAL;
      return validaciones.responderTwiml(res,
        '◀️ Volvemos al número de factura.\n\n' + mensajes.solicitarFacturaManual(sesion.facturaNumeroOcr)
      );

    case ESTADOS.COMPLETAR_TIPO_COMBUSTIBLE:
    case ESTADOS.COMPLETAR_VALOR:
    case ESTADOS.COMPLETAR_ESTACION:
      sesion.estado = ESTADOS.ESPERANDO_LITROS_MANUAL;
      return validaciones.responderTwiml(res,
        '◀️ Volvemos a la cantidad.\n\n' + mensajes.solicitarLitrosManual(sesion.cantidadOcr, sesion.unidadMedida)
      );

    case ESTADOS.CONFIRMACION_FINAL:
      if (!sesion.estacionServicio) {
        sesion.estado = ESTADOS.COMPLETAR_ESTACION;
        return validaciones.responderTwiml(res, mensajes.solicitarEstacion());
      }
      if (!sesion.valorTotal) {
        sesion.estado = ESTADOS.COMPLETAR_VALOR;
        return validaciones.responderTwiml(res, mensajes.solicitarValorTotal());
      }
      sesion.estado = ESTADOS.COMPLETAR_TIPO_COMBUSTIBLE;
      return validaciones.responderTwiml(res, mensajes.solicitarTipoCombustible());

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
              return validaciones.responderTwiml(res2, mensajes.kilometrajeConfirmadoSolicitudRecibo(s.kilometraje));
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

        sesion.fotoFacturaTemporal = mediaUrls[0];
        storage.guardarFotoUnica(sesion, {
          tipo: 'factura',
          url: mediaUrls[0],
          descripcion: 'Foto del recibo de tanqueo',
          validacion: 'Foto recibo cargada',
          validada: true
        });

        try {
          var datosOcr = await ocr.extraerDatosFacturaCombustible(mediaUrls[0]);
          sesion.datosOcrFactura = datosOcr;

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
            sesion.cantidadOcr = parseFloat(String(datosOcr.cantidad.valor).replace(',', '.'));
            if (isNaN(sesion.cantidadOcr)) sesion.cantidadOcr = null;
          }
          if (datosOcr.unidad_medida && datosOcr.unidad_medida.leido) {
            var u = String(datosOcr.unidad_medida.valor || '').toLowerCase();
            sesion.unidadMedida = /gal/.test(u) ? 'galones' : 'litros';
          }
          if (datosOcr.producto && datosOcr.producto.leido) {
            var validacionTipo = validaciones.validarTipoCombustible(datosOcr.producto.valor);
            if (validacionTipo.ok) sesion.tipoCombustible = validacionTipo.valor;
          }
          if (datosOcr.valor_total && datosOcr.valor_total.leido) {
            var vt = parseFloat(String(datosOcr.valor_total.valor || '').replace(/[^0-9.]/g, ''));
            if (!isNaN(vt)) sesion.valorTotal = vt;
          }
          if (datosOcr.estacion && datosOcr.estacion.leido) {
            sesion.estacionServicio = String(datosOcr.estacion.valor || '').trim() || null;
          }

          var camposLeidos = Object.keys(datosOcr).filter(function(k) {
            return datosOcr[k] && datosOcr[k].leido;
          }).length;
          console.log('[Tanqueo] OCR factura: ' + camposLeidos + '/10 campos leídos.');
        } catch (eOcr) {
          console.error('[Tanqueo] Error OCR factura:', eOcr.message);
        }

        sesion.estado = ESTADOS.ESPERANDO_FACTURA_MANUAL;
        return validaciones.responderTwiml(res, mensajes.reciboProcesadoSolicitudFactura(sesion.facturaNumeroOcr));

      case ESTADOS.ESPERANDO_FACTURA_MANUAL:
        if (!mensaje || mensaje.length < 1) {
          return validaciones.responderTwiml(res, mensajes.solicitarFacturaManual(sesion.facturaNumeroOcr));
        }
        sesion.facturaNumeroManual = mensaje.trim();
        sesion.estado = ESTADOS.ESPERANDO_LITROS_MANUAL;
        return validaciones.responderTwiml(res,
          mensajes.facturaRegistradaPrefijo(sesion.facturaNumeroManual) +
          mensajes.solicitarLitrosManual(sesion.cantidadOcr, sesion.unidadMedida)
        );

      case ESTADOS.ESPERANDO_LITROS_MANUAL:
        var parsedCantidad = validaciones.parsearCantidad(mensaje);
        if (!parsedCantidad.ok) {
          return validaciones.responderTwiml(res, parsedCantidad.mensaje);
        }
        sesion.cantidadManual = parsedCantidad.cantidad;
        sesion.unidadMedida = parsedCantidad.unidadMedida;
        sesion.estado = siguienteEstadoCompletarCampos(sesion);

        if (sesion.estado === ESTADOS.COMPLETAR_TIPO_COMBUSTIBLE) {
          return validaciones.responderTwiml(res, mensajes.solicitarTipoCombustible());
        }
        if (sesion.estado === ESTADOS.COMPLETAR_VALOR) {
          return validaciones.responderTwiml(res, mensajes.solicitarValorTotal());
        }
        if (sesion.estado === ESTADOS.COMPLETAR_ESTACION) {
          return validaciones.responderTwiml(res, mensajes.solicitarEstacion());
        }
        return validaciones.responderTwiml(res, mensajes.resumenFinal(sesion));

      case ESTADOS.COMPLETAR_TIPO_COMBUSTIBLE:
        var validComb = validaciones.validarTipoCombustible(mensaje);
        if (!validComb.ok) {
          return validaciones.responderTwiml(res, validComb.mensaje);
        }
        sesion.tipoCombustible = validComb.valor;
        sesion.estado = sesion.valorTotal
          ? (sesion.estacionServicio ? ESTADOS.CONFIRMACION_FINAL : ESTADOS.COMPLETAR_ESTACION)
          : ESTADOS.COMPLETAR_VALOR;
        if (sesion.estado === ESTADOS.COMPLETAR_VALOR) return validaciones.responderTwiml(res, mensajes.solicitarValorTotal());
        if (sesion.estado === ESTADOS.COMPLETAR_ESTACION) return validaciones.responderTwiml(res, mensajes.solicitarEstacion());
        return validaciones.responderTwiml(res, mensajes.resumenFinal(sesion));

      case ESTADOS.COMPLETAR_VALOR:
        var valorParsed = validaciones.parsearValor(mensaje);
        if (valorParsed === null) {
          return validaciones.responderTwiml(res, mensajes.valorInvalido());
        }
        sesion.valorTotal = valorParsed;
        sesion.estado = sesion.estacionServicio ? ESTADOS.CONFIRMACION_FINAL : ESTADOS.COMPLETAR_ESTACION;
        if (sesion.estado === ESTADOS.COMPLETAR_ESTACION) return validaciones.responderTwiml(res, mensajes.solicitarEstacion());
        return validaciones.responderTwiml(res, mensajes.resumenFinal(sesion));

      case ESTADOS.COMPLETAR_ESTACION:
        sesion.estacionServicio = (mensaje === '0' || /^no$/i.test(mensaje)) ? null : mensaje.trim();
        sesion.estado = ESTADOS.CONFIRMACION_FINAL;
        return validaciones.responderTwiml(res, mensajes.resumenFinal(sesion));

      case ESTADOS.CONFIRMACION_FINAL:
        if (msgLower === '1' || msgLower === '1️⃣') {
          var guardado = await cierre.guardarTanqueo(sesion, telefono);
          if (guardado.error) {
            console.error('[Tanqueo] Error guardando:', guardado.error);
            return validaciones.responderTwiml(res, mensajes.errorGuardado());
          }
          sesiones.eliminarSesion(telefono);
          return validaciones.responderTwiml(res,
            mensajes.tanqueoGuardado(guardado.tanqueo, guardado.estadoValidacion)
          );
        }
        if (msgLower === '2' || msgLower === '2️⃣') {
          sesiones.eliminarSesion(telefono);
          return validaciones.responderTwiml(res, nav.textoMenuPrincipal());
        }
        return validaciones.responderTwiml(res, mensajes.resumenFinal(sesion));

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
