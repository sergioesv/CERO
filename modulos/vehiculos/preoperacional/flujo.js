var twilio = require('twilio');
var config = require('../../../config/config');
var preop = require('./validaciones');
var estadoPreop = require('./estado');
var mensajes = require('./mensajes');
var cierre = require('./cierre');
var GRUPOS = estadoPreop.GRUPOS;
var sesiones = require('../../../servicios/sesiones');
var ocr = require('../../../servicios/ocr');
var storage = require('../../../servicios/storage');
var vehiculosData = require('../../../data/vehiculos');


function mensajeMenuPrincipal() {
  return '🚗 *SISTEMA CERO*\n' +
    'cero papel, cero accidentes\n\n' +
    'Selecciona una opcion:\n\n' +
    '1️⃣ Preoperacional (inicio de jornada)\n' +
    '2️⃣ Posoperacional (cierre de jornada)\n' +
    '3️⃣ Combustible / tanqueo\n\n' +
    'Escribe el numero:';
}

function volverAMenuPrincipal(res, telefono) {
  sesiones.eliminarSesion(telefono);
  return preop.responderTwiml(res, mensajeMenuPrincipal());
}

function esOpcion(valor, opciones) {
  return opciones.indexOf(String(valor || '').trim().toLowerCase()) >= 0;
}

function normalizarTextoBase(texto) {
  return String(texto == null ? '' : texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function aliasExtrasPorItem(nombre) {
  var clave = normalizarTextoBase(nombre);
  if (clave === 'aceite motor') return ['aceite', 'motor', 'aceite motor', 'derrame aceite', 'aceite derramado'];
  if (clave === 'refrigerante') return ['refrigerante', 'agua', 'agua visible', 'fuga de agua', 'agua derramada'];
  if (clave === 'liquido frenos') return ['liquido frenos', 'liquido de frenos', 'freno', 'frenos', 'liquido'];
  if (clave === 'fugas visibles') return ['fuga', 'fugas', 'goteo', 'goteando', 'botando', 'derrame', 'derramado', 'visible', 'visibles'];
  if (clave === 'luces delanteras traseras') return ['luz', 'luces', 'faro', 'farola', 'delantera', 'trasera'];
  if (clave === 'stops y direccionales') return ['stop', 'stops', 'direccional', 'direccionales', 'cocuyo', 'cocuyos'];
  if (clave === 'pito y alarma reversa') return ['pito', 'alarma', 'reversa', 'bocina', 'corneta'];
  if (clave === 'tablero instrumentos') return ['tablero', 'instrumento', 'instrumentos', 'testigo', 'indicador'];
  if (clave === 'baterias') return ['bateria', 'baterias'];
  if (clave === 'freno de parqueo') return ['freno', 'parqueo', 'mano'];
  if (clave === 'estado llantas') return ['llanta', 'llantas', 'neumatico', 'neumaticos', 'rueda', 'ruedas'];
  if (clave === 'pernos de ruedas') return ['perno', 'pernos', 'rueda', 'ruedas', 'tuerca', 'tuercas'];
  if (clave === 'llanta repuesto') return ['repuesto', 'llanta repuesto', 'rueda repuesto'];
  if (clave === 'cinturones seguridad') return ['cinturon', 'cinturones', 'seguridad'];
  if (clave === 'retrovisores') return ['retrovisor', 'retrovisores', 'espejo', 'espejos'];
  if (clave === 'pedales') return ['pedal', 'pedales'];
  if (clave === 'vidrios y limpiabrisas') return ['vidrio', 'vidrios', 'limpiabrisas', 'plumilla', 'plumillas', 'parabrisas'];
  if (clave === 'aseo y elementos sueltos') return ['aseo', 'limpieza', 'suelto', 'sueltos', 'elementos'];
  if (clave === 'aire acondicionado') return ['aire', 'acondicionado', 'ac'];
  if (clave === 'equipo carretera') return ['equipo', 'carretera', 'botiquin', 'extintor', 'cono', 'conos'];
  return [];
}

function puntuarItemLocal(segmento, itemNombre) {
  var normalizado = normalizarTextoBase(segmento);
  var nombreNormalizado = normalizarTextoBase(itemNombre);
  var alias = [nombreNormalizado].concat(aliasExtrasPorItem(itemNombre));
  var score = 0;

  for (var i = 0; i < alias.length; i++) {
    var termino = normalizarTextoBase(alias[i]);
    if (!termino) continue;
    if (normalizado.indexOf(termino) >= 0) {
      score += termino.indexOf(' ') >= 0 ? 3 : 2;
    }
  }

  return score;
}

function detectarEstadoLocal(texto) {
  var t = normalizarTextoBase(texto);
  if (!t) return 'Mal estado';
  if (/fuga|fugas|goteo|goteando|botando|derrame|derramado/.test(t)) return 'Con fugas';
  if (/no funciona|no prende|apagad|fundid|sin luz|sin luces/.test(t)) return 'No funciona';
  if (/bajo|vacio|vacia|faltante|falta|sin /.test(t)) return 'Bajo';
  if (/desgastad|lisa|lisas/.test(t)) return 'Desgastada';
  if (/sin aire|sin presion|desinflad|pinchad/.test(t)) return 'Sin presion';
  if (/flojo|floja/.test(t)) return 'Flojo';
  if (/danad|roto|rota|quebrad|partid|averiad|malo|mala|falla/.test(t)) return 'Mal estado';
  return 'Mal estado';
}

function interpretarNovedadLocal(texto, grupo) {
  var observacion = String(texto || '').trim();
  var segmentos = observacion
    .replace(/[\n\r]+/g, ', ')
    .split(/,|;|\.|\s+y\s+|\s+e\s+|\//i)
    .map(function(parte) { return parte.trim(); })
    .filter(Boolean);

  if (!segmentos.length && observacion) segmentos = [observacion];

  var vistos = {};
  var salida = [];

  for (var i = 0; i < segmentos.length; i++) {
    var segmento = segmentos[i];
    var mejorItem = null;
    var mejorScore = 0;

    for (var j = 0; j < grupo.items.length; j++) {
      var itemNombre = grupo.items[j].nombre;
      var score = puntuarItemLocal(segmento, itemNombre);
      if (score > mejorScore) {
        mejorScore = score;
        mejorItem = itemNombre;
      }
    }

    if (!mejorItem || mejorScore <= 0 || vistos[mejorItem]) continue;
    vistos[mejorItem] = true;
    salida.push({
      nombre: mejorItem,
      estado: detectarEstadoLocal(segmento)
    });
  }

  if (!salida.length && observacion) {
    var mejorItemGeneral = null;
    var mejorScoreGeneral = 0;
    for (var k = 0; k < grupo.items.length; k++) {
      var nombreItem = grupo.items[k].nombre;
      var scoreGeneral = puntuarItemLocal(observacion, nombreItem);
      if (scoreGeneral > mejorScoreGeneral) {
        mejorScoreGeneral = scoreGeneral;
        mejorItemGeneral = nombreItem;
      }
    }

    if (mejorItemGeneral && mejorScoreGeneral > 0) {
      salida.push({
        nombre: mejorItemGeneral,
        estado: detectarEstadoLocal(observacion)
      });
    }
  }

  return {
    items: salida,
    observacion: observacion,
    fuente: 'reglas_locales'
  };
}

function obtenerUrlWebhook(req) {
  if (config.TWILIO_WEBHOOK_URL) {
    return config.TWILIO_WEBHOOK_URL;
  }

  var proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  var host = req.headers['x-forwarded-host'] || req.get('host') || '';
  return proto + '://' + host + req.originalUrl;
}

function firmaTwilioValida(req) {
  // FIX: solo permitir desactivar la validacion de firma Twilio en entornos de desarrollo.
  var esDesarrollo = process.env.NODE_ENV !== 'production';
  // FIX: mantener bypass unicamente en desarrollo cuando la bandera explicita esta activa.
  if (esDesarrollo && String(process.env.DISABLE_TWILIO_SIGNATURE_VALIDATION || '').toLowerCase() === 'true') {
    return true;
  }
  // FIX: bloquear el bypass de validacion si la bandera se activa en produccion.
  if (!esDesarrollo && String(process.env.DISABLE_TWILIO_SIGNATURE_VALIDATION || '').toLowerCase() === 'true') {
    console.warn('⚠️ Validación de firma desactivada en producción — bloqueado');
    return false;
  }

  if (!config.TWILIO_AUTH_TOKEN) {
    console.warn('TWILIO_AUTH_TOKEN no configurado; se omite validacion de firma.');
    return true;
  }

  var signature = req.headers['x-twilio-signature'];
  if (!signature) return false;

  try {
    return twilio.validateRequest(config.TWILIO_AUTH_TOKEN, signature, obtenerUrlWebhook(req), req.body || {});
  } catch (error) {
    console.error('Error validando firma Twilio:', error.message);
    return false;
  }
}

function avanzarDespuesDeInspeccion(res, sesion, prefijo) {
  var resumen = preop.generarResumen(sesion);
  var mensaje = (prefijo ? prefijo + '\n\n' : '') + resumen + '\n\n' + mensajes.mensajeFotoNovedad(sesion, estadoPreop.prepararFotosNovedad);
  return preop.responderTwiml(res, mensaje);
}

async function iniciarSesionConVehiculo(sesion, telefono, placa, fotoUrl, validacionTexto) {
  var carga = await vehiculosData.cargarVehiculoYConductor(placa, telefono);

  if (carga.error || !carga.vehiculo) {
    return { ok: false, tipo: 'no_encontrado' };
  }

  if (carga.vehiculo.bloqueado) {
    return {
      ok: false,
      tipo: 'bloqueado',
      mensaje: '🚫 *Vehiculo BLOQUEADO*\n' + placa + '\n' + (carga.vehiculo.motivo_bloqueo || 'Contacte al supervisor')
    };
  }

  sesion.placa = placa;
  sesion.vehiculo = carga.vehiculo;
  sesion.conductor = carga.conductor;
  estadoPreop.reiniciarDatosOperativos(sesion);
  storage.guardarFotoUnica(sesion, {
    tipo: 'inicio_placa',
    url: fotoUrl,
    descripcion: 'Foto frontal con placa',
    validacion: validacionTexto || ('Placa registrada: ' + placa),
    validada: true
  });
  sesion.estado = 'ESPERANDO_FOTO_ODOMETRO';

  return {
    ok: true,
    mensaje: '✅ *' + placa + '*\n' + [carga.vehiculo.tipo, carga.vehiculo.marca, carga.vehiculo.modelo].filter(Boolean).join(' ') +
      '\n\n' + mensajes.mensajeInicioOdometro(carga.vehiculo)
  };
}

async function procesarFotoFrontal(res, sesion, telefono, fotoUrl) {
  var lecturaPlaca = await ocr.extraerPlacaFoto(fotoUrl);
  var placaDetectada = preop.normalizarPlaca(lecturaPlaca.placa || '');

  if (lecturaPlaca.valida && placaDetectada) {
    var inicio = await iniciarSesionConVehiculo(sesion, telefono, placaDetectada, fotoUrl, 'Placa validada por foto: ' + placaDetectada);
    if (inicio.ok) return preop.responderTwiml(res, inicio.mensaje);
    if (inicio.tipo === 'bloqueado') return preop.responderTwiml(res, inicio.mensaje);
  }

  sesion.fotoPlacaTemporal = fotoUrl;
  sesion.placaDetectada = placaDetectada || null;
  sesion.placaSugerida = null;

  if (placaDetectada) {
    var placaSugerida = await vehiculosData.buscarPlacaSugerida(placaDetectada);
    if (placaSugerida && placaSugerida !== placaDetectada) {
      sesion.placaSugerida = placaSugerida;
      sesion.estado = 'PLACA_CONFIRMACION_SUGERIDA';
      return preop.responderTwiml(
        res,
        mensajes.mensajeConfirmacionPlacaSugerida(sesion, 'La lectura no coincide exactamente con la base. Confirma la placa si es correcta.')
      );
    }
  }

  sesion.estado = 'PLACA_FALLBACK';
  var motivo = lecturaPlaca.razon || 'La placa no se pudo validar con seguridad.';
  if (placaDetectada && lecturaPlaca.valida) {
    motivo = 'La placa *' + placaDetectada + '* no existe en la base.';
  }
  return preop.responderTwiml(res, mensajes.mensajeFallbackPlaca(sesion, motivo));
}

function registrarKilometrajeConfirmado(sesion, km, origen) {
  sesion.kilometraje = km;
  storage.guardarFotoUnica(sesion, {
    tipo: 'inicio_odometro',
    url: sesion.fotoOdometroTemporal,
    descripcion: 'Foto del odometro',
    validacion: origen || ('Kilometraje registrado: ' + km + ' km'),
    validada: true
  });
  sesion.kmDetectado = null;
  sesion.kmLecturaFueraRango = false;
  sesion.fotoOdometroTemporal = null;
  sesion.grupoActual = 0;
  sesion.estado = 'GRUPO';
}

function evaluarKilometrajeContraHistorico(sesion, km) {
  var ultimo = sesion.vehiculo && sesion.vehiculo.kilometraje;

  // Sin referencia real: null, undefined, o 0 (vehiculo recien cargado sin preoperacional previo).
  // En ese caso no hay con que comparar — se acepta cualquier km positivo.
  if (!ultimo) {
    return { ok: true, tipo: 'sin_historico', mensaje: '', mensajeCorto: '' };
  }

  if (km < ultimo) {
    return {
      ok: false,
      tipo: 'menor',
      mensaje: '❌ Kilometraje inválido.\nÚltimo registrado: *' + ultimo + ' km*\nDebe ser igual o mayor.',
      mensajeCorto: 'El valor detectado quedó por debajo del último registro.'
    };
  }

  if (km > (ultimo + config.MAX_KM_SALTO)) {
    return {
      ok: false,
      tipo: 'alto',
      mensaje: '⚠️ Kilometraje fuera del rango automático.\nÚltimo registrado: *' + ultimo + ' km*\nSalto detectado: *' + (km - ultimo) + ' km*',
      mensajeCorto: 'El salto detectado fue de *' + (km - ultimo) + ' km*.'
    };
  }

  return { ok: true, tipo: 'ok', mensaje: '', mensajeCorto: '' };
}

async function procesarFotoOdometro(res, sesion, fotoUrl) {
  sesion.fotoOdometroTemporal = fotoUrl;
  var lecturaKm = await ocr.extraerKilometrajeFoto(fotoUrl);
  sesion.kmDetectado = lecturaKm && lecturaKm.kilometraje != null ? lecturaKm.kilometraje : null;
  sesion.kmLecturaFueraRango = false;
  sesion.estado = 'ODOMETRO_CONFIRMACION';

  if (sesion.kmDetectado != null) {
    var evaluacion = evaluarKilometrajeContraHistorico(sesion, sesion.kmDetectado);
    if (!evaluacion.ok) {
      sesion.kmLecturaFueraRango = true;
      return preop.responderTwiml(res, mensajes.mensajeKilometrajeFueraRango(sesion, evaluacion, config.MAX_KM_SALTO));
    }
    return preop.responderTwiml(res, mensajes.mensajeConfirmacionOdometro(sesion));
  }

  return preop.responderTwiml(res, mensajes.mensajeConfirmacionOdometro(sesion, lecturaKm.razon || 'La imagen no es clara.'));
}

function manejarAtras(res, sesion) {
  if (sesion.estado === 'ESPERANDO_FOTO_ODOMETRO' || sesion.estado === 'PLACA_FALLBACK' || sesion.estado === 'PLACA_CONFIRMACION_SUGERIDA' || sesion.estado === 'PLACA_MANUAL') {
    estadoPreop.volverAInicioPorFoto(sesion);
    return preop.responderTwiml(res, '◀️ Volvemos al inicio.\n\n' + mensajes.mensajeInicioPlaca());
  }

  if (sesion.estado === 'ODOMETRO_CONFIRMACION' || sesion.estado === 'ODOMETRO_MANUAL') {
    estadoPreop.volverAKilometraje(sesion);
    return preop.responderTwiml(res, '◀️ Volvemos al kilometraje.\n\n' + mensajes.mensajeInicioOdometro(sesion.vehiculo));
  }

  if (sesion.estado === 'GRUPO' && sesion.grupoActual > 0) {
    sesion.grupoActual--;
    estadoPreop.limpiarGrupo(sesion, GRUPOS[sesion.grupoActual]);
    return preop.responderTwiml(res, preop.formatGrupoMsg(GRUPOS[sesion.grupoActual], '◀️ Volvemos'));
  }

  if (sesion.estado === 'GRUPO' && sesion.grupoActual === 0) {
    estadoPreop.volverAKilometraje(sesion);
    return preop.responderTwiml(res, '◀️ Volvemos al kilometraje.\n\n' + mensajes.mensajeInicioOdometro(sesion.vehiculo));
  }

  if (sesion.estado === 'DESCRIBIR_NOVEDAD') {
    sesion.estado = 'GRUPO';
    return preop.responderTwiml(res, preop.formatGrupoMsg(GRUPOS[sesion.grupoActual], '◀️ Volvemos'));
  }

  // v12 — Atrás desde sub-pregunta: limpiar grupo y volver a opciones
  if (sesion.estado === 'SUB_PREGUNTA') {
    sesion.subPreguntasCola = [];
    estadoPreop.limpiarGrupo(sesion, GRUPOS[sesion.grupoActual]);
    sesion.estado = 'GRUPO';
    return preop.responderTwiml(res, preop.formatGrupoMsg(GRUPOS[sesion.grupoActual], '◀️ Volvemos'));
  }

  if (sesion.estado === 'FOTO_NOVEDAD') {
    storage.limpiarFotosPorTipo(sesion, ['novedad', 'adicional']);
    sesion.fotosNovedadPendientes = [];
    return preop.responderTwiml(res, mensajes.mensajeFotoNovedad(sesion, estadoPreop.prepararFotosNovedad, '◀️ Volvemos'));
  }

  if (sesion.estado === 'FOTO_ADICIONAL') {
    storage.limpiarFotosPorTipo(sesion, ['adicional']);
    if (preop.obtenerNovedadesFotografiables(sesion.novedades).length > 0) {
      storage.limpiarFotosPorTipo(sesion, ['novedad']);
      sesion.fotosNovedadPendientes = [];
      return preop.responderTwiml(res, mensajes.mensajeFotoNovedad(sesion, estadoPreop.prepararFotosNovedad, '◀️ Volvemos'));
    }
    return preop.responderTwiml(res, '◀️ 📸 *Fotos adicionales?*\nEnvie fotos extra o escriba *no* para continuar');
  }

  if (sesion.estado === 'OBSERVACION') {
    sesion.observacion = null;
    sesion.estado = 'FOTO_ADICIONAL';
    return preop.responderTwiml(res, '◀️ 📸 *Fotos adicionales?*\nEnvie fotos extra o escriba *no* para continuar');
  }

  if (sesion.estado === 'CONFIRMACION') {
    sesion.estado = 'OBSERVACION';
    return preop.responderTwiml(res, '◀️ 💬 Observacion final?\nSi no hay, escribe *no*.');
  }

  return preop.responderTwiml(res, 'No hay paso anterior.\n\n0️⃣ _Atrás_  •  9️⃣ _Menú principal_');
}


// ============================================================================
// MANEJADOR PRINCIPAL DEL PREOPERACIONAL - Exportable para el enrutador
// ============================================================================
async function manejarPreoperacional(req, res) {
    if (!firmaTwilioValida(req)) {
      return res.status(403).send('Forbidden');
    }

    var mensaje = (req.body.Body || '').trim();
    var telefono = req.body.From || '';
    var mediaUrls = storage.obtenerMediaUrls(req);
    var numMedia = mediaUrls.length;
    var sesion;

    // FIX: bloquear el procesamiento concurrente antes de ejecutar cualquier logica del handler principal.
    if (!sesiones.bloquear(telefono)) {
      return preop.responderTwiml(res, 'Un momento, procesando tu mensaje anterior...');
    }

    try {
      sesion = await sesiones.obtenerSesion(telefono);
      console.log('[' + preop.ocultarTelefono(telefono) + '] Estado=' + sesion.estado + ' Texto=' + mensaje.length + ' chars Media=' + numMedia);
      var msgUpper = mensaje.toUpperCase();
      var msgLower = mensaje.toLowerCase();

      if (mensaje === '9' || msgUpper === 'CANCELAR') {
        sesiones.eliminarSesion(telefono);
        sesiones.guardarCambios();
        return responderMenuDesdeModulo(res);
      }

      if (msgUpper === 'REINICIAR') {
        sesiones.eliminarSesion(telefono);
        sesiones.guardarCambios();
        return responderMenuDesdeModulo(res);
      }

      if (mensaje === '0' || msgUpper === 'ATRAS') {
        return manejarAtras(res, sesion);
      }

      if (msgUpper === 'MENU' || msgUpper === 'INICIO') {
        sesiones.eliminarSesion(telefono);
        sesiones.guardarCambios();
        return responderMenuDesdeModulo(res);
      }

      switch (sesion.estado) {
        case 'INICIO':
        case 'ESPERANDO_PLACA':
        case 'ESPERANDO_FOTO_FRONTAL': {
          sesion.estado = 'ESPERANDO_FOTO_FRONTAL';
          // FIX: detectar multiples fotos y procesar solo la primera en la captura frontal.
          var totalFotos = parseInt(req.body.NumMedia || '0', 10);
          // FIX: dejar trazabilidad cuando el usuario envia mas de una foto en este paso.
          if (totalFotos > 1) {
            console.log('Usuario envió ' + totalFotos + ' fotos, procesando solo la primera');
          }
          if (esOpcion(msgLower, ['9', '9️⃣', '0', '0️⃣'])) return volverAMenuPrincipal(res, telefono);
          if (numMedia === 0) return preop.responderTwiml(res, mensajes.mensajeInicio());
          return await procesarFotoFrontal(res, sesion, telefono, mediaUrls[0]);
        }

        case 'PLACA_CONFIRMACION_SUGERIDA': {
          if (numMedia > 0) return await procesarFotoFrontal(res, sesion, telefono, mediaUrls[0]);

          if (esOpcion(msgLower, ['9', '9️⃣', '0', '0️⃣'])) {
            return volverAMenuPrincipal(res, telefono);
          }

          if ((msgLower === '1' || msgLower === '1️⃣' || msgLower === 'confirmar') && sesion.placaSugerida) {
            // FIX: restaurar la inicializacion con placa sugerida que se perdió al unir el archivo.
            var inicioSugerido = await iniciarSesionConVehiculo(
              sesion,
              telefono,
              sesion.placaSugerida,
              sesion.fotoPlacaTemporal,
              'Placa confirmada desde sugerencia: ' + sesion.placaSugerida + (sesion.placaDetectada ? (' (lectura inicial: ' + sesion.placaDetectada + ')') : '')
            );
            if (inicioSugerido.ok) return preop.responderTwiml(res, inicioSugerido.mensaje);
            if (inicioSugerido.tipo === 'bloqueado') return preop.responderTwiml(res, inicioSugerido.mensaje);
          }

          if (msgLower === '2' || msgLower === '2️⃣' || msgLower === 'foto') {
            sesion.estado = 'ESPERANDO_FOTO_FRONTAL';
            return preop.responderTwiml(res, mensajes.mensajeInicio());
          }

          if (msgLower === '3' || msgLower === '3️⃣') {
            sesion.estado = 'PLACA_MANUAL';
            return preop.responderTwiml(res, '⌨️ Escribe la placa manualmente.\nEjemplo: *IDL354*');
          }

          return preop.responderTwiml(res, mensajes.mensajeConfirmacionPlacaSugerida(sesion));
        }

        case 'PLACA_FALLBACK': {
          if (numMedia > 0) return await procesarFotoFrontal(res, sesion, telefono, mediaUrls[0]);
          if (esOpcion(msgLower, ['9', '9️⃣', '0', '0️⃣'])) return volverAMenuPrincipal(res, telefono);
          if (msgLower === '1' || msgLower === '1️⃣' || msgLower === 'foto') {
            sesion.estado = 'ESPERANDO_FOTO_FRONTAL';
            return preop.responderTwiml(res, mensajes.mensajeInicio());
          }
          if (msgLower === '2' || msgLower === '2️⃣') {
            sesion.estado = 'PLACA_MANUAL';
            return preop.responderTwiml(res, '⌨️ Escribe la placa manualmente.\nEjemplo: *IDL354*');
          }
          return preop.responderTwiml(res, mensajes.mensajeFallbackPlaca(sesion));
        }

        case 'PLACA_MANUAL': {
          if (numMedia > 0) return await procesarFotoFrontal(res, sesion, telefono, mediaUrls[0]);
          if (esOpcion(msgLower, ['9', '9️⃣', '0', '0️⃣'])) return volverAMenuPrincipal(res, telefono);
          var placaManual = preop.normalizarPlaca(mensaje);
          if (!placaManual) return preop.responderTwiml(res, '⌨️ Escribe la placa sin espacios.\nEjemplo: *IDL354*');
          // FIX: validar el formato de la placa manual antes de consultar el vehiculo en la base.
          var FORMATO_PLACA_CO = /^[A-Z]{3}[0-9]{3}$/;
          // FIX: rechazar placas que no cumplan el patron 3 letras + 3 numeros.
          if (!FORMATO_PLACA_CO.test(placaManual)) {
            return preop.responderTwiml(res,
              'Formato inválido. La placa debe ser 3 letras + 3 números (ej: ABC123).');
          }

          var inicioManual = await iniciarSesionConVehiculo(
            sesion,
            telefono,
            placaManual,
            sesion.fotoPlacaTemporal,
            'Placa registrada manualmente: ' + placaManual
          );
          if (inicioManual.ok) return preop.responderTwiml(res, inicioManual.mensaje);
          if (inicioManual.tipo === 'bloqueado') return preop.responderTwiml(res, inicioManual.mensaje);
          return preop.responderTwiml(res, '❌ La placa *' + placaManual + '* no existe en la base.\nRevisa con el supervisor o envia otra foto.');
        }

        case 'ESPERANDO_FOTO_ODOMETRO': {
          // FIX: detectar multiples fotos y procesar solo la primera en la captura del odometro.
          var totalFotos = parseInt(req.body.NumMedia || '0', 10);
          // FIX: dejar trazabilidad cuando el usuario envia mas de una foto en este paso.
          if (totalFotos > 1) {
            console.log('Usuario envió ' + totalFotos + ' fotos, procesando solo la primera');
          }
          if (esOpcion(msgLower, ['4', '4️⃣'])) return manejarAtras(res, sesion);
          if (esOpcion(msgLower, ['9', '9️⃣', '0', '0️⃣'])) return volverAMenuPrincipal(res, telefono);
          if (numMedia === 0) return preop.responderTwiml(res, mensajes.mensajeInicioOdometro(sesion.vehiculo));
          return await procesarFotoOdometro(res, sesion, mediaUrls[0]);
        }

        case 'ODOMETRO_CONFIRMACION': {
          if (numMedia > 0) return await procesarFotoOdometro(res, sesion, mediaUrls[0]);
          if (esOpcion(msgLower, ['4', '4️⃣'])) return manejarAtras(res, sesion);
          if (esOpcion(msgLower, ['9', '9️⃣', '0', '0️⃣'])) return volverAMenuPrincipal(res, telefono);

          // Caso A: lectura fuera de rango — mensaje muestra 2 opciones: 1→manual, 2→nueva foto
          if (sesion.kmLecturaFueraRango) {
            if (msgLower === '1' || msgLower === '1️⃣') {
              sesion.estado = 'ODOMETRO_MANUAL';
              return preop.responderTwiml(res, '⌨️ Escribe el kilometraje correcto usando solo numeros.');
            }
            if (msgLower === '2' || msgLower === '2️⃣' || msgLower === 'foto') {
              sesion.kmDetectado = null;
              sesion.kmLecturaFueraRango = false;
              sesion.estado = 'ESPERANDO_FOTO_ODOMETRO';
              return preop.responderTwiml(res, mensajes.mensajeInicioOdometro(sesion.vehiculo));
            }
            return preop.responderTwiml(res, mensajes.mensajeKilometrajeFueraRango(sesion, evaluarKilometrajeContraHistorico(sesion, sesion.kmDetectado || 0), config.MAX_KM_SALTO));
          }

          // Caso B: no se pudo leer el km — mensaje muestra 2 opciones: 1→manual, 2→nueva foto
          if (sesion.kmDetectado == null) {
            if (msgLower === '1' || msgLower === '1️⃣') {
              sesion.estado = 'ODOMETRO_MANUAL';
              return preop.responderTwiml(res, '⌨️ Escribe el kilometraje correcto usando solo numeros.');
            }
            if (msgLower === '2' || msgLower === '2️⃣' || msgLower === 'foto') {
              sesion.estado = 'ESPERANDO_FOTO_ODOMETRO';
              return preop.responderTwiml(res, mensajes.mensajeInicioOdometro(sesion.vehiculo));
            }
            return preop.responderTwiml(res, mensajes.mensajeConfirmacionOdometro(sesion));
          }

          // Caso C: km detectado y en rango — mensaje muestra 3 opciones: 1→confirmar, 2→manual, 3→nueva foto
          if (msgLower === '1' || msgLower === '1️⃣' || msgLower === 'confirmar') {
            registrarKilometrajeConfirmado(sesion, sesion.kmDetectado, 'Kilometraje confirmado desde foto: ' + sesion.kmDetectado + ' km');
            return preop.responderTwiml(res, mensajes.primerMensajeInspeccion(sesion));
          }

          if (msgLower === '2' || msgLower === '2️⃣') {
            sesion.estado = 'ODOMETRO_MANUAL';
            return preop.responderTwiml(res, '⌨️ Escribe el kilometraje correcto usando solo numeros.');
          }

          if (msgLower === '3' || msgLower === '3️⃣' || msgLower === 'foto') {
            sesion.kmDetectado = null;
            sesion.estado = 'ESPERANDO_FOTO_ODOMETRO';
            return preop.responderTwiml(res, mensajes.mensajeInicioOdometro(sesion.vehiculo));
          }

          return preop.responderTwiml(res, mensajes.mensajeConfirmacionOdometro(sesion));
        }

        case 'ODOMETRO_MANUAL': {
          if (numMedia > 0) return await procesarFotoOdometro(res, sesion, mediaUrls[0]);
          if (esOpcion(msgLower, ['4', '4️⃣'])) return manejarAtras(res, sesion);
          if (esOpcion(msgLower, ['9', '9️⃣', '0', '0️⃣'])) return volverAMenuPrincipal(res, telefono);
          var kmManual = mensajes.normalizarKilometrajeManual ? mensajes.normalizarKilometrajeManual(mensaje) : String(mensaje || '').replace(/[^0-9]/g, '');
          kmManual = typeof kmManual === 'number' ? kmManual : (kmManual ? parseInt(kmManual, 10) : null);
          if (kmManual == null) {
            return preop.responderTwiml(res, '⌨️ Escribe el kilometraje usando solo numeros.\nEjemplo: *127892*');
          }

          var evaluacionKmManual = evaluarKilometrajeContraHistorico(sesion, kmManual);
          if (!evaluacionKmManual.ok && evaluacionKmManual.tipo === 'menor') {
            return preop.responderTwiml(res, evaluacionKmManual.mensaje + '\n\nEscribe el kilometraje correcto o envia otra foto.');
          }

          var validacionKm = 'Kilometraje corregido manualmente: ' + kmManual + ' km';
          var avisoKm = '';
          if (!evaluacionKmManual.ok && evaluacionKmManual.tipo === 'alto') {
            validacionKm += ' (supera el rango automatico de ' + config.MAX_KM_SALTO + ' km)';
            avisoKm = '⚠️ Kilometraje fuera del rango automatico. Queda registrado para revision.\n\n';
          }

          registrarKilometrajeConfirmado(sesion, kmManual, validacionKm);
          return preop.responderTwiml(res, avisoKm + mensajes.primerMensajeInspeccion(sesion));
        }

        case 'GRUPO': {
          var grupoActual = GRUPOS[sesion.grupoActual];
          var respLimpia = mensaje.trim();
          var respLower = respLimpia.toLowerCase();

          if (respLimpia === '1' || respLimpia === '1️⃣' || respLower === 'ok' || respLower === 'todo bien') {
            estadoPreop.limpiarGrupo(sesion, grupoActual);
            sesion.respuestas[grupoActual.id] = ocr.marcarTodoOK();
            sesion.grupoActual++;
            if (sesion.grupoActual < GRUPOS.length) {
              return preop.responderTwiml(res, preop.formatGrupoMsg(GRUPOS[sesion.grupoActual], '✅ OK'));
            }
            return avanzarDespuesDeInspeccion(res, sesion);
          }

          if (respLimpia === '2' || respLimpia === '2️⃣') {
            sesion.estado = 'DESCRIBIR_NOVEDAD';
            var listaItems = grupoActual.items.map(function(item) { return '• ' + item.nombre; }).join('\n');
            var ejemplos = grupoActual.items.slice(0, 2).map(function(item) { return item.nombre.toLowerCase(); }).join('", "');
            return preop.responderTwiml(res,
              '✍️ *Describe la novedad en:*\n*' + grupoActual.nombre + '*\n------\n' + listaItems +
              '\n------\n_Escribe lo que encontraste_\n_Ej: "' + ejemplos + ' malo"_'
            );
          }

          if (respLimpia === '3' || respLimpia === '3️⃣' || respLower === 'atras') {
            if (sesion.grupoActual > 0) {
              sesion.grupoActual--;
              estadoPreop.limpiarGrupo(sesion, GRUPOS[sesion.grupoActual]);
              return preop.responderTwiml(res, preop.formatGrupoMsg(GRUPOS[sesion.grupoActual], '◀️ Volvemos'));
            }
            estadoPreop.volverAKilometraje(sesion);
            return preop.responderTwiml(res, '◀️ Volvemos al kilometraje.\n\n' + mensajes.mensajeInicioOdometro(sesion.vehiculo));
          }

          return preop.responderTwiml(res, preop.formatGrupoMsg(grupoActual, '❌ Responde 1, 2 o 3'));
        }

        case 'DESCRIBIR_NOVEDAD': {
          var grupoNovedad = GRUPOS[sesion.grupoActual];
          var textoNovedad = String(mensaje || '').trim();

          if (numMedia > 0) {
            return preop.responderTwiml(res, '✍️ En este paso necesito texto, no foto.\nDescribe el item y la falla.\n_Ej: "freno de parqueo malo"_');
          }

          if (textoNovedad === '3' || textoNovedad === '3️⃣' || textoNovedad.toUpperCase() === 'ATRAS') {
            return manejarAtras(res, sesion);
          }

          if (!textoNovedad || textoNovedad.length < 3 || ['1', '1️⃣', '2', '2️⃣'].indexOf(textoNovedad) >= 0) {
            var ejemplosAyuda = grupoNovedad.items.slice(0, 2).map(function(item) { return item.nombre.toLowerCase(); }).join('", "');
            return preop.responderTwiml(res, '✍️ Describe el item y la falla con texto.\n_Ej: "' + ejemplosAyuda + ' malo"_\nTambién puedes escribir *ATRAS* para volver.');
          }

          var interpretacion;
          try {
            interpretacion = await ocr.interpretarNovedad(textoNovedad, grupoNovedad.items.map(function(item) { return item.nombre; }));
          } catch (error) {
            console.error('Error interpretando novedad [' + grupoNovedad.id + '] texto="' + textoNovedad + '":', error.message || error);
            interpretacion = null;
          }

          if (!interpretacion || !Array.isArray(interpretacion.items)) {
            var ejemplosError = grupoNovedad.items.slice(0, 2).map(function(item) { return item.nombre.toLowerCase(); }).join('", "');
            return preop.responderTwiml(res, '❌ No pude interpretar la novedad.\nDescribe de nuevo el item y la falla.\n_Ej: "' + ejemplosError + ' malo"_');
          }

          var itemsInterpretados = estadoPreop.normalizarItemsInterpretados(interpretacion.items, grupoNovedad);
          if (!itemsInterpretados.length) {
            return preop.responderTwiml(
              res,
              '❌ No pude asociar la novedad a un item de este bloque.\nMenciona uno de estos items: ' + grupoNovedad.items.map(function(item) { return item.nombre; }).join(', ')
            );
          }

          estadoPreop.limpiarGrupo(sesion, grupoNovedad);
          sesion.respuestas[grupoNovedad.id] = {
            estado: 'NOVEDAD',
            items: itemsInterpretados,
            observacion: interpretacion.observacion || textoNovedad
          };

          var novedadesGrupo = itemsInterpretados.filter(function(item) {
            return preop.clasificarEstado(item.estado) !== 'ok';
          }).map(function(item) {
            return {
              grupo: grupoNovedad.nombre,
              item: item.nombre,
              estado: item.estado,
              nota: item.estado,
              critico: preop.esCritico(grupoNovedad.id, item.nombre)
            };
          });

          // v12 — Separar novedades con y sin sub-pregunta de severidad
          var novedadesSinSub = [];
          var novedadesConSub = [];

          for (var i = 0; i < novedadesGrupo.length; i++) {
            var nov = novedadesGrupo[i];
            if (preop.tieneSubPregunta(nov.item)) {
              novedadesConSub.push(nov);
            } else {
              // Ítems sin sub-pregunta: evaluar severidad inmediatamente
              nov.severidad = preop.evaluarSeveridadNovedad(nov.item, nov.estado, null);
              novedadesSinSub.push(nov);
            }
          }

          // Agregar novedades sin sub-pregunta directamente
          for (var j = 0; j < novedadesSinSub.length; j++) {
            sesion.novedades.push(novedadesSinSub[j]);
          }

          // Si hay novedades que necesitan sub-pregunta, entrar al estado SUB_PREGUNTA
          if (novedadesConSub.length > 0) {
            sesion.subPreguntasCola = novedadesConSub;
            sesion.estado = 'SUB_PREGUNTA';
            var primeraSub = novedadesConSub[0];
            var subPregunta = preop.obtenerSubPregunta(primeraSub.item);
            var prefijoSub = novedadesSinSub.length > 0
              ? '⚠️ Anotado: ' + novedadesSinSub.map(function(n) { return n.item + ' (' + n.estado + ')'; }).join(', ')
              : '📋 Necesito precisar la novedad:';
            return preop.responderTwiml(res, preop.formatSubPreguntaMsg(subPregunta, prefijoSub));
          }

          // Sin sub-preguntas pendientes — avanzar normalmente
          var confirmacion = novedadesGrupo.length > 0
            ? '⚠️ Anotado: ' + novedadesGrupo.map(function(n) { return n.item + ' (' + n.estado + ')'; }).join(', ')
            : '✅ Registrado';

          sesion.grupoActual++;
          sesion.estado = 'GRUPO';
          if (sesion.grupoActual < GRUPOS.length) {
            return preop.responderTwiml(res, preop.formatGrupoMsg(GRUPOS[sesion.grupoActual], confirmacion));
          }
          return avanzarDespuesDeInspeccion(res, sesion, confirmacion);
        }

        // ────────────────────────────────────────────────────
        // SUB_PREGUNTA — v12 — precisar severidad de novedad
        // Se activa cuando un ítem crítico tiene opciones de
        // nivel (aceite, refrigerante, etc.) o tipo (fugas, pito)
        // ────────────────────────────────────────────────────
        case 'SUB_PREGUNTA': {
          // No se aceptan fotos en este paso
          if (numMedia > 0) {
            var subActualFoto = preop.obtenerSubPregunta(sesion.subPreguntasCola[0].item);
            return preop.responderTwiml(res, preop.formatSubPreguntaMsg(subActualFoto, '⌨️ En este paso necesito un número, no foto.'));
          }

          // Validar que hay cola activa
          if (!sesion.subPreguntasCola || sesion.subPreguntasCola.length === 0) {
            sesion.estado = 'GRUPO';
            return preop.responderTwiml(res, preop.formatGrupoMsg(GRUPOS[sesion.grupoActual], '↩️ Continuamos'));
          }

          var novedadSubActual = sesion.subPreguntasCola[0];
          var subPreguntaActual = preop.obtenerSubPregunta(novedadSubActual.item);

          // Procesar la respuesta numérica del operario
          var opcionElegida = preop.procesarRespuestaSubPregunta(subPreguntaActual, mensaje);

          if (!opcionElegida) {
            return preop.responderTwiml(res, preop.formatSubPreguntaMsg(subPreguntaActual, '❌ Responde con el número de la opción'));
          }

          // Actualizar la novedad con la severidad y estado preciso
          novedadSubActual.severidad = opcionElegida.severidad;
          novedadSubActual.estado = opcionElegida.estado;
          novedadSubActual.nota = opcionElegida.estado;
          novedadSubActual.subRespuesta = {
            num: opcionElegida.num,
            texto: opcionElegida.texto,
            severidad: opcionElegida.severidad
          };

          // Agregar la novedad procesada a la sesión
          sesion.novedades.push(novedadSubActual);

          // Quitar de la cola
          sesion.subPreguntasCola.shift();

          // Si hay más sub-preguntas en la cola, preguntar la siguiente
          if (sesion.subPreguntasCola.length > 0) {
            var siguienteSub = sesion.subPreguntasCola[0];
            var subSiguiente = preop.obtenerSubPregunta(siguienteSub.item);
            var prefijoSiguiente = '✅ ' + novedadSubActual.item + ': *' + opcionElegida.estado + '*';
            return preop.responderTwiml(res, preop.formatSubPreguntaMsg(subSiguiente, prefijoSiguiente));
          }

          // Cola vacía — todas las sub-preguntas respondidas
          sesion.subPreguntasCola = [];

          // Generar confirmación con todas las novedades del grupo actual
          var grupoActualNombre = GRUPOS[sesion.grupoActual].nombre;
          var novedadesDelGrupo = sesion.novedades.filter(function(n) {
            return n.grupo === grupoActualNombre;
          });
          var confirmacionSub = '✅ ' + novedadSubActual.item + ': *' + opcionElegida.estado + '*';
          if (novedadesDelGrupo.length > 1) {
            confirmacionSub = '⚠️ Anotado: ' + novedadesDelGrupo.map(function(n) {
              return n.item + ' (' + n.estado + ')';
            }).join(', ');
          }

          // Avanzar al siguiente grupo
          sesion.grupoActual++;
          sesion.estado = 'GRUPO';
          if (sesion.grupoActual < GRUPOS.length) {
            return preop.responderTwiml(res, preop.formatGrupoMsg(GRUPOS[sesion.grupoActual], confirmacionSub));
          }
          return avanzarDespuesDeInspeccion(res, sesion, confirmacionSub);
        }

        case 'FOTO_NOVEDAD': {
          // FIX: detectar multiples fotos y procesar solo la primera para evidencia de novedad.
          var totalFotos = parseInt(req.body.NumMedia || '0', 10);
          // FIX: registrar en logs cuando llegan varias fotos en este estado.
          if (totalFotos > 1) {
            console.log('Usuario envió ' + totalFotos + ' fotos, procesando solo la primera');
          }
          estadoPreop.prepararFotosNovedad(sesion);
          if (!sesion.fotosNovedadPendientes.length) {
            sesion.estado = 'FOTO_ADICIONAL';
            return preop.responderTwiml(res, '📸 *Fotos adicionales?*\nEnvie fotos extra si quiere agregar evidencia\no escriba *no* para continuar');
          }
          if (numMedia === 0) {
            return preop.responderTwiml(res, mensajes.mensajeFotoNovedad(sesion, estadoPreop.prepararFotosNovedad));
          }

          var novedadActual = sesion.fotosNovedadPendientes[0];
          sesion.fotos.push({
            tipo: 'novedad',
            url: mediaUrls[0],
            descripcion: novedadActual.grupo + ' - ' + novedadActual.item,
            validacion: 'Evidencia de novedad recibida',
            validada: true
          });
          sesion.fotosNovedadPendientes.shift();

          if (sesion.fotosNovedadPendientes.length > 0) {
            var siguienteNov = sesion.fotosNovedadPendientes[0];
            return preop.responderTwiml(res, '✅ Foto recibida\n\n📸 *Foto de novedad* (' + sesion.fotosNovedadPendientes.length + ' pendiente(s))\n*' + siguienteNov.item + '*\n_' + (siguienteNov.nota || siguienteNov.estado || siguienteNov.grupo) + '_');
          }

          sesion.estado = 'FOTO_ADICIONAL';
          return preop.responderTwiml(res, '✅ Todas las fotos recibidas\n\n📸 *Fotos adicionales?*\nEnvie fotos extra si quiere agregar evidencia\no escriba *no* para continuar');
        }

        case 'FOTO_ADICIONAL': {
          // FIX: detectar multiples fotos y procesar solo la primera como evidencia adicional.
          var totalFotos = parseInt(req.body.NumMedia || '0', 10);
          // FIX: registrar en logs cuando llegan varias fotos en este estado.
          if (totalFotos > 1) {
            console.log('Usuario envió ' + totalFotos + ' fotos, procesando solo la primera');
          }
          if (numMedia > 0) {
            sesion.fotos.push({
              tipo: 'adicional',
              url: mediaUrls[0],
              descripcion: 'Foto adicional',
              validacion: 'Evidencia adicional recibida',
              validada: true
            });
            return preop.responderTwiml(res, '✅ 1 foto guardada\n\nEnvia otra foto o escribe *no* para continuar');
          }

          if (msgLower === 'no') {
            sesion.estado = 'OBSERVACION';
            return preop.responderTwiml(res, '💬 Observacion final?\nSi no hay, escribe *no*');
          }

          return preop.responderTwiml(res, '📸 Envia una foto adicional o escribe *no* para continuar.');
        }

        case 'OBSERVACION': {
          if (numMedia > 0) {
            return preop.responderTwiml(res, '💬 En este paso solo necesito texto.\nEscribe la observacion final o *no*.');
          }
          if (!mensaje) {
            return preop.responderTwiml(res, '💬 Escribe la observacion final o *no* para continuar.');
          }
          sesion.observacion = msgLower === 'no' ? null : mensaje;
          sesion.estado = 'CONFIRMACION';
          return preop.responderTwiml(res, mensajes.mensajeConfirmacionFinal(sesion));
        }

        case 'CONFIRMACION': {
          if (msgUpper !== 'SI') {
            return preop.responderTwiml(res, 'Escribe *SI* para firmar\no *0* para corregir\no *9* para salir.');
          }

          var guardado = await cierre.guardarPreoperacionalCompleto(sesion, telefono, GRUPOS);
          if (guardado.error) {
            console.error('Error guardando preoperacional:', guardado.error);
            return preop.responderTwiml(res, '❌ Error guardando. Intente de nuevo o contacte al supervisor.');
          }

          sesiones.eliminarSesion(telefono);
          return preop.responderTwiml(
            res,
            mensajes.mensajeFinalFirma(
              guardado.datosSesion,
              guardado.ahora.toLocaleDateString('es-CO'),
              guardado.novedadesCriticas,
              guardado.pdfUrl
            )
          );
        }

        default: {
          sesion.estado = 'ESPERANDO_FOTO_FRONTAL';
          return preop.responderTwiml(res, mensajes.mensajeInicio());
        }
      }
    } catch (err) {
      // FIX: unificar el manejo de errores del handler principal con el mensaje solicitado.
      console.error('Error handler:', err.message);
      // FIX: responder con instruccion explicita para reiniciar el flujo ante un error inesperado.
      return preop.responderTwiml(res, 'Ocurrió un error. Escribe *9* para volver al menú.');
    } finally {
      sesiones.desbloquear(telefono);
      sesiones.guardarCambios();
    }
}

// ============================================================================
// REGISTRO DEL ENDPOINT (para compatibilidad)
// ============================================================================
function registrarPreoperacional(app) {
  app.get('/', function(req, res) {
    res.send('CERO v3 corriendo - validacion inicial por foto');
  });
  
  app.post('/webhook', manejarPreoperacional);
}

// ============================================================================
// EXPORTAR AMBAS FUNCIONES
// ============================================================================
module.exports = { 
  registrarPreoperacional,
  manejarPreoperacional  // ← NUEVA: para el enrutador con menú
};
