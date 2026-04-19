'use strict';

var config = require('../config/config');
var supabase = config.supabase;

async function obtenerPlantillaActiva(tipoActivoId, tipoInspeccion, empresaId) {
  var query = supabase
    .from('plantillas_inspeccion')
    .select('*')
    .eq('tipo_activo_id', tipoActivoId)
    .eq('tipo_inspeccion', tipoInspeccion)
    .eq('activa', true);

  if (empresaId) {
    query = query.eq('empresa_id', empresaId);
  } else {
    query = query.is('empresa_id', null);
  }

  var res = await query.single();
  
  // Si no se encuentra plantilla específica de la empresa, buscar la global
  if ((res.error || !res.data) && empresaId) {
    res = await supabase
      .from('plantillas_inspeccion')
      .select('*')
      .eq('tipo_activo_id', tipoActivoId)
      .eq('tipo_inspeccion', tipoInspeccion)
      .eq('activa', true)
      .is('empresa_id', null)
      .single();
  }

  if (res.error || !res.data) return null;
  return res.data;
}

async function obtenerPlantillaPorId(plantillaId) {
  var res = await supabase
    .from('plantillas_inspeccion')
    .select('*')
    .eq('id', plantillaId)
    .single();

  if (res.error || !res.data) return null;
  return res.data;
}

async function obtenerGruposEItems(plantillaId) {
  // Obtener grupos
  var resGrupos = await supabase
    .from('plantilla_grupos')
    .select('*')
    .eq('plantilla_id', plantillaId)
    .order('orden', { ascending: true });

  if (resGrupos.error || !resGrupos.data) return [];
  var grupos = resGrupos.data;

  // Obtener items
  var resItems = await supabase
    .from('plantilla_items')
    .select('*')
    .in('grupo_id', grupos.map(function(g) { return g.id; }))
    .order('orden', { ascending: true });

  var items = resItems.error ? [] : resItems.data;

  // Ensamblar
  for (var i = 0; i < grupos.length; i++) {
    grupos[i].items = items.filter(function(item) {
      return item.grupo_id === grupos[i].id;
    });
  }

  return grupos;
}

module.exports = {
  obtenerPlantillaActiva,
  obtenerPlantillaPorId,
  obtenerGruposEItems
};
