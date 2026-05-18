/**
 * test-flujos.js — Pruebas de carga y estructura de los flujos WhatsApp.
 * Verifica que todos los módulos refactorizados cargan correctamente,
 * exportan las funciones esperadas, y que la clase base está bien configurada.
 *
 * Uso: node scripts/test-flujos.js
 * CERO — Gestión de Operaciones de Campo
 */

'use strict';

// ── Setup de variables de entorno mock ──
process.env.GOOGLE_API_KEY    = process.env.GOOGLE_API_KEY    || 'test-key';
process.env.SUPABASE_URL      = process.env.SUPABASE_URL      || 'https://test.supabase.co';
process.env.SUPABASE_KEY      = process.env.SUPABASE_KEY      || 'test-key';
process.env.TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || 'ACtest12345678901234567890123456';
process.env.TWILIO_AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN  || 'test12345678901234567890123456';
process.env.JWT_SECRET         = process.env.JWT_SECRET         || 'test-jwt-secret';
process.env.DISABLE_TWILIO_SIGNATURE_VALIDATION = 'true';

var ok = 0;
var fail = 0;
var total = 0;

function test(nombre, fn) {
  total++;
  try {
    fn();
    ok++;
    console.log('  \u2705 ' + nombre);
  } catch (e) {
    fail++;
    console.log('  \u274c ' + nombre + ' — ' + e.message);
  }
}

function assert(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje || 'Assertion failed');
}

console.log('\n\u2550\u2550\u2550 Test Flujos WhatsApp \u2550\u2550\u2550\n');

// ── 1. Módulo compartido: twiml ──
console.log('1. compartido/twiml.js');
var twiml = require('../modulos/inspecciones/compartido/twiml');

test('exporta responderTwiml', function() {
  assert(typeof twiml.responderTwiml === 'function');
});

test('exporta escaparXml', function() {
  assert(typeof twiml.escaparXml === 'function');
});

test('exporta firmaTwilioValida', function() {
  assert(typeof twiml.firmaTwilioValida === 'function');
});

test('escaparXml funciona correctamente', function() {
  assert(twiml.escaparXml('<test&"foo">') === '&lt;test&amp;&quot;foo&quot;&gt;');
});

// ── 2. Módulo compartido: baseFlujo ──
console.log('\n2. compartido/baseFlujo.js');
var FlujoBase = require('../modulos/inspecciones/compartido/baseFlujo');

test('exporta constructor FlujoBase', function() {
  assert(typeof FlujoBase === 'function');
});

test('FlujoBase tiene prototype.manejar', function() {
  assert(typeof FlujoBase.prototype.manejar === 'function');
});

test('FlujoBase tiene prototype.procesarEstadoCompartido', function() {
  assert(typeof FlujoBase.prototype.procesarEstadoCompartido === 'function');
});

// ── 3. Módulo compartido: navegación ──
console.log('\n3. compartido/navegacion.js');
var nav = require('../modulos/inspecciones/compartido/navegacion');

test('exporta textoMenuPrincipal', function() {
  assert(typeof nav.textoMenuPrincipal === 'function');
  assert(nav.textoMenuPrincipal().indexOf('CERO') >= 0);
});

test('esAtras detecta 0', function() {
  assert(nav.esAtras('0') === true);
  assert(nav.esAtras('ATRAS') === true);
  assert(nav.esAtras('5') === false);
});

test('esMenu detecta 9', function() {
  assert(nav.esMenu('9') === true);
  assert(nav.esMenu('MENU') === true);
  assert(nav.esMenu('3') === false);
});

// ── 4. Tanqueo ──
console.log('\n4. tanqueo/flujo.js');
var tanqueo = require('../modulos/tanqueo/flujo');

test('exporta manejarTanqueo', function() {
  assert(typeof tanqueo.manejarTanqueo === 'function');
});

test('exporta manejar (alias unificado)', function() {
  assert(typeof tanqueo.manejar === 'function');
});

test('exporta ESTADOS', function() {
  assert(tanqueo.ESTADOS && typeof tanqueo.ESTADOS === 'object');
  assert(tanqueo.ESTADOS.INICIO === 'TANQUEO_INICIO');
  assert(tanqueo.ESTADOS.ESPERANDO_FOTO_PLACA === 'TANQUEO_ESPERANDO_FOTO_PLACA');
});

// ── 5. Posoperacional ──
console.log('\n5. posoperacional/flujo.js');
var posop = require('../modulos/inspecciones/posoperacional/flujo');

test('exporta manejarPosoperacional', function() {
  assert(typeof posop.manejarPosoperacional === 'function');
});

test('exporta manejar (alias unificado)', function() {
  assert(typeof posop.manejar === 'function');
});

test('exporta ESTADOS', function() {
  assert(posop.ESTADOS && typeof posop.ESTADOS === 'object');
  assert(posop.ESTADOS.INICIO === 'POSOP_INICIO');
});

// ── 6. Preoperacional ──
console.log('\n6. preoperacional/flujo.js');
var preop = require('../modulos/inspecciones/preoperacional/flujo');

test('exporta manejarPreoperacional', function() {
  assert(typeof preop.manejarPreoperacional === 'function');
});

test('exporta manejar (alias unificado)', function() {
  assert(typeof preop.manejar === 'function');
});

test('exporta registrarPreoperacional', function() {
  assert(typeof preop.registrarPreoperacional === 'function');
});

// ── 7. Validaciones sin duplicados ──
console.log('\n7. Validaciones sin TwiML duplicado');
var valTanqueo = require('../modulos/tanqueo/validaciones');
var valPosop   = require('../modulos/inspecciones/posoperacional/validaciones');
var valPreop   = require('../modulos/inspecciones/preoperacional/validaciones');

test('tanqueo/validaciones usa twiml compartido', function() {
  assert(typeof valTanqueo.responderTwiml === 'function');
  assert(valTanqueo.responderTwiml === twiml.responderTwiml);
});

test('posoperacional/validaciones usa twiml compartido', function() {
  assert(typeof valPosop.responderTwiml === 'function');
  assert(valPosop.responderTwiml === twiml.responderTwiml);
});

test('preoperacional/validaciones usa twiml compartido', function() {
  assert(typeof valPreop.responderTwiml === 'function');
  assert(valPreop.responderTwiml === twiml.responderTwiml);
});

// ── 8. whatsapp.js ──
console.log('\n8. canales/whatsapp.js');
var whatsapp = require('../canales/whatsapp');

test('exporta registrarCanalWhatsapp', function() {
  assert(typeof whatsapp.registrarCanalWhatsapp === 'function');
});

test('exporta webhookWhatsApp', function() {
  assert(typeof whatsapp.webhookWhatsApp === 'function');
});

// ── Resultado ──
console.log('\n\u2550\u2550\u2550 Resultado \u2550\u2550\u2550');
console.log('Total: ' + total + '  |  \u2705 ' + ok + '  |  \u274c ' + fail);
if (fail > 0) {
  console.log('\n\u26a0\ufe0f Hay tests fallidos!\n');
  process.exit(1);
} else {
  console.log('\n\u2705 Todos los tests pasaron!\n');
  process.exit(0);
}
