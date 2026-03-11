const express = require('express');
const { registrarWebhook } = require('./webhook');

const app = express();
const PORT = process.env.PORT || 8080;

app.set('trust proxy', true);
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

registrarWebhook(app);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`CERO v3 corriendo en puerto ${PORT}`);
}).on('error', (err) => {
  console.error('Error al iniciar servidor:', err);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('Error no capturado:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Promesa rechazada:', reason);
});
