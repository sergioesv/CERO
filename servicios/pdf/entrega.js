// ============================================================================
// servicios/pdf/entrega.js
//
// Responsabilidad única (SRP): ENTREGA de PDFs ya generados.
//   - Subir el buffer a Supabase Storage y obtener URL firmada
//   - Enviar el enlace por WhatsApp vía Twilio
//   - Fecha Colombia centralizada para nombrar/fechar documentos
//
// La GENERACIÓN vive en GeneradorPDFBase.js y sus subclases.
// Extraído de servicios/pdf/base.js (eliminado — motor legacy muerto).
// ============================================================================

'use strict';

var config = require('../../config/config');

// ─────────────────────────────────────────────────────────────────────────────
// Fecha Colombia — UTC-5, función centralizada
// ─────────────────────────────────────────────────────────────────────────────
function obtenerFechaColombia() {
  var ahora = new Date();
  return new Date(ahora.getTime() - (5 * 60 * 60 * 1000));
}

// ─────────────────────────────────────────────────────────────────────────────
// Sube un buffer PDF a Supabase Storage y retorna la URL firmada (7 días)
// Retorna null si falla
// ─────────────────────────────────────────────────────────────────────────────
async function subirPDF(buffer, bucket, nombreArchivo) {
  var uploadResult = await config.supabase.storage
    .from(bucket)
    .upload(nombreArchivo, buffer, { contentType: 'application/pdf', upsert: false });

  if (uploadResult.error) {
    console.error('Error subiendo PDF:', uploadResult.error.message || uploadResult.error);
    return null;
  }

  var signedResult = await config.supabase.storage
    .from(bucket)
    .createSignedUrl(nombreArchivo, 60 * 60 * 24 * 7);

  if (signedResult.error || !signedResult.data || !signedResult.data.signedUrl) {
    console.error('Error generando URL firmada:', signedResult.error && (signedResult.error.message || signedResult.error));
    return null;
  }

  return signedResult.data.signedUrl;
}

// ─────────────────────────────────────────────────────────────────────────────
// Envía el PDF por WhatsApp via Twilio
// opciones: { placa, fechaTexto, titulo }
// ─────────────────────────────────────────────────────────────────────────────
async function enviarPDFWhatsApp(pdfUrl, telefono, opciones) {
  var opts = opciones || {};
  var titulo = opts.titulo || 'PDF';
  var placa  = opts.placa  || '';
  var fecha  = opts.fechaTexto || '';

  try {
    await config.twilioClient.messages.create({
      from: config.TWILIO_WHATSAPP_NUMBER,
      to:   telefono,
      body: '📄 *' + titulo + '*\n' + placa + ' | ' + fecha + '\n\nDescarga aqui:\n' + pdfUrl
    });
    return true;
  } catch (e) {
    console.error('Error enviando PDF por WhatsApp:', e.message || e);
    return false;
  }
}

module.exports = {
  obtenerFechaColombia,
  subirPDF,
  enviarPDFWhatsApp
};
