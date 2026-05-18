'use strict';

/**
 * tests/modulos/inspecciones/preoperacional/cierre.test.js
 *
 * Tests de integración para modulos/inspecciones/preoperacional/cierre.js
 * — función guardarPreoperacionalCompleto.
 *
 * Comportamiento que se congela con estos tests:
 *   - Cuando datosPreoperacional.clasificacion === 'BLOQUEO', cierre.js debe
 *     llamar a data/autorizaciones.crearAutorizacionDesdeBloqueo con los
 *     argumentos correctos: (preopId, novedadesBloqueo, activoId, conductorId).
 *   - El array novedadesBloqueo debe contener SOLO las novedades con
 *     severidad === 'bloqueo', no las de alerta ni informativas.
 *   - Cuando no hay novedades de bloqueo (clasificacion != 'BLOQUEO'),
 *     crearAutorizacionDesdeBloqueo NO debe ser invocada.
 *
 * Estos tests FALLARÁN hasta que el refactor-engineer implemente la llamada
 * en cierre.js. Ese fallo es el comportamiento esperado por diseño.
 *
 * Estrategia de mocks:
 *   - data/autorizaciones.js → mock completo con crearAutorizacionDesdeBloqueo
 *     como jest.fn()
 *   - data/inspecciones.js   → crearPreoperacional devuelve preop con id, otros
 *     son no-ops
 *   - servicios/pdf/preoperacional.js → subirYEnviarPDF no-op
 *   - modulos/alertas/notificador.js  → notificarCriticas no-op
 *   - modulos/alertas/reglas.js       → obtenerNovedadesCriticas devuelve []
 *   - data/activos.js                 → cargarActivoYConductor no-op
 *   - servicios/sesiones.js           → copiarSesion retorna clon plano
 *   - config/config.js                → mock minimalista (no llama process.exit)
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. MOCKS (deben declararse antes del require del módulo bajo prueba)
// ─────────────────────────────────────────────────────────────────────────────

// config/config: mock minimalista para evitar process.exit(1) por env vars
jest.mock('../../../../config/config', function() {
  return {
    supabase: { from: jest.fn() },
    TABLES: {
      activos: 'activos',
      conductores: 'conductores',
      preoperacionales: 'preoperacionales',
      posoperacionales: 'posoperacionales',
      tanqueos: 'tanqueos',
      sesionesActivas: 'sesiones_activas',
      fotosEvidencia: 'fotos_evidencia'
    },
    MAX_KM_SALTO: 500,
    TIMEOUT_FLUJO_MS: { default: 30 * 60 * 1000 },
    TIMEOUT_RECUPERACION_MS: 5 * 60 * 1000
  };
});

// data/autorizaciones: mock completo — crearAutorizacionDesdeBloqueo es el SUT indirecto
var mockCrearAutorizacionDesdeBloqueo = jest.fn().mockResolvedValue({
  ok: true,
  autorizacionId: 'mock-uuid',
  creada: true
});

jest.mock('../../../../data/autorizaciones', function() {
  return {
    crearAutorizacionDesdeBloqueo: mockCrearAutorizacionDesdeBloqueo,
    calcularDiasRestantes: jest.fn(),
    clasificarEstado: jest.fn(),
    obtenerDocumentosActivos: jest.fn(),
    obtenerAutorizacionesPendientes: jest.fn(),
    obtenerAutorizacionesResueltas: jest.fn(),
    registrarDecision: jest.fn(),
    obtenerHistorialActivo: jest.fn()
  };
});

// data/alertas: mock para bloquearActivo (nuevo — aún no importado en cierre.js)
var mockBloquearActivo = jest.fn().mockResolvedValue({ ok: true });

jest.mock('../../../../data/alertas', function() {
  return {
    bloquearActivo: mockBloquearActivo,
    desbloquearActivo: jest.fn().mockResolvedValue({ ok: true }),
    obtenerBloqueoActivo: jest.fn().mockResolvedValue(null)
  };
});

// data/inspecciones: crearPreoperacional devuelve preop con id conocido
var mockCrearPreoperacional = jest.fn().mockResolvedValue({
  error: null,
  data: { id: 'preop-uuid' }
});

jest.mock('../../../../data/inspecciones', function() {
  return {
    crearPreoperacional: mockCrearPreoperacional,
    guardarFotosEvidencia: jest.fn().mockResolvedValue({ error: null }),
    actualizarKilometrajeActivo: jest.fn().mockResolvedValue({ error: null }),
    obtenerKilometrajeReferencia: jest.fn().mockResolvedValue({ error: null, data: null })
  };
});

// data/activos: cargarActivoYConductor no-op (la sesión ya trae conductor)
jest.mock('../../../../data/activos', function() {
  return {
    cargarActivoYConductor: jest.fn().mockResolvedValue({
      error: null,
      conductor: null,
      vehiculo: null
    }),
    registrarCambioEstado: jest.fn().mockResolvedValue({ error: null }),
    obtenerActivoIdPorPlaca: jest.fn().mockResolvedValue(null)
  };
});

// servicios/pdf/preoperacional: subirYEnviarPDF no-op
jest.mock('../../../../servicios/pdf/preoperacional', function() {
  return {
    subirYEnviarPDF: jest.fn().mockResolvedValue('https://pdf.url/mock.pdf')
  };
});

// modulos/alertas/notificador: notificarCriticas no-op
jest.mock('../../../../modulos/alertas/notificador', function() {
  return {
    notificarCriticas: jest.fn().mockResolvedValue(undefined),
    enviarWhatsApp: jest.fn().mockResolvedValue(undefined)
  };
});

// modulos/alertas/reglas: obtenerNovedadesCriticas devuelve []
jest.mock('../../../../modulos/alertas/reglas', function() {
  return {
    obtenerNovedadesCriticas: jest.fn().mockReturnValue([]),
    clasificarAlerta: jest.fn(),
    debeBloquear: jest.fn(),
    formatearFecha: jest.fn(),
    generarMensajeVehiculo: jest.fn(),
    generarMensajeLicencia: jest.fn(),
    UMBRALES: []
  };
});

// servicios/sesiones: copiarSesion retorna clon plano de la sesión
jest.mock('../../../../servicios/sesiones', function() {
  return {
    copiarSesion: jest.fn(function(sesion) {
      // clon superficial suficiente para que cierre.js construya datosSesion
      return Object.assign({}, sesion, {
        respuestas: Object.assign({}, sesion.respuestas || {}),
        novedades: (sesion.novedades || []).slice(),
        fotos: (sesion.fotos || []).slice()
      });
    }),
    obtenerSesion: jest.fn(),
    guardarCambios: jest.fn().mockResolvedValue(undefined)
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. IMPORTS tras los mocks
// ─────────────────────────────────────────────────────────────────────────────

var cierre = require('../../../../modulos/inspecciones/preoperacional/cierre');

// Referencias a los mocks ya registrados, para usarlas en asserts
var alertasNotificadorMock = require('../../../../modulos/alertas/notificador');
var alertasDataMock = require('../../../../data/alertas');

// ─────────────────────────────────────────────────────────────────────────────
// 3. HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Construye una sesión mínima válida para guardarPreoperacionalCompleto.
 * @param {Array} novedades - array de novedades a inyectar
 */
function crearSesionMinima(novedades) {
  return {
    vehiculo: { id: 'activo-uuid', kilometraje: 100 },
    conductor: { id: 'conductor-uuid' },
    kilometraje: 150,
    plantilla: { id: 'plantilla-uuid' },
    respuestas: {},
    novedades: novedades || [],
    fotos: [],
    placa: 'MSO120',
    observacion: null
  };
}

/**
 * Grupos mínimos necesarios para construirDatosSesionPdf.
 * Se pasa array vacío — cierre.js itera grupos.map() que no falla con [].
 */
var GRUPOS_VACIOS = [];

// ─────────────────────────────────────────────────────────────────────────────
// 4. TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('guardarPreoperacionalCompleto — integración con crearAutorizacionDesdeBloqueo', function() {

  beforeEach(function() {
    mockCrearAutorizacionDesdeBloqueo.mockClear();
    mockCrearPreoperacional.mockClear();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1 — Positivo con bloqueo: debe invocar crearAutorizacionDesdeBloqueo
  // con solo las novedades de severidad='bloqueo'
  // ──────────────────────────────────────────────────────────────────────────
  it('debería invocar crearAutorizacionDesdeBloqueo con las novedades de bloqueo cuando clasificacion es BLOQUEO', async function() {
    // arrange: sesión con una novedad de bloqueo y una de alerta
    var novedades = [
      { grupo: 'g1', item: 'frenos', severidad: 'bloqueo', critico: true },
      { grupo: 'g1', item: 'limpiaparabrisas', severidad: 'alerta', critico: false }
    ];
    var sesion = crearSesionMinima(novedades);

    // act
    var resultado = await cierre.guardarPreoperacionalCompleto(sesion, '+573001234567', GRUPOS_VACIOS);

    // assert: no hubo error de ejecución
    expect(resultado.error).toBeNull();

    // assert: crearAutorizacionDesdeBloqueo fue invocada exactamente una vez
    expect(mockCrearAutorizacionDesdeBloqueo).toHaveBeenCalledTimes(1);

    // assert: los argumentos son los correctos
    var llamada = mockCrearAutorizacionDesdeBloqueo.mock.calls[0];
    var preopIdArg        = llamada[0];
    var novedadesArg      = llamada[1];
    var activoIdArg       = llamada[2];
    var conductorIdArg    = llamada[3];

    expect(preopIdArg).toBe('preop-uuid');
    expect(activoIdArg).toBe('activo-uuid');
    expect(conductorIdArg).toBe('conductor-uuid');

    // assert: el array de novedades contiene SOLO las de severidad 'bloqueo'
    expect(novedadesArg).toHaveLength(1);
    expect(novedadesArg[0].severidad).toBe('bloqueo');
    expect(novedadesArg[0].item).toBe('frenos');

    // Verificación negativa: no incluye la novedad de alerta
    var tieneAlerta = novedadesArg.some(function(n) { return n.severidad === 'alerta'; });
    expect(tieneAlerta).toBe(false);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2 — Negativo sin bloqueo: NO debe invocar crearAutorizacionDesdeBloqueo
  // ──────────────────────────────────────────────────────────────────────────
  it('debería NO invocar crearAutorizacionDesdeBloqueo cuando no hay novedades de severidad bloqueo', async function() {
    // arrange: sesión solo con novedad de alerta (sin bloqueo)
    var novedades = [
      { grupo: 'g1', item: 'limpiaparabrisas', severidad: 'alerta', critico: false }
    ];
    var sesion = crearSesionMinima(novedades);

    // act
    var resultado = await cierre.guardarPreoperacionalCompleto(sesion, '+573001234567', GRUPOS_VACIOS);

    // assert: no hubo error de ejecución
    expect(resultado.error).toBeNull();

    // assert: crearAutorizacionDesdeBloqueo NO fue invocada
    expect(mockCrearAutorizacionDesdeBloqueo).not.toHaveBeenCalled();
  });

  it('debería NO invocar crearAutorizacionDesdeBloqueo cuando sesion.novedades está vacío', async function() {
    // arrange: sesión sin novedades
    var sesion = crearSesionMinima([]);

    // act
    var resultado = await cierre.guardarPreoperacionalCompleto(sesion, '+573001234567', GRUPOS_VACIOS);

    // assert: no hubo error
    expect(resultado.error).toBeNull();

    // assert: crearAutorizacionDesdeBloqueo NO fue invocada
    expect(mockCrearAutorizacionDesdeBloqueo).not.toHaveBeenCalled();
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 5. TESTS — bloqueo automático de activo y notificación WhatsApp
//
// Estos tests (A y B) FALLARÁN hasta que el refactor-engineer agregue en
// cierre.js:
//   1. import de data/alertas
//   2. llamada a alertasData.bloquearActivo dentro del bloque BLOQUEO
//   3. llamada a alertasNotificador.enviarWhatsApp dentro del bloque BLOQUEO
//
// Tests C y D verifican comportamientos ya presentes o de resiliencia.
// ─────────────────────────────────────────────────────────────────────────────

describe('guardarPreoperacionalCompleto — bloqueo de activo y WhatsApp al conductor', function() {

  beforeEach(function() {
    mockBloquearActivo.mockClear();
    mockCrearAutorizacionDesdeBloqueo.mockClear();
    mockCrearPreoperacional.mockClear();
    alertasNotificadorMock.enviarWhatsApp.mockClear();
    alertasDataMock.bloquearActivo.mockResolvedValue({ ok: true });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST A — bloqueo automático ocurre y es ANTERIOR a crearAutorizacionDesdeBloqueo
  // FALLA hasta que el refactor-engineer aplique el fix en cierre.js
  // ──────────────────────────────────────────────────────────────────────────
  it('[A] debería llamar alertasData.bloquearActivo con vehiculo.id ANTES de crearAutorizacionDesdeBloqueo cuando clasificacion es BLOQUEO', async function() {
    var novedades = [
      { grupo: 'g1', item: 'frenos', severidad: 'bloqueo', critico: true }
    ];
    var sesion = crearSesionMinima(novedades);
    sesion.vehiculo.id = 'activo-abc';

    // Registrar el orden de invocación usando una lista compartida
    var ordenLlamadas = [];
    mockBloquearActivo.mockImplementation(function() {
      ordenLlamadas.push('bloquearActivo');
      return Promise.resolve({ ok: true });
    });
    mockCrearAutorizacionDesdeBloqueo.mockImplementation(function() {
      ordenLlamadas.push('crearAutorizacionDesdeBloqueo');
      return Promise.resolve({ ok: true, autorizacionId: 'mock-uuid', creada: true });
    });

    var resultado = await cierre.guardarPreoperacionalCompleto(sesion, '+573001234567', GRUPOS_VACIOS);

    // La función no debe lanzar error
    expect(resultado.error).toBeNull();

    // bloquearActivo debe haber sido llamado exactamente una vez
    expect(mockBloquearActivo).toHaveBeenCalledTimes(1);

    // El primer argumento debe ser el vehiculo.id
    var primerArg = mockBloquearActivo.mock.calls[0][0];
    expect(primerArg).toBe('activo-abc');

    // El segundo argumento (motivo) debe contener alguna referencia a bloqueo o críticas
    var motivoArg = mockBloquearActivo.mock.calls[0][1];
    expect(typeof motivoArg).toBe('string');
    var motivoLower = motivoArg.toLowerCase();
    expect(
      motivoLower.includes('bloqueo') || motivoLower.includes('cr') || motivoLower.includes('novedades')
    ).toBe(true);

    // bloquearActivo debe haberse llamado ANTES que crearAutorizacionDesdeBloqueo
    var idxBloquear = ordenLlamadas.indexOf('bloquearActivo');
    var idxAutorizacion = ordenLlamadas.indexOf('crearAutorizacionDesdeBloqueo');
    expect(idxBloquear).toBeGreaterThanOrEqual(0);
    expect(idxAutorizacion).toBeGreaterThanOrEqual(0);
    expect(idxBloquear).toBeLessThan(idxAutorizacion);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST B — WhatsApp al conductor con placa y "bloqueado"
  // FALLA hasta que el refactor-engineer aplique el fix en cierre.js
  // ──────────────────────────────────────────────────────────────────────────
  it('[B] debería llamar alertasNotificador.enviarWhatsApp con el teléfono del conductor y un mensaje con la placa y "bloqueado"', async function() {
    var novedades = [
      { grupo: 'g1', item: 'frenos', severidad: 'bloqueo', critico: true }
    ];
    var sesion = crearSesionMinima(novedades);
    sesion.conductor.telefono = '+573009999999';
    sesion.placa = 'XYZ999';

    var resultado = await cierre.guardarPreoperacionalCompleto(sesion, '+573009999999', GRUPOS_VACIOS);

    expect(resultado.error).toBeNull();

    // enviarWhatsApp debe haber sido llamado al menos una vez con el teléfono del conductor
    var llamadasWhatsApp = alertasNotificadorMock.enviarWhatsApp.mock.calls;
    var llamadaBloqueo = llamadasWhatsApp.find(function(args) {
      return args[0] === '+573009999999';
    });
    expect(llamadaBloqueo).toBeDefined();

    // El mensaje debe contener la placa y alguna variante de "bloqueado"
    var mensaje = llamadaBloqueo[1];
    expect(typeof mensaje).toBe('string');
    expect(mensaje).toContain('XYZ999');
    var mensajeLower = mensaje.toLowerCase();
    expect(
      mensajeLower.includes('bloqueado') || mensajeLower.includes('bloqueo') || mensajeLower.includes('bloqueada')
    ).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST C — sin BLOQUEO, no se llama bloquearActivo
  // Debe PASAR con el código actual (el bloque BLOQUEO no se ejecuta)
  // ──────────────────────────────────────────────────────────────────────────
  it('[C] debería NO llamar alertasData.bloquearActivo cuando clasificacion no es BLOQUEO', async function() {
    // Solo una novedad de alerta — clasificacion resultante: ALERTA o INFORMATIVO
    var novedades = [
      { grupo: 'g1', item: 'limpiaparabrisas', severidad: 'alerta', critico: false }
    ];
    var sesion = crearSesionMinima(novedades);

    var resultado = await cierre.guardarPreoperacionalCompleto(sesion, '+573001234567', GRUPOS_VACIOS);

    expect(resultado.error).toBeNull();

    // bloquearActivo no debe haber sido llamado
    expect(mockBloquearActivo).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST D — bloqueo falla pero guardarPreoperacionalCompleto no lanza
  // Requiere que el fix esté aplicado (fallará antes del fix por razón diferente:
  // bloquearActivo ni siquiera se llama). Tras el fix, verifica resiliencia.
  // ──────────────────────────────────────────────────────────────────────────
  it('[D] debería completar sin lanzar aunque alertasData.bloquearActivo rechace', async function() {
    var novedades = [
      { grupo: 'g1', item: 'frenos', severidad: 'bloqueo', critico: true }
    ];
    var sesion = crearSesionMinima(novedades);

    // bloquearActivo lanza un error simulado
    alertasDataMock.bloquearActivo.mockRejectedValue(new Error('fallo conexion alertas'));

    // guardarPreoperacionalCompleto NO debe propagar el error
    var resultado = await cierre.guardarPreoperacionalCompleto(sesion, '+573001234567', GRUPOS_VACIOS);

    // El preoperacional sí se guardó
    expect(mockCrearPreoperacional).toHaveBeenCalledTimes(1);

    // La función retornó sin error
    expect(resultado.error).toBeNull();
    expect(resultado.preop).toBeDefined();
    expect(resultado.preop.id).toBe('preop-uuid');
  });

});
