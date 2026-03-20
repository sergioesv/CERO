// modulos/vehiculos/inscripcion/mensajes.js
// Textos de UX para el flujo de inscripción de conductores nuevos

'use strict';

// ============================================================================
// MENSAJE DE BIENVENIDA / INICIO DE INSCRIPCIÓN
// ============================================================================

/**
 * Mensaje inicial cuando el número no está registrado en el sistema.
 */
function mensajeBienvenida() {
  return (
    '👋 *Bienvenido a CERO*\n' +
    '_cero papel, cero accidentes_\n\n' +
    '⚠️ Tu número no está registrado en el sistema.\n\n' +
    'Vamos a registrarte en un momento.\n' +
    'Necesito 4 datos. Puedes escribir *CANCELAR* en cualquier paso.\n\n' +
    '📝 *Paso 1 de 4 — Nombre completo*\n' +
    'Escribe tu nombre y apellidos:'
  );
}

// ============================================================================
// PASOS DEL FORMULARIO
// ============================================================================

/**
 * Solicita la cédula después de recibir el nombre.
 * @param {string} nombre - Nombre confirmado
 */
function mensajePedirCedula(nombre) {
  return (
    '✅ Nombre: *' + nombre + '*\n\n' +
    '📝 *Paso 2 de 4 — Número de cédula*\n' +
    'Escribe solo los números, sin puntos ni espacios:'
  );
}

/**
 * Solicita la categoría de licencia después de recibir la cédula.
 * @param {string} cedula - Cédula confirmada
 */
function mensajePedirLicencia(cedula) {
  return (
    '✅ Cédula: *' + cedula + '*\n\n' +
    '📝 *Paso 3 de 4 — Categoría de licencia*\n\n' +
    '1 — B1 (autos y camionetas)\n' +
    '2 — B2 (microbús)\n' +
    '3 — B3 (bus, buseta)\n' +
    '4 — C1 (camión)\n' +
    '5 — C2 (tractocamión)\n' +
    '6 — C3 (vehículos articulados)\n' +
    '7 — A2 (motocicleta)\n\n' +
    'Escribe el número o la categoría directamente:'
  );
}

/**
 * Solicita el cargo después de recibir la licencia.
 * @param {string} licencia - Categoría confirmada
 */
function mensajePedirCargo(licencia) {
  return (
    '✅ Licencia: *' + licencia + '*\n\n' +
    '📝 *Paso 4 de 4 — Cargo*\n\n' +
    '1 — Conductor\n' +
    '2 — Operario\n' +
    '3 — Técnico electricista\n' +
    '4 — Supervisor\n\n' +
    'Escribe el número o el cargo directamente:'
  );
}

// ============================================================================
// CONFIRMACIÓN ANTES DE GUARDAR
// ============================================================================

/**
 * Muestra resumen y pide confirmación final.
 * @param {object} datos - { nombre, cedula, licencia, cargo }
 */
function mensajeConfirmacion(datos) {
  return (
    '📋 *Resumen de tu registro*\n\n' +
    '👤 Nombre: *' + datos.nombre + '*\n' +
    '🪪 Cédula: *' + datos.cedula + '*\n' +
    '🚗 Licencia: *' + datos.licencia + '*\n' +
    '💼 Cargo: *' + datos.cargo + '*\n\n' +
    '¿Los datos son correctos?\n\n' +
    '*SI* — Guardar y continuar\n' +
    '*ATRAS* — Corregir\n' +
    '*CANCELAR* — Anular'
  );
}

// ============================================================================
// MENSAJES DE RESULTADO
// ============================================================================

/**
 * Registro exitoso — invita a volver al menú.
 * @param {string} nombre - Nombre del conductor recién registrado
 */
function mensajeExito(nombre) {
  return (
    '✅ *¡Registro exitoso!*\n\n' +
    'Bienvenido, *' + nombre + '*.\n' +
    'Ya puedes usar el sistema CERO.\n\n' +
    'Escribe *MENU* para comenzar.'
  );
}

/**
 * Error al guardar — pide intentar de nuevo.
 */
function mensajeError() {
  return (
    '❌ Ocurrió un error al guardar el registro.\n' +
    'Intenta de nuevo o contacta al supervisor.\n\n' +
    'Escribe *REINICIAR* para comenzar de nuevo.'
  );
}

/**
 * Cancelación confirmada.
 */
function mensajeCancelado() {
  return (
    '↩️ Registro cancelado.\n\n' +
    'Escribe *MENU* cuando quieras intentarlo de nuevo.'
  );
}

/**
 * Validación fallida — dato inválido.
 * @param {string} campo - Nombre del campo con error
 * @param {string} instruccion - Qué debe escribir el operario
 */
function mensajeValidacionFallida(campo, instruccion) {
  return (
    '⚠️ ' + campo + ' no válido.\n\n' +
    instruccion
  );
}

module.exports = {
  mensajeBienvenida,
  mensajePedirCedula,
  mensajePedirLicencia,
  mensajePedirCargo,
  mensajeConfirmacion,
  mensajeExito,
  mensajeError,
  mensajeCancelado,
  mensajeValidacionFallida
};
