// ═══════════════════════════════════════════════════════════
// data/dashboard.js
// Lógica de agregación para el dashboard de seguridad operativa (v16)
// Consultas Supabase, KPIs, índice, anomalías y series temporales
// ═══════════════════════════════════════════════════════════

'use strict';

const { supabase } = require('../config/config');

const PESOS_INDICE_DEFAULT = {
  cumplimiento: 30,
  bloqueos: 25,
  documentos: 20,
  novedades: 15,
  tiempo: 10
};

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// ─── Fechas zona Colombia (America/Bogota) consistente con el resto del backend ───

/**
 * Fecha YYYY-MM-DD actual en Colombia.
 */
function fechaHoyColombia() {
  var ahora = new Date();
  return ahora.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

/**
 * Convierte Date a YYYY-MM-DD en Bogotá.
 */
function aYmdBogota(d) {
  return new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

/**
 * Suma días a un string YYYY-MM-DD (calendario civil).
 */
function sumarDiasYmd(ymd, dias) {
  var p = ymd.split('-').map(function (x) { return parseInt(x, 10); });
  var dt = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  dt.setUTCDate(dt.getUTCDate() + dias);
  return dt.toISOString().slice(0, 10);
}

/**
 * Lunes de la semana calendario que contiene `ymd` (YYYY-MM-DD) en semanas Lun-Dom.
 */
function lunesDeSemanaConteniendo(ymd) {
  var p = ymd.split('-').map(function (x) { return parseInt(x, 10); });
  var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  var dow = d.getUTCDay(); // 0 dom … 6 sáb (sobre la fecha UTC construida)
  var offset = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/**
 * Primer día del mes de `ymd`.
 */
function primerDiaMes(ymd) {
  return ymd.slice(0, 7) + '-01';
}

/**
 * periodo: hoy | semana | mes → { inicio, fin } como YYYY-MM-DD (Bogotá).
 */
function rangoPeriodo(periodo) {
  var hoy = fechaHoyColombia();
  if (periodo === 'hoy') {
    return { inicio: hoy, fin: hoy };
  }
  if (periodo === 'mes') {
    return { inicio: primerDiaMes(hoy), fin: hoy };
  }
  // semana (default): lunes actual hasta hoy
  return { inicio: lunesDeSemanaConteniendo(hoy), fin: hoy };
}

/**
 * Días hábiles (lun-vie) entre dos YYYY-MM-DD inclusive.
 */
function diasHabilesEntre(inicioYmd, finYmd) {
  var n = 0;
  var cur = inicioYmd;
  while (cur <= finYmd) {
    var p = cur.split('-').map(function (x) { return parseInt(x, 10); });
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    var dow = d.getUTCDay();
    if (dow >= 1 && dow <= 5) n++;
    cur = sumarDiasYmd(cur, 1);
  }
  return Math.max(1, n);
}

/**
 * Días hábiles en los últimos `n` días calendario hasta `hastaYmd`.
 */
function diasHabilesUltimos(hastaYmd, nCalendario) {
  var inicio = sumarDiasYmd(hastaYmd, -(nCalendario - 1));
  return diasHabilesEntre(inicio, hastaYmd);
}

// ─── Contexto sede / JWT ───

/**
 * Resuelve lista de sedes aplicables al usuario (JWT: sedes[] o todas las de empresa_id).
 */
async function resolverSedeIds(usuario) {
  var u = usuario || {};
  if (Array.isArray(u.sedes) && u.sedes.length) {
    return u.sedes.filter(Boolean);
  }
  if (u.empresa_id) {
    var r = await supabase.from('sedes').select('id').eq('empresa_id', u.empresa_id).eq('activa', true);
    if (r.error) return [];
    return (r.data || []).map(function (x) { return x.id; });
  }
  // Superadmin de plataforma sin sedes explícitas: todas las sedes activas
  if (Array.isArray(u.roles) && u.roles.indexOf('superadmin_plataforma') !== -1) {
    var r2 = await supabase.from('sedes').select('id').eq('activa', true);
    if (r2.error) return [];
    return (r2.data || []).map(function (x) { return x.id; });
  }
  return [];
}

/**
 * Nombres de empresa y sede (primera sede del filtro) para cabecera del dashboard.
 */
async function obtenerNombreEmpresaSede(sedeIds) {
  if (!sedeIds.length) {
    return { empresa: '', sede: '' };
  }
  var r = await supabase
    .from('sedes')
    .select('nombre, empresas(nombre)')
    .eq('id', sedeIds[0])
    .maybeSingle();

  if (r.error || !r.data) {
    return { empresa: '', sede: '' };
  }
  return {
    empresa: (r.data.empresas && r.data.empresas.nombre) || '',
    sede: r.data.nombre || ''
  };
}

/**
 * Lee un valor de configuracion_sede por sede y clave (numérico o JSON).
 */
async function obtenerConfiguracionSede(sedeId, clave) {
  if (!sedeId || !clave) return null;
  var r = await supabase
    .from('configuracion_sede')
    .select('valor')
    .eq('sede_id', sedeId)
    .eq('clave', clave)
    .maybeSingle();

  if (r.error || !r.data) return null;
  return r.data.valor;
}

async function obtenerConfigNumerica(sedeId, clave, def) {
  var v = await obtenerConfiguracionSede(sedeId, clave);
  if (v === null || v === undefined) return def;
  var n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? def : n;
}

/**
 * Pesos del índice desde JSON en BD o por defecto.
 */
async function obtenerPesosIndice(sedeId) {
  var raw = await obtenerConfiguracionSede(sedeId, 'indice_seguridad_pesos');
  if (!raw) return Object.assign({}, PESOS_INDICE_DEFAULT);
  var obj = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch (_e) {
      return Object.assign({}, PESOS_INDICE_DEFAULT);
    }
  }
  return {
    cumplimiento: obj.cumplimiento != null ? Number(obj.cumplimiento) : PESOS_INDICE_DEFAULT.cumplimiento,
    bloqueos: obj.bloqueos != null ? Number(obj.bloqueos) : PESOS_INDICE_DEFAULT.bloqueos,
    documentos: obj.documentos != null ? Number(obj.documentos) : PESOS_INDICE_DEFAULT.documentos,
    novedades: obj.novedades != null ? Number(obj.novedades) : PESOS_INDICE_DEFAULT.novedades,
    tiempo: obj.tiempo != null ? Number(obj.tiempo) : PESOS_INDICE_DEFAULT.tiempo
  };
}

// ─── Vehículos / placas por sede ───

async function obtenerPlacasSede(sedeIds) {
  if (!sedeIds.length) return [];
  var r = await supabase
    .from('vehiculos')
    .select('placa')
    .in('sede_id', sedeIds)
    .neq('estado', 'retirado');

  if (r.error) return [];
  return (r.data || []).map(function (v) { return v.placa; }).filter(Boolean);
}

// ─── Novedades — severidad unificada ───

/**
 * Considera bloqueo: severidad persistida v12+ o novedad crítica legada sin severidad.
 */
function esNovedadBloqueo(n) {
  if (!n) return false;
  if (n.severidad === 'bloqueo') return true;
  if (n.severidad === 'alerta' || n.severidad === 'informativo') return false;
  return !!n.critico;
}

function severidadInferida(n) {
  if (n.severidad === 'bloqueo' || n.severidad === 'alerta' || n.severidad === 'informativo') {
    return n.severidad;
  }
  if (n.critico) return 'bloqueo';
  return 'informativo';
}

/**
 * Parsea novedades de forma segura — puede venir como array, string JSON u objeto.
 */
function parsearNovedades(novedades) {
  if (Array.isArray(novedades)) return novedades;
  if (!novedades) return [];
  if (typeof novedades === 'string') {
    try {
      var p = JSON.parse(novedades);
      return Array.isArray(p) ? p : [];
    } catch (_e) {
      return [];
    }
  }
  return [];
}

function preopTieneBloqueo(novedades) {
  return parsearNovedades(novedades).some(esNovedadBloqueo);
}

function esDecisionAutorizado(decision) {
  return decision === 'autorizar' || decision === 'autorizado';
}

// ─── Documentación vehículos ───

function docVigente(fechaVenc) {
  if (!fechaVenc) return false;
  var hoy = fechaHoyColombia();
  return String(fechaVenc) >= hoy;
}

function docPorVencer30Dias(fechaVenc) {
  if (!fechaVenc) return false;
  var hoy = fechaHoyColombia();
  if (String(fechaVenc) < hoy) return false;
  var lim = sumarDiasYmd(hoy, 30);
  return String(fechaVenc) <= lim;
}

async function metricasDocumentacion(sedeIds) {
  var placas = await obtenerPlacasSede(sedeIds);
  if (!placas.length) {
    return { alDiaPct: 0, porVencer: 0, total: 0 };
  }
  var r = await supabase
    .from('vehiculos')
    .select('placa, soat_vencimiento, tecnomecanica_vencimiento, bloqueado')
    .in('placa', placas);

  if (r.error) return { alDiaPct: 0, porVencer: 0, total: 0 };

  var rows = r.data || [];
  var total = rows.length;
  var alDia = 0;
  var porVencer = 0;

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (docVigente(row.soat_vencimiento) && docVigente(row.tecnomecanica_vencimiento)) {
      alDia++;
    }
    var p1 = docPorVencer30Dias(row.soat_vencimiento);
    var p2 = docPorVencer30Dias(row.tecnomecanica_vencimiento);
    if (p1 || p2) porVencer++;
  }

  return {
    alDiaPct: total ? Math.round((alDia / total) * 100) : 0,
    porVencer: porVencer,
    total: total
  };
}

// ─── Activos (tabla genérica) ───

async function contarActivosPorEstado(sedeIds, tipoCodigo) {
  if (!sedeIds.length) {
    return { operativos: 0, totalActivos: 0, fueraServicio: 0 };
  }

  var q = supabase
    .from('activos')
    .select('id, estado, tipo_activo_id, tipos_activo(codigo)')
    .in('sede_id', sedeIds)
    .eq('activo', true);

  var r = await q;
  if (r.error) {
    return { operativos: 0, totalActivos: 0, fueraServicio: 0 };
  }

  var rows = r.data || [];
  if (tipoCodigo && tipoCodigo !== 'todos') {
    rows = rows.filter(function (a) {
      return a.tipos_activo && a.tipos_activo.codigo === tipoCodigo;
    });
  }

  var total = rows.length;
  var op = rows.filter(function (a) { return (a.estado || '').toLowerCase() === 'operativo'; }).length;
  return {
    operativos: op,
    totalActivos: total,
    fueraServicio: Math.max(0, total - op)
  };
}

// ─── Consultas por período ───

async function fetchPreoperacionalesRango(sedeIds, inicioYmd, finYmd) {
  var placas = await obtenerPlacasSede(sedeIds);
  if (!placas.length) return [];
  var r = await supabase
    .from('preoperacionales')
    .select('id, fecha, hora, vehiculo_placa, novedades')
    .in('vehiculo_placa', placas)
    .gte('fecha', inicioYmd)
    .lte('fecha', finYmd)
    .order('fecha', { ascending: false })
    .order('hora', { ascending: false })
    .limit(5000);

  if (r.error) return [];
  return r.data || [];
}

async function fetchAutorizacionesRango(sedeIds, inicioIso, finIso) {
  var placas = await obtenerPlacasSede(sedeIds);
  if (!placas.length) return [];
  var r = await supabase
    .from('autorizaciones_novedad')
    .select('id, vehiculo_placa, decision, novedades_bloqueo, timestamp_alerta, timestamp_decision')
    .in('vehiculo_placa', placas)
    .gte('timestamp_alerta', inicioIso)
    .lte('timestamp_alerta', finIso)
    .limit(3000);

  if (r.error) return [];
  return r.data || [];
}

/**
 * Autorizaciones para series mensuales: ventana más amplia en timestamp_alerta.
 */
async function fetchAutorizacionesDesde(sedeIds, desdeIso) {
  var placas = await obtenerPlacasSede(sedeIds);
  if (!placas.length) return [];
  var r = await supabase
    .from('autorizaciones_novedad')
    .select('id, vehiculo_placa, decision, timestamp_alerta, timestamp_decision')
    .in('vehiculo_placa', placas)
    .gte('timestamp_alerta', desdeIso)
    .limit(8000);

  if (r.error) return [];
  return r.data || [];
}

function ymdToFinDiaIso(ymd) {
  return ymd + 'T23:59:59.999-05:00';
}

function ymdToInicioDiaIso(ymd) {
  return ymd + 'T00:00:00.000-05:00';
}

async function fetchPreoperacionalesUltimosDias(sedeIds, desdeYmd, hastaYmd) {
  return fetchPreoperacionalesRango(sedeIds, desdeYmd, hastaYmd);
}

// ─── Anomalías ───

/**
 * Incidencias de reincidencia / patrón / tiempo fuera de servicio (v16).
 */
async function detectarAnomalias(sedeIds) {
  var out = [];
  if (!sedeIds.length) return out;

  var hoy = fechaHoyColombia();
  var desde60 = sumarDiasYmd(hoy, -60);
  var desde90 = sumarDiasYmd(hoy, -90);

  var preops60 = await fetchPreoperacionalesRango(sedeIds, desde60, hoy);
  var preops90 = await fetchPreoperacionalesRango(sedeIds, desde90, hoy);

  // Map (placa|item normalizado) -> fechas para bloqueos
  var bloqueosPorPlacaItem = {};

  for (var i = 0; i < preops60.length; i++) {
    var p = preops60[i];
    var nov = parsearNovedades(p.novedades);
    for (var j = 0; j < nov.length; j++) {
      if (esNovedadBloqueo(nov[j])) {
        var key0 = p.vehiculo_placa + '|' + String(nov[j].item || nov[j].nombre || 'Ítem').toLowerCase().trim();
        if (!bloqueosPorPlacaItem[key0]) bloqueosPorPlacaItem[key0] = [];
        bloqueosPorPlacaItem[key0].push(p.fecha);
      }
    }
  }

  var reincidenciasKeys = {};

  for (var k in bloqueosPorPlacaItem) {
    var fechas = bloqueosPorPlacaItem[k].sort();
    if (fechas.length >= 3) {
      var itemNombre = k.split('|').slice(1).join('|');
      reincidenciasKeys[k] = true;
      out.push({
        tipo: 'reincidencia',
        titulo: 'Falla recurrente en ' + itemNombre,
        descripcion: '1 vehículo con la misma novedad crítica ' + fechas.length + ' veces en 60 días',
        severidad: 'critica'
      });
    }
  }

  // Patrón: 5+ reportes mismo ítem / vehículo en 90 días (cualquier severidad), excluye ya reincidencia
  var cuentaPatron = {};
  for (var i2 = 0; i2 < preops90.length; i2++) {
    var p2 = preops90[i2];
    var nov2 = parsearNovedades(p2.novedades);
    for (var j2 = 0; j2 < nov2.length; j2++) {
      var it = nov2[j2].item || nov2[j2].nombre || 'Ítem';
      var key2 = p2.vehiculo_placa + '|' + String(it).toLowerCase().trim();
      if (reincidenciasKeys[key2]) continue;
      cuentaPatron[key2] = (cuentaPatron[key2] || 0) + 1;
    }
  }

  for (var ck in cuentaPatron) {
    if (cuentaPatron[ck] >= 5) {
      var parts = ck.split('|');
      var placaP = parts[0];
      var itemP = parts.slice(1).join('|');
      out.push({
        tipo: 'patron',
        titulo: (itemP || 'Ítem') + ' recurrente',
        descripcion: '1 vehículo con ' + cuentaPatron[ck] + ' reportes en 3 meses',
        severidad: 'media'
      });
    }
  }

  // Anomalía de tiempo fuera de servicio (historial)
  var anomT = await anomaliasTiempoFueraServicio(sedeIds);
  out = out.concat(anomT);

  return out.slice(0, 20);
}

/**
 * Promedio días fuera de operativo y activos > 2x promedio.
 */
async function anomaliasTiempoFueraServicio(sedeIds) {
  var r = await supabase
    .from('activos')
    .select('id, codigo, nombre, estado, sede_id')
    .in('sede_id', sedeIds)
    .eq('activo', true);

  if (r.error || !(r.data || []).length) return [];

  var ids = r.data.map(function (x) { return x.id; });
  var h = await supabase
    .from('historial_estado_activo')
    .select('activo_id, estado_anterior, estado_nuevo, timestamp')
    .in('activo_id', ids)
    .order('timestamp', { ascending: true });

  if (h.error) return [];

  var porActivo = {};
  (h.data || []).forEach(function (row) {
    if (!porActivo[row.activo_id]) porActivo[row.activo_id] = [];
    porActivo[row.activo_id].push(row);
  });

  var diasNoOp = [];
  var codigoPorId = {};
  r.data.forEach(function (a) {
    codigoPorId[a.id] = a.codigo;
  });

  var ahora = new Date();

  function msADias(ms) {
    return ms / (1000 * 60 * 60 * 24);
  }

  for (var ai = 0; ai < ids.length; ai++) {
    var aid = ids[ai];
    var filas = porActivo[aid] || [];
    var totalNoOp = 0;

    if (!filas.length) continue;

    for (var fi = 0; fi < filas.length; fi++) {
      var finT = fi < filas.length - 1
        ? new Date(filas[fi + 1].timestamp)
        : ahora;
      var iniT = new Date(filas[fi].timestamp);
      var estado = (filas[fi].estado_nuevo || '').toLowerCase();
      if (estado && estado !== 'operativo') {
        totalNoOp += msADias(finT - iniT);
      }
    }

    if (totalNoOp > 0) {
      diasNoOp.push({ id: aid, dias: totalNoOp, codigo: codigoPorId[aid] });
    }
  }

  if (!diasNoOp.length) return [];

  var sum = diasNoOp.reduce(function (s, x) { return s + x.dias; }, 0);
  var prom = sum / diasNoOp.length;
  if (prom <= 0) return [];

  var res = [];
  for (var di = 0; di < diasNoOp.length; di++) {
    if (diasNoOp[di].dias > 2 * prom) {
      res.push({
        tipo: 'anomalia',
        titulo: 'Equipo con tiempo excesivo fuera de servicio',
        descripcion: '1 vehículo lleva ' + Math.round(diasNoOp[di].dias) + 'd — promedio de la flota es ' + Math.round(prom) + 'd',
        severidad: 'media'
      });
    }
  }
  return res;
}

// ─── Actividad reciente (sin placas) ───

var mapaTipoVehiculo = {};

async function refrescarMapaTipos(placas) {
  if (!placas.length) return;
  var r = await supabase.from('vehiculos').select('placa, tipo').in('placa', placas);
  if (r.error) return;
  (r.data || []).forEach(function (v) {
    mapaTipoVehiculo[v.placa] = v.tipo || 'Vehículo';
  });
}

function etiquetaVehiculo(placa) {
  return mapaTipoVehiculo[placa] || 'Vehículo';
}

async function obtenerActividadReciente(sedeIds, limite) {
  var hoy = fechaHoyColombia();
  var desde = sumarDiasYmd(hoy, -90);
  var preops = await fetchPreoperacionalesRango(sedeIds, desde, hoy);

  var placasSet = {};
  preops.forEach(function (p) { placasSet[p.vehiculo_placa] = 1; });

  var hastaIso = new Date().toISOString();
  var desdeIso = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  var auth = await fetchAutorizacionesRango(sedeIds, desdeIso, hastaIso);
  auth.forEach(function (a) { if (a.vehiculo_placa) placasSet[a.vehiculo_placa] = 1; });

  var placas = await obtenerPlacasSede(sedeIds);
  var rTan = await supabase
    .from('tanqueos')
    .select('id, fecha, hora, created_at, vehiculo_placa, cantidad')
    .in('vehiculo_placa', placas.length ? placas : ['___none___'])
    .gte('created_at', desdeIso)
    .order('created_at', { ascending: false })
    .limit(100);

  var tanqs = rTan.data || [];
  tanqs.forEach(function (t) { if (t.vehiculo_placa) placasSet[t.vehiculo_placa] = 1; });

await refrescarMapaTipos(Object.keys(placasSet));

  var eventos = [];

  for (var i = 0; i < preops.length; i++) {
    var pr = preops[i];
    var fechaIso = pr.fecha + 'T' + (pr.hora || '12:00:00');
    if (preopTieneBloqueo(pr.novedades)) {
      var novB = parsearNovedades(pr.novedades).find(esNovedadBloqueo);
      eventos.push({
        tipo: 'inspeccion_novedad',
        descripcion: 'Novedad crítica — ' + ((novB && novB.item) || 'inspección'),
        detalle: etiquetaVehiculo(pr.vehiculo_placa),
        fecha: new Date(fechaIso).toISOString(),
        severidad: 'critical'
      });
    } else if (parsearNovedades(pr.novedades).length) {
      eventos.push({
        tipo: 'inspeccion_novedad',
        descripcion: 'Inspección con novedades',
        detalle: etiquetaVehiculo(pr.vehiculo_placa),
        fecha: new Date(fechaIso).toISOString(),
        severidad: 'warning'
      });
    } else {
      eventos.push({
        tipo: 'inspeccion_ok',
        descripcion: 'Inspección completada sin novedades',
        detalle: etiquetaVehiculo(pr.vehiculo_placa),
        fecha: new Date(fechaIso).toISOString(),
        severidad: 'ok'
      });
    }
  }

  for (var j = 0; j < auth.length; j++) {
    var au = auth[j];
    if (au.timestamp_decision && au.decision) {
      eventos.push({
        tipo: 'autorizacion',
        descripcion: 'Decisión supervisor: ' + (au.decision || ''),
        detalle: etiquetaVehiculo(au.vehiculo_placa),
        fecha: new Date(au.timestamp_decision).toISOString(),
        severidad: esDecisionAutorizado(au.decision) ? 'ok' : 'warning'
      });
    }
  }

  for (var k = 0; k < tanqs.length; k++) {
    var t = tanqs[k];
    var ft = t.created_at || (t.fecha + 'T' + (t.hora || '12:00:00'));
    eventos.push({
      tipo: 'tanqueo',
      descripcion: 'Tanqueo registrado' + (t.cantidad ? ' — ' + t.cantidad + ' L' : ''),
      detalle: etiquetaVehiculo(t.vehiculo_placa),
      fecha: new Date(ft).toISOString(),
      severidad: 'info'
    });
  }

  eventos.sort(function (a, b) {
    return new Date(b.fecha) - new Date(a.fecha);
  });

  return eventos.slice(0, limite || 20);
}

// ─── Índice de seguridad ───

function puntajeTiempoRespuesta(minutosProm) {
  if (minutosProm == null || isNaN(minutosProm)) return 100;
  if (minutosProm < 15) return 100;
  if (minutosProm < 30) return 90;
  if (minutosProm < 60) return 70;
  if (minutosProm < 120) return 50;
  return 20;
}

/**
 * Calcula métricas base para el índice en ventana de 30 días calendario.
 */
async function datosBaseIndice(sedeIds, sedeIdConfig) {
  var hoy = fechaHoyColombia();
  var ini = sumarDiasYmd(hoy, -29);

  var preops = await fetchPreoperacionalesRango(sedeIds, ini, hoy);
  var placas = await obtenerPlacasSede(sedeIds);
  var vehOp = await contarActivosPorEstado(sedeIds, 'vehiculo');
  var vehiculosOperativosPanel = vehOp.operativos || 0;
  if (!vehiculosOperativosPanel && placas.length) {
    var rv = await supabase
      .from('vehiculos')
      .select('placa', { count: 'exact', head: true })
      .in('placa', placas)
      .eq('estado', 'operativo');
    vehiculosOperativosPanel = rv.count || placas.length;
  }

  var diasHab = diasHabilesUltimos(hoy, 30);
  var esperados = Math.max(1, vehiculosOperativosPanel * diasHab);
  var realizados = preops.length;
  var cumplimiento = Math.min(100, Math.round((realizados / esperados) * 100));

  var desdeIso = ymdToInicioDiaIso(ini);
  var finIso = new Date().toISOString();
  var placasArr = placas.length ? placas : ['__sin_placas__'];
  var aRes = await supabase
    .from('autorizaciones_novedad')
    .select('decision, novedades_bloqueo, timestamp_alerta, timestamp_decision')
    .in('vehiculo_placa', placasArr)
    .gte('timestamp_alerta', desdeIso)
    .lte('timestamp_alerta', finIso);

  var auths = (aRes.data || []).filter(function (x) {
    return parsearNovedades(x.novedades_bloqueo).length > 0;
  });
  var totalBloqueos = auths.length;
  var conDecision = auths.filter(function (x) { return x.decision != null; }).length;
  var bloqueosPct = totalBloqueos === 0 ? 100 : Math.min(100, Math.round((conDecision / totalBloqueos) * 100));

  var doc = await metricasDocumentacion(sedeIds);
  var documentosVal = doc.alDiaPct;

  var pendientesCrit = (aRes.data || []).filter(function (x) {
    return x.decision == null && parsearNovedades(x.novedades_bloqueo).length > 0;
  }).length;
  var novedadesCritVal = Math.max(0, Math.min(100, 100 - pendientesCrit * 10));

  var deltas = [];
  (aRes.data || []).forEach(function (x) {
    if (x.timestamp_decision && x.timestamp_alerta) {
      var m = (new Date(x.timestamp_decision) - new Date(x.timestamp_alerta)) / 60000;
      if (m >= 0) deltas.push(m);
    }
  });
  var promMin = deltas.length ? deltas.reduce(function (s, x) { return s + x; }, 0) / deltas.length : null;
  var tiempoVal = puntajeTiempoRespuesta(promMin);

  return {
    cumplimiento: cumplimiento,
    bloqueos: bloqueosPct,
    documentos: documentosVal,
    novedades: novedadesCritVal,
    tiempo: tiempoVal
  };
}

/**
 * Desglose completo del índice (últimos 30 días).
 */
async function calcularIndiceSeguridadOperativa(sedeIds) {
  var sedeIdCfg = sedeIds[0] || null;
  var pesos = await obtenerPesosIndice(sedeIdCfg);
  var base = await datosBaseIndice(sedeIds, sedeIdCfg);

  var componentes = {
    cumplimiento_inspecciones: {
      valor: base.cumplimiento,
      peso: pesos.cumplimiento,
      aporte: Math.round((base.cumplimiento * pesos.cumplimiento / 100) * 100) / 100
    },
    bloqueos_resueltos: {
      valor: base.bloqueos,
      peso: pesos.bloqueos,
      aporte: Math.round((base.bloqueos * pesos.bloqueos / 100) * 100) / 100
    },
    documentos_al_dia: {
      valor: base.documentos,
      peso: pesos.documentos,
      aporte: Math.round((base.documentos * pesos.documentos / 100) * 100) / 100
    },
    novedades_criticas: {
      valor: base.novedades,
      peso: pesos.novedades,
      aporte: Math.round((base.novedades * pesos.novedades / 100) * 100) / 100
    },
    tiempo_respuesta: {
      valor: base.tiempo,
      peso: pesos.tiempo,
      aporte: Math.round((base.tiempo * pesos.tiempo / 100) * 100) / 100
    }
  };

  var score = Math.round(
    componentes.cumplimiento_inspecciones.aporte +
    componentes.bloqueos_resueltos.aporte +
    componentes.documentos_al_dia.aporte +
    componentes.novedades_criticas.aporte +
    componentes.tiempo_respuesta.aporte
  );
  score = Math.max(0, Math.min(100, score));

  return {
    score: score,
    componentes: componentes,
    pesos_fuente: 'configuracion_sede',
    periodo_calculo: 'ultimos_30_dias'
  };
}

/**
 * Índice del mes calendario anterior completo vs mes actual hasta hoy (aprox. delta).
 */
async function deltaIndiceVsMesAnterior(sedeIds) {
  var hoy = fechaHoyColombia();
  var actual = await calcularIndiceSeguridadOperativa(sedeIds);

  // Aproximación: reutilizar fórmula sobre ventana desplazada 30d no es el “mes anterior”.
  // Calculamos índice paraventana [hoy-60, hoy-30] comparando con actual.score usando mismo método aproximado:
  var iniPrev = sumarDiasYmd(hoy, -60);
  var finPrev = sumarDiasYmd(hoy, -31);
  var preopsPrev = await fetchPreoperacionalesRango(sedeIds, iniPrev, finPrev);
  var placas = await obtenerPlacasSede(sedeIds);
  var vehOp = await contarActivosPorEstado(sedeIds, 'vehiculo');
  var vehiculosOperativosPanel = vehOp.operativos || Math.max(1, placas.length);
  var diasHab = diasHabilesEntre(iniPrev, finPrev);
  var esperados = Math.max(1, vehiculosOperativosPanel * diasHab);
  var cumpl = Math.min(100, Math.round((preopsPrev.length / esperados) * 100));

  var prevScore = Math.round(
    cumpl * 0.3 + actual.componentes.bloqueos_resueltos.valor * 0.25 + actual.componentes.documentos_al_dia.valor * 0.2
    + actual.componentes.novedades_criticas.valor * 0.15 + actual.componentes.tiempo_respuesta.valor * 0.1
  );

  return actual.score - prevScore;
}

// ─── Novedades por mes (autorizaciones) ───

async function obtenerNovedadesPorMes(sedeIds, meses) {
  var n = meses || 6;
  var hoy = fechaHoyColombia();
  var p = hoy.split('-').map(function (x) { return parseInt(x, 10); });
  var buckets = [];

  for (var i = n - 1; i >= 0; i--) {
    var mes = p[1] - i;
    var anio = p[0];
    while (mes <= 0) {
      mes += 12;
      anio -= 1;
    }
    while (mes > 12) {
      mes -= 12;
      anio += 1;
    }
    buckets.push({
      y: anio,
      m: mes,
      label: MESES_CORTOS[mes - 1],
      bloqueos: 0,
      taller: 0,
      autorizados: 0
    });
  }

  var firstYmd = buckets[0].y + '-' + String(buckets[0].m).padStart(2, '0') + '-01';
  var desdeIso = ymdToInicioDiaIso(firstYmd);
  var rows = await fetchAutorizacionesDesde(sedeIds, desdeIso);

  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    var d = new Date(row.timestamp_alerta);
    var yy = d.getFullYear();
    var mm = d.getMonth() + 1;
    var b = buckets.find(function (x) { return x.y === yy && x.m === mm; });
    if (!b) continue;
    if (esDecisionAutorizado(row.decision)) b.autorizados++;
    else if (row.decision === 'taller') b.taller++;
    else if (row.decision == null || row.decision === 'restringir') b.bloqueos++;
  }

  return buckets.map(function (x) {
    return { mes: x.label, bloqueos: x.bloqueos, taller: x.taller, autorizados: x.autorizados };
  });
}

// ─── Items con más novedades ───

async function obtenerItemsMasNovedades(sedeIds, periodo) {
  var rng = rangoPeriodo(periodo || 'semana');
  var preops = await fetchPreoperacionalesRango(sedeIds, rng.inicio, rng.fin);
  var cuenta = {};

  for (var i = 0; i < preops.length; i++) {
    var nov = parsearNovedades(preops[i].novedades);
    for (var j = 0; j < nov.length; j++) {
      var nom = nov[j].item || nov[j].nombre || 'Ítem';
      if (!cuenta[nom]) cuenta[nom] = { c: 0, bloqueo: 0, alerta: 0, info: 0 };
      cuenta[nom].c++;
      var s = severidadInferida(nov[j]);
      if (s === 'bloqueo') cuenta[nom].bloqueo++;
      else if (s === 'alerta') cuenta[nom].alerta++;
      else cuenta[nom].info++;
    }
  }

  var arr = Object.keys(cuenta).map(function (k) {
    var o = cuenta[k];
    var pred = 'informativo';
    if (o.bloqueo >= o.alerta && o.bloqueo >= o.info) pred = 'bloqueo';
    else if (o.alerta >= o.info) pred = 'alerta';
    return { item: k, cantidad: o.c, severidad_predominante: pred };
  });

  arr.sort(function (a, b) { return b.cantidad - a.cantidad; });
  return arr.slice(0, 10);
}

// ─── Activos atención ───

async function obtenerActivosAtencion(sedeIds) {
  var r = await supabase
    .from('activos')
    .select('id, codigo, nombre, estado, datos, documentos, tipo_activo_id, tipos_activo(codigo)')
    .in('sede_id', sedeIds)
    .eq('activo', true);

  if (r.error) return [];

  var list = [];
  var hoy = fechaHoyColombia();

  for (var i = 0; i < (r.data || []).length; i++) {
    var a = r.data[i];
    var est = (a.estado || '').toLowerCase();
    var alertas = [];

    if (est === 'taller' || est === 'bloqueado') {
      var hRow = await supabase
        .from('historial_estado_activo')
        .select('timestamp')
        .eq('activo_id', a.id)
        .eq('estado_nuevo', est)
        .order('timestamp', { ascending: false })
        .limit(1);

      var diasTaller = 0;
      if (!hRow.error && hRow.data && hRow.data[0]) {
        diasTaller = Math.floor((Date.now() - new Date(hRow.data[0].timestamp)) / (86400000));
      }

      if (a.tipos_activo && a.tipos_activo.codigo === 'vehiculo') {
        var vv = await supabase
          .from('vehiculos')
          .select('soat_vencimiento, tecnomecanica_vencimiento')
          .eq('placa', a.codigo)
          .maybeSingle();

        if (!vv.error && vv.data) {
          if (docPorVencer30Dias(vv.data.soat_vencimiento)) {
            var ds = Math.ceil((new Date(vv.data.soat_vencimiento) - new Date(hoy)) / 86400000);
            alertas.push('SOAT ' + ds + 'd');
          }
          if (docPorVencer30Dias(vv.data.tecnomecanica_vencimiento)) {
            var dt = Math.ceil((new Date(vv.data.tecnomecanica_vencimiento) - new Date(hoy)) / 86400000);
            alertas.push('Tecno ' + dt + 'd');
          }
        }
      }

      list.push({
        codigo: a.codigo,
        nombre: a.nombre || a.codigo,
        dias_taller: diasTaller,
        alertas: alertas
      });
    } else if (a.tipos_activo && a.tipos_activo.codigo === 'vehiculo') {
      var v2 = await supabase
        .from('vehiculos')
        .select('soat_vencimiento, tecnomecanica_vencimiento, bloqueado')
        .eq('placa', a.codigo)
        .maybeSingle();
      if (!v2.error && v2.data && (v2.data.bloqueado || docPorVencer30Dias(v2.data.soat_vencimiento) || docPorVencer30Dias(v2.data.tecnomecanica_vencimiento))) {
        var al = [];
        if (docPorVencer30Dias(v2.data.soat_vencimiento)) al.push('SOAT prox');
        if (docPorVencer30Dias(v2.data.tecnomecanica_vencimiento)) al.push('Tecno prox');
        if (v2.data.bloqueado) al.push('Bloqueado');
        list.push({ codigo: a.codigo, nombre: a.nombre || a.codigo, dias_taller: 0, alertas: al });
      }
    }
  }

  return list.slice(0, 50);
}

// ─── Reincidencia (90 días, 2+ veces) ───

async function obtenerReincidencia(sedeIds) {
  var hoy = fechaHoyColombia();
  var ini = sumarDiasYmd(hoy, -90);
  var preops = await fetchPreoperacionalesRango(sedeIds, ini, hoy);

  var map = {};

  for (var i = 0; i < preops.length; i++) {
    var p = preops[i];
    var nov = parsearNovedades(p.novedades);
    for (var j = 0; j < nov.length; j++) {
      var it = nov[j].item || nov[j].nombre || '';
      var key = p.vehiculo_placa + '|' + String(it).toLowerCase();
      if (!map[key]) map[key] = { placa: p.vehiculo_placa, item: it, fechas: [] };
      map[key].fechas.push(p.fecha);
    }
  }

  var out = [];
  for (var k in map) {
    if (map[k].fechas.length >= 2) {
      var fechasOrden = map[k].fechas.sort();
      out.push({
        codigo: map[k].placa,
        item: map[k].item,
        veces: fechasOrden.length,
        periodo_dias: 90,
        ultima_fecha: fechasOrden[fechasOrden.length - 1]
      });
    }
  }

  out.sort(function (a, b) { return b.veces - a.veces; });
  return out.slice(0, 30);
}

// ─── Promedio días fuera de servicio + activo peor ───

async function estadisticasFueraServicio(sedeIds, tipoCodigo) {
  var r = await supabase
    .from('activos')
    .select('id, codigo, tipos_activo(codigo)')
    .in('sede_id', sedeIds)
    .eq('activo', true);

  if (r.error) return { promedio: 0, maxCodigo: '', maxDias: 0 };

  var rows = r.data || [];
  if (tipoCodigo && tipoCodigo !== 'todos') {
    rows = rows.filter(function (a) {
      return a.tipos_activo && a.tipos_activo.codigo === tipoCodigo;
    });
  }

  var ids = rows.map(function (x) { return x.id; });
  if (!ids.length) return { promedio: 0, maxCodigo: '', maxDias: 0 };

  var h = await supabase
    .from('historial_estado_activo')
    .select('activo_id, estado_nuevo, timestamp')
    .in('activo_id', ids)
    .order('timestamp', { ascending: true });

  if (h.error) return { promedio: 0, maxCodigo: '', maxDias: 0 };

  var porActivo = {};
  (h.data || []).forEach(function (row) {
    if (!porActivo[row.activo_id]) porActivo[row.activo_id] = [];
    porActivo[row.activo_id].push(row);
  });

  var codigoPorId = {};
  rows.forEach(function (a) { codigoPorId[a.id] = a.codigo; });

  var ahora = new Date();
  var diasLista = [];
  var maxDias = 0;
  var maxCodigo = '';

  for (var ai = 0; ai < ids.length; ai++) {
    var aid = ids[ai];
    var filas = porActivo[aid] || [];
    var totalNoOp = 0;

    for (var fi = 0; fi < filas.length; fi++) {
      var finT = fi < filas.length - 1 ? new Date(filas[fi + 1].timestamp) : ahora;
      var iniT = new Date(filas[fi].timestamp);
      var estado = (filas[fi].estado_nuevo || '').toLowerCase();
      if (estado && estado !== 'operativo') {
        totalNoOp += (finT - iniT) / 86400000;
      }
    }

    if (totalNoOp > 0) diasLista.push(totalNoOp);
    if (totalNoOp > maxDias) {
      maxDias = totalNoOp;
      maxCodigo = codigoPorId[aid] || '';
    }
  }

  var prom = diasLista.length ? diasLista.reduce(function (s, x) { return s + x; }, 0) / diasLista.length : 0;
  return {
    promedio: Math.round(prom * 10) / 10,
    maxCodigo: maxCodigo,
    maxDias: Math.round(maxDias * 10) / 10
  };
}

// ─── Agregación /general ───

async function obtenerDatosGeneral(sedeIds, periodo) {
  periodo = ['hoy', 'semana', 'mes'].includes(periodo) ? periodo : 'semana';
  var names = await obtenerNombreEmpresaSede(sedeIds);
  var rng = rangoPeriodo(periodo);
  var iniIso = ymdToInicioDiaIso(rng.inicio);
  var finIso = ymdToFinDiaIso(rng.fin);

  var sedeCfg = sedeIds[0] || null;
  var costoDia = await obtenerConfigNumerica(sedeCfg, 'costo_dia_vehiculo_parado', 380000);
  var costoSoat = await obtenerConfigNumerica(sedeCfg, 'costo_multa_soat', 936430);
  var costoTec = await obtenerConfigNumerica(sedeCfg, 'costo_multa_tecnomecanica', 936430);
  var costoMultaProm = Math.round((costoSoat + costoTec) / 2);

  var preops = await fetchPreoperacionalesRango(sedeIds, rng.inicio, rng.fin);
  var auths = await fetchAutorizacionesRango(sedeIds, iniIso, finIso);

  var activos = await contarActivosPorEstado(sedeIds, 'vehiculo');
  var placas = await obtenerPlacasSede(sedeIds);
  var diasHab = diasHabilesEntre(rng.inicio, rng.fin);
  var vehOpCount = activos.operativos || 0;
  if (!vehOpCount && placas.length) {
    var c = await supabase
      .from('vehiculos')
      .select('placa', { count: 'exact', head: true })
      .in('placa', placas)
      .eq('estado', 'operativo');
    vehOpCount = c.count || 1;
  }

  var esperados = Math.max(1, vehOpCount * diasHab);
  var realizados = preops.length;
  var cumplimiento = Math.min(100, Math.round((realizados / esperados) * 100));

  // Delta cumplimiento vs mes anterior (mismo rango relativo aprox.: días del período en mes pasado)
  var hoy = fechaHoyColombia();
  var iniMesPas = sumarDiasYmd(primerDiaMes(hoy), -1);
  var primerMesPas = primerDiaMes(iniMesPas);
  var preopsMesAnt = await fetchPreoperacionalesRango(sedeIds, primerMesPas, sumarDiasYmd(primerMesPas, diasHab - 1));
  var diasMesAnt = diasHabilesEntre(primerMesPas, sumarDiasYmd(primerMesPas, 27));
  var espAnt = Math.max(1, vehOpCount * diasMesAnt);
  var cumplAnt = Math.min(100, Math.round((preopsMesAnt.length / espAnt) * 100));
  var cumplDelta = cumplimiento - cumplAnt;

  var riesgosPrev = preops.filter(function (p) {
    return preopTieneBloqueo(p.novedades);
  }).length;

  var docM = await metricasDocumentacion(sedeIds);

  var authsDecididas = auths.filter(function (a) { return a.decision != null; });
  var autorizadas = authsDecididas.filter(function (a) { return esDecisionAutorizado(a.decision); }).length;
  var taller = authsDecididas.filter(function (a) { return a.decision === 'taller'; }).length;
  var pendientes = auths.filter(function (a) { return a.decision == null; }).length;

  var pendienteMasAntigua = auths
    .filter(function (a) { return a.decision == null; })
    .sort(function (a, b) { return new Date(a.timestamp_alerta) - new Date(b.timestamp_alerta); })[0];

  var tiempoPendMax = '0m';
  if (pendienteMasAntigua) {
    var mins = (Date.now() - new Date(pendienteMasAntigua.timestamp_alerta)) / 60000;
    if (mins >= 120) tiempoPendMax = Math.round(mins / 60) + 'h';
    else tiempoPendMax = Math.round(mins) + 'm';
  }

  var incidentesPrev = authsDecididas.filter(function (a) {
    return parsearNovedades(a.novedades_bloqueo).length > 0;
  }).length;

  var indice = await calcularIndiceSeguridadOperativa(sedeIds);
  var deltaInd = await deltaIndiceVsMesAnterior(sedeIds);

  var situaciones = await detectarAnomalias(sedeIds);
  var actividadx = await obtenerActividadReciente(sedeIds, 20);

  var diasEvit = incidentesPrev * 2;
  var ahorroMes = Math.round(incidentesPrev * costoMultaProm + diasEvit * costoDia);
  var sancionesPrev = Math.round(docM.porVencer * costoMultaProm * 0.5);

  return {
    empresa: names.empresa,
    sede: names.sede,
    periodo: periodo,

    indice_seguridad: {
      score: indice.score,
      delta_mes_anterior: deltaInd,
      incidentes_prevenidos: incidentesPrev
    },

    kpis_seguridad: {
      riesgos_prevenidos: riesgosPrev,
      cumplimiento_inspecciones: cumplimiento,
      cumplimiento_delta: cumplDelta,
      activos_operativos: activos.operativos,
      activos_total: activos.totalActivos,
      activos_fuera_servicio: activos.fueraServicio,
      documentacion_al_dia: docM.alDiaPct,
      documentos_por_vencer: docM.porVencer
    },

    kpis_financieros: {
      ahorro_estimado_mes: ahorroMes,
      costo_diario_sin_inspeccionar: costoDia,
      sanciones_prevenidas: sancionesPrev
    },

    situaciones_atencion: situaciones,
    decisiones_supervisor: {
      autorizadas: autorizadas,
      taller: taller,
      pendientes: pendientes,
      tiempo_pendiente_max: tiempoPendMax
    },
    actividad_reciente: actividadx
  };
}

// ─── Agregación /activos ───

async function obtenerDatosActivos(sedeIds, periodo, tipoFiltro) {
  periodo = ['hoy', 'semana', 'mes'].includes(periodo) ? periodo : 'semana';
  tipoFiltro = tipoFiltro || 'todos';

  var rng = rangoPeriodo(periodo);
  var pIni = rng.inicio.split('-').map(function (x) { return parseInt(x, 10); });
  var pFin = rng.fin.split('-').map(function (x) { return parseInt(x, 10); });
  var d0 = new Date(Date.UTC(pIni[0], pIni[1] - 1, pIni[2]));
  var d1 = new Date(Date.UTC(pFin[0], pFin[1] - 1, pFin[2]));
  var diasPeriodo = Math.max(1, Math.round((d1 - d0) / 86400000) + 1);
  var rngPrevFin = sumarDiasYmd(rng.inicio, -1);
  var rngPrevIni = sumarDiasYmd(rngPrevFin, -(diasPeriodo - 1));

  var preops = await fetchPreoperacionalesRango(sedeIds, rng.inicio, rng.fin);
  var preopsPrev = await fetchPreoperacionalesRango(sedeIds, rngPrevIni, rngPrevFin);

  var conNov = preops.filter(function (p) { return parsearNovedades(p.novedades).length > 0; }).length;
  var inspeccionesDelta = preopsPrev.length
    ? Math.round(((preops.length - preopsPrev.length) / preopsPrev.length) * 100)
    : (preops.length ? 100 : 0);

  var iniIso = ymdToInicioDiaIso(rng.inicio);
  var finIso = ymdToFinDiaIso(rng.fin);
  var placas = await obtenerPlacasSede(sedeIds);
  var placasFiltro = placas.length ? placas : ['__sin_placas__'];
  var auths = await supabase
    .from('autorizaciones_novedad')
    .select('id, decision, novedades_bloqueo, timestamp_alerta')
    .in('vehiculo_placa', placasFiltro)
    .gte('timestamp_alerta', iniIso)
    .lte('timestamp_alerta', finIso);

  var authRows = auths.data || [];
  var bloqueos = authRows.filter(function (a) {
    return a.decision == null || a.decision === 'restringir';
  }).length;
  var bloqueosRes = authRows.filter(function (a) {
    return a.decision != null && a.decision !== 'restringir';
  }).length;

  var tipoCodigo = tipoFiltro === 'todos' ? null : tipoFiltro;
  var statsFs = await estadisticasFueraServicio(sedeIds, tipoCodigo || 'todos');

  return {
    periodo: periodo,
    tipo_filtro: tipoFiltro,

    kpis: {
      inspecciones_periodo: preops.length,
      inspecciones_delta: inspeccionesDelta,
      con_novedades: conNov,
      con_novedades_pct: preops.length ? Math.round((conNov / preops.length) * 100) : 0,
      bloqueos: bloqueos,
      bloqueos_resueltos: bloqueosRes,
      promedio_dias_fuera_servicio: statsFs.promedio,
      activo_sube_promedio: statsFs.maxCodigo || ''
    },

    novedades_por_mes: await obtenerNovedadesPorMes(sedeIds, 6),
    items_mas_novedades: await obtenerItemsMasNovedades(sedeIds, periodo),
    activos_atencion: await obtenerActivosAtencion(sedeIds),
    reincidencia: await obtenerReincidencia(sedeIds)
  };
}

module.exports = {
  resolverSedeIds,
  obtenerConfiguracionSede,
  obtenerDatosGeneral,
  obtenerDatosActivos,
  calcularIndiceSeguridadOperativa,
  detectarAnomalias,
  obtenerActividadReciente,
  obtenerNovedadesPorMes,
  obtenerItemsMasNovedades,
  obtenerActivosAtencion,
  obtenerReincidencia,
  rangoPeriodo
};
