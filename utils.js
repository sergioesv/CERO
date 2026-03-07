var GRUPOS = require('./grupos').GRUPOS;

function responderTwiml(res, mensaje) {
  var twiml = '<?xml version="1.0" encoding="UTF-8"?>';
  twiml += '<Response>';
  twiml += '<Message>' + mensaje + '</Message>';
  twiml += '</Response>';
  res.type('text/xml');
  res.send(twiml);
}

function formatGrupoMsg(grupo, prefijo) {
  var msg = prefijo ? (prefijo + '\n\n') : '';
  msg += '*' + grupo.nombre + '*\n';
  msg += grupo.abreviado + '\n';
  msg += '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n';
  msg += '1\u20e3 Todo OK\n';
  msg += '2\u20e3 Novedad\n';
  msg += '3\u20e3 Atras';
  return msg;
}

function generarResumen(sesion) {
  var resumen = '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n';
  resumen += '*RESUMEN ' + sesion.placa + '*\n';
  resumen += '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n';
  var hayNovedades = false;

  for (var g = 0; g < GRUPOS.length; g++) {
    var grupo = GRUPOS[g];
    var respuesta = sesion.respuestas[grupo.id];
    if (!respuesta) continue;

    var itemsMalos = respuesta.items.filter(function(i) { return i.estado === 2 || i.estado === 3; });
    var itemsNA = respuesta.items.filter(function(i) { return i.estado === 4; });

    if (itemsMalos.length > 0 || itemsNA.length > 0) {
      hayNovedades = true;
      for (var m = 0; m < itemsMalos.length; m++) {
        var item = itemsMalos[m];
        var icono = item.estado === 3 ? '\u26a0\ufe0f' : '\u26a0\ufe0f';
        resumen += icono + ' *' + item.nombre + '* - ' + (item.descripcion_estado || (item.estado === 2 ? 'Atencion' : 'Critico'));
        if (item.nota) resumen += '\n    _' + item.nota + '_';
        resumen += '\n';
      }
      for (var n = 0; n < itemsNA.length; n++) {
        resumen += '\u25cb ' + itemsNA[n].nombre + ' - N/A\n';
      }
    }
  }

  if (!hayNovedades) {
    resumen += '\u2705 Todo en buen estado';
  }

  return resumen;
}

function esCritico(grupoId, itemNombre) {
  for (var g = 0; g < GRUPOS.length; g++) {
    if (GRUPOS[g].id === grupoId) {
      for (var i = 0; i < GRUPOS[g].items.length; i++) {
        if (GRUPOS[g].items[i].nombre === itemNombre) {
          return GRUPOS[g].items[i].critico;
        }
      }
    }
  }
  return false;
}

module.exports = { responderTwiml, generarResumen, esCritico, formatGrupoMsg };
