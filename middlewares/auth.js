// middlewares/auth.js
// Middlewares de autenticación y autorización para el panel web CERO
// Usa JWT para verificar identidad y Supabase para validar permisos por rol

const jwt = require('jsonwebtoken');
const { supabase, JWT_SECRET } = require('../config/config');

// ═══════════════════════════════════════════════════════════
// verificarToken
// Valida el JWT enviado en el header Authorization: Bearer <token>
// Si el token es válido, adjunta el payload decodificado a req.usuario
// y llama a next(). Si no, responde 401.
// ═══════════════════════════════════════════════════════════
const verificarToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  // El header debe existir y tener formato "Bearer <token>"
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // jwt.verify lanza excepción si el token es inválido o expiró
    const payload = jwt.verify(token, JWT_SECRET);
    req.usuario = payload; // { id, email, roles, ... }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
};

// ═══════════════════════════════════════════════════════════
// verificarPermiso
// Factory que retorna un middleware para validar un permiso específico.
// Uso: router.get('/ruta', verificarToken, verificarPermiso('vehiculos', 'leer'), handler)
//
// Parámetros:
//   modulo  — nombre del módulo (ej: 'vehiculos', 'conductores')
//   accion  — acción requerida (ej: 'leer', 'editar', 'autorizar')
//
// El rol 'superadmin_plataforma' tiene acceso irrestricto a todo.
// Para los demás roles, consulta la tabla usuarios_roles → permisos_rol
// para verificar que exista un permiso explícito permitido=true.
// ═══════════════════════════════════════════════════════════
const verificarPermiso = (modulo, accion) => {
  return async (req, res, next) => {
    // superadmin_plataforma pasa siempre, sin consultar la BD
    if (req.usuario.roles?.includes('superadmin_plataforma')) return next();

    // Consulta permisos del usuario para el módulo y acción dados
    const { data, error } = await supabase
      .from('usuarios_roles')
      .select('roles(nombre), permisos_rol!inner(modulo, accion, permitido)')
      .eq('usuario_id', req.usuario.id)
      .eq('activo', true)
      .eq('permisos_rol.modulo', modulo)
      .eq('permisos_rol.accion', accion)
      .eq('permisos_rol.permitido', true);

    if (error || !data || data.length === 0) {
      return res.status(403).json({ error: 'Sin permiso para esta acción' });
    }

    next();
  };
};

module.exports = { verificarToken, verificarPermiso };
