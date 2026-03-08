var sesiones = new Map();
var procesando = new Set(); // bloqueo por telefono

var TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos

function obtenerSesion(telefono) {
  if (sesiones.has(telefono)) {
    var sesion = sesiones.get(telefono);
    var ahora = Date.now();
    if (ahora - sesion.ultimaActividad > TIMEOUT_MS) {
      console.log('Sesion expirada para ' + telefono);
      sesiones.delete(telefono);
    }
  }

  if (!sesiones.has(telefono)) {
    sesiones.set(telefono, {
      estado: 'INICIO',
      placa: null,
      vehiculo: null,
      conductor: null,
      kilometraje: null,
      respuestas: {},
      novedades: [],
      fotos: [],
      fotosNovedadPendientes: [],
      observacion: null,
      grupoActual: 0,
      fotoVerificacionDescripcion: null,
      ultimaActividad: Date.now()
    });
  } else {
    sesiones.get(telefono).ultimaActividad = Date.now();
  }

  return sesiones.get(telefono);
}

function eliminarSesion(telefono) {
  sesiones.delete(telefono);
  procesando.delete(telefono);
}

function copiarSesion(sesion) {
  return {
    placa: sesion.placa,
    vehiculo: sesion.vehiculo,
    conductor: sesion.conductor,
    kilometraje: sesion.kilometraje,
    respuestas: sesion.respuestas,
    novedades: sesion.novedades,
    fotos: sesion.fotos,
    observacion: sesion.observacion
  };
}

// Bloqueo de concurrencia por telefono
function bloquear(telefono) {
  if (procesando.has(telefono)) return false; // ya ocupado
  procesando.add(telefono);
  return true;
}

function desbloquear(telefono) {
  procesando.delete(telefono);
}

// Cleanup cada 10 minutos
setInterval(function() {
  var ahora = Date.now();
  var eliminadas = 0;
  sesiones.forEach(function(sesion, telefono) {
    if (ahora - sesion.ultimaActividad > TIMEOUT_MS) {
      sesiones.delete(telefono);
      procesando.delete(telefono);
      eliminadas++;
    }
  });
  if (eliminadas > 0) {
    console.log('Limpieza: ' + eliminadas + ' sesion(es) expirada(s)');
  }
}, 10 * 60 * 1000);

module.exports = { obtenerSesion, eliminarSesion, copiarSesion, bloquear, desbloquear };
