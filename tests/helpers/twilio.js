'use strict';

/**
 * tests/helpers/twilio.js
 *
 * Fábrica de objetos `res` falsos que emulan la respuesta Express
 * utilizada por responder() en flujo.js.
 *
 * Captura:
 *   - res.set(header, value) → almacena en res._headers
 *   - res.send(body)         → almacena en res._body; marca res._sent = true
 *
 * Uso:
 *   const { crearResFalso } = require('../../helpers/twilio');
 *   const res = crearResFalso();
 *   // después de invocar el handler:
 *   expect(res._headers['Content-Type']).toBe('text/xml');
 *   expect(res._body).toContain('<Message>');
 */

function crearResFalso() {
  var res = {
    _headers: {},
    _body: null,
    _sent: false,

    set: function(header, value) {
      res._headers[header] = value;
    },

    send: function(body) {
      res._body = body;
      res._sent = true;
    }
  };
  return res;
}

/**
 * Fábrica de objeto `req` mínimo que imita Express para manejarInscripcion.
 * @param {string} from    - Número del remitente (ej: 'whatsapp:+573001234567')
 * @param {string} body    - Texto del mensaje enviado por el usuario
 */
function crearReqFalso(from, body) {
  return {
    body: {
      From: from || 'whatsapp:+573001234567',
      Body: body || ''
    }
  };
}

module.exports = {
  crearResFalso,
  crearReqFalso
};
