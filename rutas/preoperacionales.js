// ═══════════════════════════════════════════════════════════
// API — PREOPERACIONALES
// ═══════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { supabase } = require('../config/config');
const { verificarToken, verificarPermiso } = require('../middlewares/auth');

// GET / — Lista inspecciones con filtros
router.get('/', verificarToken, verificarPermiso('preoperacionales', 'ver'), async function (req, res) {
  try {
    var desde = req.query.desde || null;
    var hasta = req.query.hasta || null;
    var placa = req.query.placa || null;
    var conductor = req.query.conductor || null;
    var estado = req.query.estado || null;

    var query = supabase
      .from('preoperacionales')
      .select('*, activos:activo_id(id, placa, nombre, datos), conductores:conductor_id(id, nombre, cedula)')
      .order('fecha', { ascending: false })
      .order('hora', { ascending: false });

    if (desde) {
      query = query.gte('fecha', desde);
    }
    if (hasta) {
      query = query.lte('fecha', hasta);
    }

    // Si hay filtro de placa, resolver a activo_id
    if (placa) {
      var activosData = require('../data/activos');
      var activoId = await activosData.obtenerActivoIdPorPlaca(placa.toUpperCase());
      if (activoId) {
        query = query.eq('activo_id', activoId);
      } else {
        // Placa no existe, retornar vacío
        return res.json({ data: [], stats: { total: 0, hoy: 0, con_novedades_hoy: 0, criticas_hoy: 0 } });
      }
    }

    if (conductor) {
      query = query.eq('conductor_id', conductor);
    }

    if (estado && estado !== 'todos') {
      if (estado === 'con_novedades') {
        query = query.in('clasificacion', ['ALERTA', 'BLOQUEO']);
      } else if (estado === 'critico') {
        query = query.eq('clasificacion', 'BLOQUEO');
      } else {
        query = query.eq('clasificacion', estado);
      }
    }

    if (!estado || estado === 'todos') {
      query = query.limit(100);
    }

    var resultado = await query;

    if (resultado.error) {
      return res.status(500).json({ ok: false, error: 'Error interno del servidor' });
    }

    var data = (resultado.data || []).map(function (registro) {
      var novedades = registro.novedades || [];
      var totalNovedades = novedades.length;
      // Fix 1: contar criticos usando severidad real (no solo el flag critico)
      var novedadesCriticas = novedades.filter(function (n) { return n.critico === true || n.severidad === 'bloqueo'; }).length;
      var activo = registro.activos || {};

      return {
        id: registro.id,
        fecha: registro.fecha,
        hora: registro.hora,
        created_at: registro.created_at,
        activo_id: registro.activo_id,
        // Fix 1: incluir objeto activos completo para que el panel lea activos.placa y activos.nombre
        activos: activo.id ? {
          id: activo.id,
          placa: activo.placa || null,
          nombre: activo.nombre || null,
          codigo: activo.codigo || null
        } : null,
        conductor_id: registro.conductor_id,
        conductor_nombre: registro.conductores ? registro.conductores.nombre : null,
        conductor_cedula: registro.conductores ? registro.conductores.cedula : null,
        kilometraje: registro.kilometraje,
        horometro: registro.horometro || null,
        km_referencia: registro.km_referencia,
        diferencia_km: registro.diferencia_km,
        novedades: novedades,
        total_novedades: totalNovedades,
        novedades_criticas: novedadesCriticas,
        clasificacion: registro.clasificacion || 'sin_novedades',
        observaciones: registro.observaciones,
        respuestas: registro.respuestas || {},
        firma_operario: registro.firma_operario,
        firma_timestamp: registro.firma_timestamp,
        estado: registro.estado,
        pdf_url: registro.pdf_url || null
      };
    });

    // Fecha de hoy en zona horaria Colombia (UTC-5)
    var hoy = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' })).toISOString().split('T')[0];
    var todosHoy = (resultado.data || []).filter(function (r) { return r.fecha === hoy; });
    var stats = {
      total: data.length,
      hoy: todosHoy.length,
      con_novedades_hoy: todosHoy.filter(function (r) {
        var nov = r.novedades || [];
        return nov.length > 0;
      }).length,
      criticas_hoy: todosHoy.filter(function (r) {
        var nov = r.novedades || [];
        return nov.some(function (n) { return n.critico === true; });
      }).length
    };

    res.json({ data: data, stats: stats });
  } catch (error) {
    console.error('Error en GET /api/preoperacionales:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /:id — Detalle de una inspección
router.get('/:id', verificarToken, verificarPermiso('preoperacionales', 'ver'), async function (req, res) {
  try {
    var id = req.params.id;

    var resultado = await supabase
      .from('preoperacionales')
      .select('*, activos:activo_id(id, placa, nombre, datos, documentos), conductores:conductor_id(id, nombre, cedula, licencia_categoria, licencia_vencimiento)')
      .eq('id', id)
      .single();

    if (resultado.error) {
      return res.status(404).json({ error: 'Preoperacional no encontrado' });
    }

    var fotos = await supabase
      .from('evidencia')
      .select('*')
      .eq('entidad_tipo', 'preoperacional')
      .eq('entidad_id', id);

    var registro = resultado.data;
    registro.fotos = fotos.data || [];

    var resAut = await supabase
      .from('autorizaciones_novedad')
      .select('id, decision, justificacion, novedades_bloqueo, timestamp_alerta, timestamp_decision, supervisor_id')
      .eq('preoperacional_id', id)
      .limit(1);

    registro.autorizacion = (!resAut.error && resAut.data && resAut.data.length > 0)
      ? resAut.data[0]
      : null;

    res.json(registro);
  } catch (error) {
    console.error('Error en GET /api/preoperacionales/:id:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
