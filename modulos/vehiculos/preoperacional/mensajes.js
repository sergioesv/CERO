var preop = require('./validaciones');
var PASOS_INICIALES = preop.PASOS_INICIALES;
var GRUPOS = preop.GRUPOS;

function normalizarKilometrajeManual(texto) {
  var numerico = String(texto || '').replace(/[^0-9]/g, '');
  return numerico ? parseInt(numerico, 10) : null;
}

function mensajeInicioPlaca() {
  return '📸 *Paso 1 de 2*\n' + PASOS_INICIALES.fotoPlaca;
}

function mensajeInicioOdometro(vehiculo) {
  return '📸 *Paso 2 de 2*\n' + PASOS_INICIALES.fotoOdometro +
    (vehiculo && vehiculo.kilometraje ? ('\n\nUltimo registrado: *' + vehiculo.kilometraje + ' km*') : '');
}

function mensajeInicio() {
  return '🚗 *CERO - Preoperacional*\nBuenos dias 👋\n\n' + mensajeInicioPlaca();
}

function mensajeFallbackPlaca(sesion, motivo) {
  var msg = '❌ *No pude validar la placa automaticamente*';
  if (sesion.placaDetectada) msg += '\nDetecte: *' + sesion.placaDetectada + '*';
  if (motivo) msg += '\n' + motivo;
  msg += '\n\n1⃣ Enviar otra foto\n2⃣ Escribir la placa manualmente';
  msg += '\n\n_Tip: acercate mas a la placa, evita el zoom digital y limpia la camara._';
  return msg;
}

function mensajeConfirmacionPlacaSugerida(sesion, motivo) {
  var msg = '🔎 *Revision de placa*';
  if (sesion.placaDetectada) msg += '\nLei: *' + sesion.placaDetectada + '*';
  if (sesion.placaSugerida) msg += '\nLa placa mas probable es: *' + sesion.placaSugerida + '*';
  if (motivo) msg += '\n' + motivo;
  msg += '\n\n1⃣ Confirmar ' + (sesion.placaSugerida || 'placa sugerida');
  msg += '\n2⃣ Enviar otra foto\n3⃣ Escribir la placa manualmente';
  return msg;
}

function mensajeConfirmacionOdometro(sesion, prefijo) {
  var msg = prefijo ? (prefijo + '\n\n') : '';
  var ultimo = sesion.vehiculo && sesion.vehiculo.kilometraje;
  if (sesion.kmDetectado != null) {
    msg += '🔎 *Lectura del odometro*\nDetecte: *' + sesion.kmDetectado + ' km*';
    if (ultimo) msg += '\nUltimo registrado: *' + ultimo + ' km*';
    msg += '\n\n1⃣ Confirmar\n2⃣ Corregir escribiendo el kilometraje\n3⃣ Enviar otra foto';
    return msg;
  }
  msg += '❌ *No pude leer el kilometraje automaticamente*';
  if (ultimo) msg += '\nUltimo registrado: *' + ultimo + ' km*';
  msg += '\n\n2⃣ Escribir el kilometraje manualmente\n3⃣ Enviar otra foto';
  return msg;
}

function mensajeKilometrajeFueraRango(sesion, evaluacion, maxKmSalto) {
  var ultimo = sesion.vehiculo && sesion.vehiculo.kilometraje;
  var msg = '⚠️ *Lectura del odometro fuera de rango*';
  if (sesion.kmDetectado != null) msg += '\nDetecte: *' + sesion.kmDetectado + ' km*';
  if (ultimo || ultimo === 0) msg += '\nUltimo registrado: *' + ultimo + ' km*';
  msg += '\nRango automatico: hasta *' + maxKmSalto + ' km* por encima del ultimo registro.';
  if (evaluacion && evaluacion.mensajeCorto) msg += '\n' + evaluacion.mensajeCorto;
  msg += '\n\n2⃣ Escribir el kilometraje correcto\n3⃣ Enviar otra foto';
  return msg;
}

function mensajeFotoNovedad(sesion, prepararFotosNovedad, prefijo) {
  prepararFotosNovedad(sesion);
  if (!sesion.fotosNovedadPendientes.length) {
    sesion.estado = 'FOTO_ADICIONAL';
    return (prefijo ? prefijo + '\n\n' : '') + '📸 *Fotos adicionales?*\nEnvie fotos extra o escriba *no* para continuar';
  }
  var novedad = sesion.fotosNovedadPendientes[0];
  sesion.estado = 'FOTO_NOVEDAD';
  return (prefijo ? prefijo + '\n\n' : '') + '📸 *Foto de novedad* (' + sesion.fotosNovedadPendientes.length + ' pendiente(s))\n*' + novedad.item + '*\n_' + (novedad.nota || novedad.estado || novedad.grupo) + '_';
}

function primerMensajeInspeccion(sesion) {
  return preop.formatGrupoMsg(GRUPOS[0], '📝 *Inspeccion iniciada*\n' + sesion.placa + ' | ' + sesion.kilometraje + ' km');
}

function mensajeConfirmacionFinal(sesion) {
  var txt = '───────────────\n📝 *CONFIRMAR PREOPERACIONAL*\n───────────────\n';
  txt += '🚗 Vehiculo: *' + sesion.placa + '*\n📏 Kilometraje: *' + sesion.kilometraje + ' km*\n📸 Validacion inicial: *OK*\n';
  if (sesion.novedades.length > 0) {
    txt += '⚠️ Novedades: *' + sesion.novedades.length + '*\n';
    sesion.novedades.forEach(function(n) { txt += '  • ' + n.item + ': ' + n.estado + '\n'; });
  } else { txt += '✅ Sin novedades\n'; }
  txt += '📷 Fotos: *' + sesion.fotos.length + '*\n';
  if (sesion.observacion) txt += '💬 _' + sesion.observacion + '_\n';
  txt += '\n✍️ Escriba *SI* para firmar\no *ATRAS* para corregir';
  return txt;
}

function mensajeFinalFirma(datosSesion, fechaTexto, novedadesCriticas, pdfUrl) {
  var msg = '───────────────\n✅ *PREOPERACIONAL FIRMADO*\n───────────────\n';
  msg += '🚗 *' + datosSesion.placa + '* | ' + fechaTexto + '\n👤 ' + (datosSesion.conductor ? datosSesion.conductor.nombre : 'Conductor') + '\n📏 ' + datosSesion.kilometraje + ' km\n';
  if (novedadesCriticas.length > 0) { msg += '⚠️ *' + novedadesCriticas.length + ' item(es) critico(s)*\n_Supervisor notificado_\n'; }
  else if (datosSesion.novedades.length > 0) { msg += '⚠️ ' + datosSesion.novedades.length + ' novedad(es)\n'; }
  else { msg += '✅ Sin novedades\n'; }
  msg += pdfUrl ? '\n📄 PDF generado y enviado.' : '\n📄 Firmado, pero el PDF falló.';
  return msg;
}

module.exports = {
  normalizarKilometrajeManual,
  mensajeInicioPlaca,
  mensajeInicioOdometro,
  mensajeInicio,
  mensajeFallbackPlaca,
  mensajeConfirmacionPlacaSugerida,
  mensajeConfirmacionOdometro,
  mensajeKilometrajeFueraRango,
  mensajeFotoNovedad,
  primerMensajeInspeccion,
  mensajeConfirmacionFinal,
  mensajeFinalFirma
};
