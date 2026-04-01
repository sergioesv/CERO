/**
 * Generador de PDF para inspecciones preoperacionales.
 * Usa el motor base (base.js) y agrega el contenido específico del preop:
 * hero del vehículo, sección de novedades críticas y bloques de inspección.
 */

'use strict';

var base        = require('./base');
var config      = require('../../config/config');
var GRUPOS      = require('../../modulos/vehiculos/preoperacional/validaciones').GRUPOS;
var utils       = require('../../modulos/vehiculos/preoperacional/validaciones');

var C = base.LAYOUT.colores;
var M = base.LAYOUT.margin;
var PAGE_W  = base.LAYOUT.PAGE_W;
var PAGE_H  = base.LAYOUT.PAGE_H;
var CONTENT_W = base.LAYOUT.anchoUtil;

// ─────────────────────────────────────────────────────────────────────────────
// Genera el buffer PDF del preoperacional
// ─────────────────────────────────────────────────────────────────────────────
async function generarPDF(sesion) {
  // Descargar fotos en paralelo
  var fotosDescargadas = await base.descargarImagenes(sesion.fotos || []);

  return new Promise(function(resolve, reject) {
    try {
      var doc      = base.crearDocumento();
      var chunks   = [];
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
          base.agregarHeaderSecundaria(doc, sesion.placa, fecha);
          base.agregarFooter(doc, numPagina);
          return 46;
        }
        return y;
      }

      // ── PÁGINA 1 ─────────────────────────────────────────────────────────
      base.agregarFooter(doc, numPagina);
      var y = base.agregarHeaderPrimera(doc, {
        subtitulo:  'Inspeccion Preoperacional de Vehiculo',
        codDoc:     'COD: I-GL-001-F04 V05',
        resolucion: 'RES: 40595 DE 2022 (PESV)'
      });

      // Hero del vehículo
      y = base.agregarHeroVehiculo(doc, y + 5, sesion.vehiculo, sesion.placa);

      // Tarjetas de info
      var conductor    = sesion.conductor || {};
      var nombreCond   = conductor.nombre || 'N/R';
      var licenciaCat  = conductor.licencia_categoria ? 'Cat. ' + conductor.licencia_categoria : 'N/R';
      var diaNum       = ahora.getDate();
      var mesNombre    = ahora.toLocaleDateString('es-CO', { month: 'long' });
      var horaStr      = ahora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
      var fechaCorta   = diaNum + '/' + mesNombre.charAt(0).toUpperCase() + mesNombre.slice(1) + ' ' + horaStr;

      y = base.agregarTarjetasInfo(doc, y, [
        { label: 'PILOTO',   value: nombreCond },
        { label: 'LICENCIA', value: licenciaCat },
        { label: 'ODOMETRO', value: (sesion.kilometraje || 0) + ' km' },
        { label: 'FECHA',    value: fechaCorta }
      ]);

      // Documentos vigentes
      y = checkY(y, 80);
      y = base.agregarSeccionDocumentos(doc, y, sesion.vehiculo, conductor);

      // ── NOVEDADES CRÍTICAS ───────────────────────────────────────────────
      var novedades = sesion.novedades || [];
      if (novedades.length > 0) {
        y = checkY(y, 30);
        doc.rect(M, y, CONTENT_W, 18).fill(C.negro);
        doc.fill('#ffffff').fontSize(8).font('Helvetica-Bold')
          .text('NOVEDADES CRITICAS REPORTADAS', M + 10, y + 5);
        y += 25;

        for (var ni = 0; ni < novedades.length; ni++) {
          y = checkY(y, 36);
          var nov = novedades[ni];
          var novColor = nov.critico ? C.rojo : C.amarillo;

          doc.rect(M, y, 3, 28).fill(novColor);
          doc.fill(C.negro).fontSize(8).font('Helvetica-Bold')
            .text(nov.grupo || '', M + 10, y + 2);

          var estadoDesc = nov.nota || nov.estado || '';
          doc.fill(novColor).fontSize(8).font('Helvetica-Bold')
            .text(
              (nov.item || '') + (estadoDesc ? ' (' + estadoDesc.toUpperCase() + ')' : ''),
              M + 10, y + 14
            );

          if (nov.critico) {
            doc.rect(480, y + 5, 80, 14).fill(C.rojoCla);
            doc.fill(C.rojo).fontSize(6).font('Helvetica-Bold')
              .text('Alerta Supervisor', 485, y + 9);
          }
          y += 35;
        }
      }

      // ── BLOQUES DE INSPECCIÓN ────────────────────────────────────────────
      for (var g = 0; g < GRUPOS.length; g++) {
        var grupo = GRUPOS[g];
        y = checkY(y, 40);

        doc.rect(M, y, CONTENT_W, 16).fill(C.grisFondo);
        doc.fill(C.negro).fontSize(8).font('Helvetica-Bold')
          .text(grupo.nombre, M + 10, y + 4);
        y += 22;

        var respuesta      = (sesion.respuestas && sesion.respuestas[grupo.id]) ? sesion.respuestas[grupo.id] : null;
        var itemsReportados = (respuesta && respuesta.items) ? respuesta.items : [];
        var mapaEstados    = {};
        for (var ri = 0; ri < itemsReportados.length; ri++) {
          mapaEstados[itemsReportados[ri].nombre] = itemsReportados[ri].estado;
        }

        for (var j = 0; j < grupo.items.length; j++) {
          y = checkY(y, 22);
          var itemDef     = grupo.items[j];
          var estadoVal   = mapaEstados.hasOwnProperty(itemDef.nombre) ? mapaEstados[itemDef.nombre] : 'OK';
          var clasificacion = utils.clasificarEstado(estadoVal);
          var estadoTexto   = typeof estadoVal === 'number'
            ? (estadoVal === 1 ? 'OK' : estadoVal === 2 ? 'Atencion' : estadoVal === 3 ? 'Malo' : 'N/A')
            : (estadoVal || 'OK');

          var estadoColor = C.verde;
          if (clasificacion === 'advertencia') estadoColor = C.amarillo;
          else if (clasificacion === 'na')     estadoColor = C.grisCla;
          else if (clasificacion !== 'ok')     estadoColor = C.rojo;

          doc.fill(C.negro).fontSize(8).font('Helvetica')
            .text(itemDef.nombre, M + 10, y);
          doc.fill(estadoColor).fontSize(8).font('Helvetica-Bold')
            .text(estadoTexto, 405, y, { width: 135, align: 'right' });

          y += 12;
          doc.moveTo(M + 10, y).lineTo(PAGE_W - M, y)
            .strokeColor(C.grisLin).lineWidth(0.3).stroke();
          y += 8;
        }
        y += 5;
      }

      // ── OBSERVACIONES ────────────────────────────────────────────────────
      if (sesion.observacion) {
        y = checkY(y, 50);
        doc.rect(M, y, CONTENT_W, 16).fill(C.grisFondo);
        doc.fill(C.negro).fontSize(8).font('Helvetica-Bold')
          .text('OBSERVACIONES', M + 10, y + 4);
        y += 22;
        doc.fill(C.grisOsc).fontSize(8).font('Helvetica')
          .text(sesion.observacion, M + 10, y, { width: 500 });
        y += 25;
      }

      // ── FOTOS ─────────────────────────────────────────────────────────────
      y = base.agregarFotos(doc, y, fotosDescargadas, checkY);

      // ── FIRMA DIGITAL ─────────────────────────────────────────────────────
      y = checkY(y, 120);
      base.agregarFirmaDigital(doc, y, {
        nombre:   conductor.nombre,
        cedula:   conductor.cedula,
        telefono: sesion.telefono || conductor.telefono,
        fecha:    ahora,
        placa:    sesion.placa
      });

      doc.end();

    } catch (error) {
      console.error('Error generando PDF preoperacional:', error);
      reject(error);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Sube el PDF, guarda la URL en BD y lo envía por WhatsApp
// ─────────────────────────────────────────────────────────────────────────────
async function subirYEnviarPDF(sesion, preoperacionalId, telefono) {
  try {
    var pdfBuffer    = await generarPDF(sesion);
    var nombreArchivo = 'preop_' + (sesion.placa || 'x') + '_' + Date.now() + '.pdf';
    var bucket       = config.STORAGE_BUCKET_PREOPERACIONALES;

    var pdfUrl = await base.subirPDF(pdfBuffer, bucket, nombreArchivo);
    if (!pdfUrl) return null;

    // Guardar URL en base de datos
    await config.supabase
      .from(config.TABLES.preoperacionales)
      .update({ pdf_url: pdfUrl })
      .eq('id', preoperacionalId);

    // Enviar por WhatsApp
    var ahora = base.obtenerFechaColombia();
    await base.enviarPDFWhatsApp(pdfUrl, telefono, {
      titulo:    'PDF Preoperacional',
      placa:     sesion.placa,
      fechaTexto: ahora.toLocaleDateString('es-CO')
    });

    return pdfUrl;
  } catch (error) {
    console.error('Error en subirYEnviarPDF preoperacional:', error.message || error);
    return null;
  }
}

module.exports = { generarPDF, subirYEnviarPDF };
