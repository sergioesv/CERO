var config = require('../../../config/config');
var ocr = require('../../../servicios/ocr');
var storage = require('../../../servicios/storage');
var activosData = require('../../../data/activos');

var FORMATO_PLACA_ESTANDAR = /^[A-Z]{3}[0-9]{3}$/;

function sinAcentos(texto) {
  return String(texto == null ? '' : texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizarPlaca(texto) {
  return sinAcentos(texto).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizarTelefono(telefono) {
  return String(telefono || '').replace(/^whatsapp:/i, '').trim();
}

function normalizarOpcion(texto) {
  return String(texto || '').trim().toLowerCase();
}

function esOpcion(texto, opciones) {
  var valor = normalizarOpcion(texto);
  for (var i = 0; i < opciones.length; i++) {
    if (valor === normalizarOpcion(opciones[i])) return true;
  }
  return false;
}

function parsearKilometraje(texto) {
  var limpio = String(texto || '').replace(/[^0-9]/g, '');
  if (!limpio) return null;

  var numero = parseInt(limpio, 10);
  if (isNaN(numero) || numero < 0) return null;

  return numero;
}

function formatearKilometraje(kilometraje) {
  if (typeof kilometraje !== 'number') return '';
  return kilometraje.toLocaleString('es-CO') + ' km';
}

function construirAlertaKilometraje(tipo, kilometraje, kmReferencia, maxKmSalto) {
  if (tipo === 'menor') {
    return {
      tipo: 'menor',
      mensaje: 'Kilometraje menor al último registro (' + formatearKilometraje(kmReferencia) + ')',
      mensajeCorto: 'El valor detectado quedó por debajo del último registro.'
    };
  }

  if (tipo === 'alto') {
    return {
      tipo: 'alto',
      mensaje: 'Salto de kilometraje mayor a ' + maxKmSalto + ' km',
      mensajeCorto: 'El salto detectado fue de *' + (kilometraje - kmReferencia) + ' km*.'
    };
  }

  return null;
}

function evaluarKilometrajeContraReferencia(kilometraje, referenciaMeta, maxKmSalto) {
  var limite = typeof maxKmSalto === 'number' && maxKmSalto > 0 ? maxKmSalto : config.MAX_KM_SALTO;
  var kmReferencia = referenciaMeta && typeof referenciaMeta.kilometraje === 'number'
    ? referenciaMeta.kilometraje
    : null;

  var resultado = {
    kilometraje: kilometraje,
    kmReferencia: kmReferencia,
    diferenciaKm: kmReferencia === null ? null : (kilometraje - kmReferencia),
    inconsistenciaKm: false,
    alertasKm: [],
    tipo: 'sin_referencia',
    mensajeCorto: ''
  };

  if (kmReferencia === null) {
    return resultado;
  }

  if (kilometraje < kmReferencia) {
    var alertaMenor = construirAlertaKilometraje('menor', kilometraje, kmReferencia, limite);
    resultado.tipo = 'menor';
    resultado.inconsistenciaKm = true;
    resultado.alertasKm.push(alertaMenor);
    resultado.mensajeCorto = alertaMenor.mensajeCorto;
    return resultado;
  }

  if ((kilometraje - kmReferencia) > limite) {
    var alertaAlta = construirAlertaKilometraje('alto', kilometraje, kmReferencia, limite);
    resultado.tipo = 'alto';
    resultado.inconsistenciaKm = true;
    resultado.alertasKm.push(alertaAlta);
    resultado.mensajeCorto = alertaAlta.mensajeCorto;
    return resultado;
  }

  resultado.tipo = 'ok';
  return resultado;
}

async function resolverPlacaFotoOperativa(fotoUrl, telefono) {
  var lectura = await ocr.extraerPlacaFoto(fotoUrl);
  var placaDetectada = normalizarPlaca(lectura.placa || '');

  if (lectura.valida && placaDetectada) {
    var cargaExacta = await activosData.cargarActivoYConductor(placaDetectada, telefono);
    if (!cargaExacta.error && cargaExacta.vehiculo) {
      return {
        tipo: 'exacta',
        lectura: lectura,
        placaDetectada: placaDetectada,
        placaSugerida: null,
        carga: cargaExacta,
        razon: lectura.razon || ''
      };
    }
  }

  var placaSugerida = null;
  if (placaDetectada) {
    placaSugerida = await activosData.buscarPlacaSugerida(placaDetectada);
  }

  if (placaSugerida) {
    var cargaSugerida = await activosData.cargarActivoYConductor(placaSugerida, telefono);
    if (!cargaSugerida.error && cargaSugerida.vehiculo) {
      return {
        tipo: 'sugerida',
        lectura: lectura,
        placaDetectada: placaDetectada || null,
        placaSugerida: placaSugerida,
        carga: cargaSugerida,
        razon: lectura.razon || ''
      };
    }
  }

  return {
    tipo: 'manual',
    lectura: lectura,
    placaDetectada: placaDetectada || null,
    placaSugerida: placaSugerida || null,
    carga: null,
    razon: lectura.razon || 'La placa no se pudo validar con seguridad.'
  };
}

async function resolverPlacaManualOperativa(texto, telefono) {
  var placa = normalizarPlaca(texto);

  if (!placa) {
    return {
      tipo: 'formato_invalido',
      placaDetectada: null,
      carga: null
    };
  }

  if (!FORMATO_PLACA_ESTANDAR.test(placa)) {
    return {
      tipo: 'formato_invalido',
      placaDetectada: placa,
      carga: null
    };
  }

  var carga = await activosData.cargarActivoYConductor(placa, telefono);
  if (!carga.error && carga.vehiculo) {
    return {
      tipo: 'exacta',
      placaDetectada: placa,
      carga: carga
    };
  }

  return {
    tipo: 'no_encontrado',
    placaDetectada: placa,
    carga: null
  };
}

async function resolverFotoOdometroOperativa(fotoUrl, referenciaMeta, maxKmSalto) {
  var lectura = await ocr.extraerKilometrajeFoto(fotoUrl);

  if (!lectura.valida || typeof lectura.kilometraje !== 'number') {
    return {
      tipo: 'manual',
      lectura: lectura,
      kilometraje: null,
      evaluacion: null
    };
  }

  var evaluacion = evaluarKilometrajeContraReferencia(lectura.kilometraje, referenciaMeta, maxKmSalto);

  if (evaluacion.tipo === 'menor' || evaluacion.tipo === 'alto') {
    return {
      tipo: 'fuera_rango',
      lectura: lectura,
      kilometraje: lectura.kilometraje,
      evaluacion: evaluacion
    };
  }

  return {
    tipo: 'confirmar',
    lectura: lectura,
    kilometraje: lectura.kilometraje,
    evaluacion: evaluacion
  };
}

function guardarFotoUnica(sesion, foto) {
  storage.guardarFotoUnica(sesion, foto);
}

function registrarFotoOdometro(sesion, fotoUrl, kilometraje, origen, descripcion, tipo) {
  guardarFotoUnica(sesion, {
    tipo: tipo || 'inicio_odometro',
    url: fotoUrl,
    descripcion: descripcion || 'Foto del odómetro',
    validacion: origen || ('Kilometraje registrado: ' + kilometraje + ' km'),
    validada: true
  });
}

module.exports = {
  FORMATO_PLACA_ESTANDAR: FORMATO_PLACA_ESTANDAR,
  normalizarPlaca: normalizarPlaca,
  normalizarTelefono: normalizarTelefono,
  normalizarOpcion: normalizarOpcion,
  esOpcion: esOpcion,
  parsearKilometraje: parsearKilometraje,
  formatearKilometraje: formatearKilometraje,
  evaluarKilometrajeContraReferencia: evaluarKilometrajeContraReferencia,
  resolverPlacaFotoOperativa: resolverPlacaFotoOperativa,
  resolverPlacaManualOperativa: resolverPlacaManualOperativa,
  resolverFotoOdometroOperativa: resolverFotoOdometroOperativa,
  guardarFotoUnica: guardarFotoUnica,
  registrarFotoOdometro: registrarFotoOdometro
};
