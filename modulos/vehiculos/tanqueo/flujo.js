var config = require('../../../config/config');
var visual = require('../compartido/validacionVisual');
var storage = require('../../../servicios/storage');
var vehiculosData = require('../../../data/vehiculos');
var tanqueosData = require('../../../data/tanqueos');
var validaciones = require('./validaciones');

var sesiones = require('../../../servicios/sesiones');

var ESTADOS = {
  INICIO: 'TANQUEO_INICIO',
  ESPERANDO_PLACA: 'TANQUEO_ESPERANDO_PLACA',
  ESPERANDO_FOTO_FACTURA: 'TANQUEO_ESPERANDO_FOTO_FACTURA',
  ESPERANDO_FOTO_ODOMETRO: 'TANQUEO_ESPERANDO_FOTO_ODOMETRO',
  CONFIRMACION_KM: 'TANQUEO_CONFIRMACION_KM',
  ESPERANDO_KM_MANUAL: 'TANQUEO_ESPERANDO_KM_MANUAL',
  ESPERANDO_COMBUSTIBLE: 'TANQUEO_ESPERANDO_COMBUSTIBLE',
  ESPERANDO_CANTIDAD: 'TANQUEO_ESPERANDO_CANTIDAD',
  ESPERANDO_VALOR: 'TANQUEO_ESPERANDO_VALOR',
  ESPERANDO_ESTACION: 'TANQUEO_ESPERANDO_ESTACION',
  ESPERANDO_OBSERVACIONES: 'TANQUEO_ESPERANDO_OBSERVACIONES',
  CONFIRMACION_FINAL: 'TANQUEO_CONFIRMACION_FINAL'
};

function reiniciarSesionTanqueo(sesion) {
  sesion.tipo = 'tanqueo';
  sesion.estado = ESTADOS.INICIO;
  sesion.placa = null;
  sesion.vehiculo = null;
  sesion.conductor = null;
  sesion.kilometraje = null;
  sesion.kmDetectado = null;
  sesion.kmLecturaFueraRango = false;
  sesion.kmReferenciaMeta = null;
  sesion.kmReferencia = null;
  sesion.diferenciaKm = null;
  sesion.inconsistenciaKm = false;
  sesion.alertasKm = [];
  sesion.tipoCombustible = null;
  sesion.cantidadCombustible = null;
  sesion.unidadMedida = 'litros';
  sesion.valorTotal = null;
  sesion.estacionServicio = null;
  sesion.observacionesTanqueo = null;
  sesion.fotoFacturaTemporal = null;
  sesion.fotoOdometroTemporal = null;
  sesion.fotos = [];
}

function mensajeInicio() {
  return '⛽ *Registro de tanqueo*\n\nEscribe la placa del vehículo.\n\nTambién puedes escribir *CANCELAR* para salir.';
}

function mensajeSolicitudFactura() {
  return '📸 Envía ahora la *foto del recibo* o factura del tanqueo.';
}

function mensajeSolicitudOdometro(kmReferenciaMeta) {
  var referencia = '';
  if (kmReferenciaMeta && typeof kmReferenciaMeta.kilometraje === 'number') {
    referencia = '\n\nÚltimo kilometraje de referencia: *' + kmReferenciaMeta.kilometraje + ' km*';
  }

  return '📸 Envía ahora la *foto del kilometraje / odómetro*.' + referencia;
}

function mensajeSolicitudKilometrajeManual(kmReferenciaMeta) {
  var referencia = '';
  if (kmReferenciaMeta && typeof kmReferenciaMeta.kilometraje === 'number') {
    referencia = '\n\nReferencia actual: *' + kmReferenciaMeta.kilometraje + ' km*';
  }

  return '⌨️ Escribe el kilometraje que aparece en la foto del odómetro.' + referencia;
}

function mensajeConfirmacionKilometraje(sesion) {
  var msg = '🔎 *Lectura del odómetro*\n';
  msg += 'Detecté: *' + (sesion.kmDetectado || 0).toLocaleString('es-CO') + ' km*';

  if (typeof sesion.kmReferencia === 'number') {
    msg += '\nÚltimo registrado: *' + sesion.kmReferencia.toLocaleString('es-CO') + ' km*';
    if (typeof sesion.diferenciaKm === 'number') {
      msg += '\nDiferencia: *' + (sesion.diferenciaKm >= 0 ? '+' : '') + sesion.diferenciaKm.toLocaleString('es-CO') + ' km*';
    }
  }

  msg += '\n\n1⃣ Confirmar';
  msg += '\n2⃣ Corregir escribiendo el kilometraje';
  msg += '\n3⃣ Enviar otra foto';
  return msg;
}

function mensajeAlertaKilometraje(sesion) {
  var alerta = (sesion.alertasKm || [])[0];
  var msg = '⚠️ *Lectura del odómetro fuera de rango*\n';

  if (alerta) {
    msg += (alerta.mensaje || alerta) + '\n';
  }

  if (typeof sesion.kmReferencia === 'number') {
    msg += 'Último registrado: *' + sesion.kmReferencia.toLocaleString('es-CO') + ' km*\n';
  }

  msg += 'Nuevo detectado: *' + (sesion.kmDetectado || 0).toLocaleString('es-CO') + ' km*';
  if (typeof sesion.diferenciaKm === 'number') {
    msg += '\nDiferencia: *' + (sesion.diferenciaKm >= 0 ? '+' : '') + sesion.diferenciaKm.toLocaleString('es-CO') + ' km*';
  }

  msg += '\n\n2⃣ Escribir kilometraje manual';
  msg += '\n3⃣ Enviar otra foto';
  return msg;
}

function construirResumen(sesion, telefono) {
  var lineas = [];
  lineas.push('⛽ *Confirmación de tanqueo*');
  lineas.push('');
  lineas.push('🚗 Placa: *' + sesion.placa + '*');
  lineas.push('📱 Reportado desde: *' + validaciones.normalizarTelefono(telefono) + '*');
  lineas.push('🧾 Recibo: *OK*');
  lineas.push('📸 Odómetro: *OK*');
  lineas.push('🛣️ Kilometraje: *' + sesion.kilometraje + ' km*');

  if (typeof sesion.kmReferencia === 'number') {
    lineas.push('📍 Referencia km: *' + sesion.kmReferencia + ' km*');
    lineas.push('↕️ Diferencia: *' + (sesion.diferenciaKm || 0) + ' km*');
  }

  if (sesion.alertasKm && sesion.alertasKm.length) {
    lineas.push('⚠️ Alertas km: *' + sesion.alertasKm.join(' | ') + '*');
  }

  lineas.push('⛽ Combustible: *' + sesion.tipoCombustible + '*');
  lineas.push('🔢 Cantidad: *' + sesion.cantidadCombustible + ' ' + sesion.unidadMedida + '*');
  lineas.push('💰 Valor: *' + validaciones.formatearValorMoneda(sesion.valorTotal) + '*');

  if (sesion.estacionServicio) {
    lineas.push('🏪 Estación: *' + sesion.estacionServicio + '*');
  }

  if (sesion.observacionesTanqueo) {
    lineas.push('📝 Observaciones: *' + sesion.observacionesTanqueo + '*');
  }

  lineas.push('');
  lineas.push('1️⃣ Guardar');
  lineas.push('2️⃣ Reiniciar este tanqueo');
  lineas.push('');
  lineas.push('También puedes escribir *ATRAS* o *CANCELAR*.');

  return lineas.join('\n');
}

async function manejarAtras(res, sesion) {
  switch (sesion.estado) {
    case ESTADOS.ESPERANDO_PLACA:
      sesion.estado = ESTADOS.INICIO;
      return validaciones.responderTwiml(res, mensajeInicio());

    case ESTADOS.ESPERANDO_FOTO_FACTURA:
      sesion.estado = ESTADOS.ESPERANDO_PLACA;
      return validaciones.responderTwiml(res, '◀️ Volvemos a la placa.\n\n' + mensajeInicio());

    case ESTADOS.ESPERANDO_FOTO_ODOMETRO:
      sesion.estado = ESTADOS.ESPERANDO_FOTO_FACTURA;
      sesion.fotoFacturaTemporal = null;
      storage.limpiarFotosPorTipo(sesion, ['factura']);
      return validaciones.responderTwiml(res, '◀️ Volvemos a la foto del recibo.\n\n' + mensajeSolicitudFactura());

    case ESTADOS.CONFIRMACION_KM:
    case ESTADOS.ESPERANDO_KM_MANUAL:
      sesion.estado = ESTADOS.ESPERANDO_FOTO_ODOMETRO;
      sesion.fotoOdometroTemporal = null;
      sesion.kmDetectado = null;
      sesion.kmLecturaFueraRango = false;
      storage.limpiarFotosPorTipo(sesion, ['odometro']);
      return validaciones.responderTwiml(res, '◀️ Volvemos a la foto del odómetro.\n\n' + mensajeSolicitudOdometro(sesion.kmReferenciaMeta));

    case ESTADOS.ESPERANDO_COMBUSTIBLE:
      sesion.estado = ESTADOS.CONFIRMACION_KM;
      return validaciones.responderTwiml(res, '◀️ Volvemos al kilometraje.\n\n' + (sesion.kmLecturaFueraRango ? mensajeAlertaKilometraje(sesion) : mensajeConfirmacionKilometraje(sesion)));

    case ESTADOS.ESPERANDO_CANTIDAD:
      sesion.estado = ESTADOS.ESPERANDO_COMBUSTIBLE;
      return validaciones.responderTwiml(res, '◀️ Volvemos al combustible.\n\n' + mensajeTipoCombustible());

    case ESTADOS.ESPERANDO_VALOR:
      sesion.estado = ESTADOS.ESPERANDO_CANTIDAD;
      return validaciones.responderTwiml(res, '◀️ Volvemos a la cantidad.\n\n' + mensajeCantidad());

    case ESTADOS.ESPERANDO_ESTACION:
      sesion.estado = ESTADOS.ESPERANDO_VALOR;
      return validaciones.responderTwiml(res, '◀️ Volvemos al valor.\n\n' + mensajeValor());

    case ESTADOS.ESPERANDO_OBSERVACIONES:
      sesion.estado = ESTADOS.ESPERANDO_ESTACION;
      return validaciones.responderTwiml(res, '◀️ Volvemos a la estación.\n\n' + mensajeEstacion());

    case ESTADOS.CONFIRMACION_FINAL:
      sesion.estado = ESTADOS.ESPERANDO_OBSERVACIONES;
      return validaciones.responderTwiml(res, '◀️ Volvemos a observaciones.\n\n' + mensajeObservaciones());

    default:
      return validaciones.responderTwiml(res, 'No se puede retroceder desde aquí.\nEscribe *CANCELAR* para salir.');
  }
}

async function iniciarConPlaca(sesion, telefono, mensaje) {
  var placa = validaciones.normalizarPlaca(mensaje);
  if (!placa || placa.length < 5 || placa.length > 10) {
    return '❌ Placa inválida.\n\nEjemplo: *TKJ933*';
  }

  var carga = await vehiculosData.cargarVehiculoYConductor(placa, telefono);
  if (carga.error || !carga.vehiculo) {
    return '❌ El vehículo *' + placa + '* no existe en la base.\n\nVerifica la placa.';
  }

  if (carga.vehiculo.bloqueado) {
    return '🚫 *Vehículo bloqueado*\n' + placa + '\n' + (carga.vehiculo.motivo_bloqueo || 'Contacta al supervisor.');
  }

  sesion.placa = placa;
  sesion.vehiculo = carga.vehiculo;
  sesion.conductor = carga.conductor || null;
  sesion.kmReferenciaMeta = await tanqueosData.obtenerReferenciaKilometraje(placa);
  sesion.estado = ESTADOS.ESPERANDO_FOTO_FACTURA;

  return '✅ Vehículo *' + placa + '* listo para tanqueo.\n\n' + mensajeSolicitudFactura();
}

function registrarFotoFactura(sesion, mediaUrl) {
  sesion.fotoFacturaTemporal = mediaUrl;
  storage.guardarFotoUnica(sesion, {
    tipo: 'factura',
    url: mediaUrl,
    descripcion: 'Foto del recibo de tanqueo',
    validacion: 'Foto recibo cargada',
    validada: true
  });
}

function registrarFotoOdometro(sesion, mediaUrl) {
  sesion.fotoOdometroTemporal = mediaUrl;
  storage.guardarFotoUnica(sesion, {
    tipo: 'odometro',
    url: mediaUrl,
    descripcion: 'Foto del odómetro',
    validacion: 'Foto odómetro cargada',
    validada: true
  });
}

function aplicarKilometraje(sesion, kilometraje) {
  var evaluacion = validaciones.evaluarKilometrajeContraReferencia(kilometraje, sesion.kmReferenciaMeta);
  sesion.kilometraje = kilometraje;
  sesion.kmReferencia = evaluacion.kmReferencia;
  sesion.diferenciaKm = evaluacion.diferenciaKm;
  sesion.inconsistenciaKm = evaluacion.inconsistenciaKm;
  sesion.alertasKm = evaluacion.alertasKm;
}

async function guardarTanqueo(sesion, telefono) {
  var precioUnitario = null;
  if (sesion.cantidadCombustible) {
    precioUnitario = Number((sesion.valorTotal / sesion.cantidadCombustible).toFixed(2));
  }

  var datosTanqueo = {
    vehiculo_placa: sesion.placa,
    conductor_id: sesion.conductor ? sesion.conductor.id : null,
    telefono_reporta: validaciones.normalizarTelefono(telefono),
    tipo_combustible: sesion.tipoCombustible,
    cantidad: sesion.cantidadCombustible,
    unidad_medida: sesion.unidadMedida,
    valor_total: sesion.valorTotal,
    precio_unitario: precioUnitario,
    tanque_lleno: false,
    estacion_servicio: sesion.estacionServicio || null,
    ciudad: null,
    factura_numero: null,
    kilometraje: sesion.kilometraje,
    km_referencia: sesion.kmReferencia,
    diferencia_km: sesion.diferenciaKm,
    inconsistencia_km: !!sesion.inconsistenciaKm,
    alertas: sesion.alertasKm || [],
    observaciones: sesion.observacionesTanqueo || null,
    pdf_url: null
  };

  var resTanqueo = await tanqueosData.crearTanqueo(datosTanqueo);
  if (resTanqueo.error) {
    return { error: resTanqueo.error };
  }

  var fotos = (sesion.fotos || []).filter(function(foto) {
    return foto.tipo === 'factura' || foto.tipo === 'odometro';
  });

  var resFotos = await tanqueosData.guardarFotosTanqueo(resTanqueo.data.id, fotos);
  if (resFotos && resFotos.error) {
    console.error('Error guardando fotos de tanqueo:', resFotos.error.message || resFotos.error);
  }

  var resVehiculo = await tanqueosData.actualizarKilometrajeVehiculo(sesion.placa, sesion.kilometraje);
  if (resVehiculo && resVehiculo.error) {
    console.error('Error actualizando kilometraje de vehículo:', resVehiculo.error.message || resVehiculo.error);
  }

  return { error: null, tanqueo: resTanqueo.data };
}

function mensajeErrorPersistencia(error) {
  var texto = (error && (error.message || error.details || error.hint)) || String(error || '');

  if (/conductor_id/i.test(texto) || /telefono_reporta/i.test(texto)) {
    return '❌ No pude guardar el tanqueo porque la base todavía no está alineada con el flujo nuevo.\n\n' +
      'Primero aplica la migración corta de tanqueo (conductor opcional + teléfono que reporta) y vuelve a probar.';
  }

  return '❌ No pude guardar el tanqueo.\n\nRevisa el log del servidor y vuelve a intentar.';
}

async function manejarTanqueo(req, res) {
  var telefono = req.body.From || '';
  var mensaje = (req.body.Body || '').trim();
  var mensajeMayus = mensaje.toUpperCase();
  var mediaUrls = storage.obtenerMediaUrls(req);
  var mediaUrl = mediaUrls[0] || null;
  var sesion = await sesiones.obtenerSesion(telefono);

  if (mensajeMayus === 'MENU' || mensajeMayus === 'INICIO') {
    sesiones.eliminarSesion(telefono);
    return validaciones.responderTwiml(res, '🏠 Volviendo al menú principal.\n\nEscribe cualquier mensaje para ver el menú.');
  }

  if (mensajeMayus === 'CANCELAR') {
    sesiones.eliminarSesion(telefono);
    return validaciones.responderTwiml(res, '❌ Tanqueo cancelado.\n\nEscribe *MENU* para volver al inicio.');
  }

  if (mensajeMayus === 'REINICIAR') {
    reiniciarSesionTanqueo(sesion);
    sesion.estado = ESTADOS.ESPERANDO_PLACA;
    await sesiones.guardarCambios();
    return validaciones.responderTwiml(res, '🔄 Reiniciamos el tanqueo.\n\n' + mensajeInicio());
  }

  if (mensajeMayus === 'ATRAS') {
    await sesiones.guardarCambios();
    return manejarAtras(res, sesion);
  }

  if (sesion.tipo !== 'tanqueo' || !sesion.estado || sesion.estado === 'INICIO') {
    reiniciarSesionTanqueo(sesion);
    sesion.estado = ESTADOS.ESPERANDO_PLACA;
    await sesiones.guardarCambios();
    return validaciones.responderTwiml(res, mensajeInicio());
  }

  var respuesta = null;

  switch (sesion.estado) {
    case ESTADOS.ESPERANDO_PLACA:
      respuesta = await iniciarConPlaca(sesion, telefono, mensaje);
      break;

    case ESTADOS.ESPERANDO_FOTO_FACTURA:
      if (!mediaUrl) {
        respuesta = '📸 Necesito la foto del recibo para continuar.';
        break;
      }
      registrarFotoFactura(sesion, mediaUrl);
      sesion.estado = ESTADOS.ESPERANDO_FOTO_ODOMETRO;
      respuesta = '✅ Recibo cargado.\n\n' + mensajeSolicitudOdometro(sesion.kmReferenciaMeta);
      break;

    case ESTADOS.ESPERANDO_FOTO_ODOMETRO:
      if (!mediaUrl) {
        respuesta = '📸 Necesito la foto del odómetro para continuar.';
        break;
      }
      registrarFotoOdometro(sesion, mediaUrl);
      var resultadoVisualKm = await visual.resolverFotoOdometroOperativa(
        mediaUrl,
        sesion.kmReferenciaMeta,
        config.MAX_KM_SALTO
      );
      if (resultadoVisualKm.tipo === 'manual') {
        sesion.estado = ESTADOS.ESPERANDO_KM_MANUAL;
        respuesta = '⚠️ No pude leer el odómetro con seguridad.\n\n' + mensajeSolicitudKilometrajeManual(sesion.kmReferenciaMeta);
        break;
      }
      sesion.kmDetectado = resultadoVisualKm.kilometraje;
      sesion.kmReferencia = resultadoVisualKm.evaluacion.kmReferencia;
      sesion.diferenciaKm = resultadoVisualKm.evaluacion.diferenciaKm;
      sesion.inconsistenciaKm = resultadoVisualKm.evaluacion.inconsistenciaKm;
      sesion.alertasKm = resultadoVisualKm.evaluacion.alertasKm;
      sesion.kmLecturaFueraRango = resultadoVisualKm.tipo === 'fuera_rango';
      sesion.estado = ESTADOS.CONFIRMACION_KM;
      respuesta = sesion.kmLecturaFueraRango ? mensajeAlertaKilometraje(sesion) : mensajeConfirmacionKilometraje(sesion);
      break;

    case ESTADOS.CONFIRMACION_KM:
      if (mensaje === '1' && !sesion.kmLecturaFueraRango && typeof sesion.kmDetectado === 'number') {
        aplicarKilometraje(sesion, sesion.kmDetectado);
        sesion.estado = ESTADOS.ESPERANDO_COMBUSTIBLE;
        respuesta = '✅ Kilometraje confirmado: *' + sesion.kilometraje + ' km*\n\n' + mensajeTipoCombustible();
        break;
      }
      if (mensaje === '2') {
        sesion.estado = ESTADOS.ESPERANDO_KM_MANUAL;
        respuesta = mensajeSolicitudKilometrajeManual(sesion.kmReferenciaMeta);
        break;
      }
      if (mensaje === '3') {
        sesion.estado = ESTADOS.ESPERANDO_FOTO_ODOMETRO;
        sesion.kmDetectado = null;
        sesion.kmLecturaFueraRango = false;
        storage.limpiarFotosPorTipo(sesion, ['odometro']);
        respuesta = mensajeSolicitudOdometro(sesion.kmReferenciaMeta);
        break;
      }
      respuesta = sesion.kmLecturaFueraRango
        ? 'Responde con *2* para escribir el kilometraje o *3* para enviar otra foto.'
        : 'Responde con *1*, *2* o *3*.';
      break;

    case ESTADOS.ESPERANDO_KM_MANUAL:
      var kilometraje = visual.parsearKilometraje(mensaje);
      if (kilometraje === null) {
        respuesta = '❌ Kilometraje inválido.\n\nEscribe solo números. Ejemplo: *47889*';
        break;
      }
      aplicarKilometraje(sesion, kilometraje);
      sesion.estado = ESTADOS.ESPERANDO_COMBUSTIBLE;
      respuesta = '✅ Kilometraje registrado: *' + kilometraje + ' km*';
      if (sesion.alertasKm && sesion.alertasKm.length) {
        respuesta += '\n⚠️ ' + sesion.alertasKm.join(' | ');
      }
      respuesta += '\n\n' + mensajeTipoCombustible();
      break;

    case ESTADOS.ESPERANDO_COMBUSTIBLE:
      var validacionCombustible = validaciones.validarTipoCombustible(mensaje);
      if (!validacionCombustible.ok) {
        respuesta = validacionCombustible.mensaje;
        break;
      }
      sesion.tipoCombustible = validacionCombustible.valor;
      sesion.estado = ESTADOS.ESPERANDO_CANTIDAD;
      respuesta = '✅ Combustible registrado: *' + sesion.tipoCombustible + '*\n\n' + mensajeCantidad();
      break;

    case ESTADOS.ESPERANDO_CANTIDAD:
      var cantidad = validaciones.parsearCantidad(mensaje);
      if (!cantidad.ok) {
        respuesta = cantidad.mensaje;
        break;
      }
      sesion.cantidadCombustible = cantidad.cantidad;
      sesion.unidadMedida = cantidad.unidadMedida;
      sesion.estado = ESTADOS.ESPERANDO_VALOR;
      respuesta = '✅ Cantidad registrada: *' + sesion.cantidadCombustible + ' ' + sesion.unidadMedida + '*\n\n' + mensajeValor();
      break;

    case ESTADOS.ESPERANDO_VALOR:
      var valor = validaciones.parsearValor(mensaje);
      if (valor === null) {
        respuesta = '❌ Valor inválido.\n\nEscribe solo el número. Ejemplo: *218400*';
        break;
      }
      sesion.valorTotal = valor;
      sesion.estado = ESTADOS.ESPERANDO_ESTACION;
      respuesta = '✅ Valor registrado: *' + validaciones.formatearValorMoneda(sesion.valorTotal) + '*\n\n' + mensajeEstacion();
      break;

    case ESTADOS.ESPERANDO_ESTACION:
      sesion.estacionServicio = /^no$/i.test(mensaje) ? null : mensaje;
      sesion.estado = ESTADOS.ESPERANDO_OBSERVACIONES;
      respuesta = mensajeObservaciones();
      break;

    case ESTADOS.ESPERANDO_OBSERVACIONES:
      sesion.observacionesTanqueo = /^no$/i.test(mensaje) ? null : mensaje;
      sesion.estado = ESTADOS.CONFIRMACION_FINAL;
      respuesta = construirResumen(sesion, telefono);
      break;

    case ESTADOS.CONFIRMACION_FINAL:
      if (mensaje === '1') {
        var guardado = await guardarTanqueo(sesion, telefono);
        if (guardado.error) {
          respuesta = mensajeErrorPersistencia(guardado.error);
          break;
        }
        sesiones.eliminarSesion(telefono);
        return validaciones.responderTwiml(
          res,
          '✅ Tanqueo guardado correctamente para *' + guardado.tanqueo.vehiculo_placa + '*.' +
          '\n\nKilometraje actualizado: *' + guardado.tanqueo.kilometraje + ' km*.' +
          '\n\nEscribe *MENU* para volver al inicio.'
        );
      }

      if (mensaje === '2') {
        reiniciarSesionTanqueo(sesion);
        sesion.estado = ESTADOS.ESPERANDO_PLACA;
        respuesta = '🔄 Reiniciamos este tanqueo.\n\n' + mensajeInicio();
        break;
      }

      respuesta = 'Responde con *1* para guardar o *2* para reiniciar.';
      break;

    default:
      reiniciarSesionTanqueo(sesion);
      sesion.estado = ESTADOS.ESPERANDO_PLACA;
      respuesta = mensajeInicio();
      break;
  }

  await sesiones.guardarCambios();
  return validaciones.responderTwiml(res, respuesta);
}

module.exports = {
  manejarTanqueo: manejarTanqueo,
  ESTADOS: ESTADOS,
  reiniciarSesionTanqueo: reiniciarSesionTanqueo
};

