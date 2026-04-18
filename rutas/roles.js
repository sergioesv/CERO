// rutas/roles.js
// Endpoints de catalogo de roles y gestion de asignaciones
// DELETE de asignaciones se hace aqui porque su permiso es 'editar usuarios'

const express = require('express');
const router = express.Router();
const { supabase } = require('../config/config');
const { verificarToken, verificarPermiso } = require('../middlewares/auth');

// ═══════════════════════════════════════════════════════════
// GET /api/roles — catalogo de roles disponibles
// Oculta superadmin_plataforma — no se puede asignar desde UI
// ═══════════════════════════════════════════════════════════
router.get('/', verificarToken, verificarPermiso('usuarios', 'ver'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('roles')
      .select('id, nombre, empresa_id')
      .order('nombre');
    if (error) throw error;

    // superadmin_plataforma nunca se asigna desde la UI
    const catalogo = (data || []).filter(r => r.nombre !== 'superadmin_plataforma');

    res.json({ ok: true, data: catalogo });
  } catch (err) {
    console.error('Error listando roles:', err);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

module.exports = router;
