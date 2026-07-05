// ============================================================
// rutas/alertas.js
// HTTP — recibe, delega a data/, responde.
// Sin queries directas a Supabase.
// ============================================================

'use strict';

const express = require('express');
const router = express.Router();
const { verificarToken, verificarPermiso } = require('../middlewares/auth');
const alertasData = require('../data/alertas');
const autorizacionesData = require('../data/autorizaciones');
const tenantScope = require('../servicios/tenantScope');

const conScope = tenantScope.middleware();

// GET /resumen — resumen de alertas activas (criticas/urgentes/informativas)
router.get('/resumen', verificarToken, conScope, verificarPermiso('alertas', 'ver'), async function (req, res) {
  try {
    const [alertasActivos, alertasLicencias] = await Promise.all([
      alertasData.obtenerVencimientosActivos(req.scope),
      alertasData.obtenerVencimientosLicencias(req.scope)
    ]);

    let criticas = 0;
    let urgentes = 0;
    let informativas = 0;

    [...alertasActivos, ...alertasLicencias].forEach(function(a) {
      const dias = a.dias_restantes;
      if (dias <= 0)       criticas++;
      else if (dias <= 7)  criticas++;
      else if (dias <= 15) urgentes++;
      else                 informativas++;
    });

    res.json({
      ok: true,
      total: criticas + urgentes + informativas,
      criticas: criticas,
      urgentes: urgentes,
      informativas: informativas
    });
  } catch (error) {
    console.error('Error obteniendo resumen de alertas:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// GET /documentos — estado de documentos por vehiculo
router.get('/documentos', verificarToken, conScope, verificarPermiso('alertas', 'ver'), async function (req, res) {
  try {
    var datos = await autorizacionesData.obtenerDocumentosActivos(req.scope);
    res.json({ ok: true, datos: datos });
  } catch (error) {
    console.error('Error en /api/alertas/documentos:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

module.exports = router;
