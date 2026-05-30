const { supabase } = require('../config/config');

const CANONICAL_ROLE_PERMISSIONS = {
  superadmin_plataforma: {
    activos: ['ver', 'crear', 'editar', 'autorizar', 'eliminar'],
    conductores: ['ver', 'crear', 'editar'],
    sedes: ['ver', 'crear', 'editar'],
    usuarios: ['ver', 'crear', 'editar'],
    flota: ['ver'],
    preoperacionales: ['ver'],
    posoperacionales: ['ver'],
    tanqueos: ['ver', 'editar'],
    alertas: ['ver'],
    dashboard: ['ver'],
    autorizaciones: ['ver', 'editar']
  },
  superadmin_emp: {
    activos: ['ver', 'crear', 'editar', 'eliminar'],
    conductores: ['ver', 'crear', 'editar'],
    sedes: ['ver', 'crear', 'editar'],
    usuarios: ['ver', 'crear', 'editar'],
    flota: ['ver'],
    preoperacionales: ['ver'],
    posoperacionales: ['ver'],
    tanqueos: ['ver', 'editar'],
    alertas: ['ver'],
    dashboard: ['ver'],
    autorizaciones: ['ver', 'editar']
  },
  administrador: {
    activos: ['ver', 'crear', 'editar'],
    conductores: ['ver', 'crear', 'editar'],
    flota: ['ver'],
    preoperacionales: ['ver'],
    posoperacionales: ['ver'],
    tanqueos: ['ver', 'editar'],
    alertas: ['ver']
  },
  supervisor: {
    activos: ['ver', 'editar', 'autorizar'],
    flota: ['ver'],
    preoperacionales: ['ver', 'autorizar'],
    posoperacionales: ['ver', 'autorizar'],
    tanqueos: ['ver', 'autorizar', 'editar'],
    alertas: ['ver', 'autorizar'],
    dashboard: ['ver'],
    autorizaciones: ['ver', 'editar']
  },
  operador: {
    activos: ['ver'],
    flota: ['ver'],
    preoperacionales: ['ver'],
    posoperacionales: ['ver'],
    tanqueos: ['ver'],
    alertas: ['ver']
  },
  sst: {
    preoperacionales: ['ver'],
    posoperacionales: ['ver'],
    alertas: ['ver'],
    dashboard: ['ver']
  },
  auditor: {
    activos: ['ver'],
    conductores: ['ver'],
    flota: ['ver'],
    preoperacionales: ['ver'],
    posoperacionales: ['ver'],
    tanqueos: ['ver'],
    alertas: ['ver'],
    dashboard: ['ver'],
    autorizaciones: ['ver']
  },
  reportes: {
    activos: ['ver'],
    conductores: ['ver'],
    flota: ['ver'],
    preoperacionales: ['ver'],
    posoperacionales: ['ver'],
    tanqueos: ['ver'],
    alertas: ['ver'],
    dashboard: ['ver'],
    autorizaciones: ['ver']
  }
};

function normalizeRoleName(role) {
  return String(role || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function classifyRoleName(role) {
  const normalized = normalizeRoleName(role);
  if (!normalized) return null;
  if (normalized === 'superadmin_plataforma') return 'superadmin_plataforma';
  if (normalized === 'superadmin_emp' || normalized === 'superadmin_empresa') return 'superadmin_emp';
  if (normalized === 'administrador') return 'administrador';
  if (normalized === 'supervisor' || normalized === 'mantenimiento') return 'supervisor';
  if (normalized === 'operador' || normalized.startsWith('operador_')) return 'operador';
  if (normalized === 'conductor') return null;
  if (normalized === 'sst') return 'sst';
  if (normalized === 'auditor_interno' || normalized === 'auditor_externo') return 'auditor';
  if (normalized === 'reportes') return 'reportes';
  if (normalized.includes('superadmin')) {
    return normalized.includes('emp') || normalized.includes('empresa')
      ? 'superadmin_emp'
      : 'superadmin_plataforma';
  }
  if (normalized.includes('administrador')) return 'administrador';
  if (normalized.includes('supervisor')) return 'supervisor';
  return null;
}

function getAllowedCanonicalRolesForItem(itemId, accion = 'ver') {
  return Object.entries(CANONICAL_ROLE_PERMISSIONS)
    .filter(([, permisos]) => (permisos[itemId] || []).includes(accion))
    .map(([rol]) => rol);
}

async function getCanonicalRolesForUser(usuarioId, fallbackRoles = []) {
  let rolesFuente = Array.isArray(fallbackRoles) ? fallbackRoles : [];

  if (usuarioId) {
    const { data, error } = await supabase
      .from('usuarios_roles')
      .select('roles(nombre)')
      .eq('usuario_id', usuarioId)
      .eq('activo', true);

    if (error) throw error;
    rolesFuente = (data || []).map((item) => item.roles?.nombre).filter(Boolean);
  }

  return [...new Set(rolesFuente.map(classifyRoleName).filter(Boolean))];
}

function buildSeedRowsForRoles(rolesData) {
  const rows = [];

  rolesData.forEach((rol) => {
    const canonical = classifyRoleName(rol.nombre);
    const permisos = CANONICAL_ROLE_PERMISSIONS[canonical];
    if (!permisos) return;

    Object.entries(permisos).forEach(([modulo, acciones]) => {
      acciones.forEach((accion) => {
        rows.push({
          rol_id: rol.id,
          modulo,
          accion,
          permitido: true
        });
      });
    });
  });

  return rows;
}

async function seedPermisosBase() {
  const { data: rolesData, error: rolesError } = await supabase
    .from('roles')
    .select('id, nombre');

  if (rolesError) throw rolesError;

  const rows = buildSeedRowsForRoles(rolesData || []);
  if (rows.length === 0) {
    console.warn('No se encontraron roles compatibles para sembrar permisos base.');
    return;
  }

  const { error: insertError } = await supabase
    .from('permisos_rol')
    .upsert(rows, {
      onConflict: 'rol_id,modulo,accion',
      ignoreDuplicates: true
    });

  if (insertError) throw insertError;
  console.log(`Seed permisos_rol aplicado (${rows.length} permisos base)`);
}


/**
 * Lista el catalogo de roles disponibles.
 * Excluye superadmin_plataforma — no se puede asignar desde la UI.
 */
async function listarRoles() {
  var resultado = await config.supabase
    .from('roles')
    .select('id, nombre, empresa_id')
    .order('nombre');

  if (resultado.error) throw resultado.error;

  return (resultado.data || []).filter(function(r) {
    return r.nombre !== 'superadmin_plataforma';
  });
}


/**
 * Obtiene una asignacion de rol por ID, incluyendo empresa del usuario.
 */
async function obtenerAsignacionRol(id) {
  var resultado = await config.supabase
    .from('usuarios_roles')
    .select('id, usuario_id, usuarios_panel(empresa_id)')
    .eq('id', id)
    .maybeSingle();

  if (resultado.error) throw resultado.error;
  return resultado.data;
}

/**
 * Elimina una asignacion de rol por ID.
 */
async function eliminarAsignacionRol(id) {
  var resultado = await config.supabase
    .from('usuarios_roles')
    .delete()
    .eq('id', id);

  if (resultado.error) throw resultado.error;
}

module.exports = {
  CANONICAL_ROLE_PERMISSIONS,
  classifyRoleName,
  getAllowedCanonicalRolesForItem,
  getCanonicalRolesForUser,
  normalizeRoleName,
  seedPermisosBase,
  listarRoles,
  obtenerAsignacionRol,
  eliminarAsignacionRol
};
