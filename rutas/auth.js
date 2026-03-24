// rutas/auth.js
// Endpoints de autenticacion del panel web CERO
// POST /auth/login valida credenciales y devuelve JWT
// GET /auth/me devuelve datos del usuario autenticado

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { supabase, jwtSecret } = require('../config/config');
const { verificarToken } = require('../middlewares/auth');

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y password requeridos' });
  }

  const { data: usuario, error } = await supabase
    .from('usuarios_panel')
    .select('*')
    .eq('email', email.toLowerCase())
    .eq('activo', true)
    .single();

  if (error || !usuario) {
    return res.status(401).json({ error: 'Credenciales invalidas' });
  }

  const valido = await bcrypt.compare(password, usuario.password_hash);
  if (!valido) {
    return res.status(401).json({ error: 'Credenciales invalidas' });
  }

  const { data: rolesData } = await supabase
    .from('usuarios_roles')
    .select('roles(nombre), sede_id')
    .eq('usuario_id', usuario.id)
    .eq('activo', true);

  const roles = rolesData?.map(r => r.roles?.nombre).filter(Boolean) || [];
  const sedes = [...new Set(rolesData?.map(r => r.sede_id).filter(Boolean))];

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

router.get('/me', verificarToken, (req, res) => {
  res.json({ usuario: req.usuario });
});

module.exports = router;
