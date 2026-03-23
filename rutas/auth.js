// rutas/auth.js
// Endpoints de autenticación del panel web CERO
// POST /auth/login — valida credenciales y devuelve JWT
// GET  /auth/me    — devuelve datos del usuario autenticado

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { supabase, jwtSecret } = require('../config/config');
const { verificarToken } = require('../middlewares/auth');

// ═══════════════════════════════════════════════════════════
// POST /auth/login
// Recibe { email, password }, verifica contra usuarios_panel,
// consulta roles activos del usuario y devuelve un JWT de 8h.
// ═══════════════════════════════════════════════════════════
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y password requeridos' });
  }

  // Buscar usuario activo por email (siempre en minúsculas)
  const { data: usuario, error } = await supabase
    .from('usuarios_panel')
    .select('*')
    .eq('email', email.toLowerCase())
    .eq('activo', true)
    .single();

  // LOG TEMPORAL — diagnóstico
  console.log('Usuario encontrado:', usuario ? 'SI' : 'NO');
  console.log('Error Supabase:', error);
  if (usuario) {
    const valido = await bcrypt.compare(password, usuario.password_hash);
    console.log('Password válido:', valido);
    console.log('Hash en BD:', usuario.password_hash);
  }

  // No distinguir entre "usuario no existe" y "password incorrecto"
  // para evitar enumeración de usuarios
  if (error || !usuario) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  // Comparar password con el hash almacenado
  const valido = await bcrypt.compare(password, usuario.password_hash);
  if (!valido) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  // Obtener roles activos del usuario y las sedes asociadas
  const { data: rolesData } = await supabase
    .from('usuarios_roles')
    .select('roles(nombre), sede_id')
    .eq('usuario_id', usuario.id)
    .eq('activo', true);

  const roles = rolesData?.map(r => r.roles?.nombre).filter(Boolean) || [];
  const sedes = [...new Set(rolesData?.map(r => r.sede_id).filter(Boolean))];

  // Generar JWT con datos del usuario (expira en 8 horas)
  const token = jwt.sign(
    {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      empresa_id: usuario.empresa_id,
      roles,
      sedes
    },
    jwtSecret,
    { expiresIn: '8h' }
  );

  // Registrar fecha y hora del último acceso (sin bloquear la respuesta)
  await supabase
    .from('usuarios_panel')
    .update({ ultimo_acceso: new Date() })
    .eq('id', usuario.id);

  res.json({
    token,
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      roles,
      sedes
    }
  });
});

// ═══════════════════════════════════════════════════════════
// GET /auth/me
// Requiere JWT válido. Devuelve el payload del token (datos del usuario).
// Útil para que el frontend verifique sesión activa al cargar.
// ═══════════════════════════════════════════════════════════
router.get('/me', verificarToken, (req, res) => {
  res.json({ usuario: req.usuario });
});

module.exports = router;
