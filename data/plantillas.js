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


async function listarPlantillas() {
  var resultado = await config.supabase
    .from('plantillas_inspeccion')
    .select('*, tipos_activo (nombre, codigo)')
    .order('created_at', { ascending: false });

  if (resultado.error) throw resultado.error;
  return resultado.data || [];
}

async function buscarTipoActivoPorNombreOCodigo(valor) {
  var resultado = await config.supabase
    .from('tipos_activo')
    .select('id')
    .or(`nombre.eq."${valor}",codigo.eq."${valor}"`)
    .single();

  if (resultado.error) return null;
  return resultado.data;
}

async function crearPlantilla(campos) {
  var resultado = await config.supabase
    .from('plantillas_inspeccion')
    .insert([campos])
    .select()
    .single();

  if (resultado.error) throw resultado.error;
  return resultado.data;
}

async function actualizarPlantilla(id, campos) {
  var resultado = await config.supabase
    .from('plantillas_inspeccion')
    .update(campos)
    .eq('id', id)
    .select()
    .single();

  if (resultado.error) throw resultado.error;
  return resultado.data;
}

async function crearGrupo(campos) {
  var resultado = await config.supabase
    .from('plantilla_grupos')
    .insert([campos])
    .select()
    .single();

  if (resultado.error) throw resultado.error;
  return resultado.data;
}

async function actualizarGrupo(id, campos) {
  var resultado = await config.supabase
    .from('plantilla_grupos')
    .update(campos)
    .eq('id', id)
    .select()
    .single();

  if (resultado.error) throw resultado.error;
  return resultado.data;
}

async function eliminarGrupo(id) {
  var resultado = await config.supabase
    .from('plantilla_grupos')
    .delete()
    .eq('id', id);

  if (resultado.error) throw resultado.error;
}

async function crearItem(campos) {
  var resultado = await config.supabase
    .from('plantilla_items')
    .insert([campos])
    .select()
    .single();

  if (resultado.error) throw resultado.error;
  return resultado.data;
}

async function actualizarItem(id, campos) {
  var resultado = await config.supabase
    .from('plantilla_items')
    .update(campos)
    .eq('id', id)
    .select()
    .single();

  if (resultado.error) throw resultado.error;
  return resultado.data;
}

async function eliminarItem(id) {
  var resultado = await config.supabase
    .from('plantilla_items')
    .delete()
    .eq('id', id);

  if (resultado.error) throw resultado.error;
}

module.exports = {
  obtenerPlantillaActiva,
  obtenerPlantillaPorId,
  obtenerGruposEItems,
  listarPlantillas,
  buscarTipoActivoPorNombreOCodigo,
  crearPlantilla,
  actualizarPlantilla,
  crearGrupo,
  actualizarGrupo,
  eliminarGrupo,
  crearItem,
  actualizarItem,
  eliminarItem
};
