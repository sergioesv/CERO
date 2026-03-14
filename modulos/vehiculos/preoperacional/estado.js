var preop = require('./validaciones');
var storage = require('../../../servicios/storage');
var GRUPOS = preop.GRUPOS;

function reiniciarDatosOperativos(sesion) {
  sesion.respuestas = {};
  sesion.novedades = [];
  sesion.fotosNovedadPendientes = [];
  sesion.observacion = null;
  sesion.kilometraje = null;
  sesion.kmDetectado = null;
  sesion.kmLecturaFueraRango = false;
  sesion.placaDetectada = null;
  sesion.placaSugerida = null;
  sesion.fotoPlacaTemporal = null;
  sesion.fotoOdometroTemporal = null;
  sesion.grupoActual = 0;
  sesion.fotos = (sesion.fotos || []).filter(function(foto) {
    return foto.tipo === 'inicio_placa' || foto.tipo === 'inicio_odometro';
  });
}

function limpiarGrupo(sesion, grupo) {
  delete sesion.respuestas[grupo.id];
  sesion.novedades = (sesion.novedades || []).filter(function(n) {
    return n.grupo !== grupo.nombre;
  });
  sesion.fotosNovedadPendientes = [];
  sesion.fotos = (sesion.fotos || []).filter(function(foto) {
    return foto.tipo !== 'novedad' && foto.tipo !== 'adicional';
  });
}

function prepararFotosNovedad(sesion) {
  var fotografiables = preop.obtenerNovedadesFotografiables(sesion.novedades);
  var fotosTomadas = (sesion.fotos || []).filter(function(foto) {
    return foto && foto.tipo === 'novedad';
  }).length;

  sesion.fotosNovedadPendientes = fotografiables.slice(fotosTomadas).map(function(novedad) {
    return {
      grupo: novedad.grupo,
      item: novedad.item,
      estado: novedad.estado,
      nota: novedad.nota,
      critico: novedad.critico
    };
  });
}

function resolverNombreItem(nombre, disponibles) {
  var buscado = String(nombre || '').trim().toLowerCase();
  for (var i = 0; i < disponibles.length; i++) {
    if (disponibles[i].toLowerCase() === buscado) return disponibles[i];
  }
  for (var j = 0; j < disponibles.length; j++) {
    var disp = disponibles[j].toLowerCase();
    if (disp.indexOf(buscado) >= 0 || buscado.indexOf(disp) >= 0) return disponibles[j];
  }
  return null;
}

function normalizarItemsInterpretados(items, grupo) {
  var disponibles = grupo.items.map(function(item) { return item.nombre; });
  var vistos = {};
  var salida = [];

  (items || []).forEach(function(item) {
    if (!item || !item.nombre) return;
    var nombre = resolverNombreItem(item.nombre, disponibles);
    if (!nombre || vistos[nombre]) return;
    vistos[nombre] = true;
    salida.push({
      nombre: nombre,
      estado: item.estado,
      nota: item.estado
    });
  });

  return salida;
}

function volverAInicioPorFoto(sesion) {
  storage.limpiarFotosPorTipo(sesion, ['inicio_placa', 'inicio_odometro']);
  sesion.placa = null;
  sesion.vehiculo = null;
  sesion.conductor = null;
  sesion.kilometraje = null;
  sesion.kmDetectado = null;
  sesion.kmLecturaFueraRango = false;
  sesion.placaDetectada = null;
  sesion.placaSugerida = null;
  sesion.fotoPlacaTemporal = null;
  sesion.fotoOdometroTemporal = null;
  sesion.estado = 'ESPERANDO_FOTO_FRONTAL';
}

function volverAKilometraje(sesion) {
  storage.limpiarFotosPorTipo(sesion, ['inicio_odometro']);
  sesion.kilometraje = null;
  sesion.kmDetectado = null;
  sesion.kmLecturaFueraRango = false;
  sesion.fotoOdometroTemporal = null;
  sesion.estado = 'ESPERANDO_FOTO_ODOMETRO';
}

module.exports = {
  GRUPOS,
  reiniciarDatosOperativos,
  limpiarGrupo,
  prepararFotosNovedad,
  resolverNombreItem,
  normalizarItemsInterpretados,
  volverAInicioPorFoto,
  volverAKilometraje
};
