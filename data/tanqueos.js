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

/**
 * Lista tanqueos con filtros opcionales y stats para el panel.
 * Join a vehiculos y conductores.
 *
 * @param {Object} filtros — { fecha_inicio, fecha_fin, placa, conductor_id, estado_validacion, tipo_tanqueo }
 * @returns {{ data: Array, stats: Object }}
 */
async function listarTanqueos(filtros) {
  filtros = filtros || {};

  var query = config.supabase
    .from(TABLA_TANQUEOS)
    .select([
      'id', 'created_at', 'vehiculo_placa', 'conductor_id',
      'tipo_tanqueo', 'tipo_combustible', 'cantidad', 'unidad_medida',
      'valor_total', 'precio_unitario', 'kilometraje', 'km_referencia',
      'diferencia_km', 'estacion_servicio', 'factura_numero',
      'estado_validacion', 'rendimiento_calculado', 'rendimiento_alerta',
      'discrepancias', 'validado_por', 'fecha_validacion', 'motivo_rechazo',
      'vehiculos:vehiculo_placa(placa, marca, modelo, tipo)',
      'conductores:conductor_id(id, nombre, cedula)'
    ].join(', '))
    .order('created_at', { ascending: false });

  if (filtros.fecha_inicio) query = query.gte('created_at', filtros.fecha_inicio);
  if (filtros.fecha_fin) query = query.lte('created_at', filtros.fecha_fin + 'T23:59:59Z');
  if (filtros.placa) query = query.eq('vehiculo_placa', filtros.placa.toUpperCase());
  if (filtros.conductor_id) query = query.eq('conductor_id', filtros.conductor_id);
  if (filtros.estado_validacion && filtros.estado_validacion !== 'todos') {
    query = query.eq('estado_validacion', filtros.estado_validacion);
  }
  if (filtros.tipo_tanqueo && filtros.tipo_tanqueo !== 'todos') {
    query = query.eq('tipo_tanqueo', filtros.tipo_tanqueo);
  }

  var resultado = await query.limit(200);
  if (resultado.error) return { error: resultado.error, data: [], stats: {} };

  // Stats calculadas sobre el período filtrado
  // Fecha de hoy en zona horaria Colombia (UTC-5)
  var ahora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  var hoy = ahora.toISOString().split('T')[0];
  var data = resultado.data || [];

  // created_at viene en UTC — convertir antes de comparar
  var tanqueosHoy = data.filter(function(t) {
    if (!t.created_at) return false;
    var fechaBogota = new Date(new Date(t.created_at).toLocaleString('en-US', { timeZone: 'America/Bogota' })).toISOString().split('T')[0];
    return fechaBogota === hoy;
  });

  var stats = {
    total: data.length,
    hoy: tanqueosHoy.length,
    galones_hoy: tanqueosHoy.reduce(function(acc, t) {
      return acc + (t.unidad_medida === 'galones' ? parseFloat(t.cantidad || 0) : 0);
    }, 0),
    pendientes: data.filter(function(t) {
      return t.estado_validacion === 'pendiente_revision';
    }).length,
    anomalias: data.filter(function(t) {
      return t.rendimiento_alerta === true;
    }).length
  };

  return { data: data, stats: stats };
}

/**
 * Obtiene el detalle completo de un tanqueo por ID.
 * Incluye fotos con signed URLs de Supabase Storage.
 *
 * @param {string} id — UUID del tanqueo
 * @returns {Object} tanqueo con fotos
 */
async function obtenerTanqueo(id) {
  var resultado = await config.supabase
    .from(TABLA_TANQUEOS)
    .select([
      '*',
      'vehiculos:vehiculo_placa(placa, marca, modelo, tipo, rendimiento_min, rendimiento_max)',
      'conductores:conductor_id(id, nombre, cedula, licencia_categoria)'
    ].join(', '))
    .eq('id', id)
    .single();

  if (resultado.error) return { error: resultado.error, data: null };

  // Obtener fotos del tanqueo
  var resFotos = await config.supabase
    .from(TABLA_FOTOS)
    .select('id, tipo, descripcion, foto_url, created_at')
    .eq('tanqueo_id', id)
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
    } catch (e) {
      return Object.assign({}, foto, { url_firmada: foto.foto_url });
    }
  }));

  return {
    error: null,
    data: Object.assign({}, resultado.data, { fotos: fotosConUrl })
  };
}

/**
 * Valida o rechaza un tanqueo individualmente.
 * Solo permite operar sobre pendiente_revision o auto_validado.
 *
 * @param {string} id — UUID del tanqueo
 * @param {string} decision — 'validar' | 'rechazar'
 * @param {string} motivoRechazo — obligatorio si decision = 'rechazar'
 * @param {string} usuarioId — quien toma la decisión
 * @returns {{ ok: boolean, error?: string }}
 */
async function validarTanqueo(id, decision, motivoRechazo, usuarioId) {
  var estadosPermitidos = ['pendiente_revision', 'auto_validado'];

  // Verificar que el tanqueo existe y está en estado operable
  var resActual = await config.supabase
    .from(TABLA_TANQUEOS)
    .select('id, estado_validacion')
    .eq('id', id)
    .single();

  if (resActual.error || !resActual.data) {
    return { ok: false, error: 'Tanqueo no encontrado' };
  }

  if (estadosPermitidos.indexOf(resActual.data.estado_validacion) === -1) {
    return { ok: false, error: 'El tanqueo ya fue procesado' };
  }

  if (decision === 'rechazar' && (!motivoRechazo || motivoRechazo.trim().length < 5)) {
    return { ok: false, error: 'Motivo de rechazo obligatorio (mín 5 caracteres)' };
  }

  var campos = {
    estado_validacion: decision === 'validar' ? 'validado' : 'rechazado',
    validado_por: usuarioId || 'panel',
    fecha_validacion: new Date().toISOString(),
    motivo_rechazo: decision === 'rechazar' ? (motivoRechazo || '').trim() : null
  };

  var res = await config.supabase
    .from(TABLA_TANQUEOS)
    .update(campos)
    .eq('id', id);

  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true };
}

/**
 * Valida en lote tanqueos con estado auto_validado.
 * Solo opera sobre auto_validado — ignora otros estados silenciosamente.
 *
 * @param {string[]} ids — array de UUIDs
 * @param {string} usuarioId — quien valida
 * @returns {{ ok: boolean, procesados: number, error?: string }}
 */
async function validarLote(ids, usuarioId) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: 'IDs requeridos' };
  }

  // Contar cuántos están realmente en estado operable antes de actualizar
  var resConteo = await config.supabase
    .from(TABLA_TANQUEOS)
    .select('id', { count: 'exact', head: true })
    .in('id', ids)
    .eq('estado_validacion', 'auto_validado');

  var procesados = resConteo.count || 0;

  if (procesados === 0) {
    return { ok: true, procesados: 0 };
  }

  var res = await config.supabase
    .from(TABLA_TANQUEOS)
    .update({
      estado_validacion: 'validado',
      validado_por: usuarioId || 'panel',
      fecha_validacion: new Date().toISOString()
    })
    .in('id', ids)
    .eq('estado_validacion', 'auto_validado');

  if (res.error) return { ok: false, error: res.error.message, procesados: 0 };
  return { ok: true, procesados: procesados };
}

/**
 * Obtiene el consolidado mensual de tanqueos validados.
 * Agrupa por vehículo. Solo incluye validado y auto_validado.
 *
 * @param {string} mes — formato YYYY-MM
 * @param {string|null} sedeId — filtro opcional por sede
 * @returns {{ resumen: Object, porVehiculo: Array }}
 */
async function obtenerConsolidado(mes, sedeId) {
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
      'id', 'vehiculo_placa', 'tipo_tanqueo', 'tipo_combustible',
      'cantidad', 'unidad_medida', 'valor_total', 'kilometraje',
      'rendimiento_calculado', 'estado_validacion', 'created_at',
      'factura_numero', 'estacion_servicio', 'conductor_id',
      'conductores:conductor_id(nombre)',
      'vehiculos:vehiculo_placa(marca, modelo, tipo)'
    ].join(', '))
    .gte('created_at', inicio)
    .lt('created_at', siguienteMes)
    .in('estado_validacion', ['validado', 'auto_validado'])
    .order('vehiculo_placa')
    .order('created_at');

  if (sedeId) query = query.eq('sede_id', sedeId);

  var resultado = await query;
  if (resultado.error) return { error: resultado.error.message };

  var data = resultado.data || [];

  // Agrupar por vehículo
  var porVehiculo = {};
  data.forEach(function(t) {
    var placa = t.vehiculo_placa;
    if (!porVehiculo[placa]) {
      porVehiculo[placa] = {
        placa: placa,
        marca: t.vehiculos ? t.vehiculos.marca : null,
        modelo: t.vehiculos ? t.vehiculos.modelo : null,
        tipo: t.vehiculos ? t.vehiculos.tipo : null,
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

module.exports = {
  TABLA_TANQUEOS: TABLA_TANQUEOS,
  TABLA_FOTOS: TABLA_FOTOS,
  obtenerReferenciaKilometraje: obtenerReferenciaKilometraje,
  crearTanqueo: crearTanqueo,
  guardarFotosTanqueo: guardarFotosTanqueo,
  actualizarKilometrajeVehiculo: actualizarKilometrajeVehiculo,
  obtenerRendimientoHistorico: obtenerRendimientoHistorico,
  listarTanqueos: listarTanqueos,
  obtenerTanqueo: obtenerTanqueo,
  validarTanqueo: validarTanqueo,
  validarLote: validarLote,
  obtenerConsolidado: obtenerConsolidado
};


