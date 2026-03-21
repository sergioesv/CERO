// ═══════════════════════════════════════════════════════════
// index.js
// Punto de entrada — Express, canales y cron de alertas
// CERO — Sistema de gestión de operaciones de campo
// ═══════════════════════════════════════════════════════════

const express = require('express');
const { registrarCanalWhatsapp } = require('./canales/whatsapp');
const { registrarDashboard } = require('./canales/dashboard');
const { registrarCronAlertas, ejecutarAlertasDiarias } = require('./modulos/alertas/notificador');

const app = express();
const PORT = process.env.PORT || 8080;

app.set('trust proxy', true);
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static('public'));

// Middleware global de errores
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(500).json({
    error: 'Error interno',
    timestamp: new Date().toISOString()
  });
});

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
// ENDPOINT DE PRUEBA — ejecutar alertas manualmente
// GET /alertas/ejecutar
// Usar para pruebas: curl https://cero-production.up.railway.app/alertas/ejecutar
// ═══════════════════════════════════════════════════════════
app.get('/alertas/ejecutar', async function (req, res) {
  try {
    var resultado = await ejecutarAlertasDiarias();
    res.json({
      ok: true,
      resultado: resultado,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ═══════════════════════════════════════════════════════════
// API — ENDPOINTS PARA EL PANEL DE ADMINISTRACIÓN
// ═══════════════════════════════════════════════════════════

const { supabase } = require('./config/config');

// ───────────────────────────────────────────────────────────
// VEHÍCULOS
// ───────────────────────────────────────────────────────────

// GET /api/vehiculos — lista todos los vehículos
app.get('/api/vehiculos', async function (req, res) {
  try {
    const { data, error } = await supabase
      .from('vehiculos')
      .select('*')
      .order('placa');
    
    if (error) throw error;
    res.json({ ok: true, data: data });
  } catch (error) {
    console.error('Error listando vehículos:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// GET /api/vehiculos/:placa — obtiene un vehículo
app.get('/api/vehiculos/:placa', async function (req, res) {
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
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/vehiculos — crea un vehículo
app.post('/api/vehiculos', async function (req, res) {
  try {
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
    res.status(500).json({ ok: false, error: error.message });
  }
});

// PUT /api/vehiculos/:placa — actualiza un vehículo
app.put('/api/vehiculos/:placa', async function (req, res) {
  try {
    const campos = {};
    if (req.body.tipo !== undefined) campos.tipo = req.body.tipo;
    if (req.body.marca !== undefined) campos.marca = req.body.marca;
    if (req.body.modelo !== undefined) campos.modelo = req.body.modelo;
    if (req.body.año !== undefined) campos.año = req.body.año;
    if (req.body.kilometraje !== undefined) campos.kilometraje = req.body.kilometraje;
    if (req.body.soat_vencimiento !== undefined) campos.soat_vencimiento = req.body.soat_vencimiento;
    if (req.body.tecnomecanica_vencimiento !== undefined) campos.tecnomecanica_vencimiento = req.body.tecnomecanica_vencimiento;
    if (req.body.bloqueado !== undefined) campos.bloqueado = req.body.bloqueado;
    if (req.body.motivo_bloqueo !== undefined) campos.motivo_bloqueo = req.body.motivo_bloqueo;
    if (req.body.estado !== undefined) campos.estado = req.body.estado;

    const { data, error } = await supabase
      .from('vehiculos')
      .update(campos)
      .eq('placa', req.params.placa.toUpperCase())
      .select()
      .single();
    
    if (error) throw error;
    res.json({ ok: true, data: data });
  } catch (error) {
    console.error('Error actualizando vehículo:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/vehiculos/:placa/bloquear — bloquea un vehículo
app.post('/api/vehiculos/:placa/bloquear', async function (req, res) {
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
    res.json({ ok: true, data: data });
  } catch (error) {
    console.error('Error bloqueando vehículo:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/vehiculos/:placa/desbloquear — desbloquea un vehículo
app.post('/api/vehiculos/:placa/desbloquear', async function (req, res) {
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
    res.json({ ok: true, data: data });
  } catch (error) {
    console.error('Error desbloqueando vehículo:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// DELETE /api/vehiculos/:placa — elimina un vehículo (solo si no tiene historial)
app.delete('/api/vehiculos/:placa', async function (req, res) {
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
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ───────────────────────────────────────────────────────────
// CONDUCTORES
// ───────────────────────────────────────────────────────────

// GET /api/conductores — lista todos los conductores
app.get('/api/conductores', async function (req, res) {
  try {
    const { data, error } = await supabase
      .from('conductores')
      .select('*')
      .order('nombre');
    
    if (error) throw error;
    res.json({ ok: true, data: data });
  } catch (error) {
    console.error('Error listando conductores:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// GET /api/conductores/:id — obtiene un conductor
app.get('/api/conductores/:id', async function (req, res) {
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
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/conductores — crea un conductor
app.post('/api/conductores', async function (req, res) {
  try {
    const conductor = {
      nombre: req.body.nombre,
      cedula: req.body.cedula,
      telefono: req.body.telefono || null,
      licencia_categoria: req.body.licencia_categoria || null,
      licencia_vencimiento: req.body.licencia_vencimiento || null,
      cargo: req.body.cargo || 'Conductor',
      activo: true
    };
    
    const { data, error } = await supabase
      .from('conductores')
      .insert([conductor])
      .select()
      .single();
    
    if (error) throw error;
    res.json({ ok: true, data: data });
  } catch (error) {
    console.error('Error creando conductor:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// PUT /api/conductores/:id — actualiza un conductor
app.put('/api/conductores/:id', async function (req, res) {
  try {
    const campos = {};
    if (req.body.nombre !== undefined) campos.nombre = req.body.nombre;
    if (req.body.cedula !== undefined) campos.cedula = req.body.cedula;
    if (req.body.telefono !== undefined) campos.telefono = req.body.telefono;
    if (req.body.licencia_categoria !== undefined) campos.licencia_categoria = req.body.licencia_categoria;
    if (req.body.licencia_vencimiento !== undefined) campos.licencia_vencimiento = req.body.licencia_vencimiento;
    if (req.body.cargo !== undefined) campos.cargo = req.body.cargo;
    if (req.body.activo !== undefined) campos.activo = req.body.activo;
    
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
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ───────────────────────────────────────────────────────────
// ALERTAS
// ───────────────────────────────────────────────────────────

// GET /api/alertas/resumen — resumen de alertas activas
app.get('/api/alertas/resumen', async function (req, res) {
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
    
    vehiculos.forEach(v => {
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
    
    conductores.forEach(c => {
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
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ───────────────────────────────────────────────────────────
// DASHBOARD
// ───────────────────────────────────────────────────────────

// GET /api/dashboard/resumen — resumen general
app.get('/api/dashboard/resumen', async function (req, res) {
  try {
    // Contar vehículos
    const { count: totalVehiculos } = await supabase
      .from('vehiculos')
      .select('*', { count: 'exact', head: true });
    
    const { count: bloqueados } = await supabase
      .from('vehiculos')
      .select('*', { count: 'exact', head: true })
      .eq('bloqueado', true);
    
    // Contar conductores activos
    const { count: conductoresActivos } = await supabase
      .from('conductores')
      .select('*', { count: 'exact', head: true })
      .eq('activo', true);
    
    // Inspecciones de hoy
    const hoy = new Date().toISOString().split('T')[0];
    const { count: inspeccionesHoy } = await supabase
      .from('preoperacionales')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', hoy);
    
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
    res.status(500).json({ ok: false, error: error.message });
  }
});


// ═══════════════════════════════════════════════════════════
// SERVIDOR
// ═══════════════════════════════════════════════════════════
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
