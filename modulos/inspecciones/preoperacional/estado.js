// ═══════════════════════════════════════════════════════════
// modulos/vehiculos/preoperacional/estado.js
// Manejo de sesión y datos operativos del preoperacional.
// CERO — v12 — Soporte para sub-preguntas de severidad
// ═══════════════════════════════════════════════════════════

var preop = require('./validaciones');
var storage = require('../../../servicios/storage');

// ───────────────────────────────────────────────────────────
// reiniciarDatosOperativos — limpia todos los datos de la
// inspección para comenzar de nuevo. Se llama al iniciar
// sesión con un vehículo.
// ───────────────────────────────────────────────────────────

function reiniciarDatosOperativos(sesion) {
  sesion.sinPlantilla = false;
  sesion.plantilla = null;
  sesion.gruposInspeccion = null;
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
  // v12 — cola de sub-preguntas de severidad
  sesion.subPreguntasCola = [];
  sesion.fotos = (sesion.fotos || []).filter(function(foto) {
    return foto.tipo === 'inicio_placa' || foto.tipo === 'inicio_odometro';
  });
}

// ───────────────────────────────────────────────────────────
// limpiarGrupo — elimina respuestas, novedades y fotos de
// un grupo específico. Se llama al retroceder o al
// re-responder un bloque.
// ───────────────────────────────────────────────────────────

function limpiarGrupo(sesion, grupo) {
  delete sesion.respuestas[grupo.id];
  sesion.novedades = (sesion.novedades || []).filter(function(n) {
    return n.grupo !== grupo.nombre;
  });
  sesion.fotosNovedadPendientes = [];
  // v12 — limpiar cola de sub-preguntas al limpiar grupo
  sesion.subPreguntasCola = [];
  sesion.fotos = (sesion.fotos || []).filter(function(foto) {
    return foto.tipo !== 'novedad' && foto.tipo !== 'adicional';
  });
}

// ───────────────────────────────────────────────────────────
// prepararFotosNovedad — construye la lista de fotos
// pendientes de novedad basándose en las novedades que
// requieren foto (excluye sinFoto).
// ───────────────────────────────────────────────────────────

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

// ───────────────────────────────────────────────────────────
// resolverNombreItem — busca coincidencia exacta o parcial
// de un nombre de ítem contra la lista de disponibles.
// ───────────────────────────────────────────────────────────

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

// ───────────────────────────────────────────────────────────
// normalizarItemsInterpretados — normaliza los ítems
// interpretados por Gemini contra los nombres oficiales
// del grupo, eliminando duplicados.
// ───────────────────────────────────────────────────────────

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

// ───────────────────────────────────────────────────────────
// Navegación — funciones para retroceder en el flujo
// ───────────────────────────────────────────────────────────

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
  sesion.subPreguntasCola = [];
  sesion.estado = 'ESPERANDO_FOTO_FRONTAL';
}

function volverAKilometraje(sesion) {
  storage.limpiarFotosPorTipo(sesion, ['inicio_odometro']);
  sesion.kilometraje = null;
  sesion.kmDetectado = null;
  sesion.kmLecturaFueraRango = false;
  sesion.fotoOdometroTemporal = null;
  sesion.subPreguntasCola = [];
  sesion.estado = 'ESPERANDO_FOTO_ODOMETRO';
}

module.exports = {
  reiniciarDatosOperativos,
  limpiarGrupo,
  prepararFotosNovedad,
  resolverNombreItem,
  normalizarItemsInterpretados,
  volverAInicioPorFoto,
  volverAKilometraje
};
