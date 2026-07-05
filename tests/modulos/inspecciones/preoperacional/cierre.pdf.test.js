'use strict';

/**
 * tests/modulos/inspecciones/preoperacional/cierre.pdf.test.js
 *
 * Test de integración: el cierre del preoperacional DEBE entregar el PDF.
 *
 * Contexto: bug histórico — servicios/pdf/preoperacional.js referenciaba
 * `base.subirPDF` sin importar `base`. El ReferenceError era tragado por el
 * catch interno (return null) y el PDF jamás se subía ni se enviaba por
 * WhatsApp, en silencio. cierre.test.js no lo detectaba porque mockeaba
 * subirYEnviarPDF completo.
 *
 * Estrategia: aquí NO se mockea servicios/pdf/preoperacional.js — corre el
 * wrapper real dentro del cierre real. Solo se mockean:
 *   - GeneradorPDFPreoperacional (clase) → buffer dummy (no renderizamos PDF)
 *   - servicios/pdf/entrega        → spies de subirPDF / enviarPDFWhatsApp
 *   - config y capa data           → igual que cierre.test.js
 *
 * Si alguien reintroduce un fallo silencioso en la cadena
 * cierre → wrapper → entrega, estos asserts fallan:
 *   - resultado.pdfUrl deja de ser la URL firmada (vuelve null)
 *   - entrega.subirPDF / enviarPDFWhatsApp dejan de ser invocados
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. MOCKS (antes del require del módulo bajo prueba)
// ─────────────────────────────────────────────────────────────────────────────

// config/config: minimalista + cadena from().update().eq() que usa el wrapper
var mockEq     = jest.fn().mockResolvedValue({ error: null });
var mockUpdate = jest.fn(function() { return { eq: mockEq }; });
var mockFrom   = jest.fn(function() { return { update: mockUpdate }; });

jest.mock('../../../../config/config', function() {
  return {
    supabase: { from: mockFrom },
    TABLES: {
      activos: 'activos',
      conductores: 'conductores',
      preoperacionales: 'preoperacionales',
      posoperacionales: 'posoperacionales',
      tanqueos: 'tanqueos',
      sesionesActivas: 'sesiones_activas',
      evidencia: 'evidencia'
    },
    STORAGE_BUCKET_PREOPERACIONALES: 'preoperacionales',
    TWILIO_WHATSAPP_NUMBER: 'whatsapp:+10000000000',
    MAX_KM_SALTO: 500,
    TIMEOUT_FLUJO_MS: { default: 30 * 60 * 1000 },
    TIMEOUT_RECUPERACION_MS: 5 * 60 * 1000
  };
});

// Generación: clase mockeada — este test NO valida el render, solo la entrega
jest.mock('../../../../servicios/pdf/GeneradorPDFPreoperacional', function() {
  return class GeneradorPDFPreoperacionalMock {
    async generar() {
      return Buffer.from('%PDF-mock');
    }
  };
});

// Entrega: spies — el corazón del test
jest.mock('../../../../servicios/pdf/entrega', function() {
  return {
    subirPDF: jest.fn().mockResolvedValue('https://storage.mock/preop-firmado.pdf'),
    enviarPDFWhatsApp: jest.fn().mockResolvedValue(true),
    obtenerFechaColombia: jest.fn(function() { return new Date('2026-07-04T10:00:00-05:00'); })
  };
});

// Capa data y colaboradores del cierre: mismos mocks que cierre.test.js
jest.mock('../../../../data/autorizaciones', function() {
  return {
    crearAutorizacionDesdeBloqueo: jest.fn().mockResolvedValue({ ok: true, autorizacionId: 'mock-uuid', creada: true }),
    calcularDiasRestantes: jest.fn(),
    clasificarEstado: jest.fn(),
    obtenerDocumentosActivos: jest.fn(),
    obtenerAutorizacionesPendientes: jest.fn(),
    obtenerAutorizacionesResueltas: jest.fn(),
    registrarDecision: jest.fn(),
    obtenerHistorialActivo: jest.fn()
  };
});

jest.mock('../../../../data/alertas', function() {
  return {
    bloquearActivo: jest.fn().mockResolvedValue({ ok: true }),
    desbloquearActivo: jest.fn().mockResolvedValue({ ok: true }),
    obtenerBloqueoActivo: jest.fn().mockResolvedValue(null)
  };
});

jest.mock('../../../../data/inspecciones', function() {
  return {
    crearPreoperacional: jest.fn().mockResolvedValue({ error: null, data: { id: 'preop-uuid' } }),
    guardarFotosEvidencia: jest.fn().mockResolvedValue({ error: null }),
    actualizarKilometrajeActivo: jest.fn().mockResolvedValue({ error: null }),
    obtenerKilometrajeReferencia: jest.fn().mockResolvedValue({ error: null, data: null })
  };
});

jest.mock('../../../../data/activos', function() {
  return {
    cargarActivoYConductor: jest.fn().mockResolvedValue({ error: null, conductor: null, vehiculo: null }),
    registrarCambioEstado: jest.fn().mockResolvedValue({ error: null }),
    obtenerActivoIdPorPlaca: jest.fn().mockResolvedValue(null)
  };
});

jest.mock('../../../../modulos/alertas/notificador', function() {
  return {
    notificarCriticas: jest.fn().mockResolvedValue(undefined),
    enviarWhatsApp: jest.fn().mockResolvedValue(undefined)
  };
});

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

jest.mock('../../../../servicios/sesiones', function() {
  return {
    copiarSesion: jest.fn(function(sesion) {
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
// 2. IMPORTS tras los mocks — pdf/preoperacional.js entra SIN mockear
// ─────────────────────────────────────────────────────────────────────────────

var cierre  = require('../../../../modulos/inspecciones/preoperacional/cierre');
var entrega = require('../../../../servicios/pdf/entrega');

// ─────────────────────────────────────────────────────────────────────────────
// 3. HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function crearSesionMinima() {
  return {
    vehiculo: { id: 'activo-uuid', kilometraje: 100 },
    conductor: { id: 'conductor-uuid' },
    kilometraje: 150,
    plantilla: { id: 'plantilla-uuid' },
    respuestas: {},
    novedades: [],
    fotos: [],
    placa: 'MSO120',
    observacion: null
  };
}

var GRUPOS_VACIOS = [];

// ─────────────────────────────────────────────────────────────────────────────
// 4. TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('guardarPreoperacionalCompleto — entrega real del PDF (wrapper sin mockear)', function() {

  beforeEach(function() {
    entrega.subirPDF.mockClear();
    entrega.enviarPDFWhatsApp.mockClear();
    mockFrom.mockClear();
    mockUpdate.mockClear();
    mockEq.mockClear();
    entrega.subirPDF.mockResolvedValue('https://storage.mock/preop-firmado.pdf');
  });

  it('debería subir el PDF, guardar pdf_url en BD, enviarlo por WhatsApp y retornar la URL firmada', async function() {
    var sesion = crearSesionMinima();

    var resultado = await cierre.guardarPreoperacionalCompleto(sesion, '+573001234567', GRUPOS_VACIOS);

    expect(resultado.error).toBeNull();

    // 1. La entrega ocurrió: subirPDF fue invocado con un Buffer y el bucket correcto
    expect(entrega.subirPDF).toHaveBeenCalledTimes(1);
    var argsSubir = entrega.subirPDF.mock.calls[0];
    expect(Buffer.isBuffer(argsSubir[0])).toBe(true);
    expect(argsSubir[1]).toBe('preoperacionales');
    expect(String(argsSubir[2])).toMatch(/^preop_MSO120_\d+\.pdf$/);

    // 2. pdf_url quedó guardada en BD para el preop correcto
    expect(mockFrom).toHaveBeenCalledWith('preoperacionales');
    expect(mockUpdate).toHaveBeenCalledWith({ pdf_url: 'https://storage.mock/preop-firmado.pdf' });
    expect(mockEq).toHaveBeenCalledWith('id', 'preop-uuid');

    // 3. El conductor recibió el enlace por WhatsApp
    expect(entrega.enviarPDFWhatsApp).toHaveBeenCalledTimes(1);
    var argsWa = entrega.enviarPDFWhatsApp.mock.calls[0];
    expect(argsWa[0]).toBe('https://storage.mock/preop-firmado.pdf');
    expect(argsWa[1]).toBe('+573001234567');

    // 4. El cierre expone la URL — con el bug histórico esto era null
    expect(resultado.pdfUrl).toBe('https://storage.mock/preop-firmado.pdf');
  });

  it('debería retornar pdfUrl null SIN enviar WhatsApp si la subida a Storage falla', async function() {
    entrega.subirPDF.mockResolvedValue(null);
    var sesion = crearSesionMinima();

    var resultado = await cierre.guardarPreoperacionalCompleto(sesion, '+573001234567', GRUPOS_VACIOS);

    // El cierre no debe romperse por un fallo de entrega…
    expect(resultado.error).toBeNull();
    expect(resultado.preop.id).toBe('preop-uuid');

    // …pero tampoco debe fingir éxito ni enviar un enlace inexistente
    expect(resultado.pdfUrl).toBeNull();
    expect(entrega.enviarPDFWhatsApp).not.toHaveBeenCalled();
  });

});
