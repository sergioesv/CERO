/**
 * cierre.js — Guardado en BD, validación cruzada y cálculo de rendimiento
 * Módulo: Tanqueo con OCR y validación cruzada v2
 * CERO — Gestión de Operaciones de Campo
 */

'use strict';

var tanqueosData = require('../../../data/tanqueos');
var validaciones = require('./validaciones');

var TOLERANCIA_KM = 50;

var TOLERANCIA_CANTIDAD = 0.5;

function ejecutarValidacionCruzada(sesion) {
  var discrepancias = [];
  var coincidencias = 0;

  var placaRecibo = (sesion.placaOcrFactura || '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
  var placaFoto = (sesion.placaOcrFoto || sesion.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
  if (placaRecibo && placaFoto) {
    if (placaRecibo === placaFoto) {
      coincidencias++;
    } else {
      discrepancias.push({
        campo: 'placa',
        valor_conductor: placaFoto,
        valor_ocr: placaRecibo
      });
    }
  } else {
    console.log('[Cierre] Campo placa no verificable — OCR no leyó uno de los dos.');
  }

  var kmRecibo = sesion.kmOcrFactura ? parseInt(String(sesion.kmOcrFactura).replace(/\D/g, ''), 10) : null;
  var kmOdometroRaw = sesion.kmOcrOdometro != null ? sesion.kmOcrOdometro : sesion.kilometraje;
  var kmOdometro = typeof kmOdometroRaw === 'number' && !isNaN(kmOdometroRaw) ? kmOdometroRaw : null;

  if (kmRecibo != null && !isNaN(kmRecibo) && kmOdometro != null) {
    if (Math.abs(kmRecibo - kmOdometro) <= TOLERANCIA_KM) {
      coincidencias++;
    } else {
      discrepancias.push({
        campo: 'kilometraje',
        valor_conductor: kmOdometro,
        valor_ocr: kmRecibo
      });
    }
  } else {
    console.log('[Cierre] Campo km no verificable — OCR no leyó uno de los dos.');
  }

  var cantidadOcr = sesion.cantidadOcr != null ? parseFloat(String(sesion.cantidadOcr)) : null;
  var cantidadManual = sesion.cantidadManual != null ? parseFloat(String(sesion.cantidadManual)) : null;
  if (cantidadOcr !== null && !isNaN(cantidadOcr) && cantidadManual !== null && !isNaN(cantidadManual)) {
    if (Math.abs(cantidadOcr - cantidadManual) <= TOLERANCIA_CANTIDAD) {
      coincidencias++;
    } else {
      discrepancias.push({
        campo: 'cantidad',
        valor_conductor: cantidadManual,
        valor_ocr: cantidadOcr
      });
    }
  } else {
    console.log('[Cierre] Campo cantidad no verificable — OCR no leyó uno de los dos.');
  }

  var facturaOcr = (sesion.facturaNumeroOcr || '').trim();
  var facturaManual = (sesion.facturaNumeroManual || '').trim();
  if (facturaOcr && facturaManual) {
    if (facturaOcr === facturaManual) {
      coincidencias++;
    } else {
      discrepancias.push({
        campo: 'factura_numero',
        valor_conductor: facturaManual,
        valor_ocr: facturaOcr
      });
    }
  } else {
    console.log('[Cierre] Campo factura no verificable — OCR no leyó uno de los dos.');
  }

  var estadoValidacion;
  if (discrepancias.length === 0 && coincidencias === 4) {
    estadoValidacion = 'auto_validado';
  } else {
    estadoValidacion = 'pendiente_revision';
  }

  console.log('[Cierre] Validación cruzada: ' + coincidencias + '/4 coinciden. Estado: ' + estadoValidacion);

  return {
    estadoValidacion: estadoValidacion,
    discrepancias: discrepancias,
    coincidencias: coincidencias
  };
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

  var rendimiento = parseFloat((kmRecorridos / cantidadNum).toFixed(2));
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
      var historial = await tanqueosData.obtenerRendimientoHistorico(sesion.placa);
      if (historial && historial.promedio && historial.promedio > 0) {
        var limiteMin = historial.promedio * 0.70;
        var limiteMax = historial.promedio * 1.30;
        if (rendimiento < limiteMin || rendimiento > limiteMax) {
          resultado.rendimientoAlerta = true;
          console.log('[Cierre] Alerta de rendimiento histórico: ' + rendimiento + ' vs promedio ' + historial.promedio);
        }
      }
    } catch (e) {
      console.log('[Cierre] Sin historial de rendimiento para ' + sesion.placa + ' — sin alerta.');
    }
  }

  return resultado;
}

async function guardarTanqueo(sesion, telefono) {
  var validacion = ejecutarValidacionCruzada(sesion);

  var rendimiento = await calcularRendimiento(sesion);

  // Emergencia siempre pendiente_revision, sin importar validación cruzada
  var estadoValidacionFinal;
  if (sesion.tipoTanqueo === 'emergencia') {
    estadoValidacionFinal = 'pendiente_revision';
    console.log('[Cierre] Tipo emergencia — forzando pendiente_revision.');
  } else if (rendimiento.rendimientoAlerta) {
    estadoValidacionFinal = 'pendiente_revision';
  } else {
    estadoValidacionFinal = validacion.estadoValidacion;
  }

  if (rendimiento.rendimientoAlerta && validacion.estadoValidacion === 'auto_validado' && sesion.tipoTanqueo !== 'emergencia') {
    console.log('[Cierre] Validación cruzada OK pero rendimiento anómalo — forzando pendiente_revision.');
  }

  var cantidadFinal = sesion.cantidadManual != null ? sesion.cantidadManual : (sesion.cantidadOcr != null ? sesion.cantidadOcr : 0);

  var precioUnitario = null;
  if (cantidadFinal && sesion.valorTotal) {
    precioUnitario = parseFloat((sesion.valorTotal / cantidadFinal).toFixed(2));
  }

  var facturaNumeroFinal = sesion.facturaNumeroManual || sesion.facturaNumeroOcr || null;

  var datosTanqueo = {
    vehiculo_placa: sesion.placa,
    conductor_id: sesion.conductor ? sesion.conductor.id : null,
    telefono_reporta: validaciones.normalizarTelefono(telefono),
    tipo_tanqueo: sesion.tipoTanqueo || 'convenio',
    tipo_combustible: sesion.tipoCombustible,
    cantidad: cantidadFinal,
    unidad_medida: sesion.unidadMedida || 'litros',
    valor_total: sesion.valorTotal || null,
    precio_unitario: precioUnitario,
    tanque_lleno: false,
    estacion_servicio: sesion.estacionServicio || null,
    ciudad: null,
    kilometraje: sesion.kilometraje,
    km_referencia: sesion.kmReferencia != null ? sesion.kmReferencia : null,
    diferencia_km: sesion.diferenciaKm != null ? sesion.diferenciaKm : null,
    inconsistencia_km: !!sesion.inconsistenciaKm,
    alertas: sesion.alertasKm || [],
    observaciones: null,
    pdf_url: null,

    factura_numero: facturaNumeroFinal,
    factura_numero_manual: sesion.facturaNumeroManual || null,
    factura_numero_ocr: sesion.facturaNumeroOcr || null,
    placa_ocr_factura: sesion.placaOcrFactura || null,
    placa_ocr_foto: sesion.placaOcrFoto || null,
    km_ocr_factura: sesion.kmOcrFactura ? parseInt(String(sesion.kmOcrFactura).replace(/\D/g, ''), 10) : null,
    km_ocr_odometro: sesion.kmOcrOdometro != null ? sesion.kmOcrOdometro : (sesion.kilometraje != null ? sesion.kilometraje : null),
    cantidad_manual: sesion.cantidadManual != null ? sesion.cantidadManual : null,
    cantidad_ocr: sesion.cantidadOcr != null ? sesion.cantidadOcr : null,
    datos_ocr_factura: sesion.datosOcrFactura || null,
    estado_validacion: estadoValidacionFinal,
    discrepancias: validacion.discrepancias,
    rendimiento_calculado: rendimiento.rendimientoCalculado,
    rendimiento_alerta: rendimiento.rendimientoAlerta,
    es_primer_tanqueo: rendimiento.esPrimerTanqueo === true ? true : false
  };

  if (datosTanqueo.km_ocr_factura != null && isNaN(datosTanqueo.km_ocr_factura)) {
    datosTanqueo.km_ocr_factura = null;
  }

  var resTanqueo = await tanqueosData.crearTanqueo(datosTanqueo);
  if (resTanqueo.error) {
    console.error('[Cierre] Error guardando tanqueo:', resTanqueo.error);
    return { error: resTanqueo.error, tanqueo: null, estadoValidacion: estadoValidacionFinal };
  }

  var fotos = (sesion.fotos || []).filter(function(f) {
    return f.tipo === 'factura' || f.tipo === 'placa' || f.tipo === 'odometro';
  });

  if (fotos.length > 0) {
    var resFotos = await tanqueosData.guardarFotosTanqueo(resTanqueo.data.id, fotos);
    if (resFotos && resFotos.error) {
      console.error('[Cierre] Error guardando fotos:', resFotos.error.message || resFotos.error);
    }
  }

  var resVehiculo = await tanqueosData.actualizarKilometrajeVehiculo(sesion.placa, sesion.kilometraje);
  if (resVehiculo && resVehiculo.error) {
    console.error('[Cierre] Error actualizando km del vehículo:', resVehiculo.error.message || resVehiculo.error);
  }

  return {
    error: null,
    tanqueo: resTanqueo.data,
    estadoValidacion: estadoValidacionFinal
  };
}

module.exports = {
  guardarTanqueo: guardarTanqueo,
  ejecutarValidacionCruzada: ejecutarValidacionCruzada,
  calcularRendimiento: calcularRendimiento
};
