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

async function cargarVehiculoYConductor(placa, telefono) {
  var resultado = await config.supabase
    .from(config.TABLES.vehiculos)
    .select('*')
    .eq('placa', placa)
    .single();

  if (resultado.error || !resultado.data) {
    return { error: resultado.error || new Error('Vehiculo no encontrado'), vehiculo: null, conductor: null };
  }

  var resConductor = await config.supabase
    .from(config.TABLES.conductores)
    .select('*')
    .eq('telefono', telefono.replace('whatsapp:', ''))
    .single();

  return { error: null, vehiculo: resultado.data, conductor: resConductor.data || null };
}

async function buscarPlacaSugerida(placaDetectada) {
  // FIX: mantener normalización local antes de invocar la RPC para conservar el comportamiento actual.
  var placaBase = preop.normalizarPlaca(placaDetectada);
  if (!placaBase || placaBase.length < 5) return null;

  // FIX: reemplazar la búsqueda masiva en memoria por la función RPC buscar_placa_similar en Supabase.
  const { data, error } = await config.supabase
    .rpc('buscar_placa_similar', { placa_input: placaBase });

  // FIX: retornar null si la RPC falla o no encuentra coincidencias.
  if (error || !data || !data.length) return null;

  // FIX: devolver la placa más similar retornada por la función SQL.
  return data[0].placa;
}

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
  distanciaPlaca
};