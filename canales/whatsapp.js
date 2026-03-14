var flujoPreoperacional = require('../modulos/vehiculos/preoperacional/flujo');

function responderRaiz(req, res) {
  res.send('CERO modular corriendo');
}

function registrarWebhookWhatsapp(app) {
  flujoPreoperacional.registrarPreoperacional(app);
}

function registrarCanalWhatsapp(app) {
  app.get('/', responderRaiz);
  registrarWebhookWhatsapp(app);
}

module.exports = {
  registrarCanalWhatsapp,
  registrarWebhookWhatsapp,
  responderRaiz
};
