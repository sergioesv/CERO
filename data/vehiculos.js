var config = require('../config/config');
var preop = require('../modulos/vehiculos/preoperacional/validaciones');

/**
 * Calcula el costo de sustitución entre dos caracteres de placa,
 * considerando errores comunes de OCR.
 */
function costoCaracterPlaca(a, b) {
  if (a === b) return 0;
  var confusiones = {
    '0': ['O', 'Q', 'D'], 'O': ['0', 'Q', 'D'], 'Q': ['0', 'O'],
    '1': ['I', 'L'], 'I': ['1', 'L'], 'L': ['1', 'I'],
    '2': ['Z'], 'Z': ['2'], '5': ['S'], 'S': ['5'],
    '6': ['G'], 'G': ['6'], '7': ['T'], 'T': ['7'],
    '8': ['B'], 'B': ['8']
  };
  return (confusiones[a] && confusiones[a].indexOf(b) >= 0) ? 0.35 : 1;
}

/**
 * Calcula la distancia de similitud entre dos números de placa.
 */
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

/**
 * Carga los datos del vehículo y el conductor asociado desde Supabase.
 */
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

/**
 * Busca una placa similar en la base de datos usando una función RPC en Supabase.
 */
async function buscarPlacaSugerida(placaDetectada) {
  try {
    var placaBase = preop.normalizarPlaca(placaDetectada);
    if (!placaBase || placaBase.length < 5) return null;

    const { data, error } = await config.supabase
      .rpc('buscar_placa_similar', { placa_input: placaBase });

    if (error || !data || !data.length) return null;

    return data[0].placa;
  } catch (error) {
    console.error('Error buscando placa sugerida:', error.message);
    return null;
  }
}

module.exports = {
  cargarVehiculoYConductor,
  buscarPlacaSugerida,
  distanciaPlaca
};
