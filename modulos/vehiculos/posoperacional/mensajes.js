// modulos/vehiculos/posoperacional/mensajes.js
// Textos de UX del flujo posoperacional.
// Sistema de diseño unificado CERO:
//   Opciones  → 1️⃣ Texto
//   Navegación → Escribe ATRAS o CANCELAR (texto, no botones)
//   Confirmar  → Escribe *SI* para firmar
//   Separadores → solo en resúmenes/confirmación final
//   Tono       → informal, español correcto

'use strict';

// ── Pie de navegación estándar ────────────────────────────────────────────────

var PIE_NAV = '\n\n0️⃣ _Atrás_  •  9️⃣ _Menú principal_';

// ============================================================================
// INICIO
// ============================================================================

function mensajeInicio() {
  return (
    '🏁 *Posoperacional*\n\n' +
    'Escribe la *placa del vehículo* para iniciar el cierre de jornada.' +
    PIE_NAV
  );
}

// ============================================================================
// ODÓMETRO
// ============================================================================

function mensajeSolicitudOdometro(vehiculo, referencia) {
  var msg =
    '✅ *' + (vehiculo.placa || '') + '*\n' +
    ([vehiculo.tipo, vehiculo.marca, vehiculo.modelo].filter(Boolean).join(' ') || 'Vehículo registrado') +
    '\n\n📸 Envía una *foto del odómetro* con el kilometraje final.';

  if (referencia && typeof referencia.kilometraje === 'number') {
    msg += '\n\nÚltimo registrado: *' + referencia.kilometraje.toLocaleString('es-CO') + ' km*';
    if (referencia.origen === 'preoperacional_dia')    msg += ' (preoperacional del día)';
    if (referencia.origen === 'ultimo_posoperacional') msg += ' (último posoperacional)';
    if (referencia.origen === 'ultimo_preoperacional') msg += ' (último preoperacional)';
    if (referencia.origen === 'vehiculo')              msg += ' (último km del vehículo)';
  }

  msg += PIE_NAV;
  return msg;
}

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

// ============================================================================
// NOVEDADES
// ============================================================================

function mensajePreguntaNovedades() {
  return (
    '🛠️ *¿Hubo novedades al finalizar la jornada?*\n\n' +
    '1️⃣ Sí\n' +
    '2️⃣ No' +
    '\n\n0️⃣ _Atrás_  •  9️⃣ _Menú principal_'
  );
}

function mensajeSolicitarNovedad() {
  return (
    '✍️ *Describe la novedad*\n\n' +
    'Ejemplos:\n' +
    '• Luz trasera dañada\n' +
    '• El rodillo de las llantas suena raro\n' +
    '• Parachoques rayado\n\n' +
    '_Escribe una novedad por mensaje._' +
    '\n\n0️⃣ _Atrás_  •  9️⃣ _Menú principal_'
  );
}

function mensajeConfirmarNovedadInterpretada(novedades) {
  var novedad = (novedades || [])[0];
  if (!novedad) {
    return 'No pude interpretar la novedad. Escríbela de nuevo con un poco más de detalle.';
  }

  return (
    '🤖 *Interpreté esta novedad:*\n' +
    '• Categoría: *' + novedad.categoria + '*\n' +
    '• Ítem: *' + novedad.item + '*\n' +
    '• Estado: *' + novedad.estado + '*\n' +
    '• Severidad: *' + novedad.severidad + '*\n' +
    '• Criticidad: *' + (novedad.critico ? 'crítica' : 'no crítica') + '*\n' +
    '\n1️⃣ Confirmar\n' +
    '2️⃣ Escribir de nuevo\n' +
    '3️⃣ Cancelar esta novedad' +
    '\n\n0️⃣ _Atrás_  •  9️⃣ _Menú principal_'
  );
}

function mensajeSolicitarFotoNovedad(novedad, pendientes) {
  var totalPendientes = typeof pendientes === 'number' ? pendientes : 1;
  return (
    '📸 *Foto de evidencia*\n' +
    'Pendientes: *' + totalPendientes + '*\n\n' +
    'Ítem: *' + novedad.item + '*\n' +
    'Detalle: _' + (novedad.texto_original || novedad.estado || 'Con novedad') + '_\n\n' +
    'Envía una foto clara de la novedad.' +
    '\n\n0️⃣ _Atrás_  •  9️⃣ _Menú principal_'
  );
}

function mensajeAgregarOtraNovedad() {
  return (
    '➕ *¿Registrar otra novedad?*\n\n' +
    '1️⃣ Sí\n' +
    '2️⃣ No, continuar' +
    '\n\n0️⃣ _Atrás_  •  9️⃣ _Menú principal_'
  );
}

// ============================================================================
// OBSERVACIONES
// ============================================================================

function mensajeObservaciones() {
  return (
    '💬 *Observación final*\n\n' +
    'Escribe una observación o *no* si no aplica.' +
    '\n\n0️⃣ _Atrás_  •  9️⃣ _Menú principal_'
  );
}

// ============================================================================
// CONFIRMACIÓN FINAL Y FIRMA
// ============================================================================

function mensajeConfirmacionFinal(sesion, resumen) {
  return (
    resumen + '\n\n' +
    '📷 Fotos adjuntas: *' + ((sesion.fotos || []).length) + '*\n' +
    '\n✍️ Escribe *SI* para firmar y cerrar el posoperacional.\n' +
    '◀️ *ATRAS* para corregir  •  ✖️ *CANCELAR* para anular'
  );
}

function mensajeFinalizado(datosSesion, pdfUrl) {
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

  return msg;
}

module.exports = {
  mensajeInicio,
  mensajeSolicitudOdometro,
  mensajeConfirmacionKilometraje,
  mensajeAlertaKilometraje,
  mensajePreguntaNovedades,
  mensajeSolicitarNovedad,
  mensajeConfirmarNovedadInterpretada,
  mensajeSolicitarFotoNovedad,
  mensajeAgregarOtraNovedad,
  mensajeObservaciones,
  mensajeConfirmacionFinal,
  mensajeFinalizado
};
