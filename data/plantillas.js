'use strict';

var config = require('../config/config');
var supabase = config.supabase;
var tenantScope = require('../servicios/tenantScope');

// ─── Helpers de pertenencia (multi-tenant) ───
// Las plantillas globales (empresa_id null) son de plataforma:
// solo superadmin las modifica. Las de empresa, solo su empresa.

async function assertPlantillaEnScope(scope, plantillaId) {
  tenantScope.assert(scope);
  var res = await supabase
    .from('plantillas_inspeccion')
    .select('id, empresa_id')
    .eq('id', plantillaId)
    .maybeSingle();
  if (res.error) throw res.error;
  if (!res.data) {
    var e404 = new Error('Plantilla no encontrada');
    e404.status = 404;
    throw e404;
  }
  if (scope.esSistema) return res.data;
  if (res.data.empresa_id === null) {
    if (scope.esSuperadmin) return res.data;
    var eGlobal = new Error('Plantilla global — solo superadmin de plataforma puede modificarla');
    eGlobal.status = 403;
    throw eGlobal;
  }
  if (res.data.empresa_id !== scope.empresaId && !scope.esSuperadmin) {
    var eAjena = new Error('Plantilla fuera del alcance del usuario');
    eAjena.status = 403;
    throw eAjena;
  }
  return res.data;
}

async function plantillaIdDeGrupo(grupoId) {
  var res = await supabase
    .from('plantilla_grupos')
    .select('plantilla_id')
    .eq('id', grupoId)
    .maybeSingle();
  if (res.error) throw res.error;
  if (!res.data) {
    var e = new Error('Grupo no encontrado');
    e.status = 404;
    throw e;
  }
  return res.data.plantilla_id;
}

async function grupoIdDeItem(itemId) {
  var res = await supabase
    .from('plantilla_items')
    .select('grupo_id')
    .eq('id', itemId)
    .maybeSingle();
  if (res.error) throw res.error;
  if (!res.data) {
    var e = new Error('Item no encontrado');
    e.status = 404;
    throw e;
  }
  return res.data.grupo_id;
}

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


async function listarPlantillas(scope) {
  tenantScope.assert(scope);
  var query = config.supabase
    .from('plantillas_inspeccion')
    .select('*, tipos_activo (nombre, codigo)')
    .order('created_at', { ascending: false });
  // Globales + de la propia empresa; superadmin/sistema ven todas
  if (!scope.esSistema && !scope.esSuperadmin) {
    query = query.or('empresa_id.is.null,empresa_id.eq.' + scope.empresaId);
  }
  var resultado = await query;

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

async function crearPlantilla(scope, campos) {
  tenantScope.assert(scope);
  // Usuario normal: la plantilla nace de SU empresa, ignore lo que
  // diga el body. Superadmin puede crear globales (empresa_id null).
  if (scope.esSuperadmin || scope.esSistema) {
    campos.empresa_id = campos.empresa_id !== undefined ? campos.empresa_id : null;
  } else {
    campos.empresa_id = scope.empresaId;
  }
  var resultado = await config.supabase
    .from('plantillas_inspeccion')
    .insert([campos])
    .select()
    .single();

  if (resultado.error) throw resultado.error;
  return resultado.data;
}

async function actualizarPlantilla(scope, id, campos) {
  await assertPlantillaEnScope(scope, id);
  var resultado = await config.supabase
    .from('plantillas_inspeccion')
    .update(campos)
    .eq('id', id)
    .select()
    .single();

  if (resultado.error) throw resultado.error;
  return resultado.data;
}

async function crearGrupo(scope, campos) {
  await assertPlantillaEnScope(scope, campos.plantilla_id);
  var resultado = await config.supabase
    .from('plantilla_grupos')
    .insert([campos])
    .select()
    .single();

  if (resultado.error) throw resultado.error;
  return resultado.data;
}

async function actualizarGrupo(scope, id, campos) {
  await assertPlantillaEnScope(scope, await plantillaIdDeGrupo(id));
  var resultado = await config.supabase
    .from('plantilla_grupos')
    .update(campos)
    .eq('id', id)
    .select()
    .single();

  if (resultado.error) throw resultado.error;
  return resultado.data;
}

async function eliminarGrupo(scope, id) {
  await assertPlantillaEnScope(scope, await plantillaIdDeGrupo(id));
  var resultado = await config.supabase
    .from('plantilla_grupos')
    .delete()
    .eq('id', id);

  if (resultado.error) throw resultado.error;
}

async function crearItem(scope, campos) {
  await assertPlantillaEnScope(scope, await plantillaIdDeGrupo(campos.grupo_id));
  var resultado = await config.supabase
    .from('plantilla_items')
    .insert([campos])
    .select()
    .single();

  if (resultado.error) throw resultado.error;
  return resultado.data;
}

async function actualizarItem(scope, id, campos) {
  await assertPlantillaEnScope(scope, await plantillaIdDeGrupo(await grupoIdDeItem(id)));
  var resultado = await config.supabase
    .from('plantilla_items')
    .update(campos)
    .eq('id', id)
    .select()
    .single();

  if (resultado.error) throw resultado.error;
  return resultado.data;
}

async function eliminarItem(scope, id) {
  await assertPlantillaEnScope(scope, await plantillaIdDeGrupo(await grupoIdDeItem(id)));
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


