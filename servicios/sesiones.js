var config = require('../config/config');

var sesiones = new Map();
var procesando = new Map(); // FIX: se reemplaza el Set por un Map con timestamp para liberar bloqueos vencidos.

var LOCK_TIMEOUT_MS = 5 * 60 * 1000; // FIX: timeout de bloqueo para evitar sesiones eternamente bloqueadas si un flujo async no libera.
var SESSIONES_TABLE = config.TABLES.sesionesActivas; // FIX: usa la configuracion centralizada para la tabla de sesiones activas.
var persistenciaEnCadena = Promise.resolve(); // FIX: cola serializada para evitar carreras entre escrituras concurrentes en Supabase.
var cargasPendientes = new Map(); // FIX: evita lecturas duplicadas de la misma sesion cuando se carga desde Supabase.

function timeoutFlujo(sesion) {
  // FIX: cada tipo de flujo tiene su propio timeout (ej: tanqueo = 10 min, resto = 30 min).
  var tabla = config.TIMEOUT_FLUJO_MS || {};
  if (sesion && sesion.tipo && typeof tabla[sesion.tipo] === 'number') return tabla[sesion.tipo];
  return tabla.default || (30 * 60 * 1000);
}

function ventanaRecuperacion() {
  return config.TIMEOUT_RECUPERACION_MS || (5 * 60 * 1000);
}

function esSesionRecuperable(sesion) {
  // FIX: la inscripcion son pocos pasos — no se recupera, se reinicia limpia.
  // Sesiones sin tipo o en INICIO tampoco tienen progreso que valga la pena preservar.
  if (!sesion || !sesion.tipo) return false;
  if (sesion.tipo === 'inscripcion') return false;
  if (!sesion.estado || sesion.estado === 'INICIO') return false;
  return true;
}

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
    ultimaActividad: Date.now(),
    expirada: false
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
  if (typeof sesion.expirada !== 'boolean') sesion.expirada = false;
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
    var inactividad = Date.now() - sesion.ultimaActividad;
    var timeout = timeoutFlujo(sesion);

    if (inactividad > timeout) {
      // FIX: dentro de la ventana de recuperacion se restaura marcada como expirada
      // para que el canal pueda ofrecer "continuar" o "reiniciar". Fuera de esa ventana,
      // o si el tipo no es recuperable (ej: inscripcion), se purga definitivamente.
      if (!esSesionRecuperable(sesion) || inactividad > timeout + ventanaRecuperacion()) {
        await eliminarSesionPersistida(telefono);
        return null;
      }
      sesion.expirada = true;
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
  var inactividad = Date.now() - sesion.ultimaActividad;
  var timeout = timeoutFlujo(sesion);

  if (inactividad <= timeout) return;

  if (esSesionRecuperable(sesion) && inactividad <= timeout + ventanaRecuperacion()) {
    // FIX: dentro de la ventana de recuperacion se preservan los datos y solo se marca la sesion.
    // El canal detecta el flag y ofrece al usuario continuar o reiniciar.
    // Se libera el bloqueo huerfano para evitar que el mensaje de recuperacion quede encolado.
    if (!sesion.expirada) {
      sesion.expirada = true;
      procesando.delete(telefono);
      persistirSnapshotSesiones();
    }
    return;
  }

  // FIX: fuera de la ventana de recuperacion (o tipo no recuperable) se purga definitivamente.
  sesiones.delete(telefono);
  procesando.delete(telefono);
  eliminarSesionPersistida(telefono);
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
  // FIX: entrar en la ventana de recuperacion NO cuenta como actividad.
  // Solo el canal, al confirmar "continuar", reactiva la sesion limpiando el flag.
  if (!sesion.expirada) {
    sesion.ultimaActividad = Date.now();
  }
  return sesion;
}

function reactivarSesion(telefono) {
  // FIX: invocado por el canal cuando el usuario elige "continuar" tras una expiracion.
  // Limpia el flag y refresca la marca de actividad para reanudar la sesion en el mismo estado.
  if (!sesiones.has(telefono)) return null;
  var sesion = sesiones.get(telefono);
  sesion.expirada = false;
  sesion.ultimaActividad = Date.now();
  persistirSnapshotSesiones();
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
  var marcadas = 0;
  var desbloqueadas = 0;

  sesiones.forEach(function(sesion, telefono) {
    var inactividad = ahora - sesion.ultimaActividad;
    var timeout = timeoutFlujo(sesion);

    if (inactividad <= timeout) return;

    if (esSesionRecuperable(sesion) && inactividad <= timeout + ventanaRecuperacion()) {
      // FIX: todavia dentro de la ventana de recuperacion — solo marcar, preservar datos.
      if (!sesion.expirada) {
        sesion.expirada = true;
        procesando.delete(telefono);
        marcadas++;
      }
      return;
    }

    // FIX: fuera de ventana o no recuperable — purga definitiva.
    sesiones.delete(telefono);
    procesando.delete(telefono);
    eliminadas++;
    eliminarSesionPersistida(telefono);
  });

  procesando.forEach(function(inicioBloqueo, telefono) {
    if (ahora - inicioBloqueo > LOCK_TIMEOUT_MS) {
      // FIX: limpieza periodica de bloqueos vencidos para evitar que un fallo async deje al usuario congelado.
      procesando.delete(telefono);
      desbloqueadas++;
    }
  });

  if (eliminadas > 0 || marcadas > 0) {
    guardarCambios();
  }

  if (eliminadas > 0) {
    console.log('Limpieza: ' + eliminadas + ' sesion(es) purgada(s)');
  }

  if (marcadas > 0) {
    console.log('Limpieza: ' + marcadas + ' sesion(es) marcada(s) como expirada(s) recuperable(s)');
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
  reactivarSesion,
  copiarSesion,
  bloquear,
  desbloquear,
  guardarCambios,
  esSesionRecuperable
};
