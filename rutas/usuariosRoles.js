// ============================================================
// rutas/usuariosRoles.js
// DELETE /api/usuarios_roles/:id — elimina asignacion de rol.
// Sin queries directas a Supabase.
// ============================================================

'use strict';

const express = require('express');
const router = express.Router();
const { verificarToken, verificarPermiso } = require('../middlewares/auth');
const permisosData = require('../data/permisos');

router.delete('/:id', verificarToken, verificarPermiso('usuarios', 'editar'), async function(req, res) {
  try {
    const asignacion = await permisosData.obtenerAsignacionRol(req.params.id);
    if (!asignacion) {
      return res.status(404).json({ ok: false, error: 'Asignacion no encontrada' });
    }

    const empresaTarget = asignacion.usuarios_panel && asignacion.usuarios_panel.empresa_id;
    const esSuperadminPlat = (req.usuario.roles || []).includes('superadmin_plataforma');
    if (!esSuperadminPlat && empresaTarget !== req.usuario.empresa_id) {
      return res.status(403).json({ ok: false, error: 'Sin permiso sobre esta asignacion' });
    }

    await permisosData.eliminarAsignacionRol(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error eliminando asignacion de rol:', err);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

module.exports = router;
