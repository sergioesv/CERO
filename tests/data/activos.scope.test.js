'use strict';

/**
 * tests/data/activos.scope.test.js — PR 4 multi-tenant.
 * listarActivos (nuevo): reemplaza la query global de rutas/activos.js
 * y filtra la flota por las sedes del scope.
 */

function crearQueryMock(resultado) {
  var q = { _resultado: resultado };
  ['select', 'eq', 'in', 'not', 'neq', 'order', 'limit'].forEach(function (m) {
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
    : crearQueryMock({ data: [], error: null });
});

jest.mock('../../config/config', function () {
  return {
    supabase: { from: mockFrom },
    TABLES: {
      activos: 'activos', conductores: 'conductores',
      preoperacionales: 'preoperacionales', sesionesActivas: 'sesiones_activas'
    },
    MAX_KM_SALTO: 500
  };
});

var tenantScope = require('../../servicios/tenantScope');
var activosData = require('../../data/activos');

var SEDE_A = 'aaaaaaaa-0000-0000-0000-000000000001';

var scope;
beforeEach(async function () {
  colas = {};
  mockFrom.mockClear();
  scope = await tenantScope.desdeUsuario({ id: 'u1', sedes: [SEDE_A], empresa_id: 'e1' });
});

describe('listarActivos', function () {
  test('sin scope lanza — la flota nunca se lista global', async function () {
    await expect(activosData.listarActivos()).rejects.toThrow(/tenantScope requerido/);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  test('filtra por sede del scope y excluye sin placa', async function () {
    var q = encolar('activos', { data: [{ id: 'a1', placa: 'ABC123', sede_id: SEDE_A }], error: null });
    var data = await activosData.listarActivos(scope);
    expect(data).toHaveLength(1);
    expect(q.in).toHaveBeenCalledWith('sede_id', [SEDE_A]);
    expect(q.not).toHaveBeenCalledWith('placa', 'is', null);
  });

  test('error de BD lanza (no lista vacía silenciosa)', async function () {
    encolar('activos', { data: null, error: { message: 'boom' } });
    await expect(activosData.listarActivos(scope)).rejects.toBeTruthy();
  });
});
