var storage = require('../../../servicios/storage');

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
  sesion.kilometrajeConfirmado = false;
  sesion.fotoOdometroTemporal = null;
  sesion.novedades = [];
  sesion.fotosNovedadPendientes = [];
  sesion.novedadTemporal = null;
  sesion.observacion = null;
  sesion.fotos = [];
}

function volverAKilometraje(sesion) {
  sesion.kilometrajeFinal = null;
  sesion.kmDetectado = null;
  sesion.fotoOdometroTemporal = null;
  sesion.alertasKm = [];
  sesion.inconsistenciaKm = false;
  sesion.diferenciaKm = null;
  sesion.origenKilometraje = null;
  sesion.kilometrajeConfirmado = false;
  storage.limpiarFotosPorTipo(sesion, ['odometro']);
  sesion.estado = 'ESPERANDO_FOTO_ODOMETRO';
}

function agregarNovedades(sesion, novedades) {
  if (!Array.isArray(sesion.novedades)) sesion.novedades = [];

  (novedades || []).forEach(function(novedad) {
    if (!novedad || !novedad.item) return;

    var existente = sesion.novedades.find(function(actual) {
      return actual.item === novedad.item && actual.estado === novedad.estado;
    });

    if (!existente) {
      sesion.novedades.push(novedad);
    }
  });
}

function prepararFotosNovedad(sesion) {
  var pendientes = [];
  var fotos = Array.isArray(sesion.fotos) ? sesion.fotos : [];

  (sesion.novedades || []).forEach(function(novedad) {
    if (!novedad || novedad.requiereFoto === false) return;

    var yaTieneFoto = fotos.some(function(foto) {
      return foto && foto.tipo === 'novedad' && foto.novedadId === novedad.id;
    });

    if (!yaTieneFoto) pendientes.push(novedad);
  });

  sesion.fotosNovedadPendientes = pendientes;
  return pendientes;
}

function siguienteNovedadConFoto(sesion) {
  var pendientes = prepararFotosNovedad(sesion);
  return pendientes.length ? pendientes[0] : null;
}

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

function registrarFotoNovedad(sesion, novedad, url) {
  if (!novedad || !url) return;

  sesion.fotos.push({
    tipo: 'novedad',
    url: url,
    descripcion: novedad.item + ' - ' + (novedad.estado || 'Con novedad'),
    novedadId: novedad.id
  });

  prepararFotosNovedad(sesion);
}

module.exports = {
  reiniciarDatosOperativos,
  volverAKilometraje,
  agregarNovedades,
  prepararFotosNovedad,
  siguienteNovedadConFoto,
  registrarFotoOdometro,
  registrarFotoNovedad
};
