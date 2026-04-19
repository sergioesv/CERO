const alertasData = require('../data/alertas');
const preop = require('../modulos/inspecciones/preoperacional/validaciones');
const { supabase } = require('../config/config');
const { verificarToken, verificarPermiso } = require('../middlewares/auth');

function responderHealth(req, res) {
  res.json({
    ok: true,
    canal: 'dashboard',
    estado: 'base-lista',
    timestamp: new Date().toISOString(),
    modulos: {
      vehiculos: ['preoperacional', 'posoperacional', 'tanqueo'],
      seguridadCampo: ['ats', 'revision-equipos', 'riesgos-locativos'],
      alertas: true
    }
  });
}

function responderResumen(req, res) {
  res.json({
    ok: true,
    gruposPreoperacional: preop.GRUPOS.map((grupo) => ({
      id: grupo.id,
      nombre: grupo.nombre,
      items: grupo.items.length
    })),
    alertas: {
      tabla: alertasData.TABLA,
      pendienteImplementacion: true
    }
  });
}

function aplicarFiltroFecha(query, campo, fechaInicio, fechaFin) {
  let actual = query;
  if (fechaInicio) actual = actual.gte(campo, `${fechaInicio}T00:00:00`);
  if (fechaFin) actual = actual.lte(campo, `${fechaFin}T23:59:59`);
  return actual;
}

async function listarPosoperacionales(req, res) {
  try {
    const { fecha_inicio, fecha_fin, placa } = req.query;

    let query = supabase
      .from('posoperacionales')
      .select('*, activos:activo_id(placa, tipo_activo_id), conductores:conductor_id(nombre)')
      .order('created_at', { ascending: false })
      .limit(100);

    query = aplicarFiltroFecha(query, 'created_at', fecha_inicio, fecha_fin);
    if (placa) {
      // Filtrado por placa requiere join con activos
      query = query.eq('activos.placa', placa.toUpperCase());
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ ok: true, data: data || [] });
  } catch (err) {
    console.error('Error listando posoperacionales:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════
// SEDES
// ═══════════════════════════════════════════════════════════

// GET /api/sedes — lista todas las sedes
async function listarSedes(req, res) {
  try {
    const { data, error } = await supabase
      .from('sedes')
      .select('*, empresas(nombre)')
      .order('nombre');
    if (error) throw error;
    res.json({ ok: true, data: data });
  } catch (err) {
    console.error('Error listando sedes:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

// POST /api/sedes — crea una sede
async function crearSede(req, res) {
  try {
    const { nombre, ciudad, direccion, empresa_id } = req.body;
    if (!nombre) return res.status(400).json({ ok: false, error: 'Nombre requerido' });

    const { data, error } = await supabase
      .from('sedes')
      .insert([{ nombre, ciudad: ciudad || null, direccion: direccion || null, empresa_id: empresa_id || null, activa: true }])
      .select()
      .single();
    if (error) throw error;
    res.json({ ok: true, data: data });
  } catch (err) {
    console.error('Error creando sede:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

// PUT /api/sedes/:id — actualiza una sede
async function actualizarSede(req, res) {
  try {
    const campos = {};
    if (req.body.nombre    !== undefined) campos.nombre    = req.body.nombre;
    if (req.body.ciudad    !== undefined) campos.ciudad    = req.body.ciudad;
    if (req.body.direccion !== undefined) campos.direccion = req.body.direccion;
    if (req.body.empresa_id !== undefined) campos.empresa_id = req.body.empresa_id;

    const { data, error } = await supabase
      .from('sedes')
      .update(campos)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ ok: true, data: data });
  } catch (err) {
    console.error('Error actualizando sede:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

// PATCH /api/sedes/:id/estado — activa o desactiva una sede
async function cambiarEstadoSede(req, res) {
  try {
    const activa = req.body.activa;
    if (activa === undefined) return res.status(400).json({ ok: false, error: 'Campo activa requerido' });

    const { data, error } = await supabase
      .from('sedes')
      .update({ activa: activa })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ ok: true, data: data });
  } catch (err) {
    console.error('Error cambiando estado de sede:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

function registrarDashboard(app) {
  app.get('/dashboard', responderHealth);
  app.get('/dashboard/health', responderHealth);
  app.get('/dashboard/resumen', responderResumen);
  app.get('/api/posoperacionales',          verificarToken, listarPosoperacionales);

  // Sedes
  app.get('/api/sedes',              verificarToken, listarSedes);
  app.post('/api/sedes',             verificarToken, verificarPermiso('sedes', 'ver'), crearSede);
  app.put('/api/sedes/:id',          verificarToken, verificarPermiso('sedes', 'ver'), actualizarSede);
  app.patch('/api/sedes/:id/estado', verificarToken, cambiarEstadoSede);

}

module.exports = {
  registrarDashboard,
  responderHealth,
  responderResumen
};
