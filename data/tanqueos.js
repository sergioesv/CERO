var config = require('../config/config');
var referenciaKm = require('./posoperacionales');

var TABLA_TANQUEOS = config.TABLES.tanqueos;
var TABLA_FOTOS = process.env.DB_TABLE_FOTOS_TANQUEO || 'fotos_tanqueo';
var TABLA_VEHICULOS = config.TABLES.vehiculos;

async function obtenerReferenciaKilometraje(placa) {
  return referenciaKm.obtenerReferenciaKilometraje(placa);
}

async function crearTanqueo(datosTanqueo) {
  return await config.supabase
    .from(TABLA_TANQUEOS)
    .insert(datosTanqueo)
    .select()
    .single();
}

async function guardarFotosTanqueo(tanqueoId, fotos) {
  if (!Array.isArray(fotos) || !fotos.length) {
    return { error: null, data: [] };
  }

  var filas = fotos.map(function(foto) {
    return {
      tanqueo_id: tanqueoId,
      tipo: foto.tipo,
      descripcion: foto.descripcion || null,
      foto_url: foto.url
    };
  });

  return await config.supabase
    .from(TABLA_FOTOS)
    .insert(filas)
    .select();
}

async function actualizarKilometrajeVehiculo(placa, kilometraje) {
  return await config.supabase
    .from(TABLA_VEHICULOS)
    .update({ kilometraje: kilometraje })
    .eq('placa', placa);
}

module.exports = {
  TABLA_TANQUEOS: TABLA_TANQUEOS,
  TABLA_FOTOS: TABLA_FOTOS,
  obtenerReferenciaKilometraje: obtenerReferenciaKilometraje,
  crearTanqueo: crearTanqueo,
  guardarFotosTanqueo: guardarFotosTanqueo,
  actualizarKilometrajeVehiculo: actualizarKilometrajeVehiculo
};


