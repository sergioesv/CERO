var config = require('./config');
var GRUPOS = require('./grupos').GRUPOS;
var FOTOS_VERIFICACION = require('./grupos').FOTOS_VERIFICACION;
var sesiones = require('./sesiones');
var ia = require('./ia');
var pdf = require('./pdf');
var utils = require('./utils');

function registrarWebhook(app) {

  app.get('/', function(req, res) {
    res.send('CERO esta corriendo - v2 con 4 bloques');
  });

  app.post('/webhook', async function(req, res) {
    var mensaje = (req.body.Body || '').trim();
    var telefono = req.body.From || '';
    var mediaUrl = req.body.MediaUrl0 || null;
    var numMedia = parseInt(req.body.NumMedia || '0');

    var sesion = sesiones.obtenerSesion(telefono);

    console.log('[' + telefono + '] Estado: ' + sesion.estado + ' | Mensaje: ' + mensaje + ' | Media: ' + numMedia);

    try {
      switch (sesion.estado) {

        // ==================== INICIO ====================
        case 'INICIO': {
          sesion.estado = 'ESPERANDO_PLACA';
          return utils.responderTwiml(res, 'BOT MTO - CERO\nBuenos dias. Placa del vehiculo?');
        }

        // ==================== PLACA ====================
        case 'ESPERANDO_PLACA': {
          var placaLimpia = mensaje.toUpperCase().replace(/[^A-Z0-9]/g, '');

          var resultado = await config.supabase
            .from('vehiculos')
            .select('*')
            .eq('placa', placaLimpia)
            .single();

          if (resultado.error || !resultado.data) {
            return utils.responderTwiml(res, 'Placa ' + placaLimpia + ' no encontrada. Verifica e intenta de nuevo.');
          }

          var vehiculo = resultado.data;

          if (vehiculo.bloqueado) {
            return utils.responderTwiml(res, 'Vehiculo ' + placaLimpia + ' BLOQUEADO: ' + (vehiculo.motivo_bloqueo || 'Contacte al supervisor'));
          }

          sesion.placa = placaLimpia;
          sesion.vehiculo = vehiculo;

          var resConductor = await config.supabase
            .from('conductores')
            .select('*')
            .eq('telefono', telefono.replace('whatsapp:', ''))
            .single();

          sesion.conductor = resConductor.data;

          sesion.estado = 'ESPERANDO_KILOMETRAJE';
          return utils.responderTwiml(res,
            placaLimpia + ' . ' + vehiculo.tipo + ' ' + vehiculo.marca + ' ' + (vehiculo.modelo || '') + '\nKilometraje actual?'
          );
        }

        // ==================== KILOMETRAJE ====================
        case 'ESPERANDO_KILOMETRAJE': {
          var km = parseInt(mensaje.replace(/[^0-9]/g, ''));
          if (isNaN(km) || km < 0) {
            return utils.responderTwiml(res, 'Escribe solo el numero del kilometraje.');
          }

          if (sesion.vehiculo.kilometraje && km < sesion.vehiculo.kilometraje) {
            return utils.responderTwiml(res, 'Kilometraje invalido. El ultimo registrado fue ' + sesion.vehiculo.kilometraje + ' km. El nuevo debe ser igual o mayor.');
          }

          sesion.kilometraje = km;
          sesion.grupoActual = 0;
          sesion.estado = 'GRUPO';

          var grupo = GRUPOS[0];
          return utils.responderTwiml(res,
            'BLOQUE 1 de 4\n' + grupo.nombre + '\n(' + grupo.abreviado + ')\n1=Bueno 2=Regular 3=Malo 4=N/A\nResponde todo junto. Si hay novedad, describela.'
          );
        }

        // ==================== GRUPOS ====================
        case 'GRUPO': {
          var grupoActual = GRUPOS[sesion.grupoActual];
          var interpretacion = await ia.interpretarRespuesta(grupoActual, mensaje);

          if (!interpretacion) {
            return utils.responderTwiml(res, 'No entendi la respuesta. Intenta de nuevo con numeros o describe el estado.');
          }

          sesion.respuestas[grupoActual.id] = interpretacion;

          if (interpretacion.hay_novedad) {
            var novedadesGrupo = interpretacion.items
              .filter(function(i) { return i.estado === 2 || i.estado === 3; })
              .map(function(i) {
                return {
                  grupo: grupoActual.nombre,
                  item: i.nombre,
                  estado: i.estado,
                  nota: i.nota,
                  critico: utils.esCritico(grupoActual.id, i.nombre)
                };
              });
            for (var x = 0; x < novedadesGrupo.length; x++) {
              sesion.novedades.push(novedadesGrupo[x]);
            }
          }

          var confirmacion = interpretacion.resumen ? interpretacion.resumen + '\n\n' : '';

          sesion.grupoActual++;

          if (sesion.grupoActual < GRUPOS.length) {
            var siguiente = GRUPOS[sesion.grupoActual];
            return utils.responderTwiml(res,
              confirmacion + 'BLOQUE ' + (sesion.grupoActual + 1) + ' de 4\n' + siguiente.nombre + '\n(' + siguiente.abreviado + ')'
            );
          }

          // All groups done - show summary
          var resumen = utils.generarResumen(sesion);
          sesion.estado = 'FOTO_VERIFICACION';
          sesion.fotoVerificacionDescripcion = FOTOS_VERIFICACION[Math.floor(Math.random() * FOTOS_VERIFICACION.length)];

          return utils.responderTwiml(res,
            resumen + '\n\nFOTO 1 - Verificacion aleatoria\n' + sesion.fotoVerificacionDescripcion
          );
        }

        // ==================== FOTO VERIFICACION ====================
        case 'FOTO_VERIFICACION': {
          if (numMedia === 0) {
            return utils.responderTwiml(res, 'Necesito la foto. Toma la foto y enviala por favor.');
          }

          var validacion = await ia.validarFoto(mediaUrl, sesion.fotoVerificacionDescripcion);

          if (!validacion.valida) {
            return utils.responderTwiml(res,
              'Foto no valida - ' + validacion.razon_rechazo + '\nNecesito: ' + sesion.fotoVerificacionDescripcion
            );
          }

          sesion.fotos.push({
            tipo: 'verificacion',
            url: mediaUrl,
            descripcion: sesion.fotoVerificacionDescripcion,
            validacion: validacion.descripcion
          });

          if (sesion.novedades.length > 0) {
            sesion.fotosNovedadPendientes = [];
            for (var nn = 0; nn < sesion.novedades.length; nn++) {
              sesion.fotosNovedadPendientes.push(sesion.novedades[nn]);
            }
            var novedad = sesion.fotosNovedadPendientes[0];
            sesion.estado = 'FOTO_NOVEDAD';
            return utils.responderTwiml(res,
              'Foto valida\n\nFOTO ' + (sesion.fotos.length + 1) + ' - Novedad\nTome foto de: ' + novedad.item + ' - ' + (novedad.nota || novedad.grupo)
            );
          }

          sesion.estado = 'OBSERVACION';
          return utils.responderTwiml(res, 'Foto valida\n\nObservacion final? Si no hay, escribe no');
        }

        // ==================== FOTOS DE NOVEDADES ====================
        case 'FOTO_NOVEDAD': {
          if (numMedia === 0) {
            return utils.responderTwiml(res, 'Necesito la foto de la novedad. Enviala por favor.');
          }

          var novedadActual = sesion.fotosNovedadPendientes[0];
          var validacionNov = await ia.validarFoto(mediaUrl, novedadActual.item + ' - ' + (novedadActual.nota || ''));

          sesion.fotos.push({
            tipo: 'novedad',
            url: mediaUrl,
            descripcion: novedadActual.grupo + ' - ' + novedadActual.item,
            validacion: validacionNov.descripcion
          });

          sesion.fotosNovedadPendientes.shift();

          if (sesion.fotosNovedadPendientes.length > 0) {
            var siguienteNov = sesion.fotosNovedadPendientes[0];
            return utils.responderTwiml(res,
              'Foto recibida\n\nFOTO ' + (sesion.fotos.length + 1) + ' - Novedad\nTome foto de: ' + siguienteNov.item + ' - ' + (siguienteNov.nota || siguienteNov.grupo)
            );
          }

          sesion.estado = 'OBSERVACION';
          return utils.responderTwiml(res, 'Foto recibida\n\nObservacion final? Si no hay, escribe no');
        }

        // ==================== OBSERVACION ====================
        case 'OBSERVACION': {
          sesion.observacion = mensaje.toLowerCase() === 'no' ? null : mensaje;
          sesion.estado = 'CONFIRMACION';

          var textoFirma = 'CONFIRMACION\n';
          textoFirma += 'Vehiculo: ' + sesion.placa + '\n';
          textoFirma += 'Kilometraje: ' + sesion.kilometraje + '\n';
          textoFirma += 'Novedades: ' + (sesion.novedades.length > 0 ? sesion.novedades.length : 'Ninguna') + '\n';
          textoFirma += 'Fotos: ' + sesion.fotos.length + '\n';
          if (sesion.observacion) textoFirma += 'Observacion: ' + sesion.observacion + '\n';
          textoFirma += '\nConfirma el preoperacional? Escriba SI para firmar.';

          return utils.responderTwiml(res, textoFirma);
        }

        // ==================== CONFIRMACION / FIRMA ====================
        case 'CONFIRMACION': {
          if (mensaje.toUpperCase() !== 'SI') {
            return utils.responderTwiml(res, 'Escriba SI para confirmar y firmar, o CANCELAR para anular.');
          }

          var ahora = new Date();

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
              var prefix = n.critico ? '[CRITICO] ' : '';
              return prefix + n.grupo + ': ' + n.item + ' - ' + (n.nota || '');
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
            return utils.responderTwiml(res, 'Error guardando el preoperacional. Intente de nuevo o contacte al supervisor.');
          }

          var preop = resPreop.data;

          // Save photos
          if (sesion.fotos.length > 0) {
            var fotosParaGuardar = sesion.fotos.map(function(f) {
              return {
                preoperacional_id: preop.id,
                tipo: f.tipo,
                descripcion: f.descripcion,
                foto_url: f.url,
                validada: true,
                resultado_validacion: f.validacion
              };
            });
            await config.supabase.from('fotos_evidencia').insert(fotosParaGuardar);
          }

          // Update mileage
          await config.supabase
            .from('vehiculos')
            .update({ kilometraje: sesion.kilometraje })
            .eq('id', sesion.vehiculo.id);

          // Check critical items and alert supervisor
          var novedadesCriticas = sesion.novedades.filter(function(n) { return n.critico; });
          if (novedadesCriticas.length > 0) {
            console.log('ALERTA SUPERVISOR: ' + novedadesCriticas.length + ' items criticos en ' + sesion.placa);
            // TODO: Send alert to supervisor via WhatsApp
          }

          // Copy session data before deleting
          var datosSesion = sesiones.copiarSesion(sesion);
          sesiones.eliminarSesion(telefono);

          var msgFinal = 'PREOPERACIONAL FIRMADO\n';
          msgFinal += datosSesion.placa + ' - ' + ahora.toLocaleDateString('es-CO') + '\n';
          msgFinal += (datosSesion.conductor ? datosSesion.conductor.nombre : 'Conductor') + '\n';
          msgFinal += datosSesion.kilometraje + ' km\n';
          if (novedadesCriticas.length > 0) {
            msgFinal += 'ALERTA: ' + novedadesCriticas.length + ' item(es) critico(s) - Supervisor notificado\n';
          }
          msgFinal += datosSesion.novedades.length > 0 ? datosSesion.novedades.length + ' novedad(es)' : 'Sin novedades';
          msgFinal += '\n\nGenerando PDF...';

          utils.responderTwiml(res, msgFinal);

          // Generate and send PDF in background
          pdf.subirYEnviarPDF(datosSesion, preop.id, telefono);
          return;
        }

        default: {
          sesion.estado = 'INICIO';
          return utils.responderTwiml(res, 'BOT MTO - CERO\nBuenos dias. Placa del vehiculo?');
        }
      }
    } catch (error) {
      console.error('Error en webhook:', error);
      return utils.responderTwiml(res, 'Error interno. Intente de nuevo en un momento.');
    }
  });
}

module.exports = { registrarWebhook };
