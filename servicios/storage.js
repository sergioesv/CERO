
function obtenerMediaUrls(req) {
  var total = parseInt(req.body.NumMedia || '0', 10) || 0;
  var urls = [];
  for (var i = 0; i < total; i++) {
    var url = req.body['MediaUrl' + i];
    if (url) urls.push(url);
  }
  return urls;
}

function limpiarFotosPorTipo(sesion, tipos) {
  sesion.fotos = (sesion.fotos || []).filter(function(foto) {
    return tipos.indexOf(foto.tipo) === -1;
  });
}

function guardarFotoUnica(sesion, foto) {
  limpiarFotosPorTipo(sesion, [foto.tipo]);
  sesion.fotos.push(foto);
}

module.exports = {
  obtenerMediaUrls,
  limpiarFotosPorTipo,
  guardarFotoUnica
};
