// ═══════════════════════════════════════════════════════════
// API — AUTORIZACIONES
// ═══════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { verificarToken, verificarPermiso } = require('../middlewares/auth');
const autorizacionesData = require('../data/autorizaciones');
const tenantScope = require('../servicios/tenantScope');

const conScope = tenantScope.middleware();

// GET /pendientes — autorizaciones sin decisión
router.get('/pendientes', verificarToken, conScope, verificarPermiso('autorizaciones', 'ver'), async function (req, res) {
  try {
    var datos = await autorizacionesData.obtenerAutorizacionesPendientes(req.scope);
    res.json({ ok: true, datos: datos });
  } catch (error) {
    console.error('Error en /api/autorizaciones/pendientes:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// GET /resueltas — autorizaciones con decisión
router.get('/resueltas', verificarToken, conScope, verificarPermiso('autorizaciones', 'ver'), async function (req, res) {
  try {
    var datos = await autorizacionesData.obtenerAutorizacionesResueltas(req.scope);
    res.json({ ok: true, datos: datos });
  } catch (error) {
    console.error('Error en /api/autorizaciones/resueltas:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// PUT /:id/decidir — registrar decisión del supervisor
router.put('/:id/decidir', verificarToken, conScope, verificarPermiso('autorizaciones', 'editar'), async function (req, res) {
  try {
    var id = req.params.id;
    var decision = req.body.decision;
    var justificacion = (req.body.justificacion || '').trim();
    var supervisorId = req.body.supervisor_id;

    var decisiones = ['autorizar', 'taller', 'restringir'];
    if (!decisiones.includes(decision)) {
      return res.status(400).json({ ok: false, error: 'Decisión inválida. Use: autorizar, taller o restringir' });
    }

    if (decision === 'autorizar' && justificacion.length < 10) {
      return res.status(400).json({ ok: false, error: 'Justificación obligatoria (mín 10 caracteres) para autorizar' });
    }

    var resultado = await autorizacionesData.registrarDecision(req.scope, id, decision, justificacion, supervisorId);
    if (!resultado.ok) {
      return res.status(400).json(resultado);
    }

    res.json({ ok: true, mensaje: 'Decisión registrada' });
  } catch (error) {
    console.error('Error en PUT /api/autorizaciones/:id/decidir:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

module.exports = router;
