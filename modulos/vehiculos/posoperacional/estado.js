/**
 * Sesión y datos operativos del posoperacional (WhatsApp).
 * Estados con prefijo POSOP_ — única fuente de verdad para flujo.js.
 */

'use strict';

var storage = require('../../../servicios/storage');

/** Estados del flujo posoperacional (texto en sesión). */
var ESTADOS = {
  INICIO:                   'POSOP_INICIO',
  ESPERANDO_PLACA:          'POSOP_ESPERANDO_PLACA',
  ESPERANDO_FOTO_ODOMETRO:  'POSOP_ESPERANDO_FOTO_ODOMETRO',
  ODOMETRO_CONFIRMACION:    'POSOP_ODOMETRO_CONFIRMACION',
  ODOMETRO_MANUAL:          'POSOP_ODOMETRO_MANUAL',
  FOTO_ESTADO_GENERAL:      'POSOP_FOTO_ESTADO_GENERAL',
  NOVEDADES:                'POSOP_NOVEDADES',
  DESCRIBIR_NOVEDADES:      'POSOP_DESCRIBIR_NOVEDADES',
  FOTO_NOVEDAD:             'POSOP_FOTO_NOVEDAD',
  GRAVEDAD_NOVEDAD:         'POSOP_GRAVEDAD_NOVEDAD',
  OBSERVACION:              'POSOP_OBSERVACION',
  OBSERVACION_TEXTO:        'POSOP_OBSERVACION_TEXTO',
  FOTO_ADICIONAL:           'POSOP_FOTO_ADICIONAL',
  CONFIRMACION:             'POSOP_CONFIRMACION'
};

/**
 * Reinicia datos de un nuevo cierre (conserva tipo posoperacional si aplica).
 */
function reiniciarDatosOperativos(sesion) {
  sesion.placa = null;
  sesion.vehiculo = null;
  sesion.conductor = null;
  sesion.kilometrajeFinal = null;
  sesion.kmDetectado = null;
  sesion.kmReferencia = null;
  sesion.kmReferenciaMeta = null;
  sesion.diferenciaKm = null;
  sesion.alertasKm = [];
  sesion.inconsistenciaKm = false;
  sesion.origenKilometraje = null;
  sesion.origenKilometrajePendiente = null;
  sesion.kilometrajeConfirmado = false;
  sesion.fotoOdometroTemporal = null;
  sesion.novedades = [];
  sesion.novedadesTexto = null;
  sesion.novedadTexto = null;
  sesion.novedadSeveridad = null;
  sesion.observacion = null;
  sesion.fotos = [];
}

/**
 * Vuelve al paso de foto de odómetro (sin kilometraje confirmado).
 */
function volverAKilometraje(sesion) {
  sesion.kilometrajeFinal = null;
  sesion.kmDetectado = null;
  sesion.fotoOdometroTemporal = null;
  sesion.alertasKm = [];
  sesion.inconsistenciaKm = false;
  sesion.diferenciaKm = null;
  sesion.origenKilometraje = null;
  sesion.origenKilometrajePendiente = null;
  sesion.kilometrajeConfirmado = false;
  storage.limpiarFotosPorTipo(sesion, ['odometro']);
  sesion.estado = ESTADOS.ESPERANDO_FOTO_ODOMETRO;
}

/**
 * Registra foto de odómetro y km final confirmado.
 */
function registrarFotoOdometro(sesion, url, kilometraje, origen) {
  sesion.kilometrajeFinal = kilometraje;
  sesion.kilometrajeConfirmado = true;
  sesion.origenKilometraje = origen || 'ocr';
  storage.guardarFotoUnica(sesion, {
    tipo: 'odometro',
    url: url,
    descripcion: 'Foto de odometro posoperacional',
    novedadId: null
  });
}

module.exports = {
  ESTADOS,
  reiniciarDatosOperativos,
  volverAKilometraje,
  registrarFotoOdometro
};
