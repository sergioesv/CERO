// middlewares/auth.js
// Middlewares de autenticacion y autorizacion para el panel web CERO

const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/config');
const { getAllowedCanonicalRolesForItem, getCanonicalRolesForUser } = require('../data/permisos');

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
      console.log('Rol usuario:', req.usuario?.roles);
      const rolesCanonicos = await getCanonicalRolesForUser(req.usuario?.id, req.usuario?.roles);
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
