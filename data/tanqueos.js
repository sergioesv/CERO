var config = require('../config/config');
var posoperacionalesData = require('./posoperacionales');

var TABLA_TANQUEOS = config.TABLES.tanqueos;
var TABLA_VEHICULOS = config.TABLES.vehiculos;

async function obtenerReferenciaKilometrajeTanqueo(placa) {
  return await posoperacionalesData.obtenerReferenciaKilometraje(placa);
}

async function crearTanqueo(datosTanqueo) {
  return await config.supabase
    .from(TABLA_TANQUEOS)
    .insert(datosTanqueo)
    .select()
    .single();
}

async function actualizarKilometrajeVehiculo(vehiculo, kilometraje) {
  if (!vehiculo) {
    return { error: new Error('Vehículo no enviado para actualizar kilometraje') };
  }

  var query = config.supabase
    .from(TABLA_VEHICULOS)
    .update({ kilometraje: kilometraje });

  if (vehiculo.id) {
    return await query.eq('id', vehiculo.id);
  }

  if (vehiculo.placa) {
    return await query.eq('placa', vehiculo.placa);
  }

  return { error: new Error('Vehículo sin id ni placa para actualizar kilometraje') };
}

module.exports = {
  TABLA: TABLA_TANQUEOS,
  obtenerReferenciaKilometrajeTanqueo,
  crearTanqueo,
  actualizarKilometrajeVehiculo
};

