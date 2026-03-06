var GRUPOS = require('./grupos').GRUPOS;

function responderTwiml(res, mensaje) {
  var twiml = '<?xml version="1.0" encoding="UTF-8"?>';
  twiml += '<Response>';
  twiml += '<Message>' + mensaje + '</Message>';
  twiml += '</Response>';
  res.type('text/xml');
  res.send(twiml);
}

function generarResumen(sesion) {
  var resumen = 'Revision completa - RESUMEN ' + sesion.placa + '\n';
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
        var icono = item.estado === 2 ? '[!]' : '[X]';
        resumen += icono + ' ' + grupo.nombre + ' - ' + item.nombre;
        if (item.nota) resumen += ' . ' + item.nota;
        resumen += '\n';
      }
      for (var n = 0; n < itemsNA.length; n++) {
        resumen += '[ ] ' + grupo.nombre + ' - ' + itemsNA[n].nombre + ' N/A\n';
      }
    }
  }

  if (!hayNovedades) {
    resumen += 'Todo en buen estado - sin novedades';
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

module.exports = { responderTwiml, generarResumen, esCritico };
