/**
 * Lógica compartida de lectura de odómetro (OCR) y validación de kilometraje.
 * No importa flujos de pre/pos operacional: recibe callbacks y mensajes por opciones.
 */

'use strict';

var config = require('../../../config/config');
var ocr = require('../../../servicios/ocr');
var storage = require('../../../servicios/storage');

/**
 * Compara km contra sesion.vehiculo.kilometraje (último histórico del vehículo).
 * Usado por el preoperacional.
 *
 * @returns {{ ok: boolean, tipo: string, mensaje: string, mensajeCorto: string }}
 */
function evaluarKilometrajeContraHistorico(sesion, km) {
  var ultimo = sesion.vehiculo && sesion.vehiculo.kilometraje;

  if (!ultimo) {
    return { ok: true, tipo: 'sin_historico', mensaje: '', mensajeCorto: '' };
  }

  if (km < ultimo) {
    return {
      ok: false,
      tipo: 'menor',
      mensaje:
        '❌ Kilometraje inválido.\nÚltimo registrado: *' +
        ultimo +
        ' km*\nDebe ser igual o mayor.',
      mensajeCorto: 'El valor detectado quedó por debajo del último registro.'
    };
  }

  if (km > ultimo + config.MAX_KM_SALTO) {
    return {
      ok: false,
      tipo: 'alto',
      mensaje:
        '⚠️ Kilometraje fuera del rango automático.\nÚltimo registrado: *' +
        ultimo +
        ' km*\nSalto detectado: *' +
        (km - ultimo) +
        ' km*',
      mensajeCorto: 'El salto detectado fue de *' + (km - ultimo) + ' km*.'
    };
  }

  return { ok: true, tipo: 'ok', mensaje: '', mensajeCorto: '' };
}

/**
 * Procesa la foto del odómetro con OCR.
 *
 * Opciones (preoperacional):
 *   - tipoFlujo: 'preoperacional'
 *   - estadoConfirmacion: ej. 'ODOMETRO_CONFIRMACION'
 *   - mensajesModulo: { mensajeConfirmacionOdometro, mensajeKilometrajeFueraRango }
 *   - responderFn: function(res, xmlBody)
 *   - maxKmSalto: opcional (default config.MAX_KM_SALTO)
 *
 * Opciones (posoperacional):
 *   - tipoFlujo: 'posoperacional'
 *   - estadoConfirmacion: ej. 'POSOP_ODOMETRO_CONFIRMACION'
 *   - responderFn
 *   - procesarLecturaPos: async function(res, sesion, kmDetectado, lecturaKmCompleta)
 */
async function procesarFotoOdometro(res, sesion, fotoUrl, opciones) {
  var responderFn = opciones.responderFn;
  sesion.fotoOdometroTemporal = fotoUrl;
  var lecturaKm = await ocr.extraerKilometrajeFoto(fotoUrl);
  var km = lecturaKm && lecturaKm.kilometraje != null ? lecturaKm.kilometraje : null;
  sesion.estado = opciones.estadoConfirmacion;

  if (opciones.tipoFlujo === 'posoperacional' && opciones.procesarLecturaPos) {
    return await opciones.procesarLecturaPos(res, sesion, km, lecturaKm);
  }

  sesion.kmDetectado = km;
  sesion.kmLecturaFueraRango = false;
  var mensajes = opciones.mensajesModulo;
  var maxSalto = opciones.maxKmSalto != null ? opciones.maxKmSalto : config.MAX_KM_SALTO;

  if (sesion.kmDetectado != null) {
    var evaluacion = evaluarKilometrajeContraHistorico(sesion, sesion.kmDetectado);
    if (!evaluacion.ok) {
      sesion.kmLecturaFueraRango = true;
      return responderFn(
        res,
        mensajes.mensajeKilometrajeFueraRango(sesion, evaluacion, maxSalto)
      );
    }
    return responderFn(res, mensajes.mensajeConfirmacionOdometro(sesion));
  }

  return responderFn(
    res,
    mensajes.mensajeConfirmacionOdometro(
      sesion,
      lecturaKm.razon || 'La imagen no es clara.'
    )
  );
}

/**
 * Registra kilometraje y foto según lo defina el flujo (callback).
 * @param {function} registrarEnSesion — function(sesion, km, origen) { ... }
 */
function registrarKilometrajeConfirmado(sesion, km, origen, registrarEnSesion) {
  registrarEnSesion(sesion, km, origen);
}

/**
 * Maneja respuestas en estado de confirmación de odómetro (preoperacional).
 *
 * @param {function} opciones.procesarFotoOdometro — referencia a procesarFotoOdometro enlazada con opciones preop
 * @param {function} opciones.onConfirmarPreoperacional — function(res, sesion) al confirmar km válido
 */
async function manejarConfirmacionOdometro(
  res,
  sesion,
  mensaje,
  numMedia,
  mediaUrls,
  opciones
) {
  var msgLower = String(mensaje || '').trim().toLowerCase();
  var mensajes = opciones.mensajesModulo;
  var responderFn = opciones.responderFn;
  var esOpcionNav = opciones.esOpcion || require('./navegacion').esOpcion;

  if (numMedia > 0 && mediaUrls && mediaUrls[0]) {
    return await opciones.procesarFotoOdometro(res, sesion, mediaUrls[0]);
  }

  if (opciones.esAtrasOdometro && opciones.esAtrasOdometro(mensaje)) {
    return opciones.manejarAtrasDesdeOdometro(res, sesion);
  }
  if (esOpcionNav(msgLower, ['9', '9️⃣']) && opciones.volverMenuPrincipal) {
    return opciones.volverMenuPrincipal(res, opciones.telefono);
  }

  if (sesion.kmLecturaFueraRango) {
    if (msgLower === '1' || msgLower === '1️⃣') {
      sesion.estado = opciones.estadoManual;
      return responderFn(
        res,
        '⌨️ Escribe el kilometraje correcto usando solo números.\nEjemplo: *267354*\n\n0️⃣ Atrás  •  9️⃣ Menú principal'
      );
    }
    if (msgLower === '2' || msgLower === '2️⃣' || msgLower === 'foto') {
      sesion.kmDetectado = null;
      sesion.kmLecturaFueraRango = false;
      sesion.estado = opciones.estadoEsperandoFoto;
      return responderFn(res, opciones.mensajeInicioOdometro(sesion));
    }
    // Si el conductor escribe el km directamente sin presionar 1 primero
    var kmDirecto = String(mensaje || '').replace(/[^0-9]/g, '');
    if (kmDirecto.length >= 4 && opciones.registrarKilometrajePreoperacional) {
      var kmDirectoNum = parseInt(kmDirecto, 10);
      var evalDirecto = evaluarKilometrajeContraHistorico(sesion, kmDirectoNum);
      if (evalDirecto.tipo === 'menor') {
        return responderFn(
          res,
          evalDirecto.mensaje + '\n\nEscribe el kilometraje correcto.'
        );
      }
      var origenDirecto = 'Kilometraje corregido manualmente: ' + kmDirectoNum + ' km';
      var avisoDirecto = '';
      if (!evalDirecto.ok && evalDirecto.tipo === 'alto') {
        origenDirecto += ' (supera el rango automático)';
        avisoDirecto = '⚠️ Kilometraje fuera del rango automático. Queda registrado.\n\n';
      }
      opciones.registrarKilometrajePreoperacional(sesion, kmDirectoNum, origenDirecto);
      return responderFn(res, avisoDirecto + mensajes.primerMensajeInspeccion(sesion));
    }
    return responderFn(
      res,
      mensajes.mensajeKilometrajeFueraRango(
        sesion,
        evaluarKilometrajeContraHistorico(sesion, sesion.kmDetectado || 0),
        opciones.maxKmSalto != null ? opciones.maxKmSalto : config.MAX_KM_SALTO
      )
    );
  }

  if (sesion.kmDetectado == null) {
    if (msgLower === '1' || msgLower === '1️⃣') {
      sesion.estado = opciones.estadoManual;
      return responderFn(
        res,
        '⌨️ Escribe el kilometraje correcto usando solo números.\nEjemplo: *267354*\n\n0️⃣ Atrás  •  9️⃣ Menú principal'
      );
    }
    if (msgLower === '2' || msgLower === '2️⃣' || msgLower === 'foto') {
      sesion.estado = opciones.estadoEsperandoFoto;
      return responderFn(res, opciones.mensajeInicioOdometro(sesion));
    }
    return responderFn(res, mensajes.mensajeConfirmacionOdometro(sesion));
  }

  if (msgLower === '1' || msgLower === '1️⃣' || msgLower === 'confirmar') {
    return await opciones.onConfirmarPreoperacional(res, sesion);
  }

  if (msgLower === '2' || msgLower === '2️⃣') {
    sesion.estado = opciones.estadoManual;
    return responderFn(
      res,
      '⌨️ Escribe el kilometraje correcto usando solo números.\nEjemplo: *267354*\n\n0️⃣ Atrás  •  9️⃣ Menú principal'
    );
  }

  if (msgLower === '3' || msgLower === '3️⃣' || msgLower === 'foto') {
    sesion.kmDetectado = null;
    sesion.estado = opciones.estadoEsperandoFoto;
    return responderFn(res, opciones.mensajeInicioOdometro(sesion));
  }

  return responderFn(res, mensajes.mensajeConfirmacionOdometro(sesion));
}

/**
 * Kilometraje manual (preoperacional): parsea número, valida, registra y continúa.
 */
async function manejarOdometroManual(
  res,
  sesion,
  mensaje,
  mensajesModulo,
  responderFn,
  opciones
) {
  var msgLower = String(mensaje || '').trim().toLowerCase();
  var esOpcionNav = opciones.esOpcion || require('./navegacion').esOpcion;

  if (opciones.numMedia > 0 && opciones.mediaUrls && opciones.mediaUrls[0]) {
    return await opciones.procesarFotoOdometro(res, sesion, opciones.mediaUrls[0]);
  }
  if (opciones.esAtrasOdometro && opciones.esAtrasOdometro(mensaje)) {
    return opciones.manejarAtrasDesdeOdometro(res, sesion);
  }
  if (esOpcionNav(msgLower, ['9', '9️⃣']) && opciones.volverMenuPrincipal) {
    return opciones.volverMenuPrincipal(res, opciones.telefono);
  }

  var kmManual = String(mensaje || '').replace(/[^0-9]/g, '');
  kmManual = kmManual ? parseInt(kmManual, 10) : null;
  if (kmManual == null) {
    return responderFn(
      res,
      '⌨️ Escribe el kilometraje usando solo numeros.\nEjemplo: *127892*'
    );
  }

  var evaluacionKmManual = evaluarKilometrajeContraHistorico(sesion, kmManual);
  if (!evaluacionKmManual.ok && evaluacionKmManual.tipo === 'menor') {
    return responderFn(
      res,
      evaluacionKmManual.mensaje + '\n\nEscribe el kilometraje correcto o envia otra foto.'
    );
  }

  var validacionKm = 'Kilometraje corregido manualmente: ' + kmManual + ' km';
  var avisoKm = '';
  if (!evaluacionKmManual.ok && evaluacionKmManual.tipo === 'alto') {
    validacionKm +=
      ' (supera el rango automatico de ' + config.MAX_KM_SALTO + ' km)';
    avisoKm =
      '⚠️ Kilometraje fuera del rango automatico. Queda registrado para revision.\n\n';
  }

  opciones.registrarKilometrajePreoperacional(sesion, kmManual, validacionKm);
  return responderFn(res, avisoKm + mensajesModulo.primerMensajeInspeccion(sesion));
}

module.exports = {
  evaluarKilometrajeContraHistorico,
  procesarFotoOdometro,
  registrarKilometrajeConfirmado,
  manejarConfirmacionOdometro,
  manejarOdometroManual
};
