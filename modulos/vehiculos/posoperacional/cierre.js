var posoperacionalesData = require('../../../data/posoperacionales');
var pdfPosoperacional = require('../../../servicios/pdf/posoperacional');
var alertasNotificador = require('../../alertas/notificador');

function ahoraCO() {
  var utc = new Date();
  return new Date(utc.getTime() - (5 * 60 * 60 * 1000));
}

function definirEstadoGeneral(sesion) {
  var tieneCriticas = (sesion.novedades || []).some(function(novedad) {
    return !!(novedad && novedad.critico);
  });

  if (sesion.inconsistenciaKm || tieneCriticas) return 'REQUIERE_ATENCION';
  if (sesion.novedades && sesion.novedades.length) return 'CON_NOVEDADES';
  return 'OK';
}

function construirDatosPosoperacional(sesion, ahora) {
  var conductorId = sesion.conductor && sesion.conductor.id ? sesion.conductor.id : null;
  var sedeId =
    sesion.vehiculo && sesion.vehiculo.sede_id != null ? sesion.vehiculo.sede_id : null;

  return {
    vehiculo_placa: sesion.placa,
    conductor_id: conductorId,
    kilometraje_final: sesion.kilometrajeFinal,
    km_referencia: sesion.kmReferencia,
    diferencia_km: sesion.diferenciaKm,
    inconsistencia_km: !!sesion.inconsistenciaKm,
    kilometraje_confirmado: !!sesion.kilometrajeConfirmado,
    alertas_km: sesion.alertasKm || [],
    origen_kilometraje: sesion.origenKilometraje || null,
    horas_trabajadas: null,
    estado_general: definirEstadoGeneral(sesion),
    novedades: sesion.novedades || [],
    observaciones: sesion.observacion || null,
    firmado: true,
    firmado_timestamp: ahora.toISOString(),
    sede_id: sedeId
  };
}

function construirDatosSesionPdf(sesion, telefono, ahora) {
  return {
    placa: sesion.placa,
    vehiculo: sesion.vehiculo || null,
    conductorNombre: sesion.conductor ? sesion.conductor.nombre : null,
    conductorTelefono: String(telefono || '').replace('whatsapp:', ''),
    conductorCedula: sesion.conductor ? (sesion.conductor.cedula || null) : null,
    conductorLicenciaVencimiento: sesion.conductor ? (sesion.conductor.licencia_vencimiento || null) : null,
    kilometrajeFinal: sesion.kilometrajeFinal,
    kmReferencia: sesion.kmReferencia,
    kmReferenciaOrigen: sesion.kmReferenciaMeta ? sesion.kmReferenciaMeta.origen : null,
    diferenciaKm: sesion.diferenciaKm,
    alertasKm: sesion.alertasKm || [],
    novedades: sesion.novedades || [],
    observacion: sesion.observacion || null,
    novedadTexto: sesion.novedadTexto || null,
    novedadSeveridad: sesion.novedadSeveridad || null,
    fotos: sesion.fotos || [],
    firmado: true,
    fecha: ahora.toISOString(),
    fechaTexto: ahora.toLocaleString('es-CO')
  };
}

async function guardarPosoperacionalCompleto(sesion, telefono) {
  var ahora = ahoraCO();
  var datosGuardar = construirDatosPosoperacional(sesion, ahora);
  var creado = await posoperacionalesData.crearPosoperacional(datosGuardar);

  if (creado.error || !creado.data) {
    return { error: creado.error || new Error('No se pudo crear el posoperacional') };
  }

  var posoperacional = creado.data;

  // Si hay novedad crítica, notificar al supervisor igual que en el preoperacional
  var novedadesCriticas = (sesion.novedades || []).filter(function(n) { return n.critico; });
  if (novedadesCriticas.length > 0) {
    alertasNotificador.notificarCriticas(sesion.placa, novedadesCriticas);
  }

  if (sesion.fotos && sesion.fotos.length) {
    var resFotos = await posoperacionalesData.guardarFotosPosoperacional(posoperacional.id, sesion.fotos);
    if (resFotos.error) {
      console.error('Error guardando fotos del posoperacional:', resFotos.error.message || resFotos.error);
    }
  }

  var datosPdf = construirDatosSesionPdf(sesion, telefono, ahora);
  var pdfUrl = await pdfPosoperacional.subirYEnviarPDFPosoperacional(datosPdf, posoperacional.id, telefono);

  return {
    error: null,
    ahora: ahora,
    datosSesion: datosPdf,
    posoperacional: posoperacional,
    pdfUrl: pdfUrl
  };
}

module.exports = {
  construirDatosPosoperacional,
  construirDatosSesionPdf,
  guardarPosoperacionalCompleto
};
