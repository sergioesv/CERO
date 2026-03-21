// ═══════════════════════════════════════════════════════════
// modulos/alertas/notificador.js
// Cron job diario — revisa vencimientos y envía alertas por WhatsApp
// CERO — Módulo 1.4 Alertas de documentos
// ═══════════════════════════════════════════════════════════

var cron = require('node-cron');
var config = require('../../config/config');
var alertasData = require('../../data/alertas');
var reglas = require('./reglas');

// ───────────────────────────────────────────────────────────
// Envía un mensaje de WhatsApp usando Twilio
// ───────────────────────────────────────────────────────────
async function enviarWhatsApp(telefono, mensaje) {
  try {
    // Normalizar teléfono — agregar prefijo whatsapp: si no lo tiene
    var destino = telefono;
    if (destino.indexOf('whatsapp:') !== 0) {
      if (destino.indexOf('+') !== 0) {
        destino = '+' + destino;
      }
      destino = 'whatsapp:' + destino;
    }

    await config.twilioClient.messages.create({
      from: config.TWILIO_WHATSAPP_NUMBER,
      to: destino,
      body: mensaje
    });

    console.log('📨 Alerta enviada a ' + telefono);
    return true;
  } catch (error) {
    console.error('❌ Error enviando alerta a ' + telefono + ':', error.message);
    return false;
  }
}

// ───────────────────────────────────────────────────────────
// Envía alertas a los destinatarios según la clasificación
// ───────────────────────────────────────────────────────────
async function enviarAlertaADestinatarios(mensaje, clasificacion, conductorTelefono) {
  var enviados = 0;

  // Enviar a contactos por cargo (Administrador, Supervisor)
  for (var i = 0; i < clasificacion.destinatarios.length; i++) {
    var cargo = clasificacion.destinatarios[i];
    var contactos = await alertasData.obtenerContactosPorCargo(cargo);

    for (var j = 0; j < contactos.length; j++) {
      var enviado = await enviarWhatsApp(contactos[j].telefono, mensaje);
      if (enviado) enviados++;
    }
  }

  // Enviar al conductor directamente (para alertas urgentes de licencia)
  if (conductorTelefono) {
    var enviado = await enviarWhatsApp(conductorTelefono, mensaje);
    if (enviado) enviados++;
  }

  return enviados;
}

// ───────────────────────────────────────────────────────────
// Procesa alertas de documentos de vehículos (SOAT, Tecnomecánica)
// ───────────────────────────────────────────────────────────
async function procesarAlertasVehiculos() {
  var alertas = await alertasData.obtenerVencimientosVehiculos();
  var totalEnviadas = 0;
  var totalBloqueados = 0;

  for (var i = 0; i < alertas.length; i++) {
    var alerta = alertas[i];
    var clasificacion = reglas.clasificarAlerta(alerta.dias_restantes);
    if (!clasificacion) continue;

    // Generar y enviar mensaje
    var mensaje = reglas.generarMensajeVehiculo(alerta, clasificacion);
    var enviados = await enviarAlertaADestinatarios(mensaje, clasificacion, null);
    totalEnviadas += enviados;

    // Bloquear vehículo si el documento venció
    if (reglas.debeBloquear(alerta.tipo_documento, alerta.dias_restantes)) {
      var motivo = alerta.tipo_documento + ' vencido — ' + reglas.formatearFecha(alerta.fecha_vencimiento);
      var bloqueado = await alertasData.bloquearVehiculo(alerta.placa, motivo);
      if (bloqueado) totalBloqueados++;
    }
  }

  return { alertas: alertas.length, enviadas: totalEnviadas, bloqueados: totalBloqueados };
}

// ───────────────────────────────────────────────────────────
// Procesa alertas de licencias de conducción
// ───────────────────────────────────────────────────────────
async function procesarAlertasLicencias() {
  var alertas = await alertasData.obtenerVencimientosLicencias();
  var totalEnviadas = 0;

  for (var i = 0; i < alertas.length; i++) {
    var alerta = alertas[i];
    var clasificacion = reglas.clasificarAlerta(alerta.dias_restantes);
    if (!clasificacion) continue;

    // Generar mensaje de licencia
    var mensaje = reglas.generarMensajeLicencia(alerta, clasificacion);

    // Al conductor se le notifica directamente en alertas urgentes y críticas
    var notificarConductor = (alerta.dias_restantes <= 15) ? alerta.telefono : null;
    var enviados = await enviarAlertaADestinatarios(mensaje, clasificacion, notificarConductor);
    totalEnviadas += enviados;
  }

  return { alertas: alertas.length, enviadas: totalEnviadas };
}

// ───────────────────────────────────────────────────────────
// Ejecuta el ciclo completo de alertas
// Se llama desde el cron job o manualmente para pruebas
// ───────────────────────────────────────────────────────────
async function ejecutarAlertasDiarias() {
  var inicio = new Date();
  console.log('═══════════════════════════════════════');
  console.log('🔔 CRON — Alertas de documentos');
  console.log('📅 ' + inicio.toISOString());
  console.log('═══════════════════════════════════════');

  try {
    // Procesar vehículos
    var resVehiculos = await procesarAlertasVehiculos();
    console.log('🚗 Vehículos — ' + resVehiculos.alertas + ' alertas, '
      + resVehiculos.enviadas + ' enviadas, '
      + resVehiculos.bloqueados + ' bloqueados');

    // Procesar licencias
    var resLicencias = await procesarAlertasLicencias();
    console.log('🪪 Licencias — ' + resLicencias.alertas + ' alertas, '
      + resLicencias.enviadas + ' enviadas');

    var duracion = ((new Date() - inicio) / 1000).toFixed(1);
    console.log('✓ Alertas completadas en ' + duracion + 's');
    console.log('═══════════════════════════════════════');

    return {
      vehiculos: resVehiculos,
      licencias: resLicencias,
      duracion: duracion + 's'
    };
  } catch (error) {
    console.error('❌ Error en alertas diarias:', error.message);
    return null;
  }
}

// ───────────────────────────────────────────────────────────
// Registra el cron job — se llama desde index.js
// Horario: 6:00 AM hora Colombia (UTC-5) = 11:00 UTC
// ───────────────────────────────────────────────────────────
function registrarCronAlertas() {
  // Cron: minuto 0, hora 11 UTC = 6:00 AM Colombia
  cron.schedule('0 11 * * *', async function () {
    await ejecutarAlertasDiarias();
  }, {
    timezone: 'America/Bogota'
  });

  console.log('✓ Cron de alertas registrado — 6:00 AM Colombia');
}

module.exports = {
  registrarCronAlertas,
  ejecutarAlertasDiarias,
  enviarWhatsApp
};
