// ============================================================
// data/usuarios.js
// Capa de datos — queries a Supabase para usuarios del panel.
// ============================================================

'use strict';

var config = require('../config/config');

// ─── Auth ────────────────────────────────────────────────────

/**
 * Busca un usuario activo por email (case-insensitive).
 * Usado en login — retorna null si no existe.
 */
async function obtenerUsuarioPorEmail(email) {
  var resultado = await config.supabase
    .from('usuarios_panel')
    .select('*')
    .ilike('email', email)
    .eq('activo', true)
    .maybeSingle();

  if (resultado.error) throw resultado.error;
  return resultado.data;
}

/**
 * Carga roles y sedes de un usuario.
 */
async function obtenerRolesYSedes(usuarioId) {
  var resultado = await config.supabase
    .from('usuarios_roles')
    .select('roles(nombre), sede_id')
    .eq('usuario_id', usuarioId)
    .eq('activo', true);

  if (resultado.error) throw resultado.error;
  return resultado.data || [];
}

/**
 * Actualiza ultimo_acceso (no bloqueante — llamar sin await).
 */
function actualizarUltimoAcceso(usuarioId) {
  config.supabase
    .from('usuarios_panel')
    .update({ ultimo_acceso: new Date() })
    .eq('id', usuarioId)
    .then(function() {}, function(err) {
      console.error('Error actualizando ultimo_acceso:', err);
    });
}

/**
 * Obtiene hash de password de un usuario por ID.
 */
async function obtenerPasswordHash(usuarioId) {
  var resultado = await config.supabase
    .from('usuarios_panel')
    .select('id, password_hash')
    .eq('id', usuarioId)
    .maybeSingle();

  if (resultado.error) throw resultado.error;
  return resultado.data;
}

/**
 * Actualiza password_hash y limpia flag debe_cambiar_password.
 */
async function actualizarPassword(usuarioId, passwordHash) {
  var resultado = await config.supabase
    .from('usuarios_panel')
    .update({
      password_hash:         passwordHash,
      debe_cambiar_password: false,
      actualizado_en:        new Date()
    })
    .eq('id', usuarioId);

  if (resultado.error) throw resultado.error;
}

// ─── CRUD usuarios panel ─────────────────────────────────────

async function listarUsuarios() {
  var resultado = await config.supabase
    .from('usuarios_panel')
    .select('id, nombre, email, empresa_id, activo, ultimo_acceso, debe_cambiar_password')
    .order('nombre');

  if (resultado.error) throw resultado.error;
  return resultado.data || [];
}

async function obtenerUsuarioPorId(id) {
  var resultado = await config.supabase
    .from('usuarios_panel')
    .select('id, nombre, email, empresa_id, activo, ultimo_acceso, debe_cambiar_password')
    .eq('id', id)
    .maybeSingle();

  if (resultado.error) throw resultado.error;
  return resultado.data;
}

async function listarEmpresas() {
  var resultado = await config.supabase
    .from('empresas')
    .select('id, nombre, nit')
    .order('nombre');

  if (resultado.error) throw resultado.error;
  return resultado.data || [];
}

async function crearUsuario(campos) {
  var resultado = await config.supabase
    .from('usuarios_panel')
    .insert([campos])
    .select('id, nombre, email, empresa_id, activo, debe_cambiar_password')
    .single();

  if (resultado.error) throw resultado.error;
  return resultado.data;
}

async function actualizarUsuario(id, campos) {
  var resultado = await config.supabase
    .from('usuarios_panel')
    .update(campos)
    .eq('id', id)
    .select('id, nombre, email, empresa_id, activo, debe_cambiar_password')
    .single();

  if (resultado.error) throw resultado.error;
  return resultado.data;
}

async function obtenerRolesDeUsuario(usuarioId) {
  var resultado = await config.supabase
    .from('usuarios_roles')
    .select('id, roles(id, nombre), sede_id')
    .eq('usuario_id', usuarioId)
    .eq('activo', true);

  if (resultado.error) throw resultado.error;
  return resultado.data || [];
}

async function asignarRol(usuarioId, rolId, sedeId) {
  var resultado = await config.supabase
    .from('usuarios_roles')
    .insert([{ usuario_id: usuarioId, rol_id: rolId, sede_id: sedeId || null, activo: true }])
    .select()
    .single();

  if (resultado.error) throw resultado.error;
  return resultado.data;
}

async function listarRolesCatalogo() {
  var resultado = await config.supabase
    .from('roles')
    .select('id, nombre')
    .order('nombre');

  if (resultado.error) throw resultado.error;
  return (resultado.data || []).filter(function(r) {
    return r.nombre !== 'superadmin_plataforma';
  });
}


/**
 * Lista usuarios con sus roles y empresa.
 * Si empresaId es null (superadmin_plataforma) devuelve todos.
 */
async function listarUsuariosConRoles(empresaId) {
  var query = config.supabase
    .from('usuarios_panel')
    .select('id, nombre, email, empresa_id, activo, ultimo_acceso, debe_cambiar_password, empresas(nombre), usuarios_roles!usuarios_roles_usuario_id_fkey(id, rol_id, sede_id, roles(nombre))')
    .order('nombre');

  if (empresaId) {
    query = query.eq('empresa_id', empresaId);
  }

  var resultado = await query;
  if (resultado.error) throw resultado.error;
  return resultado.data || [];
}

/**
 * Obtiene usuario por ID con solo empresa_id (para scope checks).
 */
async function obtenerScopeUsuario(id) {
  var resultado = await config.supabase
    .from('usuarios_panel')
    .select('id, empresa_id')
    .eq('id', id)
    .maybeSingle();

  if (resultado.error) throw resultado.error;
  return resultado.data;
}

/**
 * Verifica si ya existe un usuario con ese email.
 */
async function existeEmail(email) {
  var resultado = await config.supabase
    .from('usuarios_panel')
    .select('id')
    .ilike('email', email)
    .maybeSingle();

  if (resultado.error) throw resultado.error;
  return !!resultado.data;
}

/**
 * Verifica que empresa_id existe.
 */
async function existeEmpresa(empresaId) {
  var resultado = await config.supabase
    .from('empresas')
    .select('id')
    .eq('id', empresaId)
    .maybeSingle();

  if (resultado.error) throw resultado.error;
  return !!resultado.data;
}

/**
 * Actualiza estado activo de un usuario.
 */
async function actualizarEstadoUsuario(id, activo) {
  var resultado = await config.supabase
    .from('usuarios_panel')
    .update({ activo: activo, actualizado_en: new Date() })
    .eq('id', id)
    .select('id, activo')
    .single();

  if (resultado.error) throw resultado.error;
  return resultado.data;
}

/**
 * Resetea password y fuerza cambio en siguiente login.
 */
async function resetearPassword(id, passwordHash) {
  var resultado = await config.supabase
    .from('usuarios_panel')
    .update({
      password_hash:         passwordHash,
      debe_cambiar_password: true,
      actualizado_en:        new Date()
    })
    .eq('id', id);

  if (resultado.error) throw resultado.error;
}

/**
 * Lista roles asignados a un usuario con nombre y sede.
 */
async function listarRolesDeUsuario(usuarioId) {
  var resultado = await config.supabase
    .from('usuarios_roles')
    .select('id, rol_id, sede_id, activo, roles(nombre), sedes(nombre)')
    .eq('usuario_id', usuarioId)
    .order('id');

  if (resultado.error) throw resultado.error;
  return resultado.data || [];
}

/**
 * Verifica un rol por ID y devuelve su nombre.
 */
async function obtenerRolPorId(rolId) {
  var resultado = await config.supabase
    .from('roles')
    .select('id, nombre')
    .eq('id', rolId)
    .maybeSingle();

  if (resultado.error) throw resultado.error;
  return resultado.data;
}

module.exports = {
  obtenerUsuarioPorEmail,
  obtenerRolesYSedes,
  actualizarUltimoAcceso,
  obtenerPasswordHash,
  actualizarPassword,
  listarUsuarios,
  obtenerUsuarioPorId,
  listarEmpresas,
  crearUsuario,
  actualizarUsuario,
  obtenerRolesDeUsuario,
  asignarRol,
  listarRolesCatalogo,
  listarUsuariosConRoles,
  obtenerScopeUsuario,
  existeEmail,
  existeEmpresa,
  actualizarEstadoUsuario,
  resetearPassword,
  listarRolesDeUsuario,
  obtenerRolPorId
};
