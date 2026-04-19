// modulos/vehiculos/preoperacional/mensajes.js
// Textos de UX del flujo preoperacional.
// Sistema de diseño unificado CERO:
//   Opciones  → 1️⃣ Texto
//   Navegación → Escribe ATRAS o CANCELAR (texto, no botones)
//   Confirmar  → 1️⃣ Firmar (numérico)
//   Separadores → solo en resúmenes/confirmación final
//   Tono       → informal, español correcto

'use strict';

var preop = require('./validaciones');
var PASOS_INICIALES = preop.PASOS_INICIALES;

var nav     = require('../compartido/navegacion');
var PIE_MENU = nav.PIE_MENU;
var PIE_NAV  = nav.PIE_NAV;

// ============================================================================
// INICIO DEL FLUJO
// ============================================================================

function mensajeInicio() {
  return '🚗 *CERO — Preoperacional*\nBuenos días 👋\n\n' + mensajeInicioPlaca();
}

function mensajeInicioPlaca() {
  return (
    '📸 *Identificación del vehículo*\n' +
    PASOS_INICIALES.fotoPlaca +
    PIE_MENU
  );
}

function mensajeInicioOdometro(vehiculo) {
  var msg = '📸 *Lectura del odómetro*\n' + PASOS_INICIALES.fotoOdometro;
  if (vehiculo && (vehiculo.kilometraje || vehiculo.kilometraje === 0)) {
    msg += '\n\nÚltimo registrado: *' + vehiculo.kilometraje + ' km*';
  }
  msg += PIE_NAV;
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
  msg += PIE_NAV;
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
  msg += PIE_NAV;
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
    msg += PIE_NAV;
    return msg;
  }

  msg += '❌ *No pude leer el odómetro automáticamente*';
  if (ultimo || ultimo === 0) msg += '\nÚltimo registrado: *' + ultimo + ' km*';
  msg +=
    '\n\n1️⃣ Escribir el kilometraje manualmente\n' +
    '2️⃣ Enviar otra foto';
  msg += PIE_NAV;
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
  msg += PIE_NAV;
  msg += '\n\n_Tip: acerca el celular al display y que solo se vea el tablero._';
  return msg;
}

// ============================================================================
// INSPECCIÓN — GRUPOS Y NOVEDADES
// ============================================================================

function mensajeSinPlantillaInspeccion() {
  return (
    '⚠️ *No hay plantilla de inspección*\n\n' +
    'Este tipo de activo no tiene una plantilla activa en CERO (ni global ni de tu empresa).\n' +
    'Un administrador debe crear o activar una plantilla en el panel.\n\n' +
    'Escribe *9* para volver al menú principal.'
  );
}

function primerMensajeInspeccion(sesion, grupos) {
  var g = grupos != null ? grupos : (sesion && sesion.gruposInspeccion);
  if (!sesion || sesion.sinPlantilla || !g || !g.length) {
    return mensajeSinPlantillaInspeccion();
  }
  return preop.formatGrupoMsg(
    g[0],
    '📋 *Inspección iniciada*\n' + sesion.placa + ' | ' + sesion.kilometraje + ' km'
  );
}

function mensajeFotoAdicional(prefijo) {
  return (
    (prefijo ? prefijo + '\n\n' : '') +
    '📸 *¿Fotos adicionales?*\n\n' +
    'Envía una foto para agregar evidencia, o:\n\n' +
    '1️⃣ Continuar a la observación final' +
    PIE_NAV
  );
}

function mensajeFotoNovedad(sesion, prepararFotosNovedad, prefijo) {
  prepararFotosNovedad(sesion);

  if (!sesion.fotosNovedadPendientes.length) {
    sesion.estado = 'FOTO_ADICIONAL';
    return mensajeFotoAdicional(prefijo);
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

/**
 * Menú de observación final (antes del resumen): solo números.
 */
function mensajeMenuObservacionFinal() {
  return (
    '💬 *Observación final*\n\n' +
    '1️⃣ Sin observaciones\n' +
    '2️⃣ Escribir observación' +
    PIE_NAV
  );
}

/** Paso de texto libre tras elegir 2 en observación final. */
function mensajeEscribirObservacionFinal() {
  return '✍️ Escribe tu observación final (texto libre).' + PIE_NAV;
}

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
    '\n1️⃣ Firmar y cerrar\n' +
    '2️⃣ Corregir (volver a observación)\n' +
    '0️⃣ _Atrás_  •  9️⃣ _Menú principal_';

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

  // Pie de menú: el operario debe saber que puede escribir 9 para volver al menú principal
  msg += PIE_MENU;

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
  mensajeFotoAdicional,
  mensajeFotoNovedad,
  mensajeSinPlantillaInspeccion,
  primerMensajeInspeccion,
  mensajeMenuObservacionFinal,
  mensajeEscribirObservacionFinal,
  mensajeConfirmacionFinal,
  mensajeFinalFirma
};
