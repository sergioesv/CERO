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
