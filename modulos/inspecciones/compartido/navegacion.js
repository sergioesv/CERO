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
 * Mapa plano estado → etiqueta humana para el usuario.
 * Los estados del posop y tanqueo tienen prefijo (POSOP_/TANQUEO_) por lo que
 * no colisionan con los del preop (sin prefijo). Mantener sincronizado con
 * ESTADOS en cada modulos/**\/estado.js.
 */
var LABEL_PASO = {
  ESPERANDO_FOTO_FRONTAL:              'Foto de la placa',
  PLACA_CONFIRMACION_SUGERIDA:         'Confirmación de placa',
  PLACA_FALLBACK:                      'Reintento de placa',
  PLACA_MANUAL:                        'Placa manual',
  ESPERANDO_FOTO_ODOMETRO:             'Foto del odómetro',
  CONFIRMACION_KM:                     'Confirmación de kilometraje',
  KM_MANUAL:                           'Kilometraje manual',
  GRUPO:                               'Inspección del vehículo',
  DESCRIBIR_NOVEDAD:                   'Describir novedad',
  SUB_PREGUNTA:                        'Pregunta de severidad',
  FOTO_NOVEDAD:                        'Foto de la novedad',
  FOTO_ADICIONAL:                      'Foto adicional',
  OBSERVACION:                         'Observaciones',
  OBSERVACION_TEXTO:                   'Observación escrita',
  CONFIRMACION:                        'Confirmación final',

  POSOP_ESPERANDO_PLACA:               'Foto de la placa',
  POSOP_PLACA_CONFIRMACION_SUGERIDA:   'Confirmación de placa',
  POSOP_PLACA_FALLBACK:                'Reintento de placa',
  POSOP_PLACA_MANUAL:                  'Placa manual',
  POSOP_ESPERANDO_FOTO_ODOMETRO:       'Foto del odómetro',
  POSOP_ODOMETRO_CONFIRMACION:         'Confirmación de kilometraje',
  POSOP_ODOMETRO_MANUAL:               'Kilometraje manual',
  POSOP_ESPERANDO_FOTO_HOROMETRO:      'Foto del horómetro',
  POSOP_HOROMETRO_CONFIRMACION:        'Confirmación de horómetro',
  POSOP_HOROMETRO_MANUAL:              'Horómetro manual',
  POSOP_FOTO_ESTADO_GENERAL:           'Foto del estado general',
  POSOP_NOVEDADES:                     '¿Hay novedades?',
  POSOP_DESCRIBIR_NOVEDADES:           'Descripción de novedades',
  POSOP_FOTO_NOVEDAD:                  'Foto de la novedad',
  POSOP_GRAVEDAD_NOVEDAD:              'Gravedad de la novedad',
  POSOP_OBSERVACION:                   'Observaciones',
  POSOP_OBSERVACION_TEXTO:             'Observación escrita',
  POSOP_CONFIRMACION:                  'Confirmación final',

  TANQUEO_ESPERANDO_FOTO_PLACA:        'Foto de la placa',
  TANQUEO_PLACA_CONFIRMACION_SUGERIDA: 'Confirmación de placa',
  TANQUEO_PLACA_FALLBACK:              'Reintento de placa',
  TANQUEO_PLACA_MANUAL:                'Placa manual',
  TANQUEO_ESPERANDO_FOTO_ODOMETRO:     'Foto del odómetro',
  TANQUEO_CONFIRMACION_KM:             'Confirmación de kilometraje',
  TANQUEO_KM_MANUAL:                   'Kilometraje manual',
  TANQUEO_ESPERANDO_FOTO_HOROMETRO:    'Foto del horómetro',
  TANQUEO_HOROMETRO_CONFIRMACION:      'Confirmación de horómetro',
  TANQUEO_HOROMETRO_MANUAL:            'Horómetro manual',
  TANQUEO_ESPERANDO_FOTO_FACTURA:      'Foto de la factura',
  TANQUEO_PROCESANDO_OCR:              'Procesando factura',
  TANQUEO_CONFIRMACION_RESUMEN:        'Confirmación del resumen',
  TANQUEO_CORREGIR_CAMPO:              'Corrección de campo',
  TANQUEO_FALLBACK_FACTURA:            'Reintento de factura',
  TANQUEO_FACTURA_MANUAL:              'Factura manual',
  TANQUEO_CANTIDAD_MANUAL:             'Cantidad manual',
  TANQUEO_ESPERANDO_FOTO_TABLERO:      'Foto del tablero'
};

/**
 * Traduce sesion.estado a una etiqueta humana para mostrar al usuario.
 * Si el estado no está mapeado, devuelve el propio estado como fallback.
 */
function describirPasoActual(sesion) {
  if (!sesion || !sesion.estado) return '';
  return LABEL_PASO[sesion.estado] || sesion.estado;
}

/**
 * Incluye la placa del vehículo si está disponible, precedida de un espacio.
 */
function referenciaVehiculo(sesion) {
  if (!sesion || !sesion.vehiculo) return '';
  var placa = sesion.vehiculo.placa || sesion.placa;
  return placa ? ' ' + placa : '';
}

/**
 * Mensaje que se muestra cuando el canal detecta una sesión EXPIRADA_RECUPERABLE.
 * El usuario puede elegir continuar (1), reiniciar (2) o ir al menú (9).
 */
function textoSesionExpirada(sesion) {
  var nombre = descripcionFlujo(sesion);
  var referencia = referenciaVehiculo(sesion);
  var paso = describirPasoActual(sesion);
  var encabezado = '⏸️ Tu sesión' + (nombre ? ' de ' + nombre : '') + referencia + ' quedó pausada por inactividad.';
  var detallePaso = paso ? '\n*Paso actual:* ' + paso : '';
  return (
    encabezado + detallePaso + '\n\n' +
    'Tienes unos minutos para decidir:\n\n' +
    '*1* Continuar donde quedaste\n' +
    '*2* Empezar de nuevo\n' +
    '*9* Ir al menú principal'
  );
}

/**
 * Mensaje que confirma al usuario que la sesión fue reanudada tras elegir "continuar".
 * Indica el paso donde estaba para que el usuario sepa qué se espera a continuación.
 */
function textoSesionReanudada(sesion) {
  var nombre = descripcionFlujo(sesion);
  var referencia = referenciaVehiculo(sesion);
  var paso = describirPasoActual(sesion);
  return (
    '✅ Sesión' + (nombre ? ' de ' + nombre : '') + referencia + ' reanudada.' +
    (paso ? '\n*Continúa en:* ' + paso : '') + '\n\n' +
    'Envía tu próxima respuesta para avanzar.'
  );
}

module.exports = {
  textoMenuPrincipal,
  textoSesionExpirada,
  textoSesionReanudada,
  descripcionFlujo,
  describirPasoActual,
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
