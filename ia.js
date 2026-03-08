const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = require('./config');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

console.log('--- CHEQUEO DE CREDENCIALES ---');
console.log('SID presente:', !!TWILIO_ACCOUNT_SID);
console.log('Token presente:', !!TWILIO_AUTH_TOKEN);
console.log('Longitud del Token:', TWILIO_AUTH_TOKEN ? TWILIO_AUTH_TOKEN.length : 0);
console.log('Inicia con:', TWILIO_AUTH_TOKEN ? TWILIO_AUTH_TOKEN.substring(0, 4) : 'N/A');
console.log('-------------------------------');

// Descargar imagen con autenticación Twilio
async function descargarImagen(url) {
  try {
    const isTwilio = url.includes('twilio.com') || url.includes('twiliocdn.com');
    
    const credentials = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
    console.log('URL a descargar:', url);
    console.log('Credencial base64 (primeros 20):', credentials.substring(0, 20));

    const config = {
      responseType: 'arraybuffer',
      maxRedirects: 10,
      headers: isTwilio ? {
        'Authorization': `Basic ${credentials}`
      } : {}
    };

    const response = await axios.get(url, config);
    const base64 = Buffer.from(response.data).toString('base64');
    const mediaType = response.headers['content-type'] || 'image/jpeg';
    console.log('Imagen descargada OK. Tipo:', mediaType, 'Tamaño:', response.data.length);
    return { base64, mediaType };
  } catch (error) {
    console.error('Error descargando imagen:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Headers respuesta:', JSON.stringify(error.response.headers));
    }
    throw new Error('No se pudo descargar la imagen');
  }
}

// Marcar todo OK sin IA
function marcarTodoOK() {
  return {
    estado: 'OK',
    items: [],
    observacion: null
  };
}

// Interpretar novedad con Haiku
async function interpretarNovedad(texto, items) {
  const prompt = `Eres asistente de inspección vehicular. El operario reportó una novedad: "${texto}"

Ítems posibles del bloque: ${items.join(', ')}

REGLA IMPORTANTE: Solo incluye en el JSON los ítems que el operario mencionó explícitamente con una falla. No incluyas ítems que no se mencionaron. Si el operario dijo "llanta desinflada", solo reporta el ítem de llantas.

Clasifica el estado usando estas categorías según el tipo de ítem:
- Niveles de líquidos: Bajo / Vacío
- Fugas: Con fugas
- Llantas: Desgastada / Dañada / Sin presión
- Luces/Eléctricos: Intermitente / No funciona
- Frenos/Pedales: Duro o flojo / No funciona
- Equipo carretera: Incompleto / Falta
- Cinturones/Espejos: Dañado / Falta

Responde SOLO en JSON sin texto adicional:
{
  "items": [
    {"nombre": "nombre exacto del ítem según la lista", "estado": "estado según categoría"}
  ],
  "observacion": "texto original del operario"
}`;

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }]
  });

  const respuesta = message.content[0].text;
  const jsonMatch = respuesta.match(/\{[\s\S]*\}/);
  
  if (!jsonMatch) {
    throw new Error('IA no devolvió JSON válido');
  }

  return JSON.parse(jsonMatch[0]);
}

// Describir foto sin validación estricta (acepta cualquier foto del vehículo)
async function describirFoto(urlFoto, contexto) {
  try {
    const { base64, mediaType } = await descargarImagen(urlFoto);

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 }
          },
          {
            type: 'text',
            text: `Describe brevemente lo que ves en esta foto. Contexto: "${contexto}". Responde SOLO en JSON: {"comentario": "descripción de lo que ves"}`
          }
        ]
      }]
    });

    const respuesta = message.content[0].text;
    const jsonMatch = respuesta.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { valida: true, comentario: 'Foto recibida' };
    const parsed = JSON.parse(jsonMatch[0]);
    return { valida: true, comentario: parsed.comentario || 'Foto recibida' };
  } catch (error) {
    console.error('Error describiendo foto:', error.message);
    return { valida: true, comentario: 'Foto recibida' };
  }
}

// Validar foto con Sonnet Vision — solo para foto de verificación aleatoria
async function validarFoto(urlFoto, descripcionEsperada, soloDescribir) {
  if (soloDescribir) return describirFoto(urlFoto, descripcionEsperada);
  try {
    const { base64, mediaType } = await descargarImagen(urlFoto);

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 }
          },
          {
            type: 'text',
            text: `¿Esta foto muestra alguna parte de un vehículo relacionada con "${descripcionEsperada}"? Acepta si es cualquier parte del vehículo o sus componentes. Rechaza solo si claramente no es un vehículo ni sus partes. Responde SOLO en JSON: {"valida": true/false, "razon": "descripción breve", "comentario": "lo que ves en la foto"}`
          }
        ]
      }]
    });

    const respuesta = message.content[0].text;
    const jsonMatch = respuesta.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { valida: false, razon: 'Error de validación', comentario: '' };
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('Error validando foto:', error.message);
    return { valida: false, razon: 'Error al procesar imagen', comentario: error.message };
  }
}

module.exports = {
  marcarTodoOK,
  interpretarNovedad,
  validarFoto,
  describirFoto,
  descargarImagen
};
