/**
 * flujo.js — FlujoPreoperacional: máquina de estados del preoperacional.
 * Extiende FlujoBase — solo implementa estados propios de la inspección.
 * CERO — Gestión de Operaciones de Campo
 */

'use strict';

var FlujoBase  = require('../compartido/baseFlujo');
var twiml      = require('../compartido/twiml');
var storage    = require('../../../servicios/storage');
var sesiones   = require('../../../servicios/sesiones');
var ocr        = require('../../../servicios/ocr');
var config     = require('../../../config/config');
var nav        = require('../compartido/navegacion');
var kmCompartido = require('../compartido/kilometraje');
var preop      = require('./validaciones');
var estadoPreop = require('./estado');
var mensajes   = require('./mensajes');
var cierre     = require('./cierre');
var plantillas = require('../../../servicios/plantillas');

// ============================================================================
// CONFIGURAR FLUJO BASE
// ============================================================================

function crearFlujoPreoperacional() {
  var flujo = new FlujoBase({
    tipo: 'preoperacional',
    ESTADOS: {
      ESPERANDO_FOTO_PLACA: 'ESPERANDO_FOTO_FRONTAL',
      PLACA_CONFIRMACION_SUGERIDA: 'PLACA_CONFIRMACION_SUGERIDA',
      PLACA_FALLBACK: 'PLACA_FALLBACK',
      PLACA_MANUAL: 'PLACA_MANUAL',
      ESPERANDO_FOTO_ODOMETRO: 'ESPERANDO_FOTO_ODOMETRO',
      ODOMETRO_CONFIRMACION: 'ODOMETRO_CONFIRMACION',
      ODOMETRO_MANUAL: 'ODOMETRO_MANUAL',
      ESPERANDO_FOTO_HOROMETRO: 'ESPERANDO_FOTO_HOROMETRO',
      HOROMETRO_CONFIRMACION: 'HOROMETRO_CONFIRMACION',
      HOROMETRO_MANUAL: 'HOROMETRO_MANUAL'
    },
    mensajes: mensajes,
    validaciones: preop,
    tipoFotoPlaca: 'inicio_placa',
    estadoEsperandoFotoPlaca: 'ESPERANDO_FOTO_FRONTAL',

    mensajeInicio: function() { return mensajes.mensajeInicio(); },

    mensajeConfirmacionPlaca: function(vehiculo) {
      return '\u2705 *' + vehiculo.placa + '*\n' +
        [vehiculo.tipo, vehiculo.marca, vehiculo.modelo].filter(Boolean).join(' ') +
        '\n\n' + mensajes.mensajeInicioOdometro(vehiculo);
    },

    mensajeInicioOdometro: function(sesion) {
      return mensajes.mensajeInicioOdometro(sesion.vehiculo);
    },

    mensajeConfirmacionOdometro: mensajes.mensajeConfirmacionOdometro,
    mensajeKilometrajeFueraRango: mensajes.mensajeKilometrajeFueraRango,
    primerMensajeInspeccion: mensajes.primerMensajeInspeccion,

    onExitoPlaca: async function(sesion) {
      estadoPreop.reiniciarDatosOperativos(sesion);
      try {
        var plantilla = await plantillas.cargar(sesion.vehiculo.tipo_activo_id, 'preoperacional', sesion.vehiculo.empresa_id);
        sesion.plantilla = plantilla;
        sesion.gruposInspeccion = plantilla.grupos.filter(function(g) { return !g.solo_panel; });
        var medicion = plantilla.config.medicion || 'km';
        if (medicion === 'horas') {
          sesion.estado = 'ESPERANDO_FOTO_HOROMETRO';
        } else if (medicion === 'ambos') {
          sesion.estado = 'ESPERANDO_FOTO_ODOMETRO'; // TODO: implementar 'ambos' paso por paso
        } else if (medicion === 'ninguna') {
          sesion.grupoActual = 0;
          sesion.estado = 'GRUPO';
        } else {
          sesion.estado = 'ESPERANDO_FOTO_ODOMETRO';
        }
      } catch (error) {
        console.error('Error cargando plantilla:', error);
        sesion.sinPlantilla = true;
        sesion.plantilla = null;
        sesion.gruposInspeccion = [];
        sesion.estado = 'ESPERANDO_FOTO_ODOMETRO';
      }
    },

    onRegistrarKm: function(sesion, km, origen) {
      kmCompartido.registrarKilometrajeConfirmado(sesion, km, origen, function(s, k, o) {
        s.kilometraje = k;
        storage.guardarFotoUnica(s, {
          tipo: 'inicio_odometro', url: s.fotoOdometroTemporal,
          descripcion: 'Foto del odometro', validacion: o, validada: true
        });
        s.kmDetectado = null;
        s.kmLecturaFueraRango = false;
        s.fotoOdometroTemporal = null;
        if (s.sinPlantilla || !s.gruposInspeccion || !s.gruposInspeccion.length) {
          return;
        }
        s.grupoActual = 0;
        s.estado = 'GRUPO';
      });
    },

    onConfirmarKm: async function(res, sesion, telefono) {
      if (sesion.sinPlantilla || !sesion.gruposInspeccion || !sesion.gruposInspeccion.length) {
        if (telefono) sesiones.eliminarSesion(telefono);
        return twiml.responderTwiml(res, mensajes.mensajeSinPlantillaInspeccion());
      }
      kmCompartido.registrarKilometrajeConfirmado(
        sesion, sesion.kmDetectado,
        'Kilometraje confirmado desde foto: ' + sesion.kmDetectado + ' km',
        function(s, k, o) {
          s.kilometraje = k;
          storage.guardarFotoUnica(s, {
            tipo: 'inicio_odometro', url: s.fotoOdometroTemporal,
            descripcion: 'Foto del odometro', validacion: o, validada: true
          });
          s.kmDetectado = null;
          s.kmLecturaFueraRango = false;
          s.fotoOdometroTemporal = null;
          s.grupoActual = 0;
          s.estado = 'GRUPO';
        }
      );
      return twiml.responderTwiml(res, mensajes.primerMensajeInspeccion(sesion, sesion.gruposInspeccion));
    }
  });

  flujo.inicializarSesion = function(sesion) {
    sesion.tipo = 'preoperacional';
    sesion.estado = 'ESPERANDO_FOTO_FRONTAL';
    sesion.fotos = [];
    estadoPreop.reiniciarDatosOperativos(sesion);
  };

  flujo.manejarAtras = manejarAtras;
  flujo.procesarEstado = procesarEstado;

  // Override esAtrasOdometro for preop (uses 4 instead of 0)
  flujo._preopEsAtras = function(m) {
    var ml = String(m || '').trim().toLowerCase();
    return ml === '4' || ml === '4️⃣';
  };

  return flujo;
}

// ============================================================================
// AVANZAR DESPUÉS DE INSPECCIÓN
// ============================================================================

function avanzarDespuesDeInspeccion(res, sesion, prefijo) {
  var resumen = preop.generarResumen(sesion, sesion.gruposInspeccion);
  var mensaje = (prefijo ? prefijo + '\n\n' : '') + resumen + '\n\n' + mensajes.mensajeFotoNovedad(sesion, estadoPreop.prepararFotosNovedad);
  return twiml.responderTwiml(res, mensaje);
}

// ============================================================================
// MANEJAR ATRÁS
// ============================================================================

function manejarAtras(res, sesion) {
  if (sesion.estado === 'ESPERANDO_FOTO_ODOMETRO' || sesion.estado === 'PLACA_FALLBACK' || sesion.estado === 'PLACA_CONFIRMACION_SUGERIDA' || sesion.estado === 'PLACA_MANUAL') {
    estadoPreop.volverAInicioPorFoto(sesion);
    return twiml.responderTwiml(res, '◀️ Volvemos al inicio.\n\n' + mensajes.mensajeInicio());
  }
  if (sesion.estado === 'ODOMETRO_CONFIRMACION' || sesion.estado === 'ODOMETRO_MANUAL') {
    estadoPreop.volverAKilometraje(sesion);
    return twiml.responderTwiml(res, '◀️ Volvemos al kilometraje.\n\n' + mensajes.mensajeInicioOdometro(sesion.vehiculo));
  }
  if (sesion.estado === 'GRUPO' && sesion.grupoActual > 0) {
    sesion.grupoActual--;
    estadoPreop.limpiarGrupo(sesion, sesion.gruposInspeccion[sesion.grupoActual]);
    return twiml.responderTwiml(res, preop.formatGrupoMsg(sesion.gruposInspeccion[sesion.grupoActual], '◀️ Volvemos'));
  }
  if (sesion.estado === 'GRUPO' && sesion.grupoActual === 0) {
    estadoPreop.volverAKilometraje(sesion);
    return twiml.responderTwiml(res, '◀️ Volvemos al kilometraje.\n\n' + mensajes.mensajeInicioOdometro(sesion.vehiculo));
  }
  if (sesion.estado === 'DESCRIBIR_NOVEDAD') {
    sesion.estado = 'GRUPO';
    return twiml.responderTwiml(res, preop.formatGrupoMsg(sesion.gruposInspeccion[sesion.grupoActual], '◀️ Volvemos'));
  }
  if (sesion.estado === 'SUB_PREGUNTA') {
    sesion.subPreguntasCola = [];
    estadoPreop.limpiarGrupo(sesion, sesion.gruposInspeccion[sesion.grupoActual]);
    sesion.estado = 'GRUPO';
    return twiml.responderTwiml(res, preop.formatGrupoMsg(sesion.gruposInspeccion[sesion.grupoActual], '◀️ Volvemos'));
  }
  if (sesion.estado === 'FOTO_NOVEDAD') {
    storage.limpiarFotosPorTipo(sesion, ['novedad', 'adicional']);
    sesion.fotosNovedadPendientes = [];
    return twiml.responderTwiml(res, mensajes.mensajeFotoNovedad(sesion, estadoPreop.prepararFotosNovedad, '◀️ Volvemos'));
  }
  if (sesion.estado === 'FOTO_ADICIONAL') {
    storage.limpiarFotosPorTipo(sesion, ['adicional']);
    if (preop.obtenerNovedadesFotografiables(sesion.novedades, sesion.gruposInspeccion).length > 0) {
      storage.limpiarFotosPorTipo(sesion, ['novedad']);
      sesion.fotosNovedadPendientes = [];
      return twiml.responderTwiml(res, mensajes.mensajeFotoNovedad(sesion, estadoPreop.prepararFotosNovedad, '◀️ Volvemos'));
    }
    return twiml.responderTwiml(res, mensajes.mensajeFotoAdicional('◀️'));
  }
  if (sesion.estado === 'OBSERVACION_TEXTO') {
    sesion.estado = 'OBSERVACION';
    return twiml.responderTwiml(res, mensajes.mensajeMenuObservacionFinal());
  }
  if (sesion.estado === 'OBSERVACION') {
    sesion.observacion = null;
    sesion.estado = 'FOTO_ADICIONAL';
    return twiml.responderTwiml(res, mensajes.mensajeFotoAdicional('◀️'));
  }
  if (sesion.estado === 'CONFIRMACION') {
    sesion.estado = 'OBSERVACION';
    return twiml.responderTwiml(res, mensajes.mensajeMenuObservacionFinal());
  }
  return twiml.responderTwiml(res, 'No hay paso anterior.\n\n0️⃣ _Atrás_  •  9️⃣ _Menú principal_');
}

// ============================================================================
// PROCESADOR DE ESTADOS
// ============================================================================

async function procesarEstado(res, sesion, telefono, mensaje, msgUpper, mediaUrls) {
  var msgLower = mensaje.toLowerCase();
  var numMedia = mediaUrls.length;

  // Estados compartidos de placa/odómetro
  var resultadoCompartido = await this.procesarEstadoCompartido(res, sesion, telefono, mensaje, mediaUrls);
  if (resultadoCompartido !== null) return resultadoCompartido;

  switch (sesion.estado) {

    case 'GRUPO': {
      var grupoActual = sesion.gruposInspeccion[sesion.grupoActual];
      var respLimpia = mensaje.trim();
      var respLower = respLimpia.toLowerCase();

      if (respLimpia === '1' || respLimpia === '1️⃣' || respLower === 'ok' || respLower === 'todo bien') {
        estadoPreop.limpiarGrupo(sesion, grupoActual);
        sesion.respuestas[grupoActual.id] = ocr.marcarTodoOK();
        sesion.grupoActual++;
        if (sesion.grupoActual < sesion.gruposInspeccion.length) {
          return twiml.responderTwiml(res, preop.formatGrupoMsg(sesion.gruposInspeccion[sesion.grupoActual], '✅ OK'));
        }
        return avanzarDespuesDeInspeccion(res, sesion);
      }
      if (respLimpia === '2' || respLimpia === '2️⃣') {
        sesion.estado = 'DESCRIBIR_NOVEDAD';
        var listaItems = grupoActual.items.map(function(item) { return '• ' + item.nombre; }).join('\n');
        var ejemplos = grupoActual.items.slice(0, 2).map(function(item) { return item.nombre.toLowerCase(); }).join('", "');
        return twiml.responderTwiml(res,
          '✍️ *Describe la novedad en:*\n*' + grupoActual.nombre + '*\n------\n' + listaItems +
          '\n------\n_Escribe lo que encontraste_\n_Ej: "' + ejemplos + ' malo"_'
        );
      }
      if (respLimpia === '3' || respLimpia === '3️⃣' || respLower === 'atras') {
        if (sesion.grupoActual > 0) {
          sesion.grupoActual--;
          estadoPreop.limpiarGrupo(sesion, sesion.gruposInspeccion[sesion.grupoActual]);
          return twiml.responderTwiml(res, preop.formatGrupoMsg(sesion.gruposInspeccion[sesion.grupoActual], '◀️ Volvemos'));
        }
        estadoPreop.volverAKilometraje(sesion);
        return twiml.responderTwiml(res, '◀️ Volvemos al kilometraje.\n\n' + mensajes.mensajeInicioOdometro(sesion.vehiculo));
      }
      return twiml.responderTwiml(res, preop.formatGrupoMsg(grupoActual, '❌ Responde 1, 2 o 3'));
    }

    case 'DESCRIBIR_NOVEDAD': {
      var grupoNovedad = sesion.gruposInspeccion[sesion.grupoActual];
      var textoNovedad = String(mensaje || '').trim();

      if (numMedia > 0) {
        return twiml.responderTwiml(res, '✍️ En este paso necesito texto, no foto.\nDescribe el item y la falla.\n_Ej: "freno de parqueo malo"_');
      }
      if (textoNovedad === '3' || textoNovedad === '3️⃣' || textoNovedad.toUpperCase() === 'ATRAS') {
        return manejarAtras(res, sesion);
      }
      if (!textoNovedad || textoNovedad.length < 3 || ['1', '1️⃣', '2', '2️⃣'].indexOf(textoNovedad) >= 0) {
        var ejemplosAyuda = grupoNovedad.items.slice(0, 2).map(function(item) { return item.nombre.toLowerCase(); }).join('", "');
        return twiml.responderTwiml(res, '✍️ Describe el item y la falla con texto.\n_Ej: "' + ejemplosAyuda + ' malo"_\nTambién puedes escribir *ATRAS* para volver.');
      }

      var interpretacion;
      try {
        interpretacion = await ocr.interpretarNovedad(textoNovedad, grupoNovedad.items.map(function(item) { return item.nombre; }));
      } catch (error) {
        console.error('Error interpretando novedad [' + grupoNovedad.id + ']:', error.message || error);
        interpretacion = null;
      }

      if (!interpretacion || !Array.isArray(interpretacion.items)) {
        var ejemplosError = grupoNovedad.items.slice(0, 2).map(function(item) { return item.nombre.toLowerCase(); }).join('", "');
        return twiml.responderTwiml(res, '❌ No pude interpretar la novedad.\nDescribe de nuevo el item y la falla.\n_Ej: "' + ejemplosError + ' malo"_');
      }

      var itemsInterpretados = estadoPreop.normalizarItemsInterpretados(interpretacion.items, grupoNovedad);
      if (!itemsInterpretados.length) {
        return twiml.responderTwiml(res,
          '❌ No pude asociar la novedad a un item de este bloque.\nMenciona uno de estos items: ' + grupoNovedad.items.map(function(item) { return item.nombre; }).join(', ')
        );
      }

      estadoPreop.limpiarGrupo(sesion, grupoNovedad);
      sesion.respuestas[grupoNovedad.id] = {
        estado: 'NOVEDAD', items: itemsInterpretados,
        observacion: interpretacion.observacion || textoNovedad
      };

      var novedadesGrupo = itemsInterpretados.filter(function(item) {
        return preop.clasificarEstado(item.estado) !== 'ok';
      }).map(function(item) {
        return {
          grupo: grupoNovedad.nombre, item: item.nombre, estado: item.estado,
          nota: item.estado, critico: preop.esCritico(grupoNovedad.id, item.nombre, sesion.gruposInspeccion)
        };
      });

      var novedadesSinSub = [];
      var novedadesConSub = [];
      for (var i = 0; i < novedadesGrupo.length; i++) {
        var nov = novedadesGrupo[i];
        if (preop.tieneSubPregunta(nov.item, sesion.gruposInspeccion)) {
          novedadesConSub.push(nov);
        } else {
          nov.severidad = preop.evaluarSeveridadNovedad(nov.item, nov.estado, null, sesion.gruposInspeccion);
          novedadesSinSub.push(nov);
        }
      }
      for (var j = 0; j < novedadesSinSub.length; j++) {
        sesion.novedades.push(novedadesSinSub[j]);
      }

      if (novedadesConSub.length > 0) {
        sesion.subPreguntasCola = novedadesConSub;
        sesion.estado = 'SUB_PREGUNTA';
        var primeraSub = novedadesConSub[0];
        var subPregunta = preop.obtenerSubPregunta(primeraSub.item, sesion.gruposInspeccion);
        var prefijoSub = novedadesSinSub.length > 0
          ? '⚠️ Anotado: ' + novedadesSinSub.map(function(n) { return n.item + ' (' + n.estado + ')'; }).join(', ')
          : '📋 Necesito precisar la novedad:';
        return twiml.responderTwiml(res, preop.formatSubPreguntaMsg(subPregunta, prefijoSub));
      }

      var confirmacion = novedadesGrupo.length > 0
        ? '⚠️ Anotado: ' + novedadesGrupo.map(function(n) { return n.item + ' (' + n.estado + ')'; }).join(', ')
        : '✅ Registrado';
      sesion.grupoActual++;
      sesion.estado = 'GRUPO';
      if (sesion.grupoActual < sesion.gruposInspeccion.length) {
        return twiml.responderTwiml(res, preop.formatGrupoMsg(sesion.gruposInspeccion[sesion.grupoActual], confirmacion));
      }
      return avanzarDespuesDeInspeccion(res, sesion, confirmacion);
    }

    case 'SUB_PREGUNTA': {
      if (numMedia > 0) {
        var subActualFoto = preop.obtenerSubPregunta(sesion.subPreguntasCola[0].item, sesion.gruposInspeccion);
        return twiml.responderTwiml(res, preop.formatSubPreguntaMsg(subActualFoto, '⌨️ En este paso necesito un número, no foto.'));
      }
      if (!sesion.subPreguntasCola || sesion.subPreguntasCola.length === 0) {
        sesion.estado = 'GRUPO';
        return twiml.responderTwiml(res, preop.formatGrupoMsg(sesion.gruposInspeccion[sesion.grupoActual], '↩️ Continuamos'));
      }

      var novedadSubActual = sesion.subPreguntasCola[0];
      var subPreguntaActual = preop.obtenerSubPregunta(novedadSubActual.item, sesion.gruposInspeccion);
      var opcionElegida = preop.procesarRespuestaSubPregunta(subPreguntaActual, mensaje);

      if (!opcionElegida) {
        return twiml.responderTwiml(res, preop.formatSubPreguntaMsg(subPreguntaActual, '❌ Responde con el número de la opción'));
      }

      novedadSubActual.severidad = opcionElegida.severidad;
      novedadSubActual.estado = opcionElegida.estado;
      novedadSubActual.nota = opcionElegida.estado;
      novedadSubActual.subRespuesta = { num: opcionElegida.num, texto: opcionElegida.texto, severidad: opcionElegida.severidad };
      sesion.novedades.push(novedadSubActual);
      sesion.subPreguntasCola.shift();

      if (sesion.subPreguntasCola.length > 0) {
        var siguienteSub = sesion.subPreguntasCola[0];
        var subSiguiente = preop.obtenerSubPregunta(siguienteSub.item, sesion.gruposInspeccion);
        return twiml.responderTwiml(res, preop.formatSubPreguntaMsg(subSiguiente, '✅ ' + novedadSubActual.item + ': *' + opcionElegida.estado + '*'));
      }

      sesion.subPreguntasCola = [];
      var grupoActualNombre = sesion.gruposInspeccion[sesion.grupoActual].nombre;
      var novedadesDelGrupo = sesion.novedades.filter(function(n) { return n.grupo === grupoActualNombre; });
      var confirmacionSub = novedadesDelGrupo.length > 1
        ? '⚠️ Anotado: ' + novedadesDelGrupo.map(function(n) { return n.item + ' (' + n.estado + ')'; }).join(', ')
        : '✅ ' + novedadSubActual.item + ': *' + opcionElegida.estado + '*';

      sesion.grupoActual++;
      sesion.estado = 'GRUPO';
      if (sesion.grupoActual < sesion.gruposInspeccion.length) {
        return twiml.responderTwiml(res, preop.formatGrupoMsg(sesion.gruposInspeccion[sesion.grupoActual], confirmacionSub));
      }
      return avanzarDespuesDeInspeccion(res, sesion, confirmacionSub);
    }

    case 'FOTO_NOVEDAD': {
      estadoPreop.prepararFotosNovedad(sesion);
      if (!sesion.fotosNovedadPendientes.length) {
        sesion.estado = 'FOTO_ADICIONAL';
        return twiml.responderTwiml(res, mensajes.mensajeFotoAdicional());
      }
      if (numMedia === 0) {
        return twiml.responderTwiml(res, mensajes.mensajeFotoNovedad(sesion, estadoPreop.prepararFotosNovedad));
      }
      var novedadActual = sesion.fotosNovedadPendientes[0];
      sesion.fotos.push({
        tipo: 'novedad', url: mediaUrls[0],
        descripcion: novedadActual.grupo + ' - ' + novedadActual.item,
        validacion: 'Evidencia de novedad recibida', validada: true
      });
      sesion.fotosNovedadPendientes.shift();
      if (sesion.fotosNovedadPendientes.length > 0) {
        var siguienteNov = sesion.fotosNovedadPendientes[0];
        return twiml.responderTwiml(res, '✅ Foto recibida\n\n📸 *Foto de novedad* (' + sesion.fotosNovedadPendientes.length + ' pendiente(s))\n*' + siguienteNov.item + '*\n_' + (siguienteNov.nota || siguienteNov.estado || siguienteNov.grupo) + '_');
      }
      sesion.estado = 'FOTO_ADICIONAL';
      return twiml.responderTwiml(res, '✅ Todas las fotos recibidas\n\n' + mensajes.mensajeFotoAdicional());
    }

    case 'FOTO_ADICIONAL': {
      if (numMedia > 0) {
        sesion.fotos.push({
          tipo: 'adicional', url: mediaUrls[0],
          descripcion: 'Foto adicional', validacion: 'Evidencia adicional recibida', validada: true
        });
        return twiml.responderTwiml(res, mensajes.mensajeFotoAdicional('✅ Foto guardada'));
      }
      if (msgLower === '1' || msgLower === '1️⃣') {
        sesion.estado = 'OBSERVACION';
        return twiml.responderTwiml(res, mensajes.mensajeMenuObservacionFinal());
      }
      return twiml.responderTwiml(res, mensajes.mensajeFotoAdicional());
    }

    case 'OBSERVACION': {
      if (numMedia > 0) return twiml.responderTwiml(res, '💬 En este paso solo necesito números (1 o 2).');
      if (!mensaje) return twiml.responderTwiml(res, mensajes.mensajeMenuObservacionFinal());
      if (msgLower === '1' || msgLower === '1️⃣') {
        sesion.observacion = null;
        sesion.estado = 'CONFIRMACION';
        return twiml.responderTwiml(res, mensajes.mensajeConfirmacionFinal(sesion));
      }
      if (msgLower === '2' || msgLower === '2️⃣') {
        sesion.estado = 'OBSERVACION_TEXTO';
        return twiml.responderTwiml(res, mensajes.mensajeEscribirObservacionFinal());
      }
      return twiml.responderTwiml(res, mensajes.mensajeMenuObservacionFinal());
    }

    case 'OBSERVACION_TEXTO': {
      if (numMedia > 0) return twiml.responderTwiml(res, '💬 En este paso solo necesito texto.\nEscribe la observación final.');
      if (!mensaje) return twiml.responderTwiml(res, mensajes.mensajeEscribirObservacionFinal());
      sesion.observacion = mensaje;
      sesion.estado = 'CONFIRMACION';
      return twiml.responderTwiml(res, mensajes.mensajeConfirmacionFinal(sesion));
    }

    case 'CONFIRMACION': {
      if (numMedia > 0) return twiml.responderTwiml(res, 'En este paso solo necesito números (1 o 2).');
      if (msgLower === '1' || msgLower === '1️⃣') {
        var guardado = await cierre.guardarPreoperacionalCompleto(sesion, telefono, sesion.gruposInspeccion);
        if (guardado.error) {
          console.error('Error guardando preoperacional:', guardado.error);
          return twiml.responderTwiml(res, '❌ Error guardando. Intente de nuevo o contacte al supervisor.');
        }
        sesiones.eliminarSesion(telefono);
        return twiml.responderTwiml(res,
          mensajes.mensajeFinalFirma(guardado.datosSesion, guardado.ahora.toLocaleDateString('es-CO'), guardado.novedadesCriticas, guardado.pdfUrl)
        );
      }
      if (msgLower === '2' || msgLower === '2️⃣') {
        sesion.estado = 'OBSERVACION';
        return twiml.responderTwiml(res, mensajes.mensajeMenuObservacionFinal());
      }
      return twiml.responderTwiml(res, mensajes.mensajeConfirmacionFinal(sesion));
    }

    default: {
      sesion.estado = 'ESPERANDO_FOTO_FRONTAL';
      return twiml.responderTwiml(res, mensajes.mensajeInicio());
    }
  }
}

// ============================================================================
// SINGLETON Y EXPORTS
// ============================================================================

var instancia = crearFlujoPreoperacional();

function registrarPreoperacional(app) {
  app.get('/', function(req, res) { res.send('CERO v3 corriendo'); });
  app.post('/webhook', function(req, res) { return instancia.manejar(req, res); });
}

module.exports = {
  registrarPreoperacional: registrarPreoperacional,
  manejarPreoperacional: function(req, res) { return instancia.manejar(req, res); },
  manejar: function(req, res) { return instancia.manejar(req, res); }
};
