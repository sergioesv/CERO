'use strict';

/**
 * tests/helpers/entornoWhatsapp.js
 *
 * Monta el canal de WhatsApp completo contra dependencias falsas
 * (Supabase en memoria, OCR determinista, PDF y Twilio simulados)
 * y expone un "conductor virtual" que envía mensajes y recibe respuestas.
 *
 * Permite probar el flujo real de punta a punta sin red, sin Twilio,
 * sin Gemini y sin base de datos.
 */

var { crearFakeSupabase } = require('./fakeSupabase');

// ── OCR controlable ─────────────────────────────────────────────────────────
function crearOcrFalso() {
  var estado = {
    placa: { valida: true, placa: 'IDL354', razon: '' },
    // Dentro de MAX_KM_SALTO (200) respecto al activo sembrado en 125000.
    kilometraje: { kilometraje: 125150, razon: '' },
    novedad: { items: [], observacion: '' }
  };

  return {
    _estado: estado,
    marcarTodoOK: function () {
      return { estado: 'OK', items: [], observacion: null };
    },
    extraerPlacaFoto: function () { return Promise.resolve(estado.placa); },
    extraerKilometrajeFoto: function () { return Promise.resolve(estado.kilometraje); },
    interpretarNovedad: function () { return Promise.resolve(estado.novedad); },
    extraerDatosFacturaCombustible: function () { return Promise.resolve({}); },
    descargarImagen: function () { return Promise.resolve({ base64: '', mediaType: 'image/jpeg' }); }
  };
}

function construirConfigFalso(fakeSupabase, mensajesTwilio) {
  return {
    supabase: fakeSupabase,
    twilioClient: {
      messages: {
        create: function (msg) {
          mensajesTwilio.push(msg);
          return Promise.resolve({ sid: 'SM-fake' });
        }
      }
    },
    genAI: {},
    clean: function (v) { return typeof v === 'string' ? v.trim() : v; },
    GOOGLE_API_KEY: 'fake',
    TWILIO_WHATSAPP_NUMBER: 'whatsapp:+14155238886',
    TWILIO_ACCOUNT_SID: 'ACfake',
    // Vacío a propósito: firmaTwilioValida() no exige firma sin token.
    TWILIO_AUTH_TOKEN: '',
    TWILIO_WEBHOOK_URL: 'https://fake.test/webhook',
    SESSION_STORE_FILE: '',
    MAX_KM_SALTO: 200,
    STORAGE_BUCKET_PREOPERACIONALES: 'preoperacionales',
    jwtSecret: 'fake-secret',
    TIMEOUT_FLUJO_MS: {
      preoperacional: 30 * 60 * 1000,
      posoperacional: 30 * 60 * 1000,
      tanqueo: 10 * 60 * 1000,
      inscripcion: 60 * 60 * 1000,
      default: 30 * 60 * 1000
    },
    TIMEOUT_RECUPERACION_MS: 5 * 60 * 1000,
    TABLES: {
      activos: 'activos',
      conductores: 'conductores',
      preoperacionales: 'preoperacionales',
      evidencia: 'evidencia',
      alertas: 'alertas',
      tanqueos: 'tanqueos',
      ats: 'ats',
      revisionesEquipos: 'revisiones_equipos',
      riesgosLocativos: 'riesgos_locativos',
      posoperacionales: 'posoperacionales',
      dashboardSnapshots: 'dashboard_snapshots',
      sesionesActivas: 'sesiones_activas',
      plantillasInspeccion: 'plantillas_inspeccion',
      plantillaGrupos: 'plantilla_grupos',
      plantillaItems: 'plantilla_items'
    }
  };
}

/**
 * Extrae el texto del <Message> de una respuesta TwiML.
 */
function textoDeTwiml(cuerpo) {
  if (!cuerpo) return '';
  var m = String(cuerpo).match(/<Message>([\s\S]*)<\/Message>/);
  if (!m) return '';
  return m[1]
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

/**
 * Monta el entorno completo. Debe llamarse dentro de cada test
 * (usa jest.resetModules para aislar el estado en memoria de sesiones).
 */
function montarEntorno(seed) {
  jest.resetModules();

  var fakeSupabase = crearFakeSupabase(seed);
  var mensajesTwilio = [];
  var ocrFalso = crearOcrFalso();
  var pdfsGenerados = [];

  jest.doMock('../../config/config', function () {
    return construirConfigFalso(fakeSupabase, mensajesTwilio);
  });

  jest.doMock('../../servicios/ocr', function () { return ocrFalso; });

  jest.doMock('../../servicios/pdf/preoperacional', function () {
    return {
      generarPDF: function () { return Promise.resolve(Buffer.from('pdf')); },
      subirYEnviarPDF: function (sesion, preopId, telefono) {
        pdfsGenerados.push({ sesion: sesion, preopId: preopId, telefono: telefono });
        return Promise.resolve('https://fake.supabase.co/preop.pdf');
      }
    };
  });

  var canal = require('../../canales/whatsapp');

  var conversacion = [];

  /**
   * Envía un mensaje como si fuera el conductor y devuelve el texto de respuesta.
   * @param {string} texto
   * @param {string[]} mediaUrls
   */
  async function enviar(telefono, texto, mediaUrls) {
    var body = { From: telefono, Body: texto || '' };
    var urls = mediaUrls || [];
    body.NumMedia = String(urls.length);
    urls.forEach(function (u, i) { body['MediaUrl' + i] = u; });

    var res = {
      _headers: {},
      _body: null,
      _status: 200,
      set: function (h, v) { res._headers[h] = v; return res; },
      status: function (c) { res._status = c; return res; },
      send: function (b) { res._body = b; return res; }
    };

    await canal.webhookWhatsApp({ body: body, headers: {}, ip: '127.0.0.1' }, res);
    var respuesta = textoDeTwiml(res._body);
    conversacion.push({ envia: texto || (urls.length ? '[FOTO]' : ''), recibe: respuesta });
    return respuesta;
  }

  return {
    enviar: enviar,
    supabase: fakeSupabase,
    ocr: ocrFalso,
    mensajesTwilio: mensajesTwilio,
    pdfsGenerados: pdfsGenerados,
    conversacion: conversacion,
    transcripcion: function () {
      return conversacion.map(function (t) {
        return '👤 ' + t.envia + '\n🤖 ' + t.recibe;
      }).join('\n\n───────────────\n\n');
    }
  };
}

module.exports = {
  montarEntorno: montarEntorno,
  textoDeTwiml: textoDeTwiml
};
