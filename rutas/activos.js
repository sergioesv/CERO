// ═══════════════════════════════════════════════════════════
// API — ACTIVOS (antes: VEHÍCULOS)
// v26 — Todas las queries operan sobre la tabla activos
// ═══════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { supabase } = require('../config/config');
const { verificarToken, verificarPermiso } = require('../middlewares/auth');
const activosData = require('../data/activos');
const autorizacionesData = require('../data/autorizaciones');
const tenantScope = require('../servicios/tenantScope');

const conScope = tenantScope.middleware();

// GET / — lista todos los activos con placa (vehículos)
router.get('/', verificarToken, conScope, verificarPermiso('activos', 'ver'), async function (req, res) {
  try {
    const data = await activosData.listarActivos(req.scope);

    // Aplanar datos para compat con frontend
    var resultado = (data || []).map(function(a) {
      var datos = a.datos || {};
      var docs = a.documentos || {};
      return {
        id: a.id,
        placa: a.placa,
        tipo: datos.tipo_vehiculo || datos.tipo || null,
        marca: datos.marca || null,
        modelo: datos.modelo || null,
        año: datos.anio || null,
        kilometraje: a.kilometraje || 0,
        soat_vencimiento: docs.soat_vencimiento || null,
        tecnomecanica_vencimiento: docs.tecnomecanica_vencimiento || null,
        bloqueado: a.bloqueado || false,
        motivo_bloqueo: a.motivo_bloqueo || null,
        estado: a.estado || 'operativo',
        activo: a.activo !== false,
        sede_id: a.sede_id || null
      };
    });

    res.json({ ok: true, data: resultado });
  } catch (error) {
    console.error('Error listando activos:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// POST / — crea un activo (vehículo)
router.post('/', verificarToken, conScope, verificarPermiso('activos', 'crear'), async function (req, res) {
  try {
    if (!req.body.placa) {
      return res.status(400).json({ ok: false, error: 'El campo placa es obligatorio' });
    }

    var placa = req.body.placa.toUpperCase();
    var datos = {
      marca: req.body.marca || null,
      modelo: req.body.modelo || null,
      tipo_vehiculo: req.body.tipo || null,
      tipo: req.body.tipo || null,
      anio: req.body.año || req.body.anio || null,
      rendimiento_min: req.body.rendimiento_min || null,
      rendimiento_max: req.body.rendimiento_max || null,
      tipo_combustible: req.body.tipo_combustible || null,
      ciudad_base: req.body.ciudad_base || null
    };
    var documentos = {
      soat_vencimiento: req.body.soat_vencimiento || null,
      tecnomecanica_vencimiento: req.body.tecnomecanica_vencimiento || null
    };

    // Necesitamos tipo_activo_id y empresa_id para el insert
    // Buscar tipo_activo_id para 'vehiculo_liviano' por defecto
    var resTipo = await supabase
      .from('tipos_activo')
      .select('id')
      .eq('codigo', 'vehiculo_liviano')
      .single();
    var tipoActivoId = (resTipo.data && resTipo.data.id) || null;

    // empresa_id: SIEMPRE del JWT — nunca de la BD ni del body (multi-tenant).
    // Antes: .from('empresas').limit(1) asignaba el activo a la primera
    // empresa de la tabla — catastrófico con más de un cliente.
    var empresaId = (req.usuario && req.usuario.empresa_id) || null;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Usuario sin empresa asignada — no se puede crear el activo' });
    }

    // sede_id del body: debe pertenecer al alcance del usuario
    var sedeSolicitada = req.body.sede_id || null;
    if (sedeSolicitada) {
      try {
        tenantScope.validarSedeSolicitada(req.scope, sedeSolicitada);
      } catch (e) {
        return res.status(e.status || 403).json({ ok: false, error: e.message });
      }
    }

    if (!tipoActivoId) {
      return res.status(500).json({ ok: false, error: 'No se pudo resolver tipo_activo' });
    }

    var activo = {
      placa: placa,
      codigo: placa,
      nombre: (datos.marca || '') + ' ' + (datos.tipo_vehiculo || '') + ' ' + placa,
      tipo_activo_id: tipoActivoId,
      empresa_id: empresaId,
      sede_id: sedeSolicitada,
      datos: datos,
      documentos: documentos,
      kilometraje: req.body.kilometraje || 0,
      bloqueado: false,
      motivo_bloqueo: null,
      estado: 'operativo',
      activo: true
    };

    const { data, error } = await supabase
      .from('activos')
      .insert([activo])
      .select()
      .single();

    if (error) throw error;
    res.json({ ok: true, data: activosData.aplanarActivo(data) });
  } catch (error) {
    console.error('Error creando activo:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// GET /:placa/historial — timeline completo del activo (antes de /:placa)
router.get('/:placa/historial', verificarToken, conScope, verificarPermiso('activos', 'ver'), async function (req, res) {
  try {
    var resultado = await autorizacionesData.obtenerHistorialActivo(req.scope, req.params.placa);
    res.json({ ok: true, vehiculo: resultado.vehiculo, historial: resultado.historial });
  } catch (error) {
    console.error('Error en /api/activos/:placa/historial:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// GET /:placa — obtiene un activo por placa
router.get('/:placa', verificarToken, conScope, verificarPermiso('activos', 'ver'), async function (req, res) {
  try {
    var activoId = await tenantScope.resolverActivoPorPlaca(req.scope, req.params.placa);
    if (!activoId) return res.status(404).json({ ok: false, error: 'Activo no encontrado' });

    const { data, error } = await supabase
      .from('activos')
      .select('*')
      .eq('id', activoId)
      .single();

    if (error) throw error;
    res.json({ ok: true, data: activosData.aplanarActivo(data) });
  } catch (error) {
    console.error('Error obteniendo activo:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// PUT /:placa — actualiza un activo
router.put('/:placa', verificarToken, conScope, verificarPermiso('activos', 'editar'), async function (req, res) {
  try {
    const param = req.params.placa; // puede ser UUID o placa
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const esUuid = UUID_RE.test(param);

    // Verificar pertenencia al tenant (UUID) o resolver placa en scope
    var activoIdVerificado = esUuid
      ? ((await tenantScope.perteneceActivo(req.scope, param)) ? param : null)
      : await tenantScope.resolverActivoPorPlaca(req.scope, param);
    if (!activoIdVerificado) return res.status(404).json({ ok: false, error: 'Activo no encontrado' });

    // Obtener activo actual para merge de JSONB
    var resCurrent = await supabase
      .from('activos')
      .select('id, placa, datos, documentos')
      .eq('id', activoIdVerificado)
      .single();

    if (resCurrent.error) throw resCurrent.error;
    var activoId = resCurrent.data.id;
    var placa = resCurrent.data.placa;
    var datosActuales = resCurrent.data.datos || {};
    var docsActuales = resCurrent.data.documentos || {};

    // Campos directos
    var campos = {};
    if (req.body.bloqueado !== undefined) campos.bloqueado = req.body.bloqueado;
    if (req.body.motivo_bloqueo !== undefined) campos.motivo_bloqueo = req.body.motivo_bloqueo;
    if (req.body.estado !== undefined) campos.estado = req.body.estado;
    if (req.body.kilometraje !== undefined) campos.kilometraje = req.body.kilometraje;

    // Merge datos JSONB
    var datosNuevos = Object.assign({}, datosActuales);
    if (req.body.tipo !== undefined) { datosNuevos.tipo_vehiculo = req.body.tipo; datosNuevos.tipo = req.body.tipo; }
    if (req.body.marca !== undefined) datosNuevos.marca = req.body.marca;
    if (req.body.modelo !== undefined) datosNuevos.modelo = req.body.modelo;
    if (req.body.año !== undefined) datosNuevos.anio = req.body.año;
    if (req.body.anio !== undefined) datosNuevos.anio = req.body.anio;
    campos.datos = datosNuevos;

    // Merge documentos JSONB
    var docsNuevos = Object.assign({}, docsActuales);
    if (req.body.soat_vencimiento !== undefined) docsNuevos.soat_vencimiento = req.body.soat_vencimiento;
    if (req.body.tecnomecanica_vencimiento !== undefined) docsNuevos.tecnomecanica_vencimiento = req.body.tecnomecanica_vencimiento;
    campos.documentos = docsNuevos;

    campos.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('activos')
      .update(campos)
      .eq('placa', placa)
      .select()
      .single();

    if (error) throw error;

    if (req.body.estado !== undefined) {
      const usuarioId = req.usuario ? (req.usuario.id || req.usuario.email || 'panel') : 'panel';
      activosData.registrarCambioEstado(
        activoId,
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

    res.json({ ok: true, data: activosData.aplanarActivo(data) });
  } catch (error) {
    console.error('Error actualizando activo:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// POST /:placa/bloquear — bloquea un activo
router.post('/:placa/bloquear', verificarToken, conScope, verificarPermiso('activos', 'editar'), async function (req, res) {
  try {
    var placa = req.params.placa.toUpperCase();
    var activoId = await tenantScope.resolverActivoPorPlaca(req.scope, placa);
    if (!activoId) return res.status(404).json({ ok: false, error: 'Activo no encontrado' });

    const { data, error } = await supabase
      .from('activos')
      .update({
        bloqueado: true,
        motivo_bloqueo: req.body.motivo || 'Bloqueado manualmente',
        updated_at: new Date().toISOString()
      })
      .eq('id', activoId)
      .select()
      .single();

    if (error) throw error;

    activosData.registrarCambioEstado(
      activoId, 'bloqueado',
      req.body.motivo || 'Bloqueado manualmente',
      'panel_admin', null, null, 'panel'
    ).catch(function (err) { console.error('❌ historial bloqueo:', err.message); });

    res.json({ ok: true, data: activosData.aplanarActivo(data) });
  } catch (error) {
    console.error('Error bloqueando activo:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// POST /:placa/desbloquear — desbloquea un activo
router.post('/:placa/desbloquear', verificarToken, conScope, verificarPermiso('activos', 'editar'), async function (req, res) {
  try {
    var placa = req.params.placa.toUpperCase();
    var activoId = await tenantScope.resolverActivoPorPlaca(req.scope, placa);
    if (!activoId) return res.status(404).json({ ok: false, error: 'Activo no encontrado' });

    const { data, error } = await supabase
      .from('activos')
      .update({
        bloqueado: false,
        motivo_bloqueo: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', activoId)
      .select()
      .single();

    if (error) throw error;

    activosData.registrarCambioEstado(
      activoId, 'operativo',
      'Desbloqueado desde panel',
      'panel_admin', null, null, 'panel'
    ).catch(function (err) { console.error('❌ historial desbloqueo:', err.message); });

    res.json({ ok: true, data: activosData.aplanarActivo(data) });
  } catch (error) {
    console.error('Error desbloqueando activo:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// DELETE /:placa — elimina un activo (solo si no tiene historial)
router.delete('/:placa', verificarToken, conScope, verificarPermiso('activos', 'eliminar'), async function (req, res) {
  try {
    const placa = req.params.placa.toUpperCase();
    var activoId = await tenantScope.resolverActivoPorPlaca(req.scope, placa);
    if (!activoId) return res.status(404).json({ ok: false, error: 'Activo no encontrado' });

    const { count: preop } = await supabase
      .from('preoperacionales')
      .select('*', { count: 'exact', head: true })
      .eq('activo_id', activoId);

    const { count: posop } = await supabase
      .from('posoperacionales')
      .select('*', { count: 'exact', head: true })
      .eq('activo_id', activoId);

    const { count: tanq } = await supabase
      .from('tanqueos')
      .select('*', { count: 'exact', head: true })
      .eq('activo_id', activoId);

    const totalHistorial = (preop || 0) + (posop || 0) + (tanq || 0);

    if (totalHistorial > 0) {
      return res.status(400).json({
        ok: false,
        error: `No se puede eliminar. El activo tiene ${totalHistorial} registro(s) asociado(s). Use desactivar en su lugar.`
      });
    }

    const { error } = await supabase
      .from('activos')
      .delete()
      .eq('id', activoId);

    if (error) throw error;
    res.json({ ok: true, message: 'Activo eliminado' });
  } catch (error) {
    console.error('Error eliminando activo:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

module.exports = router;

