var config = require('../config/config');

var sesiones = new Map();
var procesando = new Map(); // FIX: se reemplaza el Set por un Map con timestamp para liberar bloqueos vencidos.

var TIMEOUT_MS = 30 * 60 * 1000;
var LOCK_TIMEOUT_MS = 5 * 60 * 1000; // FIX: timeout de bloqueo para evitar sesiones eternamente bloqueadas si un flujo async no libera.
var SESSIONES_TABLE = process.env.DB_TABLE_SESIONES_ACTIVAS || 'sesiones_activas'; // FIX: la persistencia pasa de archivo local a tabla de Supabase.
var persistenciaEnCadena = Promise.resolve(); // FIX: cola serializada para evitar carreras entre escrituras concurrentes en Supabase.
var cargasPendientes = new Map(); // FIX: evita lecturas duplicadas de la misma sesion cuando se carga desde Supabase.

function crearSesionBase() {
  return {
    estado: 'INICIO',
    placa: null,
    vehiculo: null,
    conductor: null,
    kilometraje: null,
    kmDetectado: null,
    kmLecturaFueraRango: false,
    placaDetectada: null,
    placaSugerida: null,
    fotoPlacaTemporal: null,
    fotoOdometroTemporal: null,
    respuestas: {},
    novedades: [],
    fotos: [],
    fotosNovedadPendientes: [],
    observacion: null,
    grupoActual: 0,
    ultimaActividad: Date.now()
  };
}

function normalizarSesion(data) {
  var base = crearSesionBase();
  var sesion = Object.assign(base, data || {});
  if (!sesion.respuestas || typeof sesion.respuestas !== 'object') sesion.respuestas = {};
  if (!Array.isArray(sesion.novedades)) sesion.novedades = [];
  if (!Array.isArray(sesion.fotos)) sesion.fotos = [];
  if (!Array.isArray(sesion.fotosNovedadPendientes)) sesion.fotosNovedadPendientes = [];
  if (typeof sesion.kmDetectado !== 'number') sesion.kmDetectado = null;
  if (typeof sesion.kmLecturaFueraRango !== 'boolean') sesion.kmLecturaFueraRango = false;
  if (!sesion.placaDetectada) sesion.placaDetectada = null;
  if (!sesion.placaSugerida) sesion.placaSugerida = null;
  if (!sesion.fotoPlacaTemporal) sesion.fotoPlacaTemporal = null;
  if (!sesion.fotoOdometroTemporal) sesion.fotoOdometroTemporal = null;
  if (!sesion.ultimaActividad) sesion.ultimaActividad = Date.now();
  return sesion;
}

function encolarPersistencia(tarea, contexto) {
  // FIX: todas las operaciones de escritura se encolan para ejecutarse en orden y evitar sobrescrituras entre requests.
  persistenciaEnCadena = persistenciaEnCadena
    .then(function() {
      return tarea();
    })
    .catch(function(error) {
      console.error('No se pudo persistir la sesion (' + contexto + '):', error.message || error);
    });

  return persistenciaEnCadena;
}

function serializarSesiones() {
  // FIX: se genera un snapshot inmutable de las sesiones activas para enviarlo a Supabase por batch.
  var filas = [];
  sesiones.forEach(function(sesion, telefono) {
    filas.push({
      telefono: telefono,
      datos: JSON.parse(JSON.stringify(sesion))
    });
  });
  return filas;
}

function persistirSnapshotSesiones() {
  var snapshot = serializarSesiones();

  return encolarPersistencia(async function() {
    if (!snapshot.length) return;

    var resultado = await config.supabase
      .from(SESSIONES_TABLE)
      .upsert(snapshot, { onConflict: 'telefono' });

    if (resultado.error) throw resultado.error;
  }, 'upsert sesiones activas');
}

function eliminarSesionPersistida(telefono) {
  return encolarPersistencia(async function() {
    var resultado = await config.supabase
      .from(SESSIONES_TABLE)
      .delete()
      .eq('telefono', telefono);

    if (resultado.error) throw resultado.error;
  }, 'delete ' + telefono);
}

async function cargarSesionDesdeSupabase(telefono) {
  try {
    // FIX: la sesion se recupera bajo demanda desde Supabase para sobrevivir reinicios de Railway.
    var resultado = await config.supabase
      .from(SESSIONES_TABLE)
      .select('telefono, datos')
      .eq('telefono', telefono)
      .maybeSingle();

    if (resultado.error) {
      console.error('No se pudo cargar la sesion de ' + telefono + ':', resultado.error.message);
      return null;
    }

    if (!resultado.data || !resultado.data.datos) {
      return null;
    }

    var sesion = normalizarSesion(resultado.data.datos);
    if (Date.now() - sesion.ultimaActividad > TIMEOUT_MS) {
      // FIX: si la sesion persistida ya vencio, se elimina en Supabase y no se reutiliza.
      await eliminarSesionPersistida(telefono);
      return null;
    }

    sesiones.set(telefono, sesion);
    return sesion;
  } catch (error) {
    console.error('No se pudo restaurar la sesion de ' + telefono + ':', error.message || error);
    return null;
  }
}

function cargarSesionPorTelefono(telefono) {
  if (sesiones.has(telefono)) {
    return Promise.resolve(sesiones.get(telefono));
  }

  if (!cargasPendientes.has(telefono)) {
    // FIX: se comparte la misma promesa de carga para evitar lecturas simultaneas del mismo telefono.
    cargasPendientes.set(
      telefono,
      cargarSesionDesdeSupabase(telefono).finally(function() {
        cargasPendientes.delete(telefono);
      })
    );
  }

  return cargasPendientes.get(telefono);
}

function expirarSiCorresponde(telefono) {
  if (!sesiones.has(telefono)) return;

  var sesion = sesiones.get(telefono);
  if (Date.now() - sesion.ultimaActividad > TIMEOUT_MS) {
    sesiones.delete(telefono);
    procesando.delete(telefono);
    // FIX: al expirar en memoria tambien se agenda la eliminacion en Supabase.
    eliminarSesionPersistida(telefono);
  }
}

async function obtenerSesion(telefono) {
  expirarSiCorresponde(telefono);

  if (!sesiones.has(telefono)) {
    var sesionPersistida = await cargarSesionPorTelefono(telefono);
    if (!sesionPersistida) {
      sesiones.set(telefono, crearSesionBase());
    }
  }

  var sesion = sesiones.get(telefono);
  sesion.ultimaActividad = Date.now();
  return sesion;
}

function eliminarSesion(telefono) {
  sesiones.delete(telefono);
  procesando.delete(telefono);
  // FIX: se elimina la sesion persistida en Supabase en lugar de borrar un archivo local.
  eliminarSesionPersistida(telefono);
}

function copiarSesion(sesion) {
  return JSON.parse(JSON.stringify({
    placa: sesion.placa,
    vehiculo: sesion.vehiculo,
    conductor: sesion.conductor,
    kilometraje: sesion.kilometraje,
    respuestas: sesion.respuestas,
    novedades: sesion.novedades,
    fotos: sesion.fotos,
    observacion: sesion.observacion
  }));
}

function bloquear(telefono) {
  var bloqueoActual = procesando.get(telefono);

  if (bloqueoActual && (Date.now() - bloqueoActual) <= LOCK_TIMEOUT_MS) {
    return false;
  }

  // FIX: si existe un bloqueo huerfano o vencido, se reemplaza automaticamente para evitar deadlocks operativos.
  procesando.set(telefono, Date.now());
  return true;
}

function desbloquear(telefono) {
  procesando.delete(telefono);
}

function guardarCambios() {
  // FIX: se reemplaza la escritura bloqueante con persistencia async en batch hacia Supabase.
  return persistirSnapshotSesiones();
}

var intervaloLimpieza = setInterval(function() {
  var ahora = Date.now();
  var eliminadas = 0;
  var desbloqueadas = 0;

  sesiones.forEach(function(sesion, telefono) {
    if (ahora - sesion.ultimaActividad > TIMEOUT_MS) {
      sesiones.delete(telefono);
      procesando.delete(telefono);
      eliminadas++;
      eliminarSesionPersistida(telefono);
    }
  });

  procesando.forEach(function(inicioBloqueo, telefono) {
    if (ahora - inicioBloqueo > LOCK_TIMEOUT_MS) {
      // FIX: limpieza periodica de bloqueos vencidos para evitar que un fallo async deje al usuario congelado.
      procesando.delete(telefono);
      desbloqueadas++;
    }
  });

  if (eliminadas > 0) {
    guardarCambios();
    console.log('Limpieza: ' + eliminadas + ' sesion(es) expirada(s)');
  }

  if (desbloqueadas > 0) {
    console.log('Limpieza: ' + desbloqueadas + ' bloqueo(s) vencido(s) liberado(s)');
  }
}, 10 * 60 * 1000);

if (typeof intervaloLimpieza.unref === 'function') {
  intervaloLimpieza.unref();
}

module.exports = {
  obtenerSesion,
  eliminarSesion,
  copiarSesion,
  bloquear,
  desbloquear,
  guardarCambios
};