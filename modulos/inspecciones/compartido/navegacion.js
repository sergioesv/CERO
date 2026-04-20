/**
 * Navegación compartida (preoperacional / posoperacional / WhatsApp).
 * Comandos numéricos y texto equivalente.
 */

'use strict';

/**
 * Texto del menú raíz de CERO (mismo contenido que canales/whatsapp.js responderMenu).
 */
function textoMenuPrincipal() {
  return (
    '🚗 *SISTEMA CERO*\n' +
    '_cero papel, cero accidentes_\n\n' +
    'Selecciona una opción:\n\n' +
    '1️⃣ Preoperacional (inicio de jornada)\n' +
    '2️⃣ Posoperacional (cierre de jornada)\n' +
    '3️⃣ Combustible / tanqueo\n\n' +
    'Escribe el número:'
  );
}

/** Pie estándar: atrás y menú */
var PIE_NAV = '\n\n0️⃣ _Atrás_  •  9️⃣ _Menú principal_';

/** Solo menú principal */
var PIE_MENU = '\n\n9️⃣ _Menú principal_';

/** Tecla de atrás — ÚNICA fuente de verdad */
var TECLA_ATRAS = '0';

/** Tecla de menú — ÚNICA fuente de verdad */
var TECLA_MENU = '9';

/** Mensaje genérico de error con recuperación */
var MSG_ERROR_GENERICO = '❌ Ocurrió un error inesperado.\n\nEscribe *9* para volver al menú principal.';

/**
 * Detecta si el mensaje es un comando de navegación global (incluye atrás y menú).
 */
function esComandoNavegacion(mensaje) {
  var upper = String(mensaje || '').trim().toUpperCase();
  return (
    upper === '0' ||
    upper === '9' ||
    upper === 'ATRAS' ||
    upper === 'CANCELAR' ||
    upper === 'MENU' ||
    upper === 'INICIO' ||
    upper === 'REINICIAR'
  );
}

/**
 * Atrás: 0 o texto ATRAS.
 */
function esAtras(mensaje) {
  var upper = String(mensaje || '').trim().toUpperCase();
  return upper === '0' || upper === 'ATRAS';
}

/**
 * Menú / salir: 9, CANCELAR, MENU, INICIO, REINICIAR.
 */
function esMenu(mensaje) {
  var upper = String(mensaje || '').trim().toUpperCase();
  return (
    upper === '9' ||
    upper === 'CANCELAR' ||
    upper === 'MENU' ||
    upper === 'INICIO' ||
    upper === 'REINICIAR'
  );
}

/**
 * Compara el valor normalizado con una lista de opciones permitidas (1, 1️⃣, etc.).
 */
function esOpcion(valor, opciones) {
  return opciones.indexOf(String(valor || '').trim().toLowerCase()) >= 0;
}

/**
 * Descripción corta del tipo de flujo (para mensajes al usuario).
 */
function descripcionFlujo(sesion) {
  if (!sesion) return '';
  switch (sesion.tipo) {
    case 'preoperacional': return 'preoperacional';
    case 'posoperacional': return 'posoperacional';
    case 'tanqueo':        return 'tanqueo';
    default: return '';
  }
}

/**
 * Mensaje que se muestra cuando el canal detecta una sesión EXPIRADA_RECUPERABLE.
 * El usuario puede elegir continuar (1), reiniciar (2) o ir al menú (9).
 */
function textoSesionExpirada(sesion) {
  var nombre = descripcionFlujo(sesion);
  var encabezado = '⏸️ Tu sesión' + (nombre ? ' de ' + nombre : '') + ' quedó pausada por inactividad.';
  return (
    encabezado + '\n\n' +
    'Tienes unos minutos para decidir:\n\n' +
    '*1* Continuar donde quedaste\n' +
    '*2* Empezar de nuevo\n' +
    '*9* Ir al menú principal'
  );
}

/**
 * Mensaje que confirma al usuario que la sesión fue reanudada tras elegir "continuar".
 */
function textoSesionReanudada(sesion) {
  var nombre = descripcionFlujo(sesion);
  return (
    '✅ Sesión' + (nombre ? ' de ' + nombre : '') + ' reanudada.\n\n' +
    'Envía tu próxima respuesta para continuar donde quedaste.'
  );
}

module.exports = {
  textoMenuPrincipal,
  textoSesionExpirada,
  textoSesionReanudada,
  descripcionFlujo,
  PIE_NAV,
  PIE_MENU,
  TECLA_ATRAS,
  TECLA_MENU,
  MSG_ERROR_GENERICO,
  esComandoNavegacion,
  esAtras,
  esMenu,
  esOpcion
};
