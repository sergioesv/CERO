var axios = require('axios');
var config = require('./config');
var utils = require('./utils');

var anthropic = config.anthropic;
var TWILIO_ACCOUNT_SID = config.TWILIO_ACCOUNT_SID;
var TWILIO_AUTH_TOKEN = config.TWILIO_AUTH_TOKEN;

async function descargarImagen(url) {
  try {
    var isTwilio = /twilio\.com|twiliocdn\.com/i.test(url);
    var requestConfig = {
      responseType: 'arraybuffer',
      maxRedirects: 10,
      headers: {}
    };

    if (isTwilio && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
      var credentials = Buffer.from(TWILIO_ACCOUNT_SID + ':' + TWILIO_AUTH_TOKEN).toString('base64');
      requestConfig.headers.Authorization = 'Basic ' + credentials;
    }

    var response = await axios.get(url, requestConfig);
    return {
      base64: Buffer.from(response.data).toString('base64'),
      mediaType: response.headers['content-type'] || 'image/jpeg'
    };
  } catch (error) {
    console.error('Error descargando imagen:', error.message);
    throw new Error('No se pudo descargar la imagen');
  }
}

function extraerJson(respuestaTexto) {
  var texto = String(respuestaTexto || '').trim();
  var jsonMatch = texto.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('IA no devolvio JSON valido');
  }
  return JSON.parse(jsonMatch[0]);
}

function marcarTodoOK() {
  return {
    estado: 'OK',
    items: [],
    observacion: null
  };
}

async function interpretarNovedad(texto, items) {
  var prompt = 'Eres asistente de inspeccion vehicular. El operario reporto una novedad: "' + texto + '"\n\n' +
    'Items posibles del bloque: ' + items.join(', ') + '\n\n' +
    'REGLA IMPORTANTE: Solo incluye en el JSON los items que el operario menciono explicitamente con una falla. ' +
    'No inventes items ni cambies el nombre. Usa exactamente uno de los items de la lista.\n\n' +
    'Clasifica el estado usando estas categorias segun el tipo de item:\n' +
    '- Niveles de liquidos: Bajo / Vacio\n' +
    '- Fugas: Con fugas\n' +
    '- Llantas: Desgastada / Danada / Sin presion\n' +
    '- Luces/Electricos: Intermitente / No funciona\n' +
    '- Frenos/Pedales: Duro o flojo / No funciona\n' +
    '- Equipo carretera: Incompleto / Falta\n' +
    '- Cinturones/Espejos: Danado / Falta\n\n' +
    'Responde SOLO en JSON sin texto adicional:\n' +
    '{\n' +
    '  "items": [\n' +
    '    {"nombre": "nombre exacto del item segun la lista", "estado": "estado segun categoria"}\n' +
    '  ],\n' +
    '  "observacion": "texto original del operario"\n' +
    '}';

  var message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }]
  });

  var parsed = extraerJson(message.content[0].text);
  var itemsPermitidos = {};
  for (var i = 0; i < items.length; i++) {
    itemsPermitidos[items[i]] = true;
  }

  parsed.items = (parsed.items || []).filter(function(item) {
    return item && itemsPermitidos[item.nombre];
  });
  parsed.observacion = texto;
  return parsed;
}

async function analizarImagen(urlFoto, promptTexto) {
  var imagen = await descargarImagen(urlFoto);
  var message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: imagen.mediaType, data: imagen.base64 }
        },
        {
          type: 'text',
          text: promptTexto
        }
      ]
    }]
  });

  return extraerJson(message.content[0].text);
}

async function extraerPlacaFoto(urlFoto) {
  try {
    var prompt = 'Analiza la imagen de un vehiculo. Debes confirmar si se ve la parte frontal o frontal lateral del vehiculo y si la placa es legible. ' +
      'Lee la placa visible exactamente como aparece. Si no ves una placa legible, responde valida=false.\n\n' +
      'Responde SOLO en JSON:\n' +
      '{"valida": true/false, "placa": "ABC123 o null", "comentario": "breve", "razon": "si no valida"}';

    var parsed = await analizarImagen(urlFoto, prompt);
    var placa = utils.normalizarPlaca(parsed.placa || '');

    return {
      valida: !!parsed.valida && !!placa,
      placa: placa || null,
      comentario: parsed.comentario || 'Foto frontal recibida',
      razon: (!!parsed.valida && !!placa) ? '' : (parsed.razon || 'No pude leer la placa')
    };
  } catch (error) {
    console.error('Error extrayendo placa:', error.message);
    return {
      valida: false,
      placa: null,
      comentario: '',
      razon: 'No pude leer la placa de la foto. Intenta con una imagen mas clara.'
    };
  }
}

async function validarFotoPlaca(urlFoto, placaEsperada) {
  try {
    var placaNormalizada = utils.normalizarPlaca(placaEsperada);
    var prompt = 'Analiza la imagen de un vehiculo. Debes confirmar si se ve la parte frontal o frontal lateral del vehiculo y si la placa es legible. ' +
      'Lee la placa visible exactamente como aparece. Si no ves una placa legible, responde valida=false. ' +
      'La placa esperada es "' + placaNormalizada + '".\n\n' +
      'Responde SOLO en JSON:\n' +
      '{"valida": true/false, "placa_detectada": "ABC123 o null", "comentario": "breve", "razon": "si no valida"}';

    var parsed = await analizarImagen(urlFoto, prompt);
    var placaDetectada = utils.normalizarPlaca(parsed.placa_detectada || '');
    var coincide = !!placaDetectada && placaDetectada === placaNormalizada;

    return {
      valida: !!parsed.valida && coincide,
      placaDetectada: placaDetectada || null,
      comentario: parsed.comentario || 'Foto frontal recibida',
      razon: coincide ? '' : (parsed.razon || ('La placa detectada fue ' + (placaDetectada || 'ilegible')))
    };
  } catch (error) {
    console.error('Error validando foto de placa:', error.message);
    return {
      valida: false,
      placaDetectada: null,
      comentario: '',
      razon: 'No pude validar la foto frontal. Intenta con una imagen mas clara.'
    };
  }
}

async function extraerKilometrajeFoto(urlFoto) {
  try {
    var prompt = 'Analiza la foto del tablero u odometro de un vehiculo. ' +
      'Extrae el kilometraje total visible como un numero entero en kilometros. ' +
      'Solo valida si el numero se ve con claridad. Si no se ve claro o no es un odometro, responde valida=false.\n\n' +
      'Responde SOLO en JSON:\n' +
      '{"valida": true/false, "kilometraje": 123456 o null, "comentario": "breve", "razon": "si no valida"}';

    var parsed = await analizarImagen(urlFoto, prompt);
    var kilometraje = null;

    if (typeof parsed.kilometraje === 'number' && isFinite(parsed.kilometraje)) {
      kilometraje = Math.trunc(parsed.kilometraje);
    } else if (parsed.kilometraje != null) {
      var digits = String(parsed.kilometraje).replace(/[^0-9]/g, '');
      kilometraje = digits ? parseInt(digits, 10) : null;
    }

    return {
      valida: !!parsed.valida && kilometraje !== null,
      kilometraje: kilometraje,
      comentario: parsed.comentario || 'Kilometraje extraido',
      razon: (!!parsed.valida && kilometraje !== null) ? '' : (parsed.razon || 'No pude leer el kilometraje')
    };
  } catch (error) {
    console.error('Error extrayendo kilometraje:', error.message);
    return {
      valida: false,
      kilometraje: null,
      comentario: '',
      razon: 'No pude leer el kilometraje de la foto. Intenta con una imagen mas nitida.'
    };
  }
}

module.exports = {
  marcarTodoOK,
  interpretarNovedad,
  extraerPlacaFoto,
  validarFotoPlaca,
  extraerKilometrajeFoto,
  descargarImagen
};
