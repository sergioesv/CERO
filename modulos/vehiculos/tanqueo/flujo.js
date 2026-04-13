/**
 * flujo.js — Máquina de estados del módulo de tanqueo v2
 * Con OCR de factura, foto de placa, validación cruzada y rendimiento.
 * CERO — Gestión de Operaciones de Campo
 */

'use strict';

var config = require('../../../config/config');
var ocr = require('../../../servicios/ocr');
var storage = require('../../../servicios/storage');
var sesiones = require('../../../servicios/sesiones');
var tanqueosData = require('../../../data/tanqueos');
var nav = require('../compartido/navegacion');
var visual = require('../compartido/validacionVisual');
var validaciones = require('./validaciones');
var estadoMod = require('./estado');
var ESTADOS = estadoMod.ESTADOS;
var mensajes = require('./mensajes');
var cierre = require('./cierre');

function reiniciarSesionTanqueo(sesion) {
  sesion.tipo = 'tanqueo';
  sesion.estado = ESTADOS.INICIO;

  sesion.placa = null;
  sesion.vehiculo = null;
  sesion.conductor = null;

  sesion.kilometraje = null;
  sesion.kmDetectado = null;
  sesion.kmOcrOdometro = null;
  sesion.kmOcrFactura = null;
  sesion.kmLecturaFueraRango = false;
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
  sesion.cantidadOcr = null;
  sesion.cantidadManual = null;
  sesion.unidadMedida = 'litros';
  sesion.tipoCombustible = null;
  sesion.valorTotal = null;
  sesion.estacionServicio = null;
  sesion.precioUnitario = null;

  sesion.fotoFacturaTemporal = null;
  sesion.fotoPlacaTemporal = null;
  sesion.fotoOdometroTemporal = null;
  sesion.fotos = [];
}

function aplicarTipoCombustibleDesdeOcr(sesion, datosOcr) {
  if (!datosOcr.producto || !datosOcr.producto.leido) return;
  var raw = String(datosOcr.producto.valor || '').trim();
  if (!raw) return;
  var lower = raw.toLowerCase();
  var opt = null;
  if (/diesel|acpm|diésel/.test(lower)) opt = '1';
  else if (/adblue|urea/.test(lower)) opt = '4';
  else if (/gnv|gas\s+natural/.test(lower)) opt = '3';
  else if (/\bgas\b/.test(lower) && !/gasolina/.test(lower)) opt = '3';
  else if (/gasolina|corriente|extra|magna/.test(lower)) opt = '2';

  var v = opt ? validaciones.validarTipoCombustible(opt) : validaciones.validarTipoCombustible(lower);
  if (v.ok) {
    sesion.tipoCombustible = v.valor;
  }
}

function aplicarCamposOcrFacturaASesion(sesion, datosOcr) {
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
  aplicarTipoCombustibleDesdeOcr(sesion, datosOcr);
  if (datosOcr.valor_total && datosOcr.valor_total.leido) {
    var vt = parseFloat(String(datosOcr.valor_total.valor || '').replace(/\D/g, ''));
    sesion.valorTotal = !isNaN(vt) ? vt : null;
  }
  if (datosOcr.estacion && datosOcr.estacion.leido) {
    sesion.estacionServicio = String(datosOcr.estacion.valor || '').trim() || null;
  }
}

function aplicarKilometraje(sesion, kilometraje) {
  var evaluacion = validaciones.evaluarKilometrajeContraReferencia(
    kilometraje,
    sesion.kmReferenciaMeta
  );
  sesion.kilometraje = kilometraje;
  sesion.kmOcrOdometro = kilometraje;
  sesion.kmReferencia = evaluacion.kmReferencia;
  sesion.diferenciaKm = evaluacion.diferenciaKm;
  sesion.inconsistenciaKm = evaluacion.inconsistenciaKm;
  sesion.alertasKm = evaluacion.alertasKm;
}

function siguienteEstadoCompletarCampos(sesion) {
  if (!sesion.tipoCombustible) {
    return ESTADOS.COMPLETAR_TIPO_COMBUSTIBLE;
  }
  if (!sesion.valorTotal) {
    return ESTADOS.COMPLETAR_VALOR;
  }
  if (!sesion.estacionServicio) {
    return ESTADOS.COMPLETAR_ESTACION;
  }
  return ESTADOS.CONFIRMACION_FINAL;
}

async function manejarAtras(res, sesion) {
  switch (sesion.estado) {
    case ESTADOS.ESPERANDO_FOTO_FACTURA:
      return validaciones.responderTwiml(res, mensajes.inicio());

    case ESTADOS.ESPERANDO_FOTO_PLACA:
      sesion.estado = ESTADOS.ESPERANDO_FOTO_FACTURA;
      sesion.datosOcrFactura = null;
      sesion.facturaNumeroOcr = null;
      sesion.placaOcrFactura = null;
      sesion.cantidadOcr = null;
      sesion.kmOcrFactura = null;
      storage.limpiarFotosPorTipo(sesion, ['factura']);
      return validaciones.responderTwiml(res, '◀️ Volvemos al recibo.\n\n' + mensajes.inicio());

    case ESTADOS.CONFIRMACION_PLACA:
    case ESTADOS.PLACA_MANUAL:
      sesion.estado = ESTADOS.ESPERANDO_FOTO_PLACA;
      sesion.placaOcrFoto = null;
      sesion.placa = null;
      sesion.vehiculo = null;
      sesion.conductor = null;
      storage.limpiarFotosPorTipo(sesion, ['placa']);
      return validaciones.responderTwiml(
        res,
        '◀️ Volvemos a la foto de la placa.\n\n' +
        mensajes.solicitarFotoPlaca(sesion.placaOcrFactura)
      );

    case ESTADOS.ESPERANDO_FOTO_ODOMETRO:
      sesion.estado = ESTADOS.ESPERANDO_FOTO_PLACA;
      return validaciones.responderTwiml(
        res,
        '◀️ Volvemos a la foto de la placa.\n\n' +
        mensajes.solicitarFotoPlaca(sesion.placaOcrFactura)
      );

    case ESTADOS.CONFIRMACION_KM:
    case ESTADOS.KM_MANUAL:
      sesion.estado = ESTADOS.ESPERANDO_FOTO_ODOMETRO;
      sesion.kmDetectado = null;
      sesion.kmLecturaFueraRango = false;
      sesion.kmOcrOdometro = null;
      storage.limpiarFotosPorTipo(sesion, ['odometro']);
      return validaciones.responderTwiml(
        res,
        '◀️ Volvemos al odómetro.\n\n' +
        mensajes.solicitarFotoOdometro(sesion.kmReferenciaMeta)
      );

    case ESTADOS.ESPERANDO_FACTURA_MANUAL:
      sesion.estado = ESTADOS.CONFIRMACION_KM;
      return validaciones.responderTwiml(
        res,
        '◀️ Volvemos al kilometraje.\n\n' +
        (sesion.kmLecturaFueraRango
          ? mensajes.alertaKmFueraRango(sesion)
          : mensajes.confirmarKmOcr(sesion))
      );

    case ESTADOS.ESPERANDO_LITROS_MANUAL:
      sesion.estado = ESTADOS.ESPERANDO_FACTURA_MANUAL;
      return validaciones.responderTwiml(
        res,
        '◀️ Volvemos al número de factura.\n\n' +
        mensajes.solicitarFacturaManual(sesion.facturaNumeroOcr)
      );

    case ESTADOS.COMPLETAR_TIPO_COMBUSTIBLE:
    case ESTADOS.COMPLETAR_VALOR:
    case ESTADOS.COMPLETAR_ESTACION:
      sesion.estado = ESTADOS.ESPERANDO_LITROS_MANUAL;
      return validaciones.responderTwiml(
        res,
        '◀️ Volvemos a la cantidad.\n\n' +
        mensajes.solicitarLitrosManual(sesion.cantidadOcr, sesion.unidadMedida)
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
      return validaciones.responderTwiml(
        res,
        'No hay paso anterior desde aquí.\n\nEscribe *9* para ir al menú.'
      );
  }
}

async function manejarTanqueo(req, res) {
  var telefono = req.body.From || '';
  var mensaje = (req.body.Body || '').trim();
  var mensajeMayus = mensaje.toUpperCase();
  var mediaUrls = storage.obtenerMediaUrls(req);
  var mediaUrl = mediaUrls[0] || null;
  var sesion = await sesiones.obtenerSesion(telefono);

  if (mensaje === '9' || mensajeMayus === 'CANCELAR' || mensajeMayus === 'MENU' || mensajeMayus === 'INICIO') {
    sesiones.eliminarSesion(telefono);
    await sesiones.guardarCambios();
    return validaciones.responderTwiml(res, nav.textoMenuPrincipal());
  }

  if (mensaje === '0' || mensajeMayus === 'ATRAS') {
    await sesiones.guardarCambios();
    return manejarAtras(res, sesion);
  }

  if (sesion.tipo !== 'tanqueo' || !sesion.estado || sesion.estado === ESTADOS.INICIO) {
    reiniciarSesionTanqueo(sesion);
    sesion.estado = ESTADOS.ESPERANDO_FOTO_FACTURA;
    await sesiones.guardarCambios();
    return validaciones.responderTwiml(res, mensajes.inicio());
  }

  var respuesta = null;

  switch (sesion.estado) {
    case ESTADOS.ESPERANDO_FOTO_FACTURA:
      if (!mediaUrl) {
        respuesta = mensajes.faltaFotoRecibo();
        break;
      }

      sesion.fotoFacturaTemporal = mediaUrl;
      storage.guardarFotoUnica(sesion, {
        tipo: 'factura',
        url: mediaUrl,
        descripcion: 'Foto del recibo de tanqueo',
        validacion: 'Foto recibo cargada',
        validada: true
      });

      var msgLeyendo = mensajes.leyendoRecibo();
      await sesiones.guardarCambios();
      validaciones.responderTwiml(res, msgLeyendo);

      try {
        var datosOcr = await ocr.extraerDatosFacturaCombustible(mediaUrl);
        sesion.datosOcrFactura = datosOcr;
        aplicarCamposOcrFacturaASesion(sesion, datosOcr);
        sesion.estado = ESTADOS.ESPERANDO_FOTO_PLACA;
      } catch (eOcr) {
        console.error('[Tanqueo] Error OCR factura:', eOcr.message || eOcr);
        sesion.estado = ESTADOS.ESPERANDO_FOTO_PLACA;
      }

      await sesiones.guardarCambios();
      return;

    case ESTADOS.ESPERANDO_FOTO_PLACA:
      if (!mediaUrl) {
        respuesta = mensajes.solicitarFotoPlaca(sesion.placaOcrFactura);
        break;
      }

      sesion.fotoPlacaTemporal = mediaUrl;
      storage.guardarFotoUnica(sesion, {
        tipo: 'placa',
        url: mediaUrl,
        descripcion: 'Foto de la placa del vehículo',
        validacion: 'Foto placa cargada',
        validada: true
      });

      var resultadoPlaca = await visual.resolverPlacaFotoOperativa(mediaUrl, telefono);
      sesion.placaOcrFoto = resultadoPlaca.placaDetectada || null;

      if (resultadoPlaca.tipo === 'exacta' || resultadoPlaca.tipo === 'sugerida') {
        var placaDetectada = resultadoPlaca.tipo === 'exacta'
          ? resultadoPlaca.placaDetectada
          : resultadoPlaca.placaSugerida;

        if (resultadoPlaca.carga && resultadoPlaca.carga.vehiculo && resultadoPlaca.carga.vehiculo.bloqueado) {
          respuesta = mensajes.vehiculoBloqueado(placaDetectada, resultadoPlaca.carga.vehiculo.motivo_bloqueo);
          break;
        }

        sesion.placa = placaDetectada;
        sesion.vehiculo = resultadoPlaca.carga.vehiculo;
        sesion.conductor = resultadoPlaca.carga.conductor || null;
        sesion.kmReferenciaMeta = await tanqueosData.obtenerReferenciaKilometraje(placaDetectada);

        sesion.estado = ESTADOS.CONFIRMACION_PLACA;
        respuesta = mensajes.confirmarPlacaOcr(placaDetectada);
      } else {
        sesion.estado = ESTADOS.PLACA_MANUAL;
        respuesta = mensajes.solicitarPlacaManual();
      }
      break;

    case ESTADOS.CONFIRMACION_PLACA:
      if (mensaje === '1') {
        sesion.estado = ESTADOS.ESPERANDO_FOTO_ODOMETRO;
        respuesta = mensajes.placaConfirmadaPrefijo(sesion.placa) +
          mensajes.solicitarFotoOdometro(sesion.kmReferenciaMeta);
      } else if (mensaje === '2') {
        sesion.placa = null;
        sesion.vehiculo = null;
        sesion.conductor = null;
        sesion.kmReferenciaMeta = null;
        sesion.estado = ESTADOS.PLACA_MANUAL;
        respuesta = mensajes.solicitarPlacaManual();
      } else {
        respuesta = mensajes.promptConfirmacionPlacaInvalida();
      }
      break;

    case ESTADOS.PLACA_MANUAL:
      var resultadoPlacaManual = await visual.resolverPlacaManualOperativa(mensaje, telefono);

      if (resultadoPlacaManual.tipo === 'formato_invalido') {
        respuesta = mensajes.placaManualInvalida();
        break;
      }
      if (resultadoPlacaManual.tipo === 'no_encontrado') {
        respuesta = mensajes.vehiculoNoEncontrado(resultadoPlacaManual.placaDetectada);
        break;
      }

      if (resultadoPlacaManual.carga.vehiculo.bloqueado) {
        respuesta = mensajes.vehiculoBloqueado(
          resultadoPlacaManual.placaDetectada,
          resultadoPlacaManual.carga.vehiculo.motivo_bloqueo
        );
        break;
      }

      sesion.placa = resultadoPlacaManual.placaDetectada;
      sesion.vehiculo = resultadoPlacaManual.carga.vehiculo;
      sesion.conductor = resultadoPlacaManual.carga.conductor || null;
      sesion.kmReferenciaMeta = await tanqueosData.obtenerReferenciaKilometraje(sesion.placa);
      sesion.estado = ESTADOS.ESPERANDO_FOTO_ODOMETRO;
      respuesta = mensajes.placaRegistradaPrefijo(sesion.placa) +
        mensajes.solicitarFotoOdometro(sesion.kmReferenciaMeta);
      break;

    case ESTADOS.ESPERANDO_FOTO_ODOMETRO:
      if (!mediaUrl) {
        respuesta = mensajes.solicitarFotoOdometro(sesion.kmReferenciaMeta);
        break;
      }

      sesion.fotoOdometroTemporal = mediaUrl;
      storage.guardarFotoUnica(sesion, {
        tipo: 'odometro',
        url: mediaUrl,
        descripcion: 'Foto del odómetro',
        validacion: 'Foto odómetro cargada',
        validada: true
      });

      var resultadoOdometro = await visual.resolverFotoOdometroOperativa(
        mediaUrl,
        sesion.kmReferenciaMeta,
        config.MAX_KM_SALTO
      );

      if (resultadoOdometro.tipo === 'manual') {
        sesion.estado = ESTADOS.KM_MANUAL;
        respuesta = '⚠️ No pude leer el odómetro con seguridad.\n\n' +
          mensajes.solicitarKmManual(sesion.kmReferenciaMeta);
        break;
      }

      sesion.kmDetectado = resultadoOdometro.kilometraje;
      sesion.kmReferencia = resultadoOdometro.evaluacion.kmReferencia;
      sesion.diferenciaKm = resultadoOdometro.evaluacion.diferenciaKm;
      sesion.inconsistenciaKm = resultadoOdometro.evaluacion.inconsistenciaKm;
      sesion.alertasKm = resultadoOdometro.evaluacion.alertasKm;
      sesion.kmLecturaFueraRango = resultadoOdometro.tipo === 'fuera_rango';
      sesion.estado = ESTADOS.CONFIRMACION_KM;

      respuesta = sesion.kmLecturaFueraRango
        ? mensajes.alertaKmFueraRango(sesion)
        : mensajes.confirmarKmOcr(sesion);
      break;

    case ESTADOS.CONFIRMACION_KM:
      if (mensaje === '1' && !sesion.kmLecturaFueraRango && typeof sesion.kmDetectado === 'number') {
        aplicarKilometraje(sesion, sesion.kmDetectado);
        sesion.estado = ESTADOS.ESPERANDO_FACTURA_MANUAL;
        respuesta = mensajes.kilometrajeConfirmadoPrefijo(sesion.kilometraje) +
          mensajes.solicitarFacturaManual(sesion.facturaNumeroOcr);
        break;
      }
      if (mensaje === '2') {
        sesion.estado = ESTADOS.KM_MANUAL;
        respuesta = mensajes.solicitarKmManual(sesion.kmReferenciaMeta);
        break;
      }
      if (mensaje === '3') {
        sesion.estado = ESTADOS.ESPERANDO_FOTO_ODOMETRO;
        sesion.kmDetectado = null;
        sesion.kmLecturaFueraRango = false;
        storage.limpiarFotosPorTipo(sesion, ['odometro']);
        respuesta = mensajes.solicitarFotoOdometro(sesion.kmReferenciaMeta);
        break;
      }
      respuesta = mensajes.promptConfirmacionKmInvalida();
      break;

    case ESTADOS.KM_MANUAL:
      var kmManual = visual.parsearKilometraje(mensaje);
      if (kmManual === null) {
        respuesta = mensajes.kmManualInvalido();
        break;
      }
      aplicarKilometraje(sesion, kmManual);
      sesion.estado = ESTADOS.ESPERANDO_FACTURA_MANUAL;
      respuesta = mensajes.kilometrajeRegistradoPrefijo(sesion.kilometraje);
      if (sesion.alertasKm && sesion.alertasKm.length) {
        respuesta += '\n⚠️ ' + sesion.alertasKm.map(function(a) { return a.mensaje || a; }).join(' | ');
      }
      respuesta += '\n\n' + mensajes.solicitarFacturaManual(sesion.facturaNumeroOcr);
      break;

    case ESTADOS.ESPERANDO_FACTURA_MANUAL:
      if (!mensaje) {
        respuesta = mensajes.solicitarFacturaManual(sesion.facturaNumeroOcr);
        break;
      }
      sesion.facturaNumeroManual = mensaje.trim();
      sesion.estado = ESTADOS.ESPERANDO_LITROS_MANUAL;
      respuesta = mensajes.facturaRegistradaPrefijo(sesion.facturaNumeroManual) +
        mensajes.solicitarLitrosManual(sesion.cantidadOcr, sesion.unidadMedida);
      break;

    case ESTADOS.ESPERANDO_LITROS_MANUAL:
      var parsedCantidad = validaciones.parsearCantidad(mensaje);
      if (!parsedCantidad.ok) {
        respuesta = parsedCantidad.mensaje;
        break;
      }
      sesion.cantidadManual = parsedCantidad.cantidad;
      sesion.unidadMedida = parsedCantidad.unidadMedida;
      sesion.estado = siguienteEstadoCompletarCampos(sesion);

      if (sesion.estado === ESTADOS.COMPLETAR_TIPO_COMBUSTIBLE) {
        respuesta = mensajes.solicitarTipoCombustible();
      } else if (sesion.estado === ESTADOS.COMPLETAR_VALOR) {
        respuesta = mensajes.solicitarValorTotal();
      } else if (sesion.estado === ESTADOS.COMPLETAR_ESTACION) {
        respuesta = mensajes.solicitarEstacion();
      } else {
        respuesta = mensajes.resumenFinal(sesion);
      }
      break;

    case ESTADOS.COMPLETAR_TIPO_COMBUSTIBLE:
      var validCombustible = validaciones.validarTipoCombustible(mensaje);
      if (!validCombustible.ok) {
        respuesta = validCombustible.mensaje;
        break;
      }
      sesion.tipoCombustible = validCombustible.valor;
      sesion.estado = sesion.valorTotal
        ? (sesion.estacionServicio ? ESTADOS.CONFIRMACION_FINAL : ESTADOS.COMPLETAR_ESTACION)
        : ESTADOS.COMPLETAR_VALOR;
      respuesta = sesion.estado === ESTADOS.COMPLETAR_VALOR
        ? mensajes.solicitarValorTotal()
        : sesion.estado === ESTADOS.COMPLETAR_ESTACION
          ? mensajes.solicitarEstacion()
          : mensajes.resumenFinal(sesion);
      break;

    case ESTADOS.COMPLETAR_VALOR:
      var valorParsed = validaciones.parsearValor(mensaje);
      if (valorParsed === null) {
        respuesta = mensajes.valorInvalido();
        break;
      }
      sesion.valorTotal = valorParsed;
      sesion.estado = sesion.estacionServicio ? ESTADOS.CONFIRMACION_FINAL : ESTADOS.COMPLETAR_ESTACION;
      respuesta = sesion.estado === ESTADOS.COMPLETAR_ESTACION
        ? mensajes.solicitarEstacion()
        : mensajes.resumenFinal(sesion);
      break;

    case ESTADOS.COMPLETAR_ESTACION:
      sesion.estacionServicio = (mensaje === '0' || /^no$/i.test(mensaje)) ? null : mensaje.trim();
      sesion.estado = ESTADOS.CONFIRMACION_FINAL;
      respuesta = mensajes.resumenFinal(sesion);
      break;

    case ESTADOS.CONFIRMACION_FINAL:
      if (mensaje === '1') {
        var guardado = await cierre.guardarTanqueo(sesion, telefono);
        if (guardado.error) {
          respuesta = mensajes.errorGuardado();
          break;
        }
        sesiones.eliminarSesion(telefono);
        await sesiones.guardarCambios();
        return validaciones.responderTwiml(
          res,
          mensajes.tanqueoGuardado(guardado.tanqueo, guardado.estadoValidacion)
        );
      }
      if (mensaje === '2') {
        sesiones.eliminarSesion(telefono);
        await sesiones.guardarCambios();
        return validaciones.responderTwiml(res, nav.textoMenuPrincipal());
      }
      respuesta = mensajes.promptFinalGuardarCancelar();
      break;

    default:
      reiniciarSesionTanqueo(sesion);
      sesion.estado = ESTADOS.ESPERANDO_FOTO_FACTURA;
      respuesta = mensajes.inicio();
      break;
  }

  await sesiones.guardarCambios();
  return validaciones.responderTwiml(res, respuesta);
}

module.exports = {
  manejarTanqueo: manejarTanqueo,
  ESTADOS: ESTADOS,
  reiniciarSesionTanqueo: reiniciarSesionTanqueo
};
