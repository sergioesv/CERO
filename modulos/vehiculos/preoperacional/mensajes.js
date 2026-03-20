// modulos/vehiculos/preoperacional/mensajes.js
// Textos de UX del flujo preoperacional.
// Sistema de diseño unificado CERO:
//   Opciones  → 1️⃣ Texto
//   Navegación → Escribe ATRAS o CANCELAR (texto, no botones)
//   Confirmar  → Escribe *SI* para firmar
//   Separadores → solo en resúmenes/confirmación final
//   Tono       → informal, español correcto

'use strict';

var preop  = require('./validaciones');
var GRUPOS = preop.GRUPOS;
var PASOS_INICIALES = preop.PASOS_INICIALES;

// ── Pie de navegación estándar ────────────────────────────────────────────────

var PIE_MENU    = '\n\n9️⃣ _Menú principal_';
var PIE_NAV     = '\n\n0️⃣ _Atrás_  •  9️⃣ _Menú principal_';
var PIE_NAV_MAS = '\n\n0️⃣ _Atrás_  •  9️⃣ _Menú principal_';

// ============================================================================
// INICIO DEL FLUJO
// ============================================================================

function mensajeInicio() {
  return '🚗 *CERO — Preoperacional*\nBuenos días 👋\n\n' + mensajeInicioPlaca();
}

function mensajeInicioPlaca() {
  return (
    '📸 *Paso 1 de 2*\n' +
    PASOS_INICIALES.fotoPlaca +
    PIE_MENU
  );
}

function mensajeInicioOdometro(vehiculo) {
  var msg = '📸 *Paso 2 de 2*\n' + PASOS_INICIALES.fotoOdometro;
  if (vehiculo && (vehiculo.kilometraje || vehiculo.kilometraje === 0)) {
    msg += '\n\nÚltimo registrado: *' + vehiculo.kilometraje + ' km*';
  }
  msg += PIE_NAV_MAS;
  return msg;
}

// ============================================================================
// PLACA — FALLBACK Y SUGERENCIA
// ============================================================================

function mensajeFallbackPlaca(sesion, motivo) {
  var msg = '❌ *No pude leer la placa automáticamente*';
  if (sesion.placaDetectada) msg += '\nLeí: *' + sesion.placaDetectada + '*';
  if (motivo) msg += '\n' + motivo;
  msg +=
    '\n\n1️⃣ Enviar otra foto\n' +
    '2️⃣ Escribir la placa manualmente';
  msg += PIE_NAV_MAS;
  msg += '\n\n_Tip: acércate a la placa, evita el zoom digital y limpia la cámara._';
  return msg;
}

function mensajeConfirmacionPlacaSugerida(sesion, motivo) {
  var msg = '🔎 *Revisión de placa*';
  if (sesion.placaDetectada) msg += '\nLeí: *' + sesion.placaDetectada + '*';
  if (sesion.placaSugerida)  msg += '\nLa placa más probable es: *' + sesion.placaSugerida + '*';
  if (motivo) msg += '\n' + motivo;
  msg +=
    '\n\n1️⃣ Confirmar *' + (sesion.placaSugerida || 'placa sugerida') + '*\n' +
    '2️⃣ Enviar otra foto\n' +
    '3️⃣ Escribir la placa manualmente';
  msg += PIE_NAV_MAS;
  return msg;
}

// ============================================================================
// ODÓMETRO — CONFIRMACIÓN Y ALERTAS
// ============================================================================

function mensajeConfirmacionOdometro(sesion, prefijo) {
  var msg = prefijo ? (prefijo + '\n\n') : '';
  var ultimo = sesion.vehiculo && sesion.vehiculo.kilometraje;

  if (sesion.kmDetectado != null) {
    msg += '🔎 *Lectura del odómetro*\n';
    msg += 'Detecté: *' + sesion.kmDetectado + ' km*';
    if (ultimo || ultimo === 0) msg += '\nÚltimo registrado: *' + ultimo + ' km*';
    msg +=
      '\n\n1️⃣ Confirmar\n' +
      '2️⃣ Corregir el kilometraje\n' +
      '3️⃣ Enviar otra foto';
    msg += PIE_NAV_MAS;
    return msg;
  }

  msg += '❌ *No pude leer el odómetro automáticamente*';
  if (ultimo || ultimo === 0) msg += '\nÚltimo registrado: *' + ultimo + ' km*';
  msg +=
    '\n\n1️⃣ Escribir el kilometraje manualmente\n' +
    '2️⃣ Enviar otra foto';
  msg += PIE_NAV_MAS;
  msg += '\n\n_Tip: acerca el celular al display, toca para enfocar y evita reflejos._';
  return msg;
}

function mensajeKilometrajeFueraRango(sesion, evaluacion, maxKmSalto) {
  var ultimo = sesion.vehiculo && sesion.vehiculo.kilometraje;
  var msg = '⚠️ *Lectura del odómetro fuera de rango*';
  if (sesion.kmDetectado != null) msg += '\nDetecté: *' + sesion.kmDetectado + ' km*';
  if (ultimo || ultimo === 0)     msg += '\nÚltimo registrado: *' + ultimo + ' km*';
  msg += '\nRango automático: hasta *' + maxKmSalto + ' km* sobre el último registro.';
  if (evaluacion && evaluacion.mensajeCorto) msg += '\n' + evaluacion.mensajeCorto;
  msg +=
    '\n\n1️⃣ Escribir el kilometraje correcto\n' +
    '2️⃣ Enviar otra foto';
  msg += PIE_NAV_MAS;
  msg += '\n\n_Tip: acerca el celular al display y que solo se vea el tablero._';
  return msg;
}

// ============================================================================
// INSPECCIÓN — GRUPOS Y NOVEDADES
// ============================================================================

function primerMensajeInspeccion(sesion) {
  return preop.formatGrupoMsg(
    GRUPOS[0],
    '📋 *Inspección iniciada*\n' + sesion.placa + ' | ' + sesion.kilometraje + ' km'
  );
}

function mensajeFotoNovedad(sesion, prepararFotosNovedad, prefijo) {
  prepararFotosNovedad(sesion);

  if (!sesion.fotosNovedadPendientes.length) {
    sesion.estado = 'FOTO_ADICIONAL';
    return (
      (prefijo ? prefijo + '\n\n' : '') +
      '📸 *¿Fotos adicionales?*\n' +
      'Envía fotos extra si quieres agregar evidencia,\n' +
      'o escribe *no* para continuar.'
    );
  }

  var novedad = sesion.fotosNovedadPendientes[0];
  sesion.estado = 'FOTO_NOVEDAD';

  return (
    (prefijo ? prefijo + '\n\n' : '') +
    '📸 *Foto de novedad* (' + sesion.fotosNovedadPendientes.length + ' pendiente(s))\n' +
    '*' + novedad.item + '*\n' +
    '_' + (novedad.nota || novedad.estado || novedad.grupo) + '_'
  );
}

// ============================================================================
// CONFIRMACIÓN FINAL Y FIRMA
// ============================================================================

function mensajeConfirmacionFinal(sesion) {
  var msg =
    '───────────────\n' +
    '📋 *RESUMEN PREOPERACIONAL*\n' +
    '───────────────\n' +
    '🚗 Vehículo: *' + sesion.placa + '*\n' +
    '📏 Kilometraje: *' + sesion.kilometraje + ' km*\n' +
    '📸 Validación por foto: *OK*\n';

  if (sesion.novedades.length > 0) {
    msg += '⚠️ Novedades: *' + sesion.novedades.length + '*\n';
    sesion.novedades.forEach(function(n) {
      msg += '  • ' + n.item + ': ' + n.estado + '\n';
    });
  } else {
    msg += '✅ Sin novedades\n';
  }

  msg += '📷 Fotos: *' + sesion.fotos.length + '*\n';
  if (sesion.observacion) msg += '💬 _' + sesion.observacion + '_\n';

  msg +=
    '\n✍️ Escribe *SI* para firmar\n' +
    '0️⃣ _Atrás_ para corregir  •  9️⃣ _Menú principal_';

  return msg;
}

function mensajeFinalFirma(datosSesion, fechaTexto, novedadesCriticas, pdfUrl) {
  var msg =
    '───────────────\n' +
    '✅ *PREOPERACIONAL FIRMADO*\n' +
    '───────────────\n' +
    '🚗 *' + datosSesion.placa + '* | ' + fechaTexto + '\n' +
    '👤 ' + (datosSesion.conductor ? datosSesion.conductor.nombre : 'Conductor') + '\n' +
    '📏 ' + datosSesion.kilometraje + ' km\n';

  if (novedadesCriticas.length > 0) {
    msg += '⚠️ *' + novedadesCriticas.length + ' ítem(s) crítico(s)*\n_Supervisor notificado_\n';
  } else if (datosSesion.novedades.length > 0) {
    msg += '⚠️ ' + datosSesion.novedades.length + ' novedad(es)\n';
  } else {
    msg += '✅ Sin novedades\n';
  }

  msg += pdfUrl
    ? '\n📄 PDF generado y enviado por WhatsApp.'
    : '\n📄 Preoperacional firmado. El PDF no se pudo enviar automáticamente.';

  return msg;
}

module.exports = {
  mensajeInicio,
  mensajeInicioPlaca,
  mensajeInicioOdometro,
  mensajeFallbackPlaca,
  mensajeConfirmacionPlacaSugerida,
  mensajeConfirmacionOdometro,
  mensajeKilometrajeFueraRango,
  mensajeFotoNovedad,
  primerMensajeInspeccion,
  mensajeConfirmacionFinal,
  mensajeFinalFirma
};
