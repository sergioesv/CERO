
var express = require('express');
var registrarCanalWhatsapp = require('./canales/whatsapp').registrarCanalWhatsapp;
var registrarDashboard = require('./canales/dashboard').registrarDashboard;

var app = express();
var PORT = process.env.PORT || 8080;

app.set('trust proxy', true);
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

registrarCanalWhatsapp(app);
registrarDashboard(app);

app.listen(PORT, '0.0.0.0', function() {
  console.log('CERO modular corriendo en puerto ' + PORT);
});
