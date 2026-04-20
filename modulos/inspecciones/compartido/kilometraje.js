/**
 * Lógica compartida de lectura de odómetro (OCR) y validación de kilometraje.
 * No importa flujos de pre/pos operacional: recibe callbacks y mensajes por opciones.
 */

'use strict';

var config = require('../../../config/config');
var ocr = require('../../../servicios/ocr');
var storage = require('../../../servicios/storage');
var sesiones = require('../../../servicios/sesiones');

function crearResultadoKm(ok, code, userMessage, payload) {
  return {
    ok: !!ok,
    code: code || (ok ? 'KM_CONFIRMED' : 'KM_RETRY'),
    userMessage: String(userMessage || ''),
    payload: payload || null
  };
}

function crearResultadoKmDelegado(response) {
  return crearResultadoKm(false, 'KM_DELEGATED_RESPONSE', '', { response: response });
}

function normalizarResultadoKm(resultado) {
  if (resultado && typeof resultado === 'object' && typeof resultado.userMessage === 'string') {
    return crearResultadoKm(resultado.ok, resultado.code, resultado.userMessage, resultado.payload);
  }
  if (typeof resultado === 'string') {
    return crearResultadoKm(false, 'KM_LEGACY_STRING', resultado, null);
  }
  return crearResultadoKm(false, 'KM_RETRY', '', null);
}

function crearPoliticaKilometrajePorDefecto() {
  return {
    resolverConfirmacionFueraRango: null,
    resolverIngresoManual: null,
    mensajeEntradaManual: function() {
      return '⌨️ Escribe el kilometraje correcto usando solo números.\nEjemplo: *267354*\n\n0️⃣ Atrás  •  9️⃣ Menú principal';
    },
    mensajeEntradaManualInvalida: function() {
      return '⌨️ Escribe el kilometraje usando solo numeros.\nEjemplo: *127892*';
    }
  };
}

function resolverPoliticaKilometraje(opciones) {
  var politicaBase = crearPoliticaKilometrajePorDefecto();
  if (!opciones || typeof opciones.politicaKilometraje !== 'object' || !opciones.politicaKilometraje) {
    return politicaBase;
  }
  var politicaCustom = opciones.politicaKilometraje;
  return {
    resolverConfirmacionFueraRango:
      typeof politicaCustom.resolverConfirmacionFueraRango === 'function'
        ? politicaCustom.resolverConfirmacionFueraRango
        : politicaBase.resolverConfirmacionFueraRango,
    resolverIngresoManual:
      typeof politicaCustom.resolverIngresoManual === 'function'
        ? politicaCustom.resolverIngresoManual
        : politicaBase.resolverIngresoManual,
    mensajeEntradaManual:
      typeof politicaCustom.mensajeEntradaManual === 'function'
        ? politicaCustom.mensajeEntradaManual
        : politicaBase.mensajeEntradaManual,
    mensajeEntradaManualInvalida:
      typeof politicaCustom.mensajeEntradaManualInvalida === 'function'
        ? politicaCustom.mensajeEntradaManualInvalida
        : politicaBase.mensajeEntradaManualInvalida
  };
}

async function resolverKilometrajeConfirmadoExitoso(res, sesion, telefono, opciones, data) {
  var payloadBase = {
    res: res,
    sesion: sesion,
    telefono: telefono,
    kilometraje: data.kilometraje,
    origen: data.origen,
    alertas: data.alertas || [],
    contexto: {
      tipoFlujo: opciones.contextoFlujo && opciones.contextoFlujo.tipoFlujo,
      etapa: opciones.contextoFlujo && opciones.contextoFlujo.etapa,
      fuente: data.fuente || 'km',
      evaluacion: data.evaluacion || null,
      prefijoMensaje: data.prefijoMensaje || ''
    }
  };

  if (typeof opciones.onKilometrajeConfirmado === 'function') {
    var respuestaCallback = await opciones.onKilometrajeConfirmado(payloadBase);
    if (respuestaCallback && typeof respuestaCallback === 'object' && typeof respuestaCallback.userMessage === 'string') {
      return normalizarResultadoKm(respuestaCallback);
    }
    if (typeof respuestaCallback === 'string') {
      return crearResultadoKm(
        true,
        payloadBase.alertas.length ? 'KM_RECORDED_WITH_ALERT' : 'KM_RECORDED',
        respuestaCallback,
        payloadBase
      );
    }
    if (respuestaCallback != null) {
      return crearResultadoKmDelegado(respuestaCallback);
    }
  }

  // Compatibilidad legacy: comportamiento anterior para preoperacional.
  if (sesion.sinPlantilla || !sesion.gruposInspeccion || !sesion.gruposInspeccion.length) {
    if (telefono) sesiones.eliminarSesion(telefono);
    var textoSin = opciones.mensajesModulo.mensajeSinPlantillaInspeccion
      ? opciones.mensajesModulo.mensajeSinPlantillaInspeccion()
      : 'No hay plantilla configurada. Escribe *9* para el menú.';
    return crearResultadoKm(
      false,
      'KM_NO_TEMPLATE',
      (data.prefijoMensaje || '') + textoSin,
      { km: data.kilometraje }
    );
  }
  if (typeof opciones.registrarKilometrajePreoperacional === 'function') {
    opciones.registrarKilometrajePreoperacional(sesion, data.kilometraje, data.origen);
  }
  return crearResultadoKm(
    true,
    payloadBase.alertas.length ? 'KM_RECORDED_WITH_ALERT' : 'KM_RECORDED',
    (data.prefijoMensaje || '') + opciones.mensajesModulo.primerMensajeInspeccion(sesion),
    payloadBase
  );
}

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

  if (typeof opciones.procesarLecturaPos === 'function') {
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
  var esOpcionNav = opciones.esOpcion || require('./navegacion').esOpcion;
  var politica = resolverPoliticaKilometraje(opciones);

  if (numMedia > 0 && mediaUrls && mediaUrls[0]) {
    return crearResultadoKmDelegado(
      await opciones.procesarFotoOdometro(res, sesion, mediaUrls[0])
    );
  }

  if (opciones.esAtrasOdometro && opciones.esAtrasOdometro(mensaje)) {
    return crearResultadoKmDelegado(
      opciones.manejarAtrasDesdeOdometro(res, sesion)
    );
  }
  if (esOpcionNav(msgLower, ['9', '9️⃣']) && opciones.volverMenuPrincipal) {
    return crearResultadoKmDelegado(
      opciones.volverMenuPrincipal(res, opciones.telefono)
    );
  }

  if (sesion.kmLecturaFueraRango) {
    if (politica.resolverConfirmacionFueraRango) {
      var resultadoFueraRango = await politica.resolverConfirmacionFueraRango({
        res: res,
        sesion: sesion,
        mensaje: mensaje,
        msgLower: msgLower,
        mensajesModulo: mensajes,
        opciones: opciones,
        resolverKilometrajeConfirmadoExitoso: resolverKilometrajeConfirmadoExitoso,
        crearResultadoKm: crearResultadoKm,
        evaluarKilometrajeContraHistorico: evaluarKilometrajeContraHistorico
      });
      if (resultadoFueraRango != null) {
        return normalizarResultadoKm(resultadoFueraRango);
      }
    }

    if (msgLower === '1' || msgLower === '1️⃣') {
      sesion.estado = opciones.estadoManual;
      return crearResultadoKm(
        false,
        'KM_MANUAL_ENTRY_REQUIRED',
        politica.mensajeEntradaManual({ sesion: sesion, motivo: 'lectura_fuera_rango', opciones: opciones }),
        { motivo: 'lectura_fuera_rango' }
      );
    }
    if (msgLower === '2' || msgLower === '2️⃣' || msgLower === 'foto') {
      sesion.kmDetectado = null;
      sesion.kmLecturaFueraRango = false;
      sesion.estado = opciones.estadoEsperandoFoto;
      return crearResultadoKm(
        false,
        'KM_RETAKE_PHOTO_REQUESTED',
        opciones.mensajeInicioOdometro(sesion),
        null
      );
    }
    // Si el conductor escribe el km directamente sin presionar 1 primero
    var kmDirecto = String(mensaje || '').replace(/[^0-9]/g, '');
    if (kmDirecto.length >= 4 && opciones.registrarKilometrajePreoperacional) {
      var kmDirectoNum = parseInt(kmDirecto, 10);
      var evalDirecto = evaluarKilometrajeContraHistorico(sesion, kmDirectoNum);
      if (evalDirecto.tipo === 'menor') {
        return crearResultadoKm(
          false,
          'KM_VALUE_BELOW_HISTORY',
          evalDirecto.mensaje + '\n\nEscribe el kilometraje correcto.',
          { km: kmDirectoNum, evaluacion: evalDirecto }
        );
      }
      var origenDirecto = 'Kilometraje corregido manualmente: ' + kmDirectoNum + ' km';
      var avisoDirecto = '';
      var conAlertaDirecto = false;
      if (!evalDirecto.ok && evalDirecto.tipo === 'alto') {
        origenDirecto += ' (supera el rango automático)';
        avisoDirecto = '⚠️ Kilometraje fuera del rango automático. Queda registrado.\n\n';
        conAlertaDirecto = true;
      }
      return await resolverKilometrajeConfirmadoExitoso(
        res,
        sesion,
        opciones.telefono,
        opciones,
        {
          kilometraje: kmDirectoNum,
          origen: origenDirecto,
          alertas: conAlertaDirecto ? [evalDirecto] : [],
          fuente: 'km_directo_fuera_rango',
          evaluacion: evalDirecto,
          prefijoMensaje: avisoDirecto
        }
      );
    }
    return crearResultadoKm(
      false,
      'KM_OUT_OF_RANGE_CONFIRMATION_REQUIRED',
      mensajes.mensajeKilometrajeFueraRango(
        sesion,
        evaluarKilometrajeContraHistorico(sesion, sesion.kmDetectado || 0),
        opciones.maxKmSalto != null ? opciones.maxKmSalto : config.MAX_KM_SALTO
      ),
      { kmDetectado: sesion.kmDetectado }
    );
  }

  if (sesion.kmDetectado == null) {
    if (msgLower === '1' || msgLower === '1️⃣') {
      sesion.estado = opciones.estadoManual;
      return crearResultadoKm(
        false,
        'KM_MANUAL_ENTRY_REQUIRED',
        politica.mensajeEntradaManual({ sesion: sesion, motivo: 'ocr_no_lectura', opciones: opciones }),
        { motivo: 'ocr_no_lectura' }
      );
    }
    if (msgLower === '2' || msgLower === '2️⃣' || msgLower === 'foto') {
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
      'KM_CONFIRMATION_REQUIRED',
      mensajes.mensajeConfirmacionOdometro(sesion),
      { kmDetectado: null }
    );
  }

  if (msgLower === '1' || msgLower === '1️⃣' || msgLower === 'confirmar') {
    if (sesion.kmDetectado != null && typeof opciones.onKilometrajeConfirmado === 'function') {
      return await resolverKilometrajeConfirmadoExitoso(
        res,
        sesion,
        opciones.telefono,
        opciones,
        {
          kilometraje: sesion.kmDetectado,
          origen: 'Kilometraje confirmado desde foto: ' + sesion.kmDetectado + ' km',
          alertas: sesion.kmLecturaFueraRango ? [{ tipo: 'lectura_fuera_rango' }] : [],
          fuente: 'confirmacion_ocr',
          evaluacion: null,
          prefijoMensaje: ''
        }
      );
    }
    var respuestaConfirmar = await opciones.onConfirmarPreoperacional(res, sesion, opciones.telefono);
    return crearResultadoKmDelegado(respuestaConfirmar);
  }

  if (msgLower === '2' || msgLower === '2️⃣') {
    sesion.estado = opciones.estadoManual;
    return crearResultadoKm(
      false,
      'KM_MANUAL_ENTRY_REQUIRED',
      politica.mensajeEntradaManual({ sesion: sesion, motivo: 'correccion_usuario', opciones: opciones }),
      { motivo: 'correccion_usuario' }
    );
  }

  if (msgLower === '3' || msgLower === '3️⃣' || msgLower === 'foto') {
    sesion.kmDetectado = null;
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
    'KM_CONFIRMATION_REQUIRED',
    mensajes.mensajeConfirmacionOdometro(sesion),
    { kmDetectado: sesion.kmDetectado }
  );
}

/**
 * Kilometraje manual (preoperacional): parsea número, valida, registra y continúa.
 */
async function manejarOdometroManual(
  res,
  sesion,
  mensaje,
  mensajesModulo,
  responderFn, // eslint-disable-line no-unused-vars
  opciones
) {
  var msgLower = String(mensaje || '').trim().toLowerCase();
  var esOpcionNav = opciones.esOpcion || require('./navegacion').esOpcion;
  var politica = resolverPoliticaKilometraje(opciones);

  if (opciones.numMedia > 0 && opciones.mediaUrls && opciones.mediaUrls[0]) {
    return crearResultadoKmDelegado(
      await opciones.procesarFotoOdometro(res, sesion, opciones.mediaUrls[0])
    );
  }
  if (opciones.esAtrasOdometro && opciones.esAtrasOdometro(mensaje)) {
    return crearResultadoKmDelegado(
      opciones.manejarAtrasDesdeOdometro(res, sesion)
    );
  }
  if (esOpcionNav(msgLower, ['9', '9️⃣']) && opciones.volverMenuPrincipal) {
    return crearResultadoKmDelegado(
      opciones.volverMenuPrincipal(res, opciones.telefono)
    );
  }

  var kmManual = String(mensaje || '').replace(/[^0-9]/g, '');
  kmManual = kmManual ? parseInt(kmManual, 10) : null;
  if (politica.resolverIngresoManual) {
    var resultadoManualPolitica = await politica.resolverIngresoManual({
      res: res,
      sesion: sesion,
      mensaje: mensaje,
      kmManual: kmManual,
      mensajesModulo: mensajesModulo,
      opciones: opciones,
      resolverKilometrajeConfirmadoExitoso: resolverKilometrajeConfirmadoExitoso,
      crearResultadoKm: crearResultadoKm
    });
    if (resultadoManualPolitica != null) {
      return normalizarResultadoKm(resultadoManualPolitica);
    }
  }

  if (kmManual == null) {
    return crearResultadoKm(
      false,
      'KM_INVALID_MANUAL_INPUT',
      politica.mensajeEntradaManualInvalida({ sesion: sesion, motivo: 'manual_invalido', opciones: opciones }),
      null
    );
  }

  var evaluacionKmManual = evaluarKilometrajeContraHistorico(sesion, kmManual);
  if (!evaluacionKmManual.ok && evaluacionKmManual.tipo === 'menor') {
    return crearResultadoKm(
      false,
      'KM_VALUE_BELOW_HISTORY',
      evaluacionKmManual.mensaje + '\n\nEscribe el kilometraje correcto o envia otra foto.',
      { km: kmManual, evaluacion: evaluacionKmManual }
    );
  }

  var validacionKm = 'Kilometraje corregido manualmente: ' + kmManual + ' km';
  var avisoKm = '';
  var conAlerta = false;
  if (!evaluacionKmManual.ok && evaluacionKmManual.tipo === 'alto') {
    validacionKm +=
      ' (supera el rango automatico de ' + config.MAX_KM_SALTO + ' km)';
    avisoKm =
      '⚠️ Kilometraje fuera del rango automatico. Queda registrado para revision.\n\n';
    conAlerta = true;
  }

  return await resolverKilometrajeConfirmadoExitoso(
    res,
    sesion,
    opciones.telefono,
    {
      mensajesModulo: mensajesModulo,
      registrarKilometrajePreoperacional: opciones.registrarKilometrajePreoperacional,
      onKilometrajeConfirmado: opciones.onKilometrajeConfirmado,
      contextoFlujo: opciones.contextoFlujo
    },
    {
      kilometraje: kmManual,
      origen: validacionKm,
      alertas: conAlerta ? [evaluacionKmManual] : [],
      fuente: 'manual',
      evaluacion: evaluacionKmManual,
      prefijoMensaje: avisoKm
    }
  );
}

module.exports = {
  evaluarKilometrajeContraHistorico,
  normalizarResultadoKm,
  procesarFotoOdometro,
  registrarKilometrajeConfirmado,
  manejarConfirmacionOdometro,
  manejarOdometroManual
};
