'use strict';

var dataPlantillas = require('../data/plantillas');

var cache = {};
var TTL = 10 * 60 * 1000; // 10 minutos

function generarClaveCache(tipoActivoId, tipoInspeccion, empresaId) {
  return tipoActivoId + '_' + tipoInspeccion + '_' + (empresaId || 'global');
}

/**
 * Carga una plantilla desde la base de datos o caché.
 * Retorna la estructura lista con los grupos e ítems.
 */
async function cargar(tipoActivoId, tipoInspeccion, empresaId) {
  var clave = generarClaveCache(tipoActivoId, tipoInspeccion, empresaId);
  var ahora = Date.now();

  if (cache[clave] && (ahora - cache[clave].timestamp < TTL)) {
    return cache[clave].datos;
  }

  var plantilla = await dataPlantillas.obtenerPlantillaActiva(tipoActivoId, tipoInspeccion, empresaId);
  if (!plantilla) {
    // Retornar config minimo por defecto - suficiente para flujos que solo leen config.medicion
    var resultado = {
      id: null,
      nombre: 'Plantilla por defecto',
      config: { medicion: 'km' },
      grupos: []
    };
    cache[clave] = { timestamp: ahora, datos: resultado };
    return resultado;
  }

  var grupos = await dataPlantillas.obtenerGruposEItems(plantilla.id);

  // Formatear para compatibilidad con código existente
  var resultado = {
    id: plantilla.id,
    nombre: plantilla.nombre,
    config: plantilla.config || {},
    grupos: grupos.map(function(g) {
      return {
        id: g.id,
        nombre: g.nombre,
        abreviado: g.abreviado || g.nombre,
        orden: g.orden,
        solo_panel: g.solo_panel,
        items: g.items.map(function(item) {
          return {
            id: item.id,
            nombre: item.nombre,
            descripcion: item.descripcion,
            orden: item.orden,
            critico: item.critico,
            sinFoto: item.sin_foto,
            sinValidacion: item.sin_validacion,
            nuncaBloquea: item.nunca_bloquea,
            subPregunta: item.sub_pregunta || null
          };
        })
      };
    })
  };

  cache[clave] = {
    timestamp: ahora,
    datos: resultado
  };

  return resultado;
}

async function obtenerPorId(plantillaId) {
  var plantilla = await dataPlantillas.obtenerPlantillaPorId(plantillaId);
  if (!plantilla) return null;

  var grupos = await dataPlantillas.obtenerGruposEItems(plantilla.id);

  return {
    id: plantilla.id,
    nombre: plantilla.nombre,
    config: plantilla.config || {},
    grupos: grupos.map(function(g) {
      return {
        id: g.id,
        nombre: g.nombre,
        abreviado: g.abreviado || g.nombre,
        orden: g.orden,
        solo_panel: g.solo_panel,
        items: g.items.map(function(item) {
          return {
            id: item.id,
            nombre: item.nombre,
            descripcion: item.descripcion,
            orden: item.orden,
            critico: item.critico,
            sinFoto: item.sin_foto,
            sinValidacion: item.sin_validacion,
            nuncaBloquea: item.nunca_bloquea,
            subPregunta: item.sub_pregunta || null
          };
        })
      };
    })
  };
}

function invalidarCache(tipoActivoId, tipoInspeccion, empresaId) {
  var clave = generarClaveCache(tipoActivoId, tipoInspeccion, empresaId);
  delete cache[clave];
}

module.exports = {
  cargar,
  obtenerPorId,
  invalidarCache
};
