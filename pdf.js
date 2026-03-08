var PDFDocument = require('pdfkit');
var https = require('https');
var http = require('http');
var config = require('./config');
var GRUPOS = require('./grupos').GRUPOS;
var LOGO_BASE64 = require('./logo').LOGO_BASE64;

function descargarImagen(url) {
  return new Promise(function(resolve, reject) {
    var isTwilio = url.indexOf('twilio.com') >= 0 || url.indexOf('api.twilio.com') >= 0;

    if (isTwilio) {
      var credentials = Buffer.from(process.env.TWILIO_ACCOUNT_SID + ':' + process.env.TWILIO_AUTH_TOKEN).toString('base64');

      function seguirUrl(currentUrl, saltos) {
        if (saltos > 5) return reject(new Error('Demasiadas redirecciones'));
        var urlObj = new URL(currentUrl);
        var options = {
          hostname: urlObj.hostname,
          path: urlObj.pathname + urlObj.search,
          method: 'GET',
          headers: { 'Authorization': 'Basic ' + credentials }
        };
        var req = https.request(options, function(res) {
          if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
            res.resume();
            return seguirUrl(res.headers['location'], saltos + 1);
          }
          if (res.statusCode !== 200) {
            res.resume();
            return reject(new Error('HTTP ' + res.statusCode));
          }
          var chunks = [];
          res.on('data', function(c) { chunks.push(c); });
          res.on('end', function() { resolve(Buffer.concat(chunks)); });
        });
        req.on('error', reject);
        req.end();
      }
      seguirUrl(url, 0);
    } else {
      var client = url.startsWith('https') ? https : http;
      client.get(url, function(response) {
        if (response.statusCode === 301 || response.statusCode === 302) {
          descargarImagen(response.headers.location).then(resolve).catch(reject);
          return;
        }
        var chunks = [];
        response.on('data', function(c) { chunks.push(c); });
        response.on('end', function() { resolve(Buffer.concat(chunks)); });
        response.on('error', reject);
      }).on('error', reject);
    }
  });
}

async function generarPDF(sesion) {
  // Descargar fotos primero
  var fotosDescargadas = [];
  if (sesion.fotos && sesion.fotos.length > 0) {
    for (var d = 0; d < sesion.fotos.length; d++) {
      try {
        var imgBuffer = await descargarImagen(sesion.fotos[d].url);
        fotosDescargadas.push({ buffer: imgBuffer, info: sesion.fotos[d] });
      } catch (e) {
        console.error('Error descargando foto ' + d + ':', e.message);
        fotosDescargadas.push({ buffer: null, info: sesion.fotos[d] });
      }
    }
  }

  return new Promise(function(resolve, reject) {
    try {
      var doc = new PDFDocument({ size: 'LETTER', margin: 45 });
      var chunks = [];
      doc.on('data', function(chunk) { chunks.push(chunk); });
      doc.on('end', function() { resolve(Buffer.concat(chunks)); });
      doc.on('error', reject);

      var ahora = sesion.fecha ? new Date(sesion.fecha) : new Date();
      var fecha = ahora.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });

      var NEGRO       = '#1A1A1A';
      var GRIS_OSCURO = '#333333';
      var GRIS        = '#666666';
      var GRIS_CLARO  = '#999999';
      var GRIS_FONDO  = '#F5F5F5';
      var GRIS_LINEA  = '#E0E0E0';
      var VERDE       = '#2E7D32';
      var VERDE_CLARO = '#E8F5E9';
      var ROJO        = '#C62828';
      var ROJO_CLARO  = '#FFEBEE';
      var AMARILLO    = '#F9A825';

      // ===== THIN ACCENT BAR =====
      doc.rect(0, 0, 612, 5).fill(NEGRO);

      // ===== HEADER =====
      try {
        var logoBuffer = Buffer.from(LOGO_BASE64, 'base64');
        doc.image(logoBuffer, 45, 12, { width: 50, height: 45 });
      } catch (e) {}

      doc.fill(NEGRO).fontSize(9).font('Helvetica-Bold')
        .text('EDEMSA | CERO SYSTEM', 105, 18);
      doc.fill(GRIS_CLARO).fontSize(7).font('Helvetica')
        .text('Inspeccion Preoperacional de Vehiculo', 105, 30);

      doc.fill(GRIS_CLARO).fontSize(7).font('Helvetica')
        .text('COD: I-GL-001-F04 V05', 420, 18, { align: 'right', width: 147 });
      doc.text('RES: 40595 DE 2022 (PESV)', 420, 30, { align: 'right', width: 147 });

      doc.moveTo(45, 62).lineTo(567, 62).strokeColor(GRIS_LINEA).lineWidth(0.5).stroke();

      // ===== VEHICLE HERO =====
      var y = 72;
      var vehiculo = sesion.vehiculo || {};

      doc.fill(NEGRO).fontSize(20).font('Helvetica-Bold')
        .text((vehiculo.marca || '') + ' ' + (vehiculo.modelo || ''), 45, y);
      y += 24;

      doc.fill(NEGRO).fontSize(28).font('Helvetica-Bold')
        .text(sesion.placa || '', 45, y);

      doc.fill(GRIS).fontSize(8).font('Helvetica')
        .text(vehiculo.tipo || '', 420, 74, { align: 'right', width: 147 });
      doc.text('Anio ' + (vehiculo.anio || 'N/R'), 420, 86, { align: 'right', width: 147 });

      y += 35;
      doc.moveTo(45, y).lineTo(567, y).strokeColor(GRIS_LINEA).lineWidth(0.5).stroke();
      y += 12;

      // ===== INFO CARDS =====
      var conductor = sesion.conductor || {};
      var nombreConductor = conductor.nombre || 'N/R';
      var licenciaCat = conductor.licencia_categoria ? 'Cat. ' + conductor.licencia_categoria : 'N/R';
      var fechaCorta = fecha.split(' de ').slice(0, 2).join('/');

      var cardW = 123;
      var cards = [
        { label: 'PILOTO',   value: nombreConductor },
        { label: 'LICENCIA', value: licenciaCat },
        { label: 'ODOMETRO', value: (sesion.kilometraje || 0) + ' km' },
        { label: 'FECHA',    value: fechaCorta }
      ];

      for (var ci = 0; ci < cards.length; ci++) {
        var cx = 45 + ci * (cardW + 10);
        doc.rect(cx, y, cardW, 35).fill(GRIS_FONDO);
        doc.fill(GRIS_CLARO).fontSize(6).font('Helvetica-Bold')
          .text(cards[ci].label, cx + 8, y + 6, { width: cardW - 16 });
        doc.fill(NEGRO).fontSize(9).font('Helvetica-Bold')
          .text(cards[ci].value, cx + 8, y + 18, { width: cardW - 16 });
      }

      y += 48;

      // ===== NOVEDADES =====
      var novedades = sesion.novedades || [];

      if (novedades.length > 0) {
        doc.rect(45, y, 522, 18).fill(NEGRO);
        doc.fill('#ffffff').fontSize(8).font('Helvetica-Bold')
          .text('NOVEDADES CRITICAS REPORTADAS', 55, y + 5);
        y += 25;

        for (var ni = 0; ni < novedades.length; ni++) {
          var nov = novedades[ni];
          if (y > 700) { doc.addPage(); y = 50; }

          var novColor = nov.critico ? ROJO : AMARILLO;
          doc.rect(45, y, 3, 28).fill(novColor);

          doc.fill(NEGRO).fontSize(8).font('Helvetica-Bold')
            .text(nov.grupo || '', 55, y + 2);

          var estadoDesc = nov.nota || nov.estado || '';
          doc.fill(novColor).fontSize(8).font('Helvetica-Bold')
            .text((nov.item || nov.nombre || '') + (estadoDesc ? ' (' + estadoDesc.toUpperCase() + ')' : ''), 55, y + 14);

          if (nov.critico) {
            doc.rect(480, y + 5, 80, 14).fill(ROJO_CLARO);
            doc.fill(ROJO).fontSize(6).font('Helvetica-Bold')
              .text('Alerta Supervisor', 485, y + 9);
          }

          y += 35;
        }
      }

      // ===== BLOQUES DE INSPECCION =====
      for (var g = 0; g < GRUPOS.length; g++) {
        var grupo = GRUPOS[g];
        var respuesta = sesion.respuestas ? sesion.respuestas[grupo.id] : null;
        if (!respuesta) continue;

        if (y > 640) { doc.addPage(); y = 50; }

        doc.rect(45, y, 522, 16).fill(GRIS_FONDO);
        doc.fill(NEGRO).fontSize(8).font('Helvetica-Bold')
          .text(grupo.nombre, 55, y + 4);
        y += 22;

        var itemsRespuesta = respuesta.items || [];

        for (var j = 0; j < itemsRespuesta.length; j++) {
          var item = itemsRespuesta[j];
          if (y > 720) { doc.addPage(); y = 50; }

          doc.fill(NEGRO).fontSize(8).font('Helvetica')
            .text(item.nombre || '', 55, y);

          // Estado: puede venir como string contextual o como número
          var estadoVal = item.estado;
          var estadoTexto, estadoColor;

          if (typeof estadoVal === 'number') {
            estadoTexto = estadoVal === 1 ? 'OK' : estadoVal === 2 ? 'Atencion' : estadoVal === 3 ? 'Malo' : 'N/A';
            estadoColor = estadoVal === 1 ? VERDE : estadoVal === 2 ? AMARILLO : estadoVal === 3 ? ROJO : GRIS_CLARO;
          } else {
            // String contextual (OK, Bajo, Vacio, Funciona, etc.)
            estadoTexto = estadoVal || 'OK';
            var est = estadoTexto.toLowerCase();
            if (est === 'ok' || est === 'funciona' || est === 'completo' || est === 'sin fugas') {
              estadoColor = VERDE;
            } else if (est === 'bajo' || est === 'desgastada' || est === 'intermitente' || est === 'incompleto' || est === 'danado' || est === 'duro o flojo') {
              estadoColor = AMARILLO;
            } else {
              estadoColor = ROJO;
            }
          }

          doc.fill(estadoColor).fontSize(8).font('Helvetica-Bold')
            .text(estadoTexto, 350, y);

          // Badge estado
          if (estadoColor === VERDE) {
            doc.fill(VERDE).fontSize(8).font('Helvetica-Bold').text('OK', 520, y);
          } else {
            var badgeLabel = estadoColor === AMARILLO ? 'ATENCION' : 'CRITICO';
            doc.rect(505, y - 1, 52, 12).fill(estadoColor);
            doc.fill('#ffffff').fontSize(6).font('Helvetica-Bold').text(badgeLabel, 508, y + 1);
          }

          y += 12;
          doc.moveTo(55, y).lineTo(560, y).strokeColor(GRIS_LINEA).lineWidth(0.3).stroke();
          y += 8;
        }
        y += 5;
      }

      // ===== OBSERVACIONES =====
      if (sesion.observacion) {
        if (y > 680) { doc.addPage(); y = 50; }
        doc.rect(45, y, 522, 16).fill(GRIS_FONDO);
        doc.fill(NEGRO).fontSize(8).font('Helvetica-Bold')
          .text('OBSERVACIONES', 55, y + 4);
        y += 22;
        doc.fill(GRIS_OSCURO).fontSize(8).font('Helvetica')
          .text(sesion.observacion, 55, y, { width: 500 });
        y += 25;
      }

      // ===== EVIDENCIA FOTOGRAFICA =====
      if (fotosDescargadas.length > 0) {
        doc.addPage();
        y = 50;
        doc.rect(0, 0, 612, 5).fill(NEGRO);

        doc.rect(45, y, 522, 18).fill(NEGRO);
        doc.fill('#ffffff').fontSize(9).font('Helvetica-Bold')
          .text('EVIDENCIA FOTOGRAFICA (VALIDACION IA)', 55, y + 4);
        y += 30;

        for (var fp = 0; fp < fotosDescargadas.length; fp++) {
          var fotoData = fotosDescargadas[fp];
          var foto = fotoData.info;
          if (y > 480) { doc.addPage(); y = 50; doc.rect(0, 0, 612, 5).fill(NEGRO); }

          var esFotoNovedad = foto.tipo === 'novedad';
          var labelColor = esFotoNovedad ? ROJO : VERDE;
          var fotoLabel = esFotoNovedad ? 'NOVEDAD' : 'VERIFICACION';

          doc.rect(45, y, 70, 14).fill(labelColor);
          doc.fill('#ffffff').fontSize(7).font('Helvetica-Bold').text(fotoLabel, 50, y + 3);
          doc.fill(NEGRO).fontSize(8).font('Helvetica-Bold').text(foto.descripcion || '', 125, y + 2);
          y += 20;

          if (fotoData.buffer) {
            try {
              doc.image(fotoData.buffer, 80, y, { width: 380, height: 220, fit: [380, 220], align: 'center' });
              y += 230;
            } catch (imgErr) {
              doc.rect(80, y, 380, 80).strokeColor(GRIS_LINEA).lineWidth(1).stroke();
              doc.fill(GRIS_CLARO).fontSize(8).font('Helvetica').text('[Foto no se pudo incrustar]', 210, y + 35);
              y += 90;
            }
          } else {
            doc.rect(80, y, 380, 80).strokeColor(GRIS_LINEA).lineWidth(1).stroke();
            doc.fill(GRIS_CLARO).fontSize(8).font('Helvetica').text('[Foto no disponible]', 220, y + 35);
            y += 90;
          }

          doc.fill(esFotoNovedad ? ROJO : VERDE).fontSize(7).font('Helvetica')
            .text('IA: ' + (foto.validacion || foto.comentario || 'Foto recibida'), 80, y, { width: 380 });
          y += 25;
        }
      }

      // ===== FIRMA =====
      if (y > 600) { doc.addPage(); y = 50; doc.rect(0, 0, 612, 5).fill(NEGRO); }

      y += 15;
      doc.moveTo(45, y).lineTo(567, y).strokeColor(GRIS_LINEA).lineWidth(0.5).stroke();
      y += 10;

      doc.fill(NEGRO).fontSize(7).font('Helvetica-Bold')
        .text('VERIFICACION Y TRAZABILIDAD LEGAL', 45, y);
      y += 14;

      var telFirma = sesion.telefono ? sesion.telefono.replace('whatsapp:', '') : (conductor.telefono || 'N/R');
      doc.fill(GRIS_OSCURO).fontSize(7).font('Helvetica')
        .text('Firma: Firmado digitalmente por ' + nombreConductor + ' mediante WhatsApp (' + telFirma + ')', 45, y, { width: 520 });
      y += 12;

      var idTransaccion = 'CERO-' + (sesion.placa || '') + '-' + ahora.toISOString().split('T')[0].replace(/-/g, '');
      doc.text('Timestamp: ' + ahora.toLocaleString('es-CO') + ' | ID Transaccion: ' + idTransaccion, 45, y, { width: 520 });
      y += 12;
      doc.text('Base Legal: Cumple con Ley 527/1999 y Decreto 2364/2012. Firma electronica simple valida para PESV.', 45, y, { width: 520 });

      // ===== FOOTER =====
      y += 30;
      doc.moveTo(45, y).lineTo(567, y).strokeColor(GRIS_LINEA).lineWidth(0.5).stroke();
      y += 10;

      doc.rect(45, y, 522, 35).fill(NEGRO);
      doc.fill('#ffffff').fontSize(7).font('Helvetica')
        .text('Delega el papeleo al sistema. Asegura el cumplimiento PESV, registra novedades con evidencia', 55, y + 6, { width: 400 });
      doc.text('fotografica y valida cada paso legalmente con firmas digitales.', 55, y + 17, { width: 400 });
      doc.fill('#ffffff').fontSize(12).font('Helvetica-Bold').text('CERO', 490, y + 10);

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
    var nombreArchivo = 'preop_' + sesion.placa + '_' + Date.now() + '.pdf';

    var uploadResult = await config.supabase.storage
      .from('preoperacionales')
      .upload(nombreArchivo, pdfBuffer, { contentType: 'application/pdf', upsert: false });

    if (uploadResult.error) {
      console.error('Error subiendo PDF:', uploadResult.error);
      return null;
    }

    var urlResult = config.supabase.storage
      .from('preoperacionales')
      .getPublicUrl(nombreArchivo);

    var pdfUrl = urlResult.data.publicUrl;
    console.log('PDF subido:', pdfUrl);

    // Actualizar URL en la base de datos
    await config.supabase
      .from('preoperacionales')
      .update({ pdf_url: pdfUrl })
      .eq('id', preoperacionalId);

    // Enviar por WhatsApp
    await config.twilioClient.messages.create({
      from: config.TWILIO_WHATSAPP_NUMBER,
      to: telefono,
      body: '📄 *PDF Preoperacional*\n' + (sesion.placa || '') + ' | ' + new Date().toLocaleDateString('es-CO') + '\n\nDescarga aqui:\n' + pdfUrl
    });

    console.log('PDF enviado a ' + telefono);
    return pdfUrl;

  } catch (error) {
    console.error('Error en subirYEnviarPDF:', error);
    return null;
  }
}

module.exports = { generarPDF, subirYEnviarPDF };
