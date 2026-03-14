
var config = require('../config/config');

async function crearPreoperacional(datosPreoperacional) {
  return await config.supabase
    .from(config.TABLES.preoperacionales)
    .insert(datosPreoperacional)
    .select()
    .single();
}

async function guardarFotosEvidencia(preoperacionalId, fotos) {
  if (!fotos || !fotos.length) return { error: null };
  var fotosParaGuardar = fotos.map(function(foto) {
    return {
      preoperacional_id: preoperacionalId,
      tipo: foto.tipo,
      descripcion: foto.descripcion,
      foto_url: foto.url,
      validada: foto.validada !== false,
      resultado_validacion: foto.validacion || 'Foto recibida'
    };
  });
  return await config.supabase.from(config.TABLES.fotosEvidencia).insert(fotosParaGuardar);
}

async function actualizarKilometrajeVehiculo(vehiculoId, kilometraje) {
  return await config.supabase
    .from(config.TABLES.vehiculos)
    .update({ kilometraje: kilometraje })
    .eq('id', vehiculoId);
}

module.exports = {
  crearPreoperacional,
  guardarFotosEvidencia,
  actualizarKilometrajeVehiculo
};
