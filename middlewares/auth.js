// middlewares/auth.js
// Middlewares de autenticacion y autorizacion para el panel web CERO

const jwt = require('jsonwebtoken');
const { supabase, jwtSecret } = require('../config/config');
const { classifyRoleName, getAllowedCanonicalRolesForItem } = require('../data/permisos');

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
    try {
      console.log('verificarPermiso - usuario:', req.usuario?.id, 'roles:', req.usuario?.roles);
      console.log('verificarPermiso - modulo:', modulo, 'accion:', accion);

      const { data, error } = await supabase
        .from('usuarios_roles')
        .select('roles(nombre)')
        .eq('usuario_id', req.usuario?.id)
        .eq('activo', true);

      console.log('verificarPermiso - data:', JSON.stringify(data));
      console.log('verificarPermiso - error:', error);

      if (error) {
        throw error;
      }

      const rolesFuente = (data || []).map((item) => item.roles?.nombre).filter(Boolean);
      const rolesCanonicos = [...new Set(rolesFuente.map(classifyRoleName).filter(Boolean))];
      const permitidos = getAllowedCanonicalRolesForItem(modulo, accion);

      if (rolesCanonicos.some((rol) => permitidos.includes(rol))) {
        req.usuario.rolesCanonicos = rolesCanonicos;
        return next();
      }

      return res.status(403).json({ error: 'Sin permiso para esta accion' });
    } catch (error) {
      console.error(`Error verificando permiso ${modulo}:${accion}:`, error);
      return res.status(500).json({ error: 'Error validando permisos' });
    }
  };
};

module.exports = { verificarToken, verificarPermiso };
