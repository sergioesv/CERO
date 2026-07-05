'use strict';

/**
 * tests/data/autorizaciones.scope.test.js — PR 3 multi-tenant.
 * Pendientes/resueltas filtran por sede del activo; registrarDecision
 * rechaza autorizaciones ajenas; el historial no resuelve placas de
 * otros tenants.
 */

function crearQueryMock(resultado) {
  var q = { _resultado: resultado };
  ['select', 'update', 'insert', 'eq', 'in', 'is', 'not', 'order', 'limit'].forEach(function (m) {
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
    TABLES: {
      activos: 'activos', conductores: 'conductores',
      preoperacionales: 'preoperacionales', posoperacionales: 'posoperacionales',
      tanqueos: 'tanqueos'
    }
  };
});

jest.mock('../../modulos/alertas/notificador', function () {
  return {
    enviarWhatsApp: jest.fn().mockResolvedValue(true),
    notificarCriticas: jest.fn().mockResolvedValue(undefined)
  };
});

jest.mock('../../data/activos', function () {
  return {
    obtenerActivoIdPorPlaca: jest.fn().mockResolvedValue(null),
    registrarCambioEstado: jest.fn().mockResolvedValue({ error: null })
  };
});

var tenantScope = require('../../servicios/tenantScope');
var autorizacionesData = require('../../data/autorizaciones');

var SEDE_A = 'aaaaaaaa-0000-0000-0000-000000000001';

var scope;
beforeEach(async function () {
  colas = {};
  mockFrom.mockClear();
  scope = await tenantScope.desdeUsuario({ id: 'u1', sedes: [SEDE_A], empresa_id: 'e1' });
});

describe('fail-closed', function () {
  test('lecturas y decisión lanzan sin scope', async function () {
    await expect(autorizacionesData.obtenerAutorizacionesPendientes()).rejects.toThrow(/tenantScope requerido/);
    await expect(autorizacionesData.obtenerAutorizacionesResueltas(null)).rejects.toThrow(/tenantScope requerido/);
    await expect(autorizacionesData.obtenerDocumentosActivos(undefined)).rejects.toThrow(/tenantScope requerido/);
    await expect(autorizacionesData.registrarDecision(undefined, 'a1', 'autorizar', 'x', 's1')).rejects.toThrow(/tenantScope requerido/);
    await expect(autorizacionesData.obtenerHistorialActivo({}, 'ABC123')).rejects.toThrow(/tenantScope requerido/);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('lecturas del panel', function () {
  test('pendientes: embed !inner + filtro por sede del activo', async function () {
    var q = encolar('autorizaciones_novedad', { data: [], error: null });
    await autorizacionesData.obtenerAutorizacionesPendientes(scope);
    expect(q.select.mock.calls[0][0]).toContain('activos:activo_id!inner(');
    expect(q.in).toHaveBeenCalledWith('activos.sede_id', [SEDE_A]);
  });

  test('resueltas: mismo filtro', async function () {
    var q = encolar('autorizaciones_novedad', { data: [], error: null });
    await autorizacionesData.obtenerAutorizacionesResueltas(scope);
    expect(q.in).toHaveBeenCalledWith('activos.sede_id', [SEDE_A]);
  });

  test('documentos: activos filtrados por sede', async function () {
    var q = encolar('activos', { data: [], error: null });
    await autorizacionesData.obtenerDocumentosActivos(scope);
    expect(q.in).toHaveBeenCalledWith('sede_id', [SEDE_A]);
  });
});

describe('registrarDecision — anti-IDOR de escritura', function () {
  test('autorización de otro tenant: no encontrada, sin UPDATE', async function () {
    var qCheck = encolar('autorizaciones_novedad', { data: null, error: { code: 'PGRST116' } });
    var r = await autorizacionesData.registrarDecision(scope, 'a-ajena', 'autorizar', 'justificacion valida', 's1');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no encontrada/);
    expect(qCheck.in).toHaveBeenCalledWith('activos.sede_id', [SEDE_A]);
    expect((colas.autorizaciones_novedad || []).length).toBe(0);
  });
});

describe('obtenerHistorialActivo', function () {
  test('placa de otro tenant: no resuelve → historial vacío sin tocar transaccionales', async function () {
    // resolverActivoPorPlaca consulta activos → sin fila
    encolar('activos', { data: null, error: null });
    var r = await autorizacionesData.obtenerHistorialActivo(scope, 'ZZZ999');
    expect(r.historial).toEqual([]);
    var tablas = mockFrom.mock.calls.map(function (c) { return c[0]; });
    expect(tablas).not.toContain('preoperacionales');
    expect(tablas).not.toContain('tanqueos');
  });
});
