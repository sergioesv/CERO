var PDFDocument = require('pdfkit');
var https = require('https');
var http = require('http');
var config = require('../config/config');
var preopUtils = require('../modulos/vehiculos/preoperacional/validaciones');
var { LOGO_PATH } = require('./logo');

const LAYOUT = {
  margin: 45,
  anchoUtil: 505,
  altoUtil: 752,
  headerAlto: 72,
  fuenteTitulo: 11,
  fuenteBase: 9,
  fuentePie: 7,
  colores: {
    azul: '#1F4E79',
    gris: '#404040',
    grisCla: '#F2F2F2',
    negro: '#1A1A1A',
  }
};

function descargarImagen(url) {
  return new Promise(function(resolve, reject) {
    var isTwilio = url.indexOf('twilio.com') >= 0 || url.indexOf('api.twilio.com') >= 0;
    if (isTwilio) {
      var credentials = Buffer.from((config.TWILIO_ACCOUNT_SID || '') + ':' + (config.TWILIO_AUTH_TOKEN || '')).toString('base64');
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
        req.setTimeout(12000, function() { req.destroy(new Error('Timeout descarga')); });
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
      var NEGRO = LAYOUT.colores.negro;
      var GRIS = '#666666';
      var GRIS_CLR = '#999999';
      var GRIS_FONDO = '#F5F5F5';
      var GRIS_LIN = '#E0E0E0';
      var VERDE = '#2E7D32';
      var ROJO = '#C62828';
      var ROJO_CLR = '#FFEBEE';
      var AMARILLO = '#F9A825';
      var PAGE_W = 612;
      var PAGE_H = 792;
      var MARGIN = LAYOUT.margin;
      var CONTENT_W = LAYOUT.anchoUtil;

      var ahoraUTC = sesion.fecha ? new Date(sesion.fecha) : new Date();
      var ahora = new Date(ahoraUTC.getTime() - (5 * 60 * 60 * 1000));
      
      var doc = new PDFDocument({ size: 'LETTER', margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } });
      var chunks = [];
      doc.on('data', function(c) { chunks.push(c); });
      doc.on('end', function() { resolve(Buffer.concat(chunks)); });
      doc.on('error', reject);

      var numPagina = 1;

      function decorarPagina(esPrimera) {
        if (!esPrimera) {
          try { doc.image(LOGO_PATH, MARGIN, 8, { width: 24, height: 22 }); } catch(e) {}
          doc.fill(GRIS_CLR).fontSize(7).text('Página ' + numPagina, MARGIN, 762, { align: 'right', width: CONTENT_W });
        }
      }

      function nuevaPagina(esPrimera) {
        if (esPrimera) { decorarPagina(true); return MARGIN + 10; }
        numPagina++;
        doc.addPage();
        decorarPagina(false);
        return 46;
      }

      function checkY(yPos, needed) {
        if (yPos + needed > PAGE_H - 60) return nuevaPagina(false);
        return yPos;
      }

      var y = nuevaPagina(true);

      // Header
      try { doc.image(LOGO_PATH, MARGIN, 12, { width: 50, height: 45 }); } catch (e) {}
      doc.fill(NEGRO).fontSize(11).font('Helvetica-Bold').text('EDEMSA | CERO SYSTEM', 105, 18);
      doc.fill(GRIS_CLR).fontSize(7).font('Helvetica').text('Inspeccion Preoperacional de Vehiculo', 105, 30);
      doc.text('COD: I-GL-001-F04 V05', 420, 18, { align: 'right', width: 147 });
      doc.text('RES: 40595 DE 2022 (PESV)', 420, 30, { align: 'right', width: 147 });
      doc.moveTo(MARGIN, 62).lineTo(PAGE_W - MARGIN, 62).strokeColor(GRIS_LIN).lineWidth(0.5).stroke();

      y = LAYOUT.headerAlto;
      var vehiculo = sesion.vehiculo || {};
      doc.fill(NEGRO).fontSize(20).font('Helvetica-Bold').text(vehiculo.marca || '', MARGIN, y);
      y += 26;
      doc.fontSize(28).text(sesion.placa || '', MARGIN, y);
      y += 36;
      doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor(GRIS_LIN).lineWidth(0.5).stroke();
      y += 12;

      // Info Cards
      var cardW = 123;
      var cards = [
        { label: 'PILOTO', value: (sesion.conductor ? sesion.conductor.nombre : 'N/R') },
        { label: 'ODOMETRO', value: (sesion.kilometraje || 0) + ' km' },
        { label: 'FECHA', value: ahora.toLocaleDateString('es-CO') }
      ];

      for (var ci = 0; ci < cards.length; ci++) {
        var cx = MARGIN + ci * (cardW + 10);
        doc.rect(cx, y, cardW, 35).fill(GRIS_FONDO);
        doc.fill(GRIS_CLR).fontSize(6).font('Helvetica-Bold').text(cards[ci].label, cx + 8, y + 6);
        doc.fill(NEGRO).fontSize(9).text(cards[ci].value, cx + 8, y + 18);
      }
      y += 48;

      // Novedades
      var novedades = sesion.novedades || [];
      if (novedades.length > 0) {
        doc.rect(MARGIN, y, CONTENT_W, 18).fill(NEGRO);
        doc.fill('#ffffff').fontSize(8).text('NOVEDADES REPORTADAS', MARGIN + 10, y + 5);
        y += 25;
        for (var ni = 0; ni < novedades.length; ni++) {
          y = checkY(y, 30);
          doc.fill(ROJO).fontSize(8).text('• ' + novedades[ni].item + ': ' + novedades[ni].estado, MARGIN + 10, y);
          y += 15;
        }
      }

      // Finalizar
      doc.end();
    } catch (error) { reject(error); }
  });
}

async function subirYEnviarPDF(sesion, preoperacionalId, telefono) {
  try {
    var pdfBuffer = await generarPDF(sesion);
    var nombreArchivo = 'preop_' + (sesion.placa || 'SIN_PLACA') + '_' + Date.now() + '.pdf';
    var upload = await config.supabase.storage.from('preoperacionales').upload(nombreArchivo, pdfBuffer, { contentType: 'application/pdf' });
    
    if (upload.error) return null;

    var { data } = await config.supabase.storage.from('preoperacionales').createSignedUrl(nombreArchivo, 60 * 60 * 24);
    var pdfUrl = data.signedUrl;

    await config.supabase.from('preoperacionales').update({ pdf_url: pdfUrl }).eq('id', preoperacionalId);

    await config.twilioClient.messages.create({
      from: config.TWILIO_WHATSAPP_NUMBER,
      to: telefono,
      body: '📄 *PDF Preoperacional*\n' + (sesion.placa || '') + '\n\nDescarga aquí:\n' + pdfUrl
    });

    return pdfUrl;
  } catch (error) {
    console.error('Error PDF:', error);
    return null;
  }
}

module.exports = { generarPDF, subirYEnviarPDF };
