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

module.exports = {
  TABLA_TANQUEOS: TABLA_TANQUEOS,
  TABLA_FOTOS: TABLA_FOTOS,
  obtenerReferenciaKilometraje: obtenerReferenciaKilometraje,
  crearTanqueo: crearTanqueo,
  guardarFotosTanqueo: guardarFotosTanqueo,
  actualizarKilometrajeVehiculo: actualizarKilometrajeVehiculo
};


========================================
5) REEMPLAZAR: modulos/vehiculos/tanqueo/validaciones.js
========================================

var config = require('../../../config/config');
var preop = require('../preoperacional/validaciones');

var TIPOS_COMBUSTIBLE = ['diesel', 'gasolina', 'gas', 'adblue', 'otro'];

function responderTwiml(res, mensaje) {
  res.set('Content-Type', 'text/xml');
  res.send(
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Response><Message>' + escaparXml(mensaje) + '</Message></Response>'
  );
}

function escaparXml(texto) {
  return String(texto || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizarPlaca(texto) {
  return preop.normalizarPlaca(texto);
}

function normalizarTelefono(telefono) {
  return String(telefono || '').replace(/^whatsapp:/i, '').trim();
}

function parsearKilometraje(texto) {
  var limpio = String(texto || '').replace(/[^0-9]/g, '');
  if (!limpio) return null;

  var numero = parseInt(limpio, 10);
  if (isNaN(numero) || numero < 0) return null;

  return numero;
}

function parsearDecimal(texto) {
  var valor = String(texto || '').trim().toLowerCase();
  if (!valor) return null;

  valor = valor.replace(/\$/g, '');
  valor = valor.replace(/\s+/g, '');

  if (valor.indexOf(',') >= 0 && valor.indexOf('.') >= 0) {
    valor = valor.replace(/\./g, '').replace(/,/g, '.');
  } else if (valor.indexOf(',') >= 0) {
    valor = valor.replace(/,/g, '.');
  }

  valor = valor.replace(/[^0-9.\-]/g, '');
  if (!valor) return null;

  var numero = parseFloat(valor);
  if (isNaN(numero)) return null;

  return numero;
}

function parsearCantidad(texto) {
  var original = String(texto || '').trim().toLowerCase();
  var valor = parsearDecimal(original);
  if (valor === null || valor <= 0) {
    return { ok: false, mensaje: '❌ Cantidad inválida.\n\nEjemplos válidos:\n*45*\n*45.5*\n*12 gal*' };
  }

  var unidad = 'litros';
  if (/gal|gln|galon|galones/.test(original)) {
    unidad = 'galones';
  }

  return {
    ok: true,
    cantidad: valor,
    unidadMedida: unidad
  };
}

function parsearValor(texto) {
  var valor = parsearDecimal(texto);
  if (valor === null || valor < 0) return null;
  return valor;
}

function validarTipoCombustible(texto) {
  var limpio = String(texto || '').trim().toLowerCase();

  var equivalencias = {
    '1': 'diesel',
    '2': 'gasolina',
    '3': 'gas',
    '4': 'adblue',
    '5': 'otro',
    diesel: 'diesel',
    diésel: 'diesel',
    acpm: 'diesel',
    gasolina: 'gasolina',
    corriente: 'gasolina',
    extra: 'gasolina',
    gas: 'gas',
    gnv: 'gas',
    adblue: 'adblue',
    urea: 'adblue',
    otro: 'otro'
  };

  var normalizado = equivalencias[limpio] || null;
  if (!normalizado || TIPOS_COMBUSTIBLE.indexOf(normalizado) === -1) {
    return {
      ok: false,
      mensaje: '❌ Tipo de combustible inválido.\n\nResponde:\n1️⃣ Diesel\n2️⃣ Gasolina\n3️⃣ Gas\n4️⃣ AdBlue\n5️⃣ Otro'
    };
  }

  return { ok: true, valor: normalizado };
}

function evaluarKilometrajeContraReferencia(kilometraje, referenciaMeta) {
  var respuesta = {
    kmReferencia: referenciaMeta && typeof referenciaMeta.kilometraje === 'number'
      ? referenciaMeta.kilometraje
      : null,
    diferenciaKm: null,
    inconsistenciaKm: false,
    alertasKm: []
  };

  if (respuesta.kmReferencia === null) {
    return respuesta;
  }

  respuesta.diferenciaKm = kilometraje - respuesta.kmReferencia;

  if (kilometraje < respuesta.kmReferencia) {
    respuesta.inconsistenciaKm = true;
    respuesta.alertasKm.push(
      'Kilometraje menor al último registro (' + respuesta.kmReferencia + ' km)'
    );
  }

  if (respuesta.diferenciaKm > config.MAX_KM_SALTO) {
    respuesta.inconsistenciaKm = true;
    respuesta.alertasKm.push(
      'Salto de kilometraje mayor a ' + config.MAX_KM_SALTO + ' km'
    );
  }

  return respuesta;
}

function formatearValorMoneda(valor) {
  var numero = Number(valor || 0);
  return '$' + numero.toLocaleString('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

module.exports = {
  TIPOS_COMBUSTIBLE: TIPOS_COMBUSTIBLE,
  responderTwiml: responderTwiml,
  normalizarPlaca: normalizarPlaca,
  normalizarTelefono: normalizarTelefono,
  parsearKilometraje: parsearKilometraje,
  parsearCantidad: parsearCantidad,
  parsearValor: parsearValor,
  validarTipoCombustible: validarTipoCombustible,
  evaluarKilometrajeContraReferencia: evaluarKilometrajeContraReferencia,
  formatearValorMoneda: formatearValorMoneda
};
