function obtenerNovedadesCriticas(novedades) {
  return (novedades || []).filter(function(novedad) {
    return !!novedad.critico;
  });
}

function construirAlertasPreoperacional(contexto) {
  var novedadesCriticas = obtenerNovedadesCriticas(contexto.novedades);
  return novedadesCriticas.map(function(novedad) {
    return {
      origen: 'preoperacional',
      placa: contexto.placa,
      criticidad: 'alta',
      tipo: 'novedad_critica',
      titulo: 'Novedad critica detectada',
      mensaje: contexto.placa + ': ' + novedad.item + ' - ' + (novedad.estado || 'Con novedad'),
      payload: {
        grupo: novedad.grupo,
        item: novedad.item,
        estado: novedad.estado,
        nota: novedad.nota || null,
        preoperacionalId: contexto.preoperacionalId || null
      }
    };
  });
}

function consolidarAlertas(alertas) {
  return (alertas || []).filter(function(alerta) {
    return alerta && alerta.tipo;
  });
}

module.exports = {
  obtenerNovedadesCriticas,
  construirAlertasPreoperacional,
  consolidarAlertas
};
