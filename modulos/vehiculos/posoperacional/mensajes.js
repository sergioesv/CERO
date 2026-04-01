/**
 * Textos UX posoperacional — opciones numéricas y pie de navegación alineado al preoperacional.
 */

'use strict';

var nav = require('../compartido/navegacion');

var PIE_NAV = nav.PIE_NAV;
var PIE_MENU = nav.PIE_MENU;

/**
 * Paso inicial: solicitar placa (texto).
 */
function mensajeInicioPosoperacional() {
  return (
    '🏁 *Posoperacional*\n\n' +
    'Escribe la *placa del vehículo* para cerrar la jornada.' +
    PIE_NAV
  );
}

/**
 * Tras validar placa: datos del vehículo y pedir foto de odómetro.
 */
function mensajeVehiculoConfirmado(vehiculo, referencia) {
  var msg =
    '✅ *' + (vehiculo.placa || '') + '*\n' +
    ([vehiculo.tipo, vehiculo.marca, vehiculo.modelo].filter(Boolean).join(' ') || 'Vehículo registrado') +
    '\n\n📸 Envía una *foto del odómetro* con el kilometraje final.';

  if (referencia && typeof referencia.kilometraje === 'number') {
    msg += '\n\nÚltimo registrado: *' + referencia.kilometraje.toLocaleString('es-CO') + ' km*';
    if (referencia.origen === 'preoperacional_dia') msg += ' (preoperacional del día)';
    if (referencia.origen === 'ultimo_posoperacional') msg += ' (último posoperacional)';
    if (referencia.origen === 'ultimo_preoperacional') msg += ' (último preoperacional)';
    if (referencia.origen === 'vehiculo') msg += ' (último km del vehículo)';
  }

  msg += PIE_NAV;
  return msg;
}

/**
 * Confirmación de lectura OCR (km en rango o con alerta).
 */
function mensajeConfirmacionKilometraje(sesion) {
  var msg =
    '🔎 *Lectura del odómetro*\n' +
    'Detecté: *' + (sesion.kmDetectado || 0).toLocaleString('es-CO') + ' km*';

  if (typeof sesion.kmReferencia === 'number') {
    msg += '\nÚltimo registrado: *' + sesion.kmReferencia.toLocaleString('es-CO') + ' km*';
    if (typeof sesion.diferenciaKm === 'number') {
      msg += '\nDiferencia: *' + (sesion.diferenciaKm >= 0 ? '+' : '') + sesion.diferenciaKm.toLocaleString('es-CO') + ' km*';
    }
  }

  msg +=
    '\n\n1️⃣ Confirmar\n' +
    '2️⃣ Corregir el kilometraje\n' +
    '3️⃣ Enviar otra foto';
  msg += PIE_NAV;
  return msg;
}

function mensajeAlertaKilometraje(sesion) {
  var alerta = (sesion.alertasKm || [])[0];
  var msg = '⚠️ *Atención con el kilometraje*\n';
  if (alerta && alerta.mensaje) msg += alerta.mensaje + '\n';

  if (typeof sesion.kmReferencia === 'number') {
    msg += 'Último registrado: *' + sesion.kmReferencia.toLocaleString('es-CO') + ' km*\n';
  }

  msg += 'Detecté: *' + (sesion.kmDetectado || 0).toLocaleString('es-CO') + ' km*';
  if (typeof sesion.diferenciaKm === 'number') {
    msg += '\nDiferencia: *' + (sesion.diferenciaKm >= 0 ? '+' : '') + sesion.diferenciaKm.toLocaleString('es-CO') + ' km*';
  }

  msg +=
    '\n\n1️⃣ Confirmar de todos modos\n' +
    '2️⃣ Corregir el kilometraje\n' +
    '3️⃣ Enviar otra foto';
  msg += PIE_NAV;
  return msg;
}

function mensajeConfirmacionSegunKilometraje(sesion) {
  if (sesion.inconsistenciaKm && sesion.alertasKm && sesion.alertasKm.length) {
    return mensajeAlertaKilometraje(sesion);
  }
  return mensajeConfirmacionKilometraje(sesion);
}

/**
 * Pregunta si hubo novedades al cierre.
 */
function mensajeNovedades() {
  return (
    '🛠️ *¿Hubo novedades al finalizar la jornada?*\n\n' +
    '1️⃣ Sí, reportar novedades\n' +
    '2️⃣ No, todo en orden' +
    PIE_NAV
  );
}

/**
 * Texto libre para describir novedades.
 */
function mensajeDescribirNovedades() {
  return (
    '📝 *Describe las novedades encontradas*\n\n' +
    'Ejemplo: llanta trasera baja, luz trasera no enciende' +
    PIE_NAV
  );
}

/**
 * Observación final: menú numérico.
 */
function mensajeObservacion() {
  return (
    '💬 *Observación final*\n\n' +
    '1️⃣ Sin observaciones\n' +
    '2️⃣ Escribir observación' +
    PIE_NAV
  );
}

/**
 * Resumen + firma (1/2) y cancelar vía 0.
 */
function mensajeResumenPosoperacional(sesion, resumenTexto) {
  return (
    resumenTexto +
    '\n\n📷 Fotos adjuntas: *' + ((sesion.fotos || []).length) + '*\n' +
    '\n1️⃣ Firmar y cerrar\n' +
    '2️⃣ Corregir\n' +
    '0️⃣ _Cancelar_ (vuelve a fotos adicionales)'
  );
}

/**
 * Mensaje tras guardar y enviar PDF.
 */
function mensajeFirmaPosoperacional(datosSesion, pdfUrl) {
  var msg =
    '───────────────\n' +
    '✅ *POSOPERACIONAL FIRMADO*\n' +
    '───────────────\n' +
    '🚗 *' + (datosSesion.placa || '') + '*\n' +
    '📏 ' + (datosSesion.kilometrajeFinal || 0).toLocaleString('es-CO') + ' km\n';

  if (datosSesion.novedades && datosSesion.novedades.length) {
    msg += '⚠️ Novedades: *' + datosSesion.novedades.length + '*\n';
  } else {
    msg += '✅ Sin novedades\n';
  }

  if (datosSesion.alertasKm && datosSesion.alertasKm.length) {
    msg += '📍 Alertas km: *' + datosSesion.alertasKm.length + '*\n';
  }

  msg += pdfUrl
    ? '\n📄 PDF generado y enviado por WhatsApp.'
    : '\n📄 Registro guardado. El PDF no se pudo enviar automáticamente.';

  // Pie de menú: el operario debe saber que puede escribir 9 para volver al menú principal
  msg += PIE_MENU;

  return msg;
}

/**
 * Paso de fotos adicionales al cierre — mismo patrón que preoperacional.
 */
function mensajeFotoAdicionalPosop(prefijo) {
  return (
    (prefijo ? prefijo + '\n\n' : '') +
    '📸 *¿Fotos adicionales?*\n\n' +
    'Envía una foto del cierre de jornada para agregar evidencia, o:\n\n' +
    '1️⃣ Continuar al resumen final' +
    PIE_NAV
  );
}

module.exports = {
  mensajeInicioPosoperacional,
  mensajeVehiculoConfirmado,
  mensajeConfirmacionKilometraje,
  mensajeAlertaKilometraje,
  mensajeConfirmacionSegunKilometraje,
  mensajeNovedades,
  mensajeDescribirNovedades,
  mensajeObservacion,
  mensajeResumenPosoperacional,
  mensajeFirmaPosoperacional,
  mensajeFotoAdicionalPosop
};
