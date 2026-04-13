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

/**
 * Obtiene el promedio histórico de rendimiento km/L de un vehículo.
 * Solo considera tanqueos con rendimiento_calculado válido (> 0).
 *
 * @param {string} placa
 * @returns {{ promedio: number|null }}
 */
async function obtenerRendimientoHistorico(placa) {
  var resultado = await config.supabase
    .from(TABLA_TANQUEOS)
    .select('rendimiento_calculado')
    .eq('vehiculo_placa', placa)
    .gt('rendimiento_calculado', 0)
    .not('rendimiento_calculado', 'is', null)
    .limit(20);

  if (resultado.error || !resultado.data || resultado.data.length === 0) {
    return { promedio: null };
  }

  var suma = resultado.data.reduce(function(acc, row) {
    return acc + parseFloat(row.rendimiento_calculado);
  }, 0);

  return { promedio: parseFloat((suma / resultado.data.length).toFixed(2)) };
}

module.exports = {
  TABLA_TANQUEOS: TABLA_TANQUEOS,
  TABLA_FOTOS: TABLA_FOTOS,
  obtenerReferenciaKilometraje: obtenerReferenciaKilometraje,
  crearTanqueo: crearTanqueo,
  guardarFotosTanqueo: guardarFotosTanqueo,
  actualizarKilometrajeVehiculo: actualizarKilometrajeVehiculo,
  obtenerRendimientoHistorico: obtenerRendimientoHistorico
};


