// ═══════════════════════════════════════════════════════════
// index.js
// Punto de entrada — Express, canales y cron de alertas
// CERO — Sistema de gestión de operaciones de campo
// ═══════════════════════════════════════════════════════════

const express = require('express');
const helmet = require('helmet');
const { registrarCanalWhatsapp } = require('./canales/whatsapp');
const { registrarDashboard } = require('./canales/dashboard');
const { registrarCronAlertas } = require('./modulos/alertas/notificador');
const { verificarToken, verificarPermiso } = require('./middlewares/auth');
const { seedPermisosBase } = require('./data/permisos');

const app = express();
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcElem: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
}));
const PORT = process.env.PORT || 8080;

app.set('trust proxy', true);
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ═══════════════════════════════════════════════════════════
// RUTAS DE PÁGINAS
// ═══════════════════════════════════════════════════════════

// GET / → sirve la landing page pública
app.get('/', function (req, res) {
  res.sendFile(__dirname + '/public/landing.html');
});

// GET /login → sirve la página de login
app.get('/login', function (req, res) {
  res.sendFile(__dirname + '/public/login.html');
});

// GET /panel → sirve el panel (la verificación de token ocurre client-side)
app.get('/panel', function (req, res) {
  res.sendFile(__dirname + '/public/index.html');
});

app.use(express.static('public'));

// ═══════════════════════════════════════════════════════════
// RUTAS DE AUTENTICACIÓN
// ═══════════════════════════════════════════════════════════
const authRutas = require('./rutas/auth');
app.use('/auth', authRutas);

const rutasDashboard = require('./rutas/dashboard');
app.use(rutasDashboard);

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
// API — ENDPOINTS PARA EL PANEL DE ADMINISTRACIÓN
// ═══════════════════════════════════════════════════════════

const { supabase } = require('./config/config');

const rutasVehiculos = require('./rutas/vehiculos');
app.use('/api/vehiculos', rutasVehiculos);

const rutasConductores = require('./rutas/conductores');
app.use('/api/conductores', rutasConductores);

const rutasPreoperacionales = require('./rutas/preoperacionales');
app.use('/api/preoperacionales', rutasPreoperacionales);

const rutasAlertas = require('./rutas/alertas');
app.use('/api/alertas', rutasAlertas);

// ───────────────────────────────────────────────────────────
// DASHBOARD
// ───────────────────────────────────────────────────────────

// GET /api/dashboard/resumen — resumen general (consultas en paralelo)
app.get('/api/dashboard/resumen', verificarToken, verificarPermiso('dashboard', 'ver'), async function (req, res) {
  try {
    const hoy = new Date().toISOString().split('T')[0];

    // Ejecutar las 4 consultas independientes en paralelo
    const [
      { count: totalVehiculos, error: e1 },
      { count: bloqueados,     error: e2 },
      { count: conductoresActivos, error: e3 },
      { count: inspeccionesHoy,    error: e4 }
    ] = await Promise.all([
      supabase.from('vehiculos').select('*', { count: 'exact', head: true }),
      supabase.from('vehiculos').select('*', { count: 'exact', head: true }).eq('bloqueado', true),
      supabase.from('conductores').select('*', { count: 'exact', head: true }).eq('activo', true),
      supabase.from('preoperacionales').select('*', { count: 'exact', head: true }).gte('created_at', hoy)
    ]);

    // Si alguna consulta falló, lanzar error
    const errorDb = e1 || e2 || e3 || e4;
    if (errorDb) throw errorDb;

    res.json({
      ok: true,
      vehiculos: {
        total: totalVehiculos || 0,
        activos: (totalVehiculos || 0) - (bloqueados || 0),
        bloqueados: bloqueados || 0
      },
      conductores: conductoresActivos || 0,
      inspeccionesHoy: inspeccionesHoy || 0
    });
  } catch (error) {
    console.error('Error obteniendo resumen dashboard:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

const rutasAutorizaciones = require('./rutas/autorizaciones');
app.use('/api/autorizaciones', rutasAutorizaciones);

const rutasTanqueos = require('./rutas/tanqueos');
app.use('/api/tanqueos', rutasTanqueos);

// ═══════════════════════════════════════════════════════════
// MIDDLEWARE GLOBAL DE ERRORES — debe ir al final del stack
// ═══════════════════════════════════════════════════════════
app.use(function (err, req, res, next) {
  // Registrar error completo solo en servidor, nunca exponer al cliente
  console.error('❌ Error no controlado:', err);
  res.status(500).json({
    ok: false,
    error: 'Error interno del servidor',
    timestamp: new Date().toISOString()
  });
});

// ═══════════════════════════════════════════════════════════
// SERVIDOR
// ═══════════════════════════════════════════════════════════
seedPermisosBase().catch((error) => {
  console.error('Error sembrando permisos base:', error);
});

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
