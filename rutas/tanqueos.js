// ═══════════════════════════════════════════════════════════
// API — TANQUEOS
// ═══════════════════════════════════════════════════════════

const express = require('express');
const axios = require('axios');
const router = express.Router();
const { verificarToken, verificarPermiso } = require('../middlewares/auth');
const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = require('../config/config');
const tanqueosData = require('../data/tanqueos');
const tenantScope = require('../servicios/tenantScope');

function sanitizarCeldaCsv(valor) {
  var s = String(valor == null ? '' : valor);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

// <img> no puede enviar Authorization — aceptar token en query solo en esta ruta
function bearerDesdeQueryParaMedia(req, res, next) {
  var h = req.headers.authorization;
  if ((!h || !h.startsWith('Bearer ')) && req.query.token) {
    req.headers.authorization = 'Bearer ' + String(req.query.token);
  }
  next();
}

// Sede efectiva del consolidado: el query param se valida contra el scope
// del JWT — un query param NUNCA elige tenant. Usuario de una sola sede
// sin filtro explícito → su sede.
// TODO(multi-tenant PR2): obtenerConsolidado(scope, ...) filtrará por join a activos.
async function resolverSedeConsolidado(req) {
  var scope = await tenantScope.desdeUsuario(req.usuario);
  var sedeId = tenantScope.validarSedeSolicitada(scope, req.query.sede_id || null);
  if (!sedeId && !scope.esSistema && scope.sedeIds.length === 1) sedeId = scope.sedeIds[0];
  return sedeId;
}

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
    if (filtros.estado_validacion === 'todos') {
      filtros.estado_validacion = null;
    }
    var resultado = await tanqueosData.listarTanqueos(filtros);
    if (resultado.error) throw resultado.error;
    res.json({ ok: true, data: resultado.data, stats: resultado.stats });
  } catch (error) {
    console.error('Error en GET /api/tanqueos:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// GET /media/:fotoId — proxy seguro para imágenes Twilio Media
// El backend resuelve la URL desde BD — el cliente nunca controla qué URL se fetcha
router.get('/media/:fotoId', bearerDesdeQueryParaMedia, verificarToken, verificarPermiso('tanqueos', 'ver'), async function (req, res) {
  try {
    var fotoId = req.params.fotoId;

    if (!/^[0-9a-f-]{36}$/i.test(fotoId)) {
      return res.status(400).json({ ok: false, error: 'ID inválido' });
    }

    var fotoData = await tanqueosData.obtenerFotoEvidencia(fotoId);

    if (!fotoData) {
      return res.status(404).json({ ok: false, error: 'Foto no encontrada' });
    }

    var url = fotoData.foto_url;

    if (!url || !url.startsWith('https://api.twilio.com/')) {
      return res.status(400).json({ ok: false, error: 'Tipo de URL no soportado' });
    }

    var respuesta = await axios.get(url, {
      auth: {
        username: TWILIO_ACCOUNT_SID,
        password: TWILIO_AUTH_TOKEN
      },
      responseType: 'stream',
      timeout: 10000
    });

    res.setHeader('Content-Type', respuesta.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    respuesta.data.pipe(res);
  } catch (error) {
    console.error('Error proxy media Twilio:', error.message);
    res.status(502).json({ ok: false, error: 'No se pudo obtener la imagen' });
  }
});

// GET /consolidado — resumen mensual agrupado por vehículo (antes de /:id)
router.get('/consolidado', verificarToken, verificarPermiso('tanqueos', 'ver'), async function (req, res) {
  try {
    var mes = req.query.mes || new Date().toISOString().substring(0, 7);
    var sedeId;
    try {
      sedeId = await resolverSedeConsolidado(req);
    } catch (e) {
      return res.status(e.status || 403).json({ ok: false, error: e.message });
    }
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
    var mes = req.query.mes || new Date().toISOString().substring(0, 7);
    var sedeId;
    try {
      sedeId = await resolverSedeConsolidado(req);
    } catch (e) {
      return res.status(e.status || 403).json({ ok: false, error: e.message });
    }
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
        sanitizarCeldaCsv((t.created_at || '').substring(0, 10)),
        sanitizarCeldaCsv(t.vehiculo_placa),
        sanitizarCeldaCsv(t.conductores ? t.conductores.nombre : ''),
        sanitizarCeldaCsv(t.tipo_tanqueo || 'convenio'),
        sanitizarCeldaCsv(t.tipo_combustible),
        sanitizarCeldaCsv(t.cantidad),
        sanitizarCeldaCsv(t.unidad_medida),
        sanitizarCeldaCsv(t.valor_total),
        sanitizarCeldaCsv(t.precio_unitario),
        sanitizarCeldaCsv(t.kilometraje),
        sanitizarCeldaCsv(t.factura_numero),
        sanitizarCeldaCsv(t.estacion_servicio),
        sanitizarCeldaCsv(t.estado_validacion)
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

// PUT /:id/validar — marcar revisado individualmente
router.put('/:id/validar', verificarToken, verificarPermiso('tanqueos', 'editar'), async function (req, res) {
  try {
    var decision       = req.body.decision;
    var notasAdmin     = req.body.notas_admin || '';
    var usuarioId      = req.usuario ? (req.usuario.email || req.usuario.id || 'panel') : 'panel';

    if (decision !== 'validar') {
      return res.status(400).json({ ok: false, error: 'decision debe ser "validar"' });
    }

    var resultado = await tanqueosData.validarTanqueo(req.params.id, decision, notasAdmin, usuarioId);
    if (!resultado.ok) return res.status(400).json({ ok: false, error: resultado.error });
    res.json({ ok: true, mensaje: 'Tanqueo revisado' });
  } catch (error) {
    console.error('Error en PUT /api/tanqueos/:id/validar:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

module.exports = router;
