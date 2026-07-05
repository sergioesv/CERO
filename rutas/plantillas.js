// ============================================================
// rutas/plantillas.js
// API plantillas de inspeccion. Sin SQL directo.
// ============================================================

'use strict';

const express = require('express');
const router  = express.Router();
const { verificarToken, verificarPermiso } = require('../middlewares/auth');
const plantillasService = require('../servicios/plantillas');
const plantillasData    = require('../data/plantillas');
const tenantScope       = require('../servicios/tenantScope');

const conScope = tenantScope.middleware();

function responderErrorTenant(res, error) {
  if (error && (error.status === 403 || error.status === 404)) {
    res.status(error.status).json({ ok: false, error: error.message });
    return true;
  }
  return false;
}

// GET / — listar plantillas
router.get('/', verificarToken, conScope, verificarPermiso('plantillas', 'ver'), async function(req, res) {
  try {
    const data = await plantillasData.listarPlantillas(req.scope);
    const resultado = data.map(function(p) {
      return {
        id:              p.id,
        nombre:          p.nombre,
        tipo_activo:     p.tipos_activo ? p.tipos_activo.nombre : 'General',
        tipo_activo_id:  p.tipo_activo_id,
        tipo_inspeccion: p.tipo_inspeccion,
        estado:          p.activa ? 'activa' : 'inactiva',
        version:         p.version,
        config:          p.config
      };
    });
    res.json({ ok: true, data: resultado });
  } catch (error) {
    console.error('Error listando plantillas:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// GET /:id — detalle con grupos e items
router.get('/:id', verificarToken, verificarPermiso('plantillas', 'ver'), async function(req, res) {
  try {
    const plantilla = await plantillasService.obtenerPorId(req.params.id);
    if (!plantilla) return res.status(404).json({ ok: false, error: 'Plantilla no encontrada' });
    res.json({ ok: true, data: plantilla });
  } catch (error) {
    console.error('Error obteniendo plantilla:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// POST / — crear plantilla
router.post('/', verificarToken, conScope, verificarPermiso('plantillas', 'crear'), async function(req, res) {
  try {
    const { nombre, tipo_activo, estado, tipo_inspeccion = 'preoperacional' } = req.body;

    var tipoActivoId = null;
    if (tipo_activo) {
      var tipo = await plantillasData.buscarTipoActivoPorNombreOCodigo(tipo_activo);
      tipoActivoId = tipo ? tipo.id : null;
    }

    const data = await plantillasData.crearPlantilla(req.scope, {
      nombre,
      tipo_activo_id:  tipoActivoId,
      tipo_inspeccion,
      activa:          estado === 'activa',
      version:         1,
      config:          req.body.config || {}
    });
    res.json({ ok: true, data });
  } catch (error) {
    console.error('Error creando plantilla:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// PUT /:id — actualizar cabecera
router.put('/:id', verificarToken, conScope, verificarPermiso('plantillas', 'editar'), async function(req, res) {
  try {
    const { nombre, estado, config } = req.body;
    const campos = {};
    if (nombre)            campos.nombre = nombre;
    if (estado !== undefined) campos.activa = (estado === 'activa');
    if (config)            campos.config = config;

    const data = await plantillasData.actualizarPlantilla(req.scope, req.params.id, campos);
    res.json({ ok: true, data });
  } catch (error) {
    if (responderErrorTenant(res, error)) return;
    console.error('Error actualizando plantilla:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// POST /:id/grupos
router.post('/:id/grupos', verificarToken, conScope, verificarPermiso('plantillas', 'editar'), async function(req, res) {
  try {
    const { nombre, orden, solo_panel = false } = req.body;
    const data = await plantillasData.crearGrupo(req.scope, {
      plantilla_id: req.params.id,
      nombre,
      orden:        orden || 0,
      solo_panel
    });
    res.json({ ok: true, data });
  } catch (error) {
    if (responderErrorTenant(res, error)) return;
    console.error('Error creando grupo:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// PUT /grupos/:id
router.put('/grupos/:id', verificarToken, conScope, verificarPermiso('plantillas', 'editar'), async function(req, res) {
  try {
    const { nombre, orden, solo_panel } = req.body;
    const campos = {};
    if (nombre !== undefined)     campos.nombre     = nombre;
    if (orden !== undefined)      campos.orden      = orden;
    if (solo_panel !== undefined) campos.solo_panel = solo_panel;

    const data = await plantillasData.actualizarGrupo(req.scope, req.params.id, campos);
    res.json({ ok: true, data });
  } catch (error) {
    if (responderErrorTenant(res, error)) return;
    console.error('Error actualizando grupo:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// DELETE /grupos/:id
router.delete('/grupos/:id', verificarToken, conScope, verificarPermiso('plantillas', 'editar'), async function(req, res) {
  try {
    await plantillasData.eliminarGrupo(req.scope, req.params.id);
    res.json({ ok: true, message: 'Grupo eliminado' });
  } catch (error) {
    if (responderErrorTenant(res, error)) return;
    console.error('Error eliminando grupo:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// POST /grupos/:id/items
router.post('/grupos/:id/items', verificarToken, conScope, verificarPermiso('plantillas', 'editar'), async function(req, res) {
  try {
    const { nombre, orden, critico = false, sin_foto = false } = req.body;
    const data = await plantillasData.crearItem(req.scope, {
      grupo_id: req.params.id,
      nombre,
      orden:    orden || 0,
      critico,
      sin_foto
    });
    res.json({ ok: true, data });
  } catch (error) {
    if (responderErrorTenant(res, error)) return;
    console.error('Error creando item:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// PUT /items/:id
router.put('/items/:id', verificarToken, conScope, verificarPermiso('plantillas', 'editar'), async function(req, res) {
  try {
    const { nombre, orden, critico, sin_foto } = req.body;
    const campos = {};
    if (nombre !== undefined)   campos.nombre   = nombre;
    if (orden !== undefined)    campos.orden    = orden;
    if (critico !== undefined)  campos.critico  = critico;
    if (sin_foto !== undefined) campos.sin_foto = sin_foto;

    const data = await plantillasData.actualizarItem(req.scope, req.params.id, campos);
    res.json({ ok: true, data });
  } catch (error) {
    if (responderErrorTenant(res, error)) return;
    console.error('Error actualizando item:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// DELETE /items/:id
router.delete('/items/:id', verificarToken, conScope, verificarPermiso('plantillas', 'editar'), async function(req, res) {
  try {
    await plantillasData.eliminarItem(req.scope, req.params.id);
    res.json({ ok: true, message: 'Item eliminado' });
  } catch (error) {
    if (responderErrorTenant(res, error)) return;
    console.error('Error eliminando item:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

module.exports = router;
