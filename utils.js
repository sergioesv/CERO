var GRUPOS = require('./grupos').GRUPOS;

function escaparXml(valor) {
  return String(valor == null ? '' : valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function responderTwiml(res, mensaje) {
  var twiml = '<?xml version="1.0" encoding="UTF-8"?>';
  twiml += '<Response>';
  twiml += '<Message>' + escaparXml(mensaje) + '</Message>';
  twiml += '</Response>';
  res.type('text/xml');
  res.send(twiml);
}

function formatGrupoMsg(grupo, prefijo) {
  var msg = prefijo ? (prefijo + '\n\n') : '';
  msg += '*' + grupo.nombre + '*\n';
  msg += grupo.abreviado + '\n';
  msg += '───────────────\n';
  msg += '1⃣ Todo OK\n';
  msg += '2⃣ Novedad\n';
  msg += '3⃣ Atras';
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

function generarResumen(sesion) {
  var resumen = '───────────────\n';
  resumen += '*RESUMEN ' + (sesion.placa || '') + '*\n';
  resumen += '───────────────\n';
  var hayNovedades = false;

  for (var g = 0; g < GRUPOS.length; g++) {
    var grupo = GRUPOS[g];
    var respuesta = sesion.respuestas[grupo.id];
    if (!respuesta || !Array.isArray(respuesta.items)) continue;

    for (var m = 0; m < respuesta.items.length; m++) {
      var item = respuesta.items[m];
      var clasificacion = clasificarEstado(item.estado);

      if (clasificacion === 'advertencia' || clasificacion === 'critico') {
        hayNovedades = true;
        resumen += '⚠️ *' + item.nombre + '* - ' + (item.estado || 'Con novedad');
        if (item.nota) resumen += '\n    _' + item.nota + '_';
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

function esCritico(grupoId, itemNombre) {
  for (var g = 0; g < GRUPOS.length; g++) {
    if (GRUPOS[g].id === grupoId) {
      for (var i = 0; i < GRUPOS[g].items.length; i++) {
        if (GRUPOS[g].items[i].nombre === itemNombre) {
          return !!GRUPOS[g].items[i].critico;
        }
      }
    }
  }
  return false;
}

function construirMapaItems() {
  var mapa = {};
  for (var g = 0; g < GRUPOS.length; g++) {
    for (var i = 0; i < GRUPOS[g].items.length; i++) {
      mapa[GRUPOS[g].items[i].nombre] = GRUPOS[g].items[i];
    }
  }
  return mapa;
}

function obtenerNovedadesFotografiables(novedades) {
  var mapaItems = construirMapaItems();
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

module.exports = {
  responderTwiml,
  generarResumen,
  esCritico,
  formatGrupoMsg,
  escaparXml,
  normalizarPlaca,
  normalizarEstado,
  clasificarEstado,
  obtenerNovedadesFotografiables,
  ocultarTelefono
};
