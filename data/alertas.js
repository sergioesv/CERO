var config = require('../config/config');

var TABLA = process.env.DB_TABLE_ALERTAS || config.TABLES.alertas;

async function crearAlerta(alerta) {
  return await config.supabase
    .from(TABLA)
    .insert(alerta)
    .select()
    .single();
}

async function crearAlertasMasivas(alertas) {
  if (!alertas || !alertas.length) return { error: null, data: [] };
  return await config.supabase
    .from(TABLA)
    .insert(alertas)
    .select();
}

async function listarAlertasPendientes(limit) {
  return await config.supabase
    .from(TABLA)
    .select('*')
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: false })
    .limit(limit || 50);
}

module.exports = {
  TABLA,
  crearAlerta,
  crearAlertasMasivas,
  listarAlertasPendientes
};
