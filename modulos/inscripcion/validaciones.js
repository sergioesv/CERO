// modulos/inscripcion/validaciones.js
// Reglas de validación y normalización de datos para el registro de conductores

'use strict';

// ============================================================================
// MAPAS DE OPCIONES
// ============================================================================

// Categorías de licencia aceptadas — número de opción o texto directo
var LICENCIAS = {
  '1': 'B1', '2': 'B2', '3': 'B3',
  '4': 'C1', '5': 'C2', '6': 'C3',
  '7': 'A2',
  'B1': 'B1', 'B2': 'B2', 'B3': 'B3',
  'C1': 'C1', 'C2': 'C2', 'C3': 'C3',
  'A1': 'A1', 'A2': 'A2'
};

// Cargos aceptados — número de opción o texto directo
var CARGOS = {
  '1': 'Conductor',
  '2': 'Operario',
  '3': 'Técnico electricista',
  '4': 'Supervisor',
  'conductor': 'Conductor',
  'operario': 'Operario',
  'tecnico': 'Técnico electricista',
  'técnico': 'Técnico electricista',
  'tecnico electricista': 'Técnico electricista',
  'técnico electricista': 'Técnico electricista',
  'supervisor': 'Supervisor'
};

// ============================================================================
// NOMBRE
// ============================================================================

/**
 * Valida y normaliza el nombre completo.
 * Requiere al menos dos palabras, solo letras y espacios.
 * @param {string} texto
 * @returns {{ valido: boolean, valor: string|null, error: string|null }}
 */
function validarNombre(texto) {
  var limpio = (texto || '').trim().replace(/\s+/g, ' ');

  if (limpio.length < 3) {
    return { valido: false, valor: null, error: 'Debe tener al menos 3 caracteres.' };
  }

  if (limpio.split(' ').length < 2) {
    return { valido: false, valor: null, error: 'Escribe nombre y apellido.' };
  }

  if (!/^[a-záéíóúüñA-ZÁÉÍÓÚÜÑ\s]+$/u.test(limpio)) {
    return { valido: false, valor: null, error: 'Solo letras, sin números ni símbolos.' };
  }

  // Capitalizar primera letra de cada palabra
  var normalizado = limpio.split(' ')
    .map(function(p) { return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase(); })
    .join(' ');

  return { valido: true, valor: normalizado, error: null };
}

// ============================================================================
// CÉDULA
// ============================================================================

/**
 * Valida y normaliza el número de cédula colombiana.
 * Entre 5 y 10 dígitos.
 * @param {string} texto
 * @returns {{ valido: boolean, valor: string|null, error: string|null }}
 */
function validarCedula(texto) {
  // Eliminar todo lo que no sea dígito
  var solo = (texto || '').replace(/[^0-9]/g, '');

  if (solo.length < 5) {
    return { valido: false, valor: null, error: 'La cédula debe tener al menos 5 dígitos.' };
  }

  if (solo.length > 10) {
    return { valido: false, valor: null, error: 'La cédula no puede tener más de 10 dígitos.' };
  }

  return { valido: true, valor: solo, error: null };
}

// ============================================================================
// CATEGORÍA DE LICENCIA
// ============================================================================

/**
 * Interpreta la respuesta del operario y retorna la categoría normalizada.
 * Acepta número de opción (1-7) o texto directo (B1, C2, etc.).
 * @param {string} texto
 * @returns {{ valido: boolean, valor: string|null, error: string|null }}
 */
function validarLicencia(texto) {
  var clave = (texto || '').trim().toUpperCase();
  var encontrada = LICENCIAS[clave] || LICENCIAS[clave.replace(/\s/g, '')];

  if (!encontrada) {
    return {
      valido: false,
      valor: null,
      error: 'Escribe el número de opción (1-7)\no la categoría directamente (B1, C2, etc.)'
    };
  }

  return { valido: true, valor: encontrada, error: null };
}

// ============================================================================
// CARGO
// ============================================================================

/**
 * Interpreta la respuesta y retorna el cargo normalizado.
 * Acepta número de opción (1-4) o texto directo.
 * @param {string} texto
 * @returns {{ valido: boolean, valor: string|null, error: string|null }}
 */
function validarCargo(texto) {
  var clave = (texto || '').trim().toLowerCase();
  var encontrado = CARGOS[clave] || CARGOS[(texto || '').trim()];

  if (!encontrado) {
    return {
      valido: false,
      valor: null,
      error: 'Escribe el número de opción (1-4)\no el cargo directamente.'
    };
  }

  return { valido: true, valor: encontrado, error: null };
}

module.exports = {
  validarNombre,
  validarCedula,
  validarLicencia,
  validarCargo
};
