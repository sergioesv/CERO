/**
 * mensajes.js — Textos de mensajes WhatsApp para el flujo de tanqueo v2
 * Todos los strings de usuario viven aquí. flujo.js no contiene texto directo.
 * CERO — Gestión de Operaciones de Campo
 */

'use strict';

var validaciones = require('./validaciones');

var PIE = '\n\n0️⃣ _Atrás_  •  9️⃣ _Menú principal_';

function faltaFotoRecibo() {
  return '📸 Envía la foto del recibo para continuar.' + PIE;
}

function inicio() {
  return (
    '⛽ *Registro de tanqueo*\n\n' +
    '📸 *Paso 1 — Foto de la placa*\n' +
    'Envía una foto frontal donde la placa sea claramente visible.\n' +
    '_Buena luz, sin reflejos._' +
    PIE
  );
}

/**
 * Pregunta el tipo de tanqueo al conductor.
 * Convenio = red TERPEL con iButton. Emergencia = otra estación.
 */
function preguntarTipoTanqueo() {
  return (
    '⛽ *Registro de tanqueo*\n\n' +
    '¿Qué tipo de tanqueo vas a registrar?\n\n' +
    '1️⃣ Convenio (iButton / TERPEL)\n' +
    '2️⃣ Emergencia (otra estación)\n' +
    PIE
  );
}

/**
 * Confirma el tipo registrado y solicita la foto de la placa.
 * @param {string} tipo — 'convenio' o 'emergencia'
 */
function tipoTanqueoRegistrado(tipo) {
  var etiqueta = tipo === 'emergencia'
    ? '⚠️ Tanqueo de emergencia registrado.'
    : '✅ Tanqueo convenio registrado.';
  return etiqueta + '\n\n📸 *Paso 1 — Foto de la placa*\nEnvía una foto frontal donde la placa sea claramente visible.\n_Buena luz, sin reflejos._' + PIE;
}

function solicitarFotoPlaca(placaOcrRecibo) {
  var msg = '📸 *Foto de la placa*\n' +
    'Envía una foto frontal donde la placa sea claramente visible.';
  if (placaOcrRecibo) {
    msg += '\n\n_El recibo indica placa: *' + placaOcrRecibo + '*_';
  }
  msg += PIE;
  return msg;
}

function confirmarPlacaOcr(placaDetectada) {
  return (
    '🔎 *Placa detectada: ' + placaDetectada + '*\n\n' +
    '1️⃣ Confirmar\n' +
    '2️⃣ Escribir la placa manualmente' +
    PIE
  );
}

function solicitarPlacaManual() {
  return (
    '⌨️ No pude leer la placa con seguridad.\n\n' +
    'Escribe la placa del vehículo.\n' +
    'Ejemplo: *TKJ933*' +
    PIE
  );
}

function solicitarFotoOdometro(kmReferenciaMeta) {
  var msg = '📸 *Paso 2 — Foto del odómetro*\n' +
    'Envía la foto del tablero donde se vea el kilometraje.';
  if (kmReferenciaMeta && typeof kmReferenciaMeta.kilometraje === 'number') {
    msg += '\n\n_Último registrado: *' + kmReferenciaMeta.kilometraje.toLocaleString('es-CO') + ' km*_';
  }
  msg += PIE;
  return msg;
}

function confirmarKmOcr(sesion) {
  var msg = '🔎 *Lectura del odómetro*\n' +
    'Detecté: *' + (sesion.kmDetectado || 0).toLocaleString('es-CO') + ' km*';

  if (typeof sesion.kmReferencia === 'number') {
    msg += '\nÚltimo registrado: *' + sesion.kmReferencia.toLocaleString('es-CO') + ' km*';
    if (typeof sesion.diferenciaKm === 'number') {
      var signo = sesion.diferenciaKm >= 0 ? '+' : '';
      msg += '\nDiferencia: *' + signo + sesion.diferenciaKm.toLocaleString('es-CO') + ' km*';
    }
  }

  msg += '\n\n1️⃣ Confirmar\n2️⃣ Corregir el kilometraje\n3️⃣ Enviar otra foto';
  msg += PIE;
  return msg;
}

function alertaKmFueraRango(sesion) {
  var alerta = (sesion.alertasKm || [])[0];
  var msg = '⚠️ *Lectura fuera de rango*\n';
  if (alerta) msg += (alerta.mensaje || alerta) + '\n';
  if (typeof sesion.kmReferencia === 'number') {
    msg += 'Último registrado: *' + sesion.kmReferencia.toLocaleString('es-CO') + ' km*\n';
  }
  msg += 'Detecté: *' + (sesion.kmDetectado || 0).toLocaleString('es-CO') + ' km*';
  if (typeof sesion.diferenciaKm === 'number') {
    var signo2 = sesion.diferenciaKm >= 0 ? '+' : '';
    msg += '\nDiferencia: *' + signo2 + sesion.diferenciaKm.toLocaleString('es-CO') + ' km*';
  }
  msg += '\n\n1️⃣ Escribir el kilometraje correcto\n2️⃣ Enviar otra foto';
  msg += PIE;
  return msg;
}

function solicitarKmManual(kmReferenciaMeta) {
  var msg = '⌨️ Escribe el kilometraje del odómetro.\n\nSolo números. Ejemplo: *47889*';
  if (kmReferenciaMeta && typeof kmReferenciaMeta.kilometraje === 'number') {
    msg += '\n\n_Referencia: *' + kmReferenciaMeta.kilometraje.toLocaleString('es-CO') + ' km*_';
  }
  msg += PIE;
  return msg;
}

function solicitarFacturaManual(facturaOcr) {
  var msg = '🧾 *Número de factura o remisión*\n\nEscribe el número que aparece en el recibo.';
  if (facturaOcr) {
    msg += '\n\n_El recibo indica: *' + facturaOcr + '*_';
  }
  msg += PIE;
  return msg;
}

function solicitarLitrosManual(cantidadOcr, unidadOcr) {
  var msg = '🔢 *Cantidad de combustible*\n\nEscribe la cantidad en litros o galones.\nEjemplos: *45* · *45.5* · *12 gal*';
  if (cantidadOcr) {
    var unidad = unidadOcr || 'unidades';
    msg += '\n\n_El recibo indica: *' + cantidadOcr + ' ' + unidad + '*_';
  }
  msg += PIE;
  return msg;
}

function solicitarTipoCombustible() {
  return (
    '⛽ *Tipo de combustible*\n\n' +
    '1️⃣ Diésel\n' +
    '2️⃣ Gasolina\n' +
    '3️⃣ Gas\n' +
    '4️⃣ AdBlue\n' +
    '5️⃣ Otro' +
    PIE
  );
}

function solicitarValorTotal() {
  return (
    '💰 *Valor total del tanqueo*\n\n' +
    'Escribe solo el número en pesos.\n' +
    'Ejemplo: *218400*' +
    PIE
  );
}

function solicitarEstacion() {
  return (
    '🏪 *Estación de servicio*\n\n' +
    'Escribe el nombre de la estación\no *0* si no aplica.' +
    PIE
  );
}

function resumenFinal(sesion) {
  var lineas = [];
  lineas.push('───────────────');
  lineas.push('⛽ *RESUMEN DEL TANQUEO*');
  lineas.push('───────────────');
  lineas.push('🚗 Placa: *' + sesion.placa + '*');
  if (sesion.tipoTanqueo) {
    var etiquetaTipo = sesion.tipoTanqueo === 'emergencia' ? '⚠️ Emergencia' : '✅ Convenio';
    lineas.push('🔖 Tipo: *' + etiquetaTipo + '*');
  }
  lineas.push('🧾 Factura: *' + (sesion.facturaNumeroManual || sesion.facturaNumeroOcr || 'N/A') + '*');
  lineas.push('🛣️ Kilometraje: *' + (sesion.kilometraje || 0).toLocaleString('es-CO') + ' km*');

  if (typeof sesion.kmReferencia === 'number') {
    lineas.push('↕️ Diferencia: *' + (sesion.diferenciaKm || 0).toLocaleString('es-CO') + ' km*');
  }

  lineas.push('⛽ Combustible: *' + (sesion.tipoCombustible || 'N/A') + '*');
  lineas.push('🔢 Cantidad: *' + (sesion.cantidadManual || sesion.cantidadOcr || 0) + ' ' + (sesion.unidadMedida || 'litros') + '*');
  lineas.push('💰 Valor: *' + validaciones.formatearValorMoneda(sesion.valorTotal) + '*');

  if (sesion.estacionServicio) {
    lineas.push('🏪 Estación: *' + sesion.estacionServicio + '*');
  }

  lineas.push('');
  lineas.push('1️⃣ Confirmar y guardar');
  lineas.push('2️⃣ Cancelar');

  return lineas.join('\n');
}

function tanqueoGuardado(tanqueo, estadoValidacion) {
  var msg = '───────────────\n✅ *TANQUEO GUARDADO*\n───────────────\n';
  msg += '🚗 *' + tanqueo.vehiculo_placa + '*\n';
  if (tanqueo.tipo_tanqueo === 'emergencia') {
    msg += '🔖 Tipo: *⚠️ Emergencia*\n';
  }
  msg += '🛣️ Kilometraje: *' + (tanqueo.kilometraje || 0).toLocaleString('es-CO') + ' km*\n';
  msg += '🔢 Cantidad: *' + tanqueo.cantidad + ' ' + tanqueo.unidad_medida + '*\n';
  msg += '💰 Valor: *' + validaciones.formatearValorMoneda(tanqueo.valor_total) + '*';

  if (estadoValidacion === 'auto_validado') {
    msg += '\n\n✅ _Validación automática: todos los datos coinciden._';
  } else {
    msg += '\n\n⚠️ _Pendiente de revisión por el administrador._';
  }

  msg += '\n\nEscribe *9* para volver al menú.';
  return msg;
}

function errorGuardado() {
  return '❌ No pude guardar el tanqueo.\n\nRevisa el log del servidor y vuelve a intentar.';
}

function vehiculoNoEncontrado(placa) {
  return '❌ El vehículo *' + placa + '* no existe en el sistema.\n\nVerifica la placa.' + PIE;
}

function vehiculoBloqueado(placa, motivo) {
  return '🚫 *Vehículo bloqueado*\n' + placa + '\n' + (motivo || 'Contacta al supervisor.') + PIE;
}

function leyendoRecibo() {
  return '⏳ Leyendo el recibo...';
}

function promptConfirmacionPlacaInvalida() {
  return 'Responde con *1* para confirmar o *2* para corregir.' + PIE;
}

function placaConfirmadaPrefijo(placa) {
  return '✅ Placa *' + placa + '* confirmada.\n\n';
}

function placaRegistradaPrefijo(placa) {
  return '✅ Placa *' + placa + '* registrada.\n\n';
}

function promptConfirmacionKmInvalida() {
  return 'Responde con *1*, *2* o *3*.' + PIE;
}

function kilometrajeConfirmadoPrefijo(km) {
  return '✅ Kilometraje *' + km.toLocaleString('es-CO') + ' km* confirmado.\n\n';
}

function kilometrajeRegistradoPrefijo(km) {
  return '✅ Kilometraje *' + km.toLocaleString('es-CO') + ' km* registrado.';
}

function facturaRegistradaPrefijo(num) {
  return '✅ Factura *' + num + '* registrada.\n\n';
}

function placaManualInvalida() {
  return '❌ Placa inválida. Ejemplo: *TKJ933*' + PIE;
}

function kmManualInvalido() {
  return '❌ Kilometraje inválido. Solo números. Ejemplo: *47889*' + PIE;
}

function valorInvalido() {
  return '❌ Valor inválido. Solo el número. Ejemplo: *218400*' + PIE;
}

function promptFinalGuardarCancelar() {
  return 'Responde *1* para guardar o *2* para cancelar.' + PIE;
}

function solicitarFotoFactura() {
  return (
    '📸 *Foto del recibo*\n' +
    'Envía la foto del recibo o factura de la estación de servicio.\n' +
    '_Acércate bien, buena luz, sin reflejos._' +
    '\n\n0️⃣ _Atrás_  •  9️⃣ _Menú principal_'
  );
}

function confirmarPlacaSugerida(sesion) {
  var msg = '🔎 ¿Es esta la placa?\n*' + sesion.placaSugerida + '*';
  if (sesion.placaDetectada) {
    msg += '\n_Lectura inicial: ' + sesion.placaDetectada + '_';
  }
  msg += '\n\n1️⃣ Sí, confirmar\n2️⃣ Enviar otra foto\n3️⃣ Escribir la placa';
  msg += '\n\n0️⃣ _Atrás_  •  9️⃣ _Menú principal_';
  return msg;
}

function fallbackPlaca(sesion, motivo) {
  var msg = '📸 No pude leer la placa con seguridad.';
  if (motivo) msg += '\n_' + motivo + '_';
  msg += '\n\n1️⃣ Enviar otra foto\n2️⃣ Escribir la placa manualmente';
  msg += '\n\n0️⃣ _Atrás_  •  9️⃣ _Menú principal_';
  return msg;
}

function escribePlacaSinEspacios() {
  return '⌨️ Escribe la placa sin espacios.\nEjemplo: *TKJ933*' + PIE;
}

function formatoPlacaEstandarInvalido() {
  return 'Formato inválido. La placa debe ser 3 letras + 3 números (ej: ABC123).' + PIE;
}

function errorGenericoTanqueo() {
  return 'Ocurrió un error. Escribe *9* para volver al menú.';
}

function reciboProcesadoSolicitudFactura(facturaOcr) {
  return '✅ Recibo procesado.\n\n' + solicitarFacturaManual(facturaOcr);
}

function kilometrajeConfirmadoSolicitudRecibo(km) {
  return '✅ Kilometraje *' + km.toLocaleString('es-CO') + ' km* confirmado.\n\n' + solicitarFotoFactura();
}

module.exports = {
  faltaFotoRecibo: faltaFotoRecibo,
  inicio: inicio,
  preguntarTipoTanqueo: preguntarTipoTanqueo,
  tipoTanqueoRegistrado: tipoTanqueoRegistrado,
  solicitarFotoPlaca: solicitarFotoPlaca,
  confirmarPlacaOcr: confirmarPlacaOcr,
  solicitarPlacaManual: solicitarPlacaManual,
  solicitarFotoOdometro: solicitarFotoOdometro,
  confirmarKmOcr: confirmarKmOcr,
  alertaKmFueraRango: alertaKmFueraRango,
  solicitarKmManual: solicitarKmManual,
  solicitarFacturaManual: solicitarFacturaManual,
  solicitarLitrosManual: solicitarLitrosManual,
  solicitarTipoCombustible: solicitarTipoCombustible,
  solicitarValorTotal: solicitarValorTotal,
  solicitarEstacion: solicitarEstacion,
  resumenFinal: resumenFinal,
  tanqueoGuardado: tanqueoGuardado,
  errorGuardado: errorGuardado,
  vehiculoNoEncontrado: vehiculoNoEncontrado,
  vehiculoBloqueado: vehiculoBloqueado,
  leyendoRecibo: leyendoRecibo,
  promptConfirmacionPlacaInvalida: promptConfirmacionPlacaInvalida,
  placaConfirmadaPrefijo: placaConfirmadaPrefijo,
  placaRegistradaPrefijo: placaRegistradaPrefijo,
  promptConfirmacionKmInvalida: promptConfirmacionKmInvalida,
  kilometrajeConfirmadoPrefijo: kilometrajeConfirmadoPrefijo,
  kilometrajeRegistradoPrefijo: kilometrajeRegistradoPrefijo,
  facturaRegistradaPrefijo: facturaRegistradaPrefijo,
  placaManualInvalida: placaManualInvalida,
  kmManualInvalido: kmManualInvalido,
  valorInvalido: valorInvalido,
  promptFinalGuardarCancelar: promptFinalGuardarCancelar,
  solicitarFotoFactura: solicitarFotoFactura,
  confirmarPlacaSugerida: confirmarPlacaSugerida,
  fallbackPlaca: fallbackPlaca,
  escribePlacaSinEspacios: escribePlacaSinEspacios,
  formatoPlacaEstandarInvalido: formatoPlacaEstandarInvalido,
  errorGenericoTanqueo: errorGenericoTanqueo,
  reciboProcesadoSolicitudFactura: reciboProcesadoSolicitudFactura,
  kilometrajeConfirmadoSolicitudRecibo: kilometrajeConfirmadoSolicitudRecibo
};
