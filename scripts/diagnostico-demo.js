#!/usr/bin/env node
'use strict';

/**
 * scripts/diagnostico-demo.js
 *
 * Diagnóstico completo previo a una demo. UN solo comando.
 *
 *   node scripts/diagnostico-demo.js
 *
 * Qué hace (todo desde tu máquina, nada sale a terceros):
 *   1. Revisa que las variables de entorno estén completas y coherentes.
 *   2. Comprueba que la app en Railway responde.
 *   3. Consulta el estado del WhatsApp sender en la API de Twilio.
 *   4. Envía al webhook de PRODUCCIÓN un mensaje firmado igual que lo
 *      haría Twilio, y muestra la respuesta. Prueba la cadena entera
 *      (firma → Express → sesiones → Supabase) sin usar el celular.
 *   5. Lanza scripts/verificar-demo.js sobre la base de datos.
 *
 * SEGURIDAD: nunca imprime tokens ni claves. La salida es apta para pegar.
 * El mensaje que envía es "9" (volver al menú), que solo borra la sesión
 * del número indicado. No crea ni modifica registros.
 */

try { require('dotenv').config(); } catch (e) { /* dotenv es opcional */ }

var twilio = require('twilio');
var https = require('https');
var http = require('http');
var { URL } = require('url');
var { spawnSync } = require('child_process');

var args = process.argv.slice(2);
function arg(n) { var i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : null; }

var problemas = [];
var avisos = [];

function ok(m) { console.log('  OK    ' + m); }
function mal(m) { console.log('  FALLA ' + m); problemas.push(m); }
function ojo(m) { console.log('  AVISO ' + m); avisos.push(m); }
function titulo(t) { console.log('\n== ' + t + ' ' + '='.repeat(Math.max(0, 56 - t.length))); }
function enmascarar(v) {
  if (!v) return '(vacío)';
  var s = String(v);
  if (s.length <= 8) return s.slice(0, 2) + '***';
  return s.slice(0, 4) + '***' + s.slice(-4) + ' (' + s.length + ' chars)';
}

// ── Variables ────────────────────────────────────────────────────────────────
var ENV = {
  SUPABASE_URL: (process.env.SUPABASE_URL || '').trim(),
  SUPABASE_KEY: (process.env.SUPABASE_KEY || '').trim(),
  TWILIO_ACCOUNT_SID: (process.env.TWILIO_ACCOUNT_SID || '').trim(),
  TWILIO_AUTH_TOKEN: (process.env.TWILIO_AUTH_TOKEN || '').trim(),
  TWILIO_WHATSAPP_NUMBER: (process.env.TWILIO_WHATSAPP_NUMBER || '').trim(),
  TWILIO_WEBHOOK_URL: (process.env.TWILIO_WEBHOOK_URL || '').trim(),
  GOOGLE_API_KEY: (process.env.GOOGLE_API_KEY || '').trim(),
  JWT_SECRET: (process.env.JWT_SECRET || '').trim(),
  MAX_KM_SALTO: (process.env.MAX_KM_SALTO || '').trim()
};

var URL_APP = arg('url') || 'https://cero-production.up.railway.app';
var URL_WEBHOOK = URL_APP.replace(/\/+$/, '') + '/webhook';
var TELEFONO = arg('telefono') || null;

function pedir(url, opciones, cuerpo) {
  return new Promise(function (resolver) {
    var u = new URL(url);
    var lib = u.protocol === 'http:' ? http : https;
    var req = lib.request({
      hostname: u.hostname,
      port: u.port || (u.protocol === 'http:' ? 80 : 443),
      path: u.pathname + u.search,
      method: (opciones && opciones.method) || 'GET',
      headers: (opciones && opciones.headers) || {},
      timeout: 20000
    }, function (res) {
      var datos = '';
      res.on('data', function (d) { datos += d; });
      res.on('end', function () { resolver({ status: res.statusCode, body: datos, headers: res.headers }); });
    });
    req.on('timeout', function () { req.destroy(); resolver({ error: 'timeout tras 20s' }); });
    req.on('error', function (e) { resolver({ error: e.message }); });
    if (cuerpo) req.write(cuerpo);
    req.end();
  });
}

async function main() {
  console.log('\nCERO — diagnóstico previo a demo');
  console.log('Fecha: ' + new Date().toISOString());
  console.log('App:   ' + URL_APP);

  // ─────────────────────────────────────────────────────────────────────────
  titulo('1. Variables de entorno');

  var REQUERIDAS = ['SUPABASE_URL', 'SUPABASE_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'GOOGLE_API_KEY', 'JWT_SECRET'];
  REQUERIDAS.forEach(function (k) {
    if (!ENV[k]) mal('Falta ' + k + ' — config.js hace process.exit(1) al arrancar sin ella');
    else ok(k + ' = ' + enmascarar(ENV[k]));
  });

  if (ENV.TWILIO_WHATSAPP_NUMBER) {
    ok('TWILIO_WHATSAPP_NUMBER = ' + ENV.TWILIO_WHATSAPP_NUMBER);
    if (ENV.TWILIO_WHATSAPP_NUMBER.indexOf('14155238886') >= 0) {
      ojo('Es el número del SANDBOX de Twilio — cada tester debe enviar "join <código>" primero');
    }
    if (ENV.TWILIO_WHATSAPP_NUMBER.indexOf('whatsapp:') !== 0) {
      mal('TWILIO_WHATSAPP_NUMBER debe empezar por "whatsapp:" — Twilio rechaza el envío si no');
    }
  } else {
    ojo('TWILIO_WHATSAPP_NUMBER vacío → usa el sandbox por defecto (whatsapp:+14155238886)');
  }

  // La trampa silenciosa: URL de firma distinta de la real
  if (ENV.TWILIO_WEBHOOK_URL) {
    ok('TWILIO_WEBHOOK_URL = ' + ENV.TWILIO_WEBHOOK_URL);
    if (ENV.TWILIO_WEBHOOK_URL !== URL_WEBHOOK) {
      mal('TWILIO_WEBHOOK_URL ("' + ENV.TWILIO_WEBHOOK_URL + '") NO coincide con el webhook real ("' +
          URL_WEBHOOK + '"). La firma no va a validar y el servidor responderá 403 a todos los mensajes.');
    } else {
      ok('Coincide exactamente con el webhook configurado en Twilio');
    }
  } else {
    ok('TWILIO_WEBHOOK_URL sin definir — la URL se arma desde los headers (correcto en Railway)');
  }

  if (ENV.MAX_KM_SALTO) {
    ok('MAX_KM_SALTO = ' + ENV.MAX_KM_SALTO + ' km');
  } else {
    ojo('MAX_KM_SALTO sin definir → 200 km. Si el kilometraje guardado está desactualizado, ' +
        'el flujo desvía al conductor por la rama de corrección manual.');
  }

  if (String(process.env.DISABLE_TWILIO_SIGNATURE_VALIDATION || '').toLowerCase() === 'true') {
    ojo('DISABLE_TWILIO_SIGNATURE_VALIDATION=true — en producción se ignora y bloquea igual');
  }

  // ─────────────────────────────────────────────────────────────────────────
  titulo('2. La app responde');

  var raiz = await pedir(URL_APP);
  if (raiz.error) {
    mal('No se pudo alcanzar ' + URL_APP + ': ' + raiz.error);
  } else if (raiz.status >= 500) {
    mal('La app respondió ' + raiz.status + ' en la raíz');
  } else {
    ok('GET / → ' + raiz.status);
  }

  var login = await pedir(URL_APP.replace(/\/+$/, '') + '/login');
  if (!login.error) ok('GET /login → ' + login.status);

  // ─────────────────────────────────────────────────────────────────────────
  titulo('3. Twilio — estado del sender');

  if (!ENV.TWILIO_ACCOUNT_SID || !ENV.TWILIO_AUTH_TOKEN) {
    ojo('Sin credenciales de Twilio no se puede consultar el estado del sender');
  } else {
    var auth = 'Basic ' + Buffer.from(ENV.TWILIO_ACCOUNT_SID + ':' + ENV.TWILIO_AUTH_TOKEN).toString('base64');
    var cuenta = await pedir('https://api.twilio.com/2010-04-01/Accounts/' + ENV.TWILIO_ACCOUNT_SID + '.json',
      { headers: { Authorization: auth } });

    if (cuenta.error) {
      mal('No se pudo consultar la API de Twilio: ' + cuenta.error);
    } else if (cuenta.status === 401) {
      mal('Twilio devolvió 401 — TWILIO_ACCOUNT_SID o TWILIO_AUTH_TOKEN incorrectos. ' +
          'Con esto NINGÚN mensaje sale ni entra.');
    } else if (cuenta.status !== 200) {
      mal('Twilio devolvió ' + cuenta.status + ' al consultar la cuenta');
    } else {
      try {
        var info = JSON.parse(cuenta.body);
        ok('Cuenta Twilio "' + info.friendly_name + '" — estado: ' + info.status);
        if (info.status !== 'active') mal('La cuenta de Twilio NO está activa (' + info.status + ')');
        if (info.type === 'Trial') {
          ojo('Cuenta TRIAL — solo puede enviar a números verificados. Verifica los de la demo en Twilio → Verified Caller IDs.');
        }
      } catch (e) { ojo('Respuesta de Twilio no parseable'); }
    }

    // Últimos mensajes: ¿ha cursado tráfico?
    var msgs = await pedir('https://api.twilio.com/2010-04-01/Accounts/' + ENV.TWILIO_ACCOUNT_SID + '/Messages.json?PageSize=5',
      { headers: { Authorization: auth } });
    if (!msgs.error && msgs.status === 200) {
      try {
        var lista = JSON.parse(msgs.body).messages || [];
        if (!lista.length) {
          ojo('La cuenta no tiene NINGÚN mensaje registrado — nunca ha cursado tráfico');
        } else {
          ok(lista.length + ' mensaje(s) recientes:');
          lista.forEach(function (m) {
            var err = m.error_code ? ('  ERROR ' + m.error_code + ': ' + (m.error_message || '')) : '';
            console.log('        · ' + m.date_sent + ' ' + m.direction + ' ' + m.status + err);
            if (m.error_code === 63016) {
              problemas.push('Error 63016 detectado: mensaje libre fuera de la ventana de 24 h. ' +
                'Las alertas al supervisor fallan si no te escribió en las últimas 24 h.');
            }
            if (m.error_code === 63007) {
              problemas.push('Error 63007: el número "from" no está habilitado como canal de WhatsApp.');
            }
          });
        }
      } catch (e) { ojo('No se pudo leer el historial de mensajes'); }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  titulo('4. Prueba real del webhook (firmada como Twilio)');

  if (!ENV.TWILIO_AUTH_TOKEN) {
    mal('Sin TWILIO_AUTH_TOKEN no se puede firmar la petición de prueba');
  } else {
    var desde = TELEFONO
      ? ('whatsapp:' + String(TELEFONO).replace(/^whatsapp:/, ''))
      : 'whatsapp:+573000000000';

    var params = {
      From: desde,
      To: ENV.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886',
      Body: '9',
      NumMedia: '0',
      MessageSid: 'SMdiagnostico00000000000000000000',
      AccountSid: ENV.TWILIO_ACCOUNT_SID || 'ACdiagnostico'
    };

    var urlFirma = ENV.TWILIO_WEBHOOK_URL || URL_WEBHOOK;
    var firma = twilio.getExpectedTwilioSignature(ENV.TWILIO_AUTH_TOKEN, urlFirma, params);

    var cuerpo = Object.keys(params).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');

    console.log('  Enviando "9" (volver al menú) desde ' + desde);

    var inicio = Date.now();
    var resp = await pedir(URL_WEBHOOK, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(cuerpo),
        'X-Twilio-Signature': firma,
        'User-Agent': 'TwilioProxy/1.1'
      }
    }, cuerpo);
    var ms = Date.now() - inicio;

    if (resp.error) {
      mal('El webhook no respondió: ' + resp.error);
    } else if (resp.status === 403) {
      mal('El webhook respondió 403 Forbidden → la firma NO validó. ' +
          'Causa casi segura: TWILIO_WEBHOOK_URL en Railway no coincide con ' + URL_WEBHOOK +
          ', o el TWILIO_AUTH_TOKEN local es distinto al de Railway.');
    } else if (resp.status !== 200) {
      mal('El webhook respondió ' + resp.status);
      console.log('        ' + String(resp.body).slice(0, 300));
    } else {
      ok('El webhook respondió 200 en ' + ms + ' ms');
      if (ms > 10000) ojo('Tardó ' + ms + ' ms — Twilio corta a los 15 s');
      var m = String(resp.body).match(/<Message>([\s\S]*?)<\/Message>/);
      if (m) {
        console.log('\n  --- Respuesta recibida ---');
        console.log('  ' + m[1].replace(/&apos;/g, "'").replace(/&amp;/g, '&').split('\n').join('\n  '));
        console.log('  --------------------------');
        if (/Preoperacional/i.test(m[1])) ok('Es el menú principal — la cadena completa funciona');
      } else {
        ojo('Respondió 200 pero sin <Message> — revisa el cuerpo:');
        console.log('        ' + String(resp.body).slice(0, 300));
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  titulo('5. Base de datos');

  if (!ENV.SUPABASE_URL || !ENV.SUPABASE_KEY) {
    mal('Sin credenciales de Supabase no se puede verificar la base');
  } else {
    var extra = [];
    if (arg('placa')) extra = extra.concat(['--placa', arg('placa')]);
    if (TELEFONO) extra = extra.concat(['--telefono', TELEFONO]);

    var r = spawnSync(process.execPath, [__dirname + '/verificar-demo.js'].concat(extra), {
      encoding: 'utf8',
      env: Object.assign({}, process.env)
    });
    var salida = (r.stdout || '') + (r.stderr || '');
    // Quitar códigos de color para que se pueda pegar limpio
    // eslint-disable-next-line no-control-regex -- ESC es justo el caracter que hay que quitar
    var SECUENCIA_ANSI = /\u001b\[[0-9;]*m/g;
    console.log(salida.replace(SECUENCIA_ANSI, ''));
    if (r.status !== 0) problemas.push('verificar-demo.js reportó problemas bloqueantes (ver arriba)');
  }

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(64));
  if (!problemas.length && !avisos.length) {
    console.log('  RESULTADO: LISTO — sin problemas detectados.');
  } else if (!problemas.length) {
    console.log('  RESULTADO: LISTO CON AVISOS (' + avisos.length + ')');
    avisos.forEach(function (a, i) { console.log('    ' + (i + 1) + '. ' + a); });
  } else {
    console.log('  RESULTADO: NO LISTO — ' + problemas.length + ' bloqueante(s)');
    problemas.forEach(function (p, i) { console.log('    ' + (i + 1) + '. ' + p); });
    if (avisos.length) {
      console.log('\n  Avisos (' + avisos.length + '):');
      avisos.forEach(function (a, i) { console.log('    ' + (i + 1) + '. ' + a); });
    }
  }
  console.log('='.repeat(64) + '\n');
}

main().catch(function (e) {
  console.error('\nError inesperado:', e && (e.stack || e.message || e));
  process.exit(1);
});
