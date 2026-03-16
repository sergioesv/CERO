
var config = require('../../../config/config');
var preop = require('../preoperacional/validaciones');

var COMBUSTIBLES = {
  '1': 'gasolina',
  '2': 'diesel',
  '3': 'gas',
  '4': 'adblue',
  '5': 'otro',
  gasolina: 'gasolina',
  diesel: 'diesel',
  diésel: 'diesel',
  acpm: 'diesel',
  gas: 'gas',
  gnv: 'gas',
  glp: 'gas',
  adblue: 'adblue',
  urea: 'adblue',
  otro: 'otro'
};

function normalizarCombustible(texto) {
  var clave = String(texto || '').trim().toLowerCase();
  return COMBUSTIBLES[clave] || null;
}

function parsearEntero(texto) {
  var limpio = String(texto || '').replace(/[^0-9]/g, '');
  if (!limpio) return null;

  var numero = parseInt(limpio, 10);
  return isNaN(numero) ? null : numero;
}

function parsearDecimalFlexible(texto) {
  var bruto = String(texto || '').trim();
  var match = bruto.match(/[0-9.,]+/);
  if (!match) return null;

  var numero = match[0].replace(/\s+/g, '');
  var tieneComa = numero.indexOf(',') >= 0;
  var tienePunto = numero.indexOf('.') >= 0;

  if (tieneComa && tienePunto) {
    if (numero.lastIndexOf(',') > numero.lastIndexOf('.')) {
      numero = numero.replace(/\./g, '').replace(',', '.');
    } else {
      numero = numero.replace(/,/g, '');
    }
  } else if (tieneComa) {
    if ((numero.match(/,/g) || []).length > 1) {
      var partesComa = numero.split(',');
      var ultimaComa = partesComa.pop();
      if (ultimaComa.length === 3) {
        numero = partesComa.join('') + ultimaComa;
      } else {
        numero = partesComa.join('') + '.' + ultimaComa;
      }
    } else {
      var posComa = numero.indexOf(',');
      if ((numero.length - posComa - 1) === 3) {
        numero = numero.replace(',', '');
      } else {
        numero = numero.replace(',', '.');
      }
    }
  } else if (tienePunto) {
    if ((numero.match(/\./g) || []).length > 1) {
      var partesPunto = numero.split('.');
      var ultimoPunto = partesPunto.pop();
      if (ultimoPunto.length === 3) {
        numero = partesPunto.join('') + ultimoPunto;
      } else {
        numero = partesPunto.join('') + '.' + ultimoPunto;
      }
    } else {
      var posPunto = numero.indexOf('.');
      if ((numero.length - posPunto - 1) === 3) {
        numero = numero.replace('.', '');
      }
    }
  }

  var valor = parseFloat(numero);
  return isNaN(valor) ? null : valor;
}

function parsearCantidadYUnidad(texto) {
  var valor = parsearDecimalFlexible(texto);
  if (valor === null) return null;

  var normalizado = String(texto || '').trim().toLowerCase();
  var unidad = 'litros';

  if (normalizado.indexOf('gal') >= 0) {
    unidad = 'galones';
  }

  return {
    cantidad: valor,
    unidad: unidad
  };
}

function validarKilometrajeTanqueo(kilometraje, referenciaMeta, maxKmSalto) {
  var kmReferencia = referenciaMeta && typeof referenciaMeta.kilometraje === 'number'
    ? referenciaMeta.kilometraje
    : null;

  var diferenciaKm = kmReferencia === null ? null : kilometraje - kmReferencia;
  var alertas = [];
  var inconsistencia = false;

  if (kmReferencia !== null && kilometraje < kmReferencia) {
    inconsistencia = true;
    alertas.push('El kilometraje informado es menor al último registrado (' + kmReferencia + ' km).');
  }

  if (kmReferencia !== null && diferenciaKm !== null && diferenciaKm > maxKmSalto) {
    inconsistencia = true;
    alertas.push('El salto de kilometraje es de ' + diferenciaKm + ' km y supera el máximo permitido de ' + maxKmSalto + ' km.');
  }

  return {
    kilometraje: kilometraje,
    kmReferencia: kmReferencia,
    diferenciaKm: diferenciaKm,
    alertas: alertas,
    inconsistencia: inconsistencia
  };
}

function validarCantidad(cantidad) {
  return typeof cantidad === 'number' && !isNaN(cantidad) && cantidad > 0;
}

function validarValor(valor) {
  return typeof valor === 'number' && !isNaN(valor) && valor > 0;
}

module.exports = {
  CAMPOS_BASE: ['vehiculo_placa', 'conductor_id', 'tipo_combustible', 'cantidad', 'valor_total', 'kilometraje'],
  TABLA_OBJETIVO_ENV: 'DB_TABLE_TANQUEOS',
  MAX_KM_SALTO_TANQUEO: config.MAX_KM_SALTO,
  responderTwiml: preop.responderTwiml,
  escaparXml: preop.escaparXml,
  normalizarPlaca: preop.normalizarPlaca,
  normalizarCombustible: normalizarCombustible,
  parsearEntero: parsearEntero,
  parsearCantidadYUnidad: parsearCantidadYUnidad,
  validarKilometrajeTanqueo: validarKilometrajeTanqueo,
  validarCantidad: validarCantidad,
  validarValor: validarValor
};


