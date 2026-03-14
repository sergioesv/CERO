const express = require('express');
const { registrarCanalWhatsapp } = require('./canales/whatsapp');
const { registrarDashboard } = require('./canales/dashboard');

const app = express();
const PORT = process.env.PORT || 8080;

// Middlewares
app.set('trust proxy', true);
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Middleware global de manejo de errores
app.use((err, req, res, next) => {
  console.error('❌ Error no controlado:', err);
  res.status(500).json({
    error: 'Error interno del servidor',
    timestamp: new Date().toISOString()
  });
});

// Registro de canales
registrarCanalWhatsapp(app);
registrarDashboard(app);

// Inicio del servidor
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ CERO modular corriendo en puerto ${PORT}`);
  console.log(`✓ Timestamp: ${new Date().toISOString()}`);
});

// Manejo de errores de puerto en uso
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ ERROR: Puerto ${PORT} ya está en uso`);
    process.exit(1);
  } else {
    console.error('❌ Error al iniciar servidor:', error);
    process.exit(1);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('⚠️ SIGTERM recibido, cerrando servidor...');
  server.close(() => {
    console.log('✓ Servidor cerrado correctamente');
    process.exit(0);
  });
});
