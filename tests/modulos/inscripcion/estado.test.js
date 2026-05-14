'use strict';

/**
 * tests/modulos/inscripcion/estado.test.js
 *
 * Tests unitarios puros para modulos/inscripcion/estado.js.
 * No requieren mocks: las funciones operan solo sobre el objeto sesión.
 */

var estadoMod = require('../../../modulos/inscripcion/estado');
var ESTADOS = estadoMod.ESTADOS;

// ============================================================================
// ESTADOS exportados
// ============================================================================

describe('ESTADOS — valores del enum', function() {
  it('debería exportar los cinco estados del flujo', function() {
    expect(ESTADOS.NOMBRE).toBeDefined();
    expect(ESTADOS.CEDULA).toBeDefined();
    expect(ESTADOS.LICENCIA).toBeDefined();
    expect(ESTADOS.CARGO).toBeDefined();
    expect(ESTADOS.CONFIRMACION).toBeDefined();
  });

  it('debería tener valores de string únicos y no vacíos', function() {
    var valores = Object.values(ESTADOS);
    var unicos = new Set(valores);
    expect(unicos.size).toBe(valores.length);
    valores.forEach(function(v) {
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// iniciarInscripcion
// ============================================================================

describe('iniciarInscripcion — inicialización del subestado', function() {
  it('debería crear sesion.inscripcion con todos los campos en null', function() {
    var sesion = {};
    estadoMod.iniciarInscripcion(sesion);

    expect(sesion.inscripcion).not.toBeNull();
    expect(sesion.inscripcion.nombre).toBeNull();
    expect(sesion.inscripcion.cedula).toBeNull();
    expect(sesion.inscripcion.licencia).toBeNull();
    expect(sesion.inscripcion.cargo).toBeNull();
  });

  it('debería fijar sesion.estado al estado NOMBRE', function() {
    var sesion = {};
    estadoMod.iniciarInscripcion(sesion);

    expect(sesion.estado).toBe(ESTADOS.NOMBRE);
  });

  it('debería reiniciar los datos si ya había inscripcion previa', function() {
    var sesion = {
      inscripcion: { nombre: 'Carlos Ruiz', cedula: '12345', licencia: 'B1', cargo: 'Conductor' },
      estado: ESTADOS.CONFIRMACION
    };
    estadoMod.iniciarInscripcion(sesion);

    expect(sesion.inscripcion.nombre).toBeNull();
    expect(sesion.estado).toBe(ESTADOS.NOMBRE);
  });
});

// ============================================================================
// limpiarInscripcion
// ============================================================================

describe('limpiarInscripcion — limpieza tras completar o cancelar', function() {
  it('debería poner sesion.inscripcion en null', function() {
    var sesion = {
      inscripcion: { nombre: 'Ana Torres', cedula: '98765' },
      estado: ESTADOS.CEDULA
    };
    estadoMod.limpiarInscripcion(sesion);

    expect(sesion.inscripcion).toBeNull();
  });

  it('debería fijar sesion.estado a "INICIO"', function() {
    var sesion = {
      inscripcion: {},
      estado: ESTADOS.CONFIRMACION
    };
    estadoMod.limpiarInscripcion(sesion);

    expect(sesion.estado).toBe('INICIO');
  });

  it('debería poder limpiar una sesión ya vacía sin lanzar error', function() {
    var sesion = { inscripcion: null, estado: 'INICIO' };
    expect(function() {
      estadoMod.limpiarInscripcion(sesion);
    }).not.toThrow();
    expect(sesion.inscripcion).toBeNull();
    expect(sesion.estado).toBe('INICIO');
  });
});
