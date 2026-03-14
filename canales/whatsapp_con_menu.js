// canales/whatsapp.js
// Enrutador principal para el canal de WhatsApp con menú de selección

const { obtenerSesion, actualizarSesion, limpiarSesion } = require('../servicios/sesiones');
const flujoPreoperacional = require('../modulos/vehiculos/preoperacional/flujo');
const flujoPosoperacional = require('../modulos/vehiculos/posoperacional/flujo');

// Estados del menú principal
const MENU_ESTADOS = {
  INICIO: 'MENU_INICIO',
  SELECCION: 'MENU_SELECCION'
};

async function webhookWhatsApp(req, res) {
  const telefono = req.body.From;
  const mensaje = req.body.Body?.trim() || '';
  
  try {
    // Obtener o crear sesión
    let sesion = await obtenerSesion(telefono);
    
    // Comando global MENU - siempre vuelve al inicio
    if (mensaje.toUpperCase() === 'MENU' || mensaje.toUpperCase() === 'INICIO') {
      await limpiarSesion(telefono);
      sesion = {
        telefono,
        estado: MENU_ESTADOS.SELECCION,
        tipo: null
      };
      await actualizarSesion(telefono, sesion);
      return responderMenu(res);
    }
    
    // Si no tiene tipo asignado, está en el menú
    if (!sesion.tipo) {
      return await manejarMenuPrincipal(req, res, sesion, mensaje);
    }
    
    // Enrutar al módulo correspondiente
    if (sesion.tipo === 'preoperacional') {
      return await flujoPreoperacional.manejarPreoperacional(req, res);
    }
    
    if (sesion.tipo === 'posoperacional') {
      return await flujoPosoperacional.manejarPosoperacional(req, res);
    }
    
    // Si llegamos aquí, algo salió mal - resetear
    await limpiarSesion(telefono);
    return responderMenu(res);
    
  } catch (error) {
    console.error('❌ Error en webhook WhatsApp:', error);
    return responderError(res);
  }
}

async function manejarMenuPrincipal(req, res, sesion, mensaje) {
  const opcion = mensaje.trim();
  
  // Validar opción
  if (opcion === '1') {
    // Preoperacional
    sesion.tipo = 'preoperacional';
    sesion.estado = 'INICIO'; // El módulo tomará el control
    await actualizarSesion(sesion.telefono, sesion);
    return await flujoPreoperacional.manejarPreoperacional(req, res);
  }
  
  if (opcion === '2') {
    // Posoperacional
    sesion.tipo = 'posoperacional';
    sesion.estado = 'POSOP_INICIO';
    await actualizarSesion(sesion.telefono, sesion);
    return await flujoPosoperacional.manejarPosoperacional(req, res);
  }
  
  if (opcion === '3') {
    // Tanqueo (futuro)
    return responderTwiml(res, '🚧 Módulo de tanqueo en desarrollo.\n\nEscribe MENU para volver.');
  }
  
  // Opción inválida - mostrar menú de nuevo
  return responderMenu(res);
}

function responderMenu(res) {
  const menu = `🚗 *SISTEMA CERO*
cero papel, cero accidentes

Selecciona una opción:

1️⃣ Preoperacional (inicio de jornada)
2️⃣ Posoperacional (fin de jornada)
3️⃣ Tanqueo

Escribe el número:`;
  
  return responderTwiml(res, menu);
}

function responderRaiz(req, res) {
  res.send('CERO modular - Canal WhatsApp activo');
}

function responderError(res) {
  return responderTwiml(res, '❌ Ocurrió un error.\n\nEscribe MENU para reiniciar.');
}

function responderTwiml(res, mensaje) {
  res.set('Content-Type', 'text/xml');
  res.send(`
    <?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Message>${escaparXml(mensaje)}</Message>
    </Response>
  `);
}

function escaparXml(texto) {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function registrarCanalWhatsapp(app) {
  app.get('/', responderRaiz);
  app.post('/webhook', webhookWhatsApp);
  
  console.log('✓ Canal WhatsApp registrado con menú principal');
}

module.exports = {
  registrarCanalWhatsapp,
  webhookWhatsApp,
  responderRaiz
};
