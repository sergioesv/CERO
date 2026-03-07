var sesiones = new Map();

var TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos

function obtenerSesion(telefono) {
  // Check if session exists and is expired
  if (sesiones.has(telefono)) {
    var sesion = sesiones.get(telefono);
    var ahora = Date.now();
    if (ahora - sesion.ultimaActividad > TIMEOUT_MS) {
      console.log('Sesion expirada para ' + telefono + ' (' + Math.round((ahora - sesion.ultimaActividad) / 60000) + ' min inactivo)');
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
    // Update last activity
    sesiones.get(telefono).ultimaActividad = Date.now();
  }

  return sesiones.get(telefono);
}

function eliminarSesion(telefono) {
  sesiones.delete(telefono);
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

// Cleanup expired sessions every 10 minutes
setInterval(function() {
  var ahora = Date.now();
  var eliminadas = 0;
  sesiones.forEach(function(sesion, telefono) {
    if (ahora - sesion.ultimaActividad > TIMEOUT_MS) {
      sesiones.delete(telefono);
      eliminadas++;
    }
  });
  if (eliminadas > 0) {
    console.log('Limpieza: ' + eliminadas + ' sesion(es) expirada(s) eliminada(s)');
  }
}, 10 * 60 * 1000);

module.exports = { obtenerSesion, eliminarSesion, copiarSesion };
