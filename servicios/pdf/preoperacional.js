/**
 * Generador de PDF para inspecciones preoperacionales.
 * Generación: GeneradorPDFPreoperacional (clase).
 * Entrega (subida a Storage + envío WhatsApp): servicios/pdf/entrega.js.
 */

'use strict';

var config  = require('../../config/config');
var entrega = require('./entrega');
const GeneradorPDFPreoperacional = require('./GeneradorPDFPreoperacional');

// ─────────────────────────────────────────────────────────────────────────────
// Genera el buffer PDF del preoperacional
// ─────────────────────────────────────────────────────────────────────────────
async function generarPDF(sesion) {
  try {
    const generador = new GeneradorPDFPreoperacional();
    return await generador.generar(sesion);
  } catch (error) {
    console.error('Error generando PDF preoperacional con clase:', error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sube el PDF, guarda la URL en BD y lo envía por WhatsApp
// ─────────────────────────────────────────────────────────────────────────────
async function subirYEnviarPDF(sesion, preoperacionalId, telefono) {
  try {
    var pdfBuffer     = await generarPDF(sesion);
    var nombreArchivo = 'preop_' + (sesion.placa || 'x') + '_' + Date.now() + '.pdf';
    var bucket        = config.STORAGE_BUCKET_PREOPERACIONALES;

    var pdfUrl = await entrega.subirPDF(pdfBuffer, bucket, nombreArchivo);
    if (!pdfUrl) return null;

    // Guardar URL en base de datos
    await config.supabase
      .from(config.TABLES.preoperacionales)
      .update({ pdf_url: pdfUrl })
      .eq('id', preoperacionalId);

    // Enviar por WhatsApp
    var ahora = entrega.obtenerFechaColombia();
    await entrega.enviarPDFWhatsApp(pdfUrl, telefono, {
      titulo:     'PDF Preoperacional',
      placa:      sesion.placa,
      fechaTexto: ahora.toLocaleDateString('es-CO')
    });

    return pdfUrl;
  } catch (error) {
    console.error('Error en subirYEnviarPDF preoperacional:', error.message || error);
    return null;
  }
}

module.exports = { generarPDF, subirYEnviarPDF };
