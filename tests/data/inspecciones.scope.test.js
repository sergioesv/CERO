'use strict';

/**
 * tests/data/inspecciones.scope.test.js — PR 3 multi-tenant.
 * listarPreoperacionales y obtenerPreoperacionalDetalle exigen scope
 * y filtran por la sede del activo (join !inner).
 */

function crearQueryMock(resultado) {
  var q = { _resultado: resultado };
  ['select', 'eq', 'in', 'gte', 'lte', 'order', 'limit'].forEach(function (m) {
    q[m] = jest.fn(function () { return q; });
  });
  q.maybeSingle = jest.fn(function () { return Promise.resolve(q._resultado); });
  q.single = jest.fn(function () { return Promise.resolve(q._resultado); });
  q.then = function (onOk, onErr) { return Promise.resolve(q._resultado).then(onOk, onErr); };
  return q;
}

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
    supabase: { from: mockFrom },
    TABLES: { activos: 'activos', preoperacionales: 'preoperacionales' },
    MAX_KM_SALTO: 500
  };
});

var tenantScope = require('../../servicios/tenantScope');
var inspeccionesData = require('../../data/inspecciones');

var SEDE_A = 'aaaaaaaa-0000-0000-0000-000000000001';

var scope;
beforeEach(async function () {
  colas = {};
  mockFrom.mockClear();
  scope = await tenantScope.desdeUsuario({ id: 'u1', sedes: [SEDE_A], empresa_id: 'e1' });
});

describe('fail-closed', function () {
  test('listar y detalle lanzan sin scope', async function () {
    await expect(inspeccionesData.listarPreoperacionales({})).rejects.toThrow(/tenantScope requerido/);
    await expect(inspeccionesData.obtenerPreoperacionalDetalle(undefined, 'p1')).rejects.toThrow(/tenantScope requerido/);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('listarPreoperacionales', function () {
  test('embed !inner + filtro activos.sede_id', async function () {
    var q = encolar('preoperacionales', { data: [], error: null });
    await inspeccionesData.listarPreoperacionales(scope, {});
    expect(q.select.mock.calls[0][0]).toContain('activos:activo_id!inner(');
    expect(q.in).toHaveBeenCalledWith('activos.sede_id', [SEDE_A]);
  });

  test('los filtros normales siguen funcionando encima del scope', async function () {
    var q = encolar('preoperacionales', { data: [], error: null });
    await inspeccionesData.listarPreoperacionales(scope, { desde: '2026-07-01', activoId: 'act-1' });
    expect(q.gte).toHaveBeenCalledWith('fecha', '2026-07-01');
    expect(q.eq).toHaveBeenCalledWith('activo_id', 'act-1');
  });
});

describe('obtenerPreoperacionalDetalle', function () {
  test('preop de otro tenant → null (join sin fila)', async function () {
    var q = encolar('preoperacionales', { data: null, error: { code: 'PGRST116' } });
    var r = await inspeccionesData.obtenerPreoperacionalDetalle(scope, 'p-ajeno');
    expect(r).toBe(null);
    expect(q.in).toHaveBeenCalledWith('activos.sede_id', [SEDE_A]);
  });

  test('preop propio → registro con fotos y autorización', async function () {
    encolar('preoperacionales', { data: { id: 'p1', activos: { placa: 'ABC123' } }, error: null });
    encolar('evidencia', { data: [{ id: 'f1' }], error: null });
    encolar('autorizaciones_novedad', { data: [], error: null });
    var r = await inspeccionesData.obtenerPreoperacionalDetalle(scope, 'p1');
    expect(r.id).toBe('p1');
    expect(r.fotos).toHaveLength(1);
    expect(r.autorizacion).toBe(null);
  });
});
