const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require('axios');
const config = require('../config/config');
const utils = require('../modulos/vehiculos/preoperacional/validaciones');

// Configuración de Dominios y Timeouts
const DOMINIOS_PERMITIDOS = ['twilio.com', 'twiliocdn.com', 'api.twilio.com']; [cite: 381]
const GEMINI_TIMEOUT_MS = 8000; // Mantenemos 8s para responder antes del límite de Twilio [cite: 383]

// Inicialización de Gemini con la nueva API Key
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

/**
 * Descarga la imagen desde Twilio con validación de seguridad (SSRF)
 */
async function descargarImagen(url) {
  try {
    const urlObj = new URL(url); [cite: 384]
    const permitido = DOMINIOS_PERMITIDOS.some(dom => urlObj.hostname.endsWith(dom)); [cite: 384]
    
    if (!permitido) throw new Error('URL de origen no permitida'); [cite: 385]

    const requestConfig = {
      responseType: 'arraybuffer',
      timeout: 15000, [cite: 388]
      headers: {}
    };

    // Autenticación básica si es Twilio
    if (config.TWILIO_ACCOUNT_SID && config.TWILIO_AUTH_TOKEN) {
      const credentials = Buffer.from(`${config.TWILIO_ACCOUNT_SID}:${config.TWILIO_AUTH_TOKEN}`).toString('base64'); [cite: 389]
      requestConfig.headers.Authorization = `Basic ${credentials}`; [cite: 390]
    }

    const response = await axios.get(url, requestConfig); [cite: 390]
    return {
      base64: Buffer.from(response.data).toString('base64'),
      mediaType: response.headers['content-type'] || 'image/jpeg' [cite: 391, 392]
    };
  } catch (error) {
    console.error('Error descargando imagen:', error.message);
    throw new Error('No se pudo descargar la imagen'); [cite: 393]
  }
}

/**
 * Función centralizada para llamadas a Gemini (Reemplaza crearMensajeAnthropic)
 */
async function llamarGemini(prompt, modelName, imageData = null) {
  const model = genAI.getGenerativeModel({ model: modelName });
  
  // Configuración de seguridad y generación
  const generationConfig = {
    maxOutputTokens: 500,
    temperature: 0.1, // Baja temperatura para mayor precisión en OCR
  };

  try {
    const contentParts = [{ text: prompt }];
    
    if (imageData) {
      contentParts.push({
        inlineData: {
          data: imageData.base64,
          mimeType: imageData.mediaType
        }
      });
    }

    // Ejecución con timeout
    const result = await Promise.race([
      model.generateContent(contentParts, generationConfig),
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), GEMINI_TIMEOUT_MS))
    ]);

    const response = await result.response;
    const texto = response.text();
    
    // Extraer JSON de la respuesta
    const jsonMatch = texto.match(/\{[\s\S]*\}/); [cite: 394]
    if (!jsonMatch) throw new Error('IA no devolvió JSON válido'); [cite: 395]
    
    return JSON.parse(jsonMatch[0]); [cite: 395]
  } catch (error) {
    if (error.message === 'TIMEOUT') throw new Error('Tiempo de análisis agotado. Intenta de nuevo.'); [cite: 402]
    throw error;
  }
}

async function interpretarNovedad(texto, items) {
  const prompt = `Eres asistente de inspeccion vehicular. Operario reportó: "${texto}"
  Items posibles: ${items.join(', ')}
  Responde SOLO en JSON:
  {
    "items": [{"nombre": "item exacto", "estado": "estado categorizado"}],
    "observacion": "${texto}"
  }`; [cite: 405, 408]
  
  // Usamos Gemini 1.5 Flash por ser el más rápido y barato para texto
  const parsed = await llamarGemini(prompt, "gemini-1.5-flash");
  
  const itemsPermitidos = new Set(items);
  parsed.items = (parsed.items || []).filter(item => itemsPermitidos.has(item.nombre)); [cite: 411]
  return parsed;
}

async function extraerPlacaFoto(urlFoto) {
  try {
    const imagen = await descargarImagen(urlFoto); [cite: 412]
    const prompt = `Analiza la imagen del vehículo. Lee la placa visible.
    Responde SOLO JSON: {"valida": true/false, "placa": "ABC123 o null", "razon": "si no valida"}`; [cite: 415, 418]
    
    // Gemini 1.5 Flash es excelente para OCR rápido de placas [cite: 419]
    const parsed = await llamarGemini(prompt, "gemini-1.5-flash", imagen);
    const placa = utils.normalizarPlaca(parsed.placa || ''); [cite: 420]

    return {
      valida: !!parsed.valida && !!placa, [cite: 421]
      placa: placa || null, [cite: 421, 422]
      razon: parsed.razon || 'No pude leer la placa' [cite: 423]
    };
  } catch (error) {
    return { valida: false, placa: null, razon: error.message }; [cite: 425]
  }
}

async function extraerKilometrajeFoto(urlFoto) {
  try {
    const imagen = await descargarImagen(urlFoto); [cite: 412]
    const prompt = `Analiza el odómetro. Extrae el kilometraje total como número entero.
    Responde SOLO JSON: {"valida": true/false, "kilometraje": 12345 o null}`; [cite: 442, 444]
    
    // Gemini 1.5 Flash ya es muy preciso, pero podrías usar "gemini-1.5-pro" si fallara [cite: 445]
    const parsed = await llamarGemini(prompt, "gemini-1.5-flash", imagen);
    let kilometraje = parsed.kilometraje ? Math.trunc(Number(parsed.kilometraje)) : null; [cite: 446]

    return {
      valida: !!parsed.valida && kilometraje !== null, [cite: 449]
      kilometraje: kilometraje,
      razon: parsed.razon || 'No pude leer el kilometraje' [cite: 450]
    };
  } catch (error) {
    return { valida: false, kilometraje: null, razon: error.message }; [cite: 452]
  }
}

function marcarTodoOK() { [cite: 396]
  return { estado: 'OK', items: [], observacion: null }; [cite: 396]
}

module.exports = {
  marcarTodoOK,
  interpretarNovedad,
  extraerPlacaFoto,
  extraerKilometrajeFoto,
  descargarImagen
};
