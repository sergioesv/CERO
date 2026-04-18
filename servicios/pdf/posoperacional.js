/**
 * Generador de PDF para inspecciones posoperacionales.
 * Documento compacto (1 página en la mayoría de casos) que registra:
 * - Datos del conductor (nombre + cédula)
 * - Kilometraje final y referencia
 * - Estado de documentos al cierre
 * - Fotos del estado general del vehículo
 * - Novedad del cierre con clasificación y foto de evidencia
 * - Firma digital con cédula y timestamp
 */

'use strict';

const GeneradorPDFPosoperacional = require('./GeneradorPDFPosoperacional');
const base = require('./base');
const config = require('../../config/config');

// ─────────────────────────────────────────────────────────────────────────────
// Genera el buffer PDF del posoperacional
// datosSesion: objeto construido en cierre.js del posoperacional
// ─────────────────────────────────────────────────────────────────────────────
async function generarPDF(datosSesion) {
  try {
    const generador = new GeneradorPDFPosoperacional();
    return await generador.generar(datosSesion);
  } catch (error) {
    console.error('Error generando PDF posoperacional con clase:', error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sube el PDF, guarda la URL en BD y lo envía por WhatsApp
// ─────────────────────────────────────────────────────────────────────────────
async function subirYEnviarPDF(datosSesion, posoperacionalId, telefono) {
  try {
    var pdfBuffer     = await generarPDF(datosSesion);
    var nombreArchivo = 'posop_' + (datosSesion.placa || 'x') + '_' + Date.now() + '.pdf';
    var bucket        = process.env.STORAGE_BUCKET_POSOPERACIONALES ||
                        config.STORAGE_BUCKET_PREOPERACIONALES ||
                        'preoperacionales';

    var pdfUrl = await base.subirPDF(pdfBuffer, bucket, nombreArchivo);
    if (!pdfUrl) return null;

    // Guardar URL en base de datos
    await config.supabase
      .from('posoperacionales')
      .update({ pdf_url: pdfUrl })
      .eq('id', posoperacionalId);

    // Enviar por WhatsApp
    var ahora = base.obtenerFechaColombia();
    await base.enviarPDFWhatsApp(pdfUrl, telefono, {
      titulo:    'PDF Posoperacional',
      placa:     datosSesion.placa,
      fechaTexto: ahora.toLocaleDateString('es-CO')
    });

    return pdfUrl;
  } catch (error) {
    console.error('Error en subirYEnviarPDF posoperacional:', error.message || error);
    return null;
  }
}

// Alias histórico: cierre.js invoca subirYEnviarPDFPosoperacional
module.exports = {
  generarPDF,
  subirYEnviarPDF,
  subirYEnviarPDFPosoperacional: subirYEnviarPDF
};
