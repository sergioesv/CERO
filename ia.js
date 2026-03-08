const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
const https = require('https');
const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = require('./config');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Descargar imagen con autenticación Twilio - maneja redirecciones manualmente
async function descargarImagen(url) {
  const isTwilio = url.includes('twilio.com') || url.includes('twiliocdn.com') || url.includes('api.twilio.com');
  
  // Si es Twilio, seguimos redirecciones manualmente para mantener auth en cada salto
  if (isTwilio) {
    return new Promise((resolve, reject) => {
      const credentials = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
      console.log('Descargando imagen Twilio. SID:', TWILIO_ACCOUNT_SID ? TWILIO_ACCOUNT_SID.substring(0, 10) + '...' : 'UNDEFINED');

      function seguirUrl(currentUrl, saltos) {
        if (saltos > 5) return reject(new Error('Demasiadas redirecciones'));

        const urlObj = new URL(currentUrl);
        const options = {
          hostname: urlObj.hostname,
          path: urlObj.pathname + urlObj.search,
          method: 'GET',
          headers: {
            'Authorization': `Basic ${credentials}`
          }
        };

        const req = https.request(options, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
            const redirectUrl = res.headers['location'];
            console.log(`Redirigiendo (${res.statusCode}) a: ${redirectUrl}`);
            // Consumir el body para liberar el socket
            res.resume();
            return seguirUrl(redirectUrl, saltos + 1);
          }

          if (res.statusCode !== 200) {
            res.resume();
            return reject(new Error(`HTTP ${res.statusCode} al descargar imagen`));
          }

          const chunks = [];
          res.on('data', chunk => chunks.push(chunk));
          res.on('end', () => {
            const buffer = Buffer.concat(chunks);
            const base64 = buffer.toString('base64');
            const mediaType = res.headers['content-type'] || 'image/jpeg';
            resolve({ base64, mediaType });
          });
        });

        req.on('error', reject);
        req.end();
      }

      seguirUrl(url, 0);
    });
  }

  // URL no-Twilio: descarga directa con axios
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      maxRedirects: 5
    });
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
