'use strict';

// ============================================================================
// servicios/ocr.js
//
// Servicio de vision artificial (Gemini API).
// Responsabilidad: integracion con Gemini para OCR de placas, odometros y facturas.
//
// V-01 corregido: ya no importa de modulos/. La logica de dominio de inspecciones
// fue extraida a modulos/inspecciones/compartido/interpretadorNovedades.js.
// ============================================================================

const axios = require('axios');
const config = require('../config/config');
const interpretador = require('../modulos/inspecciones/compartido/interpretadorNovedades');

const DOMINIOS_PERMITIDOS = ['twilio.com', 'twiliocdn.com', 'api.twilio.com'];
const GEMINI_TIMEOUT_MS = 9000;
const MODELO_VISION    = config.clean(process.env.GOOGLE_MODEL_VISION    || 'gemini-2.5-flash');
const MODELO_NOVEDADES = config.clean(process.env.GOOGLE_MODEL_NOVEDADES || MODELO_VISION || 'gemini-2.5-flash');

/**
 * Campos criticos para calcular el score OCR de factura.
 * Score global = promedio de confianza de estos campos (solo los leidos).
 */
var CAMPOS_CRITICOS_FACTURA = ['factura_numero', 'cantidad', 'valor_total', 'placa'];

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades de texto (privadas - solo para normalizacion de placas y facturas)
// ─────────────────────────────────────────────────────────────────────────────

function sinAcentos(texto) {
  return String(texto == null ? '' : texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function normalizarTexto(texto) {
  return sinAcentos(texto)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function textoIncluye(normalizado, terminos) {
  for (var i = 0; i < terminos.length; i++) {
    if (normalizado.indexOf(normalizarTexto(terminos[i])) >= 0) return true;
  }
  return false;
}

// normalizarPlaca: inlineada para evitar dependencia circular con validacionVisual
function normalizarPlaca(texto) {
  return sinAcentos(String(texto == null ? '' : texto))
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

// ─────────────────────────────────────────────────────────────────────────────
// Descarga de imagenes desde CDN de Twilio
// ─────────────────────────────────────────────────────────────────────────────

function descargarImagen(url) {
  return (async function() {
    try {
      console.log('[OCR] Descargando URL:', url.substring(0, 80));
      var urlObj = new URL(url);
      var permitido = DOMINIOS_PERMITIDOS.some(function(dom) {
        return urlObj.hostname.endsWith(dom);
      });
      if (!permitido) throw new Error('URL de origen no permitida');

      var requestConfig = {
        responseType: 'arraybuffer',
        timeout: 12000,
        headers: {}
      };

      if (config.TWILIO_ACCOUNT_SID && config.TWILIO_AUTH_TOKEN) {
        var credentials = Buffer.from(config.TWILIO_ACCOUNT_SID + ':' + config.TWILIO_AUTH_TOKEN).toString('base64');
        requestConfig.headers.Authorization = 'Basic ' + credentials;
      }

      var response = await axios.get(url, requestConfig);
      return {
        base64: Buffer.from(response.data).toString('base64'),
        mediaType: response.headers['content-type'] || 'image/jpeg'
      };
    } catch (error) {
      console.error('Error descargando imagen:', error.message || error);
      throw new Error('No se pudo descargar la imagen');
    }
  })();
}

// ─────────────────────────────────────────────────────────────────────────────
// Cliente Gemini (privado)
// ─────────────────────────────────────────────────────────────────────────────

function obtenerUrlGemini(modelo) {
  return 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(modelo) + ':generateContent';
}

function extraerTextoGemini(data) {
  if (data && data.promptFeedback && data.promptFeedback.blockReason) {
    throw new Error('Gemini bloqueo la respuesta: ' + data.promptFeedback.blockReason);
  }

  var candidato = data && Array.isArray(data.candidates) ? data.candidates[0] : null;
  var partes = candidato && candidato.content && Array.isArray(candidato.content.parts) ? candidato.content.parts : [];
  for (var i = 0; i < partes.length; i++) {
    if (typeof partes[i].text === 'string' && partes[i].text.trim()) {
      return partes[i].text.trim();
    }
  }

  if (candidato && candidato.finishReason && candidato.finishReason !== 'STOP') {
    throw new Error('Gemini finalizo sin respuesta util: ' + candidato.finishReason);
  }

  throw new Error('Gemini no devolvio contenido util');
}

function parsearJsonSeguro(texto) {
  if (!texto) throw new Error('Respuesta vacia de Gemini');

  try {
    return JSON.parse(texto);
  } catch (errorDirecto) {
    var matchObjeto = texto.match(/\{[\s\S]*\}/);
    if (matchObjeto) {
      return JSON.parse(matchObjeto[0]);
    }

    var matchArray = texto.match(/\[[\s\S]*\]/);
    if (matchArray) {
      return JSON.parse(matchArray[0]);
    }

    throw errorDirecto;
  }
}

async function llamarGeminiJson(opciones) {
  var prompt    = opciones.prompt;
  var imageData = opciones.imageData;
  var schema    = opciones.schema;
  var modelo    = opciones.modelo;

  if (!config.GOOGLE_API_KEY) {
    throw new Error('GOOGLE_API_KEY no configurada');
  }

  var partes = [{ text: prompt }];
  if (imageData) {
    partes.push({
      inlineData: {
        data: imageData.base64,
        mimeType: imageData.mediaType
      }
    });
  }

  var payload = {
    contents: [{ parts: partes }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: schema
    }
  };

  try {
    var response = await axios.post(
      obtenerUrlGemini(modelo),
      payload,
      {
        timeout: GEMINI_TIMEOUT_MS + 3000,
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': config.GOOGLE_API_KEY
        }
      }
    );

    var texto = extraerTextoGemini(response.data);
    return parsearJsonSeguro(texto);
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      throw new Error('Tiempo de analisis agotado.');
    }

    if (error.response && error.response.data) {
      var detalle = error.response.data.error && error.response.data.error.message
        ? error.response.data.error.message
        : JSON.stringify(error.response.data);
      throw new Error('Gemini error HTTP ' + error.response.status + ': ' + detalle);
    }

    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Schemas Gemini
// ─────────────────────────────────────────────────────────────────────────────

function construirSchemaNovedades(items) {
  return {
    type: 'OBJECT',
    required: ['items', 'observacion'],
    properties: {
      items: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          required: ['nombre', 'estado'],
          properties: {
            nombre: { type: 'STRING', enum: items },
            estado: { type: 'STRING' }
          }
        }
      },
      observacion: { type: 'STRING' }
    }
  };
}

function construirSchemaPlaca() {
  return {
    type: 'OBJECT',
    required: ['valida', 'placa', 'razon'],
    properties: {
      valida: { type: 'BOOLEAN' },
      placa:  { type: 'STRING' },
      razon:  { type: 'STRING' }
    }
  };
}

function construirSchemaOdometro() {
  return {
    type: 'OBJECT',
    required: ['valida', 'kilometraje', 'razon'],
    properties: {
      valida:      { type: 'BOOLEAN' },
      kilometraje: { type: 'STRING' },
      razon:       { type: 'STRING' }
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// API publica - interpretacion de novedades (delega al modulo de dominio)
// ─────────────────────────────────────────────────────────────────────────────

function marcarTodoOK() {
  return { estado: 'OK', items: [], observacion: null };
}

async function interpretarNovedad(texto, items) {
  var prompt = [
    'Eres un clasificador de novedades de inspeccion vehicular.',
    'Texto reportado por el conductor: "' + String(texto || '').trim() + '".',
    'Items permitidos del bloque: ' + items.join(', ') + '.',
    'Devuelve solo los items afectados.',
    'Usa EXACTAMENTE el nombre del item permitido.',
    'Estados permitidos sugeridos: Bajo, Vacio, Con fugas, Desgastada, Danada, Sin presion, Intermitente, No funciona, Danado, Falta, Mal estado, Flojo, N/A, OK.',
    'Si no puedes mapear con seguridad, devuelve items vacio.',
    'La observacion debe conservar el texto original del conductor.'
  ].join(' ');

  try {
    var parsed = await llamarGeminiJson({
      prompt:  prompt,
      schema:  construirSchemaNovedades(items),
      modelo:  MODELO_NOVEDADES
    });

    var limpio = interpretador.limpiarItemsInterpretados(parsed, items);
    limpio.observacion = limpio.observacion || String(texto || '').trim();

    if (limpio.items.length > 0) {
      limpio.fuente = 'gemini';
      return limpio;
    }
  } catch (errorGemini) {
    console.warn('[ocr] Gemini fallo en interpretarNovedad, usando reglas como fallback:', errorGemini.message);
  }

  // Fallback a interpretacion por reglas (logica de dominio en modulos/)
  return interpretador.interpretarNovedadPorReglas(texto, items);
}

// ─────────────────────────────────────────────────────────────────────────────
// API publica - extraccion OCR de fotos
// ─────────────────────────────────────────────────────────────────────────────

async function extraerPlacaFoto(urlFoto) {
  try {
    var imagen = await descargarImagen(urlFoto);
    var prompt = [
      'Analiza la foto enviada.',
      'Determina si realmente se ve la placa frontal de un vehiculo y si es legible.',
      'Si no es legible o no se ve con seguridad, responde valida=false y explica la razon.',
      'Si es legible, entrega la placa sin espacios.'
    ].join(' ');

    var parsed = await llamarGeminiJson({
      prompt:    prompt,
      imageData: imagen,
      schema:    construirSchemaPlaca(),
      modelo:    MODELO_VISION
    });

    var placa = normalizarPlaca(parsed.placa || '');
    return {
      valida: !!parsed.valida && !!placa,
      placa:  placa || null,
      razon:  parsed.razon || ''
    };
  } catch (error) {
    return { valida: false, placa: null, razon: error.message };
  }
}

async function extraerKilometrajeFoto(urlFoto) {
  try {
    var imagen = await descargarImagen(urlFoto);
    var prompt = [
      'Analiza la foto del odometro.',
      'Extrae el kilometraje total del vehiculo como numero entero sin puntos ni comas.',
      'Si no se puede leer con seguridad, responde valida=false y explica la razon.'
    ].join(' ');

    var parsed = await llamarGeminiJson({
      prompt:    prompt,
      imageData: imagen,
      schema:    construirSchemaOdometro(),
      modelo:    MODELO_VISION
    });

    var bruto = String(parsed.kilometraje == null ? '' : parsed.kilometraje).replace(/[^0-9]/g, '');
    var km = bruto ? Math.trunc(Number(bruto)) : null;
    return {
      valida:      !!parsed.valida && km !== null,
      kilometraje: km,
      razon:       parsed.razon || ''
    };
  } catch (error) {
    return { valida: false, kilometraje: null, razon: error.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// API publica - OCR de facturas de combustible
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calcula el score global OCR y el tier de confianza para una factura.
 * Score = promedio de confianza de CAMPOS_CRITICOS que tienen leido=true.
 */
function calcularScoreOcr(resultado) {
  var sumaConfianza = 0;
  var campoCriticosLeidos = 0;

  for (var i = 0; i < CAMPOS_CRITICOS_FACTURA.length; i++) {
    var campo = CAMPOS_CRITICOS_FACTURA[i];
    if (resultado[campo] && resultado[campo].leido) {
      sumaConfianza += typeof resultado[campo].confianza === 'number'
        ? resultado[campo].confianza
        : 0;
      campoCriticosLeidos++;
    }
  }

  var scoreGlobal = campoCriticosLeidos > 0
    ? parseFloat((sumaConfianza / campoCriticosLeidos).toFixed(3))
    : 0;

  var tierOcr;
  if (scoreGlobal >= 0.80)      tierOcr = 1;
  else if (scoreGlobal >= 0.50) tierOcr = 2;
  else                          tierOcr = 3;

  console.log('[OCR Factura] Score global: ' + scoreGlobal + ' - Tier ' + tierOcr +
    ' (' + campoCriticosLeidos + '/4 campos criticos leidos)');

  return { scoreGlobal: scoreGlobal, tierOcr: tierOcr };
}

function normalizarResultadoOCR(datos, resultadoVacio) {
  var camposRequeridos = [
    'factura_numero', 'placa', 'kilometraje', 'producto',
    'cantidad', 'unidad_medida', 'precio_unitario',
    'valor_total', 'estacion', 'fecha',
    'serial_ibutton', 'autorizacion', 'medio', 'nit_estacion'
  ];

  if (!datos || typeof datos !== 'object') {
    return resultadoVacio;
  }

  var resultado = {};
  for (var i = 0; i < camposRequeridos.length; i++) {
    var campo = camposRequeridos[i];
    var c = datos[campo];
    if (c && typeof c.leido === 'boolean') {
      var valorStr = String(c.valor || '').trim();
      resultado[campo] = {
        valor:     valorStr,
        leido:     c.leido && valorStr !== '',
        confianza: typeof c.confianza === 'number' ? c.confianza : 0
      };
    } else {
      resultado[campo] = { valor: '', leido: false, confianza: 0 };
    }
  }

  var leidos = camposRequeridos.filter(function(c) { return resultado[c].leido; }).length;
  console.log('[OCR Factura] ' + leidos + '/14 campos leidos exitosamente');

  return resultado;
}

async function extraerDatosFacturaCombustible(urlFoto) {
  var resultadoVacio = {
    factura_numero:  { valor: '', leido: false, confianza: 0 },
    placa:           { valor: '', leido: false, confianza: 0 },
    kilometraje:     { valor: '', leido: false, confianza: 0 },
    producto:        { valor: '', leido: false, confianza: 0 },
    cantidad:        { valor: '', leido: false, confianza: 0 },
    unidad_medida:   { valor: '', leido: false, confianza: 0 },
    precio_unitario: { valor: '', leido: false, confianza: 0 },
    valor_total:     { valor: '', leido: false, confianza: 0 },
    estacion:        { valor: '', leido: false, confianza: 0 },
    fecha:           { valor: '', leido: false, confianza: 0 },
    serial_ibutton:  { valor: '', leido: false, confianza: 0 },
    autorizacion:    { valor: '', leido: false, confianza: 0 },
    medio:           { valor: '', leido: false, confianza: 0 },
    nit_estacion:    { valor: '', leido: false, confianza: 0 },
    score_global:    0,
    tier_ocr:        3
  };

  var camposRequeridos = [
    'factura_numero', 'placa', 'kilometraje', 'producto',
    'cantidad', 'unidad_medida', 'precio_unitario',
    'valor_total', 'estacion', 'fecha',
    'serial_ibutton', 'autorizacion', 'medio', 'nit_estacion'
  ];

  function campoFacturaSchema() {
    return {
      type: 'OBJECT',
      required: ['valor', 'leido', 'confianza'],
      properties: {
        valor:     { type: 'STRING' },
        leido:     { type: 'BOOLEAN' },
        confianza: { type: 'NUMBER' }
      }
    };
  }

  var schemaFactura = {
    type: 'OBJECT',
    required: camposRequeridos.slice(),
    properties: {
      factura_numero:  campoFacturaSchema(),
      placa:           campoFacturaSchema(),
      kilometraje:     campoFacturaSchema(),
      producto:        campoFacturaSchema(),
      cantidad:        campoFacturaSchema(),
      unidad_medida:   campoFacturaSchema(),
      precio_unitario: campoFacturaSchema(),
      valor_total:     campoFacturaSchema(),
      estacion:        campoFacturaSchema(),
      fecha:           campoFacturaSchema(),
      serial_ibutton:  campoFacturaSchema(),
      autorizacion:    campoFacturaSchema(),
      medio:           campoFacturaSchema(),
      nit_estacion:    campoFacturaSchema()
    }
  };

  try {
    var imagen = await descargarImagen(urlFoto);

    var prompt = [
      'Analiza esta foto de un recibo o factura de estacion de combustible colombiana.',
      'Extrae los siguientes campos si son legibles en la imagen.',
      'Si un campo no es legible, no aparece en la imagen, o no estas seguro, marca leido como false y valor como cadena vacia.',
      'NO inventes datos. Solo extrae lo que puedes leer claramente.',
      '',
      'Campos a extraer:',
      '- factura_numero: numero de remision, factura o recibo (ej: 01817613)',
      '- placa: placa del vehiculo (ej: SHT057, ABC123)',
      '- kilometraje: lectura del odometro/kilometraje (solo numeros, ej: 266063)',
      '- producto: tipo de combustible (ej: Gasolina corriente, ACPM, Diesel)',
      '- cantidad: cantidad despachada (solo numeros con decimales, ej: 9.759)',
      '- unidad_medida: unidad de la cantidad (galones o litros)',
      '- precio_unitario: precio por unidad (solo numeros, ej: 15500)',
      '- valor_total: total pagado (solo numeros, ej: 151264)',
      '- estacion: nombre de la estacion de servicio (ej: EDS Centro Carros)',
      '- fecha: fecha del tanqueo en formato YYYY-MM-DD (ej: 2026-03-05)',
      '- serial_ibutton: numero serial del dispositivo iButton (ej: F0000001009F6C01) - solo en facturas Terpel convenio',
      '- autorizacion: numero de autorizacion de la transaccion (ej: 684-1772718144369)',
      '- medio: medio de pago usado (ej: IBUTTON, EFECTIVO, TARJETA)',
      '- nit_estacion: NIT de la estacion de servicio (ej: 900021407-9)',
      '',
      'IMPORTANTE:',
      '- En Colombia la etiqueta puede decir REMISION NRO en vez de factura.',
      '- La placa puede aparecer como PLACA, N. INTERNO, o similar.',
      '- El kilometraje puede aparecer como KILOMETRAJE, KM, ODOMETRO.',
      '- Si dice GALONES, la unidad_medida es "galones". Si dice LITROS, es "litros".',
      '- Valores monetarios sin signos de peso ($) ni puntos de miles - solo digitos.',
      '- Fechas convertir siempre a YYYY-MM-DD.',
      '- Si el campo no aparece en la factura, marcarlo leido=false con confianza=0.',
      '- El campo confianza: valor entre 0.0 y 1.0. Solo extrae lo que ves con claridad.',
      '- Si confianza es menor a 0.6, marcar leido=false.'
    ].join('\n');

    var datos = await llamarGeminiJson({
      prompt:    prompt,
      imageData: imagen,
      schema:    schemaFactura,
      modelo:    MODELO_VISION
    });

    var resultado = normalizarResultadoOCR(datos, resultadoVacio);
    var scoreData = calcularScoreOcr(resultado);
    resultado.score_global = scoreData.scoreGlobal;
    resultado.tier_ocr     = scoreData.tierOcr;
    return resultado;
  } catch (error) {
    console.error('[OCR Factura] Error general:', error.message);
    resultadoVacio.score_global = 0;
    resultadoVacio.tier_ocr     = 3;
    return resultadoVacio;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  marcarTodoOK,
  interpretarNovedad,
  extraerPlacaFoto,
  extraerKilometrajeFoto,
  extraerDatosFacturaCombustible,
  descargarImagen
};
