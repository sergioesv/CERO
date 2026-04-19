// ═══════════════════════════════════════════════════════════
// data/inspecciones.js
// Capa de datos para preoperacionales y referencia de km
// CERO — v26 — Queries adaptadas a schema sin vehiculos
// ═══════════════════════════════════════════════════════════

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

async function actualizarKilometrajeActivo(activoId, kilometraje) {
  return await config.supabase
    .from(config.TABLES.activos)
    .update({ kilometraje: kilometraje, updated_at: new Date().toISOString() })
    .eq('id', activoId);
}

/**
 * Obtiene referencia de kilometraje para validación de odómetro.
 * Prioridad según tipo de flujo:
 * - preoperacional: último preoperacional > activo
 * - tanqueo: preoperacional del día > último tanqueo > último preoperacional > activo
 * - posoperacional: preoperacional del día > último posoperacional > último preoperacional > activo
 *
 * @param {string} activoId - UUID del activo
 * @param {string} tipoFlujo - 'preoperacional' | 'tanqueo' | 'posoperacional'
 * @returns {Promise<{kilometraje: number|null, origen: string}>}
 */
async function obtenerReferenciaKilometraje(activoId, tipoFlujo) {
  var T = config.TABLES;
  var ahoraCO = new Date(Date.now() - (5 * 60 * 60 * 1000));
  var inicioDia = new Date(ahoraCO.getFullYear(), ahoraCO.getMonth(), ahoraCO.getDate());
  var inicioISO = inicioDia.toISOString();

  // 1. Intentar preoperacional del día
  var preoperacionalHoy = await config.supabase
    .from(T.preoperacionales)
    .select('kilometraje')
    .eq('activo_id', activoId)
    .gte('created_at', inicioISO)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!preoperacionalHoy.error && preoperacionalHoy.data && preoperacionalHoy.data.kilometraje != null) {
    return {
      kilometraje: preoperacionalHoy.data.kilometraje,
      origen: 'preoperacional_dia'
    };
  }

  // 2. Si es tanqueo, intentar último tanqueo
  if (tipoFlujo === 'tanqueo') {
    var ultimoTanqueo = await config.supabase
      .from(T.tanqueos)
      .select('kilometraje')
      .eq('activo_id', activoId)
      .not('kilometraje', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!ultimoTanqueo.error && ultimoTanqueo.data && ultimoTanqueo.data.kilometraje != null) {
      return {
        kilometraje: ultimoTanqueo.data.kilometraje,
        origen: 'ultimo_tanqueo'
      };
    }
  }

  // 3. Si es posoperacional, intentar último posoperacional
  if (tipoFlujo === 'posoperacional') {
    var ultimoPosoperacional = await config.supabase
      .from(T.posoperacionales)
      .select('kilometraje_final')
      .eq('activo_id', activoId)
      .not('kilometraje_final', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!ultimoPosoperacional.error && ultimoPosoperacional.data && ultimoPosoperacional.data.kilometraje_final != null) {
      return {
        kilometraje: ultimoPosoperacional.data.kilometraje_final,
        origen: 'ultimo_posoperacional'
      };
    }
  }

  // 4. Intentar último preoperacional (cualquier día)
  var ultimoPreoperacional = await config.supabase
    .from(T.preoperacionales)
    .select('kilometraje')
    .eq('activo_id', activoId)
    .not('kilometraje', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!ultimoPreoperacional.error && ultimoPreoperacional.data && ultimoPreoperacional.data.kilometraje != null) {
    return {
      kilometraje: ultimoPreoperacional.data.kilometraje,
      origen: 'ultimo_preoperacional'
    };
  }

  // 5. Fallback: kilometraje del activo
  var activo = await config.supabase
    .from(T.activos)
    .select('kilometraje')
    .eq('id', activoId)
    .maybeSingle();

  if (!activo.error && activo.data && activo.data.kilometraje != null) {
    return {
      kilometraje: activo.data.kilometraje,
      origen: 'activo'
    };
  }

  // 6. Sin referencia
  return {
    kilometraje: null,
    origen: 'sin_referencia'
  };
}

module.exports = {
  crearPreoperacional,
  guardarFotosEvidencia,
  actualizarKilometrajeActivo,
  obtenerReferenciaKilometraje
};
