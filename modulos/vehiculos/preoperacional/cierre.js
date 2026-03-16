var sesiones = require('../../../servicios/sesiones');
var pdf = require('../../../servicios/pdf');
var inspeccionesData = require('../../../data/inspecciones');
var alertasReglas = require('../../alertas/reglas');
var alertasNotificador = require('../../alertas/notificador');

function construirAlertasKm(sesion, kmReferencia, diferenciaKm) {
  var alertas = [];

  if (kmReferencia == null) {
    return alertas;
  }

  if (sesion.kilometraje < kmReferencia) {
    alertas.push({
      tipo: 'kilometraje_menor',
      mensaje: 'El kilometraje reportado es menor al ultimo registrado.',
      ultimo_registrado: kmReferencia,
      reportado: sesion.kilometraje,
      diferencia: diferenciaKm
    });
  }

  return alertas;
}

function construirNovedadesPreoperacional(sesion) {
  return (sesion.novedades || []).map(function(n) {
    return {
      grupo: n.grupo,
      item: n.item,
      estado: n.estado,
      nota: n.nota || n.estado || '',
      critico: !!n.critico
    };
  });
}

function construirDatosPreoperacional(sesion, ahora) {
  var kmReferencia = sesion.vehiculo && typeof sesion.vehiculo.kilometraje === 'number'
    ? sesion.vehiculo.kilometraje
    : null;
  var diferenciaKm = kmReferencia == null ? null : sesion.kilometraje - kmReferencia;
  var alertasKm = construirAlertasKm(sesion, kmReferencia, diferenciaKm);

  return {
    vehiculo_placa: sesion.placa,
    conductor_id: sesion.conductor && sesion.conductor.id ? sesion.conductor.id : null,
    kilometraje: sesion.kilometraje,
    km_referencia: kmReferencia,
    diferencia_km: diferenciaKm,
    inconsistencia_km: alertasKm.length > 0,
    alertas_km: alertasKm,
    fecha: ahora.toISOString().split('T')[0],
    hora: ahora.toTimeString().split(' ')[0],
    estado: 'completado',
    motor_niveles: sesion.respuestas.motor_niveles || null,
    electrico_luces: sesion.respuestas.electrico_luces || null,
    frenos_direccion_llantas: sesion.respuestas.frenos_direccion_llantas || null,
    cabina_equipo: sesion.respuestas.cabina_equipo || null,
    novedades: construirNovedadesPreoperacional(sesion),
    observaciones: sesion.observacion,
    firma_operario: true,
    firma_timestamp: ahora.toISOString()
  };
}

function construirDatosSesionPdf(sesion, grupos, telefono, ahora) {
  var datosSesion = sesiones.copiarSesion(sesion);
  datosSesion.bloques = grupos.map(function(grupo) {
    var respGrupo = datosSesion.respuestas[grupo.id] || { items: [] };
    var itemsRespuesta = respGrupo.items || [];
    return {
      nombre: grupo.nombre,
      items: grupo.items.map(function(itemDef) {
        var encontrado = itemsRespuesta.find(function(r) { return r.nombre === itemDef.nombre; });
        return {
          nombre: itemDef.nombre,
          critico: itemDef.critico,
          estado: encontrado ? encontrado.estado : 'OK'
        };
      })
    };
  });
  datosSesion.items = datosSesion.novedades || [];
  datosSesion.telefono = telefono;
  datosSesion.fecha = ahora.toISOString();
  return datosSesion;
}

async function guardarPreoperacionalCompleto(sesion, telefono, grupos) {
  var ahoraUTC = new Date();
  var ahora = new Date(ahoraUTC.getTime() - (5 * 60 * 60 * 1000));

  if (!sesion.placa || !sesion.vehiculo || !sesion.vehiculo.id) {
    return { error: new Error('Sesion incompleta: vehiculo no identificado.') };
  }

  if (!sesion.conductor || !sesion.conductor.id) {
    return { error: new Error('Sesion incompleta: conductor no identificado para el telefono actual.') };
  }

  var datosPreoperacional = construirDatosPreoperacional(sesion, ahora);

  var resPreop = await inspeccionesData.crearPreoperacional(datosPreoperacional);
  if (resPreop.error) {
    return { error: resPreop.error };
  }

  var preop = resPreop.data;

  if (sesion.fotos.length > 0) {
    var resFotos = await inspeccionesData.guardarFotosEvidencia(preop.id, sesion.fotos);
    if (resFotos.error) {
      console.error('Error guardando fotos:', resFotos.error);
    }
  }

  var resVehiculo = await inspeccionesData.actualizarKilometrajeVehiculo(sesion.vehiculo.id, sesion.kilometraje);
  if (resVehiculo.error) {
    console.error('Error actualizando kilometraje:', resVehiculo.error);
  }

  var novedadesCriticas = alertasReglas.obtenerNovedadesCriticas(sesion.novedades);
  alertasNotificador.notificarCriticas(sesion.placa, novedadesCriticas);

  var datosSesion = construirDatosSesionPdf(sesion, grupos, telefono, ahora);
  var pdfUrl = await pdf.subirYEnviarPDF(datosSesion, preop.id, telefono);

  return {
    error: null,
    ahora: ahora,
    datosSesion: datosSesion,
    novedadesCriticas: novedadesCriticas,
    pdfUrl: pdfUrl,
    preop: preop
  };
}

module.exports = {
  construirDatosPreoperacional,
  construirDatosSesionPdf,
  guardarPreoperacionalCompleto
};
