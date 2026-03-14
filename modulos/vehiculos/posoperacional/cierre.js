var posoperacionalesData = require('../../../data/posoperacionales');
var alertasData = require('../../../data/alertas');
var pdfPosoperacional = require('../../../servicios/pdfPosoperacional');
var alertasReglas = require('../../alertas/reglas');
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

function construirDatosPosoperacional(sesion, telefono, ahora) {
  return {
    vehiculo_placa: sesion.placa,
    conductor_nombre: sesion.conductor ? sesion.conductor.nombre : null,
    conductor_telefono: String(telefono || '').replace('whatsapp:', ''),
    kilometraje_final: sesion.kilometrajeFinal,
    km_referencia: sesion.kmReferencia,
    diferencia_km: sesion.diferenciaKm,
    alertas_km: sesion.alertasKm || [],
    origen_kilometraje: sesion.origenKilometraje || null,
    kilometraje_confirmado: !!sesion.kilometrajeConfirmado,
    inconsistencia_km: !!sesion.inconsistenciaKm,
    estado_general: definirEstadoGeneral(sesion),
    novedades: sesion.novedades || [],
    observaciones: sesion.observacion || null,
    firmado: true,
    firmado_timestamp: ahora.toISOString()
  };
}

function construirDatosSesionPdf(sesion, telefono, ahora) {
  return {
    placa: sesion.placa,
    vehiculo: sesion.vehiculo || null,
    conductorNombre: sesion.conductor ? sesion.conductor.nombre : null,
    conductorTelefono: String(telefono || '').replace('whatsapp:', ''),
    kilometrajeFinal: sesion.kilometrajeFinal,
    kmReferencia: sesion.kmReferencia,
    kmReferenciaOrigen: sesion.kmReferenciaMeta ? sesion.kmReferenciaMeta.origen : null,
    diferenciaKm: sesion.diferenciaKm,
    alertasKm: sesion.alertasKm || [],
    novedades: sesion.novedades || [],
    observacion: sesion.observacion || null,
    fotos: sesion.fotos || [],
    firmado: true,
    fecha: ahora.toISOString(),
    fechaTexto: ahora.toLocaleString('es-CO')
  };
}

async function persistirAlertas(alertas) {
  if (!alertas || !alertas.length) return { error: null, data: [] };
  return await alertasData.crearAlertasMasivas(alertas);
}

async function guardarPosoperacionalCompleto(sesion, telefono) {
  var ahora = ahoraCO();
  var datosGuardar = construirDatosPosoperacional(sesion, telefono, ahora);
  var creado = await posoperacionalesData.crearPosoperacional(datosGuardar);

  if (creado.error || !creado.data) {
    return { error: creado.error || new Error('No se pudo crear el posoperacional') };
  }

  var posoperacional = creado.data;

  if (sesion.fotos && sesion.fotos.length) {
    var resFotos = await posoperacionalesData.guardarFotosPosoperacional(posoperacional.id, sesion.fotos);
    if (resFotos.error) {
      console.error('Error guardando fotos del posoperacional:', resFotos.error.message || resFotos.error);
    }
  }

  var alertas = alertasReglas.construirAlertasPosoperacional({
    placa: sesion.placa,
    novedades: sesion.novedades || [],
    alertasKm: sesion.alertasKm || [],
    inconsistenciaKm: !!sesion.inconsistenciaKm,
    posoperacionalId: posoperacional.id
  });

  var alertasGuardadas = await persistirAlertas(alertas);
  if (alertasGuardadas.error) {
    console.error('Error guardando alertas posoperacionales:', alertasGuardadas.error.message || alertasGuardadas.error);
  }

  alertasNotificador.notificarAlertas(alertas);

  var datosPdf = construirDatosSesionPdf(sesion, telefono, ahora);
  var pdfUrl = await pdfPosoperacional.subirYEnviarPDFPosoperacional(datosPdf, posoperacional.id, telefono);

  return {
    error: null,
    ahora: ahora,
    datosSesion: datosPdf,
    posoperacional: posoperacional,
    alertas: alertas,
    pdfUrl: pdfUrl
  };
}

module.exports = {
  construirDatosPosoperacional,
  construirDatosSesionPdf,
  guardarPosoperacionalCompleto
};
