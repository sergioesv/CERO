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

var base   = require('./base');
var config = require('../../config/config');

var C       = base.LAYOUT.colores;
var M       = base.LAYOUT.margin;
var PAGE_H  = base.LAYOUT.PAGE_H;
var CONTENT_W = base.LAYOUT.anchoUtil;

// ─────────────────────────────────────────────────────────────────────────────
// Genera el buffer PDF del posoperacional
// datosSesion: objeto construido en cierre.js del posoperacional
// ─────────────────────────────────────────────────────────────────────────────
async function generarPDF(datosSesion) {
  var fotos = Array.isArray(datosSesion.fotos) ? datosSesion.fotos : [];
  var fotosDescargadas = await base.descargarImagenes(fotos);

  return new Promise(function(resolve, reject) {
    try {
      var doc       = base.crearDocumento();
      var chunks    = [];
      var numPagina = 1;

      doc.on('data', function(c) { chunks.push(c); });
      doc.on('end',  function()  { resolve(Buffer.concat(chunks)); });
      doc.on('error', reject);

      var ahora = base.obtenerFechaColombia();
      var fecha  = ahora.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });

      // Helper: verificar espacio y agregar página si es necesario
      function checkY(y, needed) {
        if (y + needed > PAGE_H - 50) {
          numPagina++;
          doc.addPage({ size: 'LETTER', margins: { top: M, bottom: M, left: M, right: M } });
          base.agregarHeaderSecundaria(doc, 'POSOPERACIONAL', fecha);
          base.agregarFooter(doc, numPagina);
          return 46;
        }
        return y;
      }

      // ── PÁGINA 1 ─────────────────────────────────────────────────────────
      base.agregarFooter(doc, numPagina);
      var y = base.agregarHeaderPrimera(doc, {
        subtitulo:  'Cierre de Jornada — Posoperacional',
        codDoc:     'COD: POSOP-001',
        resolucion: 'RES: 40595 DE 2022 (PESV)'
      });

      // Tarjetas de info: Conductor, Cédula, Km final, Fecha
      var kmFinal = (datosSesion.kilometrajeFinal || 0).toLocaleString('es-CO') + ' km';
      var diaNum   = ahora.getDate();
      var mesNom   = ahora.toLocaleDateString('es-CO', { month: 'long' });
      var horaStr  = ahora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
      var fechaCorta = diaNum + '/' + mesNom.charAt(0).toUpperCase() + mesNom.slice(1) + ' ' + horaStr;

      y = base.agregarTarjetasInfo(doc, y, [
        { label: 'CONDUCTOR', value: datosSesion.conductorNombre || 'N/R' },
        { label: 'CEDULA',    value: datosSesion.conductorCedula  || 'N/R' },
        { label: 'KM FINAL',  value: kmFinal },
        { label: 'FECHA',     value: fechaCorta }
      ]);

      // Fila de km referencia y diferencia
      if (typeof datosSesion.kmReferencia === 'number') {
        y = checkY(y, 18);
        var difTexto = '';
        if (typeof datosSesion.diferenciaKm === 'number') {
          difTexto = ' (' + (datosSesion.diferenciaKm >= 0 ? '+' : '') +
            datosSesion.diferenciaKm.toLocaleString('es-CO') + ' km)';
        }
        var origenRef = datosSesion.kmReferenciaOrigen ? ' — ' + datosSesion.kmReferenciaOrigen : '';
        doc.fill(C.gris).fontSize(8).font('Helvetica')
          .text(
            'Km de referencia: ' + datosSesion.kmReferencia.toLocaleString('es-CO') +
            ' km' + origenRef + difTexto,
            M + 10, y
          );
        y += 16;
      }

      // Alertas de kilometraje (si las hay)
      if (datosSesion.alertasKm && datosSesion.alertasKm.length > 0) {
        y = checkY(y, 30);
        doc.rect(M, y, CONTENT_W, 16).fill(C.rojoCla);
        doc.fill(C.rojo).fontSize(8).font('Helvetica-Bold')
          .text('ALERTAS DE KILOMETRAJE', M + 10, y + 4);
        y += 22;
        datosSesion.alertasKm.forEach(function(alerta) {
          y = checkY(y, 16);
          doc.fill(C.rojo).fontSize(8).font('Helvetica')
            .text('• ' + (alerta.mensaje || alerta.tipo || 'Alerta'), M + 10, y, { width: CONTENT_W - 20 });
          y = doc.y + 4;
        });
        y += 4;
      }

      // ── DOCUMENTOS VIGENTES ───────────────────────────────────────────────
      y = checkY(y, 80);
      var vehiculoPosop  = datosSesion.vehiculo  || {};
      var conductorPosop = {
        licencia_vencimiento: datosSesion.conductorLicenciaVencimiento || null
      };
      y = base.agregarSeccionDocumentos(doc, y, vehiculoPosop, conductorPosop);

      // ── NOVEDAD DEL CIERRE ────────────────────────────────────────────────
      var novedades = datosSesion.novedades || [];
      if (novedades.length > 0) {
        y = checkY(y, 30);
        doc.rect(M, y, CONTENT_W, 16).fill(C.negro);
        doc.fill('#ffffff').fontSize(8).font('Helvetica-Bold')
          .text('NOVEDAD REPORTADA AL CIERRE', M + 10, y + 4);
        y += 22;

        for (var ni = 0; ni < novedades.length; ni++) {
          var nov = novedades[ni];
          y = checkY(y, 40);

          // Color de borde según clasificación
          var borderColor = C.grisLin;
          var etiquetaSev = 'LEVE';
          if (nov.severidad === 'critica' || nov.critico) {
            borderColor = C.rojo;
            etiquetaSev = 'CRITICA';
          } else if (nov.severidad === 'moderada') {
            borderColor = C.naranja;
            etiquetaSev = 'MODERADA';
          }

          doc.rect(M, y, 3, 32).fill(borderColor);

          // Etiqueta de severidad
          doc.rect(M + 8, y, 60, 13).fill(borderColor);
          doc.fill('#ffffff').fontSize(6).font('Helvetica-Bold')
            .text(etiquetaSev, M + 10, y + 3);

          // Texto de la novedad
          var textoNov = nov.texto || nov.estado || nov.novedadesTexto || 'Sin descripción';
          doc.fill(C.negro).fontSize(8).font('Helvetica')
            .text(textoNov, M + 76, y + 2, { width: CONTENT_W - 80 });

          y = doc.y + 12;
        }
      } else {
        y = checkY(y, 20);
        doc.fill(C.verde).fontSize(8).font('Helvetica-Bold')
          .text('✓ Sin novedades reportadas al cierre', M + 10, y);
        y += 20;
      }

      // ── OBSERVACIÓN FINAL ─────────────────────────────────────────────────
      if (datosSesion.observacion) {
        y = checkY(y, 50);
        doc.rect(M, y, CONTENT_W, 16).fill(C.grisFondo);
        doc.fill(C.negro).fontSize(8).font('Helvetica-Bold')
          .text('OBSERVACION FINAL', M + 10, y + 4);
        y += 22;
        doc.fill(C.grisOsc).fontSize(8).font('Helvetica')
          .text(datosSesion.observacion, M + 10, y, { width: 500 });
        y = doc.y + 14;
      }

      // ── FOTOS ─────────────────────────────────────────────────────────────
      y = base.agregarFotos(doc, y, fotosDescargadas, checkY);

      // ── FIRMA DIGITAL ─────────────────────────────────────────────────────
      y = checkY(y, 120);
      base.agregarFirmaDigital(doc, y, {
        nombre:   datosSesion.conductorNombre,
        cedula:   datosSesion.conductorCedula,
        telefono: datosSesion.conductorTelefono,
        fecha:    ahora
        // placa removida intencionalmente - posoperacional no muestra placa en PDF
      });

      doc.end();

    } catch (error) {
      console.error('Error generando PDF posoperacional:', error);
      reject(error);
    }
  });
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
