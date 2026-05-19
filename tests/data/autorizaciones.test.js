'use strict';

/**
 * tests/data/autorizaciones.test.js
 *
 * Tests unitarios para data/autorizaciones.js — función crearAutorizacionDesdeBloqueo.
 *
 * Esta función NO existe aún en el código productivo. Estos tests FALLARÁN
 * hasta que el refactor-engineer la implemente. Ese fallo es el comportamiento esperado.
 *
 * Estrategia de mocks:
 *   - Mock LOCAL de config/config (no se usa tests/__mocks__/supabase.js porque esa cadena
 *     no soporta .from().select().eq().limit()). Se declara aquí un mock que soporta AMBAS
 *     cadenas:
 *       · .from(tabla).select(cols).eq(col, val).limit(n)  → promesa controlable
 *       · .from(tabla).insert(payload).select().single()   → promesa controlable
 *   - El módulo bajo prueba se require DESPUÉS de declarar todos los jest.mock().
 *
 * Campos del esquema autorizaciones_novedad que se verifican:
 *   preoperacional_id, activo_id, conductor_id, novedades_bloqueo,
 *   decision (null), supervisor_id (null), justificacion (null),
 *   timestamp_alerta (ISO string), timestamp_decision (null).
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. MOCKS LOCALES (declarados antes de cualquier require del módulo bajo prueba)
// ─────────────────────────────────────────────────────────────────────────────

// Puntos de control para la cadena de SELECT (idempotencia)
var mockLimitSelect = jest.fn();
var mockEqSelect    = jest.fn(function() { return { limit: mockLimitSelect }; });
var mockSelectChain = jest.fn(function() { return { eq: mockEqSelect }; });

// Puntos de control para la cadena de INSERT
var mockSingleInsert = jest.fn();
var mockSelectInsert = jest.fn(function() { return { single: mockSingleInsert }; });
var mockInsertChain  = jest.fn(function() { return { select: mockSelectInsert }; });

// .from() devuelve un objeto con AMBAS cadenas disponibles
var mockFrom = jest.fn(function() {
  return {
    select: mockSelectChain,
    insert: mockInsertChain
  };
});

var mockSupabase = { from: mockFrom };

// Mock de config/config: supabase mock + constantes mínimas necesarias
// (config.js llama process.exit(1) si faltan env vars, por eso se mockea antes del require)
jest.mock('../../config/config', function() {
  return {
    supabase: mockSupabase,
    TABLES: {
      activos: 'activos',
      conductores: 'conductores',
      preoperacionales: 'preoperacionales',
      posoperacionales: 'posoperacionales',
      tanqueos: 'tanqueos',
      sesionesActivas: 'sesiones_activas',
      evidencia: 'evidencia'
    },
    MAX_KM_SALTO: 500
  };
});

// data/autorizaciones.js también importa modulos/alertas/notificador y data/activos.
// Los mockeamos para que no intenten conectarse a nada real.
jest.mock('../../modulos/alertas/notificador', function() {
  return {
    enviarWhatsApp: jest.fn().mockResolvedValue(undefined),
    notificarCriticas: jest.fn().mockResolvedValue(undefined)
  };
});

jest.mock('../../data/activos', function() {
  return {
    registrarCambioEstado: jest.fn().mockResolvedValue({ error: null }),
    obtenerActivoIdPorPlaca: jest.fn().mockResolvedValue(null),
    cargarActivoYConductor: jest.fn().mockResolvedValue({ error: null, conductor: null, vehiculo: null })
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. IMPORTS tras los mocks
// ─────────────────────────────────────────────────────────────────────────────

var autorizacionesData = require('../../data/autorizaciones');

// ─────────────────────────────────────────────────────────────────────────────
// 3. HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function resetAllMocks() {
  mockFrom.mockClear();

  // Restaurar cadena SELECT
  mockLimitSelect.mockReset();
  mockEqSelect.mockReset();
  mockEqSelect.mockReturnValue({ limit: mockLimitSelect });
  mockSelectChain.mockReset();
  mockSelectChain.mockReturnValue({ eq: mockEqSelect });

  // Restaurar cadena INSERT
  mockSingleInsert.mockReset();
  mockSelectInsert.mockReset();
  mockSelectInsert.mockReturnValue({ single: mockSingleInsert });
  mockInsertChain.mockReset();
  mockInsertChain.mockReturnValue({ select: mockSelectInsert });

  // Restaurar .from() con ambas cadenas
  mockFrom.mockReturnValue({
    select: mockSelectChain,
    insert: mockInsertChain
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('crearAutorizacionDesdeBloqueo — contrato de la función', function() {

  beforeEach(function() {
    resetAllMocks();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // TEST A — Happy path: no existe fila previa → INSERT y retorna creada: true
  // ────────────────────────────────────────────────────────────────────────────
  it('debería hacer INSERT y retornar { ok: true, creada: true } cuando no existe fila previa para ese preoperacional_id', async function() {
    // arrange: SELECT devuelve lista vacía (sin fila previa)
    mockLimitSelect.mockResolvedValueOnce({ error: null, data: [] });

    var insertedId = 'new-autorizacion-uuid';
    mockSingleInsert.mockResolvedValueOnce({
      error: null,
      data: {
        id: insertedId,
        preoperacional_id: 'preop-uuid-1',
        activo_id: 'activo-uuid-1',
        conductor_id: 'conductor-uuid-1',
        novedades_bloqueo: [{ grupo: 'g1', item: 'frenos', severidad: 'bloqueo' }],
        decision: null,
        supervisor_id: null,
        justificacion: null,
        timestamp_decision: null
      }
    });

    var novedadesBloqueo = [{ grupo: 'g1', item: 'frenos', severidad: 'bloqueo' }];

    // act
    var resultado = await autorizacionesData.crearAutorizacionDesdeBloqueo(
      'preop-uuid-1',
      novedadesBloqueo,
      'activo-uuid-1',
      'conductor-uuid-1'
    );

    // assert: retorno correcto
    expect(resultado).toEqual({
      ok: true,
      autorizacionId: insertedId,
      creada: true
    });

    // assert: INSERT fue llamado con los campos del contrato
    expect(mockInsertChain).toHaveBeenCalledTimes(1);
    var payloadInsert = mockInsertChain.mock.calls[0][0];

    expect(payloadInsert.preoperacional_id).toBe('preop-uuid-1');
    expect(payloadInsert.activo_id).toBe('activo-uuid-1');
    expect(payloadInsert.conductor_id).toBe('conductor-uuid-1');
    expect(payloadInsert.novedades_bloqueo).toEqual(novedadesBloqueo);
    expect(payloadInsert.decision).toBeNull();
    expect(payloadInsert.supervisor_id).toBeNull();
    expect(payloadInsert.justificacion).toBeNull();
    expect(typeof payloadInsert.timestamp_alerta).toBe('string');
    // timestamp_alerta debe ser un ISO 8601 válido
    expect(new Date(payloadInsert.timestamp_alerta).toISOString()).toBe(payloadInsert.timestamp_alerta);
    expect(payloadInsert.timestamp_decision).toBeNull();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // TEST B — Idempotencia: ya existe fila → NO hace INSERT, retorna creada: false
  // ────────────────────────────────────────────────────────────────────────────
  it('debería retornar { ok: true, creada: false } y NO llamar INSERT cuando ya existe fila para ese preoperacional_id', async function() {
    // arrange: SELECT devuelve fila existente
    var existingId = 'existing-uuid';
    mockLimitSelect.mockResolvedValueOnce({ error: null, data: [{ id: existingId }] });

    var novedadesBloqueo = [{ grupo: 'g1', item: 'frenos', severidad: 'bloqueo' }];

    // act
    var resultado = await autorizacionesData.crearAutorizacionDesdeBloqueo(
      'preop-uuid-2',
      novedadesBloqueo,
      'activo-uuid-2',
      'conductor-uuid-2'
    );

    // assert: retorno correcto con id existente
    expect(resultado).toEqual({
      ok: true,
      autorizacionId: existingId,
      creada: false
    });

    // assert: insert NO fue llamado
    expect(mockInsertChain).not.toHaveBeenCalled();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // TEST C — Error en SELECT → la función lanza
  // ────────────────────────────────────────────────────────────────────────────
  it('debería lanzar el error cuando el SELECT de idempotencia falla', async function() {
    // arrange: SELECT devuelve error
    var errorBd = new Error('connection timeout');
    errorBd.code = 'PGRST301';
    mockLimitSelect.mockResolvedValueOnce({ error: errorBd, data: null });

    var novedadesBloqueo = [{ grupo: 'g1', item: 'frenos', severidad: 'bloqueo' }];

    // act + assert
    await expect(
      autorizacionesData.crearAutorizacionDesdeBloqueo(
        'preop-uuid-3',
        novedadesBloqueo,
        'activo-uuid-3',
        'conductor-uuid-3'
      )
    ).rejects.toThrow();

    // El INSERT nunca se debe haber llamado
    expect(mockInsertChain).not.toHaveBeenCalled();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // TEST D — Error en INSERT → la función lanza
  // ────────────────────────────────────────────────────────────────────────────
  it('debería lanzar el error cuando el INSERT falla', async function() {
    // arrange: SELECT no encuentra fila previa
    mockLimitSelect.mockResolvedValueOnce({ error: null, data: [] });

    // INSERT devuelve error
    var errorInsert = new Error('foreign key violation');
    errorInsert.code = '23503';
    mockSingleInsert.mockResolvedValueOnce({ error: errorInsert, data: null });

    var novedadesBloqueo = [{ grupo: 'g1', item: 'frenos', severidad: 'bloqueo' }];

    // act + assert
    await expect(
      autorizacionesData.crearAutorizacionDesdeBloqueo(
        'preop-uuid-4',
        novedadesBloqueo,
        'activo-uuid-4',
        'conductor-uuid-4'
      )
    ).rejects.toThrow();
  });

});
