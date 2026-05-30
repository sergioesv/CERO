// ============================================================
// rutas/usuarios.js
// HTTP — gestion de usuarios del panel. Sin SQL directo.
// ============================================================

'use strict';

const express    = require('express');
const router     = express.Router();
const bcrypt     = require('bcryptjs');
const { verificarToken, verificarPermiso } = require('../middlewares/auth');
const { generarPasswordTemporal } = require('../servicios/passwords');
const usuariosData = require('../data/usuarios');

function esSuperadminPlataforma(usuario) {
  return (usuario.roles || []).includes('superadmin_plataforma');
}
function empresaPermitida(usuario, empresaIdTarget) {
  if (esSuperadminPlataforma(usuario)) return true;
  return empresaIdTarget === usuario.empresa_id;
}

// GET /api/usuarios
router.get('/', verificarToken, verificarPermiso('usuarios', 'ver'), async function(req, res) {
  try {
    const empresaFiltro = esSuperadminPlataforma(req.usuario) ? null : req.usuario.empresa_id;
    const data = await usuariosData.listarUsuariosConRoles(empresaFiltro);
    res.json({ ok: true, data });
  } catch (err) {
    console.error('Error listando usuarios:', err);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// POST /api/usuarios
router.post('/', verificarToken, verificarPermiso('usuarios', 'crear'), async function(req, res) {
  try {
    const { nombre, email, empresa_id, telefono } = req.body;

    if (!nombre || typeof nombre !== 'string' || nombre.trim().length < 2)
      return res.status(400).json({ ok: false, error: 'Nombre requerido (minimo 2 caracteres)' });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ ok: false, error: 'Email invalido' });
    if (!empresa_id)
      return res.status(400).json({ ok: false, error: 'empresa_id requerido' });
    if (!empresaPermitida(req.usuario, empresa_id))
      return res.status(403).json({ ok: false, error: 'Sin permiso para crear usuarios en esta empresa' });

    const empresaExiste = await usuariosData.existeEmpresa(empresa_id);
    if (!empresaExiste)
      return res.status(400).json({ ok: false, error: 'Empresa no encontrada' });

    const emailLower = email.toLowerCase().trim();
    const emailTomado = await usuariosData.existeEmail(emailLower);
    if (emailTomado)
      return res.status(409).json({ ok: false, error: 'Ya existe un usuario con ese email' });

    const passwordTemporal = generarPasswordTemporal(12);
    const password_hash = await bcrypt.hash(passwordTemporal, 10);

    const data = await usuariosData.crearUsuario({
      nombre:                nombre.trim(),
      email:                 emailLower,
      password_hash,
      empresa_id,
      telefono:              telefono ? String(telefono).trim() : null,
      activo:                true,
      debe_cambiar_password: true,
      creado_por:            req.usuario.id
    });

    res.json({
      ok: true,
      data,
      password_temporal: passwordTemporal,
      aviso: 'Entregue esta contrasena al usuario. Se mostrara UNA sola vez.'
    });
  } catch (err) {
    console.error('Error creando usuario:', err);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// PUT /api/usuarios/:id
router.put('/:id', verificarToken, verificarPermiso('usuarios', 'editar'), async function(req, res) {
  try {
    const objetivo = await usuariosData.obtenerScopeUsuario(req.params.id);
    if (!objetivo) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    if (!empresaPermitida(req.usuario, objetivo.empresa_id))
      return res.status(403).json({ ok: false, error: 'Sin permiso para editar este usuario' });

    const campos = { actualizado_en: new Date() };
    if (req.body.nombre !== undefined) {
      if (typeof req.body.nombre !== 'string' || req.body.nombre.trim().length < 2)
        return res.status(400).json({ ok: false, error: 'Nombre invalido' });
      campos.nombre = req.body.nombre.trim();
    }
    if (req.body.email !== undefined) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email))
        return res.status(400).json({ ok: false, error: 'Email invalido' });
      campos.email = req.body.email.toLowerCase().trim();
    }
    if (req.body.telefono !== undefined)
      campos.telefono = req.body.telefono ? String(req.body.telefono).trim() : null;

    const data = await usuariosData.actualizarUsuario(req.params.id, campos);
    res.json({ ok: true, data });
  } catch (err) {
    console.error('Error actualizando usuario:', err);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// PATCH /api/usuarios/:id/estado
router.patch('/:id/estado', verificarToken, verificarPermiso('usuarios', 'editar'), async function(req, res) {
  try {
    const { activo } = req.body;
    if (typeof activo !== 'boolean')
      return res.status(400).json({ ok: false, error: 'Campo activo (boolean) requerido' });
    if (req.params.id === req.usuario.id && activo === false)
      return res.status(400).json({ ok: false, error: 'No puede desactivar su propio usuario' });

    const objetivo = await usuariosData.obtenerScopeUsuario(req.params.id);
    if (!objetivo) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    if (!empresaPermitida(req.usuario, objetivo.empresa_id))
      return res.status(403).json({ ok: false, error: 'Sin permiso sobre este usuario' });

    const data = await usuariosData.actualizarEstadoUsuario(req.params.id, activo);
    res.json({ ok: true, data });
  } catch (err) {
    console.error('Error cambiando estado usuario:', err);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// PATCH /api/usuarios/:id/password
router.patch('/:id/password', verificarToken, verificarPermiso('usuarios', 'editar'), async function(req, res) {
  try {
    const objetivo = await usuariosData.obtenerScopeUsuario(req.params.id);
    if (!objetivo) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    if (!empresaPermitida(req.usuario, objetivo.empresa_id))
      return res.status(403).json({ ok: false, error: 'Sin permiso sobre este usuario' });

    const passwordTemporal = generarPasswordTemporal(12);
    const password_hash = await bcrypt.hash(passwordTemporal, 10);
    await usuariosData.resetearPassword(req.params.id, password_hash);

    res.json({
      ok: true,
      password_temporal: passwordTemporal,
      aviso: 'Nueva contrasena generada. El usuario debera cambiarla en su proximo ingreso.'
    });
  } catch (err) {
    console.error('Error reseteando password:', err);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// GET /api/usuarios/:id/roles
router.get('/:id/roles', verificarToken, verificarPermiso('usuarios', 'ver'), async function(req, res) {
  try {
    const data = await usuariosData.listarRolesDeUsuario(req.params.id);
    res.json({ ok: true, data });
  } catch (err) {
    console.error('Error listando roles del usuario:', err);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// POST /api/usuarios/:id/roles
router.post('/:id/roles', verificarToken, verificarPermiso('usuarios', 'editar'), async function(req, res) {
  try {
    const { rol_id, sede_id } = req.body;
    if (!rol_id) return res.status(400).json({ ok: false, error: 'rol_id requerido' });

    const objetivo = await usuariosData.obtenerScopeUsuario(req.params.id);
    if (!objetivo) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    if (!empresaPermitida(req.usuario, objetivo.empresa_id))
      return res.status(403).json({ ok: false, error: 'Sin permiso sobre este usuario' });

    const rol = await usuariosData.obtenerRolPorId(rol_id);
    if (!rol) return res.status(400).json({ ok: false, error: 'Rol no encontrado' });
    if (rol.nombre === 'superadmin_plataforma')
      return res.status(403).json({ ok: false, error: 'No se puede asignar rol superadmin_plataforma desde el panel' });

    const data = await usuariosData.asignarRol(req.params.id, rol_id, sede_id);
    res.json({ ok: true, data });
  } catch (err) {
    console.error('Error asignando rol:', err);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

module.exports = router;
