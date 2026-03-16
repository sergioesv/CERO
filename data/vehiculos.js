var config = require('../config/config');
var preop = require('../modulos/vehiculos/preoperacional/validaciones');

function costoCaracterPlaca(a, b) {
  if (a === b) return 0;
  var confusiones = {
    '0': ['O', 'Q', 'D'], 'O': ['0', 'Q', 'D'], 'Q': ['0', 'O'],
    '1': ['I', 'L'], 'I': ['1', 'L'], 'L': ['1', 'I'],
    '2': ['Z'], 'Z': ['2'], '5': ['S'], 'S': ['5'],
    '6': ['G'], 'G': ['6'], '7': ['T'], 'T': ['7'],
    '8': ['B'], 'B': ['8']
  };
  return confusiones[a] && confusiones[a].indexOf(b) >= 0 ? 0.35 : 1;
}

function distanciaPlaca(a, b) {
  var placaA = preop.normalizarPlaca(a);
  var placaB = preop.normalizarPlaca(b);
  if (!placaA || !placaB || placaA.length !== placaB.length) return Number.MAX_SAFE_INTEGER;
  var total = 0;
  for (var i = 0; i < placaA.length; i++) {
    total += costoCaracterPlaca(placaA.charAt(i), placaB.charAt(i));
  }
  return total;
}

function normalizarTelefono(valor) {
  return String(valor || '')
    .replace(/^whatsapp:/i, '')
    .replace(/[^0-9]/g, '')
    .trim();
}

function posiblesTelefonos(telefono) {
  var base = normalizarTelefono(telefono);
  var lista = [];

  function agregar(valor) {
    if (!valor) return;
    if (lista.indexOf(valor) >= 0) return;
    lista.push(valor);
  }

  agregar(base);
  agregar('+' + base);
  agregar('whatsapp:' + base);
  agregar('whatsapp:+' + base);

  if (base.length === 12 && base.indexOf('57') === 0) {
    var local = base.slice(2);
    agregar(local);
    agregar('+' + local);
    agregar('whatsapp:' + local);
    agregar('whatsapp:+' + local);
  }

  if (base.length === 10) {
    agregar('57' + base);
    agregar('+57' + base);
    agregar('whatsapp:57' + base);
    agregar('whatsapp:+57' + base);
  }

  return lista;
}

async function buscarConductorPorTelefono(telefono) {
  var candidatos = posiblesTelefonos(telefono);
  if (!candidatos.length) return null;

  var resultado = await config.supabase
    .from(config.TABLES.conductores)
    .select('*')
    .in('telefono', candidatos)
    .eq('activo', true)
    .limit(5);

  if (!resultado.error && Array.isArray(resultado.data) && resultado.data.length) {
    return resultado.data[0];
  }

  var todos = await config.supabase
    .from(config.TABLES.conductores)
    .select('*')
    .eq('activo', true)
    .limit(2000);

  if (todos.error || !Array.isArray(todos.data)) {
    return null;
  }

  var base = normalizarTelefono(telefono);
  for (var i = 0; i < todos.data.length; i++) {
    var conductor = todos.data[i];
    if (normalizarTelefono(conductor.telefono) === base) {
      return conductor;
    }
  }

  return null;
}

async function cargarVehiculoYConductor(placa, telefono) {
  var placaNormalizada = preop.normalizarPlaca(placa);

  var resultado = await config.supabase
    .from(config.TABLES.vehiculos)
    .select('*')
    .eq('placa', placaNormalizada)
    .single();

  if (resultado.error || !resultado.data) {
    return { error: resultado.error || new Error('Vehiculo no encontrado'), vehiculo: null, conductor: null };
  }

  var conductor = await buscarConductorPorTelefono(telefono);
  return { error: null, vehiculo: resultado.data, conductor: conductor || null };
}

async function buscarPlacaSugerida(placaDetectada) {
  var placaBase = preop.normalizarPlaca(placaDetectada);
  if (!placaBase || placaBase.length < 5) return null;

  try {
    var resultado = await config.supabase
      .from(config.TABLES.vehiculos)
      .select('placa');

    if (resultado.error || !Array.isArray(resultado.data)) return null;

    var mejor = null;
    for (var i = 0; i < resultado.data.length; i++) {
      var placa = preop.normalizarPlaca(resultado.data[i].placa || '');
      if (!placa) continue;
      var distancia = distanciaPlaca(placaBase, placa);
      if (distancia === Number.MAX_SAFE_INTEGER) continue;
      if (!mejor || distancia < mejor.distancia) {
        mejor = { placa: placa, distancia: distancia };
      }
    }

    if (mejor && mejor.distancia <= 1) return mejor.placa;
  } catch (error) {
    console.error('Error buscando placa sugerida:', error.message);
  }

  return null;
}

module.exports = {
  cargarVehiculoYConductor,
  buscarPlacaSugerida,
  buscarConductorPorTelefono,
  normalizarTelefono,
  posiblesTelefonos,
  distanciaPlaca
};
