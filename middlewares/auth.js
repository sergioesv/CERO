// middlewares/auth.js
// Middlewares de autenticacion y autorizacion para el panel web CERO
// Usa JWT para verificar identidad y Supabase para validar permisos por rol

const jwt = require('jsonwebtoken');
const { supabase, jwtSecret } = require('../config/config');

const verificarToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, jwtSecret);
    req.usuario = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalido o expirado' });
  }
};

const verificarPermiso = (modulo, accion) => {
  return async (req, res, next) => {
    const rolesUsuario = Array.isArray(req.usuario?.roles) ? req.usuario.roles : [];

    if (rolesUsuario.includes('superadmin_plataforma')) {
      return next();
    }

    if (rolesUsuario.length === 0) {
      return res.status(403).json({ error: 'Sin permiso para esta accion' });
    }

    try {
      const { data: rolesData, error: rolesError } = await supabase
        .from('roles')
        .select('id, nombre')
        .in('nombre', rolesUsuario);

      if (rolesError) throw rolesError;

      const rolesIds = (rolesData || []).map((rol) => rol.id);
      if (rolesIds.length === 0) {
        return res.status(403).json({ error: 'Sin permiso para esta accion' });
      }

      const { data: permisosData, error: permisosError } = await supabase
        .from('permisos_rol')
        .select('rol_id')
        .in('rol_id', rolesIds)
        .eq('modulo', modulo)
        .eq('accion', accion)
        .eq('permitido', true)
        .limit(1);

      if (permisosError) throw permisosError;

      if (!permisosData || permisosData.length === 0) {
        return res.status(403).json({ error: 'Sin permiso para esta accion' });
      }

      next();
    } catch (error) {
      console.error(`Error verificando permiso ${modulo}:${accion}:`, error);
      return res.status(500).json({ error: 'Error validando permisos' });
    }
  };
};

module.exports = { verificarToken, verificarPermiso };
