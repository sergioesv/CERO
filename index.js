// ═══════════════════════════════════════════════════════════
// index.js
// Punto de entrada — Express, canales y cron de alertas
// CERO — Sistema de gestión de operaciones de campo
// ═══════════════════════════════════════════════════════════

const express = require('express');
const helmet = require('helmet');
const { registrarCanalWhatsapp } = require('./canales/whatsapp');
const { registrarDashboard } = require('./canales/dashboard');
const { registrarCronAlertas } = require('./modulos/alertas/notificador');
const { verificarToken, verificarPermiso } = require('./middlewares/auth');
const { seedPermisosBase } = require('./data/permisos');

const app = express();
app.use(helmet());
const PORT = process.env.PORT || 8080;

app.set('trust proxy', true);
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ═══════════════════════════════════════════════════════════
// RUTAS DE PÁGINAS
// ═══════════════════════════════════════════════════════════

// GET / → sirve la landing page pública
app.get('/', function (req, res) {
  res.sendFile(__dirname + '/public/landing.html');
});

// GET /login → sirve la página de login
app.get('/login', function (req, res) {
  res.sendFile(__dirname + '/public/login.html');
});

// GET /panel → sirve el panel (la verificación de token ocurre client-side)
app.get('/panel', function (req, res) {
  res.sendFile(__dirname + '/public/index.html');
});

app.use(express.static('public'));

// ═══════════════════════════════════════════════════════════
// RUTAS DE AUTENTICACIÓN
// ═══════════════════════════════════════════════════════════
const authRutas = require('./rutas/auth');
app.use('/auth', authRutas);

const rutasDashboard = require('./rutas/dashboard');
app.use(rutasDashboard);

// ═══════════════════════════════════════════════════════════
// CANALES
// ═══════════════════════════════════════════════════════════
registrarCanalWhatsapp(app);
registrarDashboard(app);

// ═══════════════════════════════════════════════════════════
// CRON DE ALERTAS — 6:00 AM Colombia
// ═══════════════════════════════════════════════════════════
registrarCronAlertas();

// ═══════════════════════════════════════════════════════════
// API — ENDPOINTS PARA EL PANEL DE ADMINISTRACIÓN
// ═══════════════════════════════════════════════════════════

const { supabase } = require('./config/config');
const autorizacionesData = require('./data/autorizaciones');
const tanqueosData = require('./data/tanqueos');
const activosData = require('./data/activos');

// ───────────────────────────────────────────────────────────
// VEHÍCULOS
// ───────────────────────────────────────────────────────────

// GET /api/vehiculos — lista todos los vehículos
app.get('/api/vehiculos', verificarToken, verificarPermiso('vehiculos', 'ver'), async function (req, res) {
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

// GET /api/vehiculos/:placa — obtiene un vehículo
app.get('/api/vehiculos/:placa', verificarToken, verificarPermiso('vehiculos', 'ver'), async function (req, res) {
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

// POST /api/vehiculos — crea un vehículo
app.post('/api/vehiculos', verificarToken, verificarPermiso('vehiculos', 'crear'), async function (req, res) {
  try {
    // Validar campos obligatorios
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

// PUT /api/vehiculos/:placa — actualiza un vehículo
app.put('/api/vehiculos/:placa', verificarToken, verificarPermiso('vehiculos', 'editar'), async function (req, res) {
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

    // Si cambió el estado, sincronizar en activos e historial
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
      ).catch(function(err) {
        console.error('❌ Error registrando historial desde panel:', err.message);
      });
    }

    res.json({ ok: true, data: data });
  } catch (error) {
    console.error('Error actualizando vehículo:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// POST /api/vehiculos/:placa/bloquear — bloquea un vehículo
app.post('/api/vehiculos/:placa/bloquear', verificarToken, verificarPermiso('vehiculos', 'editar'), async function (req, res) {
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
    ).catch(function(err) { console.error('❌ historial bloqueo:', err.message); });

    res.json({ ok: true, data: data });
  } catch (error) {
    console.error('Error bloqueando vehículo:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// POST /api/vehiculos/:placa/desbloquear — desbloquea un vehículo
app.post('/api/vehiculos/:placa/desbloquear', verificarToken, verificarPermiso('vehiculos', 'editar'), async function (req, res) {
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
    ).catch(function(err) { console.error('❌ historial desbloqueo:', err.message); });

    res.json({ ok: true, data: data });
  } catch (error) {
    console.error('Error desbloqueando vehículo:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// DELETE /api/vehiculos/:placa — elimina un vehículo (solo si no tiene historial)
app.delete('/api/vehiculos/:placa', verificarToken, verificarPermiso('vehiculos', 'eliminar'), async function (req, res) {
  try {
    const placa = req.params.placa.toUpperCase();
    
    // Verificar si tiene preoperacionales
    const { count: preop } = await supabase
      .from('preoperacionales')
      .select('*', { count: 'exact', head: true })
      .eq('vehiculo_placa', placa);
    
    // Verificar si tiene posoperacionales
    const { count: posop } = await supabase
      .from('posoperacionales')
      .select('*', { count: 'exact', head: true })
      .eq('vehiculo_placa', placa);
    
    // Verificar si tiene tanqueos
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
    
    // Sin historial, se puede eliminar
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

// ───────────────────────────────────────────────────────────
// CONDUCTORES
// ───────────────────────────────────────────────────────────

// GET /api/conductores — lista todos los conductores
app.get('/api/conductores', verificarToken, verificarPermiso('conductores', 'ver'), async function (req, res) {
  try {
    const { data, error } = await supabase
      .from('conductores')
      .select('*')
      .order('nombre');
    
    if (error) throw error;
    res.json({ ok: true, data: data });
  } catch (error) {
    console.error('Error listando conductores:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// GET /api/conductores/:id — obtiene un conductor
app.get('/api/conductores/:id', verificarToken, verificarPermiso('conductores', 'ver'), async function (req, res) {
  try {
    const { data, error } = await supabase
      .from('conductores')
      .select('*')
      .eq('id', req.params.id)
      .single();
    
    if (error) throw error;
    res.json({ ok: true, data: data });
  } catch (error) {
    console.error('Error obteniendo conductor:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// POST /api/conductores — crea un conductor
app.post('/api/conductores', verificarToken, verificarPermiso('conductores', 'crear'), async function (req, res) {
  try {
    // Validar campos obligatorios
    if (!req.body.nombre || !req.body.cedula) {
      return res.status(400).json({ ok: false, error: 'Los campos nombre y cedula son obligatorios' });
    }

    const conductor = {
      nombre: req.body.nombre,
      cedula: req.body.cedula,
      telefono: req.body.telefono || null,
      licencia_categoria: req.body.licencia_categoria || null,
      licencia_vencimiento: req.body.licencia_vencimiento || null,
      cargo: req.body.cargo || 'Conductor',
      activo: true
    };
    if (req.body.sede_id !== undefined) conductor.sede_id = req.body.sede_id || null;
    
    const { data, error } = await supabase
      .from('conductores')
      .insert([conductor])
      .select()
      .single();
    
    if (error) throw error;
    res.json({ ok: true, data: data });
  } catch (error) {
    console.error('Error creando conductor:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// PUT /api/conductores/:id — actualiza un conductor
app.put('/api/conductores/:id', verificarToken, verificarPermiso('conductores', 'editar'), async function (req, res) {
  try {
    const campos = {};
    if (req.body.nombre !== undefined) campos.nombre = req.body.nombre;
    if (req.body.cedula !== undefined) campos.cedula = req.body.cedula;
    if (req.body.telefono !== undefined) campos.telefono = req.body.telefono;
    if (req.body.licencia_categoria !== undefined) campos.licencia_categoria = req.body.licencia_categoria;
    if (req.body.licencia_vencimiento !== undefined) campos.licencia_vencimiento = req.body.licencia_vencimiento;
    if (req.body.cargo !== undefined) campos.cargo = req.body.cargo;
    if (req.body.activo !== undefined) campos.activo = req.body.activo;
    if (req.body.sede_id !== undefined) campos.sede_id = req.body.sede_id;
    
    const { data, error } = await supabase
      .from('conductores')
      .update(campos)
      .eq('id', req.params.id)
      .select()
      .single();
    
    if (error) throw error;
    res.json({ ok: true, data: data });
  } catch (error) {
    console.error('Error actualizando conductor:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// ═══════════════════════════════════════════════════════════
// API — PREOPERACIONALES
// ═══════════════════════════════════════════════════════════

// GET /api/preoperacionales — Lista inspecciones con filtros
app.get('/api/preoperacionales', verificarToken, verificarPermiso('preoperacionales', 'ver'), async function (req, res) {
  try {
    var desde = req.query.desde || null;
    var hasta = req.query.hasta || null;
    var placa = req.query.placa || null;
    var conductor = req.query.conductor || null;
    var estado = req.query.estado || null;

    // Consulta base con join a vehiculos y conductores
    var query = supabase
      .from('preoperacionales')
      .select('*, vehiculos:vehiculo_placa(placa, marca, modelo), conductores:conductor_id(id, nombre, cedula)')
      .order('fecha', { ascending: false })
      .order('hora', { ascending: false });

    // Filtro por rango de fechas
    if (desde) {
      query = query.gte('fecha', desde);
    }
    if (hasta) {
      query = query.lte('fecha', hasta);
    }

    // Filtro por placa
    if (placa) {
      query = query.eq('vehiculo_placa', placa.toUpperCase());
    }

    // Filtro por conductor
    if (conductor) {
      query = query.eq('conductor_id', conductor);
    }

    // Filtro por clasificacion — resuelto en base de datos
    if (estado && estado !== 'todos') {
      query = query.eq('clasificacion', estado);
    }

    // Sin filtro: limitar vista general a 100 registros
    // Con filtro de estado: traer todos los que cumplan la condición
    if (!estado || estado === 'todos') {
      query = query.limit(100);
    }

    var resultado = await query;

    if (resultado.error) {
      return res.status(500).json({ ok: false, error: 'Error interno del servidor' });
    }

    // Post-procesamiento: clasificar estado por novedades
    var data = (resultado.data || []).map(function (registro) {
      var novedades = registro.novedades || [];
      var totalNovedades = novedades.length;
      var novedadesCriticas = novedades.filter(function (n) { return n.critico === true; }).length;

      return {
        id: registro.id,
        fecha: registro.fecha,
        hora: registro.hora,
        vehiculo_placa: registro.vehiculo_placa,
        vehiculo_marca: registro.vehiculos ? registro.vehiculos.marca : null,
        vehiculo_modelo: registro.vehiculos ? registro.vehiculos.modelo : null,
        conductor_id: registro.conductor_id,
        conductor_nombre: registro.conductores ? registro.conductores.nombre : null,
        conductor_cedula: registro.conductores ? registro.conductores.cedula : null,
        kilometraje: registro.kilometraje,
        km_referencia: registro.km_referencia,
        diferencia_km: registro.diferencia_km,
        novedades: novedades,
        total_novedades: totalNovedades,
        novedades_criticas: novedadesCriticas,
        clasificacion: registro.clasificacion || 'sin_novedades',
        observaciones: registro.observaciones,
        motor_niveles: registro.motor_niveles,
        electrico_luces: registro.electrico_luces,
        frenos_direccion_llantas: registro.frenos_direccion_llantas,
        cabina_equipo: registro.cabina_equipo,
        firma_operario: registro.firma_operario,
        firma_timestamp: registro.firma_timestamp,
        estado: registro.estado,
        pdf_url: registro.pdf_url || null
      };
    });

    // Stats para las tarjetas
    var hoy = new Date().toISOString().split('T')[0];
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

// GET /api/preoperacionales/:id — Detalle de una inspección
app.get('/api/preoperacionales/:id', verificarToken, verificarPermiso('preoperacionales', 'ver'), async function (req, res) {
  try {
    var id = req.params.id;

    var resultado = await supabase
      .from('preoperacionales')
      .select('*, vehiculos:vehiculo_placa(placa, marca, modelo, soat_vencimiento, tecnomecanica_vencimiento), conductores:conductor_id(id, nombre, cedula, licencia_categoria, licencia_vencimiento)')
      .eq('id', id)
      .single();

    if (resultado.error) {
      return res.status(404).json({ error: 'Preoperacional no encontrado' });
    }

    // Buscar fotos asociadas
    var fotos = await supabase
      .from('fotos_evidencia')
      .select('*')
      .eq('preoperacional_id', id);

    var registro = resultado.data;
    registro.fotos = fotos.data || [];

    // Buscar autorización asociada a este preoperacional
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

// ───────────────────────────────────────────────────────────
// ALERTAS
// ───────────────────────────────────────────────────────────

// GET /api/alertas/resumen — resumen de alertas activas
app.get('/api/alertas/resumen', verificarToken, verificarPermiso('alertas', 'ver'), async function (req, res) {
  try {
    const hoy = new Date().toISOString().split('T')[0];
    const en30dias = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    // Vehículos con documentos próximos a vencer
    const { data: vehiculos, error: errorV } = await supabase
      .from('vehiculos')
      .select('placa, soat_vencimiento, tecnomecanica_vencimiento, bloqueado')
      .or(`soat_vencimiento.lte.${en30dias},tecnomecanica_vencimiento.lte.${en30dias}`);
    
    if (errorV) throw errorV;
    
    // Conductores con licencia próxima a vencer
    const { data: conductores, error: errorC } = await supabase
      .from('conductores')
      .select('id, nombre, licencia_vencimiento')
      .lte('licencia_vencimiento', en30dias)
      .eq('activo', true);
    
    if (errorC) throw errorC;
    
    let criticas = 0;
    let urgentes = 0;
    let informativas = 0;
    
    (vehiculos || []).forEach(v => {
      [v.soat_vencimiento, v.tecnomecanica_vencimiento].forEach(fecha => {
        if (fecha) {
          const dias = Math.ceil((new Date(fecha) - new Date()) / (1000 * 60 * 60 * 24));
          if (dias <= 0) criticas++;
          else if (dias <= 7) criticas++;
          else if (dias <= 15) urgentes++;
          else if (dias <= 30) informativas++;
        }
      });
    });
    
    (conductores || []).forEach(c => {
      if (c.licencia_vencimiento) {
        const dias = Math.ceil((new Date(c.licencia_vencimiento) - new Date()) / (1000 * 60 * 60 * 24));
        if (dias <= 0) criticas++;
        else if (dias <= 7) criticas++;
        else if (dias <= 15) urgentes++;
        else if (dias <= 30) informativas++;
      }
    });
    
    res.json({
      ok: true,
      total: criticas + urgentes + informativas,
      criticas: criticas,
      urgentes: urgentes,
      informativas: informativas
    });
  } catch (error) {
    console.error('Error obteniendo resumen de alertas:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// ───────────────────────────────────────────────────────────
// DASHBOARD
// ───────────────────────────────────────────────────────────

// GET /api/dashboard/resumen — resumen general (consultas en paralelo)
app.get('/api/dashboard/resumen', verificarToken, verificarPermiso('dashboard', 'ver'), async function (req, res) {
  try {
    const hoy = new Date().toISOString().split('T')[0];

    // Ejecutar las 4 consultas independientes en paralelo
    const [
      { count: totalVehiculos, error: e1 },
      { count: bloqueados,     error: e2 },
      { count: conductoresActivos, error: e3 },
      { count: inspeccionesHoy,    error: e4 }
    ] = await Promise.all([
      supabase.from('vehiculos').select('*', { count: 'exact', head: true }),
      supabase.from('vehiculos').select('*', { count: 'exact', head: true }).eq('bloqueado', true),
      supabase.from('conductores').select('*', { count: 'exact', head: true }).eq('activo', true),
      supabase.from('preoperacionales').select('*', { count: 'exact', head: true }).gte('created_at', hoy)
    ]);

    // Si alguna consulta falló, lanzar error
    const errorDb = e1 || e2 || e3 || e4;
    if (errorDb) throw errorDb;

    res.json({
      ok: true,
      vehiculos: {
        total: totalVehiculos || 0,
        activos: (totalVehiculos || 0) - (bloqueados || 0),
        bloqueados: bloqueados || 0
      },
      conductores: conductoresActivos || 0,
      inspeccionesHoy: inspeccionesHoy || 0
    });
  } catch (error) {
    console.error('Error obteniendo resumen dashboard:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});


// ═══════════════════════════════════════════════════════════
// ALERTAS — DOCUMENTOS Y AUTORIZACIONES (Panel web)
// ═══════════════════════════════════════════════════════════

// GET /api/alertas/documentos — estado de documentos por vehículo
app.get('/api/alertas/documentos', verificarToken, verificarPermiso('alertas', 'ver'), async function(req, res) {
  try {
    var datos = await autorizacionesData.obtenerDocumentosVehiculos();
    res.json({ ok: true, datos: datos });
  } catch (error) {
    console.error('Error en /api/alertas/documentos:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// GET /api/autorizaciones/pendientes — autorizaciones sin decisión
app.get('/api/autorizaciones/pendientes', verificarToken, verificarPermiso('autorizaciones', 'ver'), async function(req, res) {
  try {
    var datos = await autorizacionesData.obtenerAutorizacionesPendientes();
    res.json({ ok: true, datos: datos });
  } catch (error) {
    console.error('Error en /api/autorizaciones/pendientes:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// GET /api/autorizaciones/resueltas — autorizaciones con decisión
app.get('/api/autorizaciones/resueltas', verificarToken, verificarPermiso('autorizaciones', 'ver'), async function(req, res) {
  try {
    var datos = await autorizacionesData.obtenerAutorizacionesResueltas();
    res.json({ ok: true, datos: datos });
  } catch (error) {
    console.error('Error en /api/autorizaciones/resueltas:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// PUT /api/autorizaciones/:id/decidir — registrar decisión del supervisor
app.put('/api/autorizaciones/:id/decidir', verificarToken, verificarPermiso('autorizaciones', 'editar'), async function(req, res) {
  try {
    var id = req.params.id;
    var decision = req.body.decision;
    var justificacion = (req.body.justificacion || '').trim();
    var supervisorId = req.body.supervisor_id;

    var decisiones = ['autorizar', 'taller', 'restringir'];
    if (!decisiones.includes(decision)) {
      return res.status(400).json({ ok: false, error: 'Decisión inválida. Use: autorizar, taller o restringir' });
    }

    if (decision === 'autorizar' && justificacion.length < 10) {
      return res.status(400).json({ ok: false, error: 'Justificación obligatoria (mín 10 caracteres) para autorizar' });
    }

    var resultado = await autorizacionesData.registrarDecision(id, decision, justificacion, supervisorId);
    if (!resultado.ok) {
      return res.status(400).json(resultado);
    }

    res.json({ ok: true, mensaje: 'Decisión registrada' });
  } catch (error) {
    console.error('Error en PUT /api/autorizaciones/:id/decidir:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// GET /api/vehiculos/:placa/historial — timeline completo del vehículo
app.get('/api/vehiculos/:placa/historial', verificarToken, verificarPermiso('vehiculos', 'ver'), async function(req, res) {
  try {
    var resultado = await autorizacionesData.obtenerHistorialVehiculo(req.params.placa);
    res.json({ ok: true, vehiculo: resultado.vehiculo, historial: resultado.historial });
  } catch (error) {
    console.error('Error en /api/vehiculos/:placa/historial:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// ═══════════════════════════════════════════════════════════
// API — TANQUEOS
// ═══════════════════════════════════════════════════════════

// GET /api/tanqueos — lista con filtros y stats
app.get('/api/tanqueos', verificarToken, verificarPermiso('tanqueos', 'ver'), async function(req, res) {
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

// GET /api/tanqueos/consolidado — resumen mensual agrupado por vehículo
// IMPORTANTE: esta ruta debe ir ANTES de /api/tanqueos/:id
app.get('/api/tanqueos/consolidado', verificarToken, verificarPermiso('tanqueos', 'ver'), async function(req, res) {
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

// GET /api/tanqueos/consolidado/exportar — CSV descargable del mes
app.get('/api/tanqueos/consolidado/exportar', verificarToken, verificarPermiso('tanqueos', 'ver'), async function(req, res) {
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

    var filas = detalle.map(function(t) {
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
    res.send('\uFEFF' + csv); // BOM para Excel colombiano
  } catch (error) {
    console.error('Error en GET /api/tanqueos/consolidado/exportar:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// GET /api/tanqueos/:id — detalle completo con fotos y signed URLs
app.get('/api/tanqueos/:id', verificarToken, verificarPermiso('tanqueos', 'ver'), async function(req, res) {
  try {
    var resultado = await tanqueosData.obtenerTanqueo(req.params.id);
    if (resultado.error) return res.status(404).json({ ok: false, error: 'Tanqueo no encontrado' });
    res.json({ ok: true, data: resultado.data });
  } catch (error) {
    console.error('Error en GET /api/tanqueos/:id:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// PUT /api/tanqueos/:id/validar — validar o rechazar individualmente
app.put('/api/tanqueos/:id/validar', verificarToken, verificarPermiso('tanqueos', 'editar'), async function(req, res) {
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

// PUT /api/tanqueos/validar-lote — validar múltiples auto_validado de una vez
app.put('/api/tanqueos/validar-lote', verificarToken, verificarPermiso('tanqueos', 'editar'), async function(req, res) {
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

// ═══════════════════════════════════════════════════════════
// MIDDLEWARE GLOBAL DE ERRORES — debe ir al final del stack
// ═══════════════════════════════════════════════════════════
app.use(function (err, req, res, next) {
  // Registrar error completo solo en servidor, nunca exponer al cliente
  console.error('❌ Error no controlado:', err);
  res.status(500).json({
    ok: false,
    error: 'Error interno del servidor',
    timestamp: new Date().toISOString()
  });
});

// ═══════════════════════════════════════════════════════════
// SERVIDOR
// ═══════════════════════════════════════════════════════════
seedPermisosBase().catch((error) => {
  console.error('Error sembrando permisos base:', error);
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ CERO en puerto ${PORT}`);
  console.log(`✓ ${new Date().toISOString()}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Puerto ${PORT} ocupado`);
    process.exit(1);
  } else {
    console.error('❌ Error servidor:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', () => {
  console.log('⚠️ SIGTERM - cerrando...');
  server.close(() => {
    console.log('✓ Cerrado');
    process.exit(0);
  });
});
