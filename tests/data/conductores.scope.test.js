'use strict';

/**
 * tests/data/conductores.scope.test.js — PR 4 multi-tenant.
 * Panel de conductores: nada se lee ni escribe fuera de las sedes
 * del scope; crear exige sede válida del tenant.
 */

function crearQueryMock(resultado) {
  var q = { _resultado: resultado };
  ['select', 'insert', 'update', 'eq', 'in', 'order', 'limit'].forEach(function (m) {
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
    TABLES: { conductores: 'conductores', activos: 'activos' }
  };
});

var tenantScope = require('../../servicios/tenantScope');
var conductoresData = require('../../data/conductores');

var SEDE_A = 'aaaaaaaa-0000-0000-0000-000000000001';
var SEDE_B = 'bbbbbbbb-0000-0000-0000-000000000002';

var scope;
beforeEach(async function () {
  colas = {};
  mockFrom.mockClear();
  scope = await tenantScope.desdeUsuario({ id: 'u1', sedes: [SEDE_A], empresa_id: 'e1' });
});

describe('fail-closed', function () {
  test('todas las funciones del panel lanzan sin scope', async function () {
    await expect(conductoresData.listarConductores()).rejects.toThrow(/tenantScope requerido/);
    await expect(conductoresData.obtenerConductorPorId(null, 'c1')).rejects.toThrow(/tenantScope requerido/);
    await expect(conductoresData.crearConductor(undefined, { nombre: 'X', cedula: '1' })).rejects.toThrow(/tenantScope requerido/);
    await expect(conductoresData.actualizarConductor({}, 'c1', {})).rejects.toThrow(/tenantScope requerido/);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('lecturas', function () {
  test('listarConductores filtra por sede', async function () {
    var q = encolar('conductores', { data: [{ id: 'c1' }], error: null });
    var data = await conductoresData.listarConductores(scope);
    expect(data).toHaveLength(1);
    expect(q.in).toHaveBeenCalledWith('sede_id', [SEDE_A]);
  });

  test('obtenerConductorPorId de otro tenant → null', async function () {
    var q = encolar('conductores', { data: null, error: null });
    var r = await conductoresData.obtenerConductorPorId(scope, 'c-ajeno');
    expect(r).toBe(null);
    expect(q.in).toHaveBeenCalledWith('sede_id', [SEDE_A]);
  });
});

describe('crearConductor', function () {
  test('sede del tenant → inserta con esa sede', async function () {
    var q = encolar('conductores', { data: { id: 'c-nuevo', sede_id: SEDE_A }, error: null });
    var r = await conductoresData.crearConductor(scope, {
      nombre: 'Nuevo', cedula: '123', sede_id: SEDE_A
    });
    expect(r.id).toBe('c-nuevo');
    var fila = q.insert.mock.calls[0][0][0];
    expect(fila.sede_id).toBe(SEDE_A);
  });

  test('sede ajena → 403 sin insertar', async function () {
    await expect(conductoresData.crearConductor(scope, {
      nombre: 'X', cedula: '1', sede_id: SEDE_B
    })).rejects.toMatchObject({ status: 403 });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  test('sin sede → 400 sin insertar (fail-closed: no más huérfanos)', async function () {
    await expect(conductoresData.crearConductor(scope, {
      nombre: 'X', cedula: '1'
    })).rejects.toMatchObject({ status: 400 });
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('actualizarConductor', function () {
  test('conductor de otro tenant → error 404, sin UPDATE', async function () {
    encolar('conductores', { data: null, error: null }); // check pertenencia sin fila
    await expect(conductoresData.actualizarConductor(scope, 'c-ajeno', { nombre: 'Y' }))
      .rejects.toMatchObject({ status: 404 });
    expect((colas.conductores || []).length).toBe(0);
  });

  test('mover a sede ajena → 403', async function () {
    encolar('conductores', { data: { id: 'c1' }, error: null }); // pertenece
    await expect(conductoresData.actualizarConductor(scope, 'c1', { sede_id: SEDE_B }))
      .rejects.toMatchObject({ status: 403 });
  });

  test('actualización propia válida → UPDATE', async function () {
    encolar('conductores', { data: { id: 'c1' }, error: null });
    var qUpd = encolar('conductores', { data: { id: 'c1', nombre: 'Y' }, error: null });
    var r = await conductoresData.actualizarConductor(scope, 'c1', { nombre: 'Y' });
    expect(r.nombre).toBe('Y');
    expect(qUpd.update).toHaveBeenCalled();
  });
});
