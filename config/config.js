const { GoogleGenerativeAI } = require("@google/generative-ai"); // Cambio: Ahora usamos Google
const { createClient } = require('@supabase/supabase-js');
const twilio = require('twilio');

/**
 * Limpia las variables de entorno de comillas o espacios accidentales [cite: 28]
 */
function clean(value) {
  if (typeof value !== 'string') return value;
  return value.trim().replace(/^["']|["']$/g, '');
}

// Configuración de la Nueva API Key de Google
const GOOGLE_API_KEY = clean(process.env.GOOGLE_API_KEY); 

// Configuración de Supabase [cite: 29]
const SUPABASE_URL = clean(process.env.SUPABASE_URL);
const SUPABASE_KEY = clean(process.env.SUPABASE_KEY);

// Configuración de Twilio [cite: 30]
const TWILIO_ACCOUNT_SID = clean(process.env.TWILIO_ACCOUNT_SID);
const TWILIO_AUTH_TOKEN = clean(process.env.TWILIO_AUTH_TOKEN);
const TWILIO_WEBHOOK_URL = clean(process.env.TWILIO_WEBHOOK_URL || process.env.PUBLIC_WEBHOOK_URL || '');
const TWILIO_WHATSAPP_NUMBER = clean(process.env.TWILIO_WHATSAPP_NUMBER) || 'whatsapp:+14155238886';

// Configuración de Sesiones y Reglas [cite: 30-31]
const SESSION_STORE_FILE = clean(process.env.SESSION_STORE_FILE || '');
const MAX_KM_SALTO = parseInt(clean(process.env.MAX_KM_SALTO || '200'), 10) || 200;

// Mapeo de Tablas en Base de Datos [cite: 31-34]
const TABLES = {
  vehiculos: process.env.DB_TABLE_VEHICULOS || 'vehiculos',
  conductores: process.env.DB_TABLE_CONDUCTORES || 'conductores',
  preoperacionales: process.env.DB_TABLE_PREOPERACIONALES || 'preoperacionales',
  fotosEvidencia: process.env.DB_TABLE_FOTOS_EVIDENCIA || 'fotos_evidencia',
  alertas: process.env.DB_TABLE_ALERTAS || 'alertas',
  tanqueos: process.env.DB_TABLE_TANQUEOS || 'tanqueos',
  ats: process.env.DB_TABLE_ATS || 'ats',
  revisionesEquipos: process.env.DB_TABLE_REVISIONES_EQUIPOS || 'revisiones_equipos',
  riesgosLocativos: process.env.DB_TABLE_RIESGOS_LOCATIVOS || 'riesgos_locativos',
  posoperacionales: process.env.DB_TABLE_POSOPERACIONALES || 'posoperacionales',
  dashboardSnapshots: process.env.DB_TABLE_DASHBOARD_SNAPSHOTS || 'dashboard_snapshots'
};

// Inicialización de Clientes
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY); [cite: 35]
const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN); [cite: 35]

// Exportación del módulo
module.exports = {
  supabase,
  twilioClient,
  clean,
  GOOGLE_API_KEY, // Ahora exportamos la llave de Google
  TWILIO_WHATSAPP_NUMBER,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_WEBHOOK_URL,
  SESSION_STORE_FILE,
  MAX_KM_SALTO,
  TABLES
};
