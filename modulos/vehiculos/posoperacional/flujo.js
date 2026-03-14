// modulos/vehiculos/posoperacional/flujo.js
// Flujo conversacional del posoperacional

const { supabase, twilioClient, TWILIO_WHATSAPP_NUMBER, TABLES } = require('../../../config/config');
const { obtenerSesion, actualizarSesion, limpiarSesion } = require('../../../servicios/sesiones');
const { extraerKilometraje } = require('../../../servicios/ocr');
const { 
  ITEMS_POSOPERACIONAL, 
  NIVELES_COMBUSTIBLE,
  validarKilometraje,
  generarResumenPosoperacional 
} = require('./validaciones');

// Estados del flujo posoperacional
const ESTADOS = {
  INICIO: 'POSOP_INICIO',
  ESPERANDO_PLACA: 'POSOP_ESPERANDO_PLACA',
  ESPERANDO_FOTO_ODOMETRO: 'POSOP_ESPERANDO_FOTO_ODOMETRO',
  CONFIRMACION_KM: 'POSOP_CONFIRMACION_KM',
  KM_MANUAL: 'POSOP_KM_MANUAL',
  COMBUSTIBLE: 'POSOP_COMBUSTIBLE',
  INSPECCION: 'POSOP_INSPECCION',
  DESCRIBIR_NOVEDAD: 'POSOP_DESCRIBIR_NOVEDAD',
  FOTO_NOVEDAD: 'POSOP_FOTO_NOVEDAD',
  OBSERVACIONES: 'POSOP_OBSERVACIONES',
  CONFIRMACION: 'POSOP_CONFIRMACION'
};

async function manejarPosoperacional(req, res) {
  const telefono = req.body.From;
  const mensaje = req.body.Body?.trim() || '';
  const mediaUrl = req.body.MediaUrl0;
  
  try {
    let sesion = await obtenerSesion(telefono);
    
    // Inicializar si es la primera vez
    if (!sesion.tipo || sesion.tipo !== 'posoperacional') {
      sesion = {
        tipo: 'posoperacional',
        estado: ESTADOS.INICIO,
        telefono,
        datos: {
          novedades: [],
          itemsRevisados: 0
        }
      };
    }
    
    let respuesta;
    
    // Comandos globales
    if (mensaje.toUpperCase() === 'CANCELAR') {
      await limpiarSesion(telefono);
      respuesta = '❌ Posoperacional cancelado.\n\nEscribe cualquier mensaje para iniciar de nuevo.';
      return enviarRespuesta(res, respuesta);
    }
    
    if (mensaje.toUpperCase() === 'MENU') {
      await limpiarSesion(telefono);
      respuesta = await generarMenuPrincipal();
      return enviarRespuesta(res, respuesta);
    }
    
    // Enrutador de estados
    switch (sesion.estado) {
      case ESTADOS.INICIO:
        respuesta = await manejarInicio(sesion);
        break;
        
      case ESTADOS.ESPERANDO_PLACA:
        respuesta = await manejarPlaca(sesion, mensaje);
        break;
        
      case ESTADOS.ESPERANDO_FOTO_ODOMETRO:
        respuesta = await manejarFotoOdometro(sesion, mediaUrl);
        break;
        
      case ESTADOS.CONFIRMACION_KM:
        respuesta = await manejarConfirmacionKm(sesion, mensaje);
        break;
        
      case ESTADOS.KM_MANUAL:
        respuesta = await manejarKmManual(sesion, mensaje);
        break;
        
      case ESTADOS.COMBUSTIBLE:
        respuesta = await manejarCombustible(sesion, mensaje);
        break;
        
      case ESTADOS.INSPECCION:
        respuesta = await manejarInspeccion(sesion, mensaje);
        break;
        
      case ESTADOS.DESCRIBIR_NOVEDAD:
        respuesta = await manejarDescripcionNovedad(sesion, mensaje);
        break;
        
      case ESTADOS.FOTO_NOVEDAD:
        respuesta = await manejarFotoNovedad(sesion, mediaUrl);
        break;
        
      case ESTADOS.OBSERVACIONES:
        respuesta = await manejarObservaciones(sesion, mensaje);
        break;
        
      case ESTADOS.CONFIRMACION:
        respuesta = await manejarConfirmacion(sesion, mensaje);
        break;
        
      default:
        respuesta = await manejarInicio(sesion);
    }
    
    await actualizarSesion(telefono, sesion);
    enviarRespuesta(res, respuesta);
    
  } catch (error) {
    console.error('❌ Error en posoperacional:', error);
    enviarRespuesta(res, '❌ Ocurrió un error. Escribe MENU para volver al inicio.');
  }
}

// ============================================================================
// MANEJADORES DE ESTADOS
// ============================================================================

async function manejarInicio(sesion) {
  sesion.estado = ESTADOS.ESPERANDO_PLACA;
  
  return `🏁 *POSOPERACIONAL - FIN DE JORNADA*

Por favor ingresa la *placa del vehículo*:

Ejemplo: TKJ933`;
}

async function manejarPlaca(sesion, placa) {
  placa = placa.toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  // Validar formato básico
  if (placa.length < 5 || placa.length > 10) {
    return '❌ Placa inválida.\n\nIngresa la placa correcta (ej: TKJ933):';
  }
  
  // Buscar vehículo
  const { data: vehiculo, error } = await supabase
    .from(TABLES.vehiculos)
    .select('*')
    .eq('placa', placa)
    .single();
  
  if (error || !vehiculo) {
    return `❌ Vehículo *${placa}* no encontrado en el sistema.\n\nVerifica la placa:`;
  }
  
  if (vehiculo.bloqueado) {
    return `🚫 Vehículo *${placa}* BLOQUEADO\n\nMotivo: ${vehiculo.motivo_bloqueo}\n\nContacta al supervisor.`;
  }
  
  // Guardar datos
  sesion.datos.placa = placa;
  sesion.datos.vehiculo = vehiculo;
  sesion.datos.kilometrajeInicial = vehiculo.kilometraje;
  sesion.estado = ESTADOS.ESPERANDO_FOTO_ODOMETRO;
  
  return `✓ ${vehiculo.marca} ${vehiculo.modelo} - *${placa}*

📸 Envía una *foto del odómetro* mostrando el kilometraje final.

Kilometraje inicial del día: *${vehiculo.kilometraje.toLocaleString()} km*`;
}

async function manejarFotoOdometro(sesion, mediaUrl) {
  if (!mediaUrl) {
    return '📸 Por favor envía la *foto del odómetro*.\n\nDebe verse claramente el kilometraje.';
  }
  
  // Extraer kilometraje con OCR
  const resultado = await extraerKilometraje(mediaUrl);
  
  if (!resultado.exito) {
    sesion.estado = ESTADOS.KM_MANUAL;
    return `⚠️ No pude leer el odómetro claramente.\n\nIngresa el kilometraje *manualmente*:\n\nKilometraje inicial: ${sesion.datos.kilometrajeInicial.toLocaleString()} km`;
  }
  
  sesion.datos.kilometrajeFinal = resultado.kilometraje;
  sesion.estado = ESTADOS.CONFIRMACION_KM;
  
  const validacion = validarKilometraje(resultado.kilometraje, sesion.datos.kilometrajeInicial);
  const kmRecorridos = validacion.kmRecorridos || 0;
  
  return `✓ Odómetro leído: *${resultado.kilometraje.toLocaleString()} km*

📊 Kilometraje recorrido hoy: *${kmRecorridos} km*

¿Es correcto?
1️⃣ Sí, continuar
2️⃣ No, corregir`;
}

async function manejarConfirmacionKm(sesion, respuesta) {
  if (respuesta === '1') {
    sesion.estado = ESTADOS.COMBUSTIBLE;
    return await mostrarOpcionesCombustible();
  }
  
  if (respuesta === '2') {
    sesion.estado = ESTADOS.KM_MANUAL;
    return `Ingresa el kilometraje correcto:\n\nKm inicial: ${sesion.datos.kilometrajeInicial.toLocaleString()}`;
  }
  
  return 'Por favor responde:\n1️⃣ Sí\n2️⃣ No';
}

async function manejarKmManual(sesion, km) {
  const kmFinal = parseInt(km.replace(/[^0-9]/g, ''));
  
  if (isNaN(kmFinal)) {
    return '❌ Ingresa solo números.\n\nEjemplo: 78945';
  }
  
  const validacion = validarKilometraje(kmFinal, sesion.datos.kilometrajeInicial);
  
  if (!validacion.valido) {
    return `❌ ${validacion.error}\n\nKm inicial: ${sesion.datos.kilometrajeInicial.toLocaleString()}\n\nIngresa el kilometraje final correcto:`;
  }
  
  sesion.datos.kilometrajeFinal = kmFinal;
  sesion.estado = ESTADOS.COMBUSTIBLE;
  
  return await mostrarOpcionesCombustible();
}

async function mostrarOpcionesCombustible() {
  let mensaje = '⛽ *NIVEL DE COMBUSTIBLE*\n\nSelecciona el nivel actual:\n\n';
  
  NIVELES_COMBUSTIBLE.forEach((nivel, idx) => {
    mensaje += `${idx + 1}️⃣ ${nivel.emoji} ${nivel.texto}\n`;
  });
  
  return mensaje;
}

async function manejarCombustible(sesion, respuesta) {
  const opcion = parseInt(respuesta);
  
  if (opcion < 1 || opcion > NIVELES_COMBUSTIBLE.length) {
    return '❌ Opción inválida.\n\n' + await mostrarOpcionesCombustible();
  }
  
  sesion.datos.combustibleRestante = NIVELES_COMBUSTIBLE[opcion - 1].valor;
  sesion.estado = ESTADOS.INSPECCION;
  sesion.datos.itemActual = 0;
  
  return await mostrarItemInspeccion(sesion);
}

async function mostrarItemInspeccion(sesion) {
  const item = ITEMS_POSOPERACIONAL[sesion.datos.itemActual];
  
  if (!item) {
    // Terminó la inspección
    sesion.estado = ESTADOS.OBSERVACIONES;
    return `✓ Inspección completada\n\n¿Alguna *observación adicional* sobre la jornada?\n\nSi no, escribe: NO`;
  }
  
  let mensaje = `🔍 *${item.nombre.toUpperCase()}*\n${item.descripcion}\n\n`;
  
  item.estados.forEach((estado, idx) => {
    mensaje += `${idx + 1}️⃣ ${estado}\n`;
  });
  
  return mensaje;
}

async function manejarInspeccion(sesion, respuesta) {
  const item = ITEMS_POSOPERACIONAL[sesion.datos.itemActual];
  const opcion = parseInt(respuesta);
  
  if (opcion < 1 || opcion > item.estados.length) {
    return '❌ Opción inválida.\n\n' + await mostrarItemInspeccion(sesion);
  }
  
  const estadoSeleccionado = item.estados[opcion - 1];
  
  // Si es "Sin novedad" o el primer estado, continuar
  if (opcion === 1) {
    sesion.datos.itemActual++;
    sesion.datos.itemsRevisados++;
    return await mostrarItemInspeccion(sesion);
  }
  
  // Hay novedad - registrarla
  sesion.datos.novedadTemporal = {
    item: item.nombre,
    estado: estadoSeleccionado,
    critico: item.critico,
    requiereFoto: item.requiereFoto
  };
  
  sesion.estado = ESTADOS.DESCRIBIR_NOVEDAD;
  
  return `📝 Describe brevemente la novedad en *${item.nombre}*:\n\nEjemplo: "Golpe en puerta trasera derecha"`;
}

async function manejarDescripcionNovedad(sesion, descripcion) {
  sesion.datos.novedadTemporal.descripcion = descripcion;
  
  if (sesion.datos.novedadTemporal.requiereFoto) {
    sesion.estado = ESTADOS.FOTO_NOVEDAD;
    return `📸 Envía una *foto* de la novedad:\n\n"${sesion.datos.novedadTemporal.item}"`;
  } else {
    // No requiere foto, guardar y continuar
    sesion.datos.novedades.push(sesion.datos.novedadTemporal);
    sesion.datos.itemActual++;
    sesion.datos.itemsRevisados++;
    sesion.estado = ESTADOS.INSPECCION;
    delete sesion.datos.novedadTemporal;
    
    return await mostrarItemInspeccion(sesion);
  }
}

async function manejarFotoNovedad(sesion, mediaUrl) {
  if (!mediaUrl) {
    return `📸 Por favor envía la *foto* de:\n\n"${sesion.datos.novedadTemporal.item}"`;
  }
  
  sesion.datos.novedadTemporal.foto = mediaUrl;
  sesion.datos.novedades.push(sesion.datos.novedadTemporal);
  sesion.datos.itemActual++;
  sesion.datos.itemsRevisados++;
  sesion.estado = ESTADOS.INSPECCION;
  delete sesion.datos.novedadTemporal;
  
  return `✓ Foto guardada\n\n` + await mostrarItemInspeccion(sesion);
}

async function manejarObservaciones(sesion, observaciones) {
  if (observaciones.toUpperCase() !== 'NO') {
    sesion.datos.observaciones = observaciones;
  }
  
  sesion.estado = ESTADOS.CONFIRMACION;
  
  return await generarResumenFinal(sesion);
}

async function generarResumenFinal(sesion) {
  const resumen = generarResumenPosoperacional(sesion.datos);
  const kmRecorridos = sesion.datos.kilometrajeFinal - sesion.datos.kilometrajeInicial;
  
  let mensaje = `📋 *RESUMEN DEL POSOPERACIONAL*\n\n`;
  mensaje += `🚗 Vehículo: *${sesion.datos.placa}*\n`;
  mensaje += `📊 Km recorridos hoy: *${kmRecorridos} km*\n`;
  mensaje += `⛽ Combustible: *${sesion.datos.combustibleRestante}*\n`;
  mensaje += `📍 Estado: *${resumen.estado}*\n\n`;
  
  if (resumen.totalNovedades > 0) {
    mensaje += `⚠️ *NOVEDADES REPORTADAS: ${resumen.totalNovedades}*\n\n`;
    sesion.datos.novedades.forEach((nov, idx) => {
      mensaje += `${idx + 1}. ${nov.item} - ${nov.estado}\n`;
      mensaje += `   "${nov.descripcion}"\n\n`;
    });
  } else {
    mensaje += `✅ Sin novedades reportadas\n\n`;
  }
  
  if (sesion.datos.observaciones) {
    mensaje += `💬 Observaciones:\n"${sesion.datos.observaciones}"\n\n`;
  }
  
  mensaje += `Para firmar y finalizar, escribe: *SI*\n`;
  mensaje += `Para cancelar, escribe: CANCELAR`;
  
  return mensaje;
}

async function manejarConfirmacion(sesion, respuesta) {
  if (respuesta.toUpperCase() !== 'SI') {
    return 'Para firmar y finalizar, escribe: *SI*\nPara cancelar, escribe: CANCELAR';
  }
  
  // Guardar posoperacional en base de datos
  const { data, error } = await supabase
    .from(TABLES.posoperacionales)
    .insert({
      vehiculo_placa: sesion.datos.placa,
      conductor_telefono: sesion.telefono,
      kilometraje_final: sesion.datos.kilometrajeFinal,
      combustible_restante: sesion.datos.combustibleRestante,
      estado_general: generarResumenPosoperacional(sesion.datos).estado,
      novedades: sesion.datos.novedades,
      observaciones: sesion.datos.observaciones || null,
      firmado: true,
      firmado_timestamp: new Date().toISOString()
    })
    .select()
    .single();
  
  if (error) {
    console.error('Error guardando posoperacional:', error);
    return '❌ Error al guardar. Intenta de nuevo o contacta al supervisor.';
  }
  
  // Limpiar sesión
  await limpiarSesion(sesion.telefono);
  
  const resumen = generarResumenPosoperacional(sesion.datos);
  
  let mensajeFinal = `✅ *POSOPERACIONAL REGISTRADO*\n\n`;
  mensajeFinal += `ID: ${data.id.substring(0, 8)}\n`;
  mensajeFinal += `Vehículo: ${sesion.datos.placa}\n`;
  mensajeFinal += `Fecha: ${new Date().toLocaleDateString('es-CO')}\n\n`;
  
  if (resumen.novedadesCriticas > 0) {
    mensajeFinal += `🔴 *${resumen.novedadesCriticas} NOVEDAD(ES) CRÍTICA(S)*\n`;
    mensajeFinal += `El supervisor ha sido notificado.\n\n`;
  }
  
  mensajeFinal += `Gracias por completar el posoperacional.\n\n`;
  mensajeFinal += `Escribe MENU para volver al inicio.`;
  
  return mensajeFinal;
}

// ============================================================================
// UTILIDADES
// ============================================================================

function enviarRespuesta(res, mensaje) {
  res.set('Content-Type', 'text/xml');
  res.send(`
    <?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Message>${mensaje.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Message>
    </Response>
  `);
}

async function generarMenuPrincipal() {
  return `🚗 *SISTEMA CERO*\ncero papel, cero accidentes\n\nSelecciona una opción:\n\n1️⃣ Preoperacional (inicio de jornada)\n2️⃣ Posoperacional (fin de jornada)\n3️⃣ Tanqueo\n\nEscribe el número:`;
}

function registrarPosoperacional(app) {
  // Este endpoint se registrará desde el enrutador principal
  // por ahora solo exportamos el manejador
}

module.exports = {
  manejarPosoperacional,
  registrarPosoperacional,
  ESTADOS
};
