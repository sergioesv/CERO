// canales/whatsapp.js
// Enrutador principal para el canal de WhatsApp con menú de selección
// v2 — incluye detección automática de conductor no registrado y flujo de inscripción

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

    // ── Comando global MENU / INICIO: reinicia cualquier flujo activo ─────
    if (msgUpper === 'MENU' || msgUpper === 'INICIO') {
      await eliminarSesion(telefono);
      guardarCambios();
      return responderMenu(res);
    }

    // ── Enrutar según el tipo de flujo activo en sesión ───────────────────
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

    // ── Sin tipo activo → menú principal con verificación de registro ─────
    return await manejarMenuPrincipal(req, res, sesion, mensaje);

  } catch (error) {
    console.error('❌ Error en webhook WhatsApp:', error);
    return responderError(res);
  }
}

// ============================================================================
// MENÚ PRINCIPAL CON VERIFICACIÓN DE REGISTRO
// ============================================================================

/**
 * Antes de procesar cualquier opción verifica que el número esté registrado
 * como conductor activo. Si no lo está, inicia el flujo de inscripción.
 */
async function manejarMenuPrincipal(req, res, sesion, mensaje) {
  const telefono = req.body.From;
  const opcion   = mensaje.trim();

  // Verificar si el operario está registrado en el sistema
  const conductor = await vehiculosData.buscarConductorPorTelefono(telefono);

  if (!conductor) {
    // Número desconocido — iniciar inscripción automáticamente
    console.log('[WHATSAPP] Número no registrado, iniciando inscripción:', telefono);
    sesion.tipo        = 'inscripcion';
    sesion.inscripcion = null; // flujoInscripcion lo inicializa en el primer mensaje
    guardarCambios();
    return await flujoInscripcion.manejarInscripcion(req, res);
  }

  // Conductor registrado — procesar selección del menú
  if (opcion === '1') {
    sesion.tipo   = 'preoperacional';
    sesion.estado = 'INICIO';
    guardarCambios();
    return await flujoPreoperacional.manejarPreoperacional(req, res);
  }

  if (opcion === '2') {
    sesion.tipo   = 'posoperacional';
    sesion.estado = 'POSOP_INICIO';
    guardarCambios();
    return await flujoPosoperacional.manejarPosoperacional(req, res);
  }

  if (opcion === '3') {
    sesion.tipo   = 'tanqueo';
    sesion.estado = 'TANQUEO_INICIO';
    guardarCambios();
    return await flujoTanqueo.manejarTanqueo(req, res);
  }

  // Opción no reconocida — mostrar menú
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
  return responderTwiml(res, '❌ Ocurrió un error.\n\nEscribe MENU para reiniciar.');
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
