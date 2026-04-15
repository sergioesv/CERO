/**
 * estado.js — Constantes de estados de la máquina de tanqueo v3
 * Flujo: foto placa → odómetro → foto factura (OCR) → confirmación/fallback
 * CERO — Gestión de Operaciones de Campo
 */

'use strict';

var ESTADOS = {
  // Inicio
  INICIO:                       'TANQUEO_INICIO',

  // Identificación del vehículo (foto placa)
  ESPERANDO_FOTO_PLACA:         'TANQUEO_ESPERANDO_FOTO_PLACA',
  PLACA_CONFIRMACION_SUGERIDA:  'TANQUEO_PLACA_CONFIRMACION_SUGERIDA',
  PLACA_FALLBACK:               'TANQUEO_PLACA_FALLBACK',
  PLACA_MANUAL:                 'TANQUEO_PLACA_MANUAL',

  // Kilometraje (foto odómetro)
  ESPERANDO_FOTO_ODOMETRO:      'TANQUEO_ESPERANDO_FOTO_ODOMETRO',
  CONFIRMACION_KM:              'TANQUEO_CONFIRMACION_KM',
  KM_MANUAL:                    'TANQUEO_KM_MANUAL',

  // Factura / recibo (foto + OCR)
  ESPERANDO_FOTO_FACTURA:       'TANQUEO_ESPERANDO_FOTO_FACTURA',
  PROCESANDO_OCR:               'TANQUEO_PROCESANDO_OCR',
  CONFIRMACION_RESUMEN:         'TANQUEO_CONFIRMACION_RESUMEN',
  CORREGIR_CAMPO:               'TANQUEO_CORREGIR_CAMPO',
  FALLBACK_FACTURA:             'TANQUEO_FALLBACK_FACTURA',
  FACTURA_MANUAL:               'TANQUEO_FACTURA_MANUAL',
  CANTIDAD_MANUAL:              'TANQUEO_CANTIDAD_MANUAL',
  ESPERANDO_FOTO_TABLERO:       'TANQUEO_ESPERANDO_FOTO_TABLERO'
};

module.exports = { ESTADOS: ESTADOS };
