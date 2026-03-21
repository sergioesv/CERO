// ═══════════════════════════════════════════════════════════
// index.js
// Punto de entrada — Express, canales y cron de alertas
// CERO — Sistema de gestión de operaciones de campo
// ═══════════════════════════════════════════════════════════

const express = require('express');
const { registrarCanalWhatsapp } = require('./canales/whatsapp');
const { registrarDashboard } = require('./canales/dashboard');
const { registrarCronAlertas, ejecutarAlertasDiarias } = require('./modulos/alertas/notificador');

const app = express();
const PORT = process.env.PORT || 8080;

app.set('trust proxy', true);
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static('public'));

// Middleware global de errores
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(500).json({
    error: 'Error interno',
    timestamp: new Date().toISOString()
  });
});

// ═══════════════════════════════════════════════════════════
// CANALES
// ═══════════════════════════════════════════════════════════
registrarCanalWhatsapp(app);
registrarDashboard(app);

// ═══════════════════════════════════════════════════════════
// CRON DE ALERTAS — 6:00 AM Colombia
// ═══════════════════════════════════════════════════════════
registrarCronAlertas();

// ═══════════════════════════════════════════════════════════
// ENDPOINT DE PRUEBA — ejecutar alertas manualmente
// GET /alertas/ejecutar
// Usar para pruebas: curl https://cero-production.up.railway.app/alertas/ejecutar
// ═══════════════════════════════════════════════════════════
app.get('/alertas/ejecutar', async function (req, res) {
  try {
    var resultado = await ejecutarAlertasDiarias();
    res.json({
      ok: true,
      resultado: resultado,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ═══════════════════════════════════════════════════════════
// SERVIDOR
// ═══════════════════════════════════════════════════════════
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ CERO en puerto ${PORT}`);
  console.log(`✓ ${new Date().toISOString()}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Puerto ${PORT} ocupado`);
    process.exit(1);
  } else {
    console.error('❌ Error servidor:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', () => {
  console.log('⚠️ SIGTERM - cerrando...');
  server.close(() => {
    console.log('✓ Cerrado');
    process.exit(0);
  });
});
