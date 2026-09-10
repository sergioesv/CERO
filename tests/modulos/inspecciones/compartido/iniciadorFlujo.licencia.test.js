'use strict';

/**
 * tests/modulos/inspecciones/compartido/iniciadorFlujo.licencia.test.js
 *
 * Fija el bloqueo por licencia de conduccion vencida.
 *
 * Contexto: hasta el 2026-09-10 el flujo validaba que el VEHICULO no
 * estuviera bloqueado, pero nunca miraba la licencia del conductor. Un
 * conductor con licencia vencida completaba el preoperacional entero y el
 * PDF salia con "Licencia de conduccion — VENCIDO" en rojo, sin que nada
 * lo impidiera. Para PESV eso es un control que existe y no frena nada.
 *
 * Lo que se fija aqui:
 *   1. Licencia vencida en preoperacional  → PLATE_BLOCKED.
 *   2. Licencia que vence HOY              → deja pasar (aun vigente).
 *   3. Sin fecha registrada                → deja pasar (dato faltante != vencida).
 *   4. Posoperacional con licencia vencida → deja pasar (cierre de jornada).
 *   5. El code es PLATE_BLOCKED y no uno nuevo, porque es el unico que los
 *      tres caminos de placa propagan literalmente al conductor.
 */

jest.mock('../../../../config/config', function() {
  return {
    supabase: { from: jest.fn() },
    TABLES: { activos: 'activos', conductores: 'conductores' },
    MAX_KM_SALTO: 200
  };
});

var mockCargar = jest.fn();
jest.mock('../../../../data/activos', function() {
  return {
    cargarActivoYConductor: function() { return mockCargar.apply(null, arguments); },
    buscarPlacaSugerida: jest.fn()
  };
});

jest.mock('../../../../data/inspecciones', function() {
  return {
    obtenerReferenciaKilometraje: jest.fn().mockResolvedValue({ kilometraje: 1000, origen: 'activo' })
  };
});

jest.mock('../../../../servicios/ocr', function() { return {}; });
jest.mock('../../../../servicios/storage', function() {
  return { guardarFotoUnica: jest.fn(), obtenerMediaUrls: jest.fn().mockReturnValue([]) };
});
jest.mock('../../../../modulos/inspecciones/compartido/kilometraje', function() { return {}; });

var iniciador = require('../../../../modulos/inspecciones/compartido/iniciadorFlujo');

// ── helpers de fecha, relativos a hoy en Colombia ────────────────────────────
function ymdBogotaConDesfase(dias) {
  var hoy = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }) + 'T12:00:00');
  hoy.setDate(hoy.getDate() + dias);
  var m = String(hoy.getMonth() + 1).padStart(2, '0');
  var d = String(hoy.getDate()).padStart(2, '0');
  return hoy.getFullYear() + '-' + m + '-' + d;
}
var AYER = ymdBogotaConDesfase(-1);
var HOY  = ymdBogotaConDesfase(0);
var MANANA = ymdBogotaConDesfase(1);

function manejador(tipoFlujo) {
  return iniciador.crearManejadorPlaca({
    ESTADOS: { ESPERANDO_FOTO_ODOMETRO: 'ESPERANDO_FOTO_ODOMETRO' },
    mensajes: {},
    validaciones: { normalizarPlaca: function(p) { return String(p || '').toUpperCase().trim(); } },
    tipoFlujo: tipoFlujo,
    mensajeConfirmacion: function() { return '✅ Placa confirmada.'; }
  });
}

function conLicencia(fecha) {
  mockCargar.mockResolvedValue({
    error: null,
    vehiculo: { id: 'act-1', placa: 'DJO421', bloqueado: false, kilometraje: 1000 },
    conductor: { id: 'con-1', nombre: 'S Estrada', licencia_vencimiento: fecha }
  });
}

beforeEach(function() { mockCargar.mockReset(); });

describe('licenciaVencida', function() {
  it('vencida si la fecha es anterior a hoy', function() {
    expect(iniciador.licenciaVencida(AYER)).toBe(true);
  });
  it('vigente el mismo dia del vencimiento', function() {
    expect(iniciador.licenciaVencida(HOY)).toBe(false);
  });
  it('vigente si vence despues', function() {
    expect(iniciador.licenciaVencida(MANANA)).toBe(false);
  });
  it('sin fecha no se considera vencida', function() {
    expect(iniciador.licenciaVencida(null)).toBe(false);
    expect(iniciador.licenciaVencida('')).toBe(false);
  });
  it('acepta timestamp completo, no solo YYYY-MM-DD', function() {
    expect(iniciador.licenciaVencida(AYER + 'T00:00:00+00:00')).toBe(true);
  });
  it('una fecha con formato invalido no bloquea', function() {
    expect(iniciador.licenciaVencida('26/08/2026')).toBe(false);
  });
});

describe('flujoExigeLicenciaVigente', function() {
  it('preoperacional y tanqueo la exigen', function() {
    expect(iniciador.flujoExigeLicenciaVigente('preoperacional')).toBe(true);
    expect(iniciador.flujoExigeLicenciaVigente('tanqueo')).toBe(true);
  });
  it('posoperacional no la exige — es el cierre de una jornada ya ocurrida', function() {
    expect(iniciador.flujoExigeLicenciaVigente('posoperacional')).toBe(false);
  });
});

describe('crearManejadorPlaca — bloqueo por licencia', function() {
  it('bloquea el preoperacional con licencia vencida', async function() {
    conLicencia(AYER);
    var res = await manejador('preoperacional')({}, 'whatsapp:+573105110497', 'DJO421');

    expect(res.ok).toBe(false);
    expect(res.code).toBe('PLATE_BLOCKED');
    expect(res.payload.motivo).toBe('licencia_vencida');
    expect(res.userMessage).toMatch(/VENCIDA/);
    expect(res.userMessage).toMatch(/supervisor/i);
  });

  it('no toca la sesion cuando bloquea', async function() {
    conLicencia(AYER);
    var sesion = {};
    await manejador('preoperacional')(sesion, 'whatsapp:+573105110497', 'DJO421');

    expect(sesion.placa).toBeUndefined();
    expect(sesion.estado).toBeUndefined();
    expect(sesion.vehiculo).toBeUndefined();
  });

  it('deja pasar si la licencia vence hoy', async function() {
    conLicencia(HOY);
    var res = await manejador('preoperacional')({}, 'whatsapp:+573105110497', 'DJO421');
    expect(res.code).toBe('PLATE_CONFIRMED');
  });

  it('deja pasar si no hay fecha registrada', async function() {
    conLicencia(null);
    var res = await manejador('preoperacional')({}, 'whatsapp:+573105110497', 'DJO421');
    expect(res.code).toBe('PLATE_CONFIRMED');
  });

  it('el posoperacional no se bloquea por licencia vencida', async function() {
    conLicencia(AYER);
    var res = await manejador('posoperacional')({}, 'whatsapp:+573105110497', 'DJO421');
    expect(res.code).toBe('PLATE_CONFIRMED');
  });

  it('el vehiculo bloqueado sigue teniendo prioridad sobre la licencia', async function() {
    mockCargar.mockResolvedValue({
      error: null,
      vehiculo: { id: 'act-1', placa: 'ABC123', bloqueado: true, motivo_bloqueo: 'SOAT vencido' },
      conductor: { id: 'con-1', nombre: 'S Estrada', licencia_vencimiento: AYER }
    });
    var res = await manejador('preoperacional')({}, 'whatsapp:+573105110497', 'ABC123');
    expect(res.code).toBe('PLATE_BLOCKED');
    expect(res.userMessage).toMatch(/SOAT vencido/);
  });
});
