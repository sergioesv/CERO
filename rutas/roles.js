// ============================================================
// rutas/roles.js
// HTTP — catalogo de roles. Sin queries directas a Supabase.
// ============================================================

'use strict';

const express = require('express');
const router = express.Router();
const { verificarToken, verificarPermiso } = require('../middlewares/auth');
const permisosData = require('../data/permisos');

// GET /api/roles — catalogo de roles (excluye superadmin_plataforma)
router.get('/', verificarToken, verificarPermiso('usuarios', 'ver'), async function(req, res) {
  try {
    const data = await permisosData.listarRoles();
    res.json({ ok: true, data: data });
  } catch (err) {
    console.error('Error listando roles:', err);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

module.exports = router;
