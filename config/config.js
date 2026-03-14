const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const twilio = require('twilio');

// Limpieza de variables
function clean(value) {
  if (typeof value !== 'string') return value;
  return value.trim().replace(/^["']|["']$/g, '');
}

// ═══════════════════════════════════════════════════════════
// VALIDACIÓN FAIL-FAST - DETIENE EL PROCESO SI FALTA ALGO CRÍTICO
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
  console.error('❌ ERROR CRÍTICO: Variables de entorno faltantes:');
  missing.forEach(varName => console.error(`   - ${varName}`));
  console.error('\nEl sistema NO puede arrancar sin estas credenciales.');
  console.error('Revisa tu configuración en Railway o tu archivo .env\n');
  process.exit(1); // ← FAIL-FAST: detiene el proceso inmediatamente
}

// ═══════════════════════════════════════════════════════════
// CARGA DE VARIABLES (ya validadas)
// ═══════════════════════════════════════════════════════════

const GOOGLE_API_KEY = clean(process.env.GOOGLE_API_KEY);
const SUPABASE_URL = clean(process.env.SUPABASE_URL);
const SUPABASE_KEY = clean(process.env.SUPABASE_KEY);
const TWILIO_ACCOUNT_SID = clean(process.env.TWILIO_ACCOUNT_SID);
const TWILIO_AUTH_TOKEN = clean(process.env.TWILIO_AUTH_TOKEN);

// Variables opcionales con fallbacks seguros
const TWILIO_WEBHOOK_URL = clean(process.env.TWILIO_WEBHOOK_URL || process.env.PUBLIC_WEBHOOK_URL || '');
const TWILIO_WHATSAPP_NUMBER = clean(process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886');
const SESSION_STORE_FILE = clean(process.env.SESSION_STORE_FILE || './sesiones.json');
const MAX_KM_SALTO = parseInt(clean(process.env.MAX_KM_SALTO || '200'), 10) || 200;
const STORAGE_BUCKET_PREOPERACIONALES = clean(
  process.env.STORAGE_BUCKET_PREOPERACIONALES || 
  process.env.SUPABASE_BUCKET_PREOPERACIONALES || 
  'preoperacionales'
);

// Validación de URL de Supabase
if (!SUPABASE_URL.includes('supabase.co')) {
  console.error('❌ ERROR: SUPABASE_URL no parece válida:', SUPABASE_URL);
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════
// TABLAS DE BASE DE DATOS
// ═══════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════
// INICIALIZACIÓN DE CLIENTES
// ═══════════════════════════════════════════════════════════

let supabase, twilioClient, genAI;

try {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('✓ Cliente Supabase inicializado');
} catch (error) {
  console.error('❌ Error al inicializar Supabase:', error.message);
  process.exit(1);
}

try {
  twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  console.log('✓ Cliente Twilio inicializado');
} catch (error) {
  console.error('❌ Error al inicializar Twilio:', error.message);
  process.exit(1);
}

try {
  genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
  console.log('✓ Cliente Google Gemini inicializado');
} catch (error) {
  console.error('❌ Error al inicializar Gemini:', error.message);
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════
// EXPORTACIÓN
// ═══════════════════════════════════════════════════════════

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
