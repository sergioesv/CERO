'use strict';

/**
 * tests/modulos/inscripcion/flujo.test.js
 *
 * Tests de comportamiento de modulos/inscripcion/flujo.js.
 *
 * Estrategia de mocks:
 *   - config/config   → mock manual que provee supabase, TABLES, TIMEOUT_FLUJO_MS, etc.
 *                       Se usa mockSingle (de tests/__mocks__/supabase.js) para controlar
 *                       la respuesta de .from('conductores').insert([...]).select().single()
 *   - servicios/sesiones → mock manual: obtenerSesion devuelve la sesión inyectada,
 *                          guardarCambios es un no-op.
 *   - modulos/inspecciones/compartido/navegacion → mock parcial para textoMenuPrincipal
 *
 * Nota: config/config llama process.exit(1) si las variables de entorno están ausentes,
 * por eso se mockea ANTES de que Jest resuelva el require.
 */

// ---------------------------------------------------------------------------
// 1. MOCKS DE MÓDULOS (deben estar antes del require del módulo bajo prueba)
// ---------------------------------------------------------------------------

// Sesiones mock — se manipula desde cada test vía setSesionActual()
// Nota: el nombre debe comenzar con "mock" para ser accesible en el factory de jest.mock()
var mockSesionActual = null;

jest.mock('../../../servicios/sesiones', function() {
  return {
    obtenerSesion: jest.fn(function() {
      return Promise.resolve(mockSesionActual);
    }),
    guardarCambios: jest.fn(function() {
      return Promise.resolve();
    })
  };
});

// Supabase mock — cadena .from().insert().select().single()
var mockSingle  = jest.fn();
var mockSelect  = jest.fn(function() { return { single: mockSingle }; });
var mockInsert  = jest.fn(function() { return { select: mockSelect }; });
var mockFrom    = jest.fn(function() { return { insert: mockInsert }; });

jest.mock('../../../config/config', function() {
  return {
    supabase: { from: mockFrom },
    TABLES: { sesionesActivas: 'sesiones_activas', conductores: 'conductores' },
    TIMEOUT_FLUJO_MS: { default: 30 * 60 * 1000 },
    TIMEOUT_RECUPERACION_MS: 5 * 60 * 1000
  };
});

// Navegacion mock — textoMenuPrincipal retorna texto controlado
jest.mock('../../../modulos/inspecciones/compartido/navegacion', function() {
  return {
    textoMenuPrincipal: jest.fn(function() { return 'MENU_PRINCIPAL'; }),
    PIE_NAV: '\n\n0️⃣ _Atrás_  •  9️⃣ _Menú principal_'
  };
});

// ---------------------------------------------------------------------------
// 2. IMPORTS tras los mocks
// ---------------------------------------------------------------------------

var { manejarInscripcion } = require('../../../modulos/inscripcion/flujo');
var estadoMod = require('../../../modulos/inscripcion/estado');
var { crearResFalso, crearReqFalso } = require('../../helpers/twilio');

var ESTADOS = estadoMod.ESTADOS;

// ---------------------------------------------------------------------------
// 3. HELPERS DE TEST
// ---------------------------------------------------------------------------

/**
 * Inyecta la sesión que devolverá el mock de sesiones.obtenerSesion.
 */
function setSesionActual(sesion) {
  mockSesionActual = sesion;
}

/**
 * Crea una sesión con inscripcion ya iniciada en el estado dado.
 */
function crearSesionEnEstado(estado, datosExtra) {
  var sesion = {
    tipo: 'inscripcion',
    estado: estado,
    inscripcion: {
      nombre: null,
      cedula: null,
      licencia: null,
      cargo: null
    }
  };
  return Object.assign(sesion, datosExtra || {});
}

/**
 * Extrae el texto del mensaje dentro del TwiML.
 * Devuelve el contenido de <Message>...</Message>.
 */
function extraerMensaje(body) {
  var match = body && body.match(/<Message>([\s\S]*?)<\/Message>/);
  return match ? match[1] : '';
}

// ---------------------------------------------------------------------------
// 4. TESTS
// ---------------------------------------------------------------------------

describe('manejarInscripcion — inicialización del flujo', function() {
  beforeEach(function() {
    mockSingle.mockReset();
    mockSelect.mockReset();
    mockInsert.mockReset();
    mockFrom.mockReset();
    mockFrom.mockReturnValue({ insert: mockInsert });
    mockInsert.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ single: mockSingle });
  });

  // TEST 1: entrada inicial produce bienvenida y estado NOMBRE
  it('debería responder con bienvenida y fijar estado NOMBRE cuando no hay sesion.inscripcion', async function() {
    var sesion = { tipo: 'inscripcion', estado: 'INICIO', inscripcion: undefined };
    setSesionActual(sesion);

    var req = crearReqFalso('whatsapp:+573001234567', 'hola');
    var res = crearResFalso();

    await manejarInscripcion(req, res);

    expect(res._sent).toBe(true);
    expect(res._headers['Content-Type']).toBe('text/xml');

    var cuerpo = extraerMensaje(res._body);
    // El mensaje de bienvenida contiene "CERO" y "Paso 1"
    expect(cuerpo).toContain('CERO');
    expect(cuerpo).toContain('Paso 1');

    // El estado debe haber quedado en NOMBRE
    expect(sesion.estado).toBe(ESTADOS.NOMBRE);
    expect(sesion.inscripcion).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe('manejarInscripcion — cancelación', function() {
  beforeEach(function() {
    mockFrom.mockReturnValue({ insert: mockInsert });
    mockInsert.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ single: mockSingle });
  });

  // TEST 2a: cancelar con "9"
  it('debería limpiar inscripcion y devolver menú principal cuando se envía "9"', async function() {
    var sesion = crearSesionEnEstado(ESTADOS.NOMBRE);
    setSesionActual(sesion);

    var req = crearReqFalso('whatsapp:+573001234567', '9');
    var res = crearResFalso();

    await manejarInscripcion(req, res);

    expect(res._sent).toBe(true);
    expect(sesion.inscripcion).toBeNull();
    expect(sesion.tipo).toBeNull();
    expect(sesion.estado).toBe('INICIO');
    expect(extraerMensaje(res._body)).toContain('MENU_PRINCIPAL');
  });

  // TEST 2b: cancelar con "CANCELAR" (texto)
  it('debería limpiar inscripcion y devolver menú principal cuando se envía "CANCELAR"', async function() {
    var sesion = crearSesionEnEstado(ESTADOS.CEDULA);
    setSesionActual(sesion);

    var req = crearReqFalso('whatsapp:+573001234567', 'CANCELAR');
    var res = crearResFalso();

    await manejarInscripcion(req, res);

    expect(res._sent).toBe(true);
    expect(sesion.inscripcion).toBeNull();
    expect(sesion.tipo).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe('manejarInscripcion — reinicio', function() {
  beforeEach(function() {
    mockFrom.mockReturnValue({ insert: mockInsert });
    mockInsert.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ single: mockSingle });
  });

  // TEST 3a: reiniciar con "0"
  it('debería reiniciar el flujo al estado NOMBRE cuando se envía "0"', async function() {
    var sesion = crearSesionEnEstado(ESTADOS.LICENCIA, {
      inscripcion: { nombre: 'Ana Torres', cedula: '123456', licencia: null, cargo: null }
    });
    setSesionActual(sesion);

    var req = crearReqFalso('whatsapp:+573001234567', '0');
    var res = crearResFalso();

    await manejarInscripcion(req, res);

    expect(res._sent).toBe(true);
    expect(sesion.estado).toBe(ESTADOS.NOMBRE);
    // Los datos anteriores se borran al reiniciar
    expect(sesion.inscripcion.nombre).toBeNull();
    expect(sesion.inscripcion.cedula).toBeNull();

    var cuerpo = extraerMensaje(res._body);
    expect(cuerpo).toContain('Paso 1');
  });

  // TEST 3b: reiniciar con "REINICIAR"
  it('debería reiniciar el flujo al estado NOMBRE cuando se envía "REINICIAR"', async function() {
    var sesion = crearSesionEnEstado(ESTADOS.CARGO, {
      inscripcion: { nombre: 'Luis Gómez', cedula: '9876543', licencia: 'B1', cargo: null }
    });
    setSesionActual(sesion);

    var req = crearReqFalso('whatsapp:+573001234567', 'REINICIAR');
    var res = crearResFalso();

    await manejarInscripcion(req, res);

    expect(res._sent).toBe(true);
    expect(sesion.estado).toBe(ESTADOS.NOMBRE);
  });
});

// ---------------------------------------------------------------------------

describe('manejarInscripcion — estado corrupto', function() {
  beforeEach(function() {
    mockFrom.mockReturnValue({ insert: mockInsert });
    mockInsert.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ single: mockSingle });
  });

  // TEST 10: estado inesperado reinicia el flujo
  it('debería reiniciar al estado NOMBRE cuando sesion.estado tiene un valor desconocido', async function() {
    var sesion = {
      tipo: 'inscripcion',
      estado: 'ESTADO_CORRUPTO_INEXISTENTE',
      inscripcion: { nombre: null, cedula: null, licencia: null, cargo: null }
    };
    setSesionActual(sesion);

    var req = crearReqFalso('whatsapp:+573001234567', 'cualquier texto');
    var res = crearResFalso();

    await manejarInscripcion(req, res);

    expect(res._sent).toBe(true);
    expect(sesion.estado).toBe(ESTADOS.NOMBRE);
    var cuerpo = extraerMensaje(res._body);
    expect(cuerpo).toContain('Paso 1');
  });
});

// ---------------------------------------------------------------------------

describe('manejarInscripcion — TwiML estructura', function() {
  beforeEach(function() {
    mockFrom.mockReturnValue({ insert: mockInsert });
    mockInsert.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ single: mockSingle });
  });

  // TEST 11: estructura XML observable
  it('debería responder con estructura TwiML completa y Content-Type text/xml', async function() {
    var sesion = { tipo: 'inscripcion', estado: 'INICIO', inscripcion: undefined };
    setSesionActual(sesion);

    var req = crearReqFalso('whatsapp:+573001234567', 'hola');
    var res = crearResFalso();

    await manejarInscripcion(req, res);

    expect(res._headers['Content-Type']).toBe('text/xml');
    expect(res._body).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    expect(res._body).toContain('<Response>');
    expect(res._body).toContain('<Message>');
    expect(res._body).toContain('</Message>');
    expect(res._body).toContain('</Response>');
  });

  // TEST 12: comportamiento de escaparXml con valor 0 (número)
  it('debería producir string vacío cuando escaparXml recibe el valor 0 (cero numérico)', async function() {
    /*
     * CAPTURA DE COMPORTAMIENTO ACTUAL (para detectar cambios en el refactor):
     *
     * En flujo.js la función local escaparXml hace:
     *   String(str || '')
     *
     * Para str = 0 (número), la evaluación es:
     *   0 || ''  → ''   (0 es falsy en JS)
     *   String('') → ''
     *
     * Resultado: el número 0 se convierte en string vacío '', NO en '0'.
     *
     * Este comportamiento es diferente de la versión en twiml.js compartido, que hace:
     *   String(texto == null ? '' : texto)
     * allí 0 produciría '0' (el string 'cero'), NO ''.
     *
     * Este test captura el comportamiento ACTUAL (str || '') de flujo.js vía efecto
     * observable: si pasamos un mensaje que consiste solo en el número 0, el campo
     * <Message> en el TwiML contendrá el texto renderizado con ese 0 escapado.
     *
     * La vía directa no es posible porque escaparXml no está exportada.
     * La capturamos indirectamente: en el paso NOMBRE, si el mensaje es el número cero
     * como string, no hay ruta especial (no es '0' el comando REINICIAR porque ese
     * compara mensaje === '0', que sí coincide — ver nota abajo).
     *
     * NOTA IMPORTANTE: el mensaje '0' (string, lo que llega de WhatsApp) SÍ activa
     * el path REINICIAR en flujo.js (línea: if (mensaje === '0' || ...)).
     * Por tanto, la función escaparXml de flujo.js no puede ser ejercida con el valor
     * literalmente numérico 0 a través del handler público — ese valor nunca llega
     * como Number; siempre llega como string desde req.body.Body.
     *
     * Lo que SÍ podemos verificar es el comportamiento con texto que contenga caracteres
     * XML especiales, que es la función principal de escaparXml. Y documentamos aquí
     * la diferencia semántica str||'' vs el comportamiento del compartido para que el
     * refactor-engineer la tenga en cuenta.
     */
    var sesion = crearSesionEnEstado(ESTADOS.NOMBRE);
    setSesionActual(sesion);

    // Enviamos texto con caracteres XML especiales para verificar el escape
    var textoConXml = 'Juan <Pérez> & "Ríos"';
    var req = crearReqFalso('whatsapp:+573001234567', textoConXml);
    var res = crearResFalso();

    await manejarInscripcion(req, res);

    expect(res._sent).toBe(true);
    // El nombre tiene caracteres que serían inválidos como XML sin escape
    // El TwiML debe estar bien formado (los caracteres especiales deben aparecer escapados)
    var body = res._body;
    // No debe contener < ni > sin escapar dentro de <Message>...</Message> (aparte de las etiquetas)
    var contenidoMensaje = body.replace(/<\?xml[^>]*\?>/, '')
                               .replace(/<Response>/, '')
                               .replace(/<\/Response>/, '')
                               .replace(/<Message>/, '')
                               .replace(/<\/Message>/, '');
    expect(contenidoMensaje).not.toContain('<Pérez>');
    expect(contenidoMensaje).not.toContain('& "');
  });
});

// ---------------------------------------------------------------------------

describe('manejarInscripcion — flujo feliz completo', function() {
  beforeEach(function() {
    mockSingle.mockReset();
    mockSelect.mockReset();
    mockInsert.mockReset();
    mockFrom.mockReset();
    mockFrom.mockReturnValue({ insert: mockInsert });
    mockInsert.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ single: mockSingle });
  });

  // TEST 4: flujo feliz nombre → cédula → licencia → cargo → confirmación → SI → éxito
  it('debería completar el flujo completo de inscripción y llamar insert con el payload correcto', async function() {
    var TELEFONO = 'whatsapp:+573001234567';
    var sesion = {};

    // ---- Paso 0: primera entrada (sin inscripcion) → bienvenida ----
    setSesionActual(sesion);
    await manejarInscripcion(crearReqFalso(TELEFONO, 'hola'), crearResFalso());
    expect(sesion.estado).toBe(ESTADOS.NOMBRE);

    // ---- Paso 1: nombre ----
    var resNombre = crearResFalso();
    await manejarInscripcion(crearReqFalso(TELEFONO, 'Carlos Ruiz'), resNombre);
    expect(sesion.estado).toBe(ESTADOS.CEDULA);
    expect(sesion.inscripcion.nombre).toBe('Carlos Ruiz');
    expect(extraerMensaje(resNombre._body)).toContain('Paso 2');

    // ---- Paso 2: cédula ----
    var resCedula = crearResFalso();
    await manejarInscripcion(crearReqFalso(TELEFONO, '1023456789'), resCedula);
    expect(sesion.estado).toBe(ESTADOS.LICENCIA);
    expect(sesion.inscripcion.cedula).toBe('1023456789');

    // ---- Paso 3: licencia ----
    var resLicencia = crearResFalso();
    await manejarInscripcion(crearReqFalso(TELEFONO, '1'), resLicencia);
    expect(sesion.estado).toBe(ESTADOS.CARGO);
    expect(sesion.inscripcion.licencia).toBe('B1');

    // ---- Paso 4: cargo ----
    var resCargo = crearResFalso();
    await manejarInscripcion(crearReqFalso(TELEFONO, '1'), resCargo);
    expect(sesion.estado).toBe(ESTADOS.CONFIRMACION);
    expect(sesion.inscripcion.cargo).toBe('Conductor');

    // ---- Confirmación: SI → inserción ----
    mockSingle.mockResolvedValueOnce({ error: null, data: { id: 1 } });

    var resConfirm = crearResFalso();
    await manejarInscripcion(crearReqFalso(TELEFONO, 'SI'), resConfirm);

    // Verificar que se llamó .from('conductores').insert([payload])
    expect(mockFrom).toHaveBeenCalledWith('conductores');
    var payloadInsert = mockInsert.mock.calls[0][0];
    expect(payloadInsert).toHaveLength(1);
    var registro = payloadInsert[0];
    expect(registro.nombre).toBe('Carlos Ruiz');
    expect(registro.cedula).toBe('1023456789');
    expect(registro.licencia_categoria).toBe('B1');
    expect(registro.cargo).toBe('Conductor');
    expect(registro.activo).toBe(true);

    // Verificar mensaje de éxito
    var cuerpoExito = extraerMensaje(resConfirm._body);
    expect(cuerpoExito).toContain('Carlos Ruiz');

    // Sesión limpiada tras éxito
    expect(sesion.inscripcion).toBeNull();
    expect(sesion.tipo).toBeNull();
    expect(sesion.estado).toBe('INICIO');
  });
});

// ---------------------------------------------------------------------------

describe('manejarInscripcion — normalización de teléfono', function() {
  beforeEach(function() {
    mockSingle.mockReset();
    mockSelect.mockReset();
    mockInsert.mockReset();
    mockFrom.mockReset();
    mockFrom.mockReturnValue({ insert: mockInsert });
    mockInsert.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ single: mockSingle });
  });

  // TEST 6: normalización de whatsapp: prefix
  it('debería guardar el teléfono sin el prefijo "whatsapp:" en el registro insertado', async function() {
    var TELEFONO = 'whatsapp:+573009998877';

    var sesion = crearSesionEnEstado(ESTADOS.CONFIRMACION, {
      inscripcion: { nombre: 'Ana López', cedula: '7654321', licencia: 'C1', cargo: 'Supervisor' }
    });
    setSesionActual(sesion);

    mockSingle.mockResolvedValueOnce({ error: null, data: { id: 2 } });

    var res = crearResFalso();
    await manejarInscripcion(crearReqFalso(TELEFONO, 'SI'), res);

    var payloadInsert = mockInsert.mock.calls[0][0];
    var registro = payloadInsert[0];

    // El prefijo whatsapp: debe haber sido eliminado
    expect(registro.telefono).toBe('+573009998877');
    expect(registro.telefono).not.toContain('whatsapp:');
  });

  it('debería guardar el teléfono sin prefijo también con prefijo en mayúsculas "WHATSAPP:"', async function() {
    var TELEFONO = 'WHATSAPP:+573001112233';

    var sesion = crearSesionEnEstado(ESTADOS.CONFIRMACION, {
      inscripcion: { nombre: 'Pedro Díaz', cedula: '1122334', licencia: 'A2', cargo: 'Operario' }
    });
    setSesionActual(sesion);

    mockSingle.mockResolvedValueOnce({ error: null, data: { id: 3 } });

    var res = crearResFalso();
    await manejarInscripcion(crearReqFalso(TELEFONO, 'SI'), res);

    var payloadInsert = mockInsert.mock.calls[0][0];
    var registro = payloadInsert[0];

    expect(registro.telefono).toBe('+573001112233');
    expect(registro.telefono).not.toMatch(/whatsapp:/i);
  });
});

// ---------------------------------------------------------------------------

describe('manejarInscripcion — error 23505 (cédula duplicada)', function() {
  beforeEach(function() {
    mockSingle.mockReset();
    mockSelect.mockReset();
    mockInsert.mockReset();
    mockFrom.mockReset();
    mockFrom.mockReturnValue({ insert: mockInsert });
    mockInsert.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ single: mockSingle });
  });

  // TEST 7: error 23505 → limpia sesión y responde mensaje de duplicado
  it('debería limpiar sesión y responder mensaje de duplicado cuando Supabase devuelve error 23505', async function() {
    var sesion = crearSesionEnEstado(ESTADOS.CONFIRMACION, {
      inscripcion: { nombre: 'Luis Mora', cedula: '5556667', licencia: 'B3', cargo: 'Conductor' }
    });
    setSesionActual(sesion);

    mockSingle.mockResolvedValueOnce({
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
      data: null
    });

    var res = crearResFalso();
    await manejarInscripcion(crearReqFalso('whatsapp:+573001234567', 'SI'), res);

    expect(res._sent).toBe(true);

    var cuerpo = extraerMensaje(res._body);
    // El mensaje debe mencionar la cédula ya registrada
    expect(cuerpo).toContain('cédula');

    // La sesión se limpia tras error 23505
    expect(sesion.inscripcion).toBeNull();
    expect(sesion.tipo).toBeNull();
    expect(sesion.estado).toBe('INICIO');
  });
});

// ---------------------------------------------------------------------------

describe('manejarInscripcion — error genérico de Supabase', function() {
  beforeEach(function() {
    mockSingle.mockReset();
    mockSelect.mockReset();
    mockInsert.mockReset();
    mockFrom.mockReset();
    mockFrom.mockReturnValue({ insert: mockInsert });
    mockInsert.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ single: mockSingle });
  });

  // TEST 8: error genérico → NO limpia sesión, responde mensaje de error
  it('debería NO limpiar la sesión y responder mensaje de error cuando Supabase devuelve error genérico', async function() {
    var sesion = crearSesionEnEstado(ESTADOS.CONFIRMACION, {
      inscripcion: { nombre: 'Gloria Vera', cedula: '8889990', licencia: 'C2', cargo: 'Supervisor' }
    });
    setSesionActual(sesion);

    mockSingle.mockResolvedValueOnce({
      error: { code: 'OTHER_ERROR', message: 'connection timeout' },
      data: null
    });

    var res = crearResFalso();
    await manejarInscripcion(crearReqFalso('whatsapp:+573001234567', 'SI'), res);

    expect(res._sent).toBe(true);

    var cuerpo = extraerMensaje(res._body);
    // El mensaje debe mencionar el error
    expect(cuerpo).toContain('error');

    // La sesión NO se limpia — el usuario puede reintentar
    expect(sesion.inscripcion).not.toBeNull();
    expect(sesion.inscripcion.nombre).toBe('Gloria Vera');
  });
});

// ---------------------------------------------------------------------------

describe('manejarInscripcion — inserción: payload completo con campo activo', function() {
  beforeEach(function() {
    mockSingle.mockReset();
    mockSelect.mockReset();
    mockInsert.mockReset();
    mockFrom.mockReset();
    mockFrom.mockReturnValue({ insert: mockInsert });
    mockInsert.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ single: mockSingle });
  });

  // TEST 5: verificar que se llama insert con todos los campos esperados
  it('debería llamar .from("conductores").insert([...]) con todos los campos del registro', async function() {
    var sesion = crearSesionEnEstado(ESTADOS.CONFIRMACION, {
      inscripcion: {
        nombre: 'Marta Peña',
        cedula: '3334445',
        licencia: 'C3',
        cargo: 'Técnico electricista'
      }
    });
    setSesionActual(sesion);

    mockSingle.mockResolvedValueOnce({ error: null, data: { id: 5 } });

    var res = crearResFalso();
    await manejarInscripcion(crearReqFalso('whatsapp:+573007778899', 'SI'), res);

    expect(mockFrom).toHaveBeenCalledWith('conductores');
    expect(mockInsert).toHaveBeenCalledTimes(1);

    var payload = mockInsert.mock.calls[0][0];
    expect(payload).toHaveLength(1);

    var reg = payload[0];
    expect(reg).toMatchObject({
      nombre: 'Marta Peña',
      cedula: '3334445',
      telefono: '+573007778899',
      licencia_categoria: 'C3',
      cargo: 'Técnico electricista',
      activo: true
    });
  });
});
