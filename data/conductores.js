// ═══════════════════════════════════════════════════════════
// data/conductores.js
// Capa de datos para conductores
// CERO — v26
// ═══════════════════════════════════════════════════════════

'use strict';

var config = require('../config/config');

/**
 * Inserta un conductor nuevo en la tabla conductores.
 * Encapsula la query Supabase fuera de los modulos de negocio.
 * Normaliza el telefono antes de guardar (elimina prefijo whatsapp:).
 *
 * @param {string} telefono - Telefono WhatsApp completo (ej: whatsapp:+573001234567).
 * @param {Object} datos    - { nombre, cedula, licencia, cargo }
 * @returns {Promise<{ error: Object|null, data: Object|null }>}
 */
async function insertarConductor(telefono, datos) {
  // Quitar prefijo whatsapp: y espacios para guardar solo el numero
  var telefonoLimpio = String(telefono || '')
    .replace(/^whatsapp:/i, '')
    .trim();

  var registro = {
    nombre:             datos.nombre,
    cedula:             datos.cedula,
    telefono:           telefonoLimpio,
    licencia_categoria: datos.licencia,
    cargo:              datos.cargo,
    activo:             true
  };

  var resultado = await config.supabase
    .from(config.TABLES.conductores)
    .insert([registro])
    .select()
    .single();

  if (resultado.error) {
    return { error: resultado.error, data: null };
  }

  return { error: null, data: resultado.data };
}

module.exports = {
  insertarConductor: insertarConductor
};
