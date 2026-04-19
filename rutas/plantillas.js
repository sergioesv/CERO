// ═══════════════════════════════════════════════════════════
// rutas/plantillas.js
// API para la gestión de plantillas de inspección (v26)
// ═══════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { supabase } = require('../config/config');
const { verificarToken, verificarPermiso } = require('../middlewares/auth');
const plantillasService = require('../servicios/plantillas');

// GET / — listar plantillas
router.get('/', verificarToken, verificarPermiso('plantillas', 'ver'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('plantillas_inspeccion')
      .select(`
        *,
        tipos_activo (nombre, codigo)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const resultado = data.map(p => ({
      id: p.id,
      nombre: p.nombre,
      tipo_activo: p.tipos_activo ? p.tipos_activo.nombre : 'General',
      tipo_activo_id: p.tipo_activo_id,
      tipo_inspeccion: p.tipo_inspeccion,
      estado: p.activa ? 'activa' : 'inactiva',
      version: p.version,
      config: p.config
    }));

    res.json({ ok: true, data: resultado });
  } catch (error) {
    console.error('Error listando plantillas:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// GET /:id — obtener detalle de plantilla (incluye grupos e ítems)
router.get('/:id', verificarToken, verificarPermiso('plantillas', 'ver'), async (req, res) => {
  try {
    const plantilla = await plantillasService.obtenerPorId(req.params.id);
    if (!plantilla) {
      return res.status(404).json({ ok: false, error: 'Plantilla no encontrada' });
    }
    res.json({ ok: true, data: plantilla });
  } catch (error) {
    console.error('Error obteniendo plantilla:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// POST / — crear cabecera de plantilla
router.post('/', verificarToken, verificarPermiso('plantillas', 'crear'), async (req, res) => {
  try {
    const { nombre, tipo_activo, estado, tipo_inspeccion = 'preoperacional' } = req.body;
    
    // Buscar tipo_activo_id por nombre o código si se pasó el nombre
    let tipoActivoId = null;
    if (tipo_activo) {
      const { data: tipo } = await supabase
        .from('tipos_activo')
        .select('id')
        .or(`nombre.eq."${tipo_activo}",codigo.eq."${tipo_activo}"`)
        .single();
      tipoActivoId = tipo ? tipo.id : null;
    }

    const { data, error } = await supabase
      .from('plantillas_inspeccion')
      .insert([{
        nombre,
        tipo_activo_id: tipoActivoId,
        tipo_inspeccion,
        activa: estado === 'activa',
        version: 1,
        config: req.body.config || {}
      }])
      .select()
      .single();

    if (error) throw error;
    res.json({ ok: true, data });
  } catch (error) {
    console.error('Error creando plantilla:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// PUT /:id — actualizar cabecera
router.put('/:id', verificarToken, verificarPermiso('plantillas', 'editar'), async (req, res) => {
  try {
    const { nombre, tipo_activo, estado, config } = req.body;
    const update = {};
    if (nombre) update.nombre = nombre;
    if (estado !== undefined) update.activa = (estado === 'activa');
    if (config) update.config = config;

    const { data, error } = await supabase
      .from('plantillas_inspeccion')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ ok: true, data });
  } catch (error) {
    console.error('Error actualizando plantilla:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// ───────────────────────────────────────────────────────────
// GRUPOS
// ───────────────────────────────────────────────────────────

// POST /:id/grupos — añadir grupo
router.post('/:id/grupos', verificarToken, verificarPermiso('plantillas', 'editar'), async (req, res) => {
  try {
    const { nombre, orden, solo_panel = false } = req.body;
    const { data, error } = await supabase
      .from('plantilla_grupos')
      .insert([{
        plantilla_id: req.params.id,
        nombre,
        orden: orden || 0,
        solo_panel
      }])
      .select()
      .single();

    if (error) throw error;
    res.json({ ok: true, data });
  } catch (error) {
    console.error('Error creando grupo:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// PUT /grupos/:id — editar grupo
router.put('/grupos/:id', verificarToken, verificarPermiso('plantillas', 'editar'), async (req, res) => {
  try {
    const { nombre, orden, solo_panel } = req.body;
    const update = {};
    if (nombre) update.nombre = nombre;
    if (orden !== undefined) update.orden = orden;
    if (solo_panel !== undefined) update.solo_panel = solo_panel;

    const { data, error } = await supabase
      .from('plantilla_grupos')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ ok: true, data });
  } catch (error) {
    console.error('Error actualizando grupo:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// DELETE /grupos/:id — eliminar grupo
router.delete('/grupos/:id', verificarToken, verificarPermiso('plantillas', 'editar'), async (req, res) => {
  try {
    const { error } = await supabase
      .from('plantilla_grupos')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ ok: true, message: 'Grupo eliminado' });
  } catch (error) {
    console.error('Error eliminando grupo:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// ───────────────────────────────────────────────────────────
// ÍTEMS
// ───────────────────────────────────────────────────────────

// POST /grupos/:id/items — añadir ítem
router.post('/grupos/:id/items', verificarToken, verificarPermiso('plantillas', 'editar'), async (req, res) => {
  try {
    const { nombre, orden, critico = false, sin_foto = false } = req.body;
    const { data, error } = await supabase
      .from('plantilla_items')
      .insert([{
        grupo_id: req.params.id,
        nombre,
        orden: orden || 0,
        critico,
        sin_foto
      }])
      .select()
      .single();

    if (error) throw error;
    res.json({ ok: true, data });
  } catch (error) {
    console.error('Error creando ítem:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// PUT /items/:id — editar ítem
router.put('/items/:id', verificarToken, verificarPermiso('plantillas', 'editar'), async (req, res) => {
  try {
    const { nombre, orden, critico, sin_foto } = req.body;
    const update = {};
    if (nombre) update.nombre = nombre;
    if (orden !== undefined) update.orden = orden;
    if (critico !== undefined) update.critico = critico;
    if (sin_foto !== undefined) update.sin_foto = sin_foto;

    const { data, error } = await supabase
      .from('plantilla_items')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ ok: true, data });
  } catch (error) {
    console.error('Error actualizando ítem:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// DELETE /items/:id — eliminar ítem
router.delete('/items/:id', verificarToken, verificarPermiso('plantillas', 'editar'), async (req, res) => {
  try {
    const { error } = await supabase
      .from('plantilla_items')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ ok: true, message: 'Ítem eliminado' });
  } catch (error) {
    console.error('Error eliminando ítem:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

module.exports = router;
