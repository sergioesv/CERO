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

const twilioClient = twilio(
  clean(process.env.TWILIO_ACCOUNT_SID), 
  clean(process.env.TWILIO_AUTH_TOKEN)
);

const TWILIO_ACCOUNT_SID = clean(process.env.TWILIO_ACCOUNT_SID);
const TWILIO_AUTH_TOKEN = clean(process.env.TWILIO_AUTH_TOKEN);
const ANTHROPIC_API_KEY = clean(process.env.ANTHROPIC_API_KEY);

module.exports = { anthropic, supabase, twilioClient, TWILIO_WHATSAPP_NUMBER, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, ANTHROPIC_API_KEY };
