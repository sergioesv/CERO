var config = require('./config');
var GRUPOS = require('./grupos').GRUPOS;
var FOTOS_VERIFICACION = require('./grupos').FOTOS_VERIFICACION;
var sesiones = require('./sesiones');
var ia = require('./ia');
var pdf = require('./pdf');
var utils = require('./utils');

function registrarWebhook(app) {

  app.get('/', function(req, res) {
    res.send('CERO v2 corriendo - modelo hibrido');
  });

  app.post('/webhook', async function(req, res) {
    var mensaje = (req.body.Body || '').trim();
    var telefono = req.body.From || '';
    var mediaUrl = req.body.MediaUrl0 || null;
    var numMedia = parseInt(req.body.NumMedia || '0');

    // Bloqueo de concurrencia — evita doble procesamiento si el usuario envía rápido
    if (!sesiones.bloquear(telefono)) {
      console.log('[' + telefono + '] BLOQUEADO - mensaje descartado (procesando anterior)');
      return utils.responderTwiml(res, '⏳ Procesando... espera un momento y reenvía.');
    }

    var sesion = sesiones.obtenerSesion(telefono);

    console.log('[' + telefono + '] Estado: ' + sesion.estado + ' | Mensaje: ' + mensaje + ' | Media: ' + numMedia);

    try {
      // ===== COMANDOS GLOBALES =====
      var msgUpper = mensaje.toUpperCase();

      if (msgUpper === 'CANCELAR') {
        sesiones.eliminarSesion(telefono);
        return utils.responderTwiml(res, '\u274c Preoperacional cancelado.\nEscribe cualquier mensaje para empezar de nuevo.');
      }

      if (msgUpper === 'REINICIAR') {
        sesiones.eliminarSesion(telefono);
        sesion = sesiones.obtenerSesion(telefono);
        sesion.estado = 'ESPERANDO_PLACA';
        return utils.responderTwiml(res, '\ud83d\ude97 *CERO - Preoperacional*\nReiniciado. Placa del vehiculo?');
      }

      if (msgUpper === 'ATRAS') {
        if (sesion.estado === 'ESPERANDO_KILOMETRAJE') {
          sesion.estado = 'ESPERANDO_PLACA';
          sesion.placa = null;
          sesion.vehiculo = null;
          return utils.responderTwiml(res, '\u25c0\ufe0f Placa del vehiculo?');
        }
        if (sesion.estado === 'GRUPO' && sesion.grupoActual > 0) {
          sesion.grupoActual--;
          var grupoAnterior = GRUPOS[sesion.grupoActual];
          delete sesion.respuestas[grupoAnterior.id];
          // Limpiar novedades del grupo al que volvemos
          sesion.novedades = sesion.novedades.filter(function(n) { return n.grupo !== grupoAnterior.nombre; });
          return utils.responderTwiml(res, utils.formatGrupoMsg(grupoAnterior, '\u25c0\ufe0f Volvemos'));
        }
        if (sesion.estado === 'GRUPO' && sesion.grupoActual === 0) {
          sesion.estado = 'ESPERANDO_KILOMETRAJE';
          return utils.responderTwiml(res, '\u25c0\ufe0f Kilometraje actual?');
        }
        if (sesion.estado === 'DESCRIBIR_NOVEDAD') {
          sesion.estado = 'GRUPO';
          var grupoVolver = GRUPOS[sesion.grupoActual];
          return utils.responderTwiml(res, utils.formatGrupoMsg(grupoVolver, '\u25c0\ufe0f Volvemos'));
        }
        if (sesion.estado === 'FOTO_VERIFICACION') {
          sesion.grupoActual = GRUPOS.length - 1;
          sesion.estado = 'GRUPO';
          var ultimoGrupo = GRUPOS[sesion.grupoActual];
          delete sesion.respuestas[ultimoGrupo.id];
          sesion.novedades = sesion.novedades.filter(function(n) { return n.grupo !== ultimoGrupo.nombre; });
          return utils.responderTwiml(res, utils.formatGrupoMsg(ultimoGrupo, '\u25c0\ufe0f Volvemos'));
        }
        if (sesion.estado === 'FOTO_NOVEDAD') {
          // Volver a foto de verificacion
          sesion.estado = 'FOTO_VERIFICACION';
          sesion.fotosNovedadPendientes = [];
          sesion.fotos = sesion.fotos.filter(function(f) { return f.tipo !== 'novedad'; });
          return utils.responderTwiml(res, '\u25c0\ufe0f ' + sesion.fotoVerificacionDescripcion);
        }
        if (sesion.estado === 'OBSERVACION') {
          if (sesion.novedades.length > 0) {
            // Volver a fotos de novedad
            sesion.fotosNovedadPendientes = sesion.novedades.slice();
            sesion.fotos = sesion.fotos.filter(function(f) { return f.tipo !== 'novedad'; });
            sesion.estado = 'FOTO_NOVEDAD';
            var novVolver = sesion.fotosNovedadPendientes[0];
            return utils.responderTwiml(res, '\u25c0\ufe0f \ud83d\udcf8 *Foto de novedad*\n' + novVolver.item + ': _' + (novVolver.nota || novVolver.grupo) + '_');
          }
          sesion.estado = 'FOTO_VERIFICACION';
          sesion.fotos = sesion.fotos.filter(function(f) { return f.tipo !== 'verificacion'; });
          return utils.responderTwiml(res, '\u25c0\ufe0f ' + sesion.fotoVerificacionDescripcion);
        }
        if (sesion.estado === 'CONFIRMACION') {
          sesion.estado = 'OBSERVACION';
          return utils.responderTwiml(res, '\u25c0\ufe0f Observacion final? Si no hay, escribe *no*');
        }
        if (sesion.estado === 'OBSERVACION') {
          sesion.estado = 'FOTO_ADICIONAL';
          sesion.fotos = sesion.fotos.filter(function(f) { return f.tipo !== 'adicional'; });
          return utils.responderTwiml(res, '\u25c0\ufe0f Fotos adicionales? Envie fotos o escriba *no*');
        }
        return utils.responderTwiml(res, 'No se puede retroceder desde aqui.\nEscribe *CANCELAR* para salir.');
      }

      switch (sesion.estado) {

        // ==================== INICIO ====================
        case 'INICIO': {
          sesion.estado = 'ESPERANDO_PLACA';
          return utils.responderTwiml(res, '\ud83d\ude97 *CERO - Preoperacional*\nBuenos dias \ud83d\udc4b\nPlaca del vehiculo?');
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
            return utils.responderTwiml(res, '\u274c Placa *' + placaLimpia + '* no encontrada.\nVerifica e intenta de nuevo.');
          }

          var vehiculo = resultado.data;

          if (vehiculo.bloqueado) {
            return utils.responderTwiml(res, '\ud83d\udeab *Vehiculo BLOQUEADO*\n' + placaLimpia + '\n' + (vehiculo.motivo_bloqueo || 'Contacte al supervisor'));
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
            '\u2705 *' + placaLimpia + '*\n' + vehiculo.tipo + ' ' + vehiculo.marca + ' ' + (vehiculo.modelo || '') + '\n\nKilometraje actual?'
          );
        }

        // ==================== KILOMETRAJE ====================
        case 'ESPERANDO_KILOMETRAJE': {
          var km = parseInt(mensaje.replace(/[^0-9]/g, ''));
          if (isNaN(km) || km < 0) {
            return utils.responderTwiml(res, '\u274c Escribe solo el numero del kilometraje.');
          }

          if (sesion.vehiculo.kilometraje && km < sesion.vehiculo.kilometraje) {
            return utils.responderTwiml(res, '\u274c Kilometraje invalido.\nUltimo registrado: *' + sesion.vehiculo.kilometraje + ' km*\nDebe ser igual o mayor.');
          }

          sesion.kilometraje = km;
          sesion.grupoActual = 0;
          sesion.estado = 'GRUPO';

          var grupo = GRUPOS[0];
          return utils.responderTwiml(res, utils.formatGrupoMsg(grupo, '\ud83d\udcdd *Inspeccion iniciada*\n' + sesion.placa + ' | ' + km + ' km'));
        }

        // ==================== GRUPOS ====================
        case 'GRUPO': {
          var grupoActual = GRUPOS[sesion.grupoActual];
          var respLimpia = mensaje.trim();

          // 1️⃣ Todo OK
          if (respLimpia === '1' || respLimpia === '1\ufe0f\u20e3' || respLimpia.toLowerCase() === 'ok' || respLimpia.toLowerCase() === 'todo bien') {
            sesion.respuestas[grupoActual.id] = ia.marcarTodoOK(grupoActual);
            sesion.grupoActual++;

            if (sesion.grupoActual < GRUPOS.length) {
              var sig = GRUPOS[sesion.grupoActual];
              return utils.responderTwiml(res, utils.formatGrupoMsg(sig, '\u2705 OK'));
            }

            var resumen = utils.generarResumen(sesion);
            sesion.estado = 'FOTO_VERIFICACION';
            sesion.fotoVerificacionDescripcion = FOTOS_VERIFICACION[Math.floor(Math.random() * FOTOS_VERIFICACION.length)];
            return utils.responderTwiml(res,
              resumen + '\n\n\ud83d\udcf8 *Foto de verificacion*\n' + sesion.fotoVerificacionDescripcion
            );
          }

          // 2️⃣ Novedad — ejemplos contextuales del grupo actual
          if (respLimpia === '2' || respLimpia === '2\ufe0f\u20e3') {
            sesion.estado = 'DESCRIBIR_NOVEDAD';
            var ejemplos = grupoActual.items.slice(0, 2).map(function(i) {
              return i.nombre.toLowerCase();
            }).join('", "');
            return utils.responderTwiml(res,
              '\u270d\ufe0f *Describe la novedad en:*\n*' + grupoActual.nombre + '*\n\n_Escribe lo que encontraste_\n_Ej: "' + ejemplos + ' malo"_'
            );
          }

          // 3️⃣ Atras
          if (respLimpia === '3' || respLimpia === '3\ufe0f\u20e3' || respLimpia.toLowerCase() === 'atras') {
            if (sesion.grupoActual > 0) {
              sesion.grupoActual--;
              var grupoAnt = GRUPOS[sesion.grupoActual];
              delete sesion.respuestas[grupoAnt.id];
              sesion.novedades = sesion.novedades.filter(function(n) { return n.grupo !== grupoAnt.nombre; });
              return utils.responderTwiml(res, utils.formatGrupoMsg(grupoAnt, '\u25c0\ufe0f Volvemos'));
            }
            sesion.estado = 'ESPERANDO_KILOMETRAJE';
            return utils.responderTwiml(res, '\u25c0\ufe0f Kilometraje actual?');
          }

          return utils.responderTwiml(res, utils.formatGrupoMsg(grupoActual, '\u274c Responde 1, 2 o 3'));
        }

        // ==================== DESCRIBIR NOVEDAD ====================
        case 'DESCRIBIR_NOVEDAD': {
          if (sesion.estado !== 'DESCRIBIR_NOVEDAD') break;

          var grupoNovedad = GRUPOS[sesion.grupoActual];
          var interpretacion = await ia.interpretarNovedad(mensaje, grupoNovedad.items.map(function(i) { return i.nombre; }));

          if (!interpretacion) {
            var ejemplosError = grupoNovedad.items.slice(0, 2).map(function(i) { return i.nombre.toLowerCase(); }).join('", "');
            return utils.responderTwiml(res, '\u274c No entendi.\nDescribe la novedad de nuevo.\n_Ej: "' + ejemplosError + ' malo"_');
          }

          sesion.respuestas[grupoNovedad.id] = interpretacion;

          // FIX: filtrar por estado string, no por número
          var novedadesGrupo = interpretacion.items
            .filter(function(i) {
              var est = (i.estado || '').toLowerCase();
              return est !== 'ok' && est !== 'funciona' && est !== 'sin fugas' && est !== 'completo' && est !== '';
            })
            .map(function(i) {
              return {
                grupo: grupoNovedad.nombre,
                item: i.nombre,
                estado: i.estado,
                nota: i.estado,
                critico: utils.esCritico(grupoNovedad.id, i.nombre)
              };
            });

          for (var x = 0; x < novedadesGrupo.length; x++) {
            sesion.novedades.push(novedadesGrupo[x]);
          }

          var confirmacion = novedadesGrupo.length > 0
            ? '\u26a0\ufe0f Anotado: ' + novedadesGrupo.map(function(n) { return n.item + ' (' + n.estado + ')'; }).join(', ')
            : '\u2705 Registrado';

          sesion.grupoActual++;
          sesion.estado = 'GRUPO';

          if (sesion.grupoActual < GRUPOS.length) {
            var sigNov = GRUPOS[sesion.grupoActual];
            return utils.responderTwiml(res, utils.formatGrupoMsg(sigNov, confirmacion));
          }

          var resumenNov = utils.generarResumen(sesion);
          sesion.estado = 'FOTO_VERIFICACION';
          sesion.fotoVerificacionDescripcion = FOTOS_VERIFICACION[Math.floor(Math.random() * FOTOS_VERIFICACION.length)];
          return utils.responderTwiml(res,
            confirmacion + '\n\n' + resumenNov + '\n\n\ud83d\udcf8 *Foto de verificacion*\n' + sesion.fotoVerificacionDescripcion
          );
        }

        // ==================== FOTO VERIFICACION ====================
        case 'FOTO_VERIFICACION': {
          if (numMedia === 0) {
            return utils.responderTwiml(res, '\ud83d\udcf8 Necesito la foto.\nToma la foto y enviala.');
          }

          var validacion = await ia.validarFoto(mediaUrl, sesion.fotoVerificacionDescripcion);

          if (!validacion.valida) {
            return utils.responderTwiml(res,
              '\u274c *Foto no valida*\n' + validacion.razon + '\n\nNecesito: ' + sesion.fotoVerificacionDescripcion
            );
          }

          sesion.fotos.push({
            tipo: 'verificacion',
            url: mediaUrl,
            descripcion: sesion.fotoVerificacionDescripcion,
            validacion: validacion.comentario
          });

          if (sesion.novedades.length > 0) {
            // Excluir ítems sinFoto (bocina, tablero, pedales, aseo, aire) — no se pueden fotografiar
            var GRUPOS_MAP = {};
            for (var gm = 0; gm < GRUPOS.length; gm++) {
              for (var im = 0; im < GRUPOS[gm].items.length; im++) {
                GRUPOS_MAP[GRUPOS[gm].items[im].nombre] = GRUPOS[gm].items[im];
              }
            }
            sesion.fotosNovedadPendientes = sesion.novedades.filter(function(n) {
              var def = GRUPOS_MAP[n.item];
              return !def || !def.sinFoto;
            });
            var novedad = sesion.fotosNovedadPendientes[0];
            sesion.estado = 'FOTO_NOVEDAD';
            return utils.responderTwiml(res,
              '\u2705 Foto valida\n\n\ud83d\udcf8 *Foto de novedad* (' + sesion.fotosNovedadPendientes.length + ' pendiente(s))\n*' + novedad.item + '*\n_' + (novedad.nota || novedad.grupo) + '_'
            );
          }

          sesion.estado = 'FOTO_ADICIONAL';
          return utils.responderTwiml(res, '\u2705 Foto valida\n\n\ud83d\udcf8 *Fotos adicionales?*\nEnvie fotos extra si quiere agregar evidencia\no escriba *no* para continuar');
        }

        // ==================== FOTOS DE NOVEDADES ====================
        case 'FOTO_NOVEDAD': {
          if (numMedia === 0) {
            var novPend = sesion.fotosNovedadPendientes[0];
            return utils.responderTwiml(res,
              '\ud83d\udcf8 Necesito la foto de:\n*' + novPend.item + '*\n_' + (novPend.nota || novPend.grupo) + '_\nEnviala por favor.'
            );
          }

          var novedadActual = sesion.fotosNovedadPendientes[0];
          var descNov = await ia.describirFoto(mediaUrl, novedadActual.item + ' - ' + (novedadActual.nota || ''));

          sesion.fotos.push({
            tipo: 'novedad',
            url: mediaUrl,
            descripcion: novedadActual.grupo + ' - ' + novedadActual.item,
            validacion: descNov.comentario
          });

          sesion.fotosNovedadPendientes.shift();

          if (sesion.fotosNovedadPendientes.length > 0) {
            var siguienteNov = sesion.fotosNovedadPendientes[0];
            return utils.responderTwiml(res,
              '\u2705 Foto recibida\n\n\ud83d\udcf8 *Foto de novedad* (' + sesion.fotosNovedadPendientes.length + ' pendiente(s))\n*' + siguienteNov.item + '*\n_' + (siguienteNov.nota || siguienteNov.grupo) + '_'
            );
          }

          sesion.estado = 'FOTO_ADICIONAL';
          return utils.responderTwiml(res, '\u2705 Todas las fotos recibidas\n\n\ud83d\udcf8 *Fotos adicionales?*\nEnvie fotos extra si quiere agregar evidencia\no escriba *no* para continuar');
        }

        // ==================== FOTO ADICIONAL (OPCIONAL) ====================
        case 'FOTO_ADICIONAL': {
          if (numMedia > 0) {
            var descAd = await ia.describirFoto(mediaUrl, 'evidencia adicional preoperacional ' + sesion.placa);
            sesion.fotos.push({
              tipo: 'adicional',
              url: mediaUrl,
              descripcion: 'Foto adicional',
              validacion: descAd.comentario
            });
            return utils.responderTwiml(res, '\u2705 Foto guardada\n\nEnvie otra foto o escriba *no* para continuar');
          }
          // Texto "no" u otro → pasar a observacion
          sesion.estado = 'OBSERVACION';
          return utils.responderTwiml(res, '\ud83d\udcac Observacion final?\nSi no hay, escribe *no*');
        }

        // ==================== OBSERVACION ====================
        case 'OBSERVACION': {
          sesion.observacion = mensaje.toLowerCase() === 'no' ? null : mensaje;
          sesion.estado = 'CONFIRMACION';

          var textoFirma = '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n';
          textoFirma += '\ud83d\udcdd *CONFIRMAR PREOPERACIONAL*\n';
          textoFirma += '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n';
          textoFirma += '\ud83d\ude97 Vehiculo: *' + sesion.placa + '*\n';
          textoFirma += '\ud83d\udccf Kilometraje: *' + sesion.kilometraje + ' km*\n';
          if (sesion.novedades.length > 0) {
            textoFirma += '\u26a0\ufe0f Novedades: *' + sesion.novedades.length + '*\n';
            sesion.novedades.forEach(function(n) {
              textoFirma += '  \u2022 ' + n.item + ': ' + n.estado + '\n';
            });
          } else {
            textoFirma += '\u2705 Sin novedades\n';
          }
          textoFirma += '\ud83d\udcf7 Fotos: *' + sesion.fotos.length + '*\n';
          if (sesion.observacion) textoFirma += '\ud83d\udcac _' + sesion.observacion + '_\n';
          textoFirma += '\n\u270d\ufe0f Escriba *SI* para firmar\no *ATRAS* para corregir';

          return utils.responderTwiml(res, textoFirma);
        }

        // ==================== CONFIRMACION / FIRMA ====================
        case 'CONFIRMACION': {
          if (mensaje.toUpperCase() !== 'SI') {
            return utils.responderTwiml(res, 'Escriba *SI* para firmar\no *ATRAS* para corregir\no *CANCELAR* para anular.');
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
              var prefix = n.critico ? '\u26a0\ufe0f CRITICO ' : '';
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
            return utils.responderTwiml(res, '\u274c Error guardando. Intente de nuevo o contacte al supervisor.');
          }

          var preop = resPreop.data;

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

          await config.supabase
            .from('vehiculos')
            .update({ kilometraje: sesion.kilometraje })
            .eq('id', sesion.vehiculo.id);

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
          sesiones.eliminarSesion(telefono);

          var msgFinal = '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n';
          msgFinal += '\u2705 *PREOPERACIONAL FIRMADO*\n';
          msgFinal += '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n';
          msgFinal += '\ud83d\ude97 *' + datosSesion.placa + '* | ' + ahora.toLocaleDateString('es-CO') + '\n';
          msgFinal += '\ud83d\udc64 ' + (datosSesion.conductor ? datosSesion.conductor.nombre : 'Conductor') + '\n';
          msgFinal += '\ud83d\udccf ' + datosSesion.kilometraje + ' km\n';
          if (novedadesCriticas.length > 0) {
            msgFinal += '\u26a0\ufe0f *' + novedadesCriticas.length + ' item(es) critico(s)*\n';
            msgFinal += '_Supervisor notificado_\n';
          } else if (datosSesion.novedades.length > 0) {
            msgFinal += '\u26a0\ufe0f ' + datosSesion.novedades.length + ' novedad(es)\n';
          } else {
            msgFinal += '\u2705 Sin novedades\n';
          }
          msgFinal += '\n\ud83d\udcc4 Generando PDF...';

          utils.responderTwiml(res, msgFinal);

          pdf.subirYEnviarPDF(datosSesion, preop.id, telefono);
          return;
        }

        default: {
          sesion.estado = 'INICIO';
          return utils.responderTwiml(res, '\ud83d\ude97 *CERO - Preoperacional*\nBuenos dias \ud83d\udc4b\nPlaca del vehiculo?');
        }
      }
    } catch (error) {
      console.error('Error en webhook:', error);
      return utils.responderTwiml(res, '\u274c Error interno. Intente de nuevo.');
    } finally {
      sesiones.desbloquear(telefono);
    }
  });
}

module.exports = { registrarWebhook };
