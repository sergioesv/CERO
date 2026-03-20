// modulos/vehiculos/inscripcion/mensajes.js
// Textos de UX para el flujo de inscripción de conductores nuevos.
// Sistema de diseño unificado CERO:
//   Opciones  → 1️⃣ Texto
//   Navegación → Escribe ATRAS o CANCELAR (texto, no botones)
//   Confirmar  → Escribe *SI* para registrarte
//   Separadores → solo en resúmenes
//   Tono       → informal, español correcto

'use strict';

// ── Pie de navegación estándar ────────────────────────────────────────────────

var PIE_NAV = '\n\n0️⃣ _Atrás_  •  9️⃣ _Menú principal_';

// ============================================================================
// BIENVENIDA / INICIO
// ============================================================================

function mensajeBienvenida() {
  return (
    '👋 *Bienvenido a CERO*\n' +
    '_cero papel, cero accidentes_\n\n' +
    '⚠️ Tu número no está registrado en el sistema.\n\n' +
    'Vamos a registrarte en un momento.\nSolo necesito 4 datos.\n\n' +
    '📝 *Paso 1 de 4 — Nombre completo*\n' +
    'Escribe tu nombre y apellidos:' +
    '\n\n✖️ *CANCELAR* para salir'
  );
}

// ============================================================================
// PASOS DEL FORMULARIO
// ============================================================================

function mensajePedirCedula(nombre) {
  return (
    '✅ Nombre: *' + nombre + '*\n\n' +
    '📝 *Paso 2 de 4 — Número de cédula*\n' +
    'Escribe solo los números, sin puntos ni espacios:' +
    PIE_NAV
  );
}

function mensajePedirLicencia(cedula) {
  return (
    '✅ Cédula: *' + cedula + '*\n\n' +
    '📝 *Paso 3 de 4 — Categoría de licencia*\n\n' +
    '1️⃣ B1 — autos y camionetas\n' +
    '2️⃣ B2 — microbús\n' +
    '3️⃣ B3 — bus, buseta\n' +
    '4️⃣ C1 — camión\n' +
    '5️⃣ C2 — tractocamión\n' +
    '6️⃣ C3 — vehículos articulados\n' +
    '7️⃣ A2 — motocicleta\n\n' +
    'Escribe el número o la categoría directamente:' +
    PIE_NAV
  );
}

function mensajePedirCargo(licencia) {
  return (
    '✅ Licencia: *' + licencia + '*\n\n' +
    '📝 *Paso 4 de 4 — Cargo*\n\n' +
    '1️⃣ Conductor\n' +
    '2️⃣ Operario\n' +
    '3️⃣ Técnico electricista\n' +
    '4️⃣ Supervisor\n\n' +
    'Escribe el número o el cargo directamente:' +
    PIE_NAV
  );
}

// ============================================================================
// CONFIRMACIÓN ANTES DE GUARDAR
// ============================================================================

function mensajeConfirmacion(datos) {
  return (
    '───────────────\n' +
    '📋 *RESUMEN DE REGISTRO*\n' +
    '───────────────\n' +
    '👤 Nombre: *' + datos.nombre + '*\n' +
    '🪪 Cédula: *' + datos.cedula + '*\n' +
    '🚗 Licencia: *' + datos.licencia + '*\n' +
    '💼 Cargo: *' + datos.cargo + '*\n\n' +
    '✍️ Escribe *SI* para registrarte\n' +
    '0️⃣ _Atrás_ para corregir  •  9️⃣ _Menú principal_'
  );
}

// ============================================================================
// RESULTADOS
// ============================================================================

function mensajeExito(nombre) {
  return (
    '✅ *¡Registro exitoso!*\n\n' +
    'Bienvenido, *' + nombre + '*.\n' +
    'Ya puedes usar el sistema CERO.\n\n' +
    'Escribe *MENU* para comenzar.'
  );
}

function mensajeError() {
  return (
    '❌ Ocurrió un error al guardar el registro.\n\n' +
    'Intenta de nuevo o contacta al supervisor.\n\n' +
    'Escribe *REINICIAR* para comenzar de nuevo.'
  );
}

function mensajeCancelado() {
  return (
    '✖️ Registro cancelado.\n\n' +
    'Escribe *MENU* cuando quieras intentarlo de nuevo.'
  );
}

function mensajeValidacionFallida(campo, instruccion) {
  return (
    '⚠️ *' + campo + '* no válido.\n\n' +
    instruccion +
    PIE_NAV
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
