function notificarCriticas(placa, novedadesCriticas) {
  if (!novedadesCriticas || !novedadesCriticas.length) {
    return { enviados: 0, canal: 'ninguno' };
  }

  var mensaje = 'ALERTA SUPERVISOR: ' + novedadesCriticas.length + ' items criticos en ' + placa;
  console.log(mensaje);

  return {
    enviados: novedadesCriticas.length,
    canal: process.env.ALERTAS_CANAL || 'log',
    mensaje: mensaje
  };
}

function notificarAlertas(alertas) {
  var limpias = (alertas || []).filter(Boolean);
  limpias.forEach(function(alerta) {
    console.log('[ALERTA]', alerta.tipo, alerta.placa || '', alerta.mensaje || '');
  });

  return {
    enviados: limpias.length,
    canal: process.env.ALERTAS_CANAL || 'log'
  };
}

module.exports = {
  notificarCriticas,
  notificarAlertas
};
