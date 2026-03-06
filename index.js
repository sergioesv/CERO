var express = require('express');
var webhook = require('./webhook');

var app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

webhook.registrarWebhook(app);

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log('CERO v2 corriendo en puerto ' + PORT);
});
