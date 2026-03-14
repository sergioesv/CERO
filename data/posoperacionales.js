var config = require('../config/config');

var TABLA_POSOPERACIONALES = config.TABLES.posoperacionales;
var TABLA_FOTOS = process.env.DB_TABLE_FOTOS_POSOPERACIONAL || 'fotos_posoperacional';
var TABLA_PREOPERACIONALES = config.TABLES.preoperacionales;
var TABLA_VEHICULOS = config.TABLES.vehiculos;

function fechaHoyCO() {
  var ahoraUtc = new Date();
  var ahoraCo = new Date(ahoraUtc.getTime() - (5 * 60 * 60 * 1000));
  return ahoraCo.toISOString().slice(0, 10);
}

async function buscarPreoperacionalDia(placa, fecha) {
  try {
    var resultado = await config.supabase
      .from(TABLA_PREOPERACIONALES)
      .select('id, placa, kilometraje, fecha, hora, created_at')
      .eq('placa', placa)
      .eq('fecha', fecha)
      .order('hora', { ascending: false })
      .limit(1);

    if (resultado.error) {
      console.error('Error buscando preoperacional del dia:', resultado.error.message || resultado.error);
      return null;
    }

    return Array.isArray(resultado.data) && resultado.data.length ? resultado.data[0] : null;
  } catch (error) {
    console.error('Error buscando preoperacional del dia:', error.message || error);
    return null;
  }
}

async function buscarUltimoPosoperacional(placa) {
  try {
    var resultado = await config.supabase
      .from(TABLA_POSOPERACIONALES)
      .select('id, vehiculo_placa, kilometraje_final, created_at')
      .eq('vehiculo_placa', placa)
      .order('created_at', { ascending: false })
      .limit(1);

    if (resultado.error) {
      console.error('Error buscando ultimo posoperacional:', resultado.error.message || resultado.error);
      return null;
    }

    return Array.isArray(resultado.data) && resultado.data.length ? resultado.data[0] : null;
  } catch (error) {
    console.error('Error buscando ultimo posoperacional:', error.message || error);
    return null;
  }
}

async function buscarUltimoPreoperacional(placa) {
  try {
    var resultado = await config.supabase
      .from(TABLA_PREOPERACIONALES)
      .select('id, placa, kilometraje, fecha, hora, created_at')
      .eq('placa', placa)
      .order('fecha', { ascending: false })
      .order('hora', { ascending: false })
      .limit(1);

    if (resultado.error) {
      console.error('Error buscando ultimo preoperacional:', resultado.error.message || resultado.error);
      return null;
    }

    return Array.isArray(resultado.data) && resultado.data.length ? resultado.data[0] : null;
  } catch (error) {
    console.error('Error buscando ultimo preoperacional:', error.message || error);
    return null;
  }
}

async function buscarKilometrajeVehiculo(placa) {
  try {
    var resultado = await config.supabase
      .from(TABLA_VEHICULOS)
      .select('placa, kilometraje')
      .eq('placa', placa)
      .maybeSingle();

    if (resultado.error || !resultado.data) {
      if (resultado.error) {
        console.error('Error buscando kilometraje del vehiculo:', resultado.error.message || resultado.error);
      }
      return null;
    }

    return resultado.data;
  } catch (error) {
    console.error('Error buscando kilometraje del vehiculo:', error.message || error);
    return null;
  }
}

async function obtenerReferenciaKilometraje(placa) {
  var hoy = fechaHoyCO();
  var preopDia = await buscarPreoperacionalDia(placa, hoy);
  if (preopDia && typeof preopDia.kilometraje === 'number') {
    return {
      kilometraje: preopDia.kilometraje,
      origen: 'preoperacional_dia',
      referenciaId: preopDia.id,
      fecha: preopDia.fecha || hoy,
      hora: preopDia.hora || null
    };
  }

  var ultimoPosop = await buscarUltimoPosoperacional(placa);
  if (ultimoPosop && typeof ultimoPosop.kilometraje_final === 'number') {
    return {
      kilometraje: ultimoPosop.kilometraje_final,
      origen: 'ultimo_posoperacional',
      referenciaId: ultimoPosop.id,
      fecha: ultimoPosop.created_at || null,
      hora: null
    };
  }

  var ultimoPreop = await buscarUltimoPreoperacional(placa);
  if (ultimoPreop && typeof ultimoPreop.kilometraje === 'number') {
    return {
      kilometraje: ultimoPreop.kilometraje,
      origen: 'ultimo_preoperacional',
      referenciaId: ultimoPreop.id,
      fecha: ultimoPreop.fecha || null,
      hora: ultimoPreop.hora || null
    };
  }

  var vehiculo = await buscarKilometrajeVehiculo(placa);
  if (vehiculo && typeof vehiculo.kilometraje === 'number') {
    return {
      kilometraje: vehiculo.kilometraje,
      origen: 'vehiculo',
      referenciaId: null,
      fecha: null,
      hora: null
    };
  }

  return {
    kilometraje: null,
    origen: 'sin_referencia',
    referenciaId: null,
    fecha: null,
    hora: null
  };
}

async function crearPosoperacional(datosPosoperacional) {
  return await config.supabase
    .from(TABLA_POSOPERACIONALES)
    .insert(datosPosoperacional)
    .select()
    .single();
}

async function guardarFotosPosoperacional(posoperacionalId, fotos) {
  if (!fotos || !fotos.length) return { error: null, data: [] };

  var filas = fotos.map(function(foto) {
    return {
      posoperacional_id: posoperacionalId,
      novedad_id: foto.novedadId || null,
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

async function actualizarPdfPosoperacional(posoperacionalId, pdfUrl) {
  return await config.supabase
    .from(TABLA_POSOPERACIONALES)
    .update({ pdf_url: pdfUrl })
    .eq('id', posoperacionalId);
}

module.exports = {
  TABLA_POSOPERACIONALES,
  TABLA_FOTOS,
  fechaHoyCO,
  obtenerReferenciaKilometraje,
  crearPosoperacional,
  guardarFotosPosoperacional,
  actualizarPdfPosoperacional
};
