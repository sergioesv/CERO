'use strict';

/**
 * tests/data/plantillas.scope.test.js — PR 4 multi-tenant.
 * Listado: globales + propias. CRUD: solo plantillas de la empresa;
 * las globales (empresa_id null) solo las toca superadmin.
 */

function crearQueryMock(resultado) {
  var q = { _resultado: resultado };
  ['select', 'insert', 'update', 'delete', 'eq', 'in', 'is', 'or', 'order', 'limit'].forEach(function (m) {
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
  return { supabase: { from: mockFrom }, TABLES: { activos: 'activos' } };
});

var tenantScope = require('../../servicios/tenantScope');
var plantillasData = require('../../data/plantillas');

var SEDE_A = 'aaaaaaaa-0000-0000-0000-000000000001';
var EMPRESA_1 = '11111111-0000-0000-0000-000000000001';
var EMPRESA_2 = '22222222-0000-0000-0000-000000000002';

var scope;
beforeEach(async function () {
  colas = {};
  mockFrom.mockClear();
  jest.spyOn(console, 'log').mockImplementation(function () {});
  scope = await tenantScope.desdeUsuario({ id: 'u1', sedes: [SEDE_A], empresa_id: EMPRESA_1 });
});
afterEach(function () { console.log.mockRestore(); });

describe('listarPlantillas', function () {
  test('sin scope lanza', async function () {
    await expect(plantillasData.listarPlantillas()).rejects.toThrow(/tenantScope requerido/);
  });

  test('usuario normal: globales + de su empresa', async function () {
    var q = encolar('plantillas_inspeccion', { data: [], error: null });
    await plantillasData.listarPlantillas(scope);
    expect(q.or).toHaveBeenCalledWith('empresa_id.is.null,empresa_id.eq.' + EMPRESA_1);
  });

  test('superadmin: sin filtro', async function () {
    encolar('sedes', { data: [{ id: SEDE_A }], error: null });
    var sa = await tenantScope.desdeUsuario({ id: 'sa', roles: ['superadmin_plataforma'] });
    var q = encolar('plantillas_inspeccion', { data: [], error: null });
    await plantillasData.listarPlantillas(sa);
    expect(q.or).not.toHaveBeenCalled();
  });
});

describe('crearPlantilla', function () {
  test('usuario normal: empresa_id forzado del scope, ignora el del body', async function () {
    var q = encolar('plantillas_inspeccion', { data: { id: 'p1' }, error: null });
    await plantillasData.crearPlantilla(scope, { nombre: 'X', empresa_id: EMPRESA_2 });
    var fila = q.insert.mock.calls[0][0][0];
    expect(fila.empresa_id).toBe(EMPRESA_1);
  });
});

describe('CRUD anidado — pertenencia vía plantilla', function () {
  test('actualizarPlantilla de otra empresa → 403 sin UPDATE', async function () {
    encolar('plantillas_inspeccion', { data: { id: 'p-ajena', empresa_id: EMPRESA_2 }, error: null });
    await expect(plantillasData.actualizarPlantilla(scope, 'p-ajena', { nombre: 'Y' }))
      .rejects.toMatchObject({ status: 403 });
    expect((colas.plantillas_inspeccion || []).length).toBe(0);
  });

  test('actualizarPlantilla global: usuario normal → 403; superadmin → pasa', async function () {
    encolar('plantillas_inspeccion', { data: { id: 'p-global', empresa_id: null }, error: null });
    await expect(plantillasData.actualizarPlantilla(scope, 'p-global', { nombre: 'Y' }))
      .rejects.toMatchObject({ status: 403 });

    encolar('sedes', { data: [{ id: SEDE_A }], error: null });
    var sa = await tenantScope.desdeUsuario({ id: 'sa', roles: ['superadmin_plataforma'] });
    encolar('plantillas_inspeccion', { data: { id: 'p-global', empresa_id: null }, error: null });
    var qUpd = encolar('plantillas_inspeccion', { data: { id: 'p-global' }, error: null });
    var r = await plantillasData.actualizarPlantilla(sa, 'p-global', { nombre: 'Y' });
    expect(r.id).toBe('p-global');
    expect(qUpd.update).toHaveBeenCalled();
  });

  test('crearGrupo en plantilla propia → inserta', async function () {
    encolar('plantillas_inspeccion', { data: { id: 'p1', empresa_id: EMPRESA_1 }, error: null });
    var q = encolar('plantilla_grupos', { data: { id: 'g1' }, error: null });
    var r = await plantillasData.crearGrupo(scope, { plantilla_id: 'p1', nombre: 'G' });
    expect(r.id).toBe('g1');
    expect(q.insert).toHaveBeenCalled();
  });

  test('eliminarGrupo de plantilla ajena → 403 sin DELETE (resuelve grupo→plantilla)', async function () {
    encolar('plantilla_grupos', { data: { plantilla_id: 'p-ajena' }, error: null });
    encolar('plantillas_inspeccion', { data: { id: 'p-ajena', empresa_id: EMPRESA_2 }, error: null });
    await expect(plantillasData.eliminarGrupo(scope, 'g-ajeno'))
      .rejects.toMatchObject({ status: 403 });
    expect((colas.plantilla_grupos || []).length).toBe(0);
  });

  test('actualizarItem resuelve item→grupo→plantilla y bloquea ajenos', async function () {
    encolar('plantilla_items', { data: { grupo_id: 'g-ajeno' }, error: null });
    encolar('plantilla_grupos', { data: { plantilla_id: 'p-ajena' }, error: null });
    encolar('plantillas_inspeccion', { data: { id: 'p-ajena', empresa_id: EMPRESA_2 }, error: null });
    await expect(plantillasData.actualizarItem(scope, 'i-ajeno', { nombre: 'Y' }))
      .rejects.toMatchObject({ status: 403 });
    expect((colas.plantilla_items || []).length).toBe(0);
  });
});
