// ============================================================
// rutas/preoperacionales.js
// HTTP — lista e inspecciones. Sin SQL directo.
// ============================================================

'use strict';

const express  = require('express');
const router   = express.Router();
const { verificarToken, verificarPermiso } = require('../middlewares/auth');
const inspeccionesData = require('../data/inspecciones');
const activosData      = require('../data/activos');

// GET / — lista con filtros
router.get('/', verificarToken, verificarPermiso('preoperacionales', 'ver'), async function(req, res) {
  try {
    var desde     = req.query.desde    || null;
    var hasta     = req.query.hasta    || null;
    var placa     = req.query.placa    || null;
    var conductor = req.query.conductor || null;
    var estado    = req.query.estado   || null;

    var activoId = null;
    if (placa) {
      activoId = await activosData.obtenerActivoIdPorPlaca(placa.toUpperCase());
      if (!activoId) {
        return res.json({ data: [], stats: { total: 0, hoy: 0, con_novedades_hoy: 0, criticas_hoy: 0 } });
      }
    }

    var registros = await inspeccionesData.listarPreoperacionales({
      desde,
      hasta,
      activoId,
      conductorId: conductor,
      estado
    });

    if (!estado || estado === 'todos') {
      registros = registros.slice(0, 100);
    }

    var data = registros.map(function(registro) {
      var novedades = registro.novedades || [];
      var activo    = registro.activos   || {};
      return {
        id:                 registro.id,
        fecha:              registro.fecha,
        hora:               registro.hora,
        created_at:         registro.created_at,
        activo_id:          registro.activo_id,
        activos:            activo.id ? { id: activo.id, placa: activo.placa || null, nombre: activo.nombre || null, codigo: activo.codigo || null } : null,
        conductor_id:       registro.conductor_id,
        conductor_nombre:   registro.conductores ? registro.conductores.nombre : null,
        conductor_cedula:   registro.conductores ? registro.conductores.cedula : null,
        kilometraje:        registro.kilometraje,
        horometro:          registro.horometro || null,
        km_referencia:      registro.km_referencia,
        diferencia_km:      registro.diferencia_km,
        novedades:          novedades,
        total_novedades:    novedades.length,
        novedades_criticas: novedades.filter(function(n) { return n.critico === true || n.severidad === 'bloqueo'; }).length,
        clasificacion:      registro.clasificacion || 'sin_novedades',
        observaciones:      registro.observaciones,
        respuestas:         registro.respuestas || {},
        firma_operario:     registro.firma_operario,
        firma_timestamp:    registro.firma_timestamp,
        estado:             registro.estado,
        pdf_url:            registro.pdf_url || null
      };
    });

    var hoy = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' })).toISOString().split('T')[0];
    var todosHoy = registros.filter(function(r) { return r.fecha === hoy; });

    res.json({
      data:  data,
      stats: {
        total:              data.length,
        hoy:                todosHoy.length,
        con_novedades_hoy:  todosHoy.filter(function(r) { return (r.novedades || []).length > 0; }).length,
        criticas_hoy:       todosHoy.filter(function(r) { return (r.novedades || []).some(function(n) { return n.critico === true; }); }).length
      }
    });
  } catch (error) {
    console.error('Error en GET /api/preoperacionales:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /:id — detalle completo
router.get('/:id', verificarToken, verificarPermiso('preoperacionales', 'ver'), async function(req, res) {
  try {
    var registro = await inspeccionesData.obtenerPreoperacionalDetalle(req.params.id);
    if (!registro) return res.status(404).json({ error: 'Preoperacional no encontrado' });
    res.json(registro);
  } catch (error) {
    console.error('Error en GET /api/preoperacionales/:id:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
