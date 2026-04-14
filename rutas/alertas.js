// ═══════════════════════════════════════════════════════════
// API — ALERTAS
// ═══════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { supabase } = require('../config/config');
const { verificarToken, verificarPermiso } = require('../middlewares/auth');
const autorizacionesData = require('../data/autorizaciones');

// GET /resumen — resumen de alertas activas
router.get('/resumen', verificarToken, verificarPermiso('alertas', 'ver'), async function (req, res) {
  try {
    const hoy = new Date().toISOString().split('T')[0];
    const en30dias = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data: vehiculos, error: errorV } = await supabase
      .from('vehiculos')
      .select('placa, soat_vencimiento, tecnomecanica_vencimiento, bloqueado')
      .or(`soat_vencimiento.lte.${en30dias},tecnomecanica_vencimiento.lte.${en30dias}`);

    if (errorV) throw errorV;

    const { data: conductores, error: errorC } = await supabase
      .from('conductores')
      .select('id, nombre, licencia_vencimiento')
      .lte('licencia_vencimiento', en30dias)
      .eq('activo', true);

    if (errorC) throw errorC;

    let criticas = 0;
    let urgentes = 0;
    let informativas = 0;

    (vehiculos || []).forEach(v => {
      [v.soat_vencimiento, v.tecnomecanica_vencimiento].forEach(fecha => {
        if (fecha) {
          const dias = Math.ceil((new Date(fecha) - new Date()) / (1000 * 60 * 60 * 24));
          if (dias <= 0) criticas++;
          else if (dias <= 7) criticas++;
          else if (dias <= 15) urgentes++;
          else if (dias <= 30) informativas++;
        }
      });
    });

    (conductores || []).forEach(c => {
      if (c.licencia_vencimiento) {
        const dias = Math.ceil((new Date(c.licencia_vencimiento) - new Date()) / (1000 * 60 * 60 * 24));
        if (dias <= 0) criticas++;
        else if (dias <= 7) criticas++;
        else if (dias <= 15) urgentes++;
        else if (dias <= 30) informativas++;
      }
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

// GET /documentos — estado de documentos por vehículo
router.get('/documentos', verificarToken, verificarPermiso('alertas', 'ver'), async function (req, res) {
  try {
    var datos = await autorizacionesData.obtenerDocumentosVehiculos();
    res.json({ ok: true, datos: datos });
  } catch (error) {
    console.error('Error en /api/alertas/documentos:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

module.exports = router;
