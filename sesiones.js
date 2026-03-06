var sesiones = new Map();

function obtenerSesion(telefono) {
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
      fotoVerificacionDescripcion: null
    });
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

module.exports = { obtenerSesion, eliminarSesion, copiarSesion };
