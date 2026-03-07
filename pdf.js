var PDFDocument = require('pdfkit');
var https = require('https');
var http = require('http');
var config = require('./config');
var GRUPOS = require('./grupos').GRUPOS;
var LOGO_BASE64 = require('./logo').LOGO_BASE64;

function descargarImagen(url) {
  return new Promise(function(resolve, reject) {
    var client = url.startsWith('https') ? https : http;
    client.get(url, function(response) {
      var chunks = [];
      response.on('data', function(chunk) { chunks.push(chunk); });
      response.on('end', function() { resolve(Buffer.concat(chunks)); });
      response.on('error', reject);
    }).on('error', reject);
  });
}

async function generarPDF(sesion) {
  // Download all photos first
  var fotosDescargadas = [];
  if (sesion.fotos && sesion.fotos.length > 0) {
    for (var d = 0; d < sesion.fotos.length; d++) {
      try {
        var imgBuffer = await descargarImagen(sesion.fotos[d].url);
        fotosDescargadas.push({ buffer: imgBuffer, info: sesion.fotos[d] });
      } catch (e) {
        console.error('Error descargando foto ' + d + ':', e);
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

      var ahora = new Date();
      var fecha = ahora.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
      var hora = ahora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

      var NEGRO = '#1A1A1A';
      var GRIS_OSCURO = '#333333';
      var GRIS = '#666666';
      var GRIS_CLARO = '#999999';
      var GRIS_FONDO = '#F5F5F5';
      var GRIS_LINEA = '#E0E0E0';
      var VERDE = '#2E7D32';
      var VERDE_CLARO = '#E8F5E9';
      var ROJO = '#C62828';
      var ROJO_CLARO = '#FFEBEE';
      var AMARILLO = '#F9A825';

      // ===== THIN ACCENT BAR =====
      doc.rect(0, 0, 612, 5).fill(NEGRO);

      // ===== HEADER WITH LOGO =====
      try {
        var logoBuffer = Buffer.from(LOGO_BASE64, 'base64');
        doc.image(logoBuffer, 45, 12, { width: 50, height: 45 });
      } catch (e) {}

      doc.fill(NEGRO).fontSize(9).font('Helvetica-Bold')
        .text('EDEMSA | CERO SYSTEM', 105, 18);
      doc.fill(GRIS_CLARO).fontSize(7).font('Helvetica')
        .text('Inspeccion Preoperacional de Vehiculo', 105, 30);

      // Right side
      doc.fill(GRIS_CLARO).fontSize(7).font('Helvetica')
        .text('COD: I-GL-001-F04 V05', 420, 18, { align: 'right', width: 147 });
      doc.text('RES: 40595 DE 2022 (PESV)', 420, 30, { align: 'right', width: 147 });

      // Separator
      doc.moveTo(45, 62).lineTo(567, 62).strokeColor(GRIS_LINEA).lineWidth(0.5).stroke();

      // ===== VEHICLE HERO SECTION =====
      var y = 72;

      // Vehicle name large
      doc.fill(NEGRO).fontSize(20).font('Helvetica-Bold')
        .text((sesion.vehiculo.marca || '') + ' ' + (sesion.vehiculo.modelo || ''), 45, y);
      y += 24;

      doc.fill(NEGRO).fontSize(28).font('Helvetica-Bold')
        .text(sesion.placa, 45, y);

      // Right side vehicle info
      doc.fill(GRIS).fontSize(8).font('Helvetica')
        .text(sesion.vehiculo.tipo || '', 420, 74, { align: 'right', width: 147 });
      doc.text('Anio ' + (sesion.vehiculo.anio || 'N/R'), 420, 86, { align: 'right', width: 147 });

      y += 35;
      doc.moveTo(45, y).lineTo(567, y).strokeColor(GRIS_LINEA).lineWidth(0.5).stroke();
      y += 12;

      // ===== INFO CARDS ROW =====
      var cardW = 123;
      var cards = [
        { label: 'PILOTO', value: sesion.conductor ? sesion.conductor.nombre : 'N/R' },
        { label: 'LICENCIA', value: sesion.conductor ? 'Cat. ' + (sesion.conductor.licencia_categoria || 'N/R') : 'N/R' },
        { label: 'ODOMETRO', value: sesion.kilometraje + ' km' },
        { label: 'FECHA', value: fecha.split(' de ').slice(0,2).join('/') }
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

      // ===== NOVEDADES CRITICAS (if any, show at top) =====
      var novedadesCriticas = sesion.novedades.filter(function(n) { return n.critico; });

      if (sesion.novedades.length > 0) {
        doc.rect(45, y, 522, 18).fill(NEGRO);
        doc.fill('#ffffff').fontSize(8).font('Helvetica-Bold')
          .text('NOVEDADES CRITICAS REPORTADAS', 55, y + 5);
        y += 25;

        for (var ni = 0; ni < sesion.novedades.length; ni++) {
          var nov = sesion.novedades[ni];

          if (y > 700) { doc.addPage(); y = 50; }

          // Accent bar
          var novColor = nov.critico ? ROJO : AMARILLO;
          doc.rect(45, y, 3, 28).fill(novColor);

          // Content
          doc.fill(NEGRO).fontSize(8).font('Helvetica-Bold')
            .text(nov.grupo, 55, y + 2);

          var estadoDesc = nov.nota || '';
          doc.fill(novColor).fontSize(8).font('Helvetica-Bold')
            .text(nov.item + (estadoDesc ? ' (' + estadoDesc + ')' : ''), 55, y + 14);

          // Alert tag
          if (nov.critico) {
            doc.rect(480, y + 5, 80, 14).fill(ROJO_CLARO);
            doc.fill(ROJO).fontSize(6).font('Helvetica-Bold')
              .text('Alerta Supervisor', 485, y + 9);
          }

          y += 35;
        }
      }

      // ===== INSPECTION RESULTS BY BLOCK =====
      for (var g = 0; g < GRUPOS.length; g++) {
        var grupo = GRUPOS[g];
        var respuesta = sesion.respuestas[grupo.id];
        if (!respuesta) continue;

        if (y > 640) { doc.addPage(); y = 50; }

        // Block header
        doc.rect(45, y, 522, 16).fill(GRIS_FONDO);
        doc.fill(NEGRO).fontSize(8).font('Helvetica-Bold')
          .text(grupo.nombre, 55, y + 4);
        y += 22;

        // Items
        for (var j = 0; j < respuesta.items.length; j++) {
          var item = respuesta.items[j];

          if (y > 720) { doc.addPage(); y = 50; }

          // Item name
          doc.fill(NEGRO).fontSize(8).font('Helvetica')
            .text(item.nombre, 55, y);

          // Estado with contextual description
          var estadoTexto = item.descripcion_estado || (item.estado === 1 ? 'OK' : item.estado === 2 ? 'Atencion' : item.estado === 3 ? 'Malo' : 'N/A');
          var estadoColor = item.estado === 1 ? VERDE : item.estado === 2 ? AMARILLO : item.estado === 3 ? ROJO : GRIS_CLARO;

          doc.fill(estadoColor).fontSize(8).font('Helvetica-Bold')
            .text(estadoTexto, 350, y);

          // Status indicator
          if (item.estado === 1) {
            doc.fill(VERDE).fontSize(8).font('Helvetica-Bold')
              .text('OK', 520, y);
          } else if (item.estado === 2 || item.estado === 3) {
            // Warning icon
            doc.rect(515, y - 1, 40, 12).fill(item.estado === 2 ? AMARILLO : ROJO);
            doc.fill('#ffffff').fontSize(6).font('Helvetica-Bold')
              .text(item.estado === 2 ? 'ATENCION' : 'CRITICO', 518, y + 1);
          }

          y += 4;
          doc.moveTo(55, y).lineTo(560, y).strokeColor(GRIS_LINEA).lineWidth(0.3).stroke();
          y += 10;
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

          // Photo label
          var fotoLabel = esFotoNovedad ? 'NOVEDAD' : 'VERIFICACION';
          var labelColor = esFotoNovedad ? ROJO : VERDE;

          doc.rect(45, y, 70, 14).fill(labelColor);
          doc.fill('#ffffff').fontSize(7).font('Helvetica-Bold')
            .text(fotoLabel, 50, y + 3);

          doc.fill(NEGRO).fontSize(8).font('Helvetica-Bold')
            .text(foto.descripcion, 125, y + 2);

          y += 20;

          // Photo
          if (fotoData.buffer) {
            try {
              doc.image(fotoData.buffer, 80, y, { width: 380, height: 220, fit: [380, 220], align: 'center' });
              y += 230;
            } catch (imgErr) {
              doc.rect(80, y, 380, 80).strokeColor(GRIS_LINEA).lineWidth(1).stroke();
              doc.fill(GRIS_CLARO).fontSize(8).font('Helvetica')
                .text('[Foto no se pudo incrustar]', 210, y + 35);
              y += 90;
            }
          } else {
            doc.rect(80, y, 380, 80).strokeColor(GRIS_LINEA).lineWidth(1).stroke();
            doc.fill(GRIS_CLARO).fontSize(8).font('Helvetica')
              .text('[Foto no disponible]', 220, y + 35);
            y += 90;
          }

          // Validation comment
          doc.fill(esFotoNovedad ? ROJO : VERDE).fontSize(7).font('Helvetica')
            .text('IA: ' + (foto.validacion || 'Foto recibida'), 80, y, { width: 380 });
          y += 25;
        }
      }

      // ===== FIRMA ELECTRONICA =====
      if (y > 600) { doc.addPage(); y = 50; doc.rect(0, 0, 612, 5).fill(NEGRO); }

      y += 15;
      doc.moveTo(45, y).lineTo(567, y).strokeColor(GRIS_LINEA).lineWidth(0.5).stroke();
      y += 10;

      doc.fill(NEGRO).fontSize(7).font('Helvetica-Bold')
        .text('VERIFICACION Y TRAZABILIDAD LEGAL', 45, y);
      y += 14;

      doc.fill(GRIS_OSCURO).fontSize(7).font('Helvetica');

      var firmaTexto = 'Firma: Firmado digitalmente por ' + (sesion.conductor ? sesion.conductor.nombre : 'Conductor') + ' mediante WhatsApp (' + (sesion.conductor ? sesion.conductor.telefono : 'N/R') + ')';
      doc.text(firmaTexto, 45, y, { width: 520 });
      y += 12;

      var idTransaccion = 'CERO-' + sesion.placa + '-' + ahora.toISOString().split('T')[0].replace(/-/g, '');
      doc.text('Timestamp: ' + ahora.toLocaleString('es-CO') + ' | ID Transaccion: ' + idTransaccion, 45, y, { width: 520 });
      y += 12;

      doc.text('Base Legal: Cumple con Ley 527/1999 y Decreto 2364/2012. Firma electronica simple valida para PESV.', 45, y, { width: 520 });

      // ===== FOOTER BRANDING =====
      y += 30;
      doc.moveTo(45, y).lineTo(567, y).strokeColor(GRIS_LINEA).lineWidth(0.5).stroke();
      y += 10;

      doc.rect(45, y, 522, 35).fill(NEGRO);
      doc.fill('#ffffff').fontSize(7).font('Helvetica')
        .text('Delega el papeleo al sistema. Asegura el cumplimiento PESV, registra novedades con evidencia', 55, y + 6, { width: 400 });
      doc.text('fotografica y valida cada paso legalmente con firmas digitales.', 55, y + 17, { width: 400 });

      doc.fill('#ffffff').fontSize(12).font('Helvetica-Bold')
        .text('CERO', 490, y + 10);

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
