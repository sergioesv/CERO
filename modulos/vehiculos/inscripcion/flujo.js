// modulos/vehiculos/inscripcion/flujo.js
// Flujo conversacional de registro de conductores nuevos por WhatsApp.
// Se activa automáticamente desde whatsapp.js cuando el número no está registrado
// en la tabla conductores.

'use strict';

var config       = require('../../../config/config');
var sesiones     = require('../../../servicios/sesiones');
var mensajes     = require('./mensajes');
var validaciones = require('./validaciones');
var estadoMod    = require('./estado');
var nav          = require('../compartido/navegacion');

var ESTADOS = estadoMod.ESTADOS;

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

/**
 * Responde en formato TwiML — compatible con el resto del sistema.
 */
function responder(res, texto) {
  res.set('Content-Type', 'text/xml');
  res.send(
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Response><Message>' + escaparXml(texto) + '</Message></Response>'
  );
}

function escaparXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ============================================================================
// GUARDAR CONDUCTOR EN SUPABASE
// ============================================================================

/**
 * Inserta el conductor nuevo en la tabla conductores.
 * Normaliza el teléfono antes de guardar.
 * @param {string} telefono - Número WhatsApp completo (ej: whatsapp:+573001234567)
 * @param {object} datos    - { nombre, cedula, licencia, cargo }
 * @returns {Promise<{ error: object|null, data: object|null }>}
 */
async function guardarConductor(telefono, datos) {
  // Quitar prefijo whatsapp: y espacios para guardar solo el número
  var telefonoLimpio = String(telefono || '')
    .replace(/^whatsapp:/i, '')
    .trim();

  var registro = {
    nombre:             datos.nombre,
    cedula:             datos.cedula,
    telefono:           telefonoLimpio,
    licencia_categoria: datos.licencia,
    cargo:              datos.cargo,
    activo:             true
  };

  var resultado = await config.supabase
    .from('conductores')
    .insert([registro])
    .select()
    .single();

  if (resultado.error) {
    return { error: resultado.error, data: null };
  }

  return { error: null, data: resultado.data };
}

// ============================================================================
// MANEJADOR PRINCIPAL
// ============================================================================

/**
 * Punto de entrada del módulo de inscripción.
 * Llamado desde whatsapp.js cuando sesion.tipo === 'inscripcion'.
 */
async function manejarInscripcion(req, res) {
  var telefono = req.body.From;
  var mensaje  = (req.body.Body || '').trim();
  var msgUpper = mensaje.toUpperCase();

  var sesion = await sesiones.obtenerSesion(telefono);

  // Inicializar subestado si aún no existe (primer mensaje del flujo)
  if (!sesion.inscripcion) {
    estadoMod.iniciarInscripcion(sesion);
    sesiones.guardarCambios();
    return responder(res, mensajes.mensajeBienvenida());
  }

  // ── CANCELAR: borra inscripción y vuelve al inicio ────────────────────────
  // Nota: MENU e INICIO son interceptados por whatsapp.js antes de llegar aquí.
  if (mensaje === '9' || msgUpper === 'CANCELAR') {
    estadoMod.limpiarInscripcion(sesion);
    sesion.tipo = null;
    sesiones.guardarCambios();
    return responder(res, nav.textoMenuPrincipal());
  }

  // ── REINICIAR: reinicia desde el primer paso ──────────────────────────────
  if (mensaje === '0' || msgUpper === 'REINICIAR') {
    estadoMod.iniciarInscripcion(sesion);
    sesiones.guardarCambios();
    return responder(res, mensajes.mensajeBienvenida());
  }

  // ── ATRAS: retrocede un paso ──────────────────────────────────────────────
  if (msgUpper === 'ATRAS') {
    return manejarAtras(res, sesion);
  }

  // ── Máquina de estados ────────────────────────────────────────────────────
  switch (sesion.estado) {

    // PASO 1 — Nombre completo
    case ESTADOS.NOMBRE: {
      var resNombre = validaciones.validarNombre(mensaje);
      if (!resNombre.valido) {
        return responder(res,
          mensajes.mensajeValidacionFallida('Nombre',
            resNombre.error + '\n\nEscribe tu nombre y apellidos:')
        );
      }
      sesion.inscripcion.nombre = resNombre.valor;
      sesion.estado = ESTADOS.CEDULA;
      sesiones.guardarCambios();
      return responder(res, mensajes.mensajePedirCedula(resNombre.valor));
    }

    // PASO 2 — Cédula
    case ESTADOS.CEDULA: {
      var resCedula = validaciones.validarCedula(mensaje);
      if (!resCedula.valido) {
        return responder(res,
          mensajes.mensajeValidacionFallida('Cédula',
            resCedula.error + '\n\nEscribe solo los dígitos:')
        );
      }
      sesion.inscripcion.cedula = resCedula.valor;
      sesion.estado = ESTADOS.LICENCIA;
      sesiones.guardarCambios();
      return responder(res, mensajes.mensajePedirLicencia(resCedula.valor));
    }

    // PASO 3 — Categoría de licencia
    case ESTADOS.LICENCIA: {
      var resLicencia = validaciones.validarLicencia(mensaje);
      if (!resLicencia.valido) {
        return responder(res,
          mensajes.mensajeValidacionFallida('Categoría de licencia', resLicencia.error)
        );
      }
      sesion.inscripcion.licencia = resLicencia.valor;
      sesion.estado = ESTADOS.CARGO;
      sesiones.guardarCambios();
      return responder(res, mensajes.mensajePedirCargo(resLicencia.valor));
    }

    // PASO 4 — Cargo
    case ESTADOS.CARGO: {
      var resCargo = validaciones.validarCargo(mensaje);
      if (!resCargo.valido) {
        return responder(res,
          mensajes.mensajeValidacionFallida('Cargo', resCargo.error)
        );
      }
      sesion.inscripcion.cargo = resCargo.valor;
      sesion.estado = ESTADOS.CONFIRMACION;
      sesiones.guardarCambios();
      return responder(res, mensajes.mensajeConfirmacion(sesion.inscripcion));
    }

    // CONFIRMACIÓN FINAL
    case ESTADOS.CONFIRMACION: {
      if (msgUpper !== 'SI') {
        return responder(res,
          'Escribe *SI* para guardar\n' +
          'o *ATRAS* para corregir\n' +
          'o *CANCELAR* para anular.'
        );
      }

      var guardado = await guardarConductor(telefono, sesion.inscripcion);

      if (guardado.error) {
        console.error('[INSCRIPCION] Error guardando conductor:', guardado.error.message);

        // Cédula duplicada — error 23505 = unique_violation en PostgreSQL
        if (guardado.error.code === '23505') {
          estadoMod.limpiarInscripcion(sesion);
          sesion.tipo = null;
          sesiones.guardarCambios();
          return responder(res,
            '⚠️ Ese número de cédula ya está registrado en el sistema.\n\n' +
            'Si crees que es un error, contacta al supervisor.\n\n' +
            'Escribe *9* para volver al menú.'
          );
        }

        // Error genérico — no limpiar sesión para que pueda reintentar
        return responder(res, mensajes.mensajeError());
      }

      var nombreGuardado = sesion.inscripcion.nombre;

      // Limpiar estado y devolver al menú principal
      estadoMod.limpiarInscripcion(sesion);
      sesion.tipo = null;
      sesiones.guardarCambios();

      console.log('[INSCRIPCION] Conductor registrado:', nombreGuardado, '| Tel:', telefono);
      return responder(res, mensajes.mensajeExito(nombreGuardado));
    }

    // Estado desconocido — reiniciar desde el principio
    default: {
      estadoMod.iniciarInscripcion(sesion);
      sesiones.guardarCambios();
      return responder(res, mensajes.mensajeBienvenida());
    }
  }
}

// ============================================================================
// LÓGICA DE RETROCESO
// ============================================================================

/**
 * Retrocede un paso en el formulario sin perder los datos ya ingresados.
 */
function manejarAtras(res, sesion) {
  switch (sesion.estado) {

    case ESTADOS.CEDULA: {
      sesion.inscripcion.nombre = null;
      sesion.estado = ESTADOS.NOMBRE;
      sesiones.guardarCambios();
      return responder(res,
        '◀️ Volvemos al nombre.\n\n' +
        '📝 *Paso 1 de 4 — Nombre completo*\n' +
        'Escribe tu nombre y apellidos:'
      );
    }

    case ESTADOS.LICENCIA: {
      var nombreActual = sesion.inscripcion.nombre;
      sesion.inscripcion.cedula = null;
      sesion.estado = ESTADOS.CEDULA;
      sesiones.guardarCambios();
      return responder(res,
        '◀️ Volvemos a la cédula.\n\n' +
        mensajes.mensajePedirCedula(nombreActual)
      );
    }

    case ESTADOS.CARGO: {
      var cedulaActual = sesion.inscripcion.cedula;
      sesion.inscripcion.licencia = null;
      sesion.estado = ESTADOS.LICENCIA;
      sesiones.guardarCambios();
      return responder(res,
        '◀️ Volvemos a la licencia.\n\n' +
        mensajes.mensajePedirLicencia(cedulaActual)
      );
    }

    case ESTADOS.CONFIRMACION: {
      var licenciaActual = sesion.inscripcion.licencia;
      sesion.inscripcion.cargo = null;
      sesion.estado = ESTADOS.CARGO;
      sesiones.guardarCambios();
      return responder(res,
        '◀️ Volvemos al cargo.\n\n' +
        mensajes.mensajePedirCargo(licenciaActual)
      );
    }

    // En el primer paso no hay donde retroceder
    default: {
      return responder(res, mensajes.mensajeBienvenida());
    }
  }
}

module.exports = {
  manejarInscripcion
};
