// ═══════════════════════════════════════════════════════════
// API — VEHÍCULOS
// ═══════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { supabase } = require('../config/config');
const { verificarToken, verificarPermiso } = require('../middlewares/auth');
const activosData = require('../data/activos');
const autorizacionesData = require('../data/autorizaciones');

// GET / — lista todos los vehículos
router.get('/', verificarToken, verificarPermiso('vehiculos', 'ver'), async function (req, res) {
  try {
    const { data, error } = await supabase
      .from('vehiculos')
      .select('*')
      .order('placa');

    if (error) throw error;
    res.json({ ok: true, data: data });
  } catch (error) {
    console.error('Error listando vehículos:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// POST / — crea un vehículo
router.post('/', verificarToken, verificarPermiso('vehiculos', 'crear'), async function (req, res) {
  try {
    if (!req.body.placa) {
      return res.status(400).json({ ok: false, error: 'El campo placa es obligatorio' });
    }

    const vehiculo = {
      placa: req.body.placa.toUpperCase(),
      tipo: req.body.tipo || null,
      marca: req.body.marca || null,
      modelo: req.body.modelo || null,
      año: req.body.año || null,
      kilometraje: req.body.kilometraje || 0,
      soat_vencimiento: req.body.soat_vencimiento || null,
      tecnomecanica_vencimiento: req.body.tecnomecanica_vencimiento || null,
      bloqueado: false,
      motivo_bloqueo: null
    };

    const { data, error } = await supabase
      .from('vehiculos')
      .insert([vehiculo])
      .select()
      .single();

    if (error) throw error;
    res.json({ ok: true, data: data });
  } catch (error) {
    console.error('Error creando vehículo:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// GET /:placa/historial — timeline completo del vehículo (antes de /:placa)
router.get('/:placa/historial', verificarToken, verificarPermiso('vehiculos', 'ver'), async function (req, res) {
  try {
    var resultado = await autorizacionesData.obtenerHistorialVehiculo(req.params.placa);
    res.json({ ok: true, vehiculo: resultado.vehiculo, historial: resultado.historial });
  } catch (error) {
    console.error('Error en /api/vehiculos/:placa/historial:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// GET /:placa — obtiene un vehículo
router.get('/:placa', verificarToken, verificarPermiso('vehiculos', 'ver'), async function (req, res) {
  try {
    const { data, error } = await supabase
      .from('vehiculos')
      .select('*')
      .eq('placa', req.params.placa.toUpperCase())
      .single();

    if (error) throw error;
    res.json({ ok: true, data: data });
  } catch (error) {
    console.error('Error obteniendo vehículo:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// PUT /:placa — actualiza un vehículo
router.put('/:placa', verificarToken, verificarPermiso('vehiculos', 'editar'), async function (req, res) {
  try {
    const placa = req.params.placa.toUpperCase();
    const campos = {};
    if (req.body.tipo !== undefined) campos.tipo = req.body.tipo;
    if (req.body.marca !== undefined) campos.marca = req.body.marca;
    if (req.body.modelo !== undefined) campos.modelo = req.body.modelo;
    if (req.body.año !== undefined) campos.año = req.body.año;
    if (req.body.anio !== undefined) campos.año = req.body.anio;
    if (req.body.kilometraje !== undefined) campos.kilometraje = req.body.kilometraje;
    if (req.body.soat_vencimiento !== undefined) campos.soat_vencimiento = req.body.soat_vencimiento;
    if (req.body.tecnomecanica_vencimiento !== undefined) campos.tecnomecanica_vencimiento = req.body.tecnomecanica_vencimiento;
    if (req.body.bloqueado !== undefined) campos.bloqueado = req.body.bloqueado;
    if (req.body.motivo_bloqueo !== undefined) campos.motivo_bloqueo = req.body.motivo_bloqueo;
    if (req.body.estado !== undefined) campos.estado = req.body.estado;

    const { data, error } = await supabase
      .from('vehiculos')
      .update(campos)
      .eq('placa', placa)
      .select()
      .single();

    if (error) throw error;

    if (req.body.estado !== undefined) {
      const usuarioId = req.usuario ? (req.usuario.id || req.usuario.email || 'panel') : 'panel';
      activosData.registrarCambioEstado(
        placa,
        req.body.estado,
        'Cambio manual desde panel de administración',
        'panel_admin',
        null,
        null,
        usuarioId
      ).catch(function (err) {
        console.error('❌ Error registrando historial desde panel:', err.message);
      });
    }

    res.json({ ok: true, data: data });
  } catch (error) {
    console.error('Error actualizando vehículo:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// POST /:placa/bloquear — bloquea un vehículo
router.post('/:placa/bloquear', verificarToken, verificarPermiso('vehiculos', 'editar'), async function (req, res) {
  try {
    const { data, error } = await supabase
      .from('vehiculos')
      .update({
        bloqueado: true,
        motivo_bloqueo: req.body.motivo || 'Bloqueado manualmente'
      })
      .eq('placa', req.params.placa.toUpperCase())
      .select()
      .single();

    if (error) throw error;

    activosData.registrarCambioEstado(
      req.params.placa.toUpperCase(), 'bloqueado',
      req.body.motivo || 'Bloqueado manualmente',
      'panel_admin', null, null, 'panel'
    ).catch(function (err) { console.error('❌ historial bloqueo:', err.message); });

    res.json({ ok: true, data: data });
  } catch (error) {
    console.error('Error bloqueando vehículo:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// POST /:placa/desbloquear — desbloquea un vehículo
router.post('/:placa/desbloquear', verificarToken, verificarPermiso('vehiculos', 'editar'), async function (req, res) {
  try {
    const { data, error } = await supabase
      .from('vehiculos')
      .update({
        bloqueado: false,
        motivo_bloqueo: null
      })
      .eq('placa', req.params.placa.toUpperCase())
      .select()
      .single();

    if (error) throw error;

    activosData.registrarCambioEstado(
      req.params.placa.toUpperCase(), 'operativo',
      'Desbloqueado desde panel',
      'panel_admin', null, null, 'panel'
    ).catch(function (err) { console.error('❌ historial desbloqueo:', err.message); });

    res.json({ ok: true, data: data });
  } catch (error) {
    console.error('Error desbloqueando vehículo:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// DELETE /:placa — elimina un vehículo (solo si no tiene historial)
router.delete('/:placa', verificarToken, verificarPermiso('vehiculos', 'eliminar'), async function (req, res) {
  try {
    const placa = req.params.placa.toUpperCase();

    const { count: preop } = await supabase
      .from('preoperacionales')
      .select('*', { count: 'exact', head: true })
      .eq('vehiculo_placa', placa);

    const { count: posop } = await supabase
      .from('posoperacionales')
      .select('*', { count: 'exact', head: true })
      .eq('vehiculo_placa', placa);

    const { count: tanq } = await supabase
      .from('tanqueos')
      .select('*', { count: 'exact', head: true })
      .eq('vehiculo_placa', placa);

    const totalHistorial = (preop || 0) + (posop || 0) + (tanq || 0);

    if (totalHistorial > 0) {
      return res.status(400).json({
        ok: false,
        error: `No se puede eliminar. El vehículo tiene ${totalHistorial} registro(s) asociado(s). Use desactivar en su lugar.`
      });
    }

    const { error } = await supabase
      .from('vehiculos')
      .delete()
      .eq('placa', placa);

    if (error) throw error;
    res.json({ ok: true, message: 'Vehículo eliminado' });
  } catch (error) {
    console.error('Error eliminando vehículo:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

module.exports = router;
