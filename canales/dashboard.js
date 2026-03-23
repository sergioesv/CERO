const alertasData = require('../data/alertas');
const preop = require('../modulos/vehiculos/preoperacional/validaciones');
const { supabase } = require('../config/config');
const { verificarToken } = require('../middlewares/auth');

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

  // Sedes
  app.get('/api/sedes',             verificarToken, listarSedes);
  app.post('/api/sedes',            verificarToken, crearSede);
  app.put('/api/sedes/:id',         verificarToken, actualizarSede);
  app.patch('/api/sedes/:id/estado', verificarToken, cambiarEstadoSede);
}

module.exports = {
  registrarDashboard,
  responderHealth,
  responderResumen
};
