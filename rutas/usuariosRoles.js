// rutas/usuariosRoles.js
// Endpoint separado para /api/usuarios_roles/:id (eliminar asignacion de rol)
// Se separa para mantener URL compatible con el frontend existente

const express = require('express');
const router = express.Router();
const { supabase } = require('../config/config');
const { verificarToken, verificarPermiso } = require('../middlewares/auth');

// ═══════════════════════════════════════════════════════════
// DELETE /api/usuarios_roles/:id — elimina asignacion de rol
// Requiere permiso de editar usuarios
// ═══════════════════════════════════════════════════════════
router.delete('/:id', verificarToken, verificarPermiso('usuarios', 'editar'), async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener la asignacion para validar scope
    const { data: asignacion } = await supabase
      .from('usuarios_roles')
      .select('id, usuario_id, usuarios_panel(empresa_id)')
      .eq('id', id)
      .maybeSingle();
    if (!asignacion) return res.status(404).json({ ok: false, error: 'Asignacion no encontrada' });

    const empresaTarget = asignacion.usuarios_panel?.empresa_id;
    const esSuperadminPlat = (req.usuario.roles || []).includes('superadmin_plataforma');
    if (!esSuperadminPlat && empresaTarget !== req.usuario.empresa_id) {
      return res.status(403).json({ ok: false, error: 'Sin permiso sobre esta asignacion' });
    }

    const { error } = await supabase
      .from('usuarios_roles')
      .delete()
      .eq('id', id);
    if (error) throw error;

    res.json({ ok: true });
  } catch (err) {
    console.error('Error eliminando asignacion de rol:', err);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

module.exports = router;
