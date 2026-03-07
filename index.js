const express = require('express');
const webhook = require('./webhook');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.urlencoded({ extended: false }));

app.post('/webhook', webhook);

app.get('/', (req, res) => {
  res.send('CERO v2 activo');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`CERO v2 corriendo en puerto ${PORT}`);
}).on('error', (err) => {
  console.error('Error al iniciar servidor:', err);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('Error no capturado:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Promesa rechazada:', reason);
});
