// ============================================================
// rutas/conductores.js
// HTTP — recibe, valida, delega a data/, responde.
// Sin queries directas a Supabase.
// Multi-tenant: tenantScope.middleware() adjunta req.scope.
// ============================================================

'use strict';

const express = require('express');
const router = express.Router();
const { verificarToken, verificarPermiso } = require('../middlewares/auth');
const conductoresData = require('../data/conductores');
const tenantScope = require('../servicios/tenantScope');

const conScope = tenantScope.middleware();

function responderErrorTenant(res, error) {
  if (error && (error.status === 400 || error.status === 403 || error.status === 404)) {
    res.status(error.status).json({ ok: false, error: error.message });
    return true;
  }
  return false;
}

// GET / — lista los conductores del tenant
router.get('/', verificarToken, conScope, verificarPermiso('conductores', 'ver'), async function (req, res) {
  try {
    const data = await conductoresData.listarConductores(req.scope);
    res.json({ ok: true, data: data });
  } catch (error) {
    console.error('Error listando conductores:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// GET /:id — obtiene un conductor por ID (solo del tenant)
router.get('/:id', verificarToken, conScope, verificarPermiso('conductores', 'ver'), async function (req, res) {
  try {
    const data = await conductoresData.obtenerConductorPorId(req.scope, req.params.id);
    if (!data) return res.status(404).json({ ok: false, error: 'Conductor no encontrado' });
    res.json({ ok: true, data: data });
  } catch (error) {
    console.error('Error obteniendo conductor:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// POST / — crea un conductor (sede obligatoria, del tenant)
router.post('/', verificarToken, conScope, verificarPermiso('conductores', 'crear'), async function (req, res) {
  try {
    if (!req.body.nombre || !req.body.cedula) {
      return res.status(400).json({ ok: false, error: 'Los campos nombre y cedula son obligatorios' });
    }
    const data = await conductoresData.crearConductor(req.scope, req.body);
    res.json({ ok: true, data: data });
  } catch (error) {
    if (responderErrorTenant(res, error)) return;
    console.error('Error creando conductor:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// PUT /:id — actualiza un conductor (solo del tenant)
router.put('/:id', verificarToken, conScope, verificarPermiso('conductores', 'editar'), async function (req, res) {
  try {
    const CAMPOS_PERMITIDOS = [
      'nombre', 'cedula', 'telefono', 'licencia_categoria',
      'licencia_vencimiento', 'cargo', 'activo', 'sede_id'
    ];
    const campos = {};
    CAMPOS_PERMITIDOS.forEach(function(campo) {
      if (req.body[campo] !== undefined) campos[campo] = req.body[campo];
    });

    const data = await conductoresData.actualizarConductor(req.scope, req.params.id, campos);
    res.json({ ok: true, data: data });
  } catch (error) {
    if (responderErrorTenant(res, error)) return;
    console.error('Error actualizando conductor:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

module.exports = router;
