var PDFDocument = require('pdfkit');
var axios = require('axios');
var config = require('../config/config');
var posoperacionalesData = require('../data/posoperacionales');

var BUCKET_POSOP = process.env.STORAGE_BUCKET_POSOPERACIONALES || config.STORAGE_BUCKET_PREOPERACIONALES || 'preoperacionales';

async function descargarImagen(url) {
  if (!url) return null;

  try {
    var requestConfig = {
      responseType: 'arraybuffer',
      timeout: 12000,
      headers: {}
    };

    if (config.TWILIO_ACCOUNT_SID && config.TWILIO_AUTH_TOKEN) {
      var credentials = Buffer.from(config.TWILIO_ACCOUNT_SID + ':' + config.TWILIO_AUTH_TOKEN).toString('base64');
      requestConfig.headers.Authorization = 'Basic ' + credentials;
    }

    var response = await axios.get(url, requestConfig);
    return Buffer.from(response.data);
  } catch (error) {
    console.error('No se pudo descargar imagen para PDF posoperacional:', error.message || error);
    return null;
  }
}

async function generarPDFPosoperacional(datosSesion) {
  var fotos = Array.isArray(datosSesion.fotos) ? datosSesion.fotos : [];
  var fotosDescargadas = [];

  for (var i = 0; i < fotos.length; i++) {
    var foto = fotos[i];
    var buffer = await descargarImagen(foto.url);
    fotosDescargadas.push({ info: foto, buffer: buffer });
  }

  return await new Promise(function(resolve, reject) {
    try {
      var doc = new PDFDocument({ size: 'LETTER', margin: 42 });
      var chunks = [];
      doc.on('data', function(chunk) { chunks.push(chunk); });
      doc.on('end', function() { resolve(Buffer.concat(chunks)); });
      doc.on('error', reject);

      var y = 42;
      doc.font('Helvetica-Bold').fontSize(16).text('CERO | Posoperacional', 42, y);
      y += 22;
      doc.font('Helvetica').fontSize(9).text('Registro legal resumido con kilometraje, alertas y evidencias fotograficas.', 42, y);
      y += 22;

      doc.moveTo(42, y).lineTo(570, y).strokeColor('#cccccc').stroke();
      y += 12;

      function linea(label, valor) {
        doc.font('Helvetica-Bold').fontSize(9).text(label + ':', 42, y, { continued: true });
        doc.font('Helvetica').fontSize(9).text(' ' + (valor == null || valor === '' ? 'N/R' : String(valor)));
        y += 14;
      }

      linea('Vehiculo', datosSesion.placa || 'N/R');
      linea('Conductor', datosSesion.conductorNombre || 'N/R');
      linea('Telefono', datosSesion.conductorTelefono || 'N/R');
      linea('Fecha', datosSesion.fechaTexto || 'N/R');
      linea('Kilometraje final', (datosSesion.kilometrajeFinal || 0).toLocaleString('es-CO') + ' km');

      if (typeof datosSesion.kmReferencia === 'number') {
        linea('Kilometraje referencia', datosSesion.kmReferencia.toLocaleString('es-CO') + ' km (' + (datosSesion.kmReferenciaOrigen || 'referencia') + ')');
      }

      if (typeof datosSesion.diferenciaKm === 'number') {
        linea('Diferencia', (datosSesion.diferenciaKm >= 0 ? '+' : '') + datosSesion.diferenciaKm.toLocaleString('es-CO') + ' km');
      }

      y += 6;
      doc.font('Helvetica-Bold').fontSize(11).text('Alertas de kilometraje', 42, y);
      y += 16;
      if (datosSesion.alertasKm && datosSesion.alertasKm.length) {
        datosSesion.alertasKm.forEach(function(alerta) {
          doc.font('Helvetica').fontSize(9).text('• ' + (alerta.tipo || 'ALERTA') + ': ' + (alerta.mensaje || ''), 50, y, { width: 510 });
          y = doc.y + 4;
        });
      } else {
        doc.font('Helvetica').fontSize(9).text('Sin alertas de kilometraje.', 50, y);
        y = doc.y + 8;
      }

      y += 2;
      doc.font('Helvetica-Bold').fontSize(11).text('Novedades reportadas', 42, y);
      y += 16;
      if (datosSesion.novedades && datosSesion.novedades.length) {
        datosSesion.novedades.forEach(function(novedad) {
          var lineaTexto = '• [' + novedad.categoria + '] ' + novedad.item + ' - ' + (novedad.estado || 'Con novedad');
          if (novedad.critico) lineaTexto += ' (critica)';
          doc.font('Helvetica').fontSize(9).text(lineaTexto, 50, y, { width: 510 });
          y = doc.y + 2;
          if (novedad.texto_original) {
            doc.font('Helvetica-Oblique').fontSize(8).text('"' + novedad.texto_original + '"', 62, y, { width: 498 });
            y = doc.y + 4;
          }
        });
      } else {
        doc.font('Helvetica').fontSize(9).text('Sin novedades reportadas.', 50, y);
        y = doc.y + 8;
      }

      if (datosSesion.observacion) {
        y += 4;
        doc.font('Helvetica-Bold').fontSize(11).text('Observacion final', 42, y);
        y += 16;
        doc.font('Helvetica').fontSize(9).text(datosSesion.observacion, 50, y, { width: 510 });
        y = doc.y + 10;
      }

      if (y > 620) {
        doc.addPage();
        y = 42;
      }

      doc.font('Helvetica-Bold').fontSize(11).text('Evidencia fotografica', 42, y);
      y += 18;

      if (!fotosDescargadas.length) {
        doc.font('Helvetica').fontSize(9).text('No se adjuntaron fotos.', 50, y);
      } else {
        for (var f = 0; f < fotosDescargadas.length; f++) {
          var actual = fotosDescargadas[f];
          if (y > 650) {
            doc.addPage();
            y = 42;
          }

          var titulo = (actual.info.tipo || 'foto').toUpperCase() + ' - ' + (actual.info.descripcion || 'Sin descripcion');
          doc.font('Helvetica-Bold').fontSize(9).text(titulo, 42, y);
          y += 14;

          if (actual.buffer) {
            try {
              doc.image(actual.buffer, 42, y, { fit: [240, 180], align: 'left', valign: 'top' });
              y += 190;
            } catch (error) {
              doc.font('Helvetica').fontSize(8).text('No se pudo incrustar esta imagen en el PDF.', 50, y);
              y += 18;
            }
          } else {
            doc.font('Helvetica').fontSize(8).text('No se pudo descargar esta imagen.', 50, y);
            y += 18;
          }
        }
      }

      if (y > 700) {
        doc.addPage();
        y = 42;
      }

      y += 12;
      doc.moveTo(42, y).lineTo(570, y).strokeColor('#cccccc').stroke();
      y += 16;
      doc.font('Helvetica-Bold').fontSize(10).text('Firma digital del conductor', 42, y);
      y += 16;
      doc.font('Helvetica').fontSize(9).text('El conductor confirma que la informacion suministrada corresponde al estado del vehiculo al finalizar la jornada.', 42, y, { width: 528 });
      y = doc.y + 12;
      doc.font('Helvetica').fontSize(9).text('Marcado como firmado: ' + (datosSesion.firmado ? 'SI' : 'NO'), 42, y);
      y += 14;
      doc.text('Fecha de firma: ' + (datosSesion.fechaTexto || 'N/R'), 42, y);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

async function subirYEnviarPDFPosoperacional(datosSesion, posoperacionalId, telefono) {
  try {
    var pdfBuffer = await generarPDFPosoperacional(datosSesion);
    var nombreArchivo = 'posop_' + (datosSesion.placa || 'vehiculo') + '_' + Date.now() + '.pdf';

    var uploadResult = await config.supabase.storage
      .from(BUCKET_POSOP)
      .upload(nombreArchivo, pdfBuffer, { contentType: 'application/pdf', upsert: false });

    if (uploadResult.error) {
      console.error('Error subiendo PDF posoperacional:', uploadResult.error.message || uploadResult.error);
      return null;
    }

    var signedUrlResult = await config.supabase.storage
      .from(BUCKET_POSOP)
      .createSignedUrl(nombreArchivo, 60 * 60 * 24 * 7);

    if (signedUrlResult.error || !signedUrlResult.data || !signedUrlResult.data.signedUrl) {
      console.error('Error generando URL firmada posoperacional:', signedUrlResult.error && (signedUrlResult.error.message || signedUrlResult.error));
      return null;
    }

    var pdfUrl = signedUrlResult.data.signedUrl;
    await posoperacionalesData.actualizarPdfPosoperacional(posoperacionalId, pdfUrl);

    try {
      await config.twilioClient.messages.create({
        from: config.TWILIO_WHATSAPP_NUMBER,
        to: telefono,
        body: '📄 *PDF Posoperacional*\n' + (datosSesion.placa || '') + ' | ' + (datosSesion.fechaTexto || '') + '\n\nDescarga aquí:\n' + pdfUrl
      });
    } catch (envioError) {
      console.error('No se pudo enviar PDF posoperacional por WhatsApp:', envioError.message || envioError);
    }

    return pdfUrl;
  } catch (error) {
    console.error('Error general PDF posoperacional:', error.message || error);
    return null;
  }
}

module.exports = {
  generarPDFPosoperacional,
  subirYEnviarPDFPosoperacional
};
