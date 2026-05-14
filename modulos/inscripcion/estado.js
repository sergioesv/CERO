// modulos/inscripcion/estado.js
// Inicialización y limpieza del estado de sesión para el flujo de inscripción

'use strict';

// ============================================================================
// ESTADOS POSIBLES DEL FLUJO
// ============================================================================

var ESTADOS = {
  NOMBRE:        'INSCRIPCION_NOMBRE',
  CEDULA:        'INSCRIPCION_CEDULA',
  LICENCIA:      'INSCRIPCION_LICENCIA',
  CARGO:         'INSCRIPCION_CARGO',
  CONFIRMACION:  'INSCRIPCION_CONFIRMACION'
};

// ============================================================================
// INICIALIZACIÓN
// ============================================================================

/**
 * Inicializa el subestado de inscripción en la sesión activa.
 * Se llama cuando se detecta que el teléfono no está registrado.
 * @param {object} sesion - Sesión activa del operario
 */
function iniciarInscripcion(sesion) {
  sesion.inscripcion = {
    nombre:   null,
    cedula:   null,
    licencia: null,
    cargo:    null
  };
  sesion.estado = ESTADOS.NOMBRE;
}

/**
 * Limpia el subestado de inscripción de la sesión.
 * Se llama al completar o cancelar el registro.
 * @param {object} sesion - Sesión activa del operario
 */
function limpiarInscripcion(sesion) {
  sesion.inscripcion = null;
  sesion.estado = 'INICIO';
}

module.exports = {
  ESTADOS,
  iniciarInscripcion,
  limpiarInscripcion
};
