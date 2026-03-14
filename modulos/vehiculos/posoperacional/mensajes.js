function mensajeInicio() {
  return '🏁 *POSOPERACIONAL*\n\nEnvía la *placa del vehículo* para iniciar el cierre de jornada.\n\n_También puedes escribir MENU para volver al inicio._';
}

function mensajeSolicitudOdometro(vehiculo, referencia) {
  var msg = '✅ *' + (vehiculo.placa || '') + '*\n';
  msg += [vehiculo.tipo, vehiculo.marca, vehiculo.modelo].filter(Boolean).join(' ') || 'Vehiculo registrado';
  msg += '\n\n📸 Envía una *foto del odómetro* con el kilometraje final.';

  if (referencia && typeof referencia.kilometraje === 'number') {
    msg += '\n\n📍 Referencia: *' + referencia.kilometraje.toLocaleString('es-CO') + ' km*';
    if (referencia.origen === 'preoperacional_dia') msg += ' (preoperacional del día)';
    if (referencia.origen === 'ultimo_posoperacional') msg += ' (último posoperacional)';
    if (referencia.origen === 'ultimo_preoperacional') msg += ' (último preoperacional)';
    if (referencia.origen === 'vehiculo') msg += ' (último kilometraje del vehículo)';
  }

  return msg;
}

function mensajeConfirmacionKilometraje(sesion) {
  var msg = '🔎 *Lectura del odómetro*\n';
  msg += 'Detecté: *' + (sesion.kmDetectado || 0).toLocaleString('es-CO') + ' km*';

  if (typeof sesion.kmReferencia === 'number') {
    msg += '\nÚltimo registrado: *' + sesion.kmReferencia.toLocaleString('es-CO') + ' km*';
    if (typeof sesion.diferenciaKm === 'number') {
      msg += '\nDiferencia: *' + (sesion.diferenciaKm >= 0 ? '+' : '') + sesion.diferenciaKm.toLocaleString('es-CO') + ' km*';
    }
  }

  msg += '\n\n1⃣ Confirmar';
  msg += '\n2⃣ Corregir escribiendo el kilometraje';
  msg += '\n3⃣ Enviar otra foto';
  return msg;
}

function mensajeAlertaKilometraje(sesion) {
  var alerta = (sesion.alertasKm || [])[0];
  var msg = '⚠️ *Atención con el kilometraje*\n';
  if (alerta && alerta.mensaje) msg += alerta.mensaje + '\n';

  if (typeof sesion.kmReferencia === 'number') {
    msg += 'Último registrado: *' + sesion.kmReferencia.toLocaleString('es-CO') + ' km*\n';
  }

  msg += 'Nuevo detectado: *' + (sesion.kmDetectado || 0).toLocaleString('es-CO') + ' km*';
  if (typeof sesion.diferenciaKm === 'number') {
    msg += '\nDiferencia: *' + (sesion.diferenciaKm >= 0 ? '+' : '') + sesion.diferenciaKm.toLocaleString('es-CO') + ' km*';
  }

  msg += '\n\n1⃣ Confirmar de todos modos';
  msg += '\n2⃣ Corregir kilometraje';
  msg += '\n3⃣ Enviar otra foto';
  return msg;
}

function mensajePreguntaNovedades() {
  return '🛠️ *¿Hubo novedades al finalizar la jornada?*\n\n1⃣ Sí\n2⃣ No\n3⃣ Atrás';
}

function mensajeSolicitarNovedad() {
  return '✍️ Describe la novedad en texto libre.\n\nEjemplos:\n• Luz trasera dañada\n• El rodillo de las llantas suena raro\n• Parachoques rayado\n\n_Escribe una novedad por mensaje._';
}

function mensajeConfirmarNovedadInterpretada(novedades) {
  var novedad = (novedades || [])[0];
  if (!novedad) {
    return 'No pude interpretar la novedad. Escríbela de nuevo con un poco más de detalle.';
  }

  var msg = '🤖 *Interpreté esta novedad:*\n';
  msg += '• Categoría: *' + novedad.categoria + '*\n';
  msg += '• Item: *' + novedad.item + '*\n';
  msg += '• Estado: *' + novedad.estado + '*\n';
  msg += '• Severidad: *' + novedad.severidad + '*\n';
  msg += '• Criticidad: *' + (novedad.critico ? 'crítica' : 'no crítica') + '*\n';
  msg += '\n1⃣ Confirmar\n2⃣ Escribir de nuevo\n3⃣ Cancelar novedad';
  return msg;
}

function mensajeSolicitarFotoNovedad(novedad, pendientes) {
  var totalPendientes = typeof pendientes === 'number' ? pendientes : 1;
  var msg = '📸 *Foto de evidencia*';
  msg += '\nPendientes: *' + totalPendientes + '*';
  msg += '\n\nItem: *' + novedad.item + '*';
  msg += '\nDetalle: _' + (novedad.texto_original || novedad.estado || 'Con novedad') + '_';
  msg += '\n\nEnvía una foto clara de la novedad.';
  return msg;
}

function mensajeAgregarOtraNovedad() {
  return '➕ *¿Deseas registrar otra novedad?*\n\n1⃣ Sí\n2⃣ No, continuar';
}

function mensajeObservaciones() {
  return '💬 *Observación final*\n\nEscribe una observación final o escribe *no* si no aplica.';
}

function mensajeConfirmacionFinal(sesion, resumen) {
  var msg = resumen + '\n\n';
  msg += '📷 Fotos adjuntas: *' + ((sesion.fotos || []).length) + '*\n';
  msg += '\n✍️ Escribe *SI* para firmar y cerrar el posoperacional.\nEscribe *ATRAS* para corregir.';
  return msg;
}

function mensajeFinalizado(datosSesion, pdfUrl) {
  var msg = '✅ *POSOPERACIONAL FIRMADO*\n';
  msg += '🚗 ' + (datosSesion.placa || '') + '\n';
  msg += '📏 ' + (datosSesion.kilometrajeFinal || 0).toLocaleString('es-CO') + ' km\n';

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
    : '\n📄 Se guardó el registro, pero el PDF no se pudo enviar automáticamente.';
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
