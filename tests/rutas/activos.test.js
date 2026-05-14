'use strict';

/**
 * tests/rutas/activos.test.js
 *
 * Tests de contrato — Fase 0 Plan H2.2.
 * Prueba el middleware verificarPermiso (de middlewares/auth.js) en el contexto
 * del recurso 'vehiculos', simulando los req/res/next que rutas/activos.js
 * le pasaría en producción.
 *
 * NO se carga rutas/activos.js ni se levanta Express.
 * Se importa verificarPermiso directamente y se invoca con objetos mock.
 *
 * El middleware tiene esta lógica (auth.js líneas 26-56):
 *   1. Si req.usuario.roles incluye 'superadmin_plataforma' → next() inmediato (sin BD).
 *   2. Sino → consulta supabase.from('usuarios_roles').select(...).eq(...).eq(...)
 *   3. Canonicaliza roles devueltos por BD, compara con getAllowedCanonicalRolesForItem.
 *   4. Si algún rol canónico está permitido → next(). Sino → 403.
 */

// ---------------------------------------------------------------------------
// MOCKS — deben declararse ANTES del require del módulo bajo prueba.
// ---------------------------------------------------------------------------

// Mock de la cadena: from → select → eq → eq
// mockEqFinal es la promise que resuelve con { data, error }
var mockEqFinal  = jest.fn();
var mockEqFirst  = jest.fn(function() { return { eq: mockEqFinal }; });
var mockSelectSb = jest.fn(function() { return { eq: mockEqFirst }; });
var mockFromSb   = jest.fn(function() { return { select: mockSelectSb }; });

var mockSupabase = { from: mockFromSb };

jest.mock('../../config/config', function() {
  return {
    supabase: mockSupabase,
    jwtSecret: 'test-secret'
  };
});

// ---------------------------------------------------------------------------
// REQUIRE del módulo bajo prueba (después de los mocks)
// ---------------------------------------------------------------------------

var auth = require('../../middlewares/auth');
var verificarPermiso = auth.verificarPermiso;

// ---------------------------------------------------------------------------
// Helpers para construir req/res/next mock
// ---------------------------------------------------------------------------

function buildReq(roles) {
  return {
    usuario: {
      id: 'usuario-test-uuid',
      roles: roles
    }
  };
}

function buildRes() {
  var res = {
    _status: null,
    _body: null
  };
  res.status = jest.fn(function(code) {
    res._status = code;
    return res;
  });
  res.json = jest.fn(function(body) {
    res._body = body;
    return res;
  });
  return res;
}

// ---------------------------------------------------------------------------
// Setup y teardown
// ---------------------------------------------------------------------------

beforeEach(function() {
  mockFromSb.mockClear();
  mockSelectSb.mockClear();
  mockEqFirst.mockClear();
  mockEqFinal.mockClear();

  // Restaurar la cadena de encadenamiento después del clear
  mockFromSb.mockImplementation(function() { return { select: mockSelectSb }; });
  mockSelectSb.mockImplementation(function() { return { eq: mockEqFirst }; });
  mockEqFirst.mockImplementation(function() { return { eq: mockEqFinal }; });
});

// ============================================================================
// Test 1: supervisor con acción 'ver' → next() (supervisor tiene 'ver' en vehiculos)
// ============================================================================

describe("verificarPermiso('vehiculos','ver') — rol supervisor", function() {

  it('debería llamar next() cuando el usuario tiene rol supervisor', async function() {
    // supervisor.vehiculos = ['ver','editar','autorizar']  — data/permisos.js línea 40
    // classifyRoleName('supervisor') → 'supervisor'        — data/permisos.js línea 103
    // getAllowedCanonicalRolesForItem('vehiculos','ver') incluye 'supervisor' — línea 118-122

    // La BD devuelve el rol 'supervisor' para este usuario
    mockEqFinal.mockResolvedValueOnce({
      data: [{ roles: { nombre: 'supervisor' } }],
      error: null
    });

    var req  = buildReq(['supervisor']);  // no es superadmin_plataforma → consulta BD
    var res  = buildRes();
    var next = jest.fn();

    var middleware = verificarPermiso('vehiculos', 'ver');
    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

});

// ============================================================================
// Test 2: supervisor con acción 'crear' → 403 (supervisor NO tiene 'crear' en vehiculos)
// ============================================================================

describe("verificarPermiso('vehiculos','crear') — rol supervisor", function() {

  it('debería responder 403 cuando supervisor intenta crear vehiculos', async function() {
    // supervisor.vehiculos = ['ver','editar','autorizar']  — data/permisos.js línea 40
    // 'crear' NO está en ese array, por lo tanto no pasa el some() en auth.js línea 45

    mockEqFinal.mockResolvedValueOnce({
      data: [{ roles: { nombre: 'supervisor' } }],
      error: null
    });

    var req  = buildReq(['supervisor']);
    var res  = buildRes();
    var next = jest.fn();

    var middleware = verificarPermiso('vehiculos', 'crear');
    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

});

// ============================================================================
// Test 3: rol sin acceso a vehiculos ('conductor') → 403
// ============================================================================

describe("verificarPermiso('vehiculos','ver') — rol conductor (sin acceso)", function() {

  it('debería responder 403 cuando el usuario tiene rol conductor', async function() {
    // classifyRoleName('conductor') → null  — data/permisos.js línea 104
    // null es filtrado por .filter(Boolean) en auth.js línea 42
    // rolesCanonicos queda vacío → el some() falla → 403 (auth.js línea 50)

    mockEqFinal.mockResolvedValueOnce({
      data: [{ roles: { nombre: 'conductor' } }],
      error: null
    });

    var req  = buildReq(['conductor']);
    var res  = buildRes();
    var next = jest.fn();

    var middleware = verificarPermiso('vehiculos', 'ver');
    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('debería responder 403 cuando la BD devuelve roles vacíos', async function() {
    mockEqFinal.mockResolvedValueOnce({
      data: [],
      error: null
    });

    var req  = buildReq([]);
    var res  = buildRes();
    var next = jest.fn();

    var middleware = verificarPermiso('vehiculos', 'ver');
    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

});

// ============================================================================
// Test 4: superadmin_plataforma → cortocircuita sin consultar Supabase
// ============================================================================

describe("verificarPermiso('vehiculos','ver') — rol superadmin_plataforma", function() {

  it('debería llamar next() inmediatamente sin consultar supabase.from()', async function() {
    // auth.js línea 29:
    //   if (req.usuario.roles?.includes('superadmin_plataforma')) return next();
    // Esta rama retorna ANTES de ejecutar supabase.from('usuarios_roles').
    // Por tanto mockFromSb NO debe haber sido invocado.

    var req  = buildReq(['superadmin_plataforma']);
    var res  = buildRes();
    var next = jest.fn();

    var middleware = verificarPermiso('vehiculos', 'ver');
    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    // Verificación del cortocircuito: from() no fue llamado
    expect(mockFromSb).not.toHaveBeenCalled();
  });

  it('debería cortocircuitar incluso si el rol está mezclado con otros roles', async function() {
    // Si roles = ['supervisor','superadmin_plataforma'], el includes() sigue siendo true
    var req  = buildReq(['supervisor', 'superadmin_plataforma']);
    var res  = buildRes();
    var next = jest.fn();

    var middleware = verificarPermiso('vehiculos', 'ver');
    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(mockFromSb).not.toHaveBeenCalled();
  });

  it('debería NO cortocircuitar si el rol es superadmin_emp (diferente a superadmin_plataforma)', async function() {
    // El check en auth.js línea 29 es exacto: includes('superadmin_plataforma').
    // superadmin_emp no activa el cortocircuito.
    mockEqFinal.mockResolvedValueOnce({
      data: [{ roles: { nombre: 'superadmin_emp' } }],
      error: null
    });

    var req  = buildReq(['superadmin_emp']);
    var res  = buildRes();
    var next = jest.fn();

    var middleware = verificarPermiso('vehiculos', 'ver');
    await middleware(req, res, next);

    // superadmin_emp SÍ tiene 'ver' en vehiculos (data/permisos.js línea 18),
    // por lo que el resultado final es next() — pero SÍ consultó Supabase.
    expect(mockFromSb).toHaveBeenCalledWith('usuarios_roles');
    expect(next).toHaveBeenCalledTimes(1);
  });

});

// ============================================================================
// Test adicional: manejo de error de Supabase → 500
// ============================================================================

describe("verificarPermiso — error de Supabase → 500", function() {

  it('debería responder 500 si la consulta de usuarios_roles falla', async function() {
    // auth.js líneas 37-39: si error → throw error
    // El catch en líneas 51-54 captura y responde 500

    mockEqFinal.mockResolvedValueOnce({
      data: null,
      error: new Error('connection timeout')
    });

    var req  = buildReq(['supervisor']); // no es superadmin_plataforma → consulta BD
    var res  = buildRes();
    var next = jest.fn();

    var middleware = verificarPermiso('vehiculos', 'ver');
    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });

});
