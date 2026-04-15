/**
 * mensajes.js — Textos de mensajes WhatsApp para el flujo de tanqueo v3
 * Todos los strings de usuario viven aquí. flujo.js no contiene texto directo.
 * CERO — Gestión de Operaciones de Campo
 */

'use strict';

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

function vehiculoNoEncontrado(placa) {
  return '❌ El vehículo *' + placa + '* no existe en el sistema.\n\nVerifica la placa.' + PIE;
}

function vehiculoBloqueado(placa, motivo) {
  return '🚫 *Vehículo bloqueado*\n' + placa + '\n' + (motivo || 'Contacta al supervisor.') + PIE;
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

function placaManualInvalida() {
  return '❌ Placa inválida. Ejemplo: *TKJ933*' + PIE;
}

function kmManualInvalido() {
  return '❌ Kilometraje inválido. Solo números. Ejemplo: *47889*' + PIE;
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

/**
 * Mensaje mientras Gemini procesa la foto de la factura.
 */
function leyendoFactura() {
  return '🤖 _Leyendo la factura..._';
}

/**
 * Resumen OCR completo — Camino A (tier 1, todos los campos críticos leídos).
 * @param {Object} sesion
 */
function resumenOcrCompleto(sesion) {
  var lineas = [];
  lineas.push('─────────────────');
  lineas.push('⛽ *RESUMEN DEL TANQUEO*');
  lineas.push('─────────────────');

  var ocr = sesion.datosOcrFactura || {};

  if (ocr.factura_numero && ocr.factura_numero.leido) {
    lineas.push('🧾 Remisión: *' + ocr.factura_numero.valor + '*');
  }
  if (ocr.fecha && ocr.fecha.leido) {
    lineas.push('📅 Fecha: *' + ocr.fecha.valor + '*');
  }
  if (sesion.placa) {
    var placaFacturaOk = ocr.placa && ocr.placa.leido && ocr.placa.valor.toUpperCase().replace(/\s/g, '') === sesion.placa;
    lineas.push('🚗 Placa: *' + sesion.placa + '* ' + (placaFacturaOk ? '✓' : ''));
  }
  if (ocr.estacion && ocr.estacion.leido) {
    lineas.push('📍 ' + ocr.estacion.valor);
  }
  if (ocr.producto && ocr.producto.leido) {
    lineas.push('⛽ Combustible: *' + ocr.producto.valor + '*');
  }
  if (ocr.cantidad && ocr.cantidad.leido) {
    var unidad = (sesion.unidadMedida || 'litros');
    lineas.push('🔢 Cantidad: *' + ocr.cantidad.valor + ' ' + unidad + '*');
  }
  if (ocr.valor_total && ocr.valor_total.leido) {
    lineas.push('💰 Valor: *$' + Number(ocr.valor_total.valor).toLocaleString('es-CO') + '*');
  }
  if (ocr.kilometraje && ocr.kilometraje.leido && sesion.kilometraje) {
    var kmFacturaOk = Math.abs(parseInt(ocr.kilometraje.valor, 10) - sesion.kilometraje) <= 50;
    lineas.push('🛣 Km factura: *' + Number(ocr.kilometraje.valor).toLocaleString('es-CO') + '* ' + (kmFacturaOk ? '✓' : ''));
  }

  lineas.push('');
  lineas.push('1️⃣ Confirmar');
  lineas.push('2️⃣ Corregir un dato');
  lineas.push('\n0️⃣ _Atrás_  •  9️⃣ _Menú principal_');

  return lineas.join('\n');
}

/**
 * Resumen OCR parcial — Camino B (tier 2, algunos campos con ⚠️).
 * @param {Object} sesion
 */
function resumenOcrParcial(sesion) {
  var lineas = [];
  lineas.push('─────────────────');
  lineas.push('⛽ *RESUMEN DEL TANQUEO*');
  lineas.push('─────────────────');

  var ocr = sesion.datosOcrFactura || {};

  var factura = ocr.factura_numero && ocr.factura_numero.leido ? ocr.factura_numero.valor : null;
  lineas.push('🧾 Remisión: *' + (factura || '⚠️ no leída') + '*');

  if (sesion.placa) {
    lineas.push('🚗 Placa: *' + sesion.placa + '*');
  }

  var producto = ocr.producto && ocr.producto.leido ? ocr.producto.valor : null;
  lineas.push('⛽ Combustible: *' + (producto || '⚠️ no leído') + '*');

  var cantidadVal = sesion.cantidadManual != null ? sesion.cantidadManual
    : (ocr.cantidad && ocr.cantidad.leido ? ocr.cantidad.valor : null);
  var unidad = sesion.unidadMedida || 'litros';
  lineas.push('🔢 Cantidad: *' + (cantidadVal != null ? cantidadVal + ' ' + unidad : '⚠️ no leída') + '*');

  var valorOk = ocr.valor_total && ocr.valor_total.leido;
  if (valorOk) {
    lineas.push('💰 Valor: *$' + Number(ocr.valor_total.valor).toLocaleString('es-CO') + '*');
  } else {
    lineas.push('💰 Valor: *⚠️ no leído*');
  }

  if (sesion.facturaNumeroManual) {
    lineas.push('');
    lineas.push('_Factura corregida manualmente._');
  }

  lineas.push('');
  lineas.push('_Los campos ⚠️ los revisa el administrador._');
  lineas.push('');
  lineas.push('1️⃣ Confirmar así');
  lineas.push('2️⃣ Corregir un dato');
  lineas.push('\n0️⃣ _Atrás_  •  9️⃣ _Menú principal_');

  return lineas.join('\n');
}

/**
 * Fallback cuando OCR score < 0.5 (tier 3).
 * Opciones: otra foto / manual / foto tablero.
 */
function fallbackFactura() {
  return (
    '📸 No pude leer bien la factura 😕\n\n' +
    '1️⃣ Enviar otra foto de la factura\n' +
    '2️⃣ Ingresar manualmente\n' +
    '3️⃣ Enviar foto del tablero (sin factura)\n\n' +
    '0️⃣ _Atrás_  •  9️⃣ _Menú principal_'
  );
}

/**
 * Solicitar foto del tablero de combustible (camino D — sin factura física).
 */
function solicitarFotoTablero() {
  return (
    '📸 *Foto del tablero de combustible*\n' +
    'Envía el tablero donde se vea el nivel de gasolina.\n\n' +
    '0️⃣ _Atrás_  •  9️⃣ _Menú principal_'
  );
}

/**
 * Solicitar solo el número de factura (fallback manual — camino C).
 */
function solicitarFacturaManualSimple() {
  return (
    '🧾 *Número de factura o remisión*\n' +
    'Escribe el número que aparece en el recibo.\n' +
    'Ejemplo: *01817613*\n\n' +
    '0️⃣ _Atrás_  •  9️⃣ _Menú principal_'
  );
}

/**
 * Solicitar solo la cantidad de combustible.
 */
function solicitarCantidadManual() {
  return (
    '🔢 *Cantidad de combustible*\n' +
    'Escribe la cantidad.\n' +
    'Ejemplos: *45*  ·  *45.5*  ·  *9.759 gal*\n\n' +
    '0️⃣ _Atrás_  •  9️⃣ _Menú principal_'
  );
}

/**
 * Confirmación de tanqueo guardado — Camino A (auto_validado).
 * @param {Object} tanqueo — registro guardado en BD
 */
function tanqueoGuardadoAutoValidado(t) {
  var km = t && t.kilometraje ? t.kilometraje.toLocaleString('es-CO') : '—';
  var cantidad = t && t.cantidad ? t.cantidad : '—';
  var unidad = t && t.unidad_medida ? t.unidad_medida : '';
  var valor = t && t.valor_total
    ? '$' + Number(t.valor_total).toLocaleString('es-CO')
    : '—';
  var placa = t && t.vehiculo_placa ? t.vehiculo_placa : '—';

  return (
    '───────────────\n' +
    '✅ TANQUEO REGISTRADO\n' +
    '───────────────\n' +
    '🚗 ' + placa + '  •  📏 ' + km + ' km\n' +
    '⛽ ' + cantidad + ' ' + unidad + '  •  💰 ' + valor + '\n\n' +
    '_✓ Validación automática: todos los datos coinciden._\n\n' +
    'Escribe 9️⃣ para volver al menú.'
  );
}

/**
 * Confirmación de tanqueo guardado — Caminos B, C, D (pendiente_revision).
 * @param {Object} tanqueo — registro guardado en BD
 * @param {boolean} sinFactura — true si fue camino D (foto tablero)
 */
function tanqueoGuardadoPendiente(tanqueo, sinFactura) {
  var msg = '✅ *Tanqueo registrado*\n';
  msg += tanqueo.vehiculo_placa + '  •  ';
  msg += (tanqueo.kilometraje || 0).toLocaleString('es-CO') + ' km\n';
  if (tanqueo.valor_total) {
    msg += '$' + Number(tanqueo.valor_total).toLocaleString('es-CO') + '\n';
  }
  msg += '\n';
  if (sinFactura) {
    msg += '_🔴 Sin factura — requiere revisión del administrador._';
  } else {
    msg += '_⚠️ Pendiente de revisión por el administrador._';
  }
  msg += '\n\nEscribe 9 para volver al menú.';
  return msg;
}

module.exports = {
  faltaFotoRecibo:                faltaFotoRecibo,
  inicio:                         inicio,
  solicitarFotoPlaca:             solicitarFotoPlaca,
  confirmarPlacaOcr:              confirmarPlacaOcr,
  solicitarPlacaManual:           solicitarPlacaManual,
  confirmarPlacaSugerida:         confirmarPlacaSugerida,
  fallbackPlaca:                  fallbackPlaca,
  escribePlacaSinEspacios:        escribePlacaSinEspacios,
  formatoPlacaEstandarInvalido:   formatoPlacaEstandarInvalido,
  solicitarFotoOdometro:          solicitarFotoOdometro,
  confirmarKmOcr:                 confirmarKmOcr,
  alertaKmFueraRango:             alertaKmFueraRango,
  solicitarKmManual:              solicitarKmManual,
  solicitarFotoFactura:           solicitarFotoFactura,
  leyendoFactura:                 leyendoFactura,
  resumenOcrCompleto:             resumenOcrCompleto,
  resumenOcrParcial:              resumenOcrParcial,
  fallbackFactura:                fallbackFactura,
  solicitarFotoTablero:           solicitarFotoTablero,
  solicitarFacturaManualSimple:   solicitarFacturaManualSimple,
  solicitarCantidadManual:        solicitarCantidadManual,
  tanqueoGuardadoAutoValidado:    tanqueoGuardadoAutoValidado,
  tanqueoGuardadoPendiente:       tanqueoGuardadoPendiente,
  vehiculoNoEncontrado:           vehiculoNoEncontrado,
  vehiculoBloqueado:              vehiculoBloqueado,
  placaConfirmadaPrefijo:         placaConfirmadaPrefijo,
  placaRegistradaPrefijo:         placaRegistradaPrefijo,
  promptConfirmacionPlacaInvalida: promptConfirmacionPlacaInvalida,
  promptConfirmacionKmInvalida:   promptConfirmacionKmInvalida,
  kilometrajeConfirmadoPrefijo:   kilometrajeConfirmadoPrefijo,
  kilometrajeRegistradoPrefijo:   kilometrajeRegistradoPrefijo,
  placaManualInvalida:            placaManualInvalida,
  kmManualInvalido:               kmManualInvalido,
  errorGenericoTanqueo:           errorGenericoTanqueo
};
