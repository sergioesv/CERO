'use strict';

/**
 * tests/modulos/inspecciones/compartido/baseFlujo.test.js
 *
 * Tests unitarios para FlujoBase.prototype.manejar en
 * modulos/inspecciones/compartido/baseFlujo.js.
 *
 * Comportamiento que se fija con estos tests:
 *
 *   TEST 1 — guardarCambios debe ser awaited:
 *     manejar() debe esperar a que la Promise devuelta por guardarCambios()
 *     se resuelva antes de que manejar() retorne. Con el bug actual (sin await)
 *     la Promise se dispara-y-olvida, de modo que este test FALLA antes del fix
 *     y PASA después.
 *
 *   TEST 2 — no-regresión del finally:
 *     desbloquear(telefono) debe ser llamado incluso cuando procesarEstado()
 *     lanza un error. Verifica que el bloqueo de concurrencia nunca queda huérfano.
 *
 *   TEST 3 — escenario del bug (restauración de estado):
 *     Documenta la secuencia que produce el doble envío de sub-pregunta.
 *     Si guardarCambios() no es awaited, el proceso puede reiniciarse antes de
 *     que el nuevo estado llegue a Supabase. En ese caso, cargarSesionDesdeSupabase
 *     devuelve el snapshot con el estado anterior ('DESCRIBIR_NOVEDAD') y el flujo
 *     vuelve a ejecutar ese estado, enviando la sub-pregunta dos veces.
 *     Este test FALLA con el código actual (sin await) y PASA tras el fix.
 *
 * Estrategia de mocks:
 *   - config/config              → mock minimalista (evita process.exit)
 *   - servicios/sesiones         → mock completo; guardarCambios es observable
 *   - servicios/storage          → obtenerMediaUrls devuelve []
 *   - modulos/inspecciones/compartido/twiml     → firmaTwilioValida=true, responderTwiml captura
 *   - modulos/inspecciones/compartido/navegacion → mocks de esMenu/esAtras
 *   - modulos/inspecciones/compartido/iniciadorFlujo → no-ops
 *   - modulos/inspecciones/compartido/kilometraje    → no-ops
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. MOCKS — deben declararse antes de cualquier require del módulo bajo prueba
// ─────────────────────────────────────────────────────────────────────────────

// config/config: mock minimalista para evitar process.exit(1) por env vars faltantes
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
    TIMEOUT_RECUPERACION_MS: 5 * 60 * 1000,
    TWILIO_AUTH_TOKEN: null,
    TWILIO_WEBHOOK_URL: null
  };
});

// servicios/sesiones: mock completo — guardarCambios es observable
var mockGuardarCambios = jest.fn();
var mockDesbloquear    = jest.fn();
var mockBloquear       = jest.fn();
var mockObtenerSesion  = jest.fn();
var mockEliminarSesion = jest.fn();

jest.mock('../../../../servicios/sesiones', function() {
  return {
    bloquear:            mockBloquear,
    desbloquear:         mockDesbloquear,
    obtenerSesion:       mockObtenerSesion,
    guardarCambios:      mockGuardarCambios,
    eliminarSesion:      mockEliminarSesion,
    esSesionRecuperable: jest.fn().mockReturnValue(true),
    reactivarSesion:     jest.fn(),
    copiarSesion:        jest.fn()
  };
});

// servicios/storage: obtenerMediaUrls devuelve array vacío
jest.mock('../../../../servicios/storage', function() {
  return {
    obtenerMediaUrls: jest.fn().mockReturnValue([]),
    guardarFotoUnica: jest.fn()
  };
});

// modulos/inspecciones/compartido/twiml: firma siempre válida, captura respuesta
var mockResponderTwiml = jest.fn();

jest.mock('../../../../modulos/inspecciones/compartido/twiml', function() {
  return {
    firmaTwilioValida: jest.fn().mockReturnValue(true),
    responderTwiml: mockResponderTwiml
  };
});

// modulos/inspecciones/compartido/navegacion: esMenu/esAtras siempre false por defecto
var mockEsMenu  = jest.fn().mockReturnValue(false);
var mockEsAtras = jest.fn().mockReturnValue(false);

jest.mock('../../../../modulos/inspecciones/compartido/navegacion', function() {
  return {
    esMenu:              mockEsMenu,
    esAtras:             mockEsAtras,
    esOpcion:            jest.fn().mockReturnValue(false),
    textoMenuPrincipal:  jest.fn().mockReturnValue('MENU_PRINCIPAL'),
    MSG_ERROR_GENERICO:  'Ocurrió un error. Intenta de nuevo.',
    PIE_NAV:             ''
  };
});

// modulos/inspecciones/compartido/iniciadorFlujo: no-ops para los factory
jest.mock('../../../../modulos/inspecciones/compartido/iniciadorFlujo', function() {
  return {
    crearManejadorPlaca: jest.fn().mockReturnValue(jest.fn().mockResolvedValue({
      ok: false,
      code: 'PLATE_RETRY',
      userMessage: 'Enviá la placa.',
      payload: null
    })),
    crearProcesadorFotoPlaca: jest.fn().mockReturnValue(jest.fn().mockResolvedValue(null)),
    crearProcesadorFotoOdometro: jest.fn().mockReturnValue(jest.fn().mockResolvedValue(null))
  };
});

// modulos/inspecciones/compartido/kilometraje: no-ops
jest.mock('../../../../modulos/inspecciones/compartido/kilometraje', function() {
  return {
    manejarConfirmacionOdometro: jest.fn().mockResolvedValue({ ok: false, code: 'KM_RETRY', userMessage: '', payload: null }),
    manejarOdometroManual:       jest.fn().mockResolvedValue({ ok: false, code: 'KM_RETRY', userMessage: '', payload: null }),
    normalizarResultadoKm:       jest.fn().mockReturnValue({ ok: false, code: 'KM_RETRY', userMessage: '', payload: null })
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. IMPORTS tras los mocks
// ─────────────────────────────────────────────────────────────────────────────

var FlujoBase = require('../../../../modulos/inspecciones/compartido/baseFlujo');

// ─────────────────────────────────────────────────────────────────────────────
// 3. HELPERS DE TEST
// ─────────────────────────────────────────────────────────────────────────────

var TELEFONO = 'whatsapp:+573001234567';

/**
 * Crea un req mínimo compatible con baseFlujo.manejar.
 */
function crearReq(body) {
  return {
    body: {
      From: TELEFONO,
      Body: body || 'hola'
    },
    headers: {},
    protocol: 'https',
    originalUrl: '/webhook'
  };
}

/**
 * Crea un res mínimo — no se usa porque responderTwiml está mockeado.
 */
function crearRes() {
  return {
    _body: null,
    _sent: false,
    status: jest.fn().mockReturnThis(),
    send: jest.fn(function(b) { this._body = b; this._sent = true; })
  };
}

/**
 * Crea una sesión con estado activo y tipo preoperacional.
 */
function crearSesionActiva(estado) {
  return {
    tipo: 'preoperacional',
    estado: estado || 'SUB_PREGUNTA',
    placa: 'ABC123',
    vehiculo: { id: 'v1' },
    conductor: { id: 'c1' },
    respuestas: {},
    novedades: [],
    fotos: [],
    ultimaActividad: Date.now(),
    expirada: false
  };
}

/**
 * Construye un FlujoBase mínimo funcional con stubs abstractos.
 * procesarEstadoFn: función que se ejecuta en el lugar de procesarEstado().
 *                   Recibe (res, sesion, telefono, mensaje, msgUpper, mediaUrls).
 */
function crearFlujoBase(procesarEstadoFn) {
  var ESTADOS = {
    INICIO: 'INICIO',
    ESPERANDO_FOTO_PLACA: 'ESPERANDO_FOTO_PLACA',
    SUB_PREGUNTA: 'SUB_PREGUNTA',
    DESCRIBIR_NOVEDAD: 'DESCRIBIR_NOVEDAD'
  };

  var flujo = new FlujoBase({
    tipo: 'preoperacional',
    ESTADOS: ESTADOS,
    mensajes: {
      mensajeConfirmacionPlacaSugerida: jest.fn().mockReturnValue('Confirmar placa'),
      mensajeFallbackPlaca: jest.fn().mockReturnValue('Fallback placa')
    },
    validaciones: {
      normalizarPlaca: jest.fn().mockReturnValue(null)
    },
    mensajeConfirmacionPlaca: jest.fn().mockReturnValue('Confirmar placa'),
    mensajeInicio: jest.fn().mockReturnValue('Inicio del flujo')
  });

  // Implementar métodos abstractos
  flujo.inicializarSesion = jest.fn(function(sesion) {
    sesion.tipo = 'preoperacional';
  });

  flujo.manejarAtras = jest.fn().mockResolvedValue(null);

  flujo.procesarEstado = procesarEstadoFn || jest.fn().mockResolvedValue(null);

  return flujo;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('FlujoBase.prototype.manejar — TEST 1: guardarCambios debe ser awaited', function() {
  /**
   * Verifica que manejar() espera a que la Promise de guardarCambios() se
   * resuelva antes de que manejar() retorne.
   *
   * Mecanismo de detección:
   *   guardarCambios() devuelve una Promise que registra su momento de resolución
   *   en `guardadoCompletado`. manejar() también registra su momento de retorno
   *   en `manejarRetorno`. Para que el await funcione, guardadoCompletado debe
   *   ocurrir ANTES de que manejar() retorne.
   *
   *   Con el bug actual (sin await), manejar() retorna inmediatamente y la
   *   Promise de guardarCambios() se resuelve después — el orden se invierte.
   *
   * ESTADO: FALLA antes del fix. PASA después del fix.
   */

  var orden = [];

  beforeEach(function() {
    jest.clearAllMocks();
    orden = [];

    // jest.config.js no activa fakeTimers globalmente (testEnvironment: 'node', sin
    // fakeTimers). Este test usa setImmediate para simular asincronía real de I/O —
    // requiere timers reales. Si en el futuro se activan fake timers globalmente,
    // se debe agregar jest.useRealTimers() aquí y jest.useRealTimers() en afterEach.
    mockBloquear.mockReturnValue(true);
    mockEsMenu.mockReturnValue(false);
    mockEsAtras.mockReturnValue(false);
    mockResponderTwiml.mockImplementation(function() {});

    // guardarCambios devuelve una Promise que registra su resolución en el orden
    mockGuardarCambios.mockImplementation(function() {
      return new Promise(function(resolve) {
        // Usamos setImmediate para que la Promise se resuelva en el siguiente tick
        // — esto simula la asincronía de la escritura a Supabase.
        setImmediate(function() {
          orden.push('guardarCambios_resuelto');
          resolve();
        });
      });
    });
  });

  it('debería resolver la Promise de guardarCambios antes de que manejar retorne', async function() {
    // arrange: sesión con estado activo — procesarEstado cambia estado a SUB_PREGUNTA
    var sesion = crearSesionActiva('ESPERANDO_FOTO_PLACA');
    mockObtenerSesion.mockResolvedValue(sesion);

    var flujo = crearFlujoBase(async function(res, s) {
      s.estado = 'SUB_PREGUNTA';
      mockResponderTwiml(res, 'Descripción de la novedad:');
    });

    // act
    var req = crearReq('respuesta');
    var res = crearRes();

    // Ejecutamos manejar y registramos cuándo retorna
    await flujo.manejar(req, res).then(function() {
      orden.push('manejar_retornado');
    });

    // assert: guardarCambios_resuelto debe aparecer ANTES de manejar_retornado
    // Con el bug (sin await): orden = ['manejar_retornado', 'guardarCambios_resuelto'] → FALLA
    // Con el fix (con await): orden = ['guardarCambios_resuelto', 'manejar_retornado']  → PASA
    expect(orden).toEqual(['guardarCambios_resuelto', 'manejar_retornado']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('FlujoBase.prototype.manejar — TEST 2: desbloquear siempre se llama en finally', function() {
  /**
   * Verifica que desbloquear(telefono) se invoca en el bloque finally incluso
   * cuando procesarEstado() lanza un error. El bloqueo de concurrencia nunca
   * debe quedar huérfano.
   *
   * ESTADO: debe PASAR con el código actual (este comportamiento ya funciona).
   */

  beforeEach(function() {
    jest.clearAllMocks();
    mockBloquear.mockReturnValue(true);
    mockEsMenu.mockReturnValue(false);
    mockEsAtras.mockReturnValue(false);
    mockResponderTwiml.mockImplementation(function() {});
    // guardarCambios: Promise inmediata para no interferir con el foco del test
    mockGuardarCambios.mockResolvedValue(undefined);
  });

  it('debería llamar desbloquear aunque procesarEstado lance un error', async function() {
    // arrange: sesión activa, procesarEstado explota
    var sesion = crearSesionActiva('SUB_PREGUNTA');
    mockObtenerSesion.mockResolvedValue(sesion);

    var errorSimulado = new Error('Error simulado en procesarEstado');

    var flujo = crearFlujoBase(async function() {
      throw errorSimulado;
    });

    var req = crearReq('algo');
    var res = crearRes();

    // act — manejar captura el error en el catch y responde con MSG_ERROR_GENERICO
    await flujo.manejar(req, res);

    // assert: desbloquear fue llamado exactamente una vez con el teléfono correcto
    expect(mockDesbloquear).toHaveBeenCalledTimes(1);
    expect(mockDesbloquear).toHaveBeenCalledWith(TELEFONO);

    // assert: guardarCambios también fue llamado (el finally completo se ejecutó)
    expect(mockGuardarCambios).toHaveBeenCalledTimes(1);

    // assert: desbloquear se llama DESPUÉS de guardarCambios en el finally
    // (el orden correcto es: guardarCambios → desbloquear)
    var ordenLlamadas = [];
    mockGuardarCambios.mock.invocationCallOrder.forEach(function() { ordenLlamadas.push('guardarCambios'); });
    mockDesbloquear.mock.invocationCallOrder.forEach(function() { ordenLlamadas.push('desbloquear'); });
    var primeraLlamadaGuardar  = mockGuardarCambios.mock.invocationCallOrder[0];
    var primeraLlamadaDesbloquear = mockDesbloquear.mock.invocationCallOrder[0];
    expect(primeraLlamadaGuardar).toBeLessThan(primeraLlamadaDesbloquear);
  });

  it('debería llamar desbloquear en el camino feliz cuando procesarEstado no lanza', async function() {
    // arrange: sesión activa, procesarEstado exitoso
    var sesion = crearSesionActiva('SUB_PREGUNTA');
    mockObtenerSesion.mockResolvedValue(sesion);

    var flujo = crearFlujoBase(async function(res) {
      mockResponderTwiml(res, 'ok');
    });

    var req = crearReq('algo');
    var res = crearRes();

    // act
    await flujo.manejar(req, res);

    // assert
    expect(mockDesbloquear).toHaveBeenCalledTimes(1);
    expect(mockDesbloquear).toHaveBeenCalledWith(TELEFONO);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('FlujoBase.prototype.manejar — TEST 3: escenario del bug de restauración de estado', function() {
  /**
   * Documenta la secuencia de doble envío de sub-pregunta:
   *
   *   1. Request N llega. Estado en memoria: 'SUB_PREGUNTA'.
   *      procesarEstado lo procesa y cambia sesion.estado a algún estado siguiente.
   *      guardarCambios() se llama SIN await — la Promise queda pendiente.
   *
   *   2. El proceso Node.js se reinicia (Railway, OOM, deploy) antes de que la
   *      Promise se resuelva. El nuevo estado nunca llega a Supabase.
   *
   *   3. Request N+1 llega al nuevo proceso. obtenerSesion() carga desde Supabase
   *      el snapshot obsoleto con estado='DESCRIBIR_NOVEDAD' (el anterior).
   *
   *   4. procesarEstado recibe estado='DESCRIBIR_NOVEDAD' de nuevo y envía la
   *      sub-pregunta por segunda vez.
   *
   * Lo que este test verifica:
   *   Si guardarCambios() NO es awaited, la función devuelve antes de persistir.
   *   Simulamos esto haciendo que guardarCambios() devuelva una Promise que NUNCA
   *   se resuelve dentro del tiempo de vida de manejar(). Luego verificamos que
   *   el estado actualizado en memoria (sesion.estado) diverge del snapshot que
   *   Supabase habría guardado (el estado anterior).
   *
   *   Con el bug (sin await): manejar() retorna mientras guardarCambios() sigue
   *   pendiente → cualquier reinicio en ese instante restauraría el estado anterior
   *   → el test detecta que la persistencia no fue garantizada dentro de manejar().
   *
   *   Con el fix (con await): manejar() espera que guardarCambios() resuelva antes
   *   de retornar → la persistencia está garantizada dentro del ciclo de vida del
   *   request → el test detecta que la operación fue completada.
   *
   * ESTADO: FALLA antes del fix. PASA después del fix.
   */

  beforeEach(function() {
    jest.clearAllMocks();

    // jest.config.js no activa fakeTimers globalmente (testEnvironment: 'node', sin
    // fakeTimers). Este test usa setImmediate para simular asincronía real de I/O —
    // requiere timers reales. Si en el futuro se activan fake timers globalmente,
    // se debe agregar jest.useRealTimers() aquí y jest.useRealTimers() en afterEach.
    mockBloquear.mockReturnValue(true);
    mockEsMenu.mockReturnValue(false);
    mockEsAtras.mockReturnValue(false);
    mockResponderTwiml.mockImplementation(function() {});
  });

  it('debería garantizar que guardarCambios resuelve dentro del ciclo de vida de manejar (estado no se pierde en reinicio)', async function() {
    // arrange:
    //   - Sesión con estado inicial 'DESCRIBIR_NOVEDAD' (el que Supabase tiene guardado)
    //   - procesarEstado avanza el estado a 'PREGUNTA_SIGUIENTE'
    //   - guardarCambios devuelve una Promise que se resuelve en el siguiente tick
    //     (simula la asincronía real de la escritura a Supabase)

    var estadoEnMemoria = { valor: null };
    var persistenciaCompletada = false;

    var sesion = crearSesionActiva('DESCRIBIR_NOVEDAD');
    mockObtenerSesion.mockResolvedValue(sesion);

    // guardarCambios registra qué estado estaba en memoria cuando fue llamado
    // y marca la persistencia como completada
    mockGuardarCambios.mockImplementation(function() {
      // Captura el estado actual ANTES de que resuelva
      estadoEnMemoria.valor = sesion.estado;
      return new Promise(function(resolve) {
        setImmediate(function() {
          persistenciaCompletada = true;
          resolve();
        });
      });
    });

    var flujo = crearFlujoBase(async function(res, s) {
      // Simula que el handler de DESCRIBIR_NOVEDAD envía la sub-pregunta
      // y avanza el estado al siguiente
      s.estado = 'PREGUNTA_SIGUIENTE';
      mockResponderTwiml(res, 'Descripción de la novedad:');
    });

    var req = crearReq('alguna respuesta');
    var res = crearRes();

    // act
    await flujo.manejar(req, res);

    // assert 1: guardarCambios fue llamado
    expect(mockGuardarCambios).toHaveBeenCalledTimes(1);

    // assert 2 (el central del test):
    //   Con el fix (await): persistenciaCompletada === true cuando manejar retorna.
    //   Con el bug (sin await): persistenciaCompletada === false cuando manejar retorna,
    //   porque la Promise de setImmediate aún no resolvió.
    //
    // Si persistenciaCompletada es false, significa que un reinicio del proceso
    // en ese momento restauraría 'DESCRIBIR_NOVEDAD' desde Supabase, causando
    // el doble envío de la sub-pregunta.
    //
    // FALLA antes del fix → persistenciaCompletada === false
    // PASA  después del fix → persistenciaCompletada === true
    expect(persistenciaCompletada).toBe(true);

    // NOTA (solo documentación, no una aserción de detección del bug):
    //   estadoEnMemoria.valor === 'PREGUNTA_SIGUIENTE' siempre se cumple,
    //   independientemente del bug, porque guardarCambios() captura sesion.estado
    //   DESPUÉS de que procesarEstado ya lo muté. No distingue entre código con bug
    //   y código con fix, por lo que se omite como assert. La única aserción que
    //   detecta el bug es expect(persistenciaCompletada).toBe(true) (assert 2).
    //
    // Valor esperado en memoria cuando se llama guardarCambios: 'PREGUNTA_SIGUIENTE'
  });
});
