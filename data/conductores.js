// ============================================================
// data/conductores.js
// Capa de datos — queries a Supabase para conductores.
// Unica capa autorizada para hablar con la tabla conductores.
// ============================================================

'use strict';

var config = require('../config/config');

/**
 * Lista todos los conductores ordenados por nombre.
 */
async function listarConductores() {
  var resultado = await config.supabase
    .from(config.TABLES.conductores)
    .select('*')
    .order('nombre');

  if (resultado.error) throw resultado.error;
  return resultado.data;
}

/**
 * Obtiene un conductor por ID.
 */
async function obtenerConductorPorId(id) {
  var resultado = await config.supabase
    .from(config.TABLES.conductores)
    .select('*')
    .eq('id', id)
    .single();

  if (resultado.error) throw resultado.error;
  return resultado.data;
}

/**
 * Crea un conductor desde el panel admin.
 * @param {Object} campos - { nombre, cedula, telefono, licencia_categoria, licencia_vencimiento, cargo, sede_id }
 */
async function crearConductor(campos) {
  var registro = {
    nombre:               campos.nombre,
    cedula:               campos.cedula,
    telefono:             campos.telefono || null,
    licencia_categoria:   campos.licencia_categoria || null,
    licencia_vencimiento: campos.licencia_vencimiento || null,
    cargo:                campos.cargo || 'Conductor',
    activo:               true
  };
  if (campos.sede_id !== undefined) registro.sede_id = campos.sede_id || null;

  var resultado = await config.supabase
    .from(config.TABLES.conductores)
    .insert([registro])
    .select()
    .single();

  if (resultado.error) throw resultado.error;
  return resultado.data;
}

/**
 * Actualiza campos de un conductor existente.
 * Solo actualiza los campos presentes en el objeto recibido.
 */
async function actualizarConductor(id, campos) {
  var resultado = await config.supabase
    .from(config.TABLES.conductores)
    .update(campos)
    .eq('id', id)
    .select()
    .single();

  if (resultado.error) throw resultado.error;
  return resultado.data;
}

/**
 * Inserta un conductor nuevo desde flujo WhatsApp.
 * Normaliza el telefono antes de guardar (elimina prefijo whatsapp:).
 */
async function insertarConductor(telefono, datos) {
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
  listarConductores,
  obtenerConductorPorId,
  crearConductor,
  actualizarConductor,
  insertarConductor
};
