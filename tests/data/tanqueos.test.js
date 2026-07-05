'use strict';

/**
 * tests/data/tanqueos.test.js
 *
 * Tests multi-tenant de data/tanqueos.js (PR 2 del plan tenantScope).
 * Invariante: ninguna función de lectura/escritura expuesta a rutas/
 * opera sin scope, y un scope de la sede A jamás alcanza tanqueos
 * cuyos activos pertenecen a la sede B.
 *
 * Se usa el tenantScope REAL (config mockeado) — integración data+scope.
 * Mocks locales de config/config, data/posoperacionales y data/activos.
 */

// ─────────────────────────────────────────────────────────────
// 1. MOCKS
// ─────────────────────────────────────────────────────────────

function crearQueryMock(resultado) {
  var q = { _resultado: resultado };
  ['select', 'insert', 'update', 'eq', 'in', 'neq', 'gt', 'gte', 'lt', 'lte',
   'not', 'is', 'order', 'limit'].forEach(function (m) {
    q[m] = jest.fn(function () { return q; });
  });
  q.maybeSingle = jest.fn(function () { return Promise.resolve(q._resultado); });
  q.single = jest.fn(function () { return Promise.resolve(q._resultado); });
  q.then = function (onOk, onErr) { return Promise.resolve(q._resultado).then(onOk, onErr); };
  return q;
}

// Cola FIFO por tabla; sin cola → resultado vacío por defecto
var colas = {};
function encolar(tabla, resultado) {
  var q = crearQueryMock(resultado);
  (colas[tabla] = colas[tabla] || []).push(q);
  return q;
}
var mockFrom = jest.fn(function (tabla) {
  var cola = colas[tabla];
  return (cola && cola.length) ? cola.shift()
    : crearQueryMock({ data: [], error: null, count: 0 });
});

jest.mock('../../config/config', function () {
  return {
    supabase: { from: mockFrom, storage: { from: jest.fn() } },
    TABLES: {
      activos: 'activos',
      conductores: 'conductores',
      preoperacionales: 'preoperacionales',
      posoperacionales: 'posoperacionales',
      tanqueos: 'tanqueos'
    }
  };
});

jest.mock('../../data/posoperacionales', function () {
  return { obtenerReferenciaKilometraje: jest.fn().mockResolvedValue({ km: null }) };
});

jest.mock('../../data/activos', function () {
  return { obtenerActivoIdPorPlaca: jest.fn().mockResolvedValue(null) };
});

var tenantScope = require('../../servicios/tenantScope');
var tanqueosData = require('../../data/tanqueos');

var SEDE_A = 'aaaaaaaa-0000-0000-0000-000000000001';
var SEDE_B = 'bbbbbbbb-0000-0000-0000-000000000002';
var EMPRESA_1 = '11111111-0000-0000-0000-000000000001';

var scope;

beforeEach(async function () {
  colas = {};
  mockFrom.mockClear();
  scope = await tenantScope.desdeUsuario({
    id: 'u1', empresa_id: EMPRESA_1, sedes: [SEDE_A], roles: ['admin_empresa']
  });
});

// ─────────────────────────────────────────────────────────────
// 2. FAIL-CLOSED: sin scope no hay query
// ─────────────────────────────────────────────────────────────

describe('fail-closed sin scope', function () {
  test('listarTanqueos, obtenerTanqueo, validarTanqueo, validarLote, obtenerConsolidado y obtenerFotoEvidencia lanzan sin scope', async function () {
    await expect(tanqueosData.listarTanqueos({})).rejects.toThrow(/tenantScope requerido/);
    await expect(tanqueosData.obtenerTanqueo(undefined, 't1')).rejects.toThrow(/tenantScope requerido/);
    await expect(tanqueosData.validarTanqueo(null, 't1', 'validar', '', 'u')).rejects.toThrow(/tenantScope requerido/);
    await expect(tanqueosData.validarLote({ sedeIds: [SEDE_A] }, ['t1'], 'u')).rejects.toThrow(/tenantScope requerido/);
    await expect(tanqueosData.obtenerConsolidado(undefined, '2026-07', null)).rejects.toThrow(/tenantScope requerido/);
    await expect(tanqueosData.obtenerFotoEvidencia(undefined, 'f1')).rejects.toThrow(/tenantScope requerido/);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────
// 3. LISTAR — join !inner por sede del activo
// ─────────────────────────────────────────────────────────────

describe('listarTanqueos', function () {
  test('aplica embed !inner y filtro activos.sede_id del scope', async function () {
    var qLista = encolar('tanqueos', { data: [], error: null });
    var resultado = await tanqueosData.listarTanqueos(scope, {});
    expect(resultado.error).toBeUndefined();
    var selectArg = qLista.select.mock.calls[0][0];
    expect(selectArg).toContain('activos:activo_id!inner(');
    expect(qLista.in).toHaveBeenCalledWith('activos.sede_id', [SEDE_A]);
  });

  test('placa que no pertenece al scope: responde vacío SIN consultar tanqueos', async function () {
    // resolverActivoPorPlaca consulta activos → sin fila
    encolar('activos', { data: null, error: null });
    var resultado = await tanqueosData.listarTanqueos(scope, { placa: 'ZZZ999' });
    expect(resultado.data).toEqual([]);
    expect(resultado.stats.total).toBe(0);
    var tablas = mockFrom.mock.calls.map(function (c) { return c[0]; });
    expect(tablas).not.toContain('tanqueos');
  });

  test('mapea placa del activo embebido a vehiculo_placa', async function () {
    encolar('tanqueos', {
      data: [{ id: 't1', activos: { placa: 'ABC123', datos: { marca: 'Toyota' } } }],
      error: null
    });
    var resultado = await tanqueosData.listarTanqueos(scope, {});
    expect(resultado.data[0].vehiculo_placa).toBe('ABC123');
    expect(resultado.data[0].vehiculos.marca).toBe('Toyota');
  });
});

// ─────────────────────────────────────────────────────────────
// 4. DETALLE Y ESCRITURAS — anti-IDOR
// ─────────────────────────────────────────────────────────────

describe('obtenerTanqueo', function () {
  test('tanqueo de otro tenant: el join !inner no devuelve fila → error', async function () {
    var q = encolar('tanqueos', { data: null, error: { code: 'PGRST116' } });
    var resultado = await tanqueosData.obtenerTanqueo(scope, 't-ajeno');
    expect(resultado.error).toBeTruthy();
    expect(resultado.data).toBe(null);
    expect(q.in).toHaveBeenCalledWith('activos.sede_id', [SEDE_A]);
  });
});

describe('validarTanqueo', function () {
  test('el check previo lleva el filtro de tenant — ajeno = no encontrado, sin UPDATE', async function () {
    var qCheck = encolar('tanqueos', { data: null, error: { code: 'PGRST116' } });
    var resultado = await tanqueosData.validarTanqueo(scope, 't-ajeno', 'validar', '', 'u1');
    expect(resultado.ok).toBe(false);
    expect(resultado.error).toMatch(/no encontrado/);
    expect(qCheck.in).toHaveBeenCalledWith('activos.sede_id', [SEDE_A]);
    expect(qCheck.update).not.toHaveBeenCalled();
    // no hubo segunda query de update
    expect((colas.tanqueos || []).length).toBe(0);
  });
});

describe('validarLote', function () {
  test('solo actualiza los ids que pertenecen al tenant', async function () {
    // check de pertenencia: de 3 ids pedidos, solo 2 son del tenant
    encolar('tanqueos', { data: [{ id: 't1' }, { id: 't3' }], error: null });
    var qUpdate = encolar('tanqueos', { data: null, error: null });
    var resultado = await tanqueosData.validarLote(scope, ['t1', 't2', 't3'], 'u1');
    expect(resultado.ok).toBe(true);
    expect(resultado.procesados).toBe(2);
    expect(qUpdate.in).toHaveBeenCalledWith('id', ['t1', 't3']);
  });

  test('ningún id del tenant → procesados 0 y sin UPDATE', async function () {
    encolar('tanqueos', { data: [], error: null });
    var resultado = await tanqueosData.validarLote(scope, ['t-ajeno'], 'u1');
    expect(resultado.ok).toBe(true);
    expect(resultado.procesados).toBe(0);
    expect((colas.tanqueos || []).length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
// 5. CONSOLIDADO Y MEDIA
// ─────────────────────────────────────────────────────────────

describe('obtenerConsolidado', function () {
  test('sede fuera del scope → Error 403 sin tocar la BD', async function () {
    await expect(tanqueosData.obtenerConsolidado(scope, '2026-07', SEDE_B))
      .rejects.toMatchObject({ status: 403 });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  test('sin sede explícita filtra por todas las sedes del scope', async function () {
    var q = encolar('tanqueos', { data: [], error: null });
    await tanqueosData.obtenerConsolidado(scope, '2026-07', null);
    expect(q.in).toHaveBeenCalledWith('activos.sede_id', [SEDE_A]);
    expect(q.eq).not.toHaveBeenCalledWith('sede_id', expect.anything());
  });

  test('con sede válida filtra por esa sede vía el activo', async function () {
    var q = encolar('tanqueos', { data: [], error: null });
    await tanqueosData.obtenerConsolidado(scope, '2026-07', SEDE_A);
    expect(q.eq).toHaveBeenCalledWith('activos.sede_id', SEDE_A);
  });

  test('mes inválido → error de formato', async function () {
    var resultado = await tanqueosData.obtenerConsolidado(scope, 'julio', null);
    expect(resultado.error).toMatch(/mes/i);
  });
});

describe('obtenerFotoEvidencia', function () {
  test('foto de un tanqueo ajeno → null (cierra IDOR del proxy media)', async function () {
    encolar('evidencia', { data: { foto_url: 'https://api.twilio.com/x', entidad_id: 't-ajeno' }, error: null });
    encolar('tanqueos', { data: null, error: null }); // check de pertenencia sin fila
    var resultado = await tanqueosData.obtenerFotoEvidencia(scope, 'f1');
    expect(resultado).toBe(null);
  });

  test('foto propia → devuelve la fila de evidencia', async function () {
    encolar('evidencia', { data: { foto_url: 'https://api.twilio.com/x', entidad_id: 't1' }, error: null });
    encolar('tanqueos', { data: { id: 't1' }, error: null });
    var resultado = await tanqueosData.obtenerFotoEvidencia(scope, 'f1');
    expect(resultado.foto_url).toBe('https://api.twilio.com/x');
  });
});
