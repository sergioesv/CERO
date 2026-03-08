const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const twilio = require('twilio');

function clean(value) {
  if (!value) return value;
  return value.replace(/^["']|["']$/g, '');
}

const ANTHROPIC_API_KEY = clean(process.env.ANTHROPIC_API_KEY);
const TWILIO_ACCOUNT_SID = clean(process.env.TWILIO_ACCOUNT_SID);
const TWILIO_AUTH_TOKEN = clean(process.env.TWILIO_AUTH_TOKEN);

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const supabase = createClient(
  clean(process.env.SUPABASE_URL),
  clean(process.env.SUPABASE_KEY)
);

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

const TWILIO_WHATSAPP_NUMBER = 'whatsapp:+14155238886';

module.exports = { anthropic, supabase, twilioClient, TWILIO_WHATSAPP_NUMBER, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, ANTHROPIC_API_KEY };
