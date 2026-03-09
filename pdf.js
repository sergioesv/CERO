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
          if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
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

// Formatea hora Colombia manualmente (Railway corre en UTC)
function formatHoraColombia(date) {
  var h = date.getHours();
  var m = date.getMinutes();
  var ampm = h >= 12 ? 'p. m.' : 'a. m.';
  var h12 = h % 12 || 12;
  return h12 + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
}

function formatFechaColombia(date) {
  var meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return date.getDate() + ' de ' + meses[date.getMonth()] + ' de ' + date.getFullYear();
}

async function generarPDF(sesion) {
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
      var NEGRO      = '#1A1A1A';
      var GRIS_OSC   = '#333333';
      var GRIS       = '#666666';
      var GRIS_CLR   = '#999999';
      var GRIS_FONDO = '#F5F5F5';
      var GRIS_LIN   = '#E0E0E0';
      var VERDE      = '#2E7D32';
      var ROJO       = '#C62828';
      var ROJO_CLR   = '#FFEBEE';
      var AMARILLO   = '#F9A825';
      var PAGE_W     = 612;
      var PAGE_H     = 792;
      var MARGIN     = 45;
      var CONTENT_W  = PAGE_W - MARGIN * 2;
      var MAX_Y      = PAGE_H - 80; // límite seguro antes del footer

      // Hora Colombia (UTC-5) formateada manualmente
      // sesion.fecha ya viene en hora Colombia (Railway la guarda con new Date())
      var ahora = sesion.fecha ? new Date(sesion.fecha) : new Date();
      var meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
      var fecha = formatFechaColombia(ahora);
      var diaNum = ahora.getDate();
      var mesNombre = meses[ahora.getMonth()];
      var horaStr = formatHoraColombia(ahora);
      var fechaCorta = diaNum + '/' + mesNombre.charAt(0).toUpperCase() + mesNombre.slice(1) + ' ' + horaStr;

      var doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: 50 }
      });

      var pageCount = 0;
      doc.on('pageAdded', function() {
        pageCount++;
        // Footer en todas las páginas — coordenada absoluta, lineBreak false
        doc.save();
        doc.fill(GRIS_CLR).fontSize(6).font('Helvetica')
          .text(
            'Pag. ' + pageCount + '  |  CERO',
            MARGIN, PAGE_H - 20, { width: CONTENT_W, align: 'center', lineBreak: false }
          );
        // Mini header en páginas 2+
        if (pageCount > 1) {
          try {
            var lb = Buffer.from(LOGO_BASE64, 'base64');
            doc.image(lb, MARGIN, 10, { width: 22, height: 20 });
          } catch(e) {}
          doc.fill(NEGRO).fontSize(7).font('Helvetica-Bold')
            .text('EDEMSA | CERO SYSTEM  —  Inspeccion Preoperacional', 73, 13, { lineBreak: false });
          doc.fill(GRIS_CLR).fontSize(6).font('Helvetica')
            .text((sesion.placa || '') + '  |  ' + fecha, 73, 23, { lineBreak: false });
          doc.moveTo(MARGIN, 38).lineTo(PAGE_W - MARGIN, 38).strokeColor(GRIS_LIN).lineWidth(0.3).stroke();
        }
        doc.restore();
      });

      var chunks = [];
      doc.on('data', function(c) { chunks.push(c); });
      doc.on('end', function() { resolve(Buffer.concat(chunks)); });
      doc.on('error', reject);

      // ===== PÁGINA 1: HEADER COMPLETO =====
      var y = MARGIN;

      try {
        var logoBuffer = Buffer.from(LOGO_BASE64, 'base64');
        doc.image(logoBuffer, MARGIN, 12, { width: 50, height: 45 });
      } catch (e) {}

      doc.fill(NEGRO).fontSize(9).font('Helvetica-Bold').text('EDEMSA | CERO SYSTEM', 105, 18);
      doc.fill(GRIS_CLR).fontSize(7).font('Helvetica').text('Inspeccion Preoperacional de Vehiculo', 105, 30);
      doc.fill(GRIS_CLR).fontSize(7).font('Helvetica')
        .text('COD: I-GL-001-F04 V05', 420, 18, { align: 'right', width: 147 });
      doc.text('RES: 40595 DE 2022 (PESV)', 420, 30, { align: 'right', width: 147 });
      doc.moveTo(MARGIN, 62).lineTo(PAGE_W - MARGIN, 62).strokeColor(GRIS_LIN).lineWidth(0.5).stroke();

      // ===== HERO VEHÍCULO =====
      y = 72;
      var vehiculo = sesion.vehiculo || {};
      var marcaModelo = ((vehiculo.marca || '') + ' ' + (vehiculo.modelo || '')).trim();

      doc.fill(NEGRO).fontSize(20).font('Helvetica-Bold')
        .text(marcaModelo, MARGIN, y, { width: 360, lineBreak: false });
      y += 26;
      doc.fill(NEGRO).fontSize(28).font('Helvetica-Bold').text(sesion.placa || '', MARGIN, y);
      doc.fill(GRIS).fontSize(8).font('Helvetica')
        .text('Año ' + (vehiculo.anio || 'N/R'), 420, 80, { align: 'right', width: 147 });
      y += 36;
      doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor(GRIS_LIN).lineWidth(0.5).stroke();
      y += 12;

      // ===== TARJETAS INFO =====
      var conductor = sesion.conductor || {};
      var nombreConductor = conductor.nombre || 'N/R';
      var licenciaCat = conductor.licencia_categoria ? 'Cat. ' + conductor.licencia_categoria : 'N/R';
      var cardW = 123;
      var cards = [
        { label: 'PILOTO',   value: nombreConductor },
        { label: 'LICENCIA', value: licenciaCat },
        { label: 'ODOMETRO', value: (sesion.kilometraje || 0) + ' km' },
        { label: 'FECHA',    value: fechaCorta }
      ];
      for (var ci = 0; ci < cards.length; ci++) {
        var cx = MARGIN + ci * (cardW + 10);
        doc.rect(cx, y, cardW, 35).fill(GRIS_FONDO);
        doc.fill(GRIS_CLR).fontSize(6).font('Helvetica-Bold').text(cards[ci].label, cx + 8, y + 6, { width: cardW - 16 });
        doc.fill(NEGRO).fontSize(9).font('Helvetica-Bold').text(cards[ci].value, cx + 8, y + 18, { width: cardW - 16 });
      }
      y += 48;

      // ===== NOVEDADES =====
      var novedades = sesion.novedades || [];
      if (novedades.length > 0) {
        if (y + 30 > MAX_Y) { doc.addPage(); y = MARGIN; }
        doc.rect(MARGIN, y, CONTENT_W, 18).fill(NEGRO);
        doc.fill('#ffffff').fontSize(8).font('Helvetica-Bold').text('NOVEDADES CRITICAS REPORTADAS', MARGIN + 10, y + 5);
        y += 25;
        for (var ni = 0; ni < novedades.length; ni++) {
          if (y + 36 > MAX_Y) { doc.addPage(); y = MARGIN; }
          var nov = novedades[ni];
          var novColor = nov.critico ? ROJO : AMARILLO;
          doc.rect(MARGIN, y, 3, 28).fill(novColor);
          doc.fill(NEGRO).fontSize(8).font('Helvetica-Bold').text(nov.grupo || '', MARGIN + 10, y + 2);
          var estadoDesc = nov.nota || nov.estado || '';
          doc.fill(novColor).fontSize(8).font('Helvetica-Bold')
            .text((nov.item || '') + (estadoDesc ? ' (' + estadoDesc.toUpperCase() + ')' : ''), MARGIN + 10, y + 14);
          if (nov.critico) {
            doc.rect(480, y + 5, 80, 14).fill(ROJO_CLR);
            doc.fill(ROJO).fontSize(6).font('Helvetica-Bold').text('Alerta Supervisor', 485, y + 9);
          }
          y += 35;
        }
      }

      // ===== BLOQUES DE INSPECCION =====
      for (var g = 0; g < GRUPOS.length; g++) {
        var grupo = GRUPOS[g];
        if (y + 40 > MAX_Y) { doc.addPage(); y = MARGIN; }

        doc.rect(MARGIN, y, CONTENT_W, 16).fill(GRIS_FONDO);
        doc.fill(NEGRO).fontSize(8).font('Helvetica-Bold').text(grupo.nombre, MARGIN + 10, y + 4);
        y += 22;

        var respuesta = (sesion.respuestas && sesion.respuestas[grupo.id]) ? sesion.respuestas[grupo.id] : null;
        var itemsReportados = (respuesta && respuesta.items) ? respuesta.items : [];
        var mapaEstados = {};
        for (var ri = 0; ri < itemsReportados.length; ri++) {
          mapaEstados[itemsReportados[ri].nombre] = itemsReportados[ri].estado;
        }

        for (var j = 0; j < grupo.items.length; j++) {
          if (y + 22 > MAX_Y) { doc.addPage(); y = MARGIN; }
          var itemDef = grupo.items[j];
          var estadoVal = mapaEstados.hasOwnProperty(itemDef.nombre) ? mapaEstados[itemDef.nombre] : 'OK';
          var estadoTexto, estadoColor;

          if (typeof estadoVal === 'number') {
            estadoTexto = estadoVal === 1 ? 'OK' : estadoVal === 2 ? 'Atencion' : estadoVal === 3 ? 'Malo' : 'N/A';
            estadoColor = estadoVal === 1 ? VERDE : estadoVal === 2 ? AMARILLO : estadoVal === 3 ? ROJO : GRIS_CLR;
          } else {
            estadoTexto = estadoVal || 'OK';
            var est = estadoTexto.toLowerCase();
            if (est === 'ok' || est === 'funciona' || est === 'completo' || est === 'sin fugas') {
              estadoColor = VERDE;
            } else if (est === 'bajo' || est === 'desgastada' || est === 'intermitente' || est === 'incompleto' || est === 'danado' || est === 'duro o flojo' || est === 'sin presion' || est === 'sin presión') {
              estadoColor = AMARILLO;
            } else {
              estadoColor = ROJO;
            }
          }

          doc.fill(NEGRO).fontSize(8).font('Helvetica').text(itemDef.nombre, MARGIN + 10, y);
          doc.fill(estadoColor).fontSize(8).font('Helvetica-Bold').text(estadoTexto, 350, y);
          if (estadoColor === VERDE) {
            doc.fill(VERDE).fontSize(8).font('Helvetica-Bold').text('OK', 520, y);
          } else {
            var badge = estadoColor === AMARILLO ? 'ATENCION' : 'CRITICO';
            doc.rect(505, y - 1, 52, 12).fill(estadoColor);
            doc.fill('#ffffff').fontSize(6).font('Helvetica-Bold').text(badge, 508, y + 1);
          }
          y += 12;
          doc.moveTo(MARGIN + 10, y).lineTo(PAGE_W - MARGIN, y).strokeColor(GRIS_LIN).lineWidth(0.3).stroke();
          y += 8;
        }
        y += 5;
      }

      // ===== OBSERVACIONES =====
      if (sesion.observacion) {
        if (y + 50 > MAX_Y) { doc.addPage(); y = MARGIN; }
        doc.rect(MARGIN, y, CONTENT_W, 16).fill(GRIS_FONDO);
        doc.fill(NEGRO).fontSize(8).font('Helvetica-Bold').text('OBSERVACIONES', MARGIN + 10, y + 4);
        y += 22;
        doc.fill(GRIS_OSC).fontSize(8).font('Helvetica').text(sesion.observacion, MARGIN + 10, y, { width: 500 });
        y += 30;
      }

      // ===== EVIDENCIA FOTOGRAFICA =====
      if (fotosDescargadas.length > 0) {
        doc.addPage();
        y = MARGIN;

        doc.rect(MARGIN, y, CONTENT_W, 18).fill(NEGRO);
        doc.fill('#ffffff').fontSize(9).font('Helvetica-Bold')
          .text('EVIDENCIA FOTOGRAFICA (VALIDACION IA)', MARGIN + 10, y + 4);
        y += 30;

        for (var fp = 0; fp < fotosDescargadas.length; fp++) {
          if (y + 290 > MAX_Y) { doc.addPage(); y = MARGIN; }
          var fotoData = fotosDescargadas[fp];
          var foto = fotoData.info;
          var esFotoNovedad = foto.tipo === 'novedad';
          var labelColor = esFotoNovedad ? ROJO : VERDE;
          var fotoLabel = esFotoNovedad ? 'NOVEDAD' : 'VERIFICACION';

          doc.rect(MARGIN, y, 70, 14).fill(labelColor);
          doc.fill('#ffffff').fontSize(7).font('Helvetica-Bold').text(fotoLabel, MARGIN + 5, y + 3);
          doc.fill(NEGRO).fontSize(8).font('Helvetica-Bold').text(foto.descripcion || '', MARGIN + 80, y + 2);
          y += 20;

          if (fotoData.buffer) {
            try {
              doc.image(fotoData.buffer, 80, y, { width: 380, height: 220, fit: [380, 220], align: 'center' });
              y += 230;
            } catch (imgErr) {
              doc.rect(80, y, 380, 60).strokeColor(GRIS_LIN).lineWidth(1).stroke();
              doc.fill(GRIS_CLR).fontSize(8).font('Helvetica').text('[Foto no disponible]', 220, y + 22);
              y += 70;
            }
          } else {
            doc.rect(80, y, 380, 60).strokeColor(GRIS_LIN).lineWidth(1).stroke();
            doc.fill(GRIS_CLR).fontSize(8).font('Helvetica').text('[Foto no disponible]', 220, y + 22);
            y += 70;
          }

          doc.fill(esFotoNovedad ? ROJO : VERDE).fontSize(7).font('Helvetica')
            .text('IA: ' + (foto.validacion || 'Foto recibida'), 80, y, { width: 380 });
          y += 30;
        }
      }

      // ===== FIRMA =====
      if (y + 120 > MAX_Y) { doc.addPage(); y = MARGIN; }
      y += 15;
      doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor(GRIS_LIN).lineWidth(0.5).stroke();
      y += 10;
      doc.fill(NEGRO).fontSize(7).font('Helvetica-Bold').text('VERIFICACION Y TRAZABILIDAD LEGAL', MARGIN, y);
      y += 14;
      var telFirma = sesion.telefono ? sesion.telefono.replace('whatsapp:', '') : (conductor.telefono || 'N/R');
      doc.fill(GRIS_OSC).fontSize(7).font('Helvetica')
        .text('Firma: Firmado digitalmente por ' + nombreConductor + ' mediante WhatsApp (' + telFirma + ')', MARGIN, y, { width: 520 });
      y += 12;
      var idTx = 'CERO-' + (sesion.placa || '') + '-' + ahora.getFullYear() + ('0'+(ahora.getMonth()+1)).slice(-2) + ('0'+ahora.getDate()).slice(-2);
      doc.text('Timestamp: ' + diaNum + '/' + (ahora.getMonth()+1) + '/' + ahora.getFullYear() + ', ' + horaStr + ' | ID Transaccion: ' + idTx, MARGIN, y, { width: 520 });
      y += 12;
      doc.text('Base Legal: Cumple con Ley 527/1999 y Decreto 2364/2012. Firma electronica simple valida para PESV.', MARGIN, y, { width: 520 });
      y += 30;
      doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor(GRIS_LIN).lineWidth(0.5).stroke();
      y += 10;
      doc.rect(MARGIN, y, CONTENT_W, 35).fill(NEGRO);
      doc.fill('#ffffff').fontSize(7).font('Helvetica')
        .text('Delega el papeleo al sistema. Asegura el cumplimiento PESV, registra novedades con evidencia fotografica', MARGIN + 10, y + 6, { width: 390 });
      doc.text('y valida cada paso legalmente con firmas digitales.', MARGIN + 10, y + 17, { width: 390 });
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

    var urlResult = config.supabase.storage.from('preoperacionales').getPublicUrl(nombreArchivo);
    var pdfUrl = urlResult.data.publicUrl;
    console.log('PDF subido:', pdfUrl);

    await config.supabase.from('preoperacionales').update({ pdf_url: pdfUrl }).eq('id', preoperacionalId);

    var ahoraUTC2 = new Date();
    var ahoraCO2 = new Date(ahoraUTC2.getTime() - 5 * 60 * 60 * 1000);
    var meses2 = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    var fechaMsg = ahoraCO2.getDate() + '/' + meses2[ahoraCO2.getMonth()] + '/' + ahoraCO2.getFullYear();

    await config.twilioClient.messages.create({
      from: config.TWILIO_WHATSAPP_NUMBER,
      to: telefono,
      body: '📄 *PDF Preoperacional*\n' + (sesion.placa || '') + ' | ' + fechaMsg + '\n\nDescarga aqui:\n' + pdfUrl
    });

    console.log('PDF enviado a ' + telefono);
    return pdfUrl;

  } catch (error) {
    console.error('Error en subirYEnviarPDF:', error);
    return null;
  }
}

module.exports = { generarPDF, subirYEnviarPDF };
