const { createClient } = require('@supabase/supabase-js');
const twilio = require('twilio');

function clean(value) {
  if (typeof value !== 'string') return value;
  return value.trim().replace(/^["']|["']$/g, '');
}

const GOOGLE_API_KEY = clean(process.env.GOOGLE_API_KEY || '');
const SUPABASE_URL = clean(process.env.SUPABASE_URL || '');
const SUPABASE_KEY = clean(process.env.SUPABASE_KEY || '');

const TWILIO_ACCOUNT_SID = clean(process.env.TWILIO_ACCOUNT_SID || '');
const TWILIO_AUTH_TOKEN = clean(process.env.TWILIO_AUTH_TOKEN || '');
const TWILIO_WEBHOOK_URL = clean(process.env.TWILIO_WEBHOOK_URL || process.env.PUBLIC_WEBHOOK_URL || '');
const TWILIO_WHATSAPP_NUMBER = clean(process.env.TWILIO_WHATSAPP_NUMBER || '') || 'whatsapp:+14155238886';

const SESSION_STORE_FILE = clean(process.env.SESSION_STORE_FILE || '');
const MAX_KM_SALTO = parseInt(clean(process.env.MAX_KM_SALTO || '200'), 10) || 200;
const STORAGE_BUCKET_PREOPERACIONALES = clean(
  process.env.STORAGE_BUCKET_PREOPERACIONALES ||
  process.env.SUPABASE_BUCKET_PREOPERACIONALES ||
  'preoperacionales'
);

const TABLES = {
  vehiculos: clean(process.env.DB_TABLE_VEHICULOS || 'vehiculos'),
  conductores: clean(process.env.DB_TABLE_CONDUCTORES || 'conductores'),
  preoperacionales: clean(process.env.DB_TABLE_PREOPERACIONALES || 'preoperacionales'),
  fotosEvidencia: clean(process.env.DB_TABLE_FOTOS_EVIDENCIA || 'fotos_evidencia'),
  alertas: clean(process.env.DB_TABLE_ALERTAS || 'alertas'),
  tanqueos: clean(process.env.DB_TABLE_TANQUEOS || 'tanqueos'),
  ats: clean(process.env.DB_TABLE_ATS || 'ats'),
  revisionesEquipos: clean(process.env.DB_TABLE_REVISIONES_EQUIPOS || 'revisiones_equipos'),
  riesgosLocativos: clean(process.env.DB_TABLE_RIESGOS_LOCATIVOS || 'riesgos_locativos'),
  posoperacionales: clean(process.env.DB_TABLE_POSOPERACIONALES || 'posoperacionales'),
  dashboardSnapshots: clean(process.env.DB_TABLE_DASHBOARD_SNAPSHOTS || 'dashboard_snapshots'),
  sesionesActivas: clean(process.env.DB_TABLE_SESIONES_ACTIVAS || 'sesiones_activas')
};

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

module.exports = {
  supabase,
  twilioClient,
  clean,
  GOOGLE_API_KEY,
  TWILIO_WHATSAPP_NUMBER,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_WEBHOOK_URL,
  SESSION_STORE_FILE,
  MAX_KM_SALTO,
  STORAGE_BUCKET_PREOPERACIONALES,
  TABLES
};
