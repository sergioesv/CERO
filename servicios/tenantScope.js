'use strict';
// ═══════════════════════════════════════════════════════════
// servicios/tenantScope.js
// Scope multi-tenant obligatorio para la capa data/.
//
// Principios:
//  1. Fail-closed: toda función de data/ alcanzable desde rutas/
//     recibe scope como PRIMER parámetro y llama assert(scope).
//     Sin scope válido → throw, nunca "sin filtro".
//  2. Un solo escape: sistema(motivo) — exclusivo para crons de
//     plataforma. Auditable con: grep -rn "tenantScope.sistema"
//  3. La fuente de verdad de tenant es activos.sede_id vía join
//     !inner (embedActivo + porActivoJoin), nunca columnas sede_id
//     denormalizadas de tablas transaccionales.
//
// Origen: resolverSedeIds se movió desde data/dashboard.js:111
// (allí queda re-exportada por compatibilidad hasta el refactor).
// ═══════════════════════════════════════════════════════════

var config = require('../config/config');

// Marca privada: un scope solo puede fabricarse en este módulo.
// Un objeto literal { sedeIds: [...] } NO pasa assert().
var MARCA = Symbol('cero.tenantScope');

// ─── Construcción ───

function crear(props) {
  var scope = {
    empresaId: props.empresaId || null,
    sedeIds: Array.isArray(props.sedeIds) ? props.sedeIds.filter(Boolean) : [],
    esSuperadmin: !!props.esSuperadmin,
    esSistema: !!props.esSistema
  };
  Object.defineProperty(scope, MARCA, { value: true });
  return Object.freeze(scope);
}

/**
 * Resuelve las sedes aplicables a un usuario del JWT.
 * (Misma semántica que la versión histórica de data/dashboard.js.)
 * @param {Object} usuario - payload del JWT (empresa_id, sedes[], roles[])
 * @returns {Promise<string[]>} UUIDs de sedes
 */
async function resolverSedeIds(usuario) {
  var u = usuario || {};
  if (Array.isArray(u.sedes) && u.sedes.length) {
    return u.sedes.filter(Boolean);
  }
  if (u.empresa_id) {
    var r = await config.supabase
      .from('sedes')
      .select('id')
      .eq('empresa_id', u.empresa_id)
      .eq('activa', true);
    if (r.error) return [];
    return (r.data || []).map(function (x) { return x.id; });
  }
  // Superadmin de plataforma sin sedes explícitas: todas las sedes activas
  if (Array.isArray(u.roles) && u.roles.indexOf('superadmin_plataforma') !== -1) {
    var r2 = await config.supabase
      .from('sedes')
      .select('id')
      .eq('activa', true);
    if (r2.error) return [];
    return (r2.data || []).map(function (x) { return x.id; });
  }
  return [];
}

/**
 * JWT (req.usuario) → scope. Única vía para construir scope de usuario.
 */
async function desdeUsuario(usuario) {
  var u = usuario || {};
  var esSuperadmin = Array.isArray(u.roles) && u.roles.indexOf('superadmin_plataforma') !== -1;
  var sedeIds = await resolverSedeIds(u);
  return crear({
    empresaId: u.empresa_id || null,
    sedeIds: sedeIds,
    esSuperadmin: esSuperadmin
  });
}

/**
 * Scope global explícito — SOLO crons/procesos de plataforma
 * (p. ej. barrido diario de vencimientos). Nunca en rutas/.
 */
function sistema(motivo) {
  if (!motivo || typeof motivo !== 'string') {
    throw new Error('tenantScope.sistema(motivo) exige un motivo auditable');
  }
  console.log('⚠️ [tenantScope] scope de sistema: ' + motivo);
  return crear({ esSistema: true, esSuperadmin: true });
}

// ─── Verificación ───

function esScope(valor) {
  return !!(valor && valor[MARCA] === true);
}

/**
 * Toda función de data/ expuesta a rutas/ llama esto en su primera línea.
 */
function assert(scope) {
  if (!esScope(scope)) {
    throw new Error('tenantScope requerido: función de data/ llamada sin scope de tenant');
  }
  if (!scope.esSistema && scope.sedeIds.length === 0) {
    throw new Error('tenantScope vacío: usuario sin sedes asignadas');
  }
  return scope;
}

// ─── Filtros componibles (query builder de supabase-js) ───

/** Tablas con sede_id propio: activos, conductores. */
function porSede(query, scope) {
  assert(scope);
  if (scope.esSistema) return query;
  return query.in('sede_id', scope.sedeIds);
}

/** Tablas por empresa: usuarios_panel, plantillas_inspeccion. */
function porEmpresa(query, scope) {
  assert(scope);
  if (scope.esSistema) return query;
  if (!scope.empresaId) {
    if (scope.esSuperadmin) return query; // superadmin de plataforma no tiene empresa propia
    throw new Error('tenantScope sin empresa_id para filtro por empresa');
  }
  return query.eq('empresa_id', scope.empresaId);
}

/**
 * Tablas transaccionales (tanqueos, preoperacionales, posoperacionales,
 * autorizaciones_novedad): filtra por la sede del ACTIVO vía join.
 * El select debe incluir embedActivo() para que el !inner exista.
 */
function porActivoJoin(query, scope) {
  assert(scope);
  if (scope.esSistema) return query;
  return query.in('activos.sede_id', scope.sedeIds);
}

/**
 * Embed estándar del activo con !inner. Usar SIEMPRE junto a porActivoJoin.
 * @param {string} [columnasExtra] - columnas adicionales, ej. 'documentos'
 */
function embedActivo(columnasExtra) {
  var cols = 'id, placa, nombre, datos, sede_id';
  if (columnasExtra) cols += ', ' + columnasExtra;
  return 'activos:activo_id!inner(' + cols + ')';
}

// ─── Checks puntuales (endpoints by-id y escrituras) ───

/**
 * ¿El activo pertenece al tenant del scope? Anti-IDOR para UPDATEs.
 */
async function perteneceActivo(scope, activoId) {
  assert(scope);
  if (!activoId) return false;
  if (scope.esSistema) return true;
  var r = await config.supabase
    .from(config.TABLES.activos)
    .select('id')
    .eq('id', activoId)
    .in('sede_id', scope.sedeIds)
    .maybeSingle();
  return !!(r && !r.error && r.data && r.data.id);
}

/**
 * Placa → activo_id DENTRO del scope. Reemplaza el lookup global de
 * data/activos.js (la placa NO es única global: UNIQUE(placa, empresa_id)).
 * Placa ambigua dentro del scope (>1 fila) → null (fail-closed).
 */
async function resolverActivoPorPlaca(scope, placa) {
  assert(scope);
  if (!placa) return null;
  var q = config.supabase
    .from(config.TABLES.activos)
    .select('id')
    .eq('placa', String(placa).toUpperCase());
  if (!scope.esSistema) q = q.in('sede_id', scope.sedeIds);
  var r = await q.maybeSingle();
  if (r.error || !r.data || !r.data.id) return null;
  return r.data.id;
}

/**
 * Valida un sede_id llegado por query/body contra el scope.
 * null → null (sin filtro). Fuera de scope → Error con status 403.
 */
function validarSedeSolicitada(scope, sedeId) {
  assert(scope);
  if (!sedeId) return null;
  if (scope.esSistema || scope.sedeIds.indexOf(sedeId) !== -1) return sedeId;
  var err = new Error('Sede fuera del alcance del usuario');
  err.status = 403;
  throw err;
}

// ─── Middleware Express ───

/**
 * Montar DESPUÉS de verificarToken: req.scope = scope del usuario.
 * Usuario sin sedes → 403 (fail-closed).
 */
function middleware() {
  return function (req, res, next) {
    desdeUsuario(req.usuario)
      .then(function (scope) {
        if (!scope.esSistema && scope.sedeIds.length === 0) {
          return res.status(403).json({ ok: false, error: 'Usuario sin sedes asignadas' });
        }
        req.scope = scope;
        next();
      })
      .catch(next);
  };
}

module.exports = {
  desdeUsuario: desdeUsuario,
  sistema: sistema,
  assert: assert,
  esScope: esScope,
  resolverSedeIds: resolverSedeIds,
  porSede: porSede,
  porEmpresa: porEmpresa,
  porActivoJoin: porActivoJoin,
  embedActivo: embedActivo,
  perteneceActivo: perteneceActivo,
  resolverActivoPorPlaca: resolverActivoPorPlaca,
  validarSedeSolicitada: validarSedeSolicitada,
  middleware: middleware
};
