'use strict';

/**
 * tests/data/permisos.test.js
 *
 * Tests de contrato — Fase 0 Plan H2.2.
 * Congela el comportamiento actual del recurso 'activos' en data/permisos.js
 * ANTES de cualquier rename. Todos los tests deben pasar contra el código actual.
 *
 * Funciones bajo prueba:
 *   - CANONICAL_ROLE_PERMISSIONS  (constante exportada)
 *   - getAllowedCanonicalRolesForItem  (función exportada)
 *   - seedPermisosBase  (función exportada — requiere mock de Supabase)
 *
 * NOTA DE DISCREPANCIA RESUELTA (ver entrega):
 *   buildSeedRowsForRoles NO está en module.exports de data/permisos.js.
 *   Los casos de contrato de esa función se prueban indirectamente a través de
 *   seedPermisosBase, que la invoca internamente.
 */

// ---------------------------------------------------------------------------
// MOCKS — deben declararse ANTES del require del módulo bajo prueba.
// ---------------------------------------------------------------------------

// Mock de supabase con cadena completa: from → select/upsert → eq → eq
// y from → upsert (para seedPermisosBase).
// Se construye aquí en lugar de reutilizar tests/__mocks__/supabase.js porque
// ese mock solo encadena insert, no upsert ni select con eq.

var mockUpsert   = jest.fn();
var mockEq2      = jest.fn();
var mockEq1      = jest.fn(() => ({ eq: mockEq2 }));
var mockSelectSb = jest.fn(() => ({ eq: mockEq1 }));

// from devuelve distinto objeto según la tabla llamada; usamos una implementación
// que acumula la cadena correcta para cada tabla.
var mockFrom = jest.fn(function(tabla) {
  if (tabla === 'roles') {
    return { select: mockSelectSb };
  }
  if (tabla === 'permisos_rol') {
    return { upsert: mockUpsert };
  }
  // fallback
  return { select: mockSelectSb, upsert: mockUpsert };
});

var mockSupabase = { from: mockFrom };

jest.mock('../../config/config', function() {
  return {
    supabase: mockSupabase,
    jwtSecret: 'test-secret'
  };
});

// ---------------------------------------------------------------------------
// REQUIRE del módulo bajo prueba (después de los mocks)
// ---------------------------------------------------------------------------

var permisos = require('../../data/permisos');
var CANONICAL_ROLE_PERMISSIONS  = permisos.CANONICAL_ROLE_PERMISSIONS;
var getAllowedCanonicalRolesForItem = permisos.getAllowedCanonicalRolesForItem;
var seedPermisosBase            = permisos.seedPermisosBase;

// ---------------------------------------------------------------------------
// Constantes de referencia derivadas del código real
// ---------------------------------------------------------------------------

// Los 7 roles canónicos de la consigna que SÍ tienen la clave 'activos'.
// (El octavo rol canónico, 'sst', no tiene activos — no está en esta lista.)
var ROLES_CON_ACTIVOS = [
  'superadmin_plataforma',
  'superadmin_emp',
  'administrador',
  'supervisor',
  'operador',
  'auditor',
  'reportes'
];

// ============================================================================
// 1. CANONICAL_ROLE_PERMISSIONS — presencia de la clave 'activos'
// ============================================================================

describe("CANONICAL_ROLE_PERMISSIONS — clave 'activos' por rol canónico", function() {

  ROLES_CON_ACTIVOS.forEach(function(rol) {
    it("debería contener la clave 'activos' para el rol '" + rol + "'", function() {
      expect(CANONICAL_ROLE_PERMISSIONS[rol]).toBeDefined();
      expect(CANONICAL_ROLE_PERMISSIONS[rol].activos).toBeDefined();
      expect(Array.isArray(CANONICAL_ROLE_PERMISSIONS[rol].activos)).toBe(true);
      expect(CANONICAL_ROLE_PERMISSIONS[rol].activos.length).toBeGreaterThan(0);
    });
  });

});

// ============================================================================
// 2. getAllowedCanonicalRolesForItem('activos', 'ver')
// ============================================================================

describe("getAllowedCanonicalRolesForItem — acción 'ver' sobre 'activos'", function() {

  it('debería retornar un array', function() {
    var resultado = getAllowedCanonicalRolesForItem('activos', 'ver');
    expect(Array.isArray(resultado)).toBe(true);
  });

  // Los 7 roles de la consigna todos tienen 'ver' en activos.
  ROLES_CON_ACTIVOS.forEach(function(rol) {
    it("debería incluir el rol '" + rol + "'", function() {
      var resultado = getAllowedCanonicalRolesForItem('activos', 'ver');
      expect(resultado).toContain(rol);
    });
  });

  it("NO debería incluir 'sst' (sst no tiene la clave activos)", function() {
    var resultado = getAllowedCanonicalRolesForItem('activos', 'ver');
    expect(resultado).not.toContain('sst');
  });

  it("NO debería incluir 'conductor' (conductor no es rol canónico con permisos)", function() {
    var resultado = getAllowedCanonicalRolesForItem('activos', 'ver');
    expect(resultado).not.toContain('conductor');
  });

});

// ============================================================================
// 3. getAllowedCanonicalRolesForItem('activos', 'crear')
// ============================================================================

describe("getAllowedCanonicalRolesForItem — acción 'crear' sobre 'activos'", function() {

  // Roles con 'crear' en activos según data/permisos.js:
  //   superadmin_plataforma : ['ver','crear','editar','autorizar','eliminar']  línea 5
  //   superadmin_emp        : ['ver','crear','editar','eliminar']               línea 18
  //   administrador         : ['ver','crear','editar']                          línea 31
  // supervisor, operador, auditor, reportes NO tienen 'crear' en activos.

  it('debería retornar exactamente los roles con crear en activos', function() {
    var resultado = getAllowedCanonicalRolesForItem('activos', 'crear');
    var esperados = ['superadmin_plataforma', 'superadmin_emp', 'administrador'];

    expect(resultado.sort()).toEqual(esperados.sort());
  });

  it("debería incluir 'superadmin_plataforma'", function() {
    var resultado = getAllowedCanonicalRolesForItem('activos', 'crear');
    expect(resultado).toContain('superadmin_plataforma');
  });

  it("debería incluir 'superadmin_emp'", function() {
    var resultado = getAllowedCanonicalRolesForItem('activos', 'crear');
    expect(resultado).toContain('superadmin_emp');
  });

  it("debería incluir 'administrador'", function() {
    var resultado = getAllowedCanonicalRolesForItem('activos', 'crear');
    expect(resultado).toContain('administrador');
  });

  it("NO debería incluir 'supervisor' (supervisor.activos no tiene 'crear')", function() {
    var resultado = getAllowedCanonicalRolesForItem('activos', 'crear');
    expect(resultado).not.toContain('supervisor');
  });

  it("NO debería incluir 'operador'", function() {
    var resultado = getAllowedCanonicalRolesForItem('activos', 'crear');
    expect(resultado).not.toContain('operador');
  });

});

// ============================================================================
// 4. getAllowedCanonicalRolesForItem('activos', 'autorizar')
// ============================================================================

describe("getAllowedCanonicalRolesForItem — acción 'autorizar' sobre 'activos'", function() {

  // Roles con 'autorizar' en activos según data/permisos.js:
  //   superadmin_plataforma : ['ver','crear','editar','autorizar','eliminar']  línea 5
  //   supervisor            : ['ver','editar','autorizar']                      línea 40
  // El resto NO tiene 'autorizar' en activos.
  // La consigna esperaba exactamente ['superadmin_plataforma','supervisor'] — coincide.

  it("debería retornar exactamente ['superadmin_plataforma', 'supervisor']", function() {
    var resultado = getAllowedCanonicalRolesForItem('activos', 'autorizar');
    expect(resultado.sort()).toEqual(['superadmin_plataforma', 'supervisor'].sort());
  });

  it("debería incluir 'superadmin_plataforma'", function() {
    var resultado = getAllowedCanonicalRolesForItem('activos', 'autorizar');
    expect(resultado).toContain('superadmin_plataforma');
  });

  it("debería incluir 'supervisor'", function() {
    var resultado = getAllowedCanonicalRolesForItem('activos', 'autorizar');
    expect(resultado).toContain('supervisor');
  });

  it("NO debería incluir 'superadmin_emp' (no tiene 'autorizar' en activos)", function() {
    var resultado = getAllowedCanonicalRolesForItem('activos', 'autorizar');
    expect(resultado).not.toContain('superadmin_emp');
  });

  it("NO debería incluir 'administrador'", function() {
    var resultado = getAllowedCanonicalRolesForItem('activos', 'autorizar');
    expect(resultado).not.toContain('administrador');
  });

});

// ============================================================================
// 5. seedPermisosBase — invoca upsert con filas que contienen modulo:'activos'
//    y con onConflict:'rol_id,modulo,accion'
//
//    buildSeedRowsForRoles no está exportado (ver NOTA DE DISCREPANCIA RESUELTA).
//    Se prueba indirectamente: seedPermisosBase llama a buildSeedRowsForRoles
//    internamente y luego pasa las filas a upsert.
//    Se inyectan roles de BD ficticios vía mock de supabase.from('roles').select().
// ============================================================================

describe('seedPermisosBase — contrato con Supabase (mock)', function() {

  beforeEach(function() {
    mockFrom.mockClear();
    mockSelectSb.mockClear();
    mockEq1.mockClear();
    mockEq2.mockClear();
    mockUpsert.mockClear();

    // from('roles').select() devuelve roles de prueba que incluyen 'supervisor'
    // para garantizar que habrá filas con modulo:'activos' en el upsert.
    mockSelectSb.mockResolvedValueOnce({
      data: [
        { id: 'uuid-sup-001', nombre: 'supervisor' },
        { id: 'uuid-adm-002', nombre: 'administrador' }
      ],
      error: null
    });

    // from('permisos_rol').upsert() responde sin error
    mockUpsert.mockResolvedValueOnce({ error: null });
  });

  it("debería invocar supabase.from('roles') para obtener los roles", async function() {
    await seedPermisosBase();
    expect(mockFrom).toHaveBeenCalledWith('roles');
  });

  it("debería invocar supabase.from('permisos_rol') para el upsert", async function() {
    await seedPermisosBase();
    expect(mockFrom).toHaveBeenCalledWith('permisos_rol');
  });

  it("debería invocar upsert con onConflict:'rol_id,modulo,accion'", async function() {
    await seedPermisosBase();
    expect(mockUpsert).toHaveBeenCalledTimes(1);

    var llamada = mockUpsert.mock.calls[0];
    var opciones = llamada[1]; // segundo argumento: { onConflict, ignoreDuplicates }
    expect(opciones.onConflict).toBe('rol_id,modulo,accion');
  });

  it("debería incluir al menos una fila con modulo:'activos' para supervisor", async function() {
    await seedPermisosBase();

    var filas = mockUpsert.mock.calls[0][0]; // primer argumento: array de filas
    expect(Array.isArray(filas)).toBe(true);

    var filasActivos = filas.filter(function(f) { return f.modulo === 'activos'; });
    expect(filasActivos.length).toBeGreaterThan(0);
  });

  it("las filas de activos para supervisor deben tener rol_id:'uuid-sup-001' y permitido:true", async function() {
    await seedPermisosBase();

    var filas = mockUpsert.mock.calls[0][0];
    var filasSupVeh = filas.filter(function(f) {
      return f.modulo === 'activos' && f.rol_id === 'uuid-sup-001';
    });

    // supervisor.activos = ['ver','editar','autorizar'] — 3 filas esperadas
    expect(filasSupVeh.length).toBe(3);

    filasSupVeh.forEach(function(f) {
      expect(f.permitido).toBe(true);
      expect(['ver', 'editar', 'autorizar']).toContain(f.accion);
    });
  });

  it('debería lanzar el error de Supabase si el upsert falla', async function() {
    // Resetear y reconfigurar para este caso de error
    mockSelectSb.mockReset();
    mockUpsert.mockReset();

    mockSelectSb.mockResolvedValueOnce({
      data: [{ id: 'uuid-sup-001', nombre: 'supervisor' }],
      error: null
    });
    mockUpsert.mockResolvedValueOnce({ error: new Error('DB failure') });

    await expect(seedPermisosBase()).rejects.toThrow('DB failure');
  });

  it('debería lanzar el error si la consulta de roles falla', async function() {
    mockSelectSb.mockReset();
    mockUpsert.mockReset();

    mockSelectSb.mockResolvedValueOnce({
      data: null,
      error: new Error('roles query failed')
    });

    await expect(seedPermisosBase()).rejects.toThrow('roles query failed');
  });

});
