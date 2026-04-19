/**
 * interpretacion.js — Interpretación local de novedades del preoperacional.
 * Matching por reglas (sin IA) de texto libre contra items de inspección.
 * Extraído de flujo.js para separar responsabilidades.
 * CERO — Gestión de Operaciones de Campo
 */

'use strict';

// ───────────────────────────────────────────────────────────
// NORMALIZACIÓN
// ───────────────────────────────────────────────────────────

function normalizarTextoBase(texto) {
  return String(texto == null ? '' : texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ───────────────────────────────────────────────────────────
// ALIAS POR ÍTEM — sinónimos y variaciones
// ───────────────────────────────────────────────────────────

function aliasExtrasPorItem(nombre) {
  var clave = normalizarTextoBase(nombre);
  if (clave === 'aceite motor') return ['aceite', 'motor', 'aceite motor', 'derrame aceite', 'aceite derramado'];
  if (clave === 'refrigerante') return ['refrigerante', 'agua', 'agua visible', 'fuga de agua', 'agua derramada'];
  if (clave === 'liquido frenos') return ['liquido frenos', 'liquido de frenos', 'freno', 'frenos', 'liquido'];
  if (clave === 'fugas visibles') return ['fuga', 'fugas', 'goteo', 'goteando', 'botando', 'derrame', 'derramado', 'visible', 'visibles'];
  if (clave === 'luces delanteras traseras') return ['luz', 'luces', 'faro', 'farola', 'delantera', 'trasera'];
  if (clave === 'stops y direccionales') return ['stop', 'stops', 'direccional', 'direccionales', 'cocuyo', 'cocuyos'];
  if (clave === 'pito y alarma reversa') return ['pito', 'alarma', 'reversa', 'bocina', 'corneta'];
  if (clave === 'tablero instrumentos') return ['tablero', 'instrumento', 'instrumentos', 'testigo', 'indicador'];
  if (clave === 'baterias') return ['bateria', 'baterias'];
  if (clave === 'freno de parqueo') return ['freno', 'parqueo', 'mano'];
  if (clave === 'estado llantas') return ['llanta', 'llantas', 'neumatico', 'neumaticos', 'rueda', 'ruedas'];
  if (clave === 'pernos de ruedas') return ['perno', 'pernos', 'rueda', 'ruedas', 'tuerca', 'tuercas'];
  if (clave === 'llanta repuesto') return ['repuesto', 'llanta repuesto', 'rueda repuesto'];
  if (clave === 'cinturones seguridad') return ['cinturon', 'cinturones', 'seguridad'];
  if (clave === 'retrovisores') return ['retrovisor', 'retrovisores', 'espejo', 'espejos'];
  if (clave === 'pedales') return ['pedal', 'pedales'];
  if (clave === 'vidrios y limpiabrisas') return ['vidrio', 'vidrios', 'limpiabrisas', 'plumilla', 'plumillas', 'parabrisas'];
  if (clave === 'aseo y elementos sueltos') return ['aseo', 'limpieza', 'suelto', 'sueltos', 'elementos'];
  if (clave === 'aire acondicionado') return ['aire', 'acondicionado', 'ac'];
  if (clave === 'equipo carretera') return ['equipo', 'carretera', 'botiquin', 'extintor', 'cono', 'conos'];
  return [];
}

// ───────────────────────────────────────────────────────────
// SCORING — puntaje de matching entre segmento e ítem
// ───────────────────────────────────────────────────────────

function puntuarItemLocal(segmento, itemNombre) {
  var normalizado = normalizarTextoBase(segmento);
  var nombreNormalizado = normalizarTextoBase(itemNombre);
  var alias = [nombreNormalizado].concat(aliasExtrasPorItem(itemNombre));
  var score = 0;

  for (var i = 0; i < alias.length; i++) {
    var termino = normalizarTextoBase(alias[i]);
    if (!termino) continue;
    if (normalizado.indexOf(termino) >= 0) {
      score += termino.indexOf(' ') >= 0 ? 3 : 2;
    }
  }

  return score;
}

// ───────────────────────────────────────────────────────────
// DETECCIÓN DE ESTADO — clasifica el texto en un estado
// ───────────────────────────────────────────────────────────

function detectarEstadoLocal(texto) {
  var t = normalizarTextoBase(texto);
  if (!t) return 'Mal estado';
  if (/fuga|fugas|goteo|goteando|botando|derrame|derramado/.test(t)) return 'Con fugas';
  if (/no funciona|no prende|apagad|fundid|sin luz|sin luces/.test(t)) return 'No funciona';
  if (/bajo|vacio|vacia|faltante|falta|sin /.test(t)) return 'Bajo';
  if (/desgastad|lisa|lisas/.test(t)) return 'Desgastada';
  if (/sin aire|sin presion|desinflad|pinchad/.test(t)) return 'Sin presion';
  if (/flojo|floja/.test(t)) return 'Flojo';
  if (/danad|roto|rota|quebrad|partid|averiad|malo|mala|falla/.test(t)) return 'Mal estado';
  return 'Mal estado';
}

// ───────────────────────────────────────────────────────────
// INTERPRETACIÓN — matchea texto libre contra items de grupo
// ───────────────────────────────────────────────────────────

function interpretarNovedadLocal(texto, grupo) {
  var observacion = String(texto || '').trim();
  var segmentos = observacion
    .replace(/[\n\r]+/g, ', ')
    .split(/,|;|\.|\s+y\s+|\s+e\s+|\//i)
    .map(function(parte) { return parte.trim(); })
    .filter(Boolean);

  if (!segmentos.length && observacion) segmentos = [observacion];

  var vistos = {};
  var salida = [];

  for (var i = 0; i < segmentos.length; i++) {
    var segmento = segmentos[i];
    var mejorItem = null;
    var mejorScore = 0;

    for (var j = 0; j < grupo.items.length; j++) {
      var itemNombre = grupo.items[j].nombre;
      var score = puntuarItemLocal(segmento, itemNombre);
      if (score > mejorScore) {
        mejorScore = score;
        mejorItem = itemNombre;
      }
    }

    if (!mejorItem || mejorScore <= 0 || vistos[mejorItem]) continue;
    vistos[mejorItem] = true;
    salida.push({
      nombre: mejorItem,
      estado: detectarEstadoLocal(segmento)
    });
  }

  if (!salida.length && observacion) {
    var mejorItemGeneral = null;
    var mejorScoreGeneral = 0;
    for (var k = 0; k < grupo.items.length; k++) {
      var nombreItem = grupo.items[k].nombre;
      var scoreGeneral = puntuarItemLocal(observacion, nombreItem);
      if (scoreGeneral > mejorScoreGeneral) {
        mejorScoreGeneral = scoreGeneral;
        mejorItemGeneral = nombreItem;
      }
    }

    if (mejorItemGeneral && mejorScoreGeneral > 0) {
      salida.push({
        nombre: mejorItemGeneral,
        estado: detectarEstadoLocal(observacion)
      });
    }
  }

  return {
    items: salida,
    observacion: observacion,
    fuente: 'reglas_locales'
  };
}

module.exports = {
  normalizarTextoBase: normalizarTextoBase,
  aliasExtrasPorItem: aliasExtrasPorItem,
  puntuarItemLocal: puntuarItemLocal,
  detectarEstadoLocal: detectarEstadoLocal,
  interpretarNovedadLocal: interpretarNovedadLocal
};
