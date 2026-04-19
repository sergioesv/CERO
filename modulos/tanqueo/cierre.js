/**
 * cierre.js — Guardado en BD, estado de validación v3 (tier OCR) y rendimiento
 * Módulo: Tanqueo con OCR — CERO — Gestión de Operaciones de Campo
 */

'use strict';

var tanqueosData = require('../../data/tanqueos');
var validaciones = require('./validaciones');

/**
 * Determina el estado de validación del tanqueo según el tier OCR
 * y si el conductor corrigió algún dato.
 *
 * Reglas (v24 sección 4.4 y 8.1):
 *   Tier 1 + sin corrección → 'auto_validado'
 *   Tier 1 + corrección     → 'pendiente_revision'
 *   Tier 2                  → 'pendiente_revision'
 *   Tier 3 (manual)         → 'pendiente_revision'
 *   Foto tablero            → 'pendiente_revision' + flag especial en BD
 *
 * @param {Object} sesion
 * @returns {string} — 'auto_validado' o 'pendiente_revision'
 */
function calcularEstadoValidacion(sesion) {
  if (sesion.flagSinFactura) return 'pendiente_revision';
  if (sesion.tierOcr === 1 && !sesion.conductorCorrigioDato) return 'auto_validado';
  return 'pendiente_revision';
}

async function calcularRendimiento(sesion) {
  var resultado = {
    rendimientoCalculado: null,
    rendimientoAlerta: false,
    esPrimerTanqueo: false
  };

  // Si no hay km de referencia (primer tanqueo del vehículo), no calcular rendimiento
  if (sesion.kmReferencia == null || sesion.kmReferencia === 0) {
    return { rendimientoCalculado: null, rendimientoAlerta: false, esPrimerTanqueo: true };
  }

  var kmActual = sesion.kilometraje;
  var kmAnterior = sesion.kmReferencia;
  var cantidad = sesion.cantidadManual != null ? sesion.cantidadManual : sesion.cantidadOcr;

  if (kmActual == null || !cantidad || cantidad <= 0) {
    console.log('[Cierre] Rendimiento no calculable — faltan datos.');
    return resultado;
  }

  var kmRecorridos = kmActual - kmAnterior;
  if (kmRecorridos <= 0) {
    console.log('[Cierre] Rendimiento no calculable — km recorridos <= 0.');
    return resultado;
  }

  var cantidadNum = parseFloat(String(cantidad));
  if (isNaN(cantidadNum) || cantidadNum <= 0) {
    return resultado;
  }

  // Normalizar cantidad a litros para comparación consistente
  var cantidadEnLitros = cantidadNum;
  var unidad = String(sesion.unidadMedida || 'litros').toLowerCase();
  if (/gal/.test(unidad)) {
    cantidadEnLitros = parseFloat((cantidadNum * 3.785).toFixed(3));
  }

  var rendimiento = parseFloat((kmRecorridos / cantidadEnLitros).toFixed(2));
  resultado.rendimientoCalculado = rendimiento;

  var vehiculo = sesion.vehiculo || {};
  var rendimientoMin = vehiculo.rendimiento_min;
  var rendimientoMax = vehiculo.rendimiento_max;

  if (rendimientoMin != null && rendimientoMax != null) {
    var minN = Number(rendimientoMin);
    var maxN = Number(rendimientoMax);
    if (!isNaN(minN) && !isNaN(maxN)) {
      if (rendimiento < minN || rendimiento > maxN) {
        resultado.rendimientoAlerta = true;
        console.log('[Cierre] Alerta de rendimiento: ' + rendimiento + ' km/L (rango: ' + minN + '-' + maxN + ')');
      }
    }
  } else {
    try {
      var historial = await tanqueosData.obtenerRendimientoHistorico(sesion.vehiculo ? sesion.vehiculo.id : null);
      if (historial && historial.promedio && historial.promedio > 0) {
        var limiteMin = historial.promedio * 0.70;
        var limiteMax = historial.promedio * 1.30;
        if (rendimiento < limiteMin || rendimiento > limiteMax) {
          resultado.rendimientoAlerta = true;
          console.log('[Cierre] Alerta de rendimiento histórico: ' + rendimiento + ' vs promedio ' + historial.promedio);
        }
      }
    } catch {
      console.log('[Cierre] Sin historial de rendimiento para ' + sesion.placa + ' — sin alerta.');
    }
  }

  return resultado;
}

async function guardarTanqueo(sesion, telefono) {
  var estadoValidacion = calcularEstadoValidacion(sesion);
  var rendimiento      = await calcularRendimiento(sesion);

  // Inferir tipo de tanqueo desde el campo 'medio' del OCR (v24 decisión 4)
  var tipoTanqueoInferido = 'emergencia'; // valor por defecto
  var datosOcr = sesion.datosOcrFactura || {};
  if (datosOcr.medio && datosOcr.medio.leido) {
    var medioValor = String(datosOcr.medio.valor || '').toUpperCase().trim();
    if (medioValor === 'IBUTTON' || medioValor.indexOf('IBUTTON') >= 0) {
      tipoTanqueoInferido = 'convenio';
    }
  }
  // Si la entrada fue manual (tier 3 sin foto tablero) → emergencia siempre
  if (sesion.tierOcr === 3 && !sesion.flagSinFactura) {
    tipoTanqueoInferido = 'emergencia';
  }
  console.log('[Cierre] Tipo tanqueo inferido: ' + tipoTanqueoInferido);

  var estadoValidacionFinal = estadoValidacion;

  // Rendimiento anómalo siempre fuerza revisión
  if (rendimiento.rendimientoAlerta) {
    estadoValidacionFinal = 'pendiente_revision';
    console.log('[Cierre] Alerta rendimiento — forzando pendiente_revision.');
  }

  // Emergencia siempre requiere revisión
  if (tipoTanqueoInferido === 'emergencia') {
    estadoValidacionFinal = 'pendiente_revision';
  }

  var cantidadFinal = sesion.cantidadManual != null
    ? sesion.cantidadManual
    : (sesion.cantidadOcr != null ? sesion.cantidadOcr : 0);

  var precioUnitario = null;
  if (cantidadFinal && sesion.valorTotal) {
    precioUnitario = parseFloat((sesion.valorTotal / cantidadFinal).toFixed(2));
  }

  var facturaNumeroFinal = sesion.facturaNumeroManual || sesion.facturaNumeroOcr || null;

  var datosTanqueo = {
    // Campos base
    activo_id:         sesion.vehiculo ? sesion.vehiculo.id : null,
    plantilla_id:      sesion.plantilla ? sesion.plantilla.id : null,
    conductor_id:      sesion.conductor ? sesion.conductor.id : null,
    telefono_reporta:  validaciones.normalizarTelefono(telefono),
    tipo_tanqueo:      tipoTanqueoInferido,
    tipo_combustible:  sesion.tipoCombustible || null,
    cantidad:          cantidadFinal,
    unidad_medida:     sesion.unidadMedida || 'litros',
    valor_total:       sesion.valorTotal || null,
    precio_unitario:   precioUnitario,
    tanque_lleno:      false,
    estacion_servicio: sesion.estacionServicio || null,
    ciudad:            null,
    kilometraje:       sesion.kilometraje,
    horometro:         sesion.horometro || null,
    km_referencia:     sesion.kmReferencia   != null ? sesion.kmReferencia   : null,
    diferencia_km:     sesion.diferenciaKm   != null ? sesion.diferenciaKm   : null,
    inconsistencia_km: !!sesion.inconsistenciaKm,
    alertas:           sesion.alertasKm || [],
    observaciones:     null,
    pdf_url:           null,

    // Campos OCR factura
    factura_numero:        facturaNumeroFinal,
    factura_numero_ocr:    sesion.facturaNumeroOcr   || null,
    factura_numero_manual: sesion.facturaNumeroManual || null,
    placa_ocr_factura:     sesion.placaOcrFactura     || null,
    placa_ocr_foto:        sesion.placaOcrFoto        || null,
    km_ocr_factura:        sesion.kmOcrFactura
      ? parseInt(String(sesion.kmOcrFactura).replace(/\D/g, ''), 10)
      : null,
    km_ocr_odometro:       sesion.kmOcrOdometro != null
      ? sesion.kmOcrOdometro
      : (sesion.kilometraje != null ? sesion.kilometraje : null),
    cantidad_ocr:          sesion.cantidadOcr    != null ? sesion.cantidadOcr    : null,
    cantidad_manual:       sesion.cantidadManual  != null ? sesion.cantidadManual  : null,
    datos_ocr_factura:     sesion.datosOcrFactura || null,

    // Nuevos campos v3
    score_ocr_global:      sesion.scoreOcrGlobal || 0,
    tier_ocr:              sesion.tierOcr         || 3,
    serial_ibutton:        (datosOcr.serial_ibutton  && datosOcr.serial_ibutton.leido)
      ? String(datosOcr.serial_ibutton.valor).trim() : null,
    autorizacion_terpel:   (datosOcr.autorizacion    && datosOcr.autorizacion.leido)
      ? String(datosOcr.autorizacion.valor).trim()   : null,
    nit_estacion:          (datosOcr.nit_estacion    && datosOcr.nit_estacion.leido)
      ? String(datosOcr.nit_estacion.valor).trim()   : null,
    flag_sin_factura:      !!sesion.flagSinFactura,
    tiene_factura_fisica:  !sesion.flagSinFactura,

    // Validación y rendimiento
    estado_validacion:      estadoValidacionFinal,
    discrepancias:          [],   // v3: no se calculan en runtime, se ven en drawer
    rendimiento_calculado:  rendimiento.rendimientoCalculado,
    rendimiento_alerta:     rendimiento.rendimientoAlerta,
    es_primer_tanqueo:      rendimiento.esPrimerTanqueo === true
  };

  // Sanear km_ocr_factura si quedó NaN
  if (datosTanqueo.km_ocr_factura != null && isNaN(datosTanqueo.km_ocr_factura)) {
    datosTanqueo.km_ocr_factura = null;
  }

  var resTanqueo = await tanqueosData.crearTanqueo(datosTanqueo);
  if (resTanqueo.error) {
    console.error('[Cierre] Error guardando tanqueo:', resTanqueo.error);
    return { error: resTanqueo.error, tanqueo: null, estadoValidacion: estadoValidacionFinal };
  }

  var fotos = (sesion.fotos || []).filter(function(f) {
    return f.tipo === 'factura' || f.tipo === 'odometro' || f.tipo === 'tablero';
  });

  if (fotos.length > 0) {
    var resFotos = await tanqueosData.guardarFotosTanqueo(resTanqueo.data.id, fotos);
    if (resFotos && resFotos.error) {
      console.error('[Cierre] Error guardando fotos:', resFotos.error.message || resFotos.error);
    }
  }

  var activoId = sesion.vehiculo ? sesion.vehiculo.id : null;
  if (activoId && sesion.kilometraje != null) {
    var resVehiculo = await tanqueosData.actualizarKilometrajeActivo(activoId, sesion.kilometraje);
    if (resVehiculo && resVehiculo.error) {
      console.error('[Cierre] Error actualizando km del activo:', resVehiculo.error.message || resVehiculo.error);
    }
  }

  return {
    error: null,
    tanqueo: resTanqueo.data,
    estadoValidacion: estadoValidacionFinal
  };
}

module.exports = {
  guardarTanqueo:           guardarTanqueo,
  calcularRendimiento:      calcularRendimiento,
  calcularEstadoValidacion: calcularEstadoValidacion
};
