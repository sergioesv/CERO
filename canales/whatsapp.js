// canales/whatsapp.js
// Enrutador principal para el canal de WhatsApp con menú de selección

const { obtenerSesion, eliminarSesion } = require('../servicios/sesiones');
const flujoPreoperacional = require('../modulos/vehiculos/preoperacional/flujo');
const flujoPosoperacional = require('../modulos/vehiculos/posoperacional/flujo');
const flujoTanqueo = require('../modulos/vehiculos/tanqueo/flujo');

const MENU_ESTADOS = {
  INICIO: 'MENU_INICIO',
  SELECCION: 'MENU_SELECCION'
};

async function webhookWhatsApp(req, res) {
  const telefono = req.body.From;
  const mensaje = req.body.Body?.trim() || '';

  try {
    let sesion = await obtenerSesion(telefono);

    if (mensaje.toUpperCase() === 'MENU' || mensaje.toUpperCase() === 'INICIO') {
      await eliminarSesion(telefono);
      sesion = {
        telefono,
        estado: MENU_ESTADOS.SELECCION,
        tipo: null
      };
      return responderMenu(res);
    }

    if (!sesion.tipo) {
      return await manejarMenuPrincipal(req, res, sesion, mensaje);
    }

    if (sesion.tipo === 'preoperacional') {
      return await flujoPreoperacional.manejarPreoperacional(req, res);
    }

    if (sesion.tipo === 'posoperacional') {
      return await flujoPosoperacional.manejarPosoperacional(req, res);
    }

    if (sesion.tipo === 'tanqueo') {
      return await flujoTanqueo.manejarTanqueo(req, res);
    }

    await eliminarSesion(telefono);
    return responderMenu(res);
  } catch (error) {
    console.error('❌ Error en webhook WhatsApp:', error);
    return responderError(res);
  }
}

async function manejarMenuPrincipal(req, res, sesion, mensaje) {
  const opcion = mensaje.trim();

  if (opcion === '1') {
    sesion.tipo = 'preoperacional';
    sesion.estado = 'INICIO';
    return await flujoPreoperacional.manejarPreoperacional(req, res);
  }

  if (opcion === '2') {
    sesion.tipo = 'posoperacional';
    sesion.estado = 'POSOP_INICIO';
    return await flujoPosoperacional.manejarPosoperacional(req, res);
  }

  if (opcion === '3') {
    sesion.tipo = 'tanqueo';
    sesion.estado = 'TANQUEO_INICIO';
    return await flujoTanqueo.manejarTanqueo(req, res);
  }

  return responderMenu(res);
}

function responderMenu(res) {
  const menu = `🚗 *SISTEMA CERO*
cero papel, cero accidentes

Selecciona una opción:

1️⃣ Preoperacional (inicio de jornada)
2️⃣ Posoperacional (cierre de jornada)
3️⃣ Combustible / tanqueo

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
