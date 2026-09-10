#!/usr/bin/env node
/**
 * scripts/verificar-arquitectura.js
 *
 * Fitness function del canon. Convierte docs/canon/CERO_ARCHITECTURE_RULES.md
 * en una verificación ejecutable: si el código contradice el canon, esto falla.
 *
 * Estrategia RATCHET (trinquete):
 *   - DEUDA_ACEPTADA lista las violaciones que ya existen hoy.
 *   - El script NO falla por ellas, pero SÍ falla si aparece una nueva.
 *   - Cada vez que se corrige una, se borra de la lista. La lista solo baja.
 *
 * Uso:
 *   node scripts/verificar-arquitectura.js          → falla si hay violaciones nuevas
 *   node scripts/verificar-arquitectura.js --todo   → muestra también la deuda aceptada
 *   node scripts/verificar-arquitectura.js --baseline → regenera DEUDA_ACEPTADA
 *
 * CERO — Gestión de Operaciones de Campo
 */

'use strict';

var fs = require('fs');
var path = require('path');

var RAIZ = path.resolve(__dirname, '..');

// ═══════════════════════════════════════════════════════════════════════════
// REGLA 1 — Dirección permitida de dependencias (canon §5)
// ═══════════════════════════════════════════════════════════════════════════

var CAPAS = ['rutas', 'data', 'modulos', 'servicios', 'canales', 'middlewares', 'config'];

var PERMITIDO = {
  rutas:       ['data', 'servicios', 'middlewares', 'config'],
  canales:     ['modulos', 'servicios', 'config'],
  modulos:     ['data', 'servicios', 'config', 'modulos'],
  servicios:   ['config', 'servicios'],
  data:        ['config', 'data'],
  middlewares: ['data', 'config'],
  config:      []
};

// ═══════════════════════════════════════════════════════════════════════════
// REGLA 2 — El cliente Supabase solo vive en data/, config/ y servicios/storage.js
// ═══════════════════════════════════════════════════════════════════════════

var SUPABASE_PERMITIDO = function (rel) {
  return rel.startsWith('data/') ||
         rel.startsWith('config/') ||
         rel === 'servicios/storage.js' ||
         rel === 'servicios/tenantScope.js';   // constructor de queries, no acceso crudo
};

// ═══════════════════════════════════════════════════════════════════════════
// REGLA 3 — data/ y servicios/ no tocan HTTP (req/res)
// ═══════════════════════════════════════════════════════════════════════════

var SIN_HTTP = ['data/', 'servicios/'];
var EXENTOS_HTTP = ['servicios/pdf/entrega.js'];

// ═══════════════════════════════════════════════════════════════════════════
// REGLA 4 — Tamaño máximo de archivo (proxy de SRP)
// ═══════════════════════════════════════════════════════════════════════════

var MAX_LINEAS = 400;

// ═══════════════════════════════════════════════════════════════════════════
// DEUDA ACEPTADA — congelada el 2026-09-10. Solo puede reducirse.
// Formato: 'REGLA|archivo|detalle'
// ═══════════════════════════════════════════════════════════════════════════

var DEUDA_ACEPTADA = [
  'SUPABASE|rutas/activos.js|',
  'DEP|data/activos.js|modulos/inspecciones/preoperacional/validaciones',
  'DEP|data/activos.js|servicios/tenantScope',
  'DEP|data/alertas.js|servicios/tenantScope',
  'DEP|data/autorizaciones.js|modulos/alertas/notificador',
  'DEP|data/autorizaciones.js|servicios/tenantScope',
  'TAMANO|data/autorizaciones.js|',
  'DEP|data/conductores.js|servicios/tenantScope',
  'TAMANO|data/dashboard.js|',
  'DEP|data/inspecciones.js|servicios/tenantScope',
  'DEP|data/plantillas.js|servicios/tenantScope',
  'DEP|data/tanqueos.js|servicios/tenantScope',
  'TAMANO|data/tanqueos.js|',
  'TAMANO|modulos/inspecciones/compartido/baseFlujo.js|',
  'TAMANO|modulos/inspecciones/compartido/kilometraje.js|',
  'TAMANO|modulos/inspecciones/posoperacional/flujo.js|',
  'TAMANO|modulos/inspecciones/preoperacional/flujo.js|',
  'TAMANO|modulos/tanqueo/flujo.js|',
  'TAMANO|modulos/tanqueo/mensajes.js|',
  'DEP|servicios/ocr.js|modulos/inspecciones/compartido/interpretadorNovedades',
  'TAMANO|servicios/ocr.js|',
  'TAMANO|servicios/pdf/GeneradorPDFBase.js|',
  'DEP|servicios/pdf/GeneradorPDFPreoperacional.js|modulos/inspecciones/preoperacional/validaciones',
  'SUPABASE|servicios/pdf/posoperacional.js|',
  'DEP|servicios/plantillas.js|data/plantillas',
  'HTTP|servicios/storage.js|',
  'HTTP|servicios/tenantScope.js|',
  'DEP|canales/dashboard.js|data/alertas',
  'DEP|canales/dashboard.js|middlewares/auth',
  'SUPABASE|canales/dashboard.js|',
  'DEP|canales/whatsapp.js|data/activos',
  'SUPABASE|middlewares/auth.js|',
];

// ═══════════════════════════════════════════════════════════════════════════
// MOTOR
// ═══════════════════════════════════════════════════════════════════════════

function listarArchivos(dir, acc) {
  acc = acc || [];
  if (!fs.existsSync(dir)) return acc;
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    var p = path.join(dir, e.name);
    if (e.isDirectory()) listarArchivos(p, acc);
    else if (e.name.endsWith('.js')) acc.push(p);
  });
  return acc;
}

function rel(p) {
  return path.relative(RAIZ, p).split(path.sep).join('/');
}

function capaDe(relPath) {
  var primera = relPath.split('/')[0];
  return CAPAS.indexOf(primera) !== -1 ? primera : null;
}

function analizar() {
  var hallazgos = [];
  var archivos = [];
  CAPAS.forEach(function (c) { listarArchivos(path.join(RAIZ, c), archivos); });

  archivos.forEach(function (abs) {
    var r = rel(abs);
    var capa = capaDe(r);
    var src = fs.readFileSync(abs, 'utf8');
    var lineas = src.split('\n');

    // --- REGLA 1: dirección de dependencias ---
    var re = /require\(\s*['"](\.[^'"]+)['"]\s*\)/g;
    var m;
    while ((m = re.exec(src))) {
      var destinoAbs = path.resolve(path.dirname(abs), m[1]);
      var destinoRel = rel(destinoAbs).replace(/\.js$/, '');
      var capaDestino = capaDe(destinoRel);
      if (!capaDestino || capaDestino === capa) {
        if (capaDestino !== capa) continue;
      }
      if (capaDestino && PERMITIDO[capa] && PERMITIDO[capa].indexOf(capaDestino) === -1) {
        var linea = src.slice(0, m.index).split('\n').length;
        hallazgos.push({
          regla: 'DEP',
          archivo: r,
          detalle: destinoRel,
          linea: linea,
          texto: capa + '/ no puede importar de ' + capaDestino + '/  →  ' + destinoRel
        });
      }
    }

    // --- REGLA 2: cliente Supabase fuera de sitio ---
    if (!SUPABASE_PERMITIDO(r) && /(?<!Buffer)\.from\(\s*['"`]|createClient\(/.test(src)) {
      hallazgos.push({
        regla: 'SUPABASE',
        archivo: r,
        detalle: '',
        linea: lineas.findIndex(function (l) { return /(?<!Buffer)\.from\(\s*['"`]|createClient\(/.test(l); }) + 1,
        texto: 'acceso directo a Supabase fuera de data/'
      });
    }

    // --- REGLA 3: HTTP en data/ y servicios/ ---
    var enCapaSinHttp = SIN_HTTP.some(function (p) { return r.startsWith(p); });
    if (enCapaSinHttp && EXENTOS_HTTP.indexOf(r) === -1) {
      var usaHttp = /\breq\.body\b|\breq\.params\b|\breq\.query\b|\bres\.json\(|\bres\.status\(|\bres\.send\(/.test(src);
      if (usaHttp) {
        hallazgos.push({
          regla: 'HTTP',
          archivo: r,
          detalle: '',
          linea: lineas.findIndex(function (l) { return /\breq\.|\bres\./.test(l); }) + 1,
          texto: 'conoce el transporte HTTP (req/res) — debe recibir datos, no requests'
        });
      }
    }

    // --- REGLA 4: tamaño ---
    if (lineas.length > MAX_LINEAS) {
      hallazgos.push({
        regla: 'TAMANO',
        archivo: r,
        detalle: '',
        linea: 1,
        texto: lineas.length + ' líneas (máximo ' + MAX_LINEAS + ') — candidato a dividir'
      });
    }
  });

  return hallazgos;
}

function clave(h) {
  return h.regla + '|' + h.archivo + '|' + h.detalle;
}

// ═══════════════════════════════════════════════════════════════════════════
// SALIDA
// ═══════════════════════════════════════════════════════════════════════════

var args = process.argv.slice(2);
var hallazgos = analizar();

// Deduplicar por clave (un archivo con 3 imports malos al mismo destino = 1)
var vistos = {};
hallazgos = hallazgos.filter(function (h) {
  var k = clave(h);
  if (vistos[k]) return false;
  vistos[k] = true;
  return true;
});

if (args.indexOf('--baseline') !== -1) {
  console.log('Pega esto en DEUDA_ACEPTADA:\n');
  hallazgos.forEach(function (h) { console.log("  '" + clave(h) + "',"); });
  process.exit(0);
}

var aceptadas = {};
DEUDA_ACEPTADA.forEach(function (d) { aceptadas[d] = true; });

var nuevas = hallazgos.filter(function (h) { return !aceptadas[clave(h)]; });
var conocidas = hallazgos.filter(function (h) { return aceptadas[clave(h)]; });
var corregidas = DEUDA_ACEPTADA.filter(function (d) { return !vistos[d]; });

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  CERO — Verificación de arquitectura contra el canon          ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

if (args.indexOf('--todo') !== -1 && conocidas.length) {
  console.log('DEUDA ACEPTADA (' + conocidas.length + ') — no rompe el build:\n');
  conocidas.forEach(function (h) {
    console.log('  · [' + h.regla + '] ' + h.archivo + ':' + h.linea + ' — ' + h.texto);
  });
  console.log('');
}

if (corregidas.length) {
  console.log('✅ DEUDA SALDADA (' + corregidas.length + ') — bórrala de DEUDA_ACEPTADA:\n');
  corregidas.forEach(function (d) { console.log('  · ' + d); });
  console.log('');
}

if (nuevas.length) {
  console.log('❌ VIOLACIONES NUEVAS (' + nuevas.length + '):\n');
  nuevas.forEach(function (h) {
    console.log('  · [' + h.regla + '] ' + h.archivo + ':' + h.linea);
    console.log('        ' + h.texto);
  });
  console.log('\nCanon: docs/canon/CERO_ARCHITECTURE_RULES.md §5');
  console.log('Si la violación es deliberada, registra un ADR en docs/adr/ y añádela a DEUDA_ACEPTADA.\n');
  process.exit(1);
}

console.log('✓ Sin violaciones nuevas.');
console.log('  Deuda aceptada pendiente: ' + conocidas.length + ' (usa --todo para verla)\n');
process.exit(0);
