// ═══════════════════════════════════════════════════════════
// API — TANQUEOS
// ═══════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { verificarToken, verificarPermiso } = require('../middlewares/auth');
const tanqueosData = require('../data/tanqueos');

// GET / — lista con filtros y stats
router.get('/', verificarToken, verificarPermiso('tanqueos', 'ver'), async function (req, res) {
  try {
    var filtros = {
      fecha_inicio:      req.query.fecha_inicio      || null,
      fecha_fin:         req.query.fecha_fin         || null,
      placa:             req.query.placa             || null,
      conductor_id:      req.query.conductor_id      || null,
      estado_validacion: req.query.estado_validacion || null,
      tipo_tanqueo:      req.query.tipo_tanqueo      || null
    };
    var resultado = await tanqueosData.listarTanqueos(filtros);
    if (resultado.error) throw resultado.error;
    res.json({ ok: true, data: resultado.data, stats: resultado.stats });
  } catch (error) {
    console.error('Error en GET /api/tanqueos:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// GET /consolidado — resumen mensual agrupado por vehículo (antes de /:id)
router.get('/consolidado', verificarToken, verificarPermiso('tanqueos', 'ver'), async function (req, res) {
  try {
    var mes    = req.query.mes    || new Date().toISOString().substring(0, 7);
    var sedeId = req.query.sede_id || null;
    var resultado = await tanqueosData.obtenerConsolidado(mes, sedeId);
    if (resultado.error) return res.status(400).json({ ok: false, error: resultado.error });
    res.json({ ok: true, resumen: resultado.resumen, porVehiculo: resultado.porVehiculo });
  } catch (error) {
    console.error('Error en GET /api/tanqueos/consolidado:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// GET /consolidado/exportar — CSV descargable del mes
router.get('/consolidado/exportar', verificarToken, verificarPermiso('tanqueos', 'ver'), async function (req, res) {
  try {
    var mes    = req.query.mes    || new Date().toISOString().substring(0, 7);
    var sedeId = req.query.sede_id || null;
    var resultado = await tanqueosData.obtenerConsolidado(mes, sedeId);
    if (resultado.error) return res.status(400).json({ ok: false, error: resultado.error });

    var detalle = resultado.detalle || [];
    var cabecera = [
      'fecha', 'placa', 'conductor', 'tipo_tanqueo', 'tipo_combustible',
      'cantidad', 'unidad_medida', 'valor_total', 'precio_unitario',
      'kilometraje', 'factura_numero', 'estacion_servicio', 'estado_validacion'
    ].join(',');

    var filas = detalle.map(function (t) {
      return [
        (t.created_at || '').substring(0, 10),
        t.vehiculo_placa || '',
        t.conductores ? (t.conductores.nombre || '') : '',
        t.tipo_tanqueo || 'convenio',
        t.tipo_combustible || '',
        t.cantidad || '',
        t.unidad_medida || '',
        t.valor_total || '',
        t.precio_unitario || '',
        t.kilometraje || '',
        '"' + (t.factura_numero || '') + '"',
        '"' + (t.estacion_servicio || '') + '"',
        t.estado_validacion || ''
      ].join(',');
    });

    var csv = [cabecera].concat(filas).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="tanqueos-' + mes + '.csv"');
    res.send('\uFEFF' + csv);
  } catch (error) {
    console.error('Error en GET /api/tanqueos/consolidado/exportar:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// PUT /validar-lote — antes de /:id para no capturar "validar-lote" como id
router.put('/validar-lote', verificarToken, verificarPermiso('tanqueos', 'editar'), async function (req, res) {
  try {
    var ids       = req.body.ids;
    var usuarioId = req.usuario ? (req.usuario.email || req.usuario.id || 'panel') : 'panel';

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ ok: false, error: 'ids debe ser un array no vacío' });
    }

    var resultado = await tanqueosData.validarLote(ids, usuarioId);
    if (!resultado.ok) return res.status(400).json({ ok: false, error: resultado.error });
    res.json({ ok: true, procesados: resultado.procesados });
  } catch (error) {
    console.error('Error en PUT /api/tanqueos/validar-lote:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// GET /:id — detalle completo con fotos y signed URLs
router.get('/:id', verificarToken, verificarPermiso('tanqueos', 'ver'), async function (req, res) {
  try {
    var resultado = await tanqueosData.obtenerTanqueo(req.params.id);
    if (resultado.error) return res.status(404).json({ ok: false, error: 'Tanqueo no encontrado' });
    res.json({ ok: true, data: resultado.data });
  } catch (error) {
    console.error('Error en GET /api/tanqueos/:id:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// PUT /:id/validar — validar o rechazar individualmente
router.put('/:id/validar', verificarToken, verificarPermiso('tanqueos', 'editar'), async function (req, res) {
  try {
    var decision       = req.body.decision;
    var motivoRechazo  = req.body.motivo_rechazo || '';
    var usuarioId      = req.usuario ? (req.usuario.email || req.usuario.id || 'panel') : 'panel';

    if (!['validar', 'rechazar'].includes(decision)) {
      return res.status(400).json({ ok: false, error: 'decision debe ser "validar" o "rechazar"' });
    }

    var resultado = await tanqueosData.validarTanqueo(req.params.id, decision, motivoRechazo, usuarioId);
    if (!resultado.ok) return res.status(400).json({ ok: false, error: resultado.error });
    res.json({ ok: true, mensaje: 'Tanqueo ' + (decision === 'validar' ? 'validado' : 'rechazado') });
  } catch (error) {
    console.error('Error en PUT /api/tanqueos/:id/validar:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

module.exports = router;
