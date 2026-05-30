'use strict';

// ============================================================================
// modulos/inspecciones/compartido/interpretadorNovedades.js
//
// Lógica de dominio para interpretar novedades de inspección vehicular.
// Responsabilidad única: recibir texto libre del conductor y mapear a ítems
// de una plantilla con su estado correspondiente.
//
// Extraído de servicios/ocr.js (cierra V-01 y V-02).
// servicios/ocr.js es infraestructura externa (Gemini API) — no debe contener
// lógica de dominio de inspecciones.
// ============================================================================

var STOPWORDS = new Set([
  'de', 'del', 'la', 'las', 'los', 'el', 'y', 'o', 'con', 'sin', 'estado', 'visible', 'visibles'
]);

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades de texto (privadas)
// ─────────────────────────────────────────────────────────────────────────────

function sinAcentos(texto) {
  return String(texto == null ? '' : texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function normalizarTexto(texto) {
  return sinAcentos(texto)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizar(texto) {
  var normalizado = normalizarTexto(texto);
  if (!normalizado) return [];
  return normalizado.split(' ').map(function(token) {
    return token.replace(/(es|s)$/g, '');
  }).filter(Boolean);
}

function textoIncluye(normalizado, terminos) {
  for (var i = 0; i < terminos.length; i++) {
    if (normalizado.indexOf(normalizarTexto(terminos[i])) >= 0) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Alias de ítems — vocabulario de sinónimos por componente vehicular
// ─────────────────────────────────────────────────────────────────────────────

function aliasPorItem(nombre) {
  var clave = normalizarTexto(nombre);
  var alias = new Set();
  alias.add(clave);

  tokenizar(nombre).forEach(function(token) {
    if (!STOPWORDS.has(token)) alias.add(token);
  });

  if (/aceite/.test(clave) && /motor/.test(clave)) ['aceite', 'motor'].forEach(function(v) { alias.add(v); });
  if (/refrigerante/.test(clave)) ['refrigerante', 'agua'].forEach(function(v) { alias.add(v); });
  if (/liquido/.test(clave) && /freno/.test(clave)) ['liquido frenos', 'liquido', 'freno', 'frenos'].forEach(function(v) { alias.add(v); });
  if (/fugas?/.test(clave)) ['fuga', 'fugas', 'goteo', 'goteando'].forEach(function(v) { alias.add(v); });
  if (/luces?|faros?/.test(clave)) ['luz', 'luces', 'faro', 'faros'].forEach(function(v) { alias.add(v); });
  if (/stops?|direccionales?/.test(clave)) ['stop', 'stops', 'direccional', 'direccionales'].forEach(function(v) { alias.add(v); });
  if (/pito|bocina/.test(clave) || (/alarma/.test(clave) && /reversa/.test(clave))) ['pito', 'alarma', 'reversa', 'corneta', 'bocina'].forEach(function(v) { alias.add(v); });
  if (/tablero/.test(clave)) ['tablero', 'instrumento', 'instrumentos', 'indicador', 'indicadores'].forEach(function(v) { alias.add(v); });
  if (/bater/.test(clave)) ['bateria', 'baterias'].forEach(function(v) { alias.add(v); });
  if (/parqueo/.test(clave) || (/freno/.test(clave) && /mano/.test(clave))) ['freno', 'frenos', 'parqueo', 'mano'].forEach(function(v) { alias.add(v); });
  if (/llanta/.test(clave) && !/repuesto/.test(clave)) ['llanta', 'llantas', 'neumatico', 'neumaticos'].forEach(function(v) { alias.add(v); });
  if (/perno/.test(clave)) ['perno', 'pernos', 'rueda', 'ruedas', 'tuerca', 'tuercas'].forEach(function(v) { alias.add(v); });
  if (/repuesto/.test(clave)) ['repuesto', 'respuesto', 'llanta repuesto', 'rueda repuesto'].forEach(function(v) { alias.add(v); });
  if (/cinturon/.test(clave)) ['cinturon', 'cinturones', 'seguridad'].forEach(function(v) { alias.add(v); });
  if (/retrovisor|espejo/.test(clave)) ['retrovisor', 'retrovisores', 'espejo', 'espejos'].forEach(function(v) { alias.add(v); });
  if (/pedal/.test(clave)) ['pedal', 'pedales'].forEach(function(v) { alias.add(v); });
  if (/vidrio|limpiabrisas|plumilla/.test(clave)) ['vidrio', 'vidrios', 'limpiabrisas', 'plumilla', 'plumillas'].forEach(function(v) { alias.add(v); });
  if (/aseo|limpieza/.test(clave)) ['aseo', 'limpieza', 'suelto', 'sueltos', 'elemento', 'elementos'].forEach(function(v) { alias.add(v); });
  if (/aire/.test(clave) && /acondicionado|acond/.test(clave)) ['aire', 'acondicionado', 'ac'].forEach(function(v) { alias.add(v); });
  if (/equipo/.test(clave) && /carretera/.test(clave)) ['equipo', 'carretera', 'botiquin', 'extintor', 'cono', 'conos'].forEach(function(v) { alias.add(v); });

  return Array.from(alias);
}

// ─────────────────────────────────────────────────────────────────────────────
// Matching de ítems
// ─────────────────────────────────────────────────────────────────────────────

function puntuarItem(segmentoNormalizado, tokensSegmento, itemNombre) {
  var alias = aliasPorItem(itemNombre);
  var score = 0;

  for (var i = 0; i < alias.length; i++) {
    var termino = alias[i];
    var terminoNormalizado = normalizarTexto(termino);
    if (!terminoNormalizado) continue;

    if (terminoNormalizado.indexOf(' ') >= 0) {
      if (segmentoNormalizado.indexOf(terminoNormalizado) >= 0) score += 4;
      continue;
    }

    var terminoToken = terminoNormalizado.replace(/(es|s)$/g, '');
    if (tokensSegmento.indexOf(terminoToken) >= 0) score += 2;
  }

  var nombreNormalizado = normalizarTexto(itemNombre);
  if (segmentoNormalizado === nombreNormalizado) score += 5;
  if (segmentoNormalizado.indexOf(nombreNormalizado) >= 0) score += 3;

  return score;
}

function encontrarMejorItem(segmento, items) {
  var segmentoNormalizado = normalizarTexto(segmento);
  if (!segmentoNormalizado) return null;

  var tokensSegmento = tokenizar(segmento);
  var mejor = null;
  var mejorScore = 0;

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var score = puntuarItem(segmentoNormalizado, tokensSegmento, item);
    if (score > mejorScore) {
      mejor = item;
      mejorScore = score;
    }
  }

  return mejorScore > 0 ? mejor : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Detección de estado del ítem
// ─────────────────────────────────────────────────────────────────────────────

function detectarEstado(segmento, itemNombre) {
  var texto = normalizarTexto(segmento);
  var item = normalizarTexto(itemNombre);

  if (!texto) return null;
  if (textoIncluye(texto, ['no aplica', 'n a', 'na'])) return 'N/A';
  if (textoIncluye(texto, ['ok', 'bien', 'bueno', 'buena', 'normal'])) return 'OK';

  var esNivel = /aceite|refrigerante|liquido frenos/.test(item);
  var esFugas = /fugas/.test(item);
  var esLlantas = /llanta/.test(item);
  var esElectrico = /luces|stop|direccionales|pito|alarma|tablero|baterias/.test(item);

  if (esNivel) {
    if (textoIncluye(texto, ['vacio', 'vacia', 'sin liquido', 'sin aceite'])) return 'Vacio';
    if (textoIncluye(texto, ['bajo', 'baja', 'poquito', 'poco', 'faltante'])) return 'Bajo';
  }

  if (esFugas && textoIncluye(texto, ['fuga', 'fugas', 'goteo', 'goteando', 'derrame', 'botando'])) {
    return 'Con fugas';
  }

  if (esLlantas) {
    if (textoIncluye(texto, ['sin presion', 'sin aire', 'baja presion', 'desinflada', 'desinflado', 'pinchada', 'pinchado'])) {
      return 'Sin presion';
    }
    if (textoIncluye(texto, ['desgastada', 'desgastado', 'lisa', 'lisas'])) return 'Desgastada';
    if (textoIncluye(texto, ['danada', 'dañada', 'danado', 'dañado', 'rota', 'roto', 'rajada', 'rajado', 'cuarteada', 'cuarteado'])) {
      return 'Danada';
    }
  }

  if (esElectrico) {
    if (textoIncluye(texto, ['intermitente'])) return 'Intermitente';
    if (textoIncluye(texto, ['no funciona', 'no sirve', 'no prende', 'apagada', 'apagado', 'fundida', 'fundido', 'quemada', 'quemado'])) {
      return 'No funciona';
    }
  }

  if (textoIncluye(texto, ['falta', 'faltante', 'ausente', 'no tiene'])) return 'Falta';
  if (textoIncluye(texto, ['flojo', 'floja', 'flojos', 'flojas'])) return 'Flojo';
  if (textoIncluye(texto, ['danado', 'dañado', 'danada', 'dañada', 'roto', 'rota', 'quebrado', 'quebrada', 'averiado', 'averiada'])) {
    return 'Danado';
  }
  if (textoIncluye(texto, ['malo', 'mala', 'malos', 'malas', 'mal estado', 'falla', 'fallando', 'deficiente'])) {
    return 'Mal estado';
  }

  // Fallback explícito: cualquier texto no reconocido se clasifica como Mal estado.
  // V-05: este fallback es intencional — documentado para revisión futura si se
  // necesita distinguir "texto irreconocible" de "estado malo confirmado".
  return 'Mal estado';
}

// ─────────────────────────────────────────────────────────────────────────────
// Segmentación e interpretación por reglas
// ─────────────────────────────────────────────────────────────────────────────

function separarSegmentos(texto) {
  var bruto = String(texto || '').replace(/[\n\r]+/g, ', ');
  return bruto
    .split(/,|;|\.|\s+y\s+|\s+e\s+|\//i)
    .map(function(parte) { return parte.trim(); })
    .filter(Boolean);
}

function interpretarNovedadPorReglas(texto, items) {
  var observacion = String(texto || '').trim();
  var resultado = [];
  var vistos = {};
  var segmentos = separarSegmentos(observacion);

  if (!segmentos.length && observacion) segmentos = [observacion];

  for (var i = 0; i < segmentos.length; i++) {
    var segmento = segmentos[i];
    var item = encontrarMejorItem(segmento, items);
    if (!item) {
      console.warn('[interpretadorNovedades] segmento sin match:', JSON.stringify(segmento), '| items bloque:', items.join(', '));
      continue;
    }
    if (vistos[item]) continue;

    vistos[item] = true;
    resultado.push({
      nombre: item,
      estado: detectarEstado(segmento, item)
    });
  }

  if (!resultado.length && observacion) {
    var itemGeneral = encontrarMejorItem(observacion, items);
    if (itemGeneral) {
      resultado.push({
        nombre: itemGeneral,
        estado: detectarEstado(observacion, itemGeneral)
      });
    }
  }

  return {
    items: resultado,
    observacion: observacion,
    fuente: 'reglas'
  };
}

function limpiarItemsInterpretados(parsed, items) {
  var itemsPermitidos = new Set(items);
  var vistos = {};
  var salida = [];

  (parsed && Array.isArray(parsed.items) ? parsed.items : []).forEach(function(item) {
    if (!item || !item.nombre || !itemsPermitidos.has(item.nombre)) return;
    if (vistos[item.nombre]) return;
    vistos[item.nombre] = true;
    salida.push({
      nombre: item.nombre,
      estado: item.estado || 'Mal estado'
    });
  });

  return {
    items: salida,
    observacion: parsed && parsed.observacion ? parsed.observacion : ''
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  aliasPorItem,
  encontrarMejorItem,
  detectarEstado,
  separarSegmentos,
  interpretarNovedadPorReglas,
  limpiarItemsInterpretados
};

if (process.env.NODE_ENV === 'test') {
  module.exports._test = {
    sinAcentos,
    normalizarTexto,
    tokenizar,
    puntuarItem
  };
}
