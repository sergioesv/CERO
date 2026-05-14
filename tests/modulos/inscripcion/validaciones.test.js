'use strict';

/**
 * tests/modulos/inscripcion/validaciones.test.js
 *
 * Tests unitarios puros para modulos/inscripcion/validaciones.js.
 * No requieren mocks: todas las funciones son puras (sin I/O).
 */

var validaciones = require('../../../modulos/inscripcion/validaciones');

// ============================================================================
// validarNombre
// ============================================================================

describe('validarNombre — casos válidos', function() {
  it('debería aceptar un nombre con dos palabras correctas', function() {
    var result = validaciones.validarNombre('Juan Pérez');
    expect(result.valido).toBe(true);
    expect(result.valor).toBe('Juan Pérez');
    expect(result.error).toBeNull();
  });

  it('debería capitalizar cada palabra del nombre', function() {
    var result = validaciones.validarNombre('maria jose garcia');
    expect(result.valido).toBe(true);
    expect(result.valor).toBe('Maria Jose Garcia');
  });

  it('debería aceptar nombre con tres palabras y tildes', function() {
    var result = validaciones.validarNombre('Andrés Felipe López');
    expect(result.valido).toBe(true);
    expect(result.valor).toBe('Andrés Felipe López');
  });

  it('debería normalizar espacios múltiples internos', function() {
    var result = validaciones.validarNombre('Ana   Lucia  Torres');
    expect(result.valido).toBe(true);
    expect(result.valor).toBe('Ana Lucia Torres');
  });
});

describe('validarNombre — casos inválidos', function() {
  it('debería rechazar nombre vacío', function() {
    var result = validaciones.validarNombre('');
    expect(result.valido).toBe(false);
    expect(result.valor).toBeNull();
  });

  it('debería rechazar nombre con una sola palabra', function() {
    var result = validaciones.validarNombre('Carlos');
    expect(result.valido).toBe(false);
    expect(result.error).toMatch(/nombre y apellido/i);
  });

  it('debería rechazar nombre con números', function() {
    var result = validaciones.validarNombre('Juan123 Pérez');
    expect(result.valido).toBe(false);
    expect(result.error).toMatch(/letras/i);
  });

  it('debería rechazar nombre con menos de 3 caracteres', function() {
    var result = validaciones.validarNombre('A');
    expect(result.valido).toBe(false);
    expect(result.error).toMatch(/3 caracteres/i);
  });
});

// ============================================================================
// validarCedula
// ============================================================================

describe('validarCedula — casos válidos', function() {
  it('debería aceptar cédula de 10 dígitos', function() {
    var result = validaciones.validarCedula('1023456789');
    expect(result.valido).toBe(true);
    expect(result.valor).toBe('1023456789');
  });

  it('debería aceptar cédula de 5 dígitos (mínimo)', function() {
    var result = validaciones.validarCedula('12345');
    expect(result.valido).toBe(true);
    expect(result.valor).toBe('12345');
  });

  it('debería eliminar puntos y dejar solo dígitos', function() {
    var result = validaciones.validarCedula('1.023.456.789');
    expect(result.valido).toBe(true);
    expect(result.valor).toBe('1023456789');
  });
});

describe('validarCedula — casos inválidos', function() {
  it('debería rechazar cédula de menos de 5 dígitos', function() {
    var result = validaciones.validarCedula('1234');
    expect(result.valido).toBe(false);
    expect(result.error).toMatch(/5 dígitos/i);
  });

  it('debería rechazar cédula de más de 10 dígitos', function() {
    var result = validaciones.validarCedula('12345678901');
    expect(result.valido).toBe(false);
    expect(result.error).toMatch(/10 dígitos/i);
  });

  it('debería rechazar cédula vacía', function() {
    var result = validaciones.validarCedula('');
    expect(result.valido).toBe(false);
  });
});

// ============================================================================
// validarLicencia
// ============================================================================

describe('validarLicencia — casos válidos', function() {
  it('debería aceptar opción numérica "1" → B1', function() {
    var result = validaciones.validarLicencia('1');
    expect(result.valido).toBe(true);
    expect(result.valor).toBe('B1');
  });

  it('debería aceptar opción numérica "4" → C1', function() {
    var result = validaciones.validarLicencia('4');
    expect(result.valido).toBe(true);
    expect(result.valor).toBe('C1');
  });

  it('debería aceptar texto directo "B2" (mayúsculas)', function() {
    var result = validaciones.validarLicencia('B2');
    expect(result.valido).toBe(true);
    expect(result.valor).toBe('B2');
  });

  it('debería aceptar texto directo "b2" (minúsculas)', function() {
    var result = validaciones.validarLicencia('b2');
    expect(result.valido).toBe(true);
    expect(result.valor).toBe('B2');
  });

  it('debería aceptar "A2" para motocicleta', function() {
    var result = validaciones.validarLicencia('A2');
    expect(result.valido).toBe(true);
    expect(result.valor).toBe('A2');
  });
});

describe('validarLicencia — casos inválidos', function() {
  it('debería rechazar texto no reconocido', function() {
    var result = validaciones.validarLicencia('X9');
    expect(result.valido).toBe(false);
    expect(result.valor).toBeNull();
  });

  it('debería rechazar entrada vacía', function() {
    var result = validaciones.validarLicencia('');
    expect(result.valido).toBe(false);
  });

  it('debería rechazar opción numérica fuera de rango "8"', function() {
    var result = validaciones.validarLicencia('8');
    expect(result.valido).toBe(false);
  });
});

// ============================================================================
// validarCargo
// ============================================================================

describe('validarCargo — casos válidos', function() {
  it('debería aceptar opción "1" → Conductor', function() {
    var result = validaciones.validarCargo('1');
    expect(result.valido).toBe(true);
    expect(result.valor).toBe('Conductor');
  });

  it('debería aceptar opción "4" → Supervisor', function() {
    var result = validaciones.validarCargo('4');
    expect(result.valido).toBe(true);
    expect(result.valor).toBe('Supervisor');
  });

  it('debería aceptar texto "conductor" en minúsculas', function() {
    var result = validaciones.validarCargo('conductor');
    expect(result.valido).toBe(true);
    expect(result.valor).toBe('Conductor');
  });

  it('debería aceptar texto "tecnico electricista"', function() {
    var result = validaciones.validarCargo('tecnico electricista');
    expect(result.valido).toBe(true);
    expect(result.valor).toBe('Técnico electricista');
  });
});

describe('validarCargo — casos inválidos', function() {
  it('debería rechazar cargo desconocido', function() {
    var result = validaciones.validarCargo('bombero');
    expect(result.valido).toBe(false);
    expect(result.valor).toBeNull();
  });

  it('debería rechazar entrada vacía', function() {
    var result = validaciones.validarCargo('');
    expect(result.valido).toBe(false);
  });

  it('debería rechazar opción "5" que no existe', function() {
    var result = validaciones.validarCargo('5');
    expect(result.valido).toBe(false);
  });
});
