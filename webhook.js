var twilio = require('twilio');
var config = require('./config');
var gruposMod = require('./grupos');
var GRUPOS = gruposMod.GRUPOS;
var PASOS_INICIALES = gruposMod.PASOS_INICIALES;
var sesiones = require('./sesiones');
var ia = require('./ia');
var pdf = require('./pdf');
var utils = require('./utils');

function obtenerMediaUrls(req) {
  var total = parseInt(req.body.NumMedia || '0', 10) || 0;
  var urls = [];
  for (var i = 0; i < total; i++) {
    var url = req.body['MediaUrl' + i];
    if (url) urls.push(url);
  }
  return urls;
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
  if (String(process.env.DISABLE_TWILIO_SIGNATURE_VALIDATION || '').toLowerCase() === 'true') {
    return true;
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

function limpiarFotosPorTipo(sesion, tipos) {
  sesion.fotos = (sesion.fotos || []).filter(function(foto) {
    return tipos.indexOf(foto.tipo) === -1;
  });
}

function reiniciarDatosOperativos(sesion) {
  sesion.respuestas = {};
  sesion.novedades = [];
  sesion.fotosNovedadPendientes = [];
  sesion.observacion = null;
  sesion.kilometraje = null;
  sesion.grupoActual = 0;
  sesion.fotos = (sesion.fotos || []).filter(function(foto) {
    return foto.tipo === 'inicio_placa' || foto.tipo === 'inicio_odometro';
  });
}

function limpiarGrupo(sesion, grupo) {
  delete sesion.respuestas[grupo.id];
  sesion.novedades = (sesion.novedades || []).filter(function(n) {
    return n.grupo !== grupo.nombre;
  });
  sesion.fotosNovedadPendientes = [];
  sesion.fotos = (sesion.fotos || []).filter(function(foto) {
    return foto.tipo !== 'novedad' && foto.tipo !== 'adicional';
  });
}

function prepararFotosNovedad(sesion) {
  sesion.fotosNovedadPendientes = utils.obtenerNovedadesFotografiables(sesion.novedades).map(function(novedad) {
    return {
      grupo: novedad.grupo,
      item: novedad.item,
      estado: novedad.estado,
      nota: novedad.nota,
      critico: novedad.critico
    };
  });
}

function mensajeFotoNovedad(sesion, prefijo) {
  prepararFotosNovedad(sesion);

  if (!sesion.fotosNovedadPendientes.length) {
    sesion.estado = 'FOTO_ADICIONAL';
    return (prefijo ? prefijo + '\n\n' : '') +
      '📸 *Fotos adicionales?*\nEnvie fotos extra si quiere agregar evidencia\no escriba *no* para continuar';
  }

  var novedad = sesion.fotosNovedadPendientes[0];
  sesion.estado = 'FOTO_NOVEDAD';

  return (prefijo ? prefijo + '\n\n' : '') +
    '📸 *Foto de novedad* (' + sesion.fotosNovedadPendientes.length + ' pendiente(s))\n' +
    '*' + novedad.item + '*\n' +
    '_' + (novedad.nota || novedad.estado || novedad.grupo) + '_';
}

function avanzarDespuesDeInspeccion(res, sesion, prefijo) {
  var resumen = utils.generarResumen(sesion);
  var mensaje = (prefijo ? prefijo + '\n\n' : '') + resumen + '\n\n' + mensajeFotoNovedad(sesion);
  return utils.responderTwiml(res, mensaje);
}

function primerMensajeInspeccion(sesion) {
  return utils.formatGrupoMsg(GRUPOS[0], '📝 *Inspeccion iniciada*\n' + sesion.placa + ' | ' + sesion.kilometraje + ' km');
}

function normalizarItemsInterpretados(items, grupo) {
  var disponibles = grupo.items.map(function(item) { return item.nombre; });
  var vistos = {};
  var salida = [];

  (items || []).forEach(function(item) {
    if (!item || !item.nombre) return;
    var nombre = resolverNombreItem(item.nombre, disponibles);
    if (!nombre || vistos[nombre]) return;
    vistos[nombre] = true;
    salida.push({
      nombre: nombre,
      estado: item.estado,
      nota: item.estado
    });
  });

  return salida;
}

function resolverNombreItem(nombre, disponibles) {
  var buscado = String(nombre || '').trim().toLowerCase();
  for (var i = 0; i < disponibles.length; i++) {
    if (disponibles[i].toLowerCase() === buscado) return disponibles[i];
  }
  for (var j = 0; j < disponibles.length; j++) {
    var disp = disponibles[j].toLowerCase();
    if (disp.indexOf(buscado) >= 0 || buscado.indexOf(disp) >= 0) return disponibles[j];
  }
  return null;
}

async function cargarVehiculoYConductor(placa, telefono) {
  var resultado = await config.supabase
    .from('vehiculos')
    .select('*')
    .eq('placa', placa)
    .single();

  if (resultado.error || !resultado.data) {
    return { error: resultado.error || new Error('Vehiculo no encontrado'), vehiculo: null, conductor: null };
  }

  var resConductor = await config.supabase
    .from('conductores')
    .select('*')
    .eq('telefono', telefono.replace('whatsapp:', ''))
    .single();

  return {
    error: null,
    vehiculo: resultado.data,
    conductor: resConductor.data || null
  };
}

function guardarFotoUnica(sesion, foto) {
  limpiarFotosPorTipo(sesion, [foto.tipo]);
  sesion.fotos.push(foto);
}

function mensajeInicio() {
  return '🚗 *CERO - Preoperacional*\nBuenos dias 👋\n\n📸 *Paso 1 de 2*\n' + PASOS_INICIALES.fotoPlaca;
}

function registrarWebhook(app) {
  app.get('/', function(req, res) {
    res.send('CERO v3 corriendo - validacion inicial por foto');
  });

  app.post('/webhook', async function(req, res) {
    if (!firmaTwilioValida(req)) {
      return res.status(403).send('Forbidden');
    }

    var mensaje = (req.body.Body || '').trim();
    var telefono = req.body.From || '';
    var mediaUrls = obtenerMediaUrls(req);
    var numMedia = mediaUrls.length;

    if (!sesiones.bloquear(telefono)) {
      console.log('[' + utils.ocultarTelefono(telefono) + '] BLOQUEADO');
      return utils.responderTwiml(res, '⏳ Procesando... espera un momento y reenvia.');
    }

    var sesion = sesiones.obtenerSesion(telefono);
    console.log('[' + utils.ocultarTelefono(telefono) + '] Estado=' + sesion.estado + ' Texto=' + mensaje.length + ' chars Media=' + numMedia);

    try {
      var msgUpper = mensaje.toUpperCase();
      var msgLower = mensaje.toLowerCase();

      if (msgUpper === 'CANCELAR') {
        sesiones.eliminarSesion(telefono);
        return utils.responderTwiml(res, '❌ Preoperacional cancelado.\nEscribe cualquier mensaje para empezar de nuevo.');
      }

      if (msgUpper === 'REINICIAR') {
        sesiones.eliminarSesion(telefono);
        sesion = sesiones.obtenerSesion(telefono);
        sesion.estado = 'ESPERANDO_FOTO_FRONTAL';
        return utils.responderTwiml(res, mensajeInicio());
      }

      if (msgUpper === 'ATRAS') {
        if (sesion.estado === 'ESPERANDO_FOTO_ODOMETRO') {
          limpiarFotosPorTipo(sesion, ['inicio_placa', 'inicio_odometro']);
          sesion.placa = null;
          sesion.vehiculo = null;
          sesion.conductor = null;
          sesion.kilometraje = null;
          sesion.estado = 'ESPERANDO_FOTO_FRONTAL';
          return utils.responderTwiml(res, '◀️ Volvemos al inicio.\n\n📸 ' + PASOS_INICIALES.fotoPlaca);
        }

        if (sesion.estado === 'GRUPO' && sesion.grupoActual > 0) {
          sesion.grupoActual--;
          limpiarGrupo(sesion, GRUPOS[sesion.grupoActual]);
          return utils.responderTwiml(res, utils.formatGrupoMsg(GRUPOS[sesion.grupoActual], '◀️ Volvemos'));
        }

        if (sesion.estado === 'GRUPO' && sesion.grupoActual === 0) {
          limpiarFotosPorTipo(sesion, ['inicio_odometro']);
          sesion.kilometraje = null;
          sesion.estado = 'ESPERANDO_FOTO_ODOMETRO';
          return utils.responderTwiml(res, '◀️ Volvemos al kilometraje.\n\n📸 ' + PASOS_INICIALES.fotoOdometro);
        }

        if (sesion.estado === 'DESCRIBIR_NOVEDAD') {
          sesion.estado = 'GRUPO';
          return utils.responderTwiml(res, utils.formatGrupoMsg(GRUPOS[sesion.grupoActual], '◀️ Volvemos'));
        }

        if (sesion.estado === 'FOTO_NOVEDAD') {
          limpiarFotosPorTipo(sesion, ['novedad', 'adicional']);
          sesion.fotosNovedadPendientes = [];
          return utils.responderTwiml(res, mensajeFotoNovedad(sesion, '◀️ Volvemos'));
        }

        if (sesion.estado === 'FOTO_ADICIONAL') {
          limpiarFotosPorTipo(sesion, ['adicional']);
          if (utils.obtenerNovedadesFotografiables(sesion.novedades).length > 0) {
            limpiarFotosPorTipo(sesion, ['novedad']);
            sesion.fotosNovedadPendientes = [];
            return utils.responderTwiml(res, mensajeFotoNovedad(sesion, '◀️ Volvemos'));
          }
          return utils.responderTwiml(res, '◀️ 📸 *Fotos adicionales?*\nEnvie fotos extra o escriba *no* para continuar');
        }

        if (sesion.estado === 'OBSERVACION') {
          sesion.observacion = null;
          sesion.estado = 'FOTO_ADICIONAL';
          return utils.responderTwiml(res, '◀️ 📸 *Fotos adicionales?*\nEnvie fotos extra o escriba *no* para continuar');
        }

        if (sesion.estado === 'CONFIRMACION') {
          sesion.estado = 'OBSERVACION';
          return utils.responderTwiml(res, '◀️ 💬 Observacion final?\nSi no hay, escribe *no*.');
        }

        return utils.responderTwiml(res, 'No se puede retroceder desde aqui.\nEscribe *CANCELAR* para salir.');
      }

      switch (sesion.estado) {
        case 'INICIO':
        case 'ESPERANDO_PLACA':
        case 'ESPERANDO_FOTO_FRONTAL': {
          sesion.estado = 'ESPERANDO_FOTO_FRONTAL';

          if (numMedia === 0) {
            return utils.responderTwiml(res, mensajeInicio());
          }

          var lecturaPlaca = await ia.extraerPlacaFoto(mediaUrls[0]);
          if (!lecturaPlaca.valida || !lecturaPlaca.placa) {
            return utils.responderTwiml(res,
              '❌ *No pude validar la foto frontal*\n' + (lecturaPlaca.razon || 'La placa no se ve clara.') +
              '\n\nEnvia otra foto frontal donde la placa se vea completa y legible.'
            );
          }

          var placa = utils.normalizarPlaca(lecturaPlaca.placa);
          var carga = await cargarVehiculoYConductor(placa, telefono);

          if (carga.error || !carga.vehiculo) {
            return utils.responderTwiml(res,
              '❌ Placa *' + placa + '* no encontrada.\nToma otra foto o revisa con el supervisor.'
            );
          }

          if (carga.vehiculo.bloqueado) {
            return utils.responderTwiml(res,
              '🚫 *Vehiculo BLOQUEADO*\n' + placa + '\n' + (carga.vehiculo.motivo_bloqueo || 'Contacte al supervisor')
            );
          }

          sesion.placa = placa;
          sesion.vehiculo = carga.vehiculo;
          sesion.conductor = carga.conductor;
          reiniciarDatosOperativos(sesion);
          guardarFotoUnica(sesion, {
            tipo: 'inicio_placa',
            url: mediaUrls[0],
            descripcion: 'Foto frontal con placa',
            validacion: 'Placa validada: ' + placa,
            validada: true
          });
          sesion.estado = 'ESPERANDO_FOTO_ODOMETRO';

          return utils.responderTwiml(res,
            '✅ *' + placa + '*\n' + [carga.vehiculo.tipo, carga.vehiculo.marca, carga.vehiculo.modelo].filter(Boolean).join(' ') +
            '\n\n📸 *Paso 2 de 2*\n' + PASOS_INICIALES.fotoOdometro +
            (carga.vehiculo.kilometraje ? ('\n\nUltimo registrado: *' + carga.vehiculo.kilometraje + ' km*') : '')
          );
        }

        case 'ESPERANDO_FOTO_ODOMETRO': {
          if (numMedia === 0) {
            return utils.responderTwiml(res, '📸 Necesito la foto del odometro.\n' + PASOS_INICIALES.fotoOdometro);
          }

          var lecturaKm = await ia.extraerKilometrajeFoto(mediaUrls[0]);
          if (!lecturaKm.valida || lecturaKm.kilometraje == null) {
            return utils.responderTwiml(res,
              '❌ *No pude leer el kilometraje*\n' + (lecturaKm.razon || 'La imagen no es clara.') +
              '\n\nToma otra foto del odometro con el tablero enfocado y buena luz.'
            );
          }

          var km = lecturaKm.kilometraje;
          if (sesion.vehiculo.kilometraje && km < sesion.vehiculo.kilometraje) {
            return utils.responderTwiml(res,
              '❌ Kilometraje invalido detectado en la foto.\nUltimo registrado: *' + sesion.vehiculo.kilometraje + ' km*\nDebe ser igual o mayor.'
            );
          }

          sesion.kilometraje = km;
          guardarFotoUnica(sesion, {
            tipo: 'inicio_odometro',
            url: mediaUrls[0],
            descripcion: 'Foto del odometro',
            validacion: 'Kilometraje validado: ' + km + ' km',
            validada: true
          });
          sesion.grupoActual = 0;
          sesion.estado = 'GRUPO';
          return utils.responderTwiml(res, primerMensajeInspeccion(sesion));
        }

        case 'GRUPO': {
          var grupoActual = GRUPOS[sesion.grupoActual];
          var respLimpia = mensaje.trim();
          var respLower = respLimpia.toLowerCase();

          if (respLimpia === '1' || respLimpia === '1️⃣' || respLower === 'ok' || respLower === 'todo bien') {
            limpiarGrupo(sesion, grupoActual);
            sesion.respuestas[grupoActual.id] = ia.marcarTodoOK();
            sesion.grupoActual++;

            if (sesion.grupoActual < GRUPOS.length) {
              return utils.responderTwiml(res, utils.formatGrupoMsg(GRUPOS[sesion.grupoActual], '✅ OK'));
            }

            return avanzarDespuesDeInspeccion(res, sesion);
          }

          if (respLimpia === '2' || respLimpia === '2️⃣') {
            sesion.estado = 'DESCRIBIR_NOVEDAD';
            var listaItems = grupoActual.items.map(function(item) { return '• ' + item.nombre; }).join('\n');
            var ejemplos = grupoActual.items.slice(0, 2).map(function(item) { return item.nombre.toLowerCase(); }).join('", "');
            return utils.responderTwiml(res,
              '✍️ *Describe la novedad en:*\n*' + grupoActual.nombre + '*\n------\n' + listaItems +
              '\n------\n_Escribe lo que encontraste_\n_Ej: "' + ejemplos + ' malo"_'
            );
          }

          if (respLimpia === '3' || respLimpia === '3️⃣' || respLower === 'atras') {
            if (sesion.grupoActual > 0) {
              sesion.grupoActual--;
              limpiarGrupo(sesion, GRUPOS[sesion.grupoActual]);
              return utils.responderTwiml(res, utils.formatGrupoMsg(GRUPOS[sesion.grupoActual], '◀️ Volvemos'));
            }

            limpiarFotosPorTipo(sesion, ['inicio_odometro']);
            sesion.kilometraje = null;
            sesion.estado = 'ESPERANDO_FOTO_ODOMETRO';
            return utils.responderTwiml(res, '◀️ Volvemos al kilometraje.\n\n📸 ' + PASOS_INICIALES.fotoOdometro);
          }

          return utils.responderTwiml(res, utils.formatGrupoMsg(grupoActual, '❌ Responde 1, 2 o 3'));
        }

        case 'DESCRIBIR_NOVEDAD': {
          var grupoNovedad = GRUPOS[sesion.grupoActual];
          var interpretacion;

          try {
            interpretacion = await ia.interpretarNovedad(mensaje, grupoNovedad.items.map(function(item) { return item.nombre; }));
          } catch (error) {
            interpretacion = null;
          }

          if (!interpretacion || !Array.isArray(interpretacion.items)) {
            var ejemplosError = grupoNovedad.items.slice(0, 2).map(function(item) { return item.nombre.toLowerCase(); }).join('", "');
            return utils.responderTwiml(res,
              '❌ No entendi.\nDescribe la novedad de nuevo.\n_Ej: "' + ejemplosError + ' malo"_'
            );
          }

          var itemsInterpretados = normalizarItemsInterpretados(interpretacion.items, grupoNovedad);
          if (!itemsInterpretados.length) {
            return utils.responderTwiml(res,
              '❌ No pude asociar la novedad a un item del bloque.\nMenciona el item exacto y el problema encontrado.'
            );
          }

          limpiarGrupo(sesion, grupoNovedad);
          sesion.respuestas[grupoNovedad.id] = {
            estado: 'NOVEDAD',
            items: itemsInterpretados,
            observacion: interpretacion.observacion || mensaje
          };

          var novedadesGrupo = itemsInterpretados
            .filter(function(item) {
              return utils.clasificarEstado(item.estado) !== 'ok';
            })
            .map(function(item) {
              return {
                grupo: grupoNovedad.nombre,
                item: item.nombre,
                estado: item.estado,
                nota: item.estado,
                critico: utils.esCritico(grupoNovedad.id, item.nombre)
              };
            });

          for (var i = 0; i < novedadesGrupo.length; i++) {
            sesion.novedades.push(novedadesGrupo[i]);
          }

          var confirmacion = novedadesGrupo.length > 0
            ? '⚠️ Anotado: ' + novedadesGrupo.map(function(n) { return n.item + ' (' + n.estado + ')'; }).join(', ')
            : '✅ Registrado';

          sesion.grupoActual++;
          sesion.estado = 'GRUPO';

          if (sesion.grupoActual < GRUPOS.length) {
            return utils.responderTwiml(res, utils.formatGrupoMsg(GRUPOS[sesion.grupoActual], confirmacion));
          }

          return avanzarDespuesDeInspeccion(res, sesion, confirmacion);
        }

        case 'FOTO_NOVEDAD': {
          prepararFotosNovedad(sesion);

          if (!sesion.fotosNovedadPendientes.length) {
            sesion.estado = 'FOTO_ADICIONAL';
            return utils.responderTwiml(res,
              '📸 *Fotos adicionales?*\nEnvie fotos extra si quiere agregar evidencia\no escriba *no* para continuar'
            );
          }

          if (numMedia === 0) {
            return utils.responderTwiml(res, mensajeFotoNovedad(sesion));
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
            return utils.responderTwiml(res,
              '✅ Foto recibida\n\n📸 *Foto de novedad* (' + sesion.fotosNovedadPendientes.length + ' pendiente(s))\n*' + siguienteNov.item + '*\n_' + (siguienteNov.nota || siguienteNov.estado || siguienteNov.grupo) + '_'
            );
          }

          sesion.estado = 'FOTO_ADICIONAL';
          return utils.responderTwiml(res,
            '✅ Todas las fotos recibidas\n\n📸 *Fotos adicionales?*\nEnvie fotos extra si quiere agregar evidencia\no escriba *no* para continuar'
          );
        }

        case 'FOTO_ADICIONAL': {
          if (numMedia > 0) {
            for (var a = 0; a < mediaUrls.length; a++) {
              sesion.fotos.push({
                tipo: 'adicional',
                url: mediaUrls[a],
                descripcion: 'Foto adicional',
                validacion: 'Evidencia adicional recibida',
                validada: true
              });
            }
            return utils.responderTwiml(res,
              '✅ ' + mediaUrls.length + ' foto(s) guardada(s)\n\nEnvia otra foto o escribe *no* para continuar'
            );
          }

          if (msgLower === 'no') {
            sesion.estado = 'OBSERVACION';
            return utils.responderTwiml(res, '💬 Observacion final?\nSi no hay, escribe *no*');
          }

          return utils.responderTwiml(res,
            '📸 Envia una foto adicional o escribe *no* para continuar.'
          );
        }

        case 'OBSERVACION': {
          if (numMedia > 0) {
            return utils.responderTwiml(res, '💬 En este paso solo necesito texto.\nEscribe la observacion final o *no*.');
          }

          if (!mensaje) {
            return utils.responderTwiml(res, '💬 Escribe la observacion final o *no* para continuar.');
          }

          sesion.observacion = msgLower === 'no' ? null : mensaje;
          sesion.estado = 'CONFIRMACION';

          var textoFirma = '───────────────\n';
          textoFirma += '📝 *CONFIRMAR PREOPERACIONAL*\n';
          textoFirma += '───────────────\n';
          textoFirma += '🚗 Vehiculo: *' + sesion.placa + '*\n';
          textoFirma += '📏 Kilometraje: *' + sesion.kilometraje + ' km*\n';
          textoFirma += '📸 Validacion inicial por foto: *OK*\n';
          if (sesion.novedades.length > 0) {
            textoFirma += '⚠️ Novedades: *' + sesion.novedades.length + '*\n';
            sesion.novedades.forEach(function(n) {
              textoFirma += '  • ' + n.item + ': ' + n.estado + '\n';
            });
          } else {
            textoFirma += '✅ Sin novedades\n';
          }
          textoFirma += '📷 Fotos: *' + sesion.fotos.length + '*\n';
          if (sesion.observacion) textoFirma += '💬 _' + sesion.observacion + '_\n';
          textoFirma += '\n✍️ Escriba *SI* para firmar\no *ATRAS* para corregir';

          return utils.responderTwiml(res, textoFirma);
        }

        case 'CONFIRMACION': {
          if (msgUpper !== 'SI') {
            return utils.responderTwiml(res, 'Escriba *SI* para firmar\no *ATRAS* para corregir\no *CANCELAR* para anular.');
          }

          var ahoraUTC = new Date();
          var ahora = new Date(ahoraUTC.getTime() - (5 * 60 * 60 * 1000));

          var datosPreoperacional = {
            vehiculo_id: sesion.vehiculo.id,
            conductor_id: sesion.conductor ? sesion.conductor.id : null,
            placa: sesion.placa,
            kilometraje: sesion.kilometraje,
            fecha: ahora.toISOString().split('T')[0],
            hora: ahora.toTimeString().split(' ')[0],
            estado: 'completado',
            motor_niveles: sesion.respuestas.motor_niveles || null,
            electrico_luces: sesion.respuestas.electrico_luces || null,
            frenos_direccion_llantas: sesion.respuestas.frenos_direccion_llantas || null,
            cabina_equipo: sesion.respuestas.cabina_equipo || null,
            novedades: sesion.novedades.map(function(n) {
              var prefix = n.critico ? '⚠️ CRITICO ' : '';
              return prefix + n.grupo + ': ' + n.item + ' - ' + (n.nota || n.estado || '');
            }),
            observaciones: sesion.observacion,
            firma_operario: true,
            firma_timestamp: ahora.toISOString()
          };

          var resPreop = await config.supabase
            .from('preoperacionales')
            .insert(datosPreoperacional)
            .select()
            .single();

          if (resPreop.error) {
            console.error('Error guardando preoperacional:', resPreop.error);
            return utils.responderTwiml(res, '❌ Error guardando. Intente de nuevo o contacte al supervisor.');
          }

          var preop = resPreop.data;

          if (sesion.fotos.length > 0) {
            var fotosParaGuardar = sesion.fotos.map(function(foto) {
              return {
                preoperacional_id: preop.id,
                tipo: foto.tipo,
                descripcion: foto.descripcion,
                foto_url: foto.url,
                validada: foto.validada !== false,
                resultado_validacion: foto.validacion || 'Foto recibida'
              };
            });
            var resFotos = await config.supabase.from('fotos_evidencia').insert(fotosParaGuardar);
            if (resFotos.error) {
              console.error('Error guardando fotos:', resFotos.error);
            }
          }

          var resVehiculo = await config.supabase
            .from('vehiculos')
            .update({ kilometraje: sesion.kilometraje })
            .eq('id', sesion.vehiculo.id);
          if (resVehiculo.error) {
            console.error('Error actualizando kilometraje:', resVehiculo.error);
          }

          var novedadesCriticas = sesion.novedades.filter(function(n) { return n.critico; });
          if (novedadesCriticas.length > 0) {
            console.log('ALERTA SUPERVISOR: ' + novedadesCriticas.length + ' items criticos en ' + sesion.placa);
          }

          var datosSesion = sesiones.copiarSesion(sesion);
          datosSesion.bloques = GRUPOS.map(function(grupo) {
            var respGrupo = datosSesion.respuestas[grupo.id] || { items: [] };
            var itemsRespuesta = respGrupo.items || [];
            return {
              nombre: grupo.nombre,
              items: grupo.items.map(function(itemDef) {
                var encontrado = itemsRespuesta.find(function(r) { return r.nombre === itemDef.nombre; });
                return {
                  nombre: itemDef.nombre,
                  critico: itemDef.critico,
                  estado: encontrado ? encontrado.estado : 'OK'
                };
              })
            };
          });
          datosSesion.items = datosSesion.novedades || [];
          datosSesion.telefono = telefono;
          datosSesion.fecha = ahora.toISOString();

          var pdfUrl = await pdf.subirYEnviarPDF(datosSesion, preop.id, telefono);
          sesiones.eliminarSesion(telefono);

          var msgFinal = '───────────────\n';
          msgFinal += '✅ *PREOPERACIONAL FIRMADO*\n';
          msgFinal += '───────────────\n';
          msgFinal += '🚗 *' + datosSesion.placa + '* | ' + ahora.toLocaleDateString('es-CO') + '\n';
          msgFinal += '👤 ' + (datosSesion.conductor ? datosSesion.conductor.nombre : 'Conductor') + '\n';
          msgFinal += '📏 ' + datosSesion.kilometraje + ' km\n';
          if (novedadesCriticas.length > 0) {
            msgFinal += '⚠️ *' + novedadesCriticas.length + ' item(es) critico(s)*\n';
            msgFinal += '_Supervisor notificado_\n';
          } else if (datosSesion.novedades.length > 0) {
            msgFinal += '⚠️ ' + datosSesion.novedades.length + ' novedad(es)\n';
          } else {
            msgFinal += '✅ Sin novedades\n';
          }
          msgFinal += pdfUrl
            ? '\n📄 PDF generado y enviado por WhatsApp.'
            : '\n📄 El preoperacional quedo firmado, pero el PDF no se pudo enviar automaticamente.';

          return utils.responderTwiml(res, msgFinal);
        }

        default: {
          sesion.estado = 'ESPERANDO_FOTO_FRONTAL';
          return utils.responderTwiml(res, mensajeInicio());
        }
      }
    } catch (error) {
      console.error('Error en webhook:', error);
      return utils.responderTwiml(res, '❌ Error interno. Intente de nuevo.');
    } finally {
      sesiones.desbloquear(telefono);
      sesiones.guardarCambios();
    }
  });
}

module.exports = { registrarWebhook };
