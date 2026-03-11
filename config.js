const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const twilio = require('twilio');

function clean(value) {
  if (typeof value !== 'string') return value;
  return value.trim().replace(/^["']|["']$/g, '');
}

const ANTHROPIC_API_KEY = clean(process.env.ANTHROPIC_API_KEY);
const SUPABASE_URL = clean(process.env.SUPABASE_URL);
const SUPABASE_KEY = clean(process.env.SUPABASE_KEY);
const TWILIO_ACCOUNT_SID = clean(process.env.TWILIO_ACCOUNT_SID);
const TWILIO_AUTH_TOKEN = clean(process.env.TWILIO_AUTH_TOKEN);
const TWILIO_WEBHOOK_URL = clean(process.env.TWILIO_WEBHOOK_URL || process.env.PUBLIC_WEBHOOK_URL || '');
const SESSION_STORE_FILE = clean(process.env.SESSION_STORE_FILE || '');

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY || '' });
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

const TWILIO_WHATSAPP_NUMBER = clean(process.env.TWILIO_WHATSAPP_NUMBER) || 'whatsapp:+14155238886';

module.exports = {
  anthropic,
  supabase,
  twilioClient,
  clean,
  ANTHROPIC_API_KEY,
  TWILIO_WHATSAPP_NUMBER,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_WEBHOOK_URL,
  SESSION_STORE_FILE
};
