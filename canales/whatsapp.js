// canales/whatsapp.js
// Enrutador principal para el canal de WhatsApp.
// Navegación numérica unificada:
//   9 (o MENU / INICIO) → menú principal directo, sin mensaje intermedio
//   0 (o ATRAS)         → delega al módulo activo para retroceder un paso
//   CANCELAR            → alias de 9 (menú principal)

'use strict';

const twimlUtil = require('../modulos/inspecciones/compartido/twiml');

const { obtenerSesion, eliminarSesion, guardarCambios } = require('../servicios/sesiones');
const flujoPreoperacional = require('../modulos/inspecciones/preoperacional/flujo');
const flujoPosoperacional = require('../modulos/inspecciones/posoperacional/flujo');
const flujoTanqueo        = require('../modulos/tanqueo/flujo');
const flujoInscripcion    = require('../modulos/inscripcion/flujo');
const nav                 = require('../modulos/inspecciones/compartido/navegacion');
const activosData       = require('../data/activos');

// ============================================================================
// WEBHOOK PRINCIPAL
// ============================================================================

// Valida que el request proviene realmente de Twilio (delegada a módulo compartido)
function validarFirmaTwilio(req) {
  return twimlUtil.firmaTwilioValida(req);
}

async function webhookWhatsApp(req, res) {
  const telefono = req.body.From;
  const mensaje  = (req.body.Body || '').trim();
  const msgUpper = mensaje.toUpperCase();

  try {
    // Rechazar requests que no provienen de Twilio
    if (!validarFirmaTwilio(req)) {
      console.warn('⚠️ Firma Twilio inválida — request rechazado:', req.ip);
      return res.status(403).send('Forbidden');
    }

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
  const conductor = await activosData.buscarConductorPorTelefono(telefono);

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
  return twimlUtil.responderTwiml(res, nav.textoMenuPrincipal());
}

function responderError(res) {
  return twimlUtil.responderTwiml(res, '❌ Ocurrió un error.\n\nEscribe *9* o *MENU* para reiniciar.');
}

function registrarCanalWhatsapp(app) {
  app.post('/webhook', webhookWhatsApp);
  console.log('✓ Canal WhatsApp registrado con menú principal');
}

module.exports = {
  registrarCanalWhatsapp,
  webhookWhatsApp
};
