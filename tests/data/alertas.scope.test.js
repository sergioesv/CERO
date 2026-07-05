'use strict';

/**
 * tests/data/alertas.scope.test.js — PR 3 multi-tenant.
 * Invariante crítico: las alertas WhatsApp de una empresa jamás
 * llegan a supervisores de otra (obtenerContactosPorCargo filtra
 * por sede), y los barridos de vencimientos llevan scope.
 */

function crearQueryMock(resultado) {
  var q = { _resultado: resultado };
  ['select', 'update', 'eq', 'in', 'neq', 'not', 'gt', 'gte', 'lt', 'lte',
   'order', 'limit'].forEach(function (m) {
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
    TABLES: { activos: 'activos', conductores: 'conductores', preoperacionales: 'preoperacionales' }
  };
});

jest.mock('../../data/activos', function () {
  return {
    obtenerActivoIdPorPlaca: jest.fn().mockResolvedValue(null),
    registrarCambioEstado: jest.fn().mockResolvedValue({ error: null })
  };
});

var tenantScope = require('../../servicios/tenantScope');
var alertasData = require('../../data/alertas');

var SEDE_A = 'aaaaaaaa-0000-0000-0000-000000000001';

var scope;
beforeEach(async function () {
  colas = {};
  mockFrom.mockClear();
  jest.spyOn(console, 'log').mockImplementation(function () {});
  scope = await tenantScope.desdeUsuario({ id: 'u1', sedes: [SEDE_A], empresa_id: 'e1' });
});
afterEach(function () { console.log.mockRestore(); });

describe('fail-closed', function () {
  test('vencimientos y contactos lanzan sin scope', async function () {
    await expect(alertasData.obtenerVencimientosActivos()).rejects.toThrow(/tenantScope requerido/);
    await expect(alertasData.obtenerVencimientosLicencias(null)).rejects.toThrow(/tenantScope requerido/);
    await expect(alertasData.obtenerContactosPorCargo(undefined, 'Supervisor')).rejects.toThrow(/tenantScope requerido/);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('obtenerContactosPorCargo — el corazón del leak de WhatsApp', function () {
  test('filtra conductores por sede del scope', async function () {
    var q = encolar('conductores', { data: [{ nombre: 'Sup A', telefono: '+57300', cargo: 'Supervisor' }], error: null });
    var contactos = await alertasData.obtenerContactosPorCargo(scope, 'Supervisor');
    expect(contactos).toHaveLength(1);
    expect(q.in).toHaveBeenCalledWith('sede_id', [SEDE_A]);
    expect(q.eq).toHaveBeenCalledWith('cargo', 'Supervisor');
  });

  test('scope paraSedes (cron por sede del activo) también filtra', async function () {
    var sedeScope = tenantScope.paraSedes([SEDE_A], 'test cron');
    var q = encolar('conductores', { data: [], error: null });
    await alertasData.obtenerContactosPorCargo(sedeScope, 'Administrador');
    expect(q.in).toHaveBeenCalledWith('sede_id', [SEDE_A]);
  });
});

describe('vencimientos con scope y metadatos de tenant', function () {
  test('obtenerVencimientosActivos filtra por sede y expone activo_id y sede_id', async function () {
    var q = encolar('activos', {
      data: [{
        id: 'act-1', placa: 'ABC123', sede_id: SEDE_A, datos: {},
        documentos: { soat_vencimiento: '2026-07-10' }, bloqueado: false
      }],
      error: null
    });
    var alertas = await alertasData.obtenerVencimientosActivos(scope);
    expect(q.in).toHaveBeenCalledWith('sede_id', [SEDE_A]);
    expect(alertas).toHaveLength(1);
    expect(alertas[0].activo_id).toBe('act-1');
    expect(alertas[0].sede_id).toBe(SEDE_A);
  });

  test('obtenerVencimientosLicencias filtra por sede y expone sede_id', async function () {
    var q = encolar('conductores', {
      data: [{ id: 'c1', nombre: 'X', telefono: 't', sede_id: SEDE_A, licencia_vencimiento: '2026-07-10' }],
      error: null
    });
    var alertas = await alertasData.obtenerVencimientosLicencias(scope);
    expect(q.in).toHaveBeenCalledWith('sede_id', [SEDE_A]);
    expect(alertas[0].sede_id).toBe(SEDE_A);
  });

  test('scope de sistema (cron) no filtra — barrido de toda la plataforma', async function () {
    var q = encolar('activos', { data: [], error: null });
    await alertasData.obtenerVencimientosActivos(tenantScope.sistema('cron test'));
    expect(q.in).not.toHaveBeenCalled();
  });
});
