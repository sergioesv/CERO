var sesiones = require('../../../servicios/sesiones');
var pdf = require('../../../servicios/pdf/preoperacional');
var config = require('../../../config/config');
var inspeccionesData = require('../../../data/inspecciones');
var activosData = require('../../../data/activos');
var alertasReglas = require('../../alertas/reglas');
var alertasNotificador = require('../../alertas/notificador');

function construirAlertasKm(sesion, kmReferencia, diferenciaKm) {
  var alertas = [];

  if (kmReferencia == null || sesion.kilometraje == null) {
    return alertas;
  }

  if (sesion.kilometraje < kmReferencia) {
    alertas.push({
      tipo: 'menor',
      mensaje: 'Kilometraje menor al ultimo registro',
      valor_detectado: sesion.kilometraje,
      km_referencia: kmReferencia,
      diferencia_km: diferenciaKm
    });
  }

  if (sesion.kilometraje > (kmReferencia + config.MAX_KM_SALTO)) {
    alertas.push({
      tipo: 'alto',
      mensaje: 'Salto de kilometraje mayor al rango automatico',
      valor_detectado: sesion.kilometraje,
      km_referencia: kmReferencia,
      diferencia_km: diferenciaKm,
      max_km_salto: config.MAX_KM_SALTO
    });
  }

  return alertas;
}

async function asegurarConductorSesion(sesion, telefono) {
  if (sesion.conductor && sesion.conductor.id) {
    return sesion.conductor;
  }

  if (!sesion.placa) {
    return null;
  }

  var carga = await activosData.cargarActivoYConductor(sesion.placa, telefono);
  if (!carga.error && carga.conductor) {
    sesion.conductor = carga.conductor;
    if (!sesion.vehiculo && carga.vehiculo) {
      sesion.vehiculo = carga.vehiculo;
    }
    return carga.conductor;
  }

  return null;
}

function construirDatosPreoperacional(sesion, ahora) {
  var kmReferencia = sesion.vehiculo && typeof sesion.vehiculo.kilometraje === 'number'
    ? sesion.vehiculo.kilometraje
    : null;
  var diferenciaKm = kmReferencia == null || sesion.kilometraje == null
    ? null
    : (sesion.kilometraje - kmReferencia);
  var alertasKm = construirAlertasKm(sesion, kmReferencia, diferenciaKm);

  var clasificacion = 'INFORMATIVO';
  if (sesion.novedades && sesion.novedades.length > 0) {
    var hasBloqueo = sesion.novedades.some(function(n) { return n.severidad === 'bloqueo'; });
    var hasAlerta = sesion.novedades.some(function(n) { return n.severidad === 'alerta'; });
    if (hasBloqueo) clasificacion = 'BLOQUEO';
    else if (hasAlerta) clasificacion = 'ALERTA';
  }

  return {
    activo_id: sesion.vehiculo ? sesion.vehiculo.id : null,
    plantilla_id: sesion.plantilla ? sesion.plantilla.id : null,
    conductor_id: sesion.conductor ? sesion.conductor.id : null,
    kilometraje: sesion.kilometraje,
    horometro: sesion.horometro || null,
    km_referencia: kmReferencia,
    diferencia_km: diferenciaKm,
    inconsistencia_km: alertasKm.length > 0,
    alertas_km: alertasKm,
    fecha: ahora.toISOString().split('T')[0],
    hora: ahora.toTimeString().split(' ')[0],
    estado: 'completado',
    clasificacion: clasificacion,
    respuestas: sesion.respuestas || {},
    novedades: sesion.novedades.map(function(n) {
      return {
        grupo: n.grupo,
        item: n.item,
        estado: n.estado || null,
        nota: n.nota || null,
        critico: !!n.critico
      };
    }),
    observaciones: sesion.observacion || null,
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

  await asegurarConductorSesion(sesion, telefono);
  if (!sesion.conductor || !sesion.conductor.id) {
    throw new Error('Sesion incompleta: conductor no identificado para el telefono actual.');
  }

  var datosPreoperacional = construirDatosPreoperacional(sesion, ahora);

  var resPreop = await inspeccionesData.crearPreoperacional(datosPreoperacional);
  if (resPreop.error) {
    return { error: resPreop.error };
  }

  var preop = resPreop.data;

  if (Array.isArray(sesion.fotos) && sesion.fotos.length > 0) {
    var resFotos = await inspeccionesData.guardarFotosEvidencia(preop.id, sesion.fotos);
    if (resFotos.error) {
      console.error('Error guardando fotos:', resFotos.error);
    }
  }

  if (sesion.vehiculo && sesion.vehiculo.id && typeof sesion.kilometraje === 'number') {
    var resVehiculo = await inspeccionesData.actualizarKilometrajeActivo(sesion.vehiculo.id, sesion.kilometraje);
    if (resVehiculo.error) {
      console.error('Error actualizando kilometraje:', resVehiculo.error);
    }
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
