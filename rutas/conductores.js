// ═══════════════════════════════════════════════════════════
// API — CONDUCTORES
// ═══════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { supabase } = require('../config/config');
const { verificarToken, verificarPermiso } = require('../middlewares/auth');

// GET / — lista todos los conductores
router.get('/', verificarToken, verificarPermiso('conductores', 'ver'), async function (req, res) {
  try {
    const { data, error } = await supabase
      .from('conductores')
      .select('*')
      .order('nombre');

    if (error) throw error;
    res.json({ ok: true, data: data });
  } catch (error) {
    console.error('Error listando conductores:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// GET /:id — obtiene un conductor
router.get('/:id', verificarToken, verificarPermiso('conductores', 'ver'), async function (req, res) {
  try {
    const { data, error } = await supabase
      .from('conductores')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
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

    const conductor = {
      nombre: req.body.nombre,
      cedula: req.body.cedula,
      telefono: req.body.telefono || null,
      licencia_categoria: req.body.licencia_categoria || null,
      licencia_vencimiento: req.body.licencia_vencimiento || null,
      cargo: req.body.cargo || 'Conductor',
      activo: true
    };
    if (req.body.sede_id !== undefined) conductor.sede_id = req.body.sede_id || null;

    const { data, error } = await supabase
      .from('conductores')
      .insert([conductor])
      .select()
      .single();

    if (error) throw error;
    res.json({ ok: true, data: data });
  } catch (error) {
    console.error('Error creando conductor:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// PUT /:id — actualiza un conductor
router.put('/:id', verificarToken, verificarPermiso('conductores', 'editar'), async function (req, res) {
  try {
    const campos = {};
    if (req.body.nombre !== undefined) campos.nombre = req.body.nombre;
    if (req.body.cedula !== undefined) campos.cedula = req.body.cedula;
    if (req.body.telefono !== undefined) campos.telefono = req.body.telefono;
    if (req.body.licencia_categoria !== undefined) campos.licencia_categoria = req.body.licencia_categoria;
    if (req.body.licencia_vencimiento !== undefined) campos.licencia_vencimiento = req.body.licencia_vencimiento;
    if (req.body.cargo !== undefined) campos.cargo = req.body.cargo;
    if (req.body.activo !== undefined) campos.activo = req.body.activo;
    if (req.body.sede_id !== undefined) campos.sede_id = req.body.sede_id;

    const { data, error } = await supabase
      .from('conductores')
      .update(campos)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ ok: true, data: data });
  } catch (error) {
    console.error('Error actualizando conductor:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

module.exports = router;
