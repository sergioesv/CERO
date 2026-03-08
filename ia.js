const axios = require('axios');
const { anthropic, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = require('./config');

// Descargar imagen con autenticación Twilio
async function descargarImagen(url) {
  try {
    const isTwilio = url.includes('twilio.com') || url.includes('twiliocdn.com');
    const config = {
      responseType: 'arraybuffer',
      maxRedirects: 5
    };

    if (isTwilio) {
      config.auth = {
        username: TWILIO_ACCOUNT_SID,
        password: TWILIO_AUTH_TOKEN
      };
    }

    const response = await axios.get(url, config);
    const base64 = Buffer.from(response.data).toString('base64');
    const mediaType = response.headers['content-type'] || 'image/jpeg';
    
    return { base64, mediaType };
  } catch (error) {
    console.error('Error descargando imagen:', error.message);
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
