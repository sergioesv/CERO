// ═══════════════════════════════════════════════════════════
// data/posoperacionales.js
// Capa de datos para posoperacionales
// CERO — v26 — Queries adaptadas a schema sin vehiculos
// ═══════════════════════════════════════════════════════════

var config = require('../config/config');

var TABLA_POSOPERACIONALES = config.TABLES.posoperacionales;
var TABLA_PREOPERACIONALES = config.TABLES.preoperacionales;

function fechaHoyCO() {
  var ahoraUtc = new Date();
  var ahoraCo = new Date(ahoraUtc.getTime() - (5 * 60 * 60 * 1000));
  return ahoraCo.toISOString().slice(0, 10);
}

async function buscarPreoperacionalDia(activoId, fecha) {
  try {
    var resultado = await config.supabase
      .from(TABLA_PREOPERACIONALES)
      .select('id, activo_id, kilometraje, fecha, hora, created_at')
      .eq('activo_id', activoId)
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

async function buscarUltimoPosoperacional(activoId) {
  try {
    var resultado = await config.supabase
      .from(TABLA_POSOPERACIONALES)
      .select('id, activo_id, kilometraje_final, created_at')
      .eq('activo_id', activoId)
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

async function buscarUltimoPreoperacional(activoId) {
  try {
    var resultado = await config.supabase
      .from(TABLA_PREOPERACIONALES)
      .select('id, activo_id, kilometraje, fecha, hora, created_at')
      .eq('activo_id', activoId)
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

async function buscarKilometrajeActivo(activoId) {
  try {
    var resultado = await config.supabase
      .from(config.TABLES.activos)
      .select('id, placa, kilometraje')
      .eq('id', activoId)
      .maybeSingle();

    if (resultado.error || !resultado.data) {
      if (resultado.error) {
        console.error('Error buscando kilometraje del activo:', resultado.error.message || resultado.error);
      }
      return null;
    }

    return resultado.data;
  } catch (error) {
    console.error('Error buscando kilometraje del activo:', error.message || error);
    return null;
  }
}

async function obtenerReferenciaKilometraje(activoId) {
  var hoy = fechaHoyCO();
  var preopDia = await buscarPreoperacionalDia(activoId, hoy);
  if (preopDia && typeof preopDia.kilometraje === 'number') {
    return {
      kilometraje: preopDia.kilometraje,
      origen: 'preoperacional_dia',
      referenciaId: preopDia.id,
      fecha: preopDia.fecha || hoy,
      hora: preopDia.hora || null
    };
  }

  var ultimoPosop = await buscarUltimoPosoperacional(activoId);
  if (ultimoPosop && typeof ultimoPosop.kilometraje_final === 'number') {
    return {
      kilometraje: ultimoPosop.kilometraje_final,
      origen: 'ultimo_posoperacional',
      referenciaId: ultimoPosop.id,
      fecha: ultimoPosop.created_at || null,
      hora: null
    };
  }

  var ultimoPreop = await buscarUltimoPreoperacional(activoId);
  if (ultimoPreop && typeof ultimoPreop.kilometraje === 'number') {
    return {
      kilometraje: ultimoPreop.kilometraje,
      origen: 'ultimo_preoperacional',
      referenciaId: ultimoPreop.id,
      fecha: ultimoPreop.fecha || null,
      hora: ultimoPreop.hora || null
    };
  }

  var activo = await buscarKilometrajeActivo(activoId);
  if (activo && typeof activo.kilometraje === 'number') {
    return {
      kilometraje: activo.kilometraje,
      origen: 'activo',
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
      entidad_tipo: 'posoperacional',
      entidad_id: posoperacionalId,
      tipo: foto.tipo,
      descripcion: foto.descripcion || null,
      foto_url: foto.url,
      metadata: foto.novedadId ? { novedad_id: foto.novedadId } : null
    };
  });

  return await config.supabase
    .from('evidencia')
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
  fechaHoyCO,
  obtenerReferenciaKilometraje,
  crearPosoperacional,
  guardarFotosPosoperacional,
  actualizarPdfPosoperacional
};
