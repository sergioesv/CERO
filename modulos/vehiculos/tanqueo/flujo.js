var sesiones = require('../../../servicios/sesiones');
var vehiculosData = require('../../../data/vehiculos');
var tanqueosData = require('../../../data/tanqueos');
var validaciones = require('./validaciones');

var ESTADOS = {
  INICIO: 'TANQUEO_INICIO',
  ESPERANDO_PLACA: 'TANQUEO_ESPERANDO_PLACA',
  ESPERANDO_KM: 'TANQUEO_ESPERANDO_KM',
  CONFIRMACION_KM: 'TANQUEO_CONFIRMACION_KM',
  ESPERANDO_COMBUSTIBLE: 'TANQUEO_ESPERANDO_COMBUSTIBLE',
  ESPERANDO_CANTIDAD: 'TANQUEO_ESPERANDO_CANTIDAD',
  ESPERANDO_VALOR: 'TANQUEO_ESPERANDO_VALOR',
  ESPERANDO_ESTACION: 'TANQUEO_ESPERANDO_ESTACION',
  ESPERANDO_OBSERVACIONES: 'TANQUEO_ESPERANDO_OBSERVACIONES',
  CONFIRMACION_FINAL: 'TANQUEO_CONFIRMACION_FINAL'
};

function inicializarSesionTanqueo(sesion) {
  sesion.tipo = 'tanqueo';
  sesion.estado = ESTADOS.INICIO;
  sesion.placa = null;
  sesion.vehiculo = null;
  sesion.conductor = null;
  sesion.kilometraje = null;
  sesion.kmReferenciaMeta = null;
  sesion.kmReferencia = null;
  sesion.diferenciaKm = null;
  sesion.alertasKm = [];
  sesion.inconsistenciaKm = false;
  sesion.tanqueo = {
    combustible: null,
    cantidad: null,
    unidadMedida: 'litros',
    valorTotal: null,
    estacionServicio: null,
    observaciones: null
  };
}

function mensajeInicio() {
  return '⛽ *Registro de tanqueo*\n\nEscribe la placa del vehículo.\n\nTambién puedes escribir *CANCELAR* para salir.';
}

function mensajeSolicitudKilometraje(sesion) {
  var referencia = '';

  if (sesion.kmReferenciaMeta && typeof sesion.kmReferenciaMeta.kilometraje === 'number') {
    referencia = '\nÚltimo km registrado: *' + sesion.kmReferenciaMeta.kilometraje + '* (' + sesion.kmReferenciaMeta.origen + ')';
  }

  return '🛞 *Kilometraje*\nVehículo: *' + sesion.placa + '*' + referencia + '\n\nEscribe el kilometraje actual.';
}

function mensajeCombustible() {
  return '⛽ *Tipo de combustible*\n\n1️⃣ Gasolina\n2️⃣ Diesel / ACPM\n3️⃣ Gas\n4️⃣ AdBlue\n5️⃣ Otro\n\nResponde con el número o con el nombre.';
}

function mensajeCantidad() {
  return '📏 *Cantidad abastecida*\n\nEscribe la cantidad y opcionalmente la unidad.\nEjemplos:\n*45.5 litros*\n*12 galones*\n*38*';
}

function mensajeValor() {
  return '💰 *Valor total*\n\nEscribe el valor pagado.\nEjemplos:\n*85000*\n*$ 85.000*';
}

function mensajeEstacion() {
  return '🏪 *Estación de servicio*\n\nEscribe el nombre de la estación o *OMITIR*.';
}

function mensajeObservaciones() {
  return '📝 *Observaciones*\n\nEscribe una observación corta o *OMITIR*.';
}

function formatearValor(valor) {
  return Number(valor || 0).toLocaleString('es-CO');
}

function construirResumenFinal(sesion) {
  var lineas = [];

  lineas.push('⛽ *Confirmación de tanqueo*');
  lineas.push('');
  lineas.push('Vehículo: *' + sesion.placa + '*');
  lineas.push('Kilometraje: *' + sesion.kilometraje + ' km*');

  if (typeof sesion.kmReferencia === 'number') {
    lineas.push('Km referencia: *' + sesion.kmReferencia + ' km*');
  }

  lineas.push('Combustible: *' + sesion.tanqueo.combustible + '*');
  lineas.push('Cantidad: *' + sesion.tanqueo.cantidad + ' ' + sesion.tanqueo.unidadMedida + '*');
  lineas.push('Valor total: *$ ' + formatearValor(sesion.tanqueo.valorTotal) + '*');

  if (sesion.tanqueo.estacionServicio) {
    lineas.push('Estación: *' + sesion.tanqueo.estacionServicio + '*');
  }

  if (sesion.tanqueo.observaciones) {
    lineas.push('Observaciones: *' + sesion.tanqueo.observaciones + '*');
  }

  if (sesion.alertasKm && sesion.alertasKm.length) {
    lineas.push('');
    lineas.push('⚠️ Alertas kilometraje:');
    for (var i = 0; i < sesion.alertasKm.length; i++) {
      lineas.push('- ' + sesion.alertasKm[i]);
    }
  }

  lineas.push('');
  lineas.push('Escribe *SI* para guardar o *ATRAS* para corregir.');

  return lineas.join('\n');
}

function mensajeAlertaKilometraje(sesion) {
  var lineas = [];

  lineas.push('⚠️ *Revisión de kilometraje*');
  lineas.push('');
  lineas.push('Vehículo: *' + sesion.placa + '*');
  lineas.push('Kilometraje informado: *' + sesion.kilometraje + ' km*');

  if (typeof sesion.kmReferencia === 'number') {
    lineas.push('Último registrado: *' + sesion.kmReferencia + ' km*');
  }

  lineas.push('');
  for (var i = 0; i < sesion.alertasKm.length; i++) {
    lineas.push('• ' + sesion.alertasKm[i]);
  }

  lineas.push('');
  lineas.push('1️⃣ Confirmar y continuar');
  lineas.push('2️⃣ Corregir kilometraje');

  return lineas.join('\n');
}

async function manejarAtras(res, sesion) {
  switch (sesion.estado) {
    case ESTADOS.ESPERANDO_PLACA:
      sesion.estado = ESTADOS.INICIO;
      return validaciones.responderTwiml(res, mensajeInicio());

    case ESTADOS.ESPERANDO_KM:
    case ESTADOS.CONFIRMACION_KM:
      sesion.estado = ESTADOS.ESPERANDO_PLACA;
      return validaciones.responderTwiml(res, '◀️ Volvemos a la placa.\n\n' + mensajeInicio());

    case ESTADOS.ESPERANDO_COMBUSTIBLE:
      sesion.estado = ESTADOS.ESPERANDO_KM;
      return validaciones.responderTwiml(res, '◀️ Volvemos al kilometraje.\n\n' + mensajeSolicitudKilometraje(sesion));

    case ESTADOS.ESPERANDO_CANTIDAD:
      sesion.estado = ESTADOS.ESPERANDO_COMBUSTIBLE;
      return validaciones.responderTwiml(res, '◀️ Volvemos al combustible.\n\n' + mensajeCombustible());

    case ESTADOS.ESPERANDO_VALOR:
      sesion.estado = ESTADOS.ESPERANDO_CANTIDAD;
      return validaciones.responderTwiml(res, '◀️ Volvemos a la cantidad.\n\n' + mensajeCantidad());

    case ESTADOS.ESPERANDO_ESTACION:
      sesion.estado = ESTADOS.ESPERANDO_VALOR;
      return validaciones.responderTwiml(res, '◀️ Volvemos al valor total.\n\n' + mensajeValor());

    case ESTADOS.ESPERANDO_OBSERVACIONES:
      sesion.estado = ESTADOS.ESPERANDO_ESTACION;
      return validaciones.responderTwiml(res, '◀️ Volvemos a la estación.\n\n' + mensajeEstacion());

    case ESTADOS.CONFIRMACION_FINAL:
      sesion.estado = ESTADOS.ESPERANDO_OBSERVACIONES;
      return validaciones.responderTwiml(res, '◀️ Volvemos a observaciones.\n\n' + mensajeObservaciones());

    default:
      return validaciones.responderTwiml(res, 'No se puede retroceder desde aquí. Escribe *CANCELAR* para salir.');
  }
}

async function manejarPlaca(sesion, telefono, mensaje) {
  var placa = validaciones.normalizarPlaca(mensaje);

  if (!placa || placa.length < 5 || placa.length > 10) {
    return '❌ Placa inválida.\n\nEscribe la placa correcta.\nEjemplo: *TKJ933*';
  }

  var carga = await vehiculosData.cargarVehiculoYConductor(placa, telefono);
  if (carga.error || !carga.vehiculo) {
    return '❌ El vehículo *' + placa + '* no existe en la base.\n\nVerifica la placa.';
  }

  if (carga.vehiculo.bloqueado) {
    return '🚫 *Vehículo bloqueado*\n' + placa + '\n' + (carga.vehiculo.motivo_bloqueo || 'Contacta al supervisor.');
  }

  if (!carga.conductor || !carga.conductor.id) {
    return '❌ No encontré un conductor activo asociado a este número de WhatsApp.\n\nRegistra o vincula el conductor antes de guardar tanqueos.';
  }

  sesion.placa = placa;
  sesion.vehiculo = carga.vehiculo;
  sesion.conductor = carga.conductor;
  sesion.kmReferenciaMeta = await tanqueosData.obtenerReferenciaKilometrajeTanqueo(placa);
  sesion.estado = ESTADOS.ESPERANDO_KM;

  return mensajeSolicitudKilometraje(sesion);
}

async function manejarKilometraje(sesion, mensaje) {
  var kilometraje = validaciones.parsearEntero(mensaje);

  if (kilometraje === null || kilometraje <= 0) {
    return '❌ Kilometraje inválido.\n\nEscribe solo números.\nEjemplo: *47889*';
  }

  var evaluacion = validaciones.validarKilometrajeTanqueo(
    kilometraje,
    sesion.kmReferenciaMeta,
    validaciones.MAX_KM_SALTO_TANQUEO
  );

  sesion.kilometraje = kilometraje;
  sesion.kmReferencia = evaluacion.kmReferencia;
  sesion.diferenciaKm = evaluacion.diferenciaKm;
  sesion.alertasKm = evaluacion.alertas;
  sesion.inconsistenciaKm = evaluacion.inconsistencia;

  if (evaluacion.inconsistencia) {
    sesion.estado = ESTADOS.CONFIRMACION_KM;
    return mensajeAlertaKilometraje(sesion);
  }

  sesion.estado = ESTADOS.ESPERANDO_COMBUSTIBLE;
  return mensajeCombustible();
}

async function manejarConfirmacionKilometraje(sesion, mensaje) {
  if (mensaje === '1') {
    sesion.estado = ESTADOS.ESPERANDO_COMBUSTIBLE;
    return mensajeCombustible();
  }

  if (mensaje === '2') {
    sesion.estado = ESTADOS.ESPERANDO_KM;
    return '✍️ Escribe nuevamente el kilometraje correcto.';
  }

  return 'Responde con *1* para confirmar o *2* para corregir.';
}

async function manejarCombustible(sesion, mensaje) {
  var combustible = validaciones.normalizarCombustible(mensaje);

  if (!combustible) {
    return '❌ Combustible inválido.\n\n' + mensajeCombustible();
  }

  sesion.tanqueo.combustible = combustible;
  sesion.estado = ESTADOS.ESPERANDO_CANTIDAD;
  return mensajeCantidad();
}

async function manejarCantidad(sesion, mensaje) {
  var lectura = validaciones.parsearCantidadYUnidad(mensaje);

  if (!lectura || !validaciones.validarCantidad(lectura.cantidad)) {
    return '❌ Cantidad inválida.\n\n' + mensajeCantidad();
  }

  sesion.tanqueo.cantidad = lectura.cantidad;
  sesion.tanqueo.unidadMedida = lectura.unidad;
  sesion.estado = ESTADOS.ESPERANDO_VALOR;
  return mensajeValor();
}

async function manejarValor(sesion, mensaje) {
  var valor = validaciones.parsearEntero(mensaje);

  if (!validaciones.validarValor(valor)) {
    return '❌ Valor inválido.\n\n' + mensajeValor();
  }

  sesion.tanqueo.valorTotal = valor;
  sesion.estado = ESTADOS.ESPERANDO_ESTACION;
  return mensajeEstacion();
}

async function manejarEstacion(sesion, mensaje) {
  var texto = String(mensaje || '').trim();

  sesion.tanqueo.estacionServicio = (
    !texto ||
    texto.toUpperCase() === 'OMITIR' ||
    texto.toUpperCase() === 'NO'
  ) ? null : texto;

  sesion.estado = ESTADOS.ESPERANDO_OBSERVACIONES;
  return mensajeObservaciones();
}

async function manejarObservaciones(sesion, mensaje) {
  var texto = String(mensaje || '').trim();

  sesion.tanqueo.observaciones = (
    !texto ||
    texto.toUpperCase() === 'OMITIR' ||
    texto.toUpperCase() === 'NO'
  ) ? null : texto;

  sesion.estado = ESTADOS.CONFIRMACION_FINAL;
  return construirResumenFinal(sesion);
}

function ahoraCO() {
  var utc = new Date();
  return new Date(utc.getTime() - (5 * 60 * 60 * 1000));
}

async function guardarTanqueo(sesion, ipAddress) {
  var ahora = ahoraCO();
  var precioUnitario = null;

  if (sesion.tanqueo.cantidad && sesion.tanqueo.valorTotal) {
    precioUnitario = Number((sesion.tanqueo.valorTotal / sesion.tanqueo.cantidad).toFixed(2));
  }

  var datosTanqueo = {
    vehiculo_placa: sesion.placa,
    conductor_id: sesion.conductor.id,
    tipo_combustible: sesion.tanqueo.combustible,
    cantidad: sesion.tanqueo.cantidad,
    unidad_medida: sesion.tanqueo.unidadMedida,
    valor_total: sesion.tanqueo.valorTotal,
    precio_unitario: precioUnitario,
    tanque_lleno: false,
    estacion_servicio: sesion.tanqueo.estacionServicio,
    kilometraje: sesion.kilometraje,
    km_referencia: sesion.kmReferencia,
    diferencia_km: sesion.diferenciaKm,
    inconsistencia_km: !!sesion.inconsistenciaKm,
    alertas: sesion.alertasKm || [],
    observaciones: sesion.tanqueo.observaciones,
    ip_address: ipAddress || null,
    created_at: ahora.toISOString()
  };

  var creado = await tanqueosData.crearTanqueo(datosTanqueo);
  if (creado.error || !creado.data) {
    return { error: creado.error || new Error('No se pudo crear el tanqueo') };
  }

  var resVehiculo = await tanqueosData.actualizarKilometrajeVehiculo(sesion.vehiculo, sesion.kilometraje);
  if (resVehiculo && resVehiculo.error) {
    console.error('Error actualizando kilometraje del vehículo:', resVehiculo.error.message || resVehiculo.error);
  }

  return {
    error: null,
    tanqueo: creado.data
  };
}

async function manejarConfirmacionFinal(sesion, telefono, req, mensaje) {
  if (mensaje.toUpperCase() !== 'SI') {
    return 'Escribe *SI* para guardar el tanqueo.\nTambién puedes usar *ATRAS* o *CANCELAR*.';
  }

  var guardado = await guardarTanqueo(sesion, req.ip);
  if (guardado.error) {
    console.error('Error guardando tanqueo:', guardado.error.message || guardado.error);
    return '❌ No pude guardar el tanqueo.\n\nEscribe *ATRAS* para revisar o *CANCELAR* para salir.';
  }

  sesiones.eliminarSesion(telefono);

  return (
    '✅ *Tanqueo registrado*\n\n' +
    'Vehículo: *' + sesion.placa + '*\n' +
    'Kilometraje: *' + sesion.kilometraje + ' km*\n' +
    'Combustible: *' + sesion.tanqueo.combustible + '*\n' +
    'Cantidad: *' + sesion.tanqueo.cantidad + ' ' + sesion.tanqueo.unidadMedida + '*\n' +
    'Valor: *$ ' + formatearValor(sesion.tanqueo.valorTotal) + '*\n\n' +
    'Escribe *MENU* para volver al inicio.'
  );
}

async function manejarTanqueo(req, res) {
  var telefono = req.body.From;
  var mensaje = (req.body.Body || '').trim();
  var mediaUrl = req.body.MediaUrl0 || null;
  var sesion = null;

  if (!sesiones.bloquear(telefono)) {
    return validaciones.responderTwiml(res, 'Un momento, procesando tu mensaje anterior...');
  }

  try {
    sesion = await sesiones.obtenerSesion(telefono);

    if (sesion.tipo !== 'tanqueo' || !sesion.tanqueo) {
      inicializarSesionTanqueo(sesion);
    }

    var msgUpper = mensaje.toUpperCase();

    if (msgUpper === 'CANCELAR') {
      sesiones.eliminarSesion(telefono);
      return validaciones.responderTwiml(res, '❌ Tanqueo cancelado.\nEscribe MENU para volver al inicio.');
    }

    if (msgUpper === 'REINICIAR') {
      inicializarSesionTanqueo(sesion);
      return validaciones.responderTwiml(res, mensajeInicio());
    }

    if (msgUpper === 'ATRAS') {
      return await manejarAtras(res, sesion);
    }

    if (mediaUrl) {
      return validaciones.responderTwiml(
        res,
        '📵 En esta primera entrega de tanqueo solo estoy recibiendo texto.\n\nContinúa escribiendo los datos manualmente.'
      );
    }

    switch (sesion.estado) {
      case ESTADOS.INICIO:
        sesion.estado = ESTADOS.ESPERANDO_PLACA;
        return validaciones.responderTwiml(res, mensajeInicio());

      case ESTADOS.ESPERANDO_PLACA:
        return validaciones.responderTwiml(res, await manejarPlaca(sesion, telefono, mensaje));

      case ESTADOS.ESPERANDO_KM:
        return validaciones.responderTwiml(res, await manejarKilometraje(sesion, mensaje));

      case ESTADOS.CONFIRMACION_KM:
        return validaciones.responderTwiml(res, await manejarConfirmacionKilometraje(sesion, mensaje));

      case ESTADOS.ESPERANDO_COMBUSTIBLE:
        return validaciones.responderTwiml(res, await manejarCombustible(sesion, mensaje));

      case ESTADOS.ESPERANDO_CANTIDAD:
        return validaciones.responderTwiml(res, await manejarCantidad(sesion, mensaje));

      case ESTADOS.ESPERANDO_VALOR:
        return validaciones.responderTwiml(res, await manejarValor(sesion, mensaje));

      case ESTADOS.ESPERANDO_ESTACION:
        return validaciones.responderTwiml(res, await manejarEstacion(sesion, mensaje));

      case ESTADOS.ESPERANDO_OBSERVACIONES:
        return validaciones.responderTwiml(res, await manejarObservaciones(sesion, mensaje));

      case ESTADOS.CONFIRMACION_FINAL:
        return validaciones.responderTwiml(res, await manejarConfirmacionFinal(sesion, telefono, req, mensaje));

      default:
        sesion.estado = ESTADOS.ESPERANDO_PLACA;
        return validaciones.responderTwiml(res, mensajeInicio());
    }
  } catch (error) {
    console.error('Error en flujo tanqueo:', error.message || error);
    return validaciones.responderTwiml(res, '❌ Ocurrió un error en tanqueo.\n\nEscribe MENU para reiniciar.');
  } finally {
    sesiones.desbloquear(telefono);
    sesiones.guardarCambios();
  }
}

function registrarTanqueo(app) {
  app.post('/webhook/tanqueo', manejarTanqueo);
}

module.exports = {
  ESTADOS,
  registrarTanqueo,
  manejarTanqueo
};
