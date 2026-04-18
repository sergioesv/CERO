// rutas/usuarios.js
// Endpoints de gestion de usuarios del panel web CERO
// Requiere: verificarToken + verificarPermiso('usuarios', <accion>)
// Reglas de scope:
//   - superadmin_plataforma: puede crear/editar en cualquier empresa
//   - superadmin_emp: solo en su propia empresa (req.usuario.empresa_id)
//   - NADIE puede asignar/crear rol 'superadmin_plataforma' desde la UI

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { supabase } = require('../config/config');
const { verificarToken, verificarPermiso } = require('../middlewares/auth');
const { generarPasswordTemporal } = require('../servicios/passwords');

// Helper: verifica si el usuario solicitante es superadmin_plataforma
function esSuperadminPlataforma(usuario) {
  return (usuario.roles || []).includes('superadmin_plataforma');
}

// Helper: valida que empresa_id sea accesible para el solicitante
// superadmin_plataforma puede tocar cualquier empresa
// superadmin_emp solo puede tocar la suya
function empresaPermitida(usuario, empresaIdTarget) {
  if (esSuperadminPlataforma(usuario)) return true;
  return empresaIdTarget === usuario.empresa_id;
}

// ═══════════════════════════════════════════════════════════
// GET /api/usuarios — lista usuarios del panel
// superadmin_plataforma ve todos
// superadmin_emp ve solo los de su empresa
// ═══════════════════════════════════════════════════════════
router.get('/', verificarToken, verificarPermiso('usuarios', 'ver'), async (req, res) => {
  try {
    let query = supabase
      .from('usuarios_panel')
      .select('id, nombre, email, empresa_id, activo, ultimo_acceso, debe_cambiar_password, empresas(nombre), usuarios_roles!usuarios_roles_usuario_id_fkey(id, rol_id, sede_id, roles(nombre))')
      .order('nombre');

    // Scope multi-empresa: no-superadmin solo ve su empresa
    if (!esSuperadminPlataforma(req.usuario)) {
      query = query.eq('empresa_id', req.usuario.empresa_id);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ ok: true, data });
  } catch (err) {
    console.error('Error listando usuarios:', err);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/usuarios — crea usuario con password temporal autogenerada
// Devuelve la password en la respuesta (se muestra UNA vez al admin)
// ═══════════════════════════════════════════════════════════
router.post('/', verificarToken, verificarPermiso('usuarios', 'crear'), async (req, res) => {
  try {
    const { nombre, email, empresa_id, telefono } = req.body;

    // Validaciones basicas
    if (!nombre || typeof nombre !== 'string' || nombre.trim().length < 2) {
      return res.status(400).json({ ok: false, error: 'Nombre requerido (minimo 2 caracteres)' });
    }
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: 'Email invalido' });
    }
    if (!empresa_id || typeof empresa_id !== 'string') {
      return res.status(400).json({ ok: false, error: 'empresa_id requerido' });
    }

    // Scope: superadmin_emp solo crea en su propia empresa
    if (!empresaPermitida(req.usuario, empresa_id)) {
      return res.status(403).json({ ok: false, error: 'Sin permiso para crear usuarios en esta empresa' });
    }

    // Verificar que empresa existe
    const { data: empresa, error: errEmp } = await supabase
      .from('empresas')
      .select('id')
      .eq('id', empresa_id)
      .maybeSingle();
    if (errEmp) throw errEmp;
    if (!empresa) return res.status(400).json({ ok: false, error: 'Empresa no encontrada' });

    // Verificar email unico (case-insensitive)
    const emailLower = email.toLowerCase().trim();
    const { data: existente } = await supabase
      .from('usuarios_panel')
      .select('id')
      .ilike('email', emailLower)
      .maybeSingle();
    if (existente) {
      return res.status(409).json({ ok: false, error: 'Ya existe un usuario con ese email' });
    }

    // Generar password temporal + hash
    const passwordTemporal = generarPasswordTemporal(12);
    const password_hash = await bcrypt.hash(passwordTemporal, 10);

    // Crear usuario con flag debe_cambiar_password = true
    const { data, error } = await supabase
      .from('usuarios_panel')
      .insert([{
        nombre: nombre.trim(),
        email: emailLower,
        password_hash,
        empresa_id,
        telefono: telefono ? String(telefono).trim() : null,
        activo: true,
        debe_cambiar_password: true,
        creado_por: req.usuario.id
      }])
      .select('id, nombre, email, empresa_id, activo, debe_cambiar_password')
      .single();
    if (error) throw error;

    // IMPORTANTE: passwordTemporal se devuelve al admin una sola vez
    // El admin debe copiarla y entregarsela al usuario
    res.json({
      ok: true,
      data,
      password_temporal: passwordTemporal,
      aviso: 'Entregue esta contrasena al usuario. Se mostrara UNA sola vez.'
    });
  } catch (err) {
    console.error('Error creando usuario:', err);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// ═══════════════════════════════════════════════════════════
// PUT /api/usuarios/:id — actualiza nombre, email, telefono
// NO permite cambiar empresa_id (se hace por script manual)
// ═══════════════════════════════════════════════════════════
router.put('/:id', verificarToken, verificarPermiso('usuarios', 'editar'), async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener usuario objetivo para validar scope
    const { data: objetivo, error: errObj } = await supabase
      .from('usuarios_panel')
      .select('id, empresa_id')
      .eq('id', id)
      .maybeSingle();
    if (errObj) throw errObj;
    if (!objetivo) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    if (!empresaPermitida(req.usuario, objetivo.empresa_id)) {
      return res.status(403).json({ ok: false, error: 'Sin permiso para editar este usuario' });
    }

    const campos = { actualizado_en: new Date() };
    if (req.body.nombre !== undefined) {
      if (typeof req.body.nombre !== 'string' || req.body.nombre.trim().length < 2) {
        return res.status(400).json({ ok: false, error: 'Nombre invalido' });
      }
      campos.nombre = req.body.nombre.trim();
    }
    if (req.body.email !== undefined) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email)) {
        return res.status(400).json({ ok: false, error: 'Email invalido' });
      }
      campos.email = req.body.email.toLowerCase().trim();
    }
    if (req.body.telefono !== undefined) {
      campos.telefono = req.body.telefono ? String(req.body.telefono).trim() : null;
    }

    const { data, error } = await supabase
      .from('usuarios_panel')
      .update(campos)
      .eq('id', id)
      .select('id, nombre, email, empresa_id, activo, telefono')
      .single();
    if (error) throw error;

    res.json({ ok: true, data });
  } catch (err) {
    console.error('Error actualizando usuario:', err);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// ═══════════════════════════════════════════════════════════
// PATCH /api/usuarios/:id/estado — soft-delete (activo=false) o reactivar
// ═══════════════════════════════════════════════════════════
router.patch('/:id/estado', verificarToken, verificarPermiso('usuarios', 'editar'), async (req, res) => {
  try {
    const { id } = req.params;
    const { activo } = req.body;

    if (typeof activo !== 'boolean') {
      return res.status(400).json({ ok: false, error: 'Campo activo (boolean) requerido' });
    }

    // Proteccion: no puedes desactivarte a ti mismo
    if (id === req.usuario.id && activo === false) {
      return res.status(400).json({ ok: false, error: 'No puede desactivar su propio usuario' });
    }

    // Scope check
    const { data: objetivo } = await supabase
      .from('usuarios_panel')
      .select('id, empresa_id')
      .eq('id', id)
      .maybeSingle();
    if (!objetivo) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    if (!empresaPermitida(req.usuario, objetivo.empresa_id)) {
      return res.status(403).json({ ok: false, error: 'Sin permiso sobre este usuario' });
    }

    const { data, error } = await supabase
      .from('usuarios_panel')
      .update({ activo, actualizado_en: new Date() })
      .eq('id', id)
      .select('id, activo')
      .single();
    if (error) throw error;

    res.json({ ok: true, data });
  } catch (err) {
    console.error('Error cambiando estado usuario:', err);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// ═══════════════════════════════════════════════════════════
// PATCH /api/usuarios/:id/password — ADMIN resetea password de otro
// Genera password temporal, fuerza cambio en siguiente login
// ═══════════════════════════════════════════════════════════
router.patch('/:id/password', verificarToken, verificarPermiso('usuarios', 'editar'), async (req, res) => {
  try {
    const { id } = req.params;

    // Scope check
    const { data: objetivo } = await supabase
      .from('usuarios_panel')
      .select('id, empresa_id')
      .eq('id', id)
      .maybeSingle();
    if (!objetivo) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    if (!empresaPermitida(req.usuario, objetivo.empresa_id)) {
      return res.status(403).json({ ok: false, error: 'Sin permiso sobre este usuario' });
    }

    // Generar nueva password temporal
    const passwordTemporal = generarPasswordTemporal(12);
    const password_hash = await bcrypt.hash(passwordTemporal, 10);

    const { error } = await supabase
      .from('usuarios_panel')
      .update({
        password_hash,
        debe_cambiar_password: true,
        actualizado_en: new Date()
      })
      .eq('id', id);
    if (error) throw error;

    res.json({
      ok: true,
      password_temporal: passwordTemporal,
      aviso: 'Nueva contrasena generada. El usuario debera cambiarla en su proximo ingreso.'
    });
  } catch (err) {
    console.error('Error reseteando password:', err);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// ═══════════════════════════════════════════════════════════
// GET /api/usuarios/:id/roles — lista roles asignados al usuario
// ═══════════════════════════════════════════════════════════
router.get('/:id/roles', verificarToken, verificarPermiso('usuarios', 'ver'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('usuarios_roles')
      .select('id, rol_id, sede_id, activo, roles(nombre), sedes(nombre)')
      .eq('usuario_id', req.params.id)
      .order('id');
    if (error) throw error;
    res.json({ ok: true, data });
  } catch (err) {
    console.error('Error listando roles del usuario:', err);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/usuarios/:id/roles — asigna un rol al usuario
// NO permite asignar superadmin_plataforma desde la UI
// ═══════════════════════════════════════════════════════════
router.post('/:id/roles', verificarToken, verificarPermiso('usuarios', 'editar'), async (req, res) => {
  try {
    const { id } = req.params;
    const { rol_id, sede_id } = req.body;

    if (!rol_id) return res.status(400).json({ ok: false, error: 'rol_id requerido' });

    // Scope check sobre el usuario objetivo
    const { data: objetivo } = await supabase
      .from('usuarios_panel')
      .select('id, empresa_id')
      .eq('id', id)
      .maybeSingle();
    if (!objetivo) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    if (!empresaPermitida(req.usuario, objetivo.empresa_id)) {
      return res.status(403).json({ ok: false, error: 'Sin permiso sobre este usuario' });
    }

    // Verificar que el rol existe y cual es su nombre
    const { data: rol } = await supabase
      .from('roles')
      .select('id, nombre')
      .eq('id', rol_id)
      .maybeSingle();
    if (!rol) return res.status(400).json({ ok: false, error: 'Rol no encontrado' });

    // BLOQUEO: nadie asigna superadmin_plataforma desde UI
    if (rol.nombre === 'superadmin_plataforma') {
      return res.status(403).json({ ok: false, error: 'No se puede asignar rol superadmin_plataforma desde el panel' });
    }

    const { data, error } = await supabase
      .from('usuarios_roles')
      .insert([{ usuario_id: id, rol_id, sede_id: sede_id || null, activo: true }])
      .select()
      .single();
    if (error) throw error;

    res.json({ ok: true, data });
  } catch (err) {
    console.error('Error asignando rol:', err);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

module.exports = router;
