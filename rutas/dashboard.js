// ═══════════════════════════════════════════════════════════
// rutas/dashboard.js
// Endpoints JSON del dashboard de seguridad operativa (v16)
// Protegidos solo con JWT; el alcance por sede viene del token
// ═══════════════════════════════════════════════════════════

'use strict';

const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middlewares/auth');
const dashboardData = require('../data/dashboard');

const PERIODOS = ['hoy', 'semana', 'mes'];
const TIPOS_ACTIVO = ['todos', 'vehiculo', 'escalera', 'taladro', 'arnes', 'epp'];

/**
 * GET /api/dashboard/general?periodo=hoy|semana|mes
 * KPIs gerenciales, índice resumido, anomalías y actividad reciente.
 */
router.get('/api/dashboard/general', verificarToken, async function (req, res) {
  try {
    var periodo = req.query.periodo;
    if (!PERIODOS.includes(periodo)) periodo = 'semana';

    var sedeIds = await dashboardData.resolverSedeIds(req.usuario);
    var payload = await dashboardData.obtenerDatosGeneral(sedeIds, periodo);
    res.json(payload);
  } catch (err) {
    console.error('GET /api/dashboard/general:', err);
    res.status(500).json({ error: err.message || 'Error interno' });
  }
});

/**
 * GET /api/dashboard/activos?periodo=...&tipo=vehiculo|...
 * Vista operativa: series, ítems recurrentes, activos críticos.
 */
router.get('/api/dashboard/activos', verificarToken, async function (req, res) {
  try {
    var periodo = req.query.periodo;
    if (!PERIODOS.includes(periodo)) periodo = 'semana';

    var tipo = (req.query.tipo || 'todos').toLowerCase();
    if (!TIPOS_ACTIVO.includes(tipo)) tipo = 'todos';

    var sedeIds = await dashboardData.resolverSedeIds(req.usuario);
    var payload = await dashboardData.obtenerDatosActivos(sedeIds, periodo, tipo);
    res.json(payload);
  } catch (err) {
    console.error('GET /api/dashboard/activos:', err);
    res.status(500).json({ error: err.message || 'Error interno' });
  }
});

/**
 * GET /api/dashboard/indice
 * Desglose del índice de seguridad operativa (últimos 30 días).
 */
router.get('/api/dashboard/indice', verificarToken, async function (req, res) {
  try {
    var sedeIds = await dashboardData.resolverSedeIds(req.usuario);
    var payload = await dashboardData.calcularIndiceSeguridadOperativa(sedeIds);
    res.json(payload);
  } catch (err) {
    console.error('GET /api/dashboard/indice:', err);
    res.status(500).json({ error: err.message || 'Error interno' });
  }
});

module.exports = router;
