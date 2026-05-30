// ============================================================
// rutas/conductores.js
// HTTP — recibe, valida, delega a data/, responde.
// Sin queries directas a Supabase.
// ============================================================

'use strict';

const express = require('express');
const router = express.Router();
const { verificarToken, verificarPermiso } = require('../middlewares/auth');
const conductoresData = require('../data/conductores');

// GET / — lista todos los conductores
router.get('/', verificarToken, verificarPermiso('conductores', 'ver'), async function (req, res) {
  try {
    const data = await conductoresData.listarConductores();
    res.json({ ok: true, data: data });
  } catch (error) {
    console.error('Error listando conductores:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// GET /:id — obtiene un conductor por ID
router.get('/:id', verificarToken, verificarPermiso('conductores', 'ver'), async function (req, res) {
  try {
    const data = await conductoresData.obtenerConductorPorId(req.params.id);
    res.json({ ok: true, data: data });
  } catch (error) {
    console.error('Error obteniendo conductor:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// POST / — crea un conductor
router.post('/', verificarToken, verificarPermiso('conductores', 'crear'), async function (req, res) {
  try {
    if (!req.body.nombre || !req.body.cedula) {
      return res.status(400).json({ ok: false, error: 'Los campos nombre y cedula son obligatorios' });
    }
    const data = await conductoresData.crearConductor(req.body);
    res.json({ ok: true, data: data });
  } catch (error) {
    console.error('Error creando conductor:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// PUT /:id — actualiza un conductor
router.put('/:id', verificarToken, verificarPermiso('conductores', 'editar'), async function (req, res) {
  try {
    const CAMPOS_PERMITIDOS = [
      'nombre', 'cedula', 'telefono', 'licencia_categoria',
      'licencia_vencimiento', 'cargo', 'activo', 'sede_id'
    ];
    const campos = {};
    CAMPOS_PERMITIDOS.forEach(function(campo) {
      if (req.body[campo] !== undefined) campos[campo] = req.body[campo];
    });

    const data = await conductoresData.actualizarConductor(req.params.id, campos);
    res.json({ ok: true, data: data });
  } catch (error) {
    console.error('Error actualizando conductor:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

module.exports = router;
