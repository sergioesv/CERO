function obtenerNovedadesCriticas(novedades) {
  return (novedades || []).filter(function(novedad) {
    return !!(novedad && novedad.critico);
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

function construirAlertasPosoperacional(contexto) {
  var alertas = [];
  var novedadesCriticas = obtenerNovedadesCriticas(contexto.novedades);

  novedadesCriticas.forEach(function(novedad) {
    alertas.push({
      origen: 'posoperacional',
      placa: contexto.placa,
      criticidad: novedad.severidad === 'alta' ? 'alta' : 'media',
      tipo: 'novedad_critica_posop',
      titulo: 'Novedad crítica al cierre de jornada',
      mensaje: contexto.placa + ': ' + novedad.item + ' - ' + (novedad.estado || 'Con novedad'),
      payload: {
        categoria: novedad.categoria || null,
        item: novedad.item,
        estado: novedad.estado || null,
        textoOriginal: novedad.texto_original || null,
        posoperacionalId: contexto.posoperacionalId || null
      }
    });
  });

  (contexto.alertasKm || []).forEach(function(alertaKm) {
    alertas.push({
      origen: 'posoperacional',
      placa: contexto.placa,
      criticidad: 'media',
      tipo: 'inconsistencia_kilometraje',
      titulo: 'Inconsistencia de kilometraje en cierre de jornada',
      mensaje: contexto.placa + ': ' + (alertaKm.mensaje || 'Alerta de kilometraje'),
      payload: {
        alerta: alertaKm,
        posoperacionalId: contexto.posoperacionalId || null
      }
    });
  });

  return alertas;
}

function consolidarAlertas(alertas) {
  return (alertas || []).filter(function(alerta) {
    return alerta && alerta.tipo;
  });
}

module.exports = {
  obtenerNovedadesCriticas,
  construirAlertasPreoperacional,
  construirAlertasPosoperacional,
  consolidarAlertas
};
