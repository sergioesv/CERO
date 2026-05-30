// ============================================================
// rutas/auth.js
// Autenticacion del panel web CERO.
// Sin queries directas a Supabase — delega a data/usuarios.
// ============================================================

'use strict';

const express    = require('express');
const router     = express.Router();
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const rateLimit  = require('express-rate-limit');
const { jwtSecret } = require('../config/config');
const { verificarToken }   = require('../middlewares/auth');
const { validarPassword }  = require('../servicios/passwords');
const usuariosData = require('../data/usuarios');

// Hash dummy para evitar timing attacks cuando el email no existe.
const HASH_DUMMY = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8tD7jW9kCp5q5bOa3h5kKoWkvLrsW6';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Intente en 15 minutos.' }
});

// POST /auth/login
router.post('/login', loginLimiter, async function(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y password requeridos' });
  }

  const usuario = await usuariosData.obtenerUsuarioPorEmail(email.toLowerCase().trim());

  // Siempre ejecutar bcrypt.compare (con hash dummy si no existe usuario)
  const hashParaCompare = usuario ? usuario.password_hash : HASH_DUMMY;
  const valido = await bcrypt.compare(password, hashParaCompare);

  if (!usuario || !valido) {
    return res.status(401).json({ error: 'Credenciales invalidas' });
  }

  const rolesData = await usuariosData.obtenerRolesYSedes(usuario.id);
  const roles = (rolesData || []).map(function(r) { return r.roles && r.roles.nombre; }).filter(Boolean);
  const sedes = [...new Set((rolesData || []).map(function(r) { return r.sede_id; }).filter(Boolean))];

  const token = jwt.sign(
    {
      id:                    usuario.id,
      nombre:                usuario.nombre,
      email:                 usuario.email,
      empresa_id:            usuario.empresa_id,
      roles,
      sedes,
      debe_cambiar_password: !!usuario.debe_cambiar_password
    },
    jwtSecret,
    { expiresIn: '8h' }
  );

  usuariosData.actualizarUltimoAcceso(usuario.id); // no bloqueante

  res.json({
    token,
    usuario: {
      id:                    usuario.id,
      nombre:                usuario.nombre,
      email:                 usuario.email,
      empresa_id:            usuario.empresa_id,
      roles,
      sedes,
      debe_cambiar_password: !!usuario.debe_cambiar_password
    }
  });
});

// GET /auth/me
router.get('/me', verificarToken, function(req, res) {
  res.json({ usuario: req.usuario });
});

// POST /auth/cambiar-password
router.post('/cambiar-password', verificarToken, async function(req, res) {
  try {
    const { password_actual, password_nueva } = req.body;

    if (!password_actual || !password_nueva) {
      return res.status(400).json({ error: 'password_actual y password_nueva requeridos' });
    }
    if (password_actual === password_nueva) {
      return res.status(400).json({ error: 'La nueva contrasena debe ser diferente a la actual' });
    }

    const validacion = validarPassword(password_nueva);
    if (!validacion.valido) {
      return res.status(400).json({ error: validacion.error });
    }

    const usuario = await usuariosData.obtenerPasswordHash(req.usuario.id);
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    const valido = await bcrypt.compare(password_actual, usuario.password_hash);
    if (!valido) {
      return res.status(401).json({ error: 'Contrasena actual incorrecta' });
    }

    const password_hash = await bcrypt.hash(password_nueva, 10);
    await usuariosData.actualizarPassword(req.usuario.id, password_hash);

    res.json({ ok: true, mensaje: 'Contrasena actualizada. Debe volver a iniciar sesion.' });
  } catch (err) {
    console.error('Error en cambiar-password:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
