var sesiones = require('../../../servicios/sesiones');
var pdf = require('../../../servicios/pdf');
var inspeccionesData = require('../../../data/inspecciones');
var alertasReglas = require('../../alertas/reglas');
var alertasNotificador = require('../../alertas/notificador');

function construirDatosPreoperacional(sesion, ahora) {
  return {
    vehiculo_id: sesion.vehiculo.id,
    conductor_id: sesion.conductor ? sesion.conductor.id : null,
    placa: sesion.placa,
    kilometraje: sesion.kilometraje,
    fecha: ahora.toISOString().split('T')[0],
    hora: ahora.toTimeString().split(' ')[0],
    estado: 'completado',
    motor_niveles: sesion.respuestas.motor_niveles || null,
    electrico_luces: sesion.respuestas.electrico_luces || null,
    frenos_direccion_llantas: sesion.respuestas.frenos_direccion_llantas || null,
    cabina_equipo: sesion.respuestas.cabina_equipo || null,
    novedades: sesion.novedades.map(function(n) {
      var prefix = n.critico ? '⚠️ CRITICO ' : '';
      return prefix + n.grupo + ': ' + n.item + ' - ' + (n.nota || n.estado || '');
    }),
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
