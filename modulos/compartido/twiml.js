/**
 * twiml.js — Utilidades TwiML y validación Twilio compartidas.
 * Fuente única de verdad para responder mensajes WhatsApp y validar firma.
 * Usado por: baseFlujo, validaciones de cada módulo, canales/whatsapp, modulos/inscripcion.
 * CERO — Gestión de Operaciones de Campo
 */

'use strict';

var twilio = require('twilio');
var config = require('../../config/config');

/**
 * Escapa caracteres especiales XML para TwiML.
 * @param {string} texto
 * @returns {string}
 */
function escaparXml(texto) {
  return String(texto == null ? '' : texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Responde al webhook de Twilio con un mensaje TwiML.
 * @param {Object} res - Express response
 * @param {string} mensaje - Texto del mensaje
 */
function responderTwiml(res, mensaje) {
  res.set('Content-Type', 'text/xml');
  res.send(
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Response><Message>' + escaparXml(mensaje) + '</Message></Response>'
  );
}

/**
 * Obtiene la URL del webhook para validación de firma Twilio.
 * @param {Object} req - Express request
 * @returns {string}
 */
function obtenerUrlWebhook(req) {
  if (config.TWILIO_WEBHOOK_URL) return config.TWILIO_WEBHOOK_URL;
  var proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  var host = req.headers['x-forwarded-host'] || req.get('host') || '';
  return proto + '://' + host + req.originalUrl;
}

/**
 * Valida la firma de Twilio en el request.
 * En desarrollo local se puede desactivar con DISABLE_TWILIO_SIGNATURE_VALIDATION=true.
 * En producción NUNCA se permite desactivar.
 * @param {Object} req - Express request
 * @returns {boolean}
 */
function firmaTwilioValida(req) {
  var esDesarrollo = process.env.NODE_ENV !== 'production';

  if (esDesarrollo && String(process.env.DISABLE_TWILIO_SIGNATURE_VALIDATION || '').toLowerCase() === 'true') {
    return true;
  }

  if (!esDesarrollo && String(process.env.DISABLE_TWILIO_SIGNATURE_VALIDATION || '').toLowerCase() === 'true') {
    console.warn('⚠️ Validación de firma desactivada en producción — bloqueado');
    return false;
  }

  if (!config.TWILIO_AUTH_TOKEN) {
    console.warn('TWILIO_AUTH_TOKEN no configurado; se omite validación de firma.');
    return true;
  }

  var signature = req.headers['x-twilio-signature'];
  if (!signature) return false;

  try {
    return twilio.validateRequest(
      config.TWILIO_AUTH_TOKEN,
      signature,
      obtenerUrlWebhook(req),
      req.body || {}
    );
  } catch (e) {
    console.error('Error validando firma Twilio:', e.message);
    return false;
  }
}

module.exports = {
  escaparXml: escaparXml,
  responderTwiml: responderTwiml,
  firmaTwilioValida: firmaTwilioValida
};
