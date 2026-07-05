'use strict';

/**
 * tests/servicios/tenantScope.test.js
 *
 * Tests del núcleo de seguridad multi-tenant.
 * El invariante que protegen: NINGUNA función de data/ puede ejecutarse
 * sin un scope fabricado por este módulo, y un scope de la sede A
 * jamás filtra hacia registros de la sede B.
 *
 * Estrategia de mocks (patrón cierre.pdf.test.js / autorizaciones.test.js):
 * mock LOCAL de config/config con cadena supabase controlable,
 * require del módulo bajo prueba DESPUÉS de los jest.mock().
 */

// ─────────────────────────────────────────────────────────────
// 1. MOCKS
// ─────────────────────────────────────────────────────────────

// Cadena flexible: cada método devuelve el mismo objeto; await lo
// resuelve (thenable) con el resultado programado en _resultado.
function crearQueryMock(resultado) {
  var q = { _resultado: resultado };
  ['select', 'eq', 'in', 'neq', 'gte', 'lte', 'order', 'limit'].forEach(function (m) {
    q[m] = jest.fn(function () { return q; });
  });
  q.maybeSingle = jest.fn(function () { return Promise.resolve(q._resultado); });
  q.single = jest.fn(function () { return Promise.resolve(q._resultado); });
  q.then = function (onOk, onErr) { return Promise.resolve(q._resultado).then(onOk, onErr); };
  return q;
}

// from() devuelve la próxima query encolada (FIFO) o una vacía.
var colaQueries = [];
var mockFrom = jest.fn(function () {
  return colaQueries.length ? colaQueries.shift() : crearQueryMock({ data: [], error: null });
});

jest.mock('../../config/config', function () {
  return {
    supabase: { from: mockFrom },
    TABLES: {
      activos: 'activos',
      conductores: 'conductores',
      preoperacionales: 'preoperacionales',
      posoperacionales: 'posoperacionales',
      tanqueos: 'tanqueos'
    }
  };
});

var tenantScope = require('../../servicios/tenantScope');

var SEDE_A = 'aaaaaaaa-0000-0000-0000-000000000001';
var SEDE_B = 'bbbbbbbb-0000-0000-0000-000000000002';
var EMPRESA_1 = '11111111-0000-0000-0000-000000000001';

function usuarioConSedes() {
  return { id: 'u1', empresa_id: EMPRESA_1, sedes: [SEDE_A, SEDE_B], roles: ['admin_empresa'] };
}

beforeEach(function () {
  colaQueries = [];
  mockFrom.mockClear();
  jest.spyOn(console, 'log').mockImplementation(function () {});
});

afterEach(function () {
  console.log.mockRestore();
});

// ─────────────────────────────────────────────────────────────
// 2. CONSTRUCCIÓN Y ASSERT (fail-closed)
// ─────────────────────────────────────────────────────────────

describe('assert — fail-closed', function () {
  test('rechaza undefined, null y objetos literales forjados', function () {
    expect(function () { tenantScope.assert(undefined); }).toThrow(/tenantScope requerido/);
    expect(function () { tenantScope.assert(null); }).toThrow(/tenantScope requerido/);
    expect(function () {
      tenantScope.assert({ empresaId: EMPRESA_1, sedeIds: [SEDE_A], esSistema: false });
    }).toThrow(/tenantScope requerido/);
  });

  test('acepta scope legítimo de desdeUsuario', async function () {
    var scope = await tenantScope.desdeUsuario(usuarioConSedes());
    expect(tenantScope.assert(scope)).toBe(scope);
  });

  test('rechaza scope de usuario sin sedes (fail-closed, no "sin filtro")', async function () {
    var scope = await tenantScope.desdeUsuario({ id: 'u2', roles: ['viewer'] });
    expect(scope.sedeIds).toEqual([]);
    expect(function () { tenantScope.assert(scope); }).toThrow(/sin sedes/);
  });
});

describe('desdeUsuario', function () {
  test('usa sedes[] del JWT sin ir a BD', async function () {
    var scope = await tenantScope.desdeUsuario(usuarioConSedes());
    expect(scope.sedeIds).toEqual([SEDE_A, SEDE_B]);
    expect(scope.empresaId).toBe(EMPRESA_1);
    expect(scope.esSuperadmin).toBe(false);
    expect(scope.esSistema).toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  test('sin sedes[] pero con empresa_id: resuelve sedes activas de la empresa', async function () {
    var q = crearQueryMock({ data: [{ id: SEDE_A }], error: null });
    colaQueries.push(q);
    var scope = await tenantScope.desdeUsuario({ id: 'u1', empresa_id: EMPRESA_1 });
    expect(mockFrom).toHaveBeenCalledWith('sedes');
    expect(q.eq).toHaveBeenCalledWith('empresa_id', EMPRESA_1);
    expect(q.eq).toHaveBeenCalledWith('activa', true);
    expect(scope.sedeIds).toEqual([SEDE_A]);
  });

  test('superadmin_plataforma sin empresa: todas las sedes activas', async function () {
    colaQueries.push(crearQueryMock({ data: [{ id: SEDE_A }, { id: SEDE_B }], error: null }));
    var scope = await tenantScope.desdeUsuario({ id: 'sa', roles: ['superadmin_plataforma'] });
    expect(scope.esSuperadmin).toBe(true);
    expect(scope.sedeIds).toEqual([SEDE_A, SEDE_B]);
  });

  test('el scope es inmutable', async function () {
    var scope = await tenantScope.desdeUsuario(usuarioConSedes());
    expect(function () { 'use strict'; scope.sedeIds = [SEDE_B]; }).toThrow();
    expect(Object.isFrozen(scope)).toBe(true);
  });
});

describe('sistema', function () {
  test('exige motivo auditable', function () {
    expect(function () { tenantScope.sistema(); }).toThrow(/motivo/);
    expect(function () { tenantScope.sistema(''); }).toThrow(/motivo/);
  });

  test('produce scope global que pasa assert', function () {
    var scope = tenantScope.sistema('cron vencimientos');
    expect(scope.esSistema).toBe(true);
    expect(tenantScope.assert(scope)).toBe(scope);
  });
});

// ─────────────────────────────────────────────────────────────
// 3. FILTROS COMPONIBLES
// ─────────────────────────────────────────────────────────────

describe('filtros', function () {
  var scope;
  beforeEach(async function () {
    scope = await tenantScope.desdeUsuario(usuarioConSedes());
  });

  test('porSede aplica .in(sede_id, sedeIds del scope)', function () {
    var q = crearQueryMock({ data: [], error: null });
    tenantScope.porSede(q, scope);
    expect(q.in).toHaveBeenCalledWith('sede_id', [SEDE_A, SEDE_B]);
  });

  test('porSede sin scope lanza — nunca query sin filtro', function () {
    var q = crearQueryMock({ data: [], error: null });
    expect(function () { tenantScope.porSede(q); }).toThrow(/tenantScope requerido/);
    expect(q.in).not.toHaveBeenCalled();
  });

  test('porActivoJoin filtra por la sede del activo embebido', function () {
    var q = crearQueryMock({ data: [], error: null });
    tenantScope.porActivoJoin(q, scope);
    expect(q.in).toHaveBeenCalledWith('activos.sede_id', [SEDE_A, SEDE_B]);
  });

  test('porEmpresa aplica .eq(empresa_id)', function () {
    var q = crearQueryMock({ data: [], error: null });
    tenantScope.porEmpresa(q, scope);
    expect(q.eq).toHaveBeenCalledWith('empresa_id', EMPRESA_1);
  });

  test('scope de sistema no filtra (única excepción)', function () {
    var sys = tenantScope.sistema('test');
    var q = crearQueryMock({ data: [], error: null });
    tenantScope.porSede(q, sys);
    tenantScope.porActivoJoin(q, sys);
    tenantScope.porEmpresa(q, sys);
    expect(q.in).not.toHaveBeenCalled();
    expect(q.eq).not.toHaveBeenCalled();
  });

  test('embedActivo produce el !inner requerido por porActivoJoin', function () {
    expect(tenantScope.embedActivo()).toBe('activos:activo_id!inner(id, placa, nombre, datos, sede_id)');
    expect(tenantScope.embedActivo('documentos')).toContain('!inner');
    expect(tenantScope.embedActivo('documentos')).toContain('documentos');
  });
});

// ─────────────────────────────────────────────────────────────
// 4. CHECKS PUNTUALES (anti-IDOR)
// ─────────────────────────────────────────────────────────────

describe('perteneceActivo', function () {
  var scope;
  beforeEach(async function () {
    scope = await tenantScope.desdeUsuario(usuarioConSedes());
  });

  test('true si el activo está en una sede del scope', async function () {
    var q = crearQueryMock({ data: { id: 'act-1' }, error: null });
    colaQueries.push(q);
    var ok = await tenantScope.perteneceActivo(scope, 'act-1');
    expect(ok).toBe(true);
    expect(q.eq).toHaveBeenCalledWith('id', 'act-1');
    expect(q.in).toHaveBeenCalledWith('sede_id', [SEDE_A, SEDE_B]);
  });

  test('false si el activo es de otro tenant (query no devuelve fila)', async function () {
    colaQueries.push(crearQueryMock({ data: null, error: null }));
    expect(await tenantScope.perteneceActivo(scope, 'act-ajeno')).toBe(false);
  });

  test('false con activoId vacío; error de BD también es false', async function () {
    expect(await tenantScope.perteneceActivo(scope, null)).toBe(false);
    colaQueries.push(crearQueryMock({ data: null, error: { message: 'boom' } }));
    expect(await tenantScope.perteneceActivo(scope, 'act-1')).toBe(false);
  });
});

describe('resolverActivoPorPlaca', function () {
  var scope;
  beforeEach(async function () {
    scope = await tenantScope.desdeUsuario(usuarioConSedes());
  });

  test('resuelve dentro del scope y normaliza a mayúsculas', async function () {
    var q = crearQueryMock({ data: { id: 'act-9' }, error: null });
    colaQueries.push(q);
    var id = await tenantScope.resolverActivoPorPlaca(scope, 'abc123');
    expect(id).toBe('act-9');
    expect(q.eq).toHaveBeenCalledWith('placa', 'ABC123');
    expect(q.in).toHaveBeenCalledWith('sede_id', [SEDE_A, SEDE_B]);
  });

  test('placa de otro tenant → null', async function () {
    colaQueries.push(crearQueryMock({ data: null, error: null }));
    expect(await tenantScope.resolverActivoPorPlaca(scope, 'ZZZ999')).toBe(null);
  });

  test('placa ambigua (>1 fila, maybeSingle da error) → null, fail-closed', async function () {
    colaQueries.push(crearQueryMock({ data: null, error: { code: 'PGRST116' } }));
    expect(await tenantScope.resolverActivoPorPlaca(scope, 'DUP111')).toBe(null);
  });
});

describe('validarSedeSolicitada — query params no eligen tenant', function () {
  var scope;
  beforeEach(async function () {
    scope = await tenantScope.desdeUsuario(usuarioConSedes());
  });

  test('sede dentro del scope pasa; null pasa como null', function () {
    expect(tenantScope.validarSedeSolicitada(scope, SEDE_A)).toBe(SEDE_A);
    expect(tenantScope.validarSedeSolicitada(scope, null)).toBe(null);
  });

  test('sede ajena → Error con status 403', function () {
    var err;
    try {
      tenantScope.validarSedeSolicitada(scope, 'cccccccc-0000-0000-0000-000000000003');
    } catch (e) { err = e; }
    expect(err).toBeDefined();
    expect(err.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────
// 5. MIDDLEWARE
// ─────────────────────────────────────────────────────────────

describe('middleware', function () {
  function mockRes() {
    var res = { statusCode: null, body: null };
    res.status = jest.fn(function (c) { res.statusCode = c; return res; });
    res.json = jest.fn(function (b) { res.body = b; return res; });
    return res;
  }

  test('adjunta req.scope y llama next()', async function () {
    var mw = tenantScope.middleware();
    var req = { usuario: usuarioConSedes() };
    var res = mockRes();
    var next = jest.fn();
    await new Promise(function (resolve) {
      next.mockImplementation(resolve);
      mw(req, res, next);
    });
    expect(tenantScope.esScope(req.scope)).toBe(true);
    expect(req.scope.sedeIds).toEqual([SEDE_A, SEDE_B]);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('usuario sin sedes → 403, no next()', async function () {
    var mw = tenantScope.middleware();
    var req = { usuario: { id: 'u3', roles: ['viewer'] } };
    var res = mockRes();
    var next = jest.fn();
    await new Promise(function (resolve) {
      res.json = jest.fn(function (b) { res.body = b; resolve(res); return res; });
      mw(req, res, next);
    });
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });
});
