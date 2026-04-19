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

module.exports = {
  textoMenuPrincipal,
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
