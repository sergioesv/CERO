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
  const prompt = `Eres asistente de inspección vehicular. El operario reportó: "${texto}"

Items del bloque: ${items.join(', ')}

Clasifica cada item mencionado:
- Niveles: OK / Bajo / Vacío
- Fugas: Sin fugas / Con fugas
- Llantas: OK / Desgastada / Dañada
- Luces/Eléctricos: Funciona / Intermitente / No funciona
- Frenos/Pedales: Funciona / Duro o flojo / No funciona
- Equipo: Completo / Incompleto / Falta
- Cinturones/Espejos: OK / Dañado / Falta

Responde SOLO en JSON:
{
  "items": [
    {"nombre": "Aceite", "estado": "Bajo", "critico": true}
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

// Validar foto con Sonnet Vision
async function validarFoto(urlFoto, descripcionEsperada) {
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
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64
            }
          },
          {
            type: 'text',
            text: `¿Esta foto muestra "${descripcionEsperada}" de un vehículo?

Responde SOLO en JSON:
{
  "valida": true/false,
  "razon": "descripción breve",
  "comentario": "lo que ves en la foto"
}`
          }
        ]
      }]
    });

    const respuesta = message.content[0].text;
    const jsonMatch = respuesta.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      return { valida: false, razon: 'Error de validación', comentario: '' };
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('Error validando foto:', error.message);
    return { 
      valida: false, 
      razon: 'Error al procesar imagen',
      comentario: error.message 
    };
  }
}

module.exports = {
  marcarTodoOK,
  interpretarNovedad,
  validarFoto,
  descargarImagen
};
