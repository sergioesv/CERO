// canales/whatsapp.js
// Enrutador principal para el canal de WhatsApp.
// Navegación numérica unificada:
//   9 (o MENU / INICIO) → menú principal directo, sin mensaje intermedio
//   0 (o ATRAS)         → delega al módulo activo para retroceder un paso
//   CANCELAR            → alias de 9 (menú principal)

'use strict';

const { obtenerSesion, eliminarSesion, guardarCambios } = require('../servicios/sesiones');
const flujoPreoperacional = require('../modulos/vehiculos/preoperacional/flujo');
const flujoPosoperacional = require('../modulos/vehiculos/posoperacional/flujo');
const flujoTanqueo        = require('../modulos/vehiculos/tanqueo/flujo');
const flujoInscripcion    = require('../modulos/vehiculos/inscripcion/flujo');
const vehiculosData       = require('../data/vehiculos');

// ============================================================================
// WEBHOOK PRINCIPAL
// ============================================================================

async function webhookWhatsApp(req, res) {
  const telefono = req.body.From;
  const mensaje  = (req.body.Body || '').trim();
  const msgUpper = mensaje.toUpperCase();

  try {
    let sesion = await obtenerSesion(telefono);

    // ── 9 / MENU / INICIO / CANCELAR → menú directo, sin mensaje intermedio ──
    if (
      mensaje === '9'       ||
      msgUpper === 'MENU'   ||
      msgUpper === 'INICIO' ||
      msgUpper === 'CANCELAR'
    ) {
      await eliminarSesion(telefono);
      guardarCambios();
      return responderMenu(res);
    }

    // ── Enrutar según el tipo de flujo activo ─────────────────────────────────
    if (sesion.tipo === 'inscripcion') {
      return await flujoInscripcion.manejarInscripcion(req, res);
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

    // ── Sin tipo activo → verificar registro y mostrar menú ───────────────────
    return await manejarMenuPrincipal(req, res, sesion, mensaje);

  } catch (error) {
    console.error('❌ Error en webhook WhatsApp:', error);
    return responderError(res);
  }
}

// ============================================================================
// MENÚ PRINCIPAL CON VERIFICACIÓN DE REGISTRO
// ============================================================================

async function manejarMenuPrincipal(req, res, sesion, mensaje) {
  const telefono = req.body.From;

  // Verificar si el operario está registrado en el sistema
  const conductor = await vehiculosData.buscarConductorPorTelefono(telefono);

  if (!conductor) {
    // Número desconocido → inscripción automática
    console.log('[WHATSAPP] Número no registrado, iniciando inscripción:', telefono);
    sesion.tipo        = 'inscripcion';
    sesion.inscripcion = null;
    guardarCambios();
    return await flujoInscripcion.manejarInscripcion(req, res);
  }

  // Selección del menú principal
  if (mensaje === '1') {
    sesion.tipo   = 'preoperacional';
    sesion.estado = 'INICIO';
    guardarCambios();
    return await flujoPreoperacional.manejarPreoperacional(req, res);
  }

  if (mensaje === '2') {
    sesion.tipo   = 'posoperacional';
    sesion.estado = 'POSOP_INICIO';
    guardarCambios();
    return await flujoPosoperacional.manejarPosoperacional(req, res);
  }

  if (mensaje === '3') {
    sesion.tipo   = 'tanqueo';
    sesion.estado = 'TANQUEO_INICIO';
    guardarCambios();
    return await flujoTanqueo.manejarTanqueo(req, res);
  }

  // Opción no reconocida → mostrar menú
  return responderMenu(res);
}

// ============================================================================
// HELPERS
// ============================================================================

function responderMenu(res) {
  const menu =
    '🚗 *SISTEMA CERO*\n' +
    '_cero papel, cero accidentes_\n\n' +
    'Selecciona una opción:\n\n' +
    '1️⃣ Preoperacional (inicio de jornada)\n' +
    '2️⃣ Posoperacional (cierre de jornada)\n' +
    '3️⃣ Combustible / tanqueo\n\n' +
    'Escribe el número:';

  return responderTwiml(res, menu);
}

function responderRaiz(req, res) {
  res.send('CERO modular - Canal WhatsApp activo');
}

function responderError(res) {
  return responderTwiml(res, '❌ Ocurrió un error.\n\nEscribe *9* o *MENU* para reiniciar.');
}

function responderTwiml(res, mensaje) {
  res.set('Content-Type', 'text/xml');
  res.send(
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Response><Message>' + escaparXml(mensaje) + '</Message></Response>'
  );
}

function escaparXml(texto) {
  return String(texto || '')
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
