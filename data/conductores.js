// ============================================================
// data/conductores.js
// Capa de datos — queries a Supabase para conductores.
// Unica capa autorizada para hablar con la tabla conductores.
// Multi-tenant: funciones del panel exigen tenantScope y filtran
// por sede. insertarConductor (WhatsApp) queda sin scope hasta la
// fase 1.5 (tenant en inscripción).
// ============================================================

'use strict';

var config = require('../config/config');
var tenantScope = require('../servicios/tenantScope');

/**
 * Lista los conductores de las sedes del scope, ordenados por nombre.
 */
async function listarConductores(scope) {
  tenantScope.assert(scope);
  var query = config.supabase
    .from(config.TABLES.conductores)
    .select('*')
    .order('nombre');
  query = tenantScope.porSede(query, scope);
  var resultado = await query;

  if (resultado.error) throw resultado.error;
  return resultado.data;
}

/**
 * Obtiene un conductor por ID — solo del tenant. null si no existe
 * o pertenece a otra sede (no revela existencia).
 */
async function obtenerConductorPorId(scope, id) {
  tenantScope.assert(scope);
  var query = config.supabase
    .from(config.TABLES.conductores)
    .select('*')
    .eq('id', id);
  query = tenantScope.porSede(query, scope);
  var resultado = await query.maybeSingle();

  if (resultado.error) throw resultado.error;
  return resultado.data || null;
}

/**
 * Crea un conductor desde el panel admin.
 * sede_id es OBLIGATORIA y debe pertenecer al scope — sin esto cada
 * conductor nuevo nacería huérfano de tenant (bug del backfill PR 0).
 * @param {Object} campos - { nombre, cedula, telefono, licencia_categoria, licencia_vencimiento, cargo, sede_id }
 */
async function crearConductor(scope, campos) {
  tenantScope.assert(scope);

  if (!campos.sede_id) {
    var errSede = new Error('sede_id es obligatoria para crear un conductor');
    errSede.status = 400;
    throw errSede;
  }
  tenantScope.validarSedeSolicitada(scope, campos.sede_id); // 403 si ajena

  var registro = {
    nombre:               campos.nombre,
    cedula:               campos.cedula,
    telefono:             campos.telefono || null,
    licencia_categoria:   campos.licencia_categoria || null,
    licencia_vencimiento: campos.licencia_vencimiento || null,
    cargo:                campos.cargo || 'Conductor',
    sede_id:              campos.sede_id,
    empresa_id:           scope.empresaId || null,
    activo:               true
  };

  var resultado = await config.supabase
    .from(config.TABLES.conductores)
    .insert([registro])
    .select()
    .single();

  if (resultado.error) throw resultado.error;
  return resultado.data;
}

/**
 * Actualiza campos de un conductor existente — solo del tenant.
 * Solo actualiza los campos presentes en el objeto recibido.
 * Mover a una sede fuera del scope está prohibido (403).
 */
async function actualizarConductor(scope, id, campos) {
  tenantScope.assert(scope);

  // Pertenencia: el conductor debe estar en una sede del scope
  var qCheck = config.supabase
    .from(config.TABLES.conductores)
    .select('id')
    .eq('id', id);
  qCheck = tenantScope.porSede(qCheck, scope);
  var resCheck = await qCheck.maybeSingle();

  if (resCheck.error) throw resCheck.error;
  if (!resCheck.data) {
    var err404 = new Error('Conductor no encontrado');
    err404.status = 404;
    throw err404;
  }

  if (campos.sede_id !== undefined && campos.sede_id !== null) {
    tenantScope.validarSedeSolicitada(scope, campos.sede_id); // 403 si ajena
  }

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
 * TENANT: fase 1.5 pendiente — no asigna sede_id/empresa_id.
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
