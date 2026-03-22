const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const twilio = require('twilio');

function clean(value) {
  if (typeof value !== 'string') return value;
  return value.trim().replace(/^["']|["']$/g, '');
}

// ═══════════════════════════════════════════════════════════
// VALIDACIÓN FAIL-FAST
// ═══════════════════════════════════════════════════════════

const REQUIRED_VARS = [
  'GOOGLE_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_KEY',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN'
];

const missing = REQUIRED_VARS.filter(varName => !process.env[varName]);

if (missing.length > 0) {
  console.error('❌ ERROR CRÍTICO: Variables faltantes:');
  missing.forEach(varName => console.error(`   - ${varName}`));
  console.error('\nRevisa Railway o .env\n');
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════
// CARGA DE VARIABLES
// ═══════════════════════════════════════════════════════════

const GOOGLE_API_KEY = clean(process.env.GOOGLE_API_KEY);
const SUPABASE_URL = clean(process.env.SUPABASE_URL);
const SUPABASE_KEY = clean(process.env.SUPABASE_KEY);
const TWILIO_ACCOUNT_SID = clean(process.env.TWILIO_ACCOUNT_SID);
const TWILIO_AUTH_TOKEN = clean(process.env.TWILIO_AUTH_TOKEN);
const TWILIO_WEBHOOK_URL = clean(process.env.TWILIO_WEBHOOK_URL || process.env.PUBLIC_WEBHOOK_URL || '');
const TWILIO_WHATSAPP_NUMBER = clean(process.env.TWILIO_WHATSAPP_NUMBER || '') || 'whatsapp:+14155238886';
const SESSION_STORE_FILE = clean(process.env.SESSION_STORE_FILE || '');
const MAX_KM_SALTO = parseInt(clean(process.env.MAX_KM_SALTO || '200'), 10) || 200;
const STORAGE_BUCKET_PREOPERACIONALES = clean(
  process.env.STORAGE_BUCKET_PREOPERACIONALES ||
  process.env.SUPABASE_BUCKET_PREOPERACIONALES ||
  'preoperacionales'
);

if (!SUPABASE_URL.includes('supabase.co')) {
  console.error('❌ SUPABASE_URL inválida:', SUPABASE_URL);
  process.exit(1);
}

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
  sesionesActivas: clean(process.env.DB_TABLE_SESIONES_ACTIVAS || 'sesiones_activas'),
  autorizacionesNovedad: clean(process.env.DB_TABLE_AUTORIZACIONES_NOVEDAD || 'autorizaciones_novedad')
};

// ═══════════════════════════════════════════════════════════
// INICIALIZACIÓN DE CLIENTES
// ═══════════════════════════════════════════════════════════

let supabase, twilioClient, genAI;

try {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('✓ Supabase inicializado');
} catch (error) {
  console.error('❌ Error Supabase:', error.message);
  process.exit(1);
}

try {
  twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  console.log('✓ Twilio inicializado');
} catch (error) {
  console.error('❌ Error Twilio:', error.message);
  process.exit(1);
}

try {
  genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
  console.log('✓ Gemini inicializado');
} catch (error) {
  console.error('❌ Error Gemini:', error.message);
  process.exit(1);
}

module.exports = {
  supabase,
  twilioClient,
  genAI,
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
