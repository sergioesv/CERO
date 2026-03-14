const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const config = require('../config/config');
const utils = require('../modulos/vehiculos/preoperacional/validaciones');

const DOMINIOS_PERMITIDOS = ['twilio.com', 'twiliocdn.com', 'api.twilio.com'];
const GEMINI_TIMEOUT_MS = 9000;
const MODELO = 'gemini-2.0-flash';

function obtenerModeloGemini() {
  if (!config.GOOGLE_API_KEY) {
    throw new Error('GOOGLE_API_KEY no configurada');
  }

  const genAI = new GoogleGenerativeAI(config.GOOGLE_API_KEY);
  return genAI.getGenerativeModel({ model: MODELO });
}

function extraerPrimerJson(texto) {
  if (!texto || typeof texto !== 'string') {
    throw new Error('IA no devolvio texto util');
  }

  const limpio = texto.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();

  try {
    return JSON.parse(limpio);
  } catch (_) {}

  let inicio = -1;
  let profundidad = 0;

  for (let i = 0; i < limpio.length; i++) {
    const char = limpio[i];

    if (char === '{') {
      if (inicio === -1) inicio = i;
      profundidad += 1;
    } else if (char === '}') {
      if (inicio !== -1) {
        profundidad -= 1;
        if (profundidad === 0) {
          const candidato = limpio.slice(inicio, i + 1);
          return JSON.parse(candidato);
        }
      }
    }
  }

  throw new Error('IA no devolvio JSON valido');
}

async function descargarImagen(url) {
  try {
    const urlObj = new URL(url);
    const permitido = DOMINIOS_PERMITIDOS.some(dom => urlObj.hostname.endsWith(dom));
    if (!permitido) throw new Error('URL de origen no permitida');

    const requestConfig = {
      responseType: 'arraybuffer',
      timeout: 12000,
      headers: {}
    };

    if (config.TWILIO_ACCOUNT_SID && config.TWILIO_AUTH_TOKEN) {
      const credentials = Buffer.from(`${config.TWILIO_ACCOUNT_SID}:${config.TWILIO_AUTH_TOKEN}`).toString('base64');
      requestConfig.headers.Authorization = `Basic ${credentials}`;
    }

    const response = await axios.get(url, requestConfig);
    return {
      base64: Buffer.from(response.data).toString('base64'),
      mediaType: response.headers['content-type'] || 'image/jpeg'
    };
  } catch (error) {
    console.error('Error descargando imagen:', error.message);
    throw new Error('No se pudo descargar la imagen');
  }
}

async function llamarGemini(prompt, imageData) {
  const model = obtenerModeloGemini();

  try {
    const contentParts = [{ text: prompt }];
    if (imageData) {
      contentParts.push({
        inlineData: { data: imageData.base64, mimeType: imageData.mediaType }
      });
    }

    const result = await Promise.race([
      model.generateContent(contentParts),
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), GEMINI_TIMEOUT_MS))
    ]);

    const response = await result.response;
    const texto = response.text();
    return extraerPrimerJson(texto);
  } catch (error) {
    if (error.message === 'TIMEOUT') throw new Error('Tiempo de analisis agotado.');
    throw error;
  }
}

async function interpretarNovedad(texto, items) {
  const prompt = `Eres un experto en inspeccion vehicular. El operario reporto: "${texto}"
  
  Items posibles del bloque: ${items.join(', ')}
  
  REGLAS:
  1. Identifica TODOS los items mencionados con falla.
  2. Usa EXACTAMENTE el nombre del item de la lista de items posibles.
  3. Clasifica el estado:
     - Niveles: Bajo / Vacio
     - Fugas: Con fugas
     - Llantas: Desgastada / Danada / Sin presion
     - Electrico: Intermitente / No funciona
     - General: Danado / Falta / Mal estado
  
  Responde SOLO este JSON:
  {
    "items": [
      {"nombre": "Nombre Exacto", "estado": "Estado Categorizado"}
    ],
    "observacion": "${texto}"
  }`;

  const parsed = await llamarGemini(prompt);
  const itemsPermitidos = new Set(items);
  parsed.items = (parsed.items || []).filter(item => itemsPermitidos.has(item.nombre));
  return parsed;
}

async function extraerPlacaFoto(urlFoto) {
  try {
    const imagen = await descargarImagen(urlFoto);
    const prompt = `Analiza la foto. Se ve la placa frontal del vehiculo?
    Responde SOLO JSON: {"valida": true, "placa": "ABC123", "razon": ""}`;
    const parsed = await llamarGemini(prompt, imagen);
    const placa = utils.normalizarPlaca(parsed.placa || '');
    return { valida: !!parsed.valida && !!placa, placa: placa || null, razon: parsed.razon || '' };
  } catch (error) {
    return { valida: false, placa: null, razon: error.message };
  }
}

async function extraerKilometrajeFoto(urlFoto) {
  try {
    const imagen = await descargarImagen(urlFoto);
    const prompt = `Analiza el odometro. Extrae el kilometraje total (numero entero).
    Responde SOLO JSON: {"valida": true, "kilometraje": 123456}`;
    const parsed = await llamarGemini(prompt, imagen);
    const km = parsed.kilometraje ? Math.trunc(Number(parsed.kilometraje)) : null;
    return { valida: !!parsed.valida && km !== null, kilometraje: km, razon: parsed.razon || '' };
  } catch (error) {
    return { valida: false, kilometraje: null, razon: error.message };
  }
}

function marcarTodoOK() {
  return { estado: 'OK', items: [], observacion: null };
}

module.exports = {
  marcarTodoOK,
  interpretarNovedad,
  extraerPlacaFoto,
  extraerKilometrajeFoto,
  descargarImagen
};
