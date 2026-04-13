const axios = require('axios');
const config = require('../config/config');
const utils = require('../modulos/vehiculos/preoperacional/validaciones');

const DOMINIOS_PERMITIDOS = ['twilio.com', 'twiliocdn.com', 'api.twilio.com'];
const GEMINI_TIMEOUT_MS = 9000;
const MODELO_VISION = config.clean(process.env.GOOGLE_MODEL_VISION || 'gemini-2.5-flash');
const MODELO_NOVEDADES = config.clean(process.env.GOOGLE_MODEL_NOVEDADES || MODELO_VISION || 'gemini-2.5-flash');
const STOPWORDS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'o', 'con', 'sin', 'estado', 'visible', 'visibles']);

function sinAcentos(texto) {
  return String(texto == null ? '' : texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizarTexto(texto) {
  return sinAcentos(texto)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizar(texto) {
  var normalizado = normalizarTexto(texto);
  if (!normalizado) return [];
  return normalizado.split(' ').map(function(token) {
    return token.replace(/(es|s)$/g, '');
  }).filter(Boolean);
}

function textoIncluye(normalizado, terminos) {
  for (var i = 0; i < terminos.length; i++) {
    if (normalizado.indexOf(normalizarTexto(terminos[i])) >= 0) return true;
  }
  return false;
}

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
  var prompt = opciones.prompt;
  var imageData = opciones.imageData;
  var schema = opciones.schema;
  var modelo = opciones.modelo;

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
      placa: { type: 'STRING' },
      razon: { type: 'STRING' }
    }
  };
}

function construirSchemaOdometro() {
  return {
    type: 'OBJECT',
    required: ['valida', 'kilometraje', 'razon'],
    properties: {
      valida: { type: 'BOOLEAN' },
      kilometraje: { type: 'STRING' },
      razon: { type: 'STRING' }
    }
  };
}

function aliasPorItem(nombre) {
  var clave = normalizarTexto(nombre);
  var alias = new Set();
  alias.add(clave);

  tokenizar(nombre).forEach(function(token) {
    if (!STOPWORDS.has(token)) alias.add(token);
  });

  if (clave.indexOf('aceite motor') >= 0) ['aceite', 'motor'].forEach(function(v) { alias.add(v); });
  if (clave.indexOf('refrigerante') >= 0) ['refrigerante', 'agua'].forEach(function(v) { alias.add(v); });
  if (clave.indexOf('liquido frenos') >= 0) ['liquido frenos', 'liquido', 'freno', 'frenos'].forEach(function(v) { alias.add(v); });
  if (clave.indexOf('fugas visibles') >= 0) ['fuga', 'fugas', 'goteo', 'goteando'].forEach(function(v) { alias.add(v); });
  if (clave.indexOf('luces delanteras traseras') >= 0) ['luz', 'luces', 'faro', 'faros'].forEach(function(v) { alias.add(v); });
  if (clave.indexOf('stops y direccionales') >= 0) ['stop', 'stops', 'direccional', 'direccionales'].forEach(function(v) { alias.add(v); });
  if (clave.indexOf('pito y alarma reversa') >= 0) ['pito', 'alarma', 'reversa', 'corneta', 'bocina'].forEach(function(v) { alias.add(v); });
  if (clave.indexOf('tablero instrumentos') >= 0) ['tablero', 'instrumento', 'instrumentos', 'indicador', 'indicadores'].forEach(function(v) { alias.add(v); });
  if (clave.indexOf('baterias') >= 0) ['bateria', 'baterias'].forEach(function(v) { alias.add(v); });
  if (clave.indexOf('freno de parqueo') >= 0) ['freno', 'frenos', 'parqueo', 'mano'].forEach(function(v) { alias.add(v); });
  if (clave.indexOf('estado llantas') >= 0) ['llanta', 'llantas', 'neumatico', 'neumaticos'].forEach(function(v) { alias.add(v); });
  if (clave.indexOf('pernos de ruedas') >= 0) ['perno', 'pernos', 'rueda', 'ruedas', 'tuerca', 'tuercas'].forEach(function(v) { alias.add(v); });
  if (clave.indexOf('llanta repuesto') >= 0) ['repuesto', 'respuesto', 'llanta repuesto', 'rueda repuesto'].forEach(function(v) { alias.add(v); });
  if (clave.indexOf('cinturones seguridad') >= 0) ['cinturon', 'cinturones', 'seguridad'].forEach(function(v) { alias.add(v); });
  if (clave.indexOf('retrovisores') >= 0) ['retrovisor', 'retrovisores', 'espejo', 'espejos'].forEach(function(v) { alias.add(v); });
  if (clave.indexOf('pedales') >= 0) ['pedal', 'pedales'].forEach(function(v) { alias.add(v); });
  if (clave.indexOf('vidrios y limpiabrisas') >= 0) ['vidrio', 'vidrios', 'limpiabrisas', 'plumilla', 'plumillas'].forEach(function(v) { alias.add(v); });
  if (clave.indexOf('aseo y elementos sueltos') >= 0) ['aseo', 'limpieza', 'suelto', 'sueltos', 'elemento', 'elementos'].forEach(function(v) { alias.add(v); });
  if (clave.indexOf('aire acondicionado') >= 0) ['aire', 'acondicionado', 'ac'].forEach(function(v) { alias.add(v); });
  if (clave.indexOf('equipo carretera') >= 0) ['equipo', 'carretera', 'botiquin', 'extintor', 'cono', 'conos'].forEach(function(v) { alias.add(v); });

  return Array.from(alias);
}

function puntuarItem(segmentoNormalizado, tokensSegmento, itemNombre) {
  var alias = aliasPorItem(itemNombre);
  var score = 0;

  for (var i = 0; i < alias.length; i++) {
    var termino = alias[i];
    var terminoNormalizado = normalizarTexto(termino);
    if (!terminoNormalizado) continue;

    if (terminoNormalizado.indexOf(' ') >= 0) {
      if (segmentoNormalizado.indexOf(terminoNormalizado) >= 0) score += 4;
      continue;
    }

    var terminoToken = terminoNormalizado.replace(/(es|s)$/g, '');
    if (tokensSegmento.indexOf(terminoToken) >= 0) score += 2;
  }

  var nombreNormalizado = normalizarTexto(itemNombre);
  if (segmentoNormalizado === nombreNormalizado) score += 5;
  if (segmentoNormalizado.indexOf(nombreNormalizado) >= 0) score += 3;

  return score;
}

function encontrarMejorItem(segmento, items) {
  var segmentoNormalizado = normalizarTexto(segmento);
  if (!segmentoNormalizado) return null;

  var tokensSegmento = tokenizar(segmento);
  var mejor = null;
  var mejorScore = 0;

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var score = puntuarItem(segmentoNormalizado, tokensSegmento, item);
    if (score > mejorScore) {
      mejor = item;
      mejorScore = score;
    }
  }

  return mejorScore > 0 ? mejor : null;
}

function detectarEstado(segmento, itemNombre) {
  var texto = normalizarTexto(segmento);
  var item = normalizarTexto(itemNombre);

  if (!texto) return null;
  if (textoIncluye(texto, ['no aplica', 'n a', 'na'])) return 'N/A';
  if (textoIncluye(texto, ['ok', 'bien', 'bueno', 'buena', 'normal'])) return 'OK';

  var esNivel = /aceite|refrigerante|liquido frenos/.test(item);
  var esFugas = /fugas/.test(item);
  var esLlantas = /llanta/.test(item);
  var esElectrico = /luces|stop|direccionales|pito|alarma|tablero|baterias/.test(item);

  if (esNivel) {
    if (textoIncluye(texto, ['vacio', 'vacia', 'sin liquido', 'sin aceite'])) return 'Vacio';
    if (textoIncluye(texto, ['bajo', 'baja', 'poquito', 'poco', 'faltante'])) return 'Bajo';
  }

  if (esFugas && textoIncluye(texto, ['fuga', 'fugas', 'goteo', 'goteando', 'derrame', 'botando'])) {
    return 'Con fugas';
  }

  if (esLlantas) {
    if (textoIncluye(texto, ['sin presion', 'sin aire', 'baja presion', 'desinflada', 'desinflado', 'pinchada', 'pinchado'])) {
      return 'Sin presion';
    }
    if (textoIncluye(texto, ['desgastada', 'desgastado', 'lisa', 'lisas'])) return 'Desgastada';
    if (textoIncluye(texto, ['danada', 'dañada', 'danado', 'dañado', 'rota', 'roto', 'rajada', 'rajado', 'cuarteada', 'cuarteado'])) {
      return 'Danada';
    }
  }

  if (esElectrico) {
    if (textoIncluye(texto, ['intermitente'])) return 'Intermitente';
    if (textoIncluye(texto, ['no funciona', 'no sirve', 'no prende', 'apagada', 'apagado', 'fundida', 'fundido', 'quemada', 'quemado'])) {
      return 'No funciona';
    }
  }

  if (textoIncluye(texto, ['falta', 'faltante', 'ausente', 'no tiene'])) return 'Falta';
  if (textoIncluye(texto, ['flojo', 'floja', 'flojos', 'flojas'])) return 'Flojo';
  if (textoIncluye(texto, ['danado', 'dañado', 'danada', 'dañada', 'roto', 'rota', 'quebrado', 'quebrada', 'averiado', 'averiada'])) {
    return 'Danado';
  }
  if (textoIncluye(texto, ['malo', 'mala', 'malos', 'malas', 'mal estado', 'falla', 'fallando', 'deficiente'])) {
    return 'Mal estado';
  }

  return 'Mal estado';
}

function separarSegmentos(texto) {
  var bruto = String(texto || '').replace(/[\n\r]+/g, ', ');
  return bruto
    .split(/,|;|\.|\s+y\s+|\s+e\s+|\//i)
    .map(function(parte) { return parte.trim(); })
    .filter(Boolean);
}

function interpretarNovedadPorReglas(texto, items) {
  var observacion = String(texto || '').trim();
  var resultado = [];
  var vistos = {};
  var segmentos = separarSegmentos(observacion);

  if (!segmentos.length && observacion) segmentos = [observacion];

  for (var i = 0; i < segmentos.length; i++) {
    var segmento = segmentos[i];
    var item = encontrarMejorItem(segmento, items);
    if (!item) continue;
    if (vistos[item]) continue;

    vistos[item] = true;
    resultado.push({
      nombre: item,
      estado: detectarEstado(segmento, item)
    });
  }

  if (!resultado.length && observacion) {
    var itemGeneral = encontrarMejorItem(observacion, items);
    if (itemGeneral) {
      resultado.push({
        nombre: itemGeneral,
        estado: detectarEstado(observacion, itemGeneral)
      });
    }
  }

  return {
    items: resultado,
    observacion: observacion,
    fuente: 'reglas'
  };
}

function limpiarItemsInterpretados(parsed, items) {
  var itemsPermitidos = new Set(items);
  var vistos = {};
  var salida = [];

  (parsed && Array.isArray(parsed.items) ? parsed.items : []).forEach(function(item) {
    if (!item || !item.nombre || !itemsPermitidos.has(item.nombre)) return;
    if (vistos[item.nombre]) return;
    vistos[item.nombre] = true;
    salida.push({
      nombre: item.nombre,
      estado: item.estado || 'Mal estado'
    });
  });

  return {
    items: salida,
    observacion: parsed && parsed.observacion ? parsed.observacion : ''
  };
}

async function interpretarNovedad(texto, items) {
  var porReglas = interpretarNovedadPorReglas(texto, items);
  if (porReglas.items.length > 0) {
    return porReglas;
  }

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

  var parsed = await llamarGeminiJson({
    prompt: prompt,
    schema: construirSchemaNovedades(items),
    modelo: MODELO_NOVEDADES
  });

  var limpio = limpiarItemsInterpretados(parsed, items);
  limpio.observacion = limpio.observacion || String(texto || '').trim();
  limpio.fuente = 'gemini';
  return limpio;
}

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
      prompt: prompt,
      imageData: imagen,
      schema: construirSchemaPlaca(),
      modelo: MODELO_VISION
    });

    var placa = utils.normalizarPlaca(parsed.placa || '');
    return {
      valida: !!parsed.valida && !!placa,
      placa: placa || null,
      razon: parsed.razon || ''
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
      prompt: prompt,
      imageData: imagen,
      schema: construirSchemaOdometro(),
      modelo: MODELO_VISION
    });

    var bruto = String(parsed.kilometraje == null ? '' : parsed.kilometraje).replace(/[^0-9]/g, '');
    var km = bruto ? Math.trunc(Number(bruto)) : null;
    return {
      valida: !!parsed.valida && km !== null,
      kilometraje: km,
      razon: parsed.razon || ''
    };
  } catch (error) {
    return { valida: false, kilometraje: null, razon: error.message };
  }
}

function marcarTodoOK() {
  return { estado: 'OK', items: [], observacion: null };
}

/**
 * Normaliza y valida el resultado del OCR de factura.
 * Garantiza que todos los campos tengan la estructura correcta.
 * Si un campo viene mal formado, lo marca como no leido.
 *
 * @param {Object} datos — respuesta cruda de Gemini
 * @param {Object} resultadoVacio — objeto por defecto con campos vacios
 * @returns {Object} — resultado validado con 10 campos
 */
function normalizarResultadoOCR(datos, resultadoVacio) {
  var camposRequeridos = [
    'factura_numero', 'placa', 'kilometraje', 'producto',
    'cantidad', 'unidad_medida', 'precio_unitario',
    'valor_total', 'estacion', 'fecha'
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
        valor: valorStr,
        leido: c.leido && valorStr !== ''
      };
    } else {
      resultado[campo] = { valor: '', leido: false };
    }
  }

  var leidos = camposRequeridos.filter(function(c) { return resultado[c].leido; }).length;
  console.log('[OCR Factura] ' + leidos + '/10 campos leídos exitosamente');

  return resultado;
}

/**
 * Extrae datos de una factura/recibo de estación de combustible usando Gemini OCR.
 * Analiza la foto y retorna 10 campos con indicador de lectura exitosa.
 * Si un campo no es legible o no aparece, marca leido como false.
 * Nunca inventa datos — si no puede leer, no lo intenta.
 *
 * @param {string} urlFoto — URL de la imagen (Supabase Storage o Twilio media)
 * @returns {Object} — 10 campos con {valor: string, leido: boolean}
 */
async function extraerDatosFacturaCombustible(urlFoto) {
  var resultadoVacio = {
    factura_numero: { valor: '', leido: false },
    placa: { valor: '', leido: false },
    kilometraje: { valor: '', leido: false },
    producto: { valor: '', leido: false },
    cantidad: { valor: '', leido: false },
    unidad_medida: { valor: '', leido: false },
    precio_unitario: { valor: '', leido: false },
    valor_total: { valor: '', leido: false },
    estacion: { valor: '', leido: false },
    fecha: { valor: '', leido: false }
  };

  var camposRequeridos = [
    'factura_numero', 'placa', 'kilometraje', 'producto',
    'cantidad', 'unidad_medida', 'precio_unitario',
    'valor_total', 'estacion', 'fecha'
  ];

  function campoFacturaSchema() {
    return {
      type: 'OBJECT',
      required: ['valor', 'leido'],
      properties: {
        valor: { type: 'STRING' },
        leido: { type: 'BOOLEAN' }
      }
    };
  }

  var schemaFactura = {
    type: 'OBJECT',
    required: camposRequeridos.slice(),
    properties: {
      factura_numero: campoFacturaSchema(),
      placa: campoFacturaSchema(),
      kilometraje: campoFacturaSchema(),
      producto: campoFacturaSchema(),
      cantidad: campoFacturaSchema(),
      unidad_medida: campoFacturaSchema(),
      precio_unitario: campoFacturaSchema(),
      valor_total: campoFacturaSchema(),
      estacion: campoFacturaSchema(),
      fecha: campoFacturaSchema()
    }
  };

  try {
    var imagen = await descargarImagen(urlFoto);

    var prompt = [
      'Analiza esta foto de un recibo o factura de estación de combustible colombiana.',
      'Extrae los siguientes campos si son legibles en la imagen.',
      'Si un campo no es legible, no aparece en la imagen, o no estás seguro, marca leido como false y valor como cadena vacía.',
      'NO inventes datos. Solo extrae lo que puedes leer claramente.',
      '',
      'Campos a extraer:',
      '- factura_numero: número de remisión, factura o recibo (ej: 01817613)',
      '- placa: placa del vehículo (ej: SHT057, ABC123)',
      '- kilometraje: lectura del odómetro/kilometraje (solo números, ej: 266063)',
      '- producto: tipo de combustible (ej: Gasolina corriente, ACPM, Diesel)',
      '- cantidad: cantidad despachada (solo números con decimales, ej: 9.759)',
      '- unidad_medida: unidad de la cantidad (galones o litros)',
      '- precio_unitario: precio por unidad (solo números, ej: 15500)',
      '- valor_total: total pagado (solo números, ej: 151264)',
      '- estacion: nombre de la estación de servicio (ej: EDS Centro Carros)',
      '- fecha: fecha del tanqueo en formato YYYY-MM-DD (ej: 2026-03-05)',
      '',
      'IMPORTANTE:',
      '- En Colombia la etiqueta puede decir REMISION NRO en vez de factura.',
      '- La placa puede aparecer como PLACA, N. INTERNO, o similar.',
      '- El kilometraje puede aparecer como KILOMETRAJE, KM, ODOMETRO.',
      '- Si dice GALONES, la unidad_medida es "galones". Si dice LITROS, es "litros".',
      '- Valores monetarios sin signos de peso ($) ni puntos de miles — solo dígitos.',
      '- Fechas convertir siempre a YYYY-MM-DD.'
    ].join('\n');

    var datos = await llamarGeminiJson({
      prompt: prompt,
      imageData: imagen,
      schema: schemaFactura,
      modelo: MODELO_VISION
    });

    return normalizarResultadoOCR(datos, resultadoVacio);
  } catch (error) {
    console.error('[OCR Factura] Error general:', error.message);
    return resultadoVacio;
  }
}

module.exports = {
  marcarTodoOK,
  interpretarNovedad,
  extraerPlacaFoto,
  extraerKilometrajeFoto,
  extraerDatosFacturaCombustible,
  descargarImagen
};
