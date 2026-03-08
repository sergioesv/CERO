const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const twilio = require('twilio');

// Función para quitar comillas de las variables
function clean(value) {
  if (!value) return value;
  return value.replace(/^["']|["']$/g, '');
}

const anthropic = new Anthropic({ 
  apiKey: clean(process.env.ANTHROPIC_API_KEY) 
});

const supabase = createClient(
  clean(process.env.SUPABASE_URL), 
  clean(process.env.SUPABASE_KEY)
);

const TWILIO_ACCOUNT_SID = clean(process.env.TWILIO_ACCOUNT_SID);
const TWILIO_AUTH_TOKEN = clean(process.env.TWILIO_AUTH_TOKEN);

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

const TWILIO_WHATSAPP_NUMBER = 'whatsapp:+14155238886';

module.exports = { anthropic, supabase, twilioClient, TWILIO_WHATSAPP_NUMBER, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN };
// Diagnóstico de credenciales (aparecerá en los logs de Railway)
console.log("--- CHEQUEO DE CREDENCIALES ---");
console.log("SID presente:", !!process.env.TWILIO_ACCOUNT_SID);
console.log("Token presente:", !!process.env.TWILIO_AUTH_TOKEN);
if (process.env.TWILIO_AUTH_TOKEN) {
    console.log("Longitud del Token:", process.env.TWILIO_AUTH_TOKEN.length);
    console.log("Inicia con:", process.env.TWILIO_AUTH_TOKEN.substring(0, 4));
}
console.log("-------------------------------");

