const alertasData = require('../data/alertas');
const preop = require('../modulos/vehiculos/preoperacional/validaciones');
const bcrypt = require('bcryptjs');
const { supabase } = require('../config/config');
const { verificarToken, verificarPermiso } = require('../middlewares/auth');

const TABLA_FOTOS_TANQUEO = process.env.DB_TABLE_FOTOS_TANQUEO || 'fotos_tanqueo';

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
      .select('*, vehiculos:vehiculo_placa(tipo, marca), conductores:conductor_id(nombre)')
      .order('created_at', { ascending: false })
      .limit(100);

    query = aplicarFiltroFecha(query, 'created_at', fecha_inicio, fecha_fin);
    if (placa) query = query.eq('vehiculo_placa', placa.toUpperCase());

    const { data, error } = await query;
    if (error) throw error;

    res.json({ ok: true, data: data || [] });
  } catch (err) {
    console.error('Error listando posoperacionales:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

async function listarTanqueos(req, res) {
  try {
    const { fecha_inicio, fecha_fin, placa } = req.query;

    let query = supabase
      .from('tanqueos')
      .select('*, vehiculos:vehiculo_placa(tipo, marca), conductores:conductor_id(nombre)')
      .order('created_at', { ascending: false })
      .limit(100);

    query = aplicarFiltroFecha(query, 'created_at', fecha_inicio, fecha_fin);
    if (placa) query = query.eq('vehiculo_placa', placa.toUpperCase());

    const { data, error } = await query;
    if (error) throw error;

    const tanqueos = data || [];
    const ids = tanqueos.map(item => item.id).filter(Boolean);
    let fotosPorTanqueo = {};

    if (ids.length > 0) {
      const { data: fotos, error: fotosError } = await supabase
        .from(TABLA_FOTOS_TANQUEO)
        .select('tanqueo_id, foto_url, tipo, descripcion')
        .in('tanqueo_id', ids);

      if (fotosError) throw fotosError;

      fotosPorTanqueo = (fotos || []).reduce((acc, foto) => {
        if (!acc[foto.tanqueo_id]) acc[foto.tanqueo_id] = [];
        acc[foto.tanqueo_id].push(foto);
        return acc;
      }, {});
    }

    const dataConFotos = tanqueos.map((item) => ({
      ...item,
      fotos: fotosPorTanqueo[item.id] || [],
      foto_url: (fotosPorTanqueo[item.id] && fotosPorTanqueo[item.id][0] && fotosPorTanqueo[item.id][0].foto_url) || null
    }));

    res.json({ ok: true, data: dataConFotos });
  } catch (err) {
    console.error('Error listando tanqueos:', err);
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

// ═══════════════════════════════════════════════════════════
// USUARIOS
// ═══════════════════════════════════════════════════════════

// GET /api/usuarios
async function listarUsuarios(req, res) {
  try {
    const { data, error } = await supabase
      .from('usuarios_panel')
      .select('id, nombre, email, empresa_id, activo, ultimo_acceso, empresas(nombre), usuarios_roles!usuarios_roles_usuario_id_fkey(id, rol_id, sede_id, roles(nombre))')
      .order('nombre');
    if (error) throw error;
    res.json({ ok: true, data });
  } catch (err) {
    console.error('Error listando usuarios:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

// POST /api/usuarios
async function crearUsuario(req, res) {
  try {
    const { nombre, email, password, empresa_id } = req.body;
    if (!nombre)   return res.status(400).json({ ok: false, error: 'Nombre requerido' });
    if (!email)    return res.status(400).json({ ok: false, error: 'Email requerido' });
    if (!password) return res.status(400).json({ ok: false, error: 'Password requerido' });

    const password_hash = await bcrypt.hash(password, 10);

    const { data, error } = await supabase
      .from('usuarios_panel')
      .insert([{ nombre, email: email.toLowerCase(), password_hash, empresa_id: empresa_id || null, activo: true }])
      .select('id, nombre, email, empresa_id, activo')
      .single();
    if (error) throw error;
    res.json({ ok: true, data });
  } catch (err) {
    console.error('Error creando usuario:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

// PUT /api/usuarios/:id
async function actualizarUsuario(req, res) {
  try {
    const campos = {};
    if (req.body.nombre     !== undefined) campos.nombre     = req.body.nombre;
    if (req.body.email      !== undefined) campos.email      = req.body.email.toLowerCase();
    if (req.body.empresa_id !== undefined) campos.empresa_id = req.body.empresa_id;

    const { data, error } = await supabase
      .from('usuarios_panel')
      .update(campos)
      .eq('id', req.params.id)
      .select('id, nombre, email, empresa_id, activo')
      .single();
    if (error) throw error;
    res.json({ ok: true, data });
  } catch (err) {
    console.error('Error actualizando usuario:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

// PATCH /api/usuarios/:id/estado
async function cambiarEstadoUsuario(req, res) {
  try {
    const { activo } = req.body;
    if (activo === undefined) return res.status(400).json({ ok: false, error: 'Campo activo requerido' });

    const { data, error } = await supabase
      .from('usuarios_panel')
      .update({ activo })
      .eq('id', req.params.id)
      .select('id, activo')
      .single();
    if (error) throw error;
    res.json({ ok: true, data });
  } catch (err) {
    console.error('Error cambiando estado usuario:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

// PATCH /api/usuarios/:id/password
async function cambiarPasswordUsuario(req, res) {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ ok: false, error: 'Password requerido' });

    const password_hash = await bcrypt.hash(password, 10);

    const { error } = await supabase
      .from('usuarios_panel')
      .update({ password_hash })
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('Error cambiando password:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════
// ROLES
// ═══════════════════════════════════════════════════════════

// GET /api/roles
async function listarRoles(req, res) {
  try {
    const { data, error } = await supabase
      .from('roles')
      .select('id, nombre')
      .order('nombre');
    if (error) throw error;
    res.json({ ok: true, data });
  } catch (err) {
    console.error('Error listando roles:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

// GET /api/usuarios/:id/roles
async function listarRolesUsuario(req, res) {
  try {
    const { data, error } = await supabase
      .from('usuarios_roles')
      .select('id, rol_id, sede_id, roles(nombre), sedes(nombre)')
      .eq('usuario_id', req.params.id)
      .order('id');
    if (error) throw error;
    res.json({ ok: true, data });
  } catch (err) {
    console.error('Error listando roles del usuario:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

// POST /api/usuarios/:id/roles
async function asignarRolUsuario(req, res) {
  try {
    const { rol_id, sede_id } = req.body;
    if (!rol_id) return res.status(400).json({ ok: false, error: 'rol_id requerido' });

    const { data, error } = await supabase
      .from('usuarios_roles')
      .insert([{ usuario_id: req.params.id, rol_id, sede_id: sede_id || null, activo: true }])
      .select()
      .single();
    if (error) throw error;
    res.json({ ok: true, data });
  } catch (err) {
    console.error('Error asignando rol:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

// DELETE /api/usuarios_roles/:id
async function eliminarAsignacionRol(req, res) {
  try {
    const { error } = await supabase
      .from('usuarios_roles')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('Error eliminando asignación de rol:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

function registrarDashboard(app) {
  app.get('/dashboard', responderHealth);
  app.get('/dashboard/health', responderHealth);
  app.get('/dashboard/resumen', responderResumen);
  app.get('/api/posoperacionales',          verificarToken, listarPosoperacionales);
  app.get('/api/tanqueos',                  verificarToken, listarTanqueos);

  // Sedes
  app.get('/api/sedes',              verificarToken, listarSedes);
  app.post('/api/sedes',             verificarToken, verificarPermiso('sedes', 'ver'), crearSede);
  app.put('/api/sedes/:id',          verificarToken, verificarPermiso('sedes', 'ver'), actualizarSede);
  app.patch('/api/sedes/:id/estado', verificarToken, cambiarEstadoSede);

  // Usuarios
  app.get('/api/usuarios',                    verificarToken, verificarPermiso('usuarios', 'ver'), listarUsuarios);
  app.post('/api/usuarios',                   verificarToken, verificarPermiso('usuarios', 'ver'), crearUsuario);
  app.put('/api/usuarios/:id',                verificarToken, verificarPermiso('usuarios', 'ver'), actualizarUsuario);
  app.patch('/api/usuarios/:id/estado',       verificarToken, cambiarEstadoUsuario);
  app.patch('/api/usuarios/:id/password',     verificarToken, cambiarPasswordUsuario);

  // Roles
  app.get('/api/roles',                       verificarToken, listarRoles);
  app.get('/api/usuarios/:id/roles',          verificarToken, listarRolesUsuario);
  app.post('/api/usuarios/:id/roles',         verificarToken, asignarRolUsuario);
  app.delete('/api/usuarios_roles/:id',       verificarToken, eliminarAsignacionRol);
}

module.exports = {
  registrarDashboard,
  responderHealth,
  responderResumen
};
