// rutas/auth.js
// Endpoints de autenticacion del panel web CERO
// POST /auth/login — valida credenciales y devuelve JWT
// GET /auth/me — devuelve datos del usuario autenticado
// POST /auth/cambiar-password — usuario cambia su propia password

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { supabase, jwtSecret } = require('../config/config');
const { verificarToken } = require('../middlewares/auth');
const { validarPassword } = require('../servicios/passwords');

// Hash dummy usado cuando el email no existe, para evitar timing attacks.
// Corresponde a bcrypt de una cadena aleatoria — nunca matchea una password real.
const HASH_DUMMY = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8tD7jW9kCp5q5bOa3h5kKoWkvLrsW6';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Intente en 15 minutos.' }
});

// ═══════════════════════════════════════════════════════════
// POST /auth/login
// ═══════════════════════════════════════════════════════════
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y password requeridos' });
  }

  // maybeSingle evita error si no existe — mejor que single
  const { data: usuario } = await supabase
    .from('usuarios_panel')
    .select('*')
    .ilike('email', email.toLowerCase().trim())
    .eq('activo', true)
    .maybeSingle();

  // Siempre ejecutar bcrypt.compare (con hash dummy si no existe usuario)
  // para evitar timing attack de enumeracion de emails
  const hashParaCompare = usuario ? usuario.password_hash : HASH_DUMMY;
  const valido = await bcrypt.compare(password, hashParaCompare);

  if (!usuario || !valido) {
    return res.status(401).json({ error: 'Credenciales invalidas' });
  }

  // Cargar roles y sedes
  const { data: rolesData } = await supabase
    .from('usuarios_roles')
    .select('roles(nombre), sede_id')
    .eq('usuario_id', usuario.id)
    .eq('activo', true);

  const roles = (rolesData || []).map(r => r.roles?.nombre).filter(Boolean);
  const sedes = [...new Set((rolesData || []).map(r => r.sede_id).filter(Boolean))];

  const token = jwt.sign(
    {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      empresa_id: usuario.empresa_id,
      roles,
      sedes,
      debe_cambiar_password: !!usuario.debe_cambiar_password
    },
    jwtSecret,
    { expiresIn: '8h' }
  );

  // Actualizar ultimo_acceso (no bloqueante para la respuesta)
  supabase
    .from('usuarios_panel')
    .update({ ultimo_acceso: new Date() })
    .eq('id', usuario.id)
    .then(() => {}, (err) => console.error('Error actualizando ultimo_acceso:', err));

  res.json({
    token,
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      empresa_id: usuario.empresa_id,
      roles,
      sedes,
      debe_cambiar_password: !!usuario.debe_cambiar_password
    }
  });
});

// ═══════════════════════════════════════════════════════════
// GET /auth/me — datos del usuario autenticado
// ═══════════════════════════════════════════════════════════
router.get('/me', verificarToken, (req, res) => {
  res.json({ usuario: req.usuario });
});

// ═══════════════════════════════════════════════════════════
// POST /auth/cambiar-password — usuario cambia su propia password
// Requiere password actual + nueva
// Al exito, limpia flag debe_cambiar_password
// ═══════════════════════════════════════════════════════════
router.post('/cambiar-password', verificarToken, async (req, res) => {
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

    // Traer hash actual
    const { data: usuario, error: errUsu } = await supabase
      .from('usuarios_panel')
      .select('id, password_hash')
      .eq('id', req.usuario.id)
      .maybeSingle();
    if (errUsu) throw errUsu;
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    // Verificar password actual
    const valido = await bcrypt.compare(password_actual, usuario.password_hash);
    if (!valido) {
      return res.status(401).json({ error: 'Contrasena actual incorrecta' });
    }

    // Hash nueva + actualizar + limpiar flag
    const password_hash = await bcrypt.hash(password_nueva, 10);
    const { error: errUpd } = await supabase
      .from('usuarios_panel')
      .update({
        password_hash,
        debe_cambiar_password: false,
        actualizado_en: new Date()
      })
      .eq('id', usuario.id);
    if (errUpd) throw errUpd;

    res.json({ ok: true, mensaje: 'Contrasena actualizada. Debe volver a iniciar sesion.' });
  } catch (err) {
    console.error('Error en cambiar-password:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
