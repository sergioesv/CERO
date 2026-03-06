var PDFDocument = require('pdfkit');
var config = require('./config');
var GRUPOS = require('./grupos').GRUPOS;

async function generarPDF(sesion) {
  return new Promise(function(resolve, reject) {
    try {
      var doc = new PDFDocument({ size: 'LETTER', margin: 50 });
      var chunks = [];

      doc.on('data', function(chunk) { chunks.push(chunk); });
      doc.on('end', function() { resolve(Buffer.concat(chunks)); });

      var ahora = new Date();
      var fecha = ahora.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
      var hora = ahora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

      // ===== ENCABEZADO =====
      doc.rect(0, 0, 612, 85).fill('#1a237e');

      doc.fill('#ffffff')
        .fontSize(18)
        .font('Helvetica-Bold')
        .text('INSPECCION PREOPERACIONAL DE VEHICULO', 50, 15, { align: 'center' });

      doc.fontSize(9)
        .font('Helvetica')
        .text('CERO - Sistema de Gestion de Operaciones de Campo', 50, 38, { align: 'center' });

      doc.fontSize(8)
        .text('Basado en formato I-GL-001-F04 Rev 05 | Codigo de prueba: CERO-PRE-001', 50, 52, { align: 'center' });

      doc.fontSize(8)
        .text('Resolucion 40595 de 2022 - Plan Estrategico de Seguridad Vial', 50, 66, { align: 'center' });

      doc.fill('#000000');

      // ===== DATOS DEL VEHICULO =====
      var y = 95;
      doc.rect(50, y, 512, 22).fill('#e8eaf6');
      doc.fill('#1a237e')
        .fontSize(11)
        .font('Helvetica-Bold')
        .text('DATOS DEL VEHICULO', 60, y + 6);
      doc.fill('#000000');

      y += 30;
      doc.fontSize(9).font('Helvetica');

      var datosVehiculo = [
        ['Placa', sesion.placa],
        ['Tipo', (sesion.vehiculo.tipo || '') + ' ' + (sesion.vehiculo.marca || '') + ' ' + (sesion.vehiculo.modelo || '')],
        ['Anio', String(sesion.vehiculo.anio || 'N/R')],
        ['Kilometraje', sesion.kilometraje + ' km'],
        ['Fecha', fecha],
        ['Hora', hora]
      ];

      for (var i = 0; i < datosVehiculo.length; i += 2) {
        var izq = datosVehiculo[i];
        var der = datosVehiculo[i + 1];
        doc.font('Helvetica-Bold').text(izq[0] + ':', 60, y);
        doc.font('Helvetica').text(izq[1], 150, y);
        if (der) {
          doc.font('Helvetica-Bold').text(der[0] + ':', 320, y);
          doc.font('Helvetica').text(der[1], 410, y);
        }
        y += 16;
      }

      // ===== DATOS DEL CONDUCTOR =====
      y += 8;
      doc.rect(50, y, 512, 22).fill('#e8eaf6');
      doc.fill('#1a237e')
        .fontSize(11)
        .font('Helvetica-Bold')
        .text('DATOS DEL CONDUCTOR', 60, y + 6);
      doc.fill('#000000');

      y += 30;
      doc.fontSize(9);

      if (sesion.conductor) {
        doc.font('Helvetica-Bold').text('Nombre:', 60, y);
        doc.font('Helvetica').text(sesion.conductor.nombre, 150, y);
        doc.font('Helvetica-Bold').text('Cedula:', 320, y);
        doc.font('Helvetica').text(sesion.conductor.cedula, 410, y);
        y += 16;
        doc.font('Helvetica-Bold').text('Licencia:', 60, y);
        doc.font('Helvetica').text(sesion.conductor.licencia_categoria || 'N/R', 150, y);
        doc.font('Helvetica-Bold').text('Telefono:', 320, y);
        doc.font('Helvetica').text(sesion.conductor.telefono, 410, y);
      } else {
        doc.font('Helvetica').text('Conductor no registrado', 60, y);
      }

      // ===== CONVENCIONES =====
      y += 25;
      doc.rect(50, y, 512, 18).fill('#f5f5f5');
      doc.fontSize(8).font('Helvetica-Bold').fill('#757575');
      doc.text('Convenciones: Bueno = OK | Regular = Requiere atencion | Malo = Requiere accion inmediata | N/A = No aplica', 60, y + 5);
      doc.fill('#000000');

      // ===== RESULTADO DE LA INSPECCION =====
      y += 28;
      doc.rect(50, y, 512, 22).fill('#e8eaf6');
      doc.fill('#1a237e')
        .fontSize(11)
        .font('Helvetica-Bold')
        .text('RESULTADO DE LA INSPECCION', 60, y + 6);
      doc.fill('#000000');

      y += 30;

      var estadoTexto = { 1: 'Bueno', 2: 'Regular', 3: 'Malo', 4: 'N/A' };
      var estadoColor = { 1: '#2e7d32', 2: '#f9a825', 3: '#c62828', 4: '#757575' };

      for (var g = 0; g < GRUPOS.length; g++) {
        var grupo = GRUPOS[g];
        var respuesta = sesion.respuestas[grupo.id];
        if (!respuesta) continue;

        if (y > 660) {
          doc.addPage();
          y = 50;
        }

        // Group header
        doc.rect(60, y, 492, 18).fill('#e8eaf6');
        doc.fill('#1a237e')
          .fontSize(9)
          .font('Helvetica-Bold')
          .text(grupo.nombre, 65, y + 5);
        doc.fill('#000000');

        y += 22;

        // Column headers
        doc.fontSize(7).font('Helvetica-Bold').fill('#757575');
        doc.text('ITEM', 70, y);
        doc.text('ESTADO', 250, y);
        doc.text('CRITICO', 320, y);
        doc.text('OBSERVACION', 380, y);
        doc.fill('#000000');
        y += 14;

        for (var j = 0; j < respuesta.items.length; j++) {
          var item = respuesta.items[j];

          if (y > 700) {
            doc.addPage();
            y = 50;
          }

          // Alternate row background
          if (j % 2 === 0) {
            doc.rect(60, y - 2, 492, 14).fill('#fafafa');
          }

          doc.fontSize(8).font('Helvetica').fill('#000000');
          doc.text('  ' + item.nombre, 70, y);

          var color = estadoColor[item.estado] || '#000000';
          doc.fill(color).font('Helvetica-Bold')
            .text(estadoTexto[item.estado] || 'N/R', 250, y);

          // Find if item is critical
          var esCritico = false;
          for (var k = 0; k < grupo.items.length; k++) {
            if (grupo.items[k].nombre === item.nombre) {
              esCritico = grupo.items[k].critico;
              break;
            }
          }
          doc.fill(esCritico ? '#c62828' : '#757575')
            .font('Helvetica')
            .fontSize(7)
            .text(esCritico ? 'SI' : 'NO', 330, y);

          doc.fill('#000000');
          if (item.nota) {
            doc.font('Helvetica').fontSize(7).fill('#c62828')
              .text(item.nota, 380, y, { width: 170 });
            doc.fill('#000000');
          }

          y += 14;
        }
        y += 6;
      }

      // ===== NOVEDADES =====
      if (sesion.novedades.length > 0) {
        if (y > 620) {
          doc.addPage();
          y = 50;
        }

        y += 8;
        doc.rect(50, y, 512, 22).fill('#ffebee');
        doc.fill('#c62828')
          .fontSize(11)
          .font('Helvetica-Bold')
          .text('NOVEDADES REPORTADAS', 60, y + 6);
        doc.fill('#000000');

        y += 30;

        for (var n = 0; n < sesion.novedades.length; n++) {
          var novedad = sesion.novedades[n];

          if (y > 700) {
            doc.addPage();
            y = 50;
          }

          // Check if critical
          var novedadCritica = false;
          for (var gc = 0; gc < GRUPOS.length; gc++) {
            if (GRUPOS[gc].nombre === novedad.grupo) {
              for (var ic = 0; ic < GRUPOS[gc].items.length; ic++) {
                if (GRUPOS[gc].items[ic].nombre === novedad.item) {
                  novedadCritica = GRUPOS[gc].items[ic].critico;
                }
              }
            }
          }

          var prefijo = novedadCritica ? '!! CRITICO - ' : '! ';

          doc.fontSize(9).font('Helvetica-Bold').fill('#c62828')
            .text(prefijo + novedad.grupo + ' - ' + novedad.item, 70, y);

          if (novedad.nota) {
            doc.font('Helvetica').fill('#000000').fontSize(8)
              .text('  ' + novedad.nota, 70, y + 13);
            y += 13;
          }
          doc.fill('#000000');
          y += 16;
        }

        if (novedadCritica) {
          y += 5;
          doc.rect(60, y, 492, 16).fill('#ffebee');
          doc.fontSize(8).font('Helvetica-Bold').fill('#c62828')
            .text('ALERTA: Se notifico al supervisor sobre items criticos con novedad', 70, y + 4);
          doc.fill('#000000');
          y += 20;
        }
      }

      // ===== OBSERVACIONES =====
      if (sesion.observacion) {
        if (y > 660) {
          doc.addPage();
          y = 50;
        }

        y += 8;
        doc.rect(50, y, 512, 22).fill('#e8eaf6');
        doc.fill('#1a237e')
          .fontSize(11)
          .font('Helvetica-Bold')
          .text('OBSERVACIONES', 60, y + 6);
        doc.fill('#000000');

        y += 30;
        doc.fontSize(9).font('Helvetica').text(sesion.observacion, 60, y, { width: 492 });
        y += 25;
      }

      // ===== FIRMA ELECTRONICA =====
      if (y > 620) {
        doc.addPage();
        y = 50;
      }

      y += 15;
      doc.rect(50, y, 512, 22).fill('#e8f5e9');
      doc.fill('#2e7d32')
        .fontSize(11)
        .font('Helvetica-Bold')
        .text('FIRMA ELECTRONICA', 60, y + 6);
      doc.fill('#000000');

      y += 30;
      doc.fontSize(9).font('Helvetica');

      var firmaData = [
        ['Confirmacion', 'SI - Firmado por WhatsApp'],
        ['Conductor', sesion.conductor ? sesion.conductor.nombre : 'No registrado'],
        ['Telefono', sesion.conductor ? sesion.conductor.telefono : 'N/R'],
        ['Fecha y hora', ahora.toLocaleString('es-CO')],
        ['Base legal', 'Ley 527/1999 - Decreto 2364/2012 - Firma electronica simple']
      ];

      for (var f = 0; f < firmaData.length; f++) {
        doc.font('Helvetica-Bold').text(firmaData[f][0] + ':', 60, y);
        doc.font('Helvetica').text(firmaData[f][1], 200, y);
        y += 15;
      }

      // ===== PIE DE PAGINA =====
      y += 25;
      doc.rect(50, y, 512, 1).fill('#cccccc');
      y += 8;
      doc.fontSize(7).fill('#999999').font('Helvetica')
        .text('Documento generado automaticamente por CERO - ' + ahora.toLocaleString('es-CO'), 50, y, { align: 'center' });
      doc.text('Formato basado en I-GL-001-F04 Rev 05 | Valido segun Resolucion 40595 de 2022 - PESV', 50, y + 10, { align: 'center' });

      doc.end();
    } catch (error) {
      console.error('Error generando PDF:', error);
      reject(error);
    }
  });
}

async function subirYEnviarPDF(sesion, preoperacionalId, telefono) {
  try {
    var pdfBuffer = await generarPDF(sesion);

    var fecha = new Date().toISOString().split('T')[0];
    var nombreArchivo = 'preop_' + sesion.placa + '_' + fecha + '_' + Date.now() + '.pdf';

    var uploadResult = await config.supabase.storage
      .from('preoperacionales')
      .upload(nombreArchivo, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: false
      });

    if (uploadResult.error) {
      console.error('Error subiendo PDF:', uploadResult.error);
      return;
    }

    var urlResult = config.supabase.storage
      .from('preoperacionales')
      .getPublicUrl(nombreArchivo);

    var pdfUrl = urlResult.data.publicUrl;

    await config.supabase
      .from('preoperacionales')
      .update({ pdf_url: pdfUrl })
      .eq('id', preoperacionalId);

    await config.twilioClient.messages.create({
      from: config.TWILIO_WHATSAPP_NUMBER,
      to: telefono,
      body: 'PDF Preoperacional - ' + sesion.placa + '\n' + new Date().toLocaleDateString('es-CO') + '\n\nDescarga aqui:\n' + pdfUrl
    });

    console.log('PDF enviado a ' + telefono + ': ' + pdfUrl);

  } catch (error) {
    console.error('Error en subirYEnviarPDF:', error);
  }
}

module.exports = { generarPDF, subirYEnviarPDF };
