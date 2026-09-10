#!/usr/bin/env node
'use strict';

/**
 * scripts/verificar-demo.js
 *
 * Verifica que la base de datos esté lista para una demo del preoperacional.
 * SOLO LECTURA — no escribe, no modifica, no borra nada.
 *
 * Recorre exactamente las mismas condiciones que el flujo de WhatsApp exige
 * en tiempo real, y falla donde el conductor fallaría.
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_KEY=... node scripts/verificar-demo.js
 *   node scripts/verificar-demo.js --placa IDL354 --telefono +573001112233
 */

var { createClient } = require('@supabase/supabase-js');

// ── Argumentos ───────────────────────────────────────────────────────────────
var args = process.argv.slice(2);
function arg(nombre) {
  var i = args.indexOf('--' + nombre);
  return i >= 0 ? args[i + 1] : null;
}
var PLACA_OBJETIVO = arg('placa');
var TELEFONO_OBJETIVO = arg('telefono');

var SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
var SUPABASE_KEY = (process.env.SUPABASE_KEY || '').trim();

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('\n  Faltan credenciales.\n');
  console.error('  SUPABASE_URL=https://xxx.supabase.co \\');
  console.error('  SUPABASE_KEY=<service_role_key> \\');
  console.error('  node scripts/verificar-demo.js\n');
  process.exit(1);
}

var supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Salida ───────────────────────────────────────────────────────────────────
var problemas = [];
var advertencias = [];

function ok(msg) { console.log('  \x1b[32mOK\x1b[0m    ' + msg); }
function mal(msg) { console.log('  \x1b[31mFALLA\x1b[0m ' + msg); problemas.push(msg); }
function ojo(msg) { console.log('  \x1b[33mAVISO\x1b[0m ' + msg); advertencias.push(msg); }
function titulo(t) { console.log('\n\x1b[1m' + t + '\x1b[0m'); }

function normalizarPlaca(p) {
  return String(p == null ? '' : p)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]/g, '');
}
function normalizarTelefono(v) {
  return String(v || '').replace(/^whatsapp:/i, '').replace(/[^0-9]/g, '').trim();
}

async function main() {
  console.log('\n\x1b[1mCERO — verificación de preparación para demo\x1b[0m');
  console.log('Base: ' + SUPABASE_URL);

  // ─────────────────────────────────────────────────────────────────────────
  titulo('1. Tablas esenciales');

  var TABLAS = [
    'empresas', 'sedes', 'tipos_activo', 'activos', 'conductores',
    'plantillas_inspeccion', 'plantilla_grupos', 'plantilla_items',
    'preoperacionales', 'evidencia', 'sesiones_activas'
  ];

  for (var i = 0; i < TABLAS.length; i++) {
    var t = TABLAS[i];
    var r = await supabase.from(t).select('*', { count: 'exact', head: true });
    if (r.error) {
      mal('Tabla "' + t + '" inaccesible: ' + r.error.message);
    } else {
      ok('Tabla "' + t + '" — ' + (r.count || 0) + ' fila(s)');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  titulo('2. Activos listos para inspección');

  var resActivos = await supabase
    .from('activos')
    .select('id, placa, nombre, tipo_activo_id, empresa_id, sede_id, activo, bloqueado, motivo_bloqueo, kilometraje')
    .not('placa', 'is', null);

  if (resActivos.error) {
    mal('No se pudieron leer los activos: ' + resActivos.error.message);
    return resumen();
  }

  var activos = resActivos.data || [];
  if (!activos.length) {
    mal('No hay NINGÚN activo con placa. El preoperacional no puede arrancar.');
    return resumen();
  }
  ok(activos.length + ' activo(s) con placa registrada');

  // Placas duplicadas — rompen el .single() de cargarActivoYConductor
  var porPlaca = {};
  activos.forEach(function (a) {
    var p = normalizarPlaca(a.placa);
    porPlaca[p] = (porPlaca[p] || []).concat([a]);
  });
  var duplicadas = Object.keys(porPlaca).filter(function (p) { return porPlaca[p].length > 1; });
  if (duplicadas.length) {
    mal('Placas duplicadas: ' + duplicadas.join(', ') +
        ' — cargarActivoYConductor usa .single() sin filtrar empresa y devolverá "Vehículo no encontrado".');
  } else {
    ok('Sin placas duplicadas');
  }

  // Placas mal normalizadas
  var malFormateadas = activos.filter(function (a) { return a.placa !== normalizarPlaca(a.placa); });
  if (malFormateadas.length) {
    mal('Placas con espacios, guiones o minúsculas (el OCR normaliza y NO va a encontrarlas): ' +
        malFormateadas.map(function (a) { return JSON.stringify(a.placa); }).join(', '));
  } else {
    ok('Todas las placas están normalizadas (mayúsculas, sin separadores)');
  }

  var utilizables = activos.filter(function (a) {
    return a.activo !== false && !a.bloqueado && a.tipo_activo_id;
  });

  activos.filter(function (a) { return a.bloqueado; }).forEach(function (a) {
    ojo('Activo ' + a.placa + ' está BLOQUEADO (' + (a.motivo_bloqueo || 'sin motivo') + ') — no permitirá iniciar');
  });
  activos.filter(function (a) { return !a.tipo_activo_id; }).forEach(function (a) {
    mal('Activo ' + a.placa + ' no tiene tipo_activo_id — no se le puede cargar plantilla');
  });
  activos.filter(function (a) { return !a.sede_id; }).forEach(function (a) {
    ojo('Activo ' + a.placa + ' sin sede_id — no aparecerá en el panel y las alertas críticas se enviarán a TODAS las empresas');
  });

  if (!utilizables.length) {
    mal('Ningún activo está en condiciones de iniciar un preoperacional');
  } else {
    ok(utilizables.length + ' activo(s) utilizable(s) para la demo');
  }

  if (PLACA_OBJETIVO) {
    var objetivo = activos.find(function (a) {
      return normalizarPlaca(a.placa) === normalizarPlaca(PLACA_OBJETIVO);
    });
    if (!objetivo) mal('La placa de demo ' + PLACA_OBJETIVO + ' NO existe en activos');
    else if (objetivo.bloqueado) mal('La placa de demo ' + PLACA_OBJETIVO + ' está bloqueada');
    else ok('Placa de demo ' + PLACA_OBJETIVO + ' lista');
  }

  // ─────────────────────────────────────────────────────────────────────────
  titulo('3. Plantillas de preoperacional');

  var combinaciones = {};
  utilizables.forEach(function (a) {
    var clave = a.tipo_activo_id + '|' + (a.empresa_id || 'null');
    if (!combinaciones[clave]) combinaciones[clave] = { tipo: a.tipo_activo_id, empresa: a.empresa_id, placas: [] };
    combinaciones[clave].placas.push(a.placa);
  });

  var claves = Object.keys(combinaciones);
  for (var c = 0; c < claves.length; c++) {
    var combo = combinaciones[claves[c]];
    var etiqueta = 'tipo ' + String(combo.tipo).slice(0, 8) + '… / empresa ' + String(combo.empresa || 'global').slice(0, 8) + '…';

    var rPl = await supabase
      .from('plantillas_inspeccion')
      .select('id, nombre, empresa_id, activa, config')
      .eq('tipo_activo_id', combo.tipo)
      .eq('tipo_inspeccion', 'preoperacional')
      .eq('activa', true);

    if (rPl.error) { mal('Error leyendo plantillas (' + etiqueta + '): ' + rPl.error.message); continue; }

    var plantillas = rPl.data || [];
    var propias = plantillas.filter(function (p) { return p.empresa_id === combo.empresa; });
    var globales = plantillas.filter(function (p) { return p.empresa_id === null; });

    var elegida = null;
    if (propias.length === 1) elegida = propias[0];
    else if (propias.length > 1) {
      mal('HAY ' + propias.length + ' plantillas activas para ' + etiqueta +
          ' — obtenerPlantillaActiva usa .single() y va a fallar. Placas afectadas: ' + combo.placas.join(', '));
      continue;
    } else if (globales.length === 1) {
      elegida = globales[0];
      ojo('Para ' + etiqueta + ' se usará la plantilla GLOBAL "' + elegida.nombre + '"');
    } else if (globales.length > 1) {
      mal('Hay ' + globales.length + ' plantillas globales activas para ' + etiqueta + ' — .single() va a fallar');
      continue;
    }

    if (!elegida) {
      mal('SIN plantilla de preoperacional para ' + etiqueta +
          ' → el flujo se corta tras el odómetro. Placas afectadas: ' + combo.placas.join(', '));
      continue;
    }

    ok('Plantilla "' + elegida.nombre + '" para ' + etiqueta);

    var medicion = (elegida.config && elegida.config.medicion) || 'km';
    if (['km', 'horas', 'ambos', 'ninguna'].indexOf(medicion) < 0) {
      ojo('config.medicion = "' + medicion + '" no reconocido; se tratará como "km"');
    }
    if (medicion === 'horas' || medicion === 'ambos') {
      mal('config.medicion = "' + medicion + '" exige estado ESPERANDO_FOTO_HOROMETRO, que NO está implementado en el flujo. Usa "km" para la demo.');
    }

    // Grupos e ítems
    var rG = await supabase
      .from('plantilla_grupos')
      .select('id, nombre, abreviado, orden, solo_panel')
      .eq('plantilla_id', elegida.id)
      .order('orden', { ascending: true });

    if (rG.error) { mal('Error leyendo grupos: ' + rG.error.message); continue; }

    var grupos = rG.data || [];
    var visibles = grupos.filter(function (g) { return !g.solo_panel; });

    if (!grupos.length) {
      mal('La plantilla "' + elegida.nombre + '" no tiene grupos → el flujo se corta tras el odómetro');
      continue;
    }
    if (!visibles.length) {
      mal('Todos los grupos de "' + elegida.nombre + '" tienen solo_panel = true → el conductor no verá ningún bloque');
      continue;
    }
    ok(visibles.length + ' bloque(s) visible(s) en WhatsApp (de ' + grupos.length + ' totales)');

    var rI = await supabase
      .from('plantilla_items')
      .select('id, grupo_id, nombre, orden, critico, sin_foto, sub_pregunta')
      .in('grupo_id', visibles.map(function (g) { return g.id; }));

    if (rI.error) { mal('Error leyendo ítems: ' + rI.error.message); continue; }

    var items = rI.data || [];
    var sinItems = visibles.filter(function (g) {
      return !items.some(function (it) { return it.grupo_id === g.id; });
    });
    if (sinItems.length) {
      mal('Bloques sin ítems (van a mostrarse vacíos): ' + sinItems.map(function (g) { return g.nombre; }).join(', '));
    } else {
      ok(items.length + ' ítem(s) repartidos en los bloques visibles');
    }

    // Sub-preguntas mal formadas → rompen SUB_PREGUNTA
    items.filter(function (it) { return it.sub_pregunta; }).forEach(function (it) {
      var sp = it.sub_pregunta;
      if (!sp.mensaje || !Array.isArray(sp.opciones) || !sp.opciones.length) {
        mal('El ítem "' + it.nombre + '" tiene sub_pregunta mal formada (falta mensaje u opciones) — rompe el flujo al reportar novedad');
      } else {
        var malas = sp.opciones.filter(function (op) {
          return typeof op.num !== 'number' || !op.texto || !op.severidad;
        });
        if (malas.length) {
          mal('Sub-pregunta de "' + it.nombre + '" con opciones incompletas (num/texto/severidad)');
        }
      }
    });

    var criticos = items.filter(function (it) { return it.critico; }).length;
    if (!criticos) ojo('Ningún ítem crítico en "' + elegida.nombre + '" — la demo no podrá mostrar bloqueo de vehículo');
  }

  // ─────────────────────────────────────────────────────────────────────────
  titulo('4. Conductores');

  var rC = await supabase
    .from('conductores')
    .select('id, nombre, cedula, telefono, sede_id, empresa_id, activo')
    .eq('activo', true);

  if (rC.error) {
    mal('No se pudieron leer los conductores: ' + rC.error.message);
  } else {
    var conductores = rC.data || [];
    if (!conductores.length) {
      ojo('No hay conductores activos. Un número nuevo entrará al flujo de inscripción automática.');
    } else {
      ok(conductores.length + ' conductor(es) activo(s)');
    }

    conductores.filter(function (c) { return !c.telefono; }).forEach(function (c) {
      ojo('Conductor "' + c.nombre + '" sin teléfono — no puede usar WhatsApp');
    });

    var sinSede = conductores.filter(function (c) { return !c.sede_id; });
    if (sinSede.length) {
      ojo(sinSede.length + ' conductor(es) SIN sede_id (' +
          sinSede.slice(0, 3).map(function (c) { return c.nombre; }).join(', ') +
          (sinSede.length > 3 ? '…' : '') +
          ') — NO aparecen en el panel de Conductores. Es el caso de todo el que se inscriba por WhatsApp.');
    }

    // Teléfonos duplicados tras normalizar
    var porTel = {};
    conductores.forEach(function (c) {
      var t = normalizarTelefono(c.telefono);
      if (!t) return;
      porTel[t] = (porTel[t] || []).concat([c.nombre]);
    });
    Object.keys(porTel).forEach(function (t) {
      if (porTel[t].length > 1) {
        ojo('Teléfono ' + t + ' asignado a varios conductores (' + porTel[t].join(', ') +
            ') — buscarConductorPorTelefono devuelve el primero, sin criterio estable');
      }
    });

    if (TELEFONO_OBJETIVO) {
      var objetivoTel = normalizarTelefono(TELEFONO_OBJETIVO);
      var encontrado = conductores.find(function (c) { return normalizarTelefono(c.telefono) === objetivoTel; });
      if (encontrado) ok('El teléfono de demo pertenece a "' + encontrado.nombre + '"');
      else ojo('El teléfono de demo NO está registrado — entrará a inscripción automática (4 pasos antes del preoperacional)');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  titulo('5. Sesiones colgadas de pruebas anteriores');

  var rS = await supabase.from('sesiones_activas').select('telefono, datos');
  if (rS.error) {
    mal('Tabla sesiones_activas inaccesible: ' + rS.error.message +
        ' — sin ella las sesiones no sobreviven a un redeploy de Railway');
  } else {
    var sesiones = rS.data || [];
    if (sesiones.length) {
      ojo(sesiones.length + ' sesión(es) activa(s) en BD. Si un número de la demo tiene una sesión a medias, ' +
          'va a retomar donde quedó. Que cada tester escriba *9* antes de empezar.');
      sesiones.slice(0, 5).forEach(function (s) {
        var d = s.datos || {};
        console.log('        · ' + s.telefono + ' → ' + (d.tipo || 'sin tipo') + ' / ' + (d.estado || 'sin estado'));
      });
    } else {
      ok('Sin sesiones colgadas');
    }
  }

  resumen();
}

function resumen() {
  console.log('\n' + '─'.repeat(64));
  if (problemas.length === 0 && advertencias.length === 0) {
    console.log('\x1b[32m\x1b[1m  LISTO PARA LA DEMO\x1b[0m — sin problemas detectados.');
  } else if (problemas.length === 0) {
    console.log('\x1b[33m\x1b[1m  LISTO CON AVISOS\x1b[0m — ' + advertencias.length + ' punto(s) a tener en cuenta.');
  } else {
    console.log('\x1b[31m\x1b[1m  NO LISTO\x1b[0m — ' + problemas.length + ' problema(s) bloqueante(s):');
    problemas.forEach(function (p, i) { console.log('    ' + (i + 1) + '. ' + p); });
  }
  console.log('─'.repeat(64) + '\n');
  process.exit(problemas.length ? 1 : 0);
}

main().catch(function (e) {
  console.error('\nError inesperado:', e.message || e);
  process.exit(1);
});
