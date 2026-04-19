var config = require('../../../config/config');
var ocr = require('../../../servicios/ocr');
var twiml = require('../compartido/twiml');

var MAX_KM_SALTO_POSOP = config.MAX_KM_SALTO;

var CATALOGO_NOVEDADES = [
  {
    item: 'Luces delanteras/traseras',
    categoria: 'luces',
    critico: true,
    severidadBase: 'alta',
    requiereFoto: true,
    alias: ['luz', 'luces', 'faro', 'farola', 'trasera', 'delantera', 'stop', 'stops', 'direccional', 'direccionales']
  },
  {
    item: 'Estado llantas',
    categoria: 'llantas',
    critico: true,
    severidadBase: 'alta',
    requiereFoto: true,
    alias: ['llanta', 'llantas', 'neumatico', 'neumaticos', 'rin', 'rines', 'rodillo', 'rueda', 'ruedas', 'pinchada', 'desgaste']
  },
  {
    item: 'Freno de parqueo',
    categoria: 'frenos',
    critico: true,
    severidadBase: 'alta',
    requiereFoto: false,
    alias: ['freno', 'frenos', 'parqueo', 'frenado', 'pedal de freno']
  },
  {
    item: 'Suspension / direccion',
    categoria: 'suspension',
    critico: true,
    severidadBase: 'alta',
    requiereFoto: true,
    alias: ['suspension', 'direccion', 'vibracion', 'vibra', 'sonido', 'ruido', 'rodamiento', 'alineacion', 'desalineado']
  },
  {
    item: 'Motor / fugas',
    categoria: 'motor',
    critico: true,
    severidadBase: 'alta',
    requiereFoto: true,
    alias: ['motor', 'aceite', 'refrigerante', 'fuga', 'fugas', 'goteo', 'goteando', 'humo', 'temperatura', 'calienta']
  },
  {
    item: 'Baterias',
    categoria: 'electrico',
    critico: true,
    severidadBase: 'media',
    requiereFoto: true,
    alias: ['bateria', 'baterias', 'corriente', 'electrico', 'electrica', 'arranque']
  },
  {
    item: 'Tablero instrumentos',
    categoria: 'tablero',
    critico: false,
    severidadBase: 'media',
    requiereFoto: true,
    alias: ['tablero', 'testigo', 'indicador', 'indicadores', 'alarma', 'alarma tablero']
  },
  {
    item: 'Retrovisores',
    categoria: 'cabina',
    critico: true,
    severidadBase: 'media',
    requiereFoto: true,
    alias: ['retrovisor', 'retrovisores', 'espejo', 'espejos']
  },
  {
    item: 'Vidrios y limpiabrisas',
    categoria: 'carroceria',
    critico: false,
    severidadBase: 'media',
    requiereFoto: true,
    alias: ['vidrio', 'vidrios', 'parabrisas', 'limpiabrisas', 'plumilla', 'plumillas']
  },
  {
    item: 'Carroceria general',
    categoria: 'carroceria',
    critico: false,
    severidadBase: 'media',
    requiereFoto: true,
    alias: ['carroceria', 'golpe', 'golpes', 'rayon', 'rayones', 'abolladura', 'abollado', 'bumper', 'parachoques', 'guardabarro', 'puerta', 'capo']
  },
  {
    item: 'Cabina / interiores',
    categoria: 'cabina',
    critico: false,
    severidadBase: 'baja',
    requiereFoto: true,
    alias: ['cabina', 'interior', 'asiento', 'silla', 'cinturon', 'cinturones', 'tapiceria']
  },
  {
    item: 'Equipo carretera',
    categoria: 'equipo',
    critico: true,
    severidadBase: 'media',
    requiereFoto: true,
    alias: ['equipo carretera', 'extintor', 'botiquin', 'cono', 'conos', 'gata', 'herramienta', 'herramientas']
  },
  {
    item: 'Otro',
    categoria: 'otro',
    critico: false,
    severidadBase: 'media',
    requiereFoto: true,
    alias: ['otro']
  }
];

var MAPA_IA = {
  'Luces delanteras/traseras': 'Luces delanteras/traseras',
  'Stops y direccionales': 'Luces delanteras/traseras',
  'Estado llantas': 'Estado llantas',
  'Freno de parqueo': 'Freno de parqueo',
  'Retrovisores': 'Retrovisores',
  'Vidrios y limpiabrisas': 'Vidrios y limpiabrisas',
  'Tablero instrumentos': 'Tablero instrumentos',
  'Baterias': 'Baterias',
  'Equipo carretera': 'Equipo carretera',
  'Aceite motor': 'Motor / fugas',
  'Refrigerante': 'Motor / fugas',
  'Liquido frenos': 'Motor / fugas',
  'Fugas visibles': 'Motor / fugas'
};

var ITEMS_FALLBACK_IA = Object.keys(MAPA_IA);

var responderTwiml = twiml.responderTwiml;

function sinAcentos(texto) {
  return String(texto == null ? '' : texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizarTexto(texto) {
  return sinAcentos(texto)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizarPlaca(placa) {
  return sinAcentos(placa).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function scoreCatalogo(textoNormalizado, entrada) {
  var puntaje = 0;
  for (var i = 0; i < entrada.alias.length; i++) {
    var alias = normalizarTexto(entrada.alias[i]);
    if (!alias) continue;
    if (textoNormalizado.indexOf(alias) >= 0) puntaje += alias.indexOf(' ') >= 0 ? 3 : 2;
  }
  return puntaje;
}

function detectarEstado(texto) {
  var t = normalizarTexto(texto);
  if (!t) return 'Con novedad';
  if (/no funciona|no prende|apagada|apagado|fundida|fundido|sin luz|sin luces/.test(t)) return 'No funciona';
  if (/fuga|fugas|goteo|goteando|botando/.test(t)) return 'Con fugas';
  if (/sonido raro|ruido|zumbido|vibracion|vibra|traquea|traqueteo/.test(t)) return 'Sonido anormal';
  if (/pinchad|sin aire|sin presion|desinflad/.test(t)) return 'Sin presion';
  if (/desgastad|lisa|lisas/.test(t)) return 'Desgastada';
  if (/rajad|reventad|quebrad|partid/.test(t)) return 'Danado';
  if (/danad|dañad|roto|rota|golpe|abollad|rayad|averiad/.test(t)) return 'Danado';
  if (/falta|faltante|ausente|sin /.test(t)) return 'Falta';
  if (/testigo|alarma|indicador/.test(t)) return 'Alerta en tablero';
  return 'Con novedad';
}

function calcularSeveridad(texto, entrada) {
  var t = normalizarTexto(texto);
  if (/freno|frenos|fuga|fugas|sin presion|pinchad|reventad|no funciona|apagada|apagado/.test(t)) {
    return 'alta';
  }
  if (/sonido raro|ruido|vibracion|danad|dañad|golpe|averiad/.test(t)) {
    return entrada.critico ? 'alta' : 'media';
  }
  return entrada.severidadBase || (entrada.critico ? 'alta' : 'media');
}

function clonarNovedadBase(item) {
  for (var i = 0; i < CATALOGO_NOVEDADES.length; i++) {
    if (CATALOGO_NOVEDADES[i].item === item) {
      return Object.assign({}, CATALOGO_NOVEDADES[i]);
    }
  }
  return Object.assign({}, CATALOGO_NOVEDADES[CATALOGO_NOVEDADES.length - 1]);
}

function crearNovedad(textoOriginal, item, estado, fuente) {
  var base = clonarNovedadBase(item);
  return {
    id: 'nov_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
    texto_original: String(textoOriginal || '').trim(),
    categoria: base.categoria,
    item: base.item,
    estado: estado || detectarEstado(textoOriginal),
    critico: !!base.critico,
    severidad: calcularSeveridad(textoOriginal, base),
    requiereFoto: base.requiereFoto !== false,
    foto_requerida: base.requiereFoto !== false,
    fuente: fuente || 'reglas'
  };
}

function interpretarPorReglas(texto) {
  var textoOriginal = String(texto || '').trim();
  var normalizado = normalizarTexto(textoOriginal);
  if (!normalizado) return [];

  var mejor = null;
  var mejorScore = 0;
  for (var i = 0; i < CATALOGO_NOVEDADES.length; i++) {
    var actual = CATALOGO_NOVEDADES[i];
    var puntaje = scoreCatalogo(normalizado, actual);
    if (puntaje > mejorScore) {
      mejor = actual;
      mejorScore = puntaje;
    }
  }

  if (!mejor || mejorScore <= 0) {
    return [crearNovedad(textoOriginal, 'Otro', detectarEstado(textoOriginal), 'reglas')];
  }

  return [crearNovedad(textoOriginal, mejor.item, detectarEstado(textoOriginal), 'reglas')];
}

async function interpretarNovedadLibre(texto) {
  var porReglas = interpretarPorReglas(texto);
  if (porReglas.length && porReglas[0].item !== 'Otro') {
    return porReglas;
  }

  try {
    var interpretado = await ocr.interpretarNovedad(texto, ITEMS_FALLBACK_IA);
    var items = (interpretado && Array.isArray(interpretado.items)) ? interpretado.items : [];
    if (!items.length) {
      return porReglas;
    }

    var salida = [];
    for (var i = 0; i < items.length; i++) {
      var itemIa = items[i];
      var itemMapeado = MAPA_IA[itemIa.nombre] || 'Otro';
      salida.push(crearNovedad(texto, itemMapeado, itemIa.estado || detectarEstado(texto), interpretado.fuente || 'ia'));
    }

    return salida.length ? salida : porReglas;
  } catch (error) {
    console.error('Error interpretando novedad posoperacional:', error.message || error);
    return porReglas;
  }
}

function validarKilometrajeFinal(kmFinal, referencia, maxSalto) {
  var valorMaximo = parseInt(maxSalto || MAX_KM_SALTO_POSOP, 10) || MAX_KM_SALTO_POSOP;
  var resultado = {
    kilometrajeFinal: kmFinal,
    kmReferencia: referencia && typeof referencia.kilometraje === 'number' ? referencia.kilometraje : null,
    diferenciaKm: null,
    inconsistenciaKm: false,
    alertasKm: []
  };

  if (typeof kmFinal !== 'number' || isNaN(kmFinal)) {
    resultado.inconsistenciaKm = true;
    resultado.alertasKm.push({ tipo: 'KM_INVALIDO', mensaje: 'Kilometraje invalido' });
    return resultado;
  }

  if (typeof resultado.kmReferencia === 'number') {
    resultado.diferenciaKm = kmFinal - resultado.kmReferencia;

    if (resultado.diferenciaKm < 0) {
      resultado.inconsistenciaKm = true;
      resultado.alertasKm.push({
        tipo: 'KM_MENOR',
        mensaje: 'Kilometraje final menor al ultimo registro',
        valor_referencia: resultado.kmReferencia,
        valor_reportado: kmFinal,
        diferencia: resultado.diferenciaKm
      });
    }

    if (resultado.diferenciaKm > valorMaximo) {
      resultado.inconsistenciaKm = true;
      resultado.alertasKm.push({
        tipo: 'SALTO_ALTO',
        mensaje: 'Kilometraje muy superior al esperado para una jornada',
        valor_referencia: resultado.kmReferencia,
        valor_reportado: kmFinal,
        diferencia: resultado.diferenciaKm,
        umbral: valorMaximo
      });
    }
  }

  return resultado;
}

function obtenerNovedadesCriticas(novedades) {
  return (novedades || []).filter(function(novedad) {
    return !!(novedad && novedad.critico);
  });
}

function generarResumenPosoperacional(sesion) {
  var resumen = '───────────────\n';
  resumen += '🏁 *RESUMEN POSOPERACIONAL*\n';
  resumen += '───────────────\n';
  resumen += '🚗 Vehiculo: *' + (sesion.placa || 'N/R') + '*\n';
  resumen += '📏 Kilometraje final: *' + ((sesion.kilometrajeFinal || 0).toLocaleString('es-CO')) + ' km*\n';

  if (typeof sesion.kmReferencia === 'number') {
    resumen += '📍 Referencia: ' + sesion.kmReferencia.toLocaleString('es-CO') + ' km';
    if (typeof sesion.diferenciaKm === 'number') {
      resumen += ' (' + (sesion.diferenciaKm >= 0 ? '+' : '') + sesion.diferenciaKm.toLocaleString('es-CO') + ' km)';
    }
    resumen += '\n';
  }

  if (sesion.inconsistenciaKm && sesion.alertasKm && sesion.alertasKm.length) {
    resumen += '⚠️ Alertas km: *' + sesion.alertasKm.length + '*\n';
  }

  if (sesion.novedades && sesion.novedades.length) {
    resumen += '🛠️ Novedades: *' + sesion.novedades.length + '*\n';
    sesion.novedades.forEach(function(novedad) {
      resumen += '• ' + novedad.item + ' - ' + (novedad.estado || 'Con novedad') + '\n';
    });
  } else if (sesion.novedadesTexto) {
    resumen += '🛠️ Novedades: _' + sesion.novedadesTexto + '_\n';
  } else {
    resumen += '✅ Sin novedades reportadas\n';
  }

  if (sesion.observacion) {
    resumen += '💬 _' + sesion.observacion + '_\n';
  }

  return resumen.trim();
}

module.exports = {
  CATALOGO_NOVEDADES,
  MAX_KM_SALTO_POSOP,
  responderTwiml,
  normalizarTexto,
  normalizarPlaca,
  interpretarNovedadLibre,
  validarKilometrajeFinal,
  obtenerNovedadesCriticas,
  generarResumenPosoperacional
};
