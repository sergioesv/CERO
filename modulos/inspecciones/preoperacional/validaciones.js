// ═══════════════════════════════════════════════════════════
// modulos/vehiculos/preoperacional/validaciones.js
// Definición de grupos, ítems, sub-preguntas de severidad
// y funciones de clasificación del preoperacional.
// CERO — v12 — Sistema de clasificación de novedades
// ═══════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────
// GRUPOS DE INSPECCIÓN — 20 ítems en 4 bloques
// Propiedades por ítem:
//   nombre         — nombre visible del ítem
//   critico        — true si el supervisor debe ser notificado
//   sinFoto        — true si no requiere foto de evidencia
//   sinValidacion  — true si no requiere validación visual de foto
//   nuncaBloquea   — true si aun siendo crítico, nunca bloquea el vehículo
//   subPregunta    — objeto con opciones de precisión cuando hay novedad
//     mensaje      — texto de la pregunta para el operario
//     opciones[]   — array de opciones numéricas
//       num        — número que escribe el operario (1, 2, 3)
//       texto      — texto descriptivo de la opción
//       severidad  — resultado: 'alerta' o 'bloqueo'
//       estado     — estado que se guarda en la novedad
// ───────────────────────────────────────────────────────────

// GRUPOS se obtienen dinámicamente de la plantilla del activo

// ───────────────────────────────────────────────────────────
// PASOS INICIALES — textos de instrucción para fotos
// ───────────────────────────────────────────────────────────

const PASOS_INICIALES = {
  fotoPlaca: 'Envia una foto frontal donde la placa ocupe buena parte de la imagen. Acercate un poco, con buena luz y sin reflejos.',
  fotoOdometro: 'Envia una foto de frente al display del odometro. Acercate al tablero para que el numero quede centrado y legible.'
};

// ───────────────────────────────────────────────────────────
// UTILIDADES DE FORMATO — TwiML desde módulo compartido
// ───────────────────────────────────────────────────────────

var twimlModule = require('../compartido/twiml');
var escaparXml = twimlModule.escaparXml;
var responderTwiml = twimlModule.responderTwiml;

function formatGrupoMsg(grupo, prefijo) {
  var msg = prefijo ? (prefijo + '\n\n') : '';
  msg += '*' + grupo.nombre + '*\n';
  msg += grupo.abreviado + '\n';
  msg += '───────────────\n';
  msg += '1️⃣ Todo OK\n';
  msg += '2️⃣ Novedad\n\n';
  msg += '0️⃣ _Atrás_  •  9️⃣ _Menú principal_';
  return msg;
}

function sinAcentos(texto) {
  return String(texto == null ? '' : texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizarPlaca(placa) {
  return sinAcentos(placa).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizarEstado(estado) {
  if (typeof estado === 'number') return estado;
  return sinAcentos(estado).toLowerCase().replace(/\s+/g, ' ').trim();
}

// ───────────────────────────────────────────────────────────
// CLASIFICACIÓN DE ESTADO — determina ok/advertencia/critico/na
// Usada por generarResumen y por el flujo al interpretar novedades
// ───────────────────────────────────────────────────────────

function clasificarEstado(estado) {
  if (typeof estado === 'number') {
    if (estado === 1) return 'ok';
    if (estado === 2) return 'advertencia';
    if (estado === 3) return 'critico';
    if (estado === 4) return 'na';
    return 'critico';
  }

  var est = normalizarEstado(estado);
  if (!est || est === 'ok' || est === 'funciona' || est === 'completo' || est === 'sin fugas' || est === 'normal' || est === 'bueno' || est === 'buena') {
    return 'ok';
  }

  if (est === 'n/a' || est === 'na' || est === 'no aplica' || est === 'no aplica.') {
    return 'na';
  }

  if (
    est === 'bajo' ||
    est === 'desgastada' ||
    est === 'desgastado' ||
    est === 'intermitente' ||
    est === 'incompleto' ||
    est === 'danado' ||
    est === 'dañado' ||
    est === 'dano' ||
    est === 'daño' ||
    est === 'duro o flojo' ||
    est === 'sin presion' ||
    est === 'sin presión' ||
    est === 'poca presion' ||
    est === 'flojo' ||
    est === 'baja'
  ) {
    return 'advertencia';
  }

  return 'critico';
}

// ───────────────────────────────────────────────────────────
// RESUMEN DE INSPECCIÓN — texto para WhatsApp antes de firmar
// ───────────────────────────────────────────────────────────

function generarResumen(sesion, grupos) {
  var resumen = '───────────────\n';
  resumen += '*RESUMEN ' + (sesion.placa || '') + '*\n';
  resumen += '───────────────\n';
  var hayNovedades = false;

  for (var g = 0; g < grupos.length; g++) {
    var grupo = grupos[g];
    var respuesta = sesion.respuestas[grupo.id];
    if (!respuesta || !Array.isArray(respuesta.items)) continue;

    for (var m = 0; m < respuesta.items.length; m++) {
      var item = respuesta.items[m];
      var clasificacion = clasificarEstado(item.estado);

      if (clasificacion === 'advertencia' || clasificacion === 'critico') {
        hayNovedades = true;
        // Mostrar severidad si tiene sub-respuesta (v12)
        var iconSeveridad = '⚠️';
        if (item.severidad === 'bloqueo') {
          iconSeveridad = '🚨';
        }
        resumen += iconSeveridad + ' *' + item.nombre + '* - ' + (item.estado || 'Con novedad');
        if (item.nota && item.nota !== item.estado) resumen += '\n    _' + item.nota + '_';
        resumen += '\n';
      }

      if (clasificacion === 'na') {
        hayNovedades = true;
        resumen += '○ ' + item.nombre + ' - N/A\n';
      }
    }
  }

  if (!hayNovedades) {
    resumen += '✅ Todo en buen estado';
  }

  return resumen;
}

// ───────────────────────────────────────────────────────────
// BÚSQUEDA DE ÍTEMS Y DEFINICIONES
// ───────────────────────────────────────────────────────────

function esCritico(grupoId, itemNombre, grupos) {
  if (!grupos) return false;
  for (var g = 0; g < grupos.length; g++) {
    if (grupos[g].id === grupoId) {
      for (var i = 0; i < grupos[g].items.length; i++) {
        if (grupos[g].items[i].nombre === itemNombre) {
          return !!grupos[g].items[i].critico;
        }
      }
    }
  }
  return false;
}

function construirMapaItems(grupos) {
  var mapa = {};
  if (!grupos) return mapa;
  for (var g = 0; g < grupos.length; g++) {
    for (var i = 0; i < grupos[g].items.length; i++) {
      mapa[grupos[g].items[i].nombre] = grupos[g].items[i];
    }
  }
  return mapa;
}

// ───────────────────────────────────────────────────────────
// obtenerDefinicionItem — busca la definición completa de un ítem
// por nombre, incluyendo subPregunta si tiene.
// Retorna el objeto del ítem o null si no existe.
// ───────────────────────────────────────────────────────────

function obtenerDefinicionItem(itemNombre, grupos) {
  if (!grupos) return null;
  for (var g = 0; g < grupos.length; g++) {
    for (var i = 0; i < grupos[g].items.length; i++) {
      if (grupos[g].items[i].nombre === itemNombre) {
        return grupos[g].items[i];
      }
    }
  }
  return null;
}

// ───────────────────────────────────────────────────────────
// tieneSubPregunta — verifica si un ítem necesita sub-pregunta
// de precisión cuando el operario reporta novedad.
// Retorna true/false.
// ───────────────────────────────────────────────────────────

function tieneSubPregunta(itemNombre, grupos) {
  var def = obtenerDefinicionItem(itemNombre, grupos);
  return !!(def && def.subPregunta);
}

// ───────────────────────────────────────────────────────────
// obtenerSubPregunta — retorna el objeto subPregunta de un ítem.
// Retorna null si el ítem no tiene sub-pregunta.
// ───────────────────────────────────────────────────────────

function obtenerSubPregunta(itemNombre, grupos) {
  var def = obtenerDefinicionItem(itemNombre, grupos);
  return (def && def.subPregunta) || null;
}

// ───────────────────────────────────────────────────────────
// formatSubPreguntaMsg — genera el mensaje de WhatsApp para
// la sub-pregunta de un ítem, con opciones numéricas y
// navegación estándar (0=atrás, 9=menú).
// ───────────────────────────────────────────────────────────

function formatSubPreguntaMsg(subPregunta, prefijo) {
  var numEmoji = { 1: '1️⃣', 2: '2️⃣', 3: '3️⃣', 4: '4️⃣' };
  var msg = prefijo ? (prefijo + '\n\n') : '';
  msg += subPregunta.mensaje + '\n';
  msg += '───────────────\n';
  for (var i = 0; i < subPregunta.opciones.length; i++) {
    var op = subPregunta.opciones[i];
    msg += (numEmoji[op.num] || op.num) + ' ' + op.texto + '\n';
  }
  msg += '\n0️⃣ _Atrás_  •  9️⃣ _Menú principal_';
  return msg;
}

// ───────────────────────────────────────────────────────────
// procesarRespuestaSubPregunta — valida la respuesta numérica
// del operario a una sub-pregunta y retorna la opción elegida.
// Retorna null si la respuesta no es válida.
// ───────────────────────────────────────────────────────────

function procesarRespuestaSubPregunta(subPregunta, respuesta) {
  // Extraer solo dígitos — funciona con "2", "2️⃣", "2 " etc.
  var limpio = String(respuesta || '').replace(/[^0-9]/g, '');
  var num = parseInt(limpio, 10);
  if (isNaN(num)) return null;

  for (var i = 0; i < subPregunta.opciones.length; i++) {
    if (subPregunta.opciones[i].num === num) {
      return subPregunta.opciones[i];
    }
  }
  return null;
}

// ───────────────────────────────────────────────────────────
// evaluarSeveridadNovedad — determina la severidad final de
// una novedad según la definición del ítem, el estado
// reportado y la sub-respuesta (si aplica).
//
// Retorna: 'informativo' | 'alerta' | 'bloqueo'
//
// Reglas (v12):
//   - Ítem no crítico → 'informativo'
//   - Ítem crítico + nuncaBloquea → máximo 'alerta'
//   - Ítem crítico + tiene sub-pregunta → severidad de la opción elegida
//   - Ítem crítico + sin sub-pregunta + estado malo → 'bloqueo' (binario)
//   - Ítem crítico + sin sub-pregunta + estado advertencia → 'alerta'
// ───────────────────────────────────────────────────────────

function evaluarSeveridadNovedad(itemNombre, estado, subRespuesta, grupos) {
  var def = obtenerDefinicionItem(itemNombre, grupos);

  // Ítem no encontrado o no crítico → informativo
  if (!def || !def.critico) {
    return 'informativo';
  }

  // Ítem con nuncaBloquea (ej: equipo carretera) → máximo alerta
  if (def.nuncaBloquea) {
    return 'alerta';
  }

  // Ítem con sub-pregunta → la severidad viene de la opción elegida
  if (def.subPregunta && subRespuesta) {
    return subRespuesta.severidad || 'alerta';
  }

  // Ítem crítico binario (sin sub-pregunta): funciona/no funciona
  // Se clasifica según el estado reportado
  var clasif = clasificarEstado(estado);
  if (clasif === 'critico') {
    return 'bloqueo';
  }
  if (clasif === 'advertencia') {
    return 'alerta';
  }

  return 'informativo';
}

// ───────────────────────────────────────────────────────────
// obtenerNovedadesConBloqueo — filtra las novedades de una
// sesión y retorna solo las que tienen severidad 'bloqueo'.
// Se usa al momento de la firma para determinar si el
// vehículo requiere autorización del supervisor.
// ───────────────────────────────────────────────────────────

function obtenerNovedadesConBloqueo(novedades) {
  return (novedades || []).filter(function(n) {
    return n.severidad === 'bloqueo';
  });
}

// ───────────────────────────────────────────────────────────
// FOTOS Y TELÉFONO — helpers existentes
// ───────────────────────────────────────────────────────────

function obtenerNovedadesFotografiables(novedades, grupos) {
  var mapaItems = construirMapaItems(grupos);
  return (novedades || []).filter(function(novedad) {
    var definicion = mapaItems[novedad.item];
    return !definicion || !definicion.sinFoto;
  });
}

function ocultarTelefono(telefono) {
  var limpio = String(telefono || '').replace('whatsapp:', '');
  if (limpio.length <= 4) return limpio;
  return limpio.slice(0, 3) + '***' + limpio.slice(-2);
}


// ───────────────────────────────────────────────────────────
// EXPORTS
// ───────────────────────────────────────────────────────────

module.exports = {
  // Datos
  PASOS_INICIALES,
  // Formato y comunicación
  responderTwiml,
  escaparXml,
  formatGrupoMsg,
  formatSubPreguntaMsg,
  // Normalización
  normalizarPlaca,
  normalizarEstado,
  sinAcentos,
  // Clasificación de estado (existente)
  clasificarEstado,
  // Clasificación de severidad (v12 — nuevo)
  evaluarSeveridadNovedad,
  obtenerNovedadesConBloqueo,
  // Búsqueda de ítems
  esCritico,
  obtenerDefinicionItem,
  tieneSubPregunta,
  obtenerSubPregunta,
  procesarRespuestaSubPregunta,
  // Resumen e inspección
  generarResumen,
  obtenerNovedadesFotografiables,
  // Utilidades
  ocultarTelefono
};
