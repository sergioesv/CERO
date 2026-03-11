var fs = require('fs');
var path = require('path');
var config = require('./config');

var sesiones = new Map();
var procesando = new Set();

var TIMEOUT_MS = 30 * 60 * 1000;
var STORE_FILE = config.SESSION_STORE_FILE || path.join(process.cwd(), 'data', 'cero_sesiones.json');

function asegurarDirectorio() {
  var dir = path.dirname(STORE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function crearSesionBase() {
  return {
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
  if (!sesion.ultimaActividad) sesion.ultimaActividad = Date.now();
  return sesion;
}

function cargarSesiones() {
  try {
    if (!fs.existsSync(STORE_FILE)) return;
    var raw = fs.readFileSync(STORE_FILE, 'utf8');
    if (!raw) return;
    var parsed = JSON.parse(raw);
    var ahora = Date.now();
    Object.keys(parsed).forEach(function(telefono) {
      var sesion = normalizarSesion(parsed[telefono]);
      if (ahora - sesion.ultimaActividad <= TIMEOUT_MS) {
        sesiones.set(telefono, sesion);
      }
    });
  } catch (error) {
    console.error('No se pudieron restaurar las sesiones:', error.message);
  }
}

function persistir() {
  try {
    asegurarDirectorio();
    var serializable = {};
    sesiones.forEach(function(sesion, telefono) {
      serializable[telefono] = sesion;
    });
    var tmpFile = STORE_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(serializable, null, 2), 'utf8');
    fs.renameSync(tmpFile, STORE_FILE);
  } catch (error) {
    console.error('No se pudieron persistir las sesiones:', error.message);
  }
}

function expirarSiCorresponde(telefono) {
  if (!sesiones.has(telefono)) return;
  var sesion = sesiones.get(telefono);
  if (Date.now() - sesion.ultimaActividad > TIMEOUT_MS) {
    sesiones.delete(telefono);
    procesando.delete(telefono);
    persistir();
  }
}

function obtenerSesion(telefono) {
  expirarSiCorresponde(telefono);

  if (!sesiones.has(telefono)) {
    sesiones.set(telefono, crearSesionBase());
    persistir();
  }

  var sesion = sesiones.get(telefono);
  sesion.ultimaActividad = Date.now();
  return sesion;
}

function eliminarSesion(telefono) {
  sesiones.delete(telefono);
  procesando.delete(telefono);
  persistir();
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
  if (procesando.has(telefono)) return false;
  procesando.add(telefono);
  return true;
}

function desbloquear(telefono) {
  procesando.delete(telefono);
}

function guardarCambios() {
  persistir();
}

var intervaloLimpieza = setInterval(function() {
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
    persistir();
    console.log('Limpieza: ' + eliminadas + ' sesion(es) expirada(s)');
  }
}, 10 * 60 * 1000);

if (typeof intervaloLimpieza.unref === 'function') {
  intervaloLimpieza.unref();
}

cargarSesiones();

module.exports = {
  obtenerSesion,
  eliminarSesion,
  copiarSesion,
  bloquear,
  desbloquear,
  guardarCambios
};
