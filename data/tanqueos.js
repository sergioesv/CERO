// ═══════════════════════════════════════════════════════════
// data/tanqueos.js
// Capa de datos para tanqueos
// CERO — v26 — vehiculo_placa → activo_id
// Multi-tenant: funciones expuestas a rutas/ exigen tenantScope
// (primer parámetro). El filtro va por join !inner a activos.sede_id
// — las columnas sede_id denormalizadas NO se usan para seguridad.
// ═══════════════════════════════════════════════════════════

var config = require('../config/config');
var referenciaKm = require('./posoperacionales');
var tenantScope = require('../servicios/tenantScope');

var TABLA_TANQUEOS = config.TABLES.tanqueos;
var TABLA_FOTOS = process.env.DB_TABLE_FOTOS_TANQUEO || 'evidencia';

// Embed estándar del activo para queries con filtro de tenant
var EMBED_ACTIVO = 'activos:activo_id!inner(id, placa, nombre, datos, sede_id)';
var EMBED_ACTIVO_MIN = 'activos:activo_id!inner(sede_id)';

var STATS_VACIAS = {
  total: 0,
  pendientes: 0,
  anomalias: 0,
  combustible_total: { galones: 0, litros: 0 },
  galones_total: 0,
  litros_total: 0
};

async function obtenerReferenciaKilometraje(activoId) {
  return referenciaKm.obtenerReferenciaKilometraje(activoId);
}

// ─── Canal WhatsApp (activo_id ya resuelto por el flujo) — sin scope ───

async function crearTanqueo(datosTanqueo) {
  return await config.supabase
    .from(TABLA_TANQUEOS)
    .insert(datosTanqueo)
    .select()
    .single();
}

async function guardarEvidencias(tanqueoId, fotos) {
  if (!Array.isArray(fotos) || !fotos.length) {
    return { error: null, data: [] };
  }

  var filas = fotos.map(function(foto) {
    return {
      entidad_tipo: 'tanqueo',
      entidad_id: tanqueoId,
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

async function actualizarKilometrajeActivo(activoId, kilometraje) {
  return await config.supabase
    .from(config.TABLES.activos)
    .update({ kilometraje: kilometraje, updated_at: new Date().toISOString() })
    .eq('id', activoId);
}

/**
 * Obtiene el promedio histórico de rendimiento km/L de un activo.
 * Solo considera tanqueos con rendimiento_calculado válido (> 0).
 *
 * @param {string} activoId - UUID del activo
 * @returns {{ promedio: number|null }}
 */
async function obtenerRendimientoHistorico(activoId) {
  var resultado = await config.supabase
    .from(TABLA_TANQUEOS)
    .select('rendimiento_calculado')
    .eq('activo_id', activoId)
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

// ─── Panel (rutas/) — scope obligatorio ───

/**
 * Lista tanqueos con filtros opcionales y stats para el panel.
 * Join !inner a activos (filtro de tenant) y a conductores.
 * @param {Object} scope - tenantScope obligatorio
 */
async function listarTanqueos(scope, filtros) {
  tenantScope.assert(scope);
  filtros = filtros || {};

  // Si hay filtro por placa, resolver a activo_id DENTRO del scope
  var activoIdFiltro = null;
  if (filtros.placa) {
    activoIdFiltro = await tenantScope.resolverActivoPorPlaca(scope, filtros.placa);
    if (!activoIdFiltro) {
      return { data: [], stats: Object.assign({}, STATS_VACIAS) };
    }
  }

  var query = config.supabase
    .from(TABLA_TANQUEOS)
    .select([
      'id', 'created_at', 'activo_id', 'conductor_id',
      'tipo_tanqueo', 'tipo_combustible', 'cantidad', 'unidad_medida',
      'valor_total', 'precio_unitario', 'kilometraje', 'km_referencia',
      'diferencia_km', 'estacion_servicio', 'factura_numero',
      'estado_validacion', 'rendimiento_calculado', 'rendimiento_alerta',
      'discrepancias', 'validado_por', 'fecha_validacion', 'motivo_rechazo',
      EMBED_ACTIVO,
      'conductores:conductor_id(id, nombre, cedula)'
    ].join(', '))
    .order('created_at', { ascending: false });

  query = tenantScope.porActivoJoin(query, scope);

  if (filtros.fecha_inicio) query = query.gte('created_at', filtros.fecha_inicio);
  if (filtros.fecha_fin) query = query.lte('created_at', filtros.fecha_fin + 'T23:59:59Z');
  if (activoIdFiltro) query = query.eq('activo_id', activoIdFiltro);
  if (filtros.conductor_id) query = query.eq('conductor_id', filtros.conductor_id);
  if (filtros.estado_validacion && filtros.estado_validacion !== 'todos') {
    if (filtros.estado_validacion === 'revisados') {
      query = query.in('estado_validacion', ['auto_validado', 'revisado', 'validado']);
    } else {
      query = query.eq('estado_validacion', filtros.estado_validacion);
    }
  }
  if (filtros.tipo_tanqueo && filtros.tipo_tanqueo !== 'todos') {
    query = query.eq('tipo_tanqueo', filtros.tipo_tanqueo);
  }

  var resultado = await query.limit(200);
  if (resultado.error) return { error: resultado.error, data: [], stats: {} };

  // Mapear datos para compat con frontend (agregar vehiculo_placa virtual)
  var data = (resultado.data || []).map(function(t) {
    var activo = t.activos || {};
    var datos = activo.datos || {};
    t.vehiculo_placa = activo.placa || null;
    t.vehiculos = {
      placa: activo.placa || null,
      marca: datos.marca || null,
      modelo: datos.modelo || null,
      tipo: datos.tipo_vehiculo || datos.tipo || null
    };
    return t;
  });

  var stats = await obtenerStatsPeriodo(scope, filtros, activoIdFiltro);

  return { data: data, stats: stats };
}

function aplicarFiltrosBase(query, scope, filtros, activoIdFiltro) {
  query = tenantScope.porActivoJoin(query, scope);
  if (filtros.fecha_inicio) query = query.gte('created_at', filtros.fecha_inicio);
  if (filtros.fecha_fin) query = query.lte('created_at', filtros.fecha_fin + 'T23:59:59Z');
  if (activoIdFiltro) query = query.eq('activo_id', activoIdFiltro);
  if (filtros.conductor_id) query = query.eq('conductor_id', filtros.conductor_id);
  if (filtros.tipo_tanqueo && filtros.tipo_tanqueo !== 'todos') query = query.eq('tipo_tanqueo', filtros.tipo_tanqueo);
  return query;
}

async function obtenerStatsPeriodo(scope, filtros, activoIdFiltro) {
  tenantScope.assert(scope);
  filtros = filtros || {};

  var qTotal = aplicarFiltrosBase(
    config.supabase.from(TABLA_TANQUEOS).select('id, ' + EMBED_ACTIVO_MIN, { count: 'exact', head: true }),
    scope, filtros, activoIdFiltro
  );
  if (filtros.estado_validacion && filtros.estado_validacion !== 'todos') {
    if (filtros.estado_validacion === 'revisados') {
      qTotal = qTotal.in('estado_validacion', ['auto_validado', 'revisado', 'validado']);
    } else {
      qTotal = qTotal.eq('estado_validacion', filtros.estado_validacion);
    }
  }
  var resTotal = await qTotal;

  var qPendientes = aplicarFiltrosBase(
    config.supabase
      .from(TABLA_TANQUEOS)
      .select('id, ' + EMBED_ACTIVO_MIN, { count: 'exact', head: true })
      .eq('estado_validacion', 'pendiente_revision'),
    scope, filtros, activoIdFiltro
  );
  var resPendientes = await qPendientes;

  var qAnomalias = aplicarFiltrosBase(
    config.supabase
      .from(TABLA_TANQUEOS)
      .select('id, ' + EMBED_ACTIVO_MIN, { count: 'exact', head: true })
      .eq('rendimiento_alerta', true),
    scope, filtros, activoIdFiltro
  );
  var resAnomalias = await qAnomalias;

  var qGalones = aplicarFiltrosBase(
    config.supabase
      .from(TABLA_TANQUEOS)
      .select('cantidad, ' + EMBED_ACTIVO_MIN)
      .eq('unidad_medida', 'galones'),
    scope, filtros, activoIdFiltro
  );
  if (filtros.estado_validacion && filtros.estado_validacion !== 'todos') {
    if (filtros.estado_validacion === 'revisados') {
      qGalones = qGalones.in('estado_validacion', ['auto_validado', 'revisado', 'validado']);
    } else {
      qGalones = qGalones.eq('estado_validacion', filtros.estado_validacion);
    }
  }
  var resGalones = await qGalones;

  var qLitros = aplicarFiltrosBase(
    config.supabase
      .from(TABLA_TANQUEOS)
      .select('cantidad, ' + EMBED_ACTIVO_MIN)
      .eq('unidad_medida', 'litros'),
    scope, filtros, activoIdFiltro
  );
  if (filtros.estado_validacion && filtros.estado_validacion !== 'todos') {
    if (filtros.estado_validacion === 'revisados') {
      qLitros = qLitros.in('estado_validacion', ['auto_validado', 'revisado', 'validado']);
    } else {
      qLitros = qLitros.eq('estado_validacion', filtros.estado_validacion);
    }
  }
  var resLitros = await qLitros;

  if (resTotal.error || resPendientes.error || resAnomalias.error || resGalones.error || resLitros.error) {
    return Object.assign({}, STATS_VACIAS);
  }

  var galonesTotal = (resGalones.data || []).reduce(function(acc, row) {
    return acc + parseFloat(row.cantidad || 0);
  }, 0);
  var litrosTotal = (resLitros.data || []).reduce(function(acc, row) {
    return acc + parseFloat(row.cantidad || 0);
  }, 0);

  return {
    total: resTotal.count || 0,
    pendientes: resPendientes.count || 0,
    anomalias: resAnomalias.count || 0,
    combustible_total: {
      galones: parseFloat(galonesTotal.toFixed(3)),
      litros: parseFloat(litrosTotal.toFixed(3))
    },
    galones_total: parseFloat(galonesTotal.toFixed(3)),
    litros_total: parseFloat(litrosTotal.toFixed(3))
  };
}

/**
 * Obtiene el detalle completo de un tanqueo por ID — solo del tenant.
 * Incluye fotos con signed URLs de Supabase Storage.
 */
async function obtenerTanqueo(scope, id) {
  tenantScope.assert(scope);
  var query = config.supabase
    .from(TABLA_TANQUEOS)
    .select([
      '*',
      EMBED_ACTIVO,
      'conductores:conductor_id(id, nombre, cedula, licencia_categoria)'
    ].join(', '));
  query = tenantScope.porActivoJoin(query, scope);
  var resultado = await query.eq('id', id).single();

  if (resultado.error) return { error: resultado.error, data: null };

  // Mapear para compat con frontend
  var tanqueo = resultado.data;
  var activo = tanqueo.activos || {};
  var datos = activo.datos || {};
  tanqueo.vehiculo_placa = activo.placa || null;
  tanqueo.vehiculos = {
    placa: activo.placa || null,
    marca: datos.marca || null,
    modelo: datos.modelo || null,
    tipo: datos.tipo_vehiculo || datos.tipo || null,
    rendimiento_min: datos.rendimiento_min || null,
    rendimiento_max: datos.rendimiento_max || null
  };

  // Obtener fotos del tanqueo
  var resFotos = await config.supabase
    .from(TABLA_FOTOS)
    .select('id, tipo, descripcion, foto_url, created_at')
    .eq('entidad_tipo', 'tanqueo')
    .eq('entidad_id', id)
    .order('created_at');

  var fotos = resFotos.data || [];

  // Generar signed URLs para cada foto (expiran en 1 hora)
  var fotosConUrl = await Promise.all(fotos.map(async function(foto) {
    if (!foto.foto_url) return foto;
    try {
      // Si la URL ya es pública o externa, usarla directo
      if (foto.foto_url.startsWith('http')) {
        return Object.assign({}, foto, { url_firmada: foto.foto_url });
      }
      var signed = await config.supabase.storage
        .from('tanqueos')
        .createSignedUrl(foto.foto_url, 3600);
      return Object.assign({}, foto, {
        url_firmada: signed.data ? signed.data.signedUrl : foto.foto_url
      });
    } catch (_e) {
      return Object.assign({}, foto, { url_firmada: foto.foto_url });
    }
  }));

  return {
    error: null,
    data: Object.assign({}, tanqueo, { fotos: fotosConUrl })
  };
}

/**
 * Valida o rechaza un tanqueo individualmente — solo del tenant.
 * El check previo lleva el join de tenant: un tanqueo ajeno responde
 * "no encontrado" y el UPDATE nunca se ejecuta.
 */
async function validarTanqueo(scope, id, decision, notasAdmin, usuarioId) {
  tenantScope.assert(scope);
  var estadosPermitidos = ['pendiente_revision', 'auto_validado'];

  var qCheck = config.supabase
    .from(TABLA_TANQUEOS)
    .select('id, estado_validacion, ' + EMBED_ACTIVO_MIN);
  qCheck = tenantScope.porActivoJoin(qCheck, scope);
  var resActual = await qCheck.eq('id', id).single();

  if (resActual.error || !resActual.data) {
    return { ok: false, error: 'Tanqueo no encontrado' };
  }

  if (estadosPermitidos.indexOf(resActual.data.estado_validacion) === -1) {
    return { ok: false, error: 'El tanqueo ya fue procesado' };
  }

  if (decision !== 'validar') {
    return { ok: false, error: 'Decisión no soportada' };
  }

  var campos = {
    estado_validacion: 'revisado',
    validado_por: usuarioId || 'panel',
    fecha_validacion: new Date().toISOString(),
    notas_admin: (notasAdmin || '').trim() || null,
    motivo_rechazo: null
  };

  var res = await config.supabase
    .from(TABLA_TANQUEOS)
    .update(campos)
    .eq('id', id);

  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true };
}

/**
 * Valida en lote tanqueos con estado auto_validado — solo del tenant.
 * Los ids ajenos se descartan en silencio (no revelan existencia).
 */
async function validarLote(scope, ids, usuarioId) {
  tenantScope.assert(scope);
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: 'IDs requeridos' };
  }

  var qPropios = config.supabase
    .from(TABLA_TANQUEOS)
    .select('id, ' + EMBED_ACTIVO_MIN)
    .in('id', ids)
    .eq('estado_validacion', 'auto_validado');
  qPropios = tenantScope.porActivoJoin(qPropios, scope);
  var resPropios = await qPropios;

  if (resPropios.error) return { ok: false, error: resPropios.error.message, procesados: 0 };

  var idsPropios = (resPropios.data || []).map(function(r) { return r.id; });
  if (idsPropios.length === 0) {
    return { ok: true, procesados: 0 };
  }

  var res = await config.supabase
    .from(TABLA_TANQUEOS)
    .update({
      estado_validacion: 'validado',
      validado_por: usuarioId || 'panel',
      fecha_validacion: new Date().toISOString()
    })
    .in('id', idsPropios)
    .eq('estado_validacion', 'auto_validado');

  if (res.error) return { ok: false, error: res.error.message, procesados: 0 };
  return { ok: true, procesados: idsPropios.length };
}

/**
 * Consolidado mensual de tanqueos validados — solo del tenant.
 * sedeId opcional para acotar; se valida contra el scope (403 si ajena).
 * El filtro va por la sede del ACTIVO, no por tanqueos.sede_id.
 */
async function obtenerConsolidado(scope, mes, sedeId) {
  tenantScope.assert(scope);
  sedeId = tenantScope.validarSedeSolicitada(scope, sedeId || null);

  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    return { error: 'Formato de mes inválido. Use YYYY-MM' };
  }

  var inicio = mes + '-01T00:00:00Z';
  var partes = mes.split('-');
  var anio = parseInt(partes[0], 10);
  var mesNum = parseInt(partes[1], 10);
  var siguienteMes = mesNum === 12
    ? (anio + 1) + '-01-01T00:00:00Z'
    : anio + '-' + String(mesNum + 1).padStart(2, '0') + '-01T00:00:00Z';

  var query = config.supabase
    .from(TABLA_TANQUEOS)
    .select([
      'id', 'activo_id', 'tipo_tanqueo', 'tipo_combustible',
      'cantidad', 'unidad_medida', 'valor_total', 'kilometraje',
      'rendimiento_calculado', 'estado_validacion', 'created_at',
      'factura_numero', 'estacion_servicio', 'conductor_id',
      'conductores:conductor_id(nombre)',
      EMBED_ACTIVO
    ].join(', '))
    .gte('created_at', inicio)
    .lt('created_at', siguienteMes)
    .in('estado_validacion', ['revisado', 'auto_validado', 'validado'])
    .order('activo_id')
    .order('created_at');

  if (sedeId) {
    query = query.eq('activos.sede_id', sedeId);
  } else {
    query = tenantScope.porActivoJoin(query, scope);
  }

  var resultado = await query;
  if (resultado.error) return { error: resultado.error.message };

  var data = resultado.data || [];

  // Agrupar por activo (usando activo_id como key)
  var porVehiculo = {};
  data.forEach(function(t) {
    var activo = t.activos || {};
    var datos = activo.datos || {};
    var placa = activo.placa || t.activo_id;
    if (!porVehiculo[placa]) {
      porVehiculo[placa] = {
        placa: activo.placa || null,
        marca: datos.marca || null,
        modelo: datos.modelo || null,
        tipo: datos.tipo_vehiculo || datos.tipo || null,
        tanqueos: 0,
        total_galones: 0,
        total_litros: 0,
        total_pesos: 0,
        rendimientos: [],
        rendimiento_promedio: null
      };
    }
    var v = porVehiculo[placa];
    v.tanqueos++;
    if (t.unidad_medida === 'galones') v.total_galones += parseFloat(t.cantidad || 0);
    else v.total_litros += parseFloat(t.cantidad || 0);
    v.total_pesos += parseFloat(t.valor_total || 0);
    if (t.rendimiento_calculado) v.rendimientos.push(parseFloat(t.rendimiento_calculado));

    // Agregar vehiculo_placa virtual para compat frontend
    t.vehiculo_placa = activo.placa || null;
  });

  // Calcular promedios y redondear
  var listaVehiculos = Object.values(porVehiculo).map(function(v) {
    if (v.rendimientos.length > 0) {
      var suma = v.rendimientos.reduce(function(a, b) { return a + b; }, 0);
      v.rendimiento_promedio = parseFloat((suma / v.rendimientos.length).toFixed(2));
    }
    delete v.rendimientos;
    v.total_galones = parseFloat(v.total_galones.toFixed(3));
    v.total_litros = parseFloat(v.total_litros.toFixed(3));
    v.total_pesos = parseFloat(v.total_pesos.toFixed(0));
    return v;
  });

  // Resumen global
  var resumen = {
    mes: mes,
    total_tanqueos: data.length,
    total_pesos: parseFloat(listaVehiculos.reduce(function(a, v) { return a + v.total_pesos; }, 0).toFixed(0)),
    total_galones: parseFloat(listaVehiculos.reduce(function(a, v) { return a + v.total_galones; }, 0).toFixed(3)),
    total_litros: parseFloat(listaVehiculos.reduce(function(a, v) { return a + v.total_litros; }, 0).toFixed(3)),
    convenio: data.filter(function(t) { return t.tipo_tanqueo === 'convenio'; }).length,
    emergencia: data.filter(function(t) { return t.tipo_tanqueo === 'emergencia'; }).length,
    precio_promedio_galon: null
  };

  if (resumen.total_galones > 0) {
    resumen.precio_promedio_galon = parseFloat((resumen.total_pesos / resumen.total_galones).toFixed(0));
  }

  return { resumen: resumen, porVehiculo: listaVehiculos, detalle: data };
}

/**
 * Guarda datos OCR en la tabla tanqueos_ocr.
 * Solo inserta si al menos un campo OCR tiene valor.
 * Canal WhatsApp — sin scope (tanqueo recién creado por el flujo).
 *
 * @param {string} tanqueoId - UUID del tanqueo
 * @param {Object} datosOcr - Objeto con campos OCR extraídos
 * @returns {Object|null} - Registro insertado o null si no había datos
 */
async function guardarDatosOcr(tanqueoId, datosOcr) {
  var camposOcr = {
    factura_numero_ocr: datosOcr.factura_numero_ocr,
    placa_ocr_factura: datosOcr.placa_ocr_factura,
    placa_ocr_foto: datosOcr.placa_ocr_foto,
    km_ocr_factura: datosOcr.km_ocr_factura,
    km_ocr_odometro: datosOcr.km_ocr_odometro,
    cantidad_ocr: datosOcr.cantidad_ocr,
    datos_brutos: datosOcr.datos_ocr_factura,
    score_ocr_global: datosOcr.score_ocr_global,
    tier_ocr: datosOcr.tier_ocr,
    discrepancias: datosOcr.discrepancias,
    estado_validacion: datosOcr.estado_validacion,
    validado_por: datosOcr.validado_por,
    fecha_validacion: datosOcr.fecha_validacion,
    motivo_rechazo: datosOcr.motivo_rechazo,
    revisado_por: datosOcr.revisado_por,
    fecha_revision: datosOcr.fecha_revision,
    notas_admin: datosOcr.notas_admin,
  };
  var hayDatosOcr = Object.values(camposOcr).some(function(v) {
    return v !== undefined && v !== null;
  });
  if (!hayDatosOcr) return null;
  var payload = Object.assign({ tanqueo_id: tanqueoId }, camposOcr);
  var resultado = await config.supabase
    .from('tanqueos_ocr')
    .insert(payload)
    .select()
    .single();
  if (resultado.error) throw resultado.error;
  return resultado.data;
}


/**
 * Obtiene la URL de una foto de evidencia de tanqueo por ID — solo del tenant.
 * Usado por el endpoint de proxy de fotos Twilio. La pertenencia se
 * verifica vía el tanqueo dueño de la foto (cierra IDOR del proxy).
 */
async function obtenerFotoEvidencia(scope, fotoId) {
  tenantScope.assert(scope);
  var resultado = await config.supabase
    .from('evidencia')
    .select('foto_url, entidad_id')
    .eq('entidad_tipo', 'tanqueo')
    .eq('id', fotoId)
    .maybeSingle();

  if (resultado.error) throw resultado.error;
  if (!resultado.data) return null;

  var qDueno = config.supabase
    .from(TABLA_TANQUEOS)
    .select('id, ' + EMBED_ACTIVO_MIN)
    .eq('id', resultado.data.entidad_id);
  qDueno = tenantScope.porActivoJoin(qDueno, scope);
  var resDueno = await qDueno.maybeSingle();

  if (resDueno.error || !resDueno.data) return null;
  return resultado.data;
}

module.exports = {
  TABLA_TANQUEOS: TABLA_TANQUEOS,
  TABLA_FOTOS: TABLA_FOTOS,
  obtenerReferenciaKilometraje: obtenerReferenciaKilometraje,
  crearTanqueo: crearTanqueo,
  guardarEvidencias: guardarEvidencias,
  guardarDatosOcr: guardarDatosOcr,
  actualizarKilometrajeActivo: actualizarKilometrajeActivo,
  obtenerRendimientoHistorico: obtenerRendimientoHistorico,
  listarTanqueos: listarTanqueos,
  obtenerStatsPeriodo: obtenerStatsPeriodo,
  obtenerTanqueo: obtenerTanqueo,
  validarTanqueo: validarTanqueo,
  validarLote: validarLote,
  obtenerConsolidado: obtenerConsolidado,
  obtenerFotoEvidencia: obtenerFotoEvidencia
};
