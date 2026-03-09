var PDFDocument = require('pdfkit');
var https = require('https');
var http = require('http');
var config = require('./config');
var GRUPOS = require('./grupos').GRUPOS;
var LOGO_BASE64 = require('./logo').LOGO_BASE64;

function descargarImagen(url) {
  return new Promise(function(resolve, reject) {
    var isTwilio = url.indexOf('twilio.com') >= 0;
    if (isTwilio) {
      var creds = Buffer.from(process.env.TWILIO_ACCOUNT_SID + ':' + process.env.TWILIO_AUTH_TOKEN).toString('base64');
      function seguir(u, n) {
        if (n > 5) return reject(new Error('Demasiadas redirecciones'));
        var o = new URL(u);
        var req = https.request({ hostname: o.hostname, path: o.pathname + o.search, method: 'GET', headers: { 'Authorization': 'Basic ' + creds } }, function(res) {
          if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) { res.resume(); return seguir(res.headers['location'], n + 1); }
          if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
          var chunks = []; res.on('data', function(c) { chunks.push(c); }); res.on('end', function() { resolve(Buffer.concat(chunks)); });
        }); req.on('error', reject); req.end();
      }
      seguir(url, 0);
    } else {
      var client = url.startsWith('https') ? https : http;
      client.get(url, function(res) {
        if (res.statusCode === 301 || res.statusCode === 302) { descargarImagen(res.headers.location).then(resolve).catch(reject); return; }
        var chunks = []; res.on('data', function(c) { chunks.push(c); }); res.on('end', function() { resolve(Buffer.concat(chunks)); }); res.on('error', reject);
      }).on('error', reject);
    }
  });
}

function horaCol(date) {
  var h = date.getHours(), m = date.getMinutes();
  var ampm = h >= 12 ? 'p. m.' : 'a. m.';
  return (h % 12 || 12) + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
}

async function generarPDF(sesion) {
  var fotosDesc = [];
  if (sesion.fotos && sesion.fotos.length > 0) {
    for (var d = 0; d < sesion.fotos.length; d++) {
      try { fotosDesc.push({ buffer: await descargarImagen(sesion.fotos[d].url), info: sesion.fotos[d] }); }
      catch (e) { fotosDesc.push({ buffer: null, info: sesion.fotos[d] }); }
    }
  }

  return new Promise(function(resolve, reject) {
    try {
      // ===== COLORES =====
      var NEGRO = '#1A1A1A', GRIS_OSC = '#333333', GRIS = '#666666';
      var GRIS_CLR = '#999999', GRIS_FONDO = '#F5F5F5', GRIS_LIN = '#E0E0E0';
      var VERDE = '#2E7D32', ROJO = '#C62828', ROJO_CLR = '#FFEBEE', AMARILLO = '#F9A825';
      var BLANCO = '#FFFFFF';

      var W = 612, H = 792, M = 45, CW = W - M * 2;
      var CONTENT_MAX = H - 60; // límite de contenido — debajo va el footer

      var ahora = sesion.fecha ? new Date(sesion.fecha) : new Date();
      var meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
      var fechaLarga = ahora.getDate() + ' de ' + meses[ahora.getMonth()] + ' de ' + ahora.getFullYear();
      var fechaCorta = ahora.getDate() + '/' + meses[ahora.getMonth()].charAt(0).toUpperCase() + meses[ahora.getMonth()].slice(1) + ' ' + horaCol(ahora);

      var doc = new PDFDocument({ size: 'LETTER', autoFirstPage: false });
      var chunks = [];
      doc.on('data', function(c) { chunks.push(c); });
      doc.on('end', function() { resolve(Buffer.concat(chunks)); });
      doc.on('error', reject);

      var pagNum = 0;

      // ===== FUNCIONES DE PÁGINA =====
      function nuevaPagina() {
        pagNum++;
        doc.addPage({ size: 'LETTER', margin: 0 });

        // Footer fijo en coordenada absoluta
        doc.fill(GRIS_CLR).fontSize(6).font('Helvetica')
          .text('Pag. ' + pagNum + '  |  CERO  |  Diseñado por Sergio Andres Estrada Velez  |  v1.0',
            M, H - 18, { width: CW, align: 'center', lineBreak: false });

        if (pagNum > 1) {
          // Mini header páginas 2+
          try { doc.image(Buffer.from(LOGO_BASE64, 'base64'), M, 10, { width: 22, height: 20 }); } catch(e) {}
          doc.fill(NEGRO).fontSize(7).font('Helvetica-Bold')
            .text('EDEMSA | CERO SYSTEM  —  Inspeccion Preoperacional', 73, 13, { lineBreak: false });
          doc.fill(GRIS_CLR).fontSize(6).font('Helvetica')
            .text((sesion.placa || '') + '  |  ' + fechaLarga, 73, 23, { lineBreak: false });
          doc.moveTo(M, 38).lineTo(W - M, 38).strokeColor(GRIS_LIN).lineWidth(0.3).stroke();
        }

        return pagNum === 1 ? M : 46;
      }

      function check(y, needed) {
        if (y + needed > CONTENT_MAX) { return nuevaPagina(); }
        return y;
      }

      function linea(y) {
        doc.moveTo(M + 10, y).lineTo(W - M, y).strokeColor(GRIS_LIN).lineWidth(0.3).stroke();
        return y + 8;
      }

      // ===== PÁGINA 1 =====
      var y = nuevaPagina();

      // Header completo p1
      try { doc.image(Buffer.from(LOGO_BASE64, 'base64'), M, 12, { width: 50, height: 45 }); } catch(e) {}
      doc.fill(NEGRO).fontSize(9).font('Helvetica-Bold').text('EDEMSA | CERO SYSTEM', 105, 18);
      doc.fill(GRIS_CLR).fontSize(7).font('Helvetica').text('Inspeccion Preoperacional de Vehiculo', 105, 30);
      doc.fill(GRIS_CLR).fontSize(7).font('Helvetica')
        .text('COD: I-GL-001-F04 V05', 420, 18, { align: 'right', width: 147 })
        .text('RES: 40595 DE 2022 (PESV)', 420, 30, { align: 'right', width: 147 });
      doc.moveTo(M, 62).lineTo(W - M, 62).strokeColor(GRIS_LIN).lineWidth(0.5).stroke();

      // Hero
      y = 72;
      var v = sesion.vehiculo || {};
      doc.fill(NEGRO).fontSize(20).font('Helvetica-Bold')
        .text((v.marca || '') + ' ' + (v.modelo || ''), M, y, { width: 360, lineBreak: false });
      y += 26;
      doc.fill(NEGRO).fontSize(28).font('Helvetica-Bold').text(sesion.placa || '', M, y);
      doc.fill(GRIS).fontSize(8).font('Helvetica').text('Año ' + (v.anio || ''), 420, 80, { align: 'right', width: 147 });
      y += 36;
      doc.moveTo(M, y).lineTo(W - M, y).strokeColor(GRIS_LIN).lineWidth(0.5).stroke();
      y += 12;

      // Tarjetas
      var cond = sesion.conductor || {};
      var cards = [
        { label: 'PILOTO',   value: cond.nombre || 'N/R' },
        { label: 'LICENCIA', value: cond.licencia_categoria ? 'Cat. ' + cond.licencia_categoria : 'N/R' },
        { label: 'ODOMETRO', value: (sesion.kilometraje || 0) + ' km' },
        { label: 'FECHA',    value: fechaCorta }
      ];
      var cw = 123;
      for (var ci = 0; ci < cards.length; ci++) {
        var cx = M + ci * (cw + 10);
        doc.rect(cx, y, cw, 35).fill(GRIS_FONDO);
        doc.fill(GRIS_CLR).fontSize(6).font('Helvetica-Bold').text(cards[ci].label, cx + 8, y + 6, { width: cw - 16 });
        doc.fill(NEGRO).fontSize(9).font('Helvetica-Bold').text(cards[ci].value, cx + 8, y + 18, { width: cw - 16 });
      }
      y += 48;

      // Novedades
      var novedades = sesion.novedades || [];
      if (novedades.length > 0) {
        y = check(y, 30);
        doc.rect(M, y, CW, 18).fill(NEGRO);
        doc.fill(BLANCO).fontSize(8).font('Helvetica-Bold').text('NOVEDADES CRITICAS REPORTADAS', M + 10, y + 5);
        y += 25;
        for (var ni = 0; ni < novedades.length; ni++) {
          y = check(y, 36);
          var nov = novedades[ni];
          var nc = nov.critico ? ROJO : AMARILLO;
          doc.rect(M, y, 3, 28).fill(nc);
          doc.fill(NEGRO).fontSize(8).font('Helvetica-Bold').text(nov.grupo || '', M + 10, y + 2);
          doc.fill(nc).fontSize(8).font('Helvetica-Bold')
            .text((nov.item || '') + (nov.nota || nov.estado ? ' (' + (nov.nota || nov.estado).toUpperCase() + ')' : ''), M + 10, y + 14);
          if (nov.critico) {
            doc.rect(480, y + 5, 80, 14).fill(ROJO_CLR);
            doc.fill(ROJO).fontSize(6).font('Helvetica-Bold').text('Alerta Supervisor', 485, y + 9);
          }
          y += 35;
        }
      }

      // Bloques
      for (var g = 0; g < GRUPOS.length; g++) {
        var grupo = GRUPOS[g];
        y = check(y, 40);
        doc.rect(M, y, CW, 16).fill(GRIS_FONDO);
        doc.fill(NEGRO).fontSize(8).font('Helvetica-Bold').text(grupo.nombre, M + 10, y + 4);
        y += 22;

        var resp = sesion.respuestas && sesion.respuestas[grupo.id] ? sesion.respuestas[grupo.id] : null;
        var mapa = {};
        if (resp && resp.items) { for (var ri = 0; ri < resp.items.length; ri++) mapa[resp.items[ri].nombre] = resp.items[ri].estado; }

        for (var j = 0; j < grupo.items.length; j++) {
          y = check(y, 22);
          var itm = grupo.items[j];
          var ev = mapa.hasOwnProperty(itm.nombre) ? mapa[itm.nombre] : 'OK';
          var et, ec;
          if (typeof ev === 'number') {
            et = ev===1?'OK':ev===2?'Atencion':ev===3?'Malo':'N/A';
            ec = ev===1?VERDE:ev===2?AMARILLO:ev===3?ROJO:GRIS_CLR;
          } else {
            et = ev || 'OK';
            var el = et.toLowerCase();
            if (el==='ok'||el==='funciona'||el==='completo'||el==='sin fugas') ec=VERDE;
            else if (el==='bajo'||el==='desgastada'||el==='intermitente'||el==='incompleto'||el==='danado'||el==='duro o flojo'||el==='sin presion') ec=AMARILLO;
            else ec=ROJO;
          }
          doc.fill(NEGRO).fontSize(8).font('Helvetica').text(itm.nombre, M + 10, y);
          doc.fill(ec).fontSize(8).font('Helvetica-Bold').text(et, 350, y);
          if (ec === VERDE) { doc.fill(VERDE).fontSize(8).font('Helvetica-Bold').text('OK', 520, y); }
          else { doc.rect(505, y-1, 52, 12).fill(ec); doc.fill(BLANCO).fontSize(6).font('Helvetica-Bold').text(ec===AMARILLO?'ATENCION':'CRITICO', 508, y+1); }
          y += 12;
          y = linea(y);
        }
        y += 5;
      }

      // Observaciones
      if (sesion.observacion && sesion.observacion.toLowerCase() !== 'no') {
        y = check(y, 50);
        doc.rect(M, y, CW, 16).fill(GRIS_FONDO);
        doc.fill(NEGRO).fontSize(8).font('Helvetica-Bold').text('OBSERVACIONES', M + 10, y + 4);
        y += 22;
        doc.fill(GRIS_OSC).fontSize(8).font('Helvetica').text(sesion.observacion, M + 10, y, { width: CW - 20 });
        y = doc.y + 15;
      }

      // Fotos
      if (fotosDesc.length > 0) {
        y = nuevaPagina();
        doc.rect(M, y, CW, 18).fill(NEGRO);
        doc.fill(BLANCO).fontSize(9).font('Helvetica-Bold').text('EVIDENCIA FOTOGRAFICA (VALIDACION IA)', M + 10, y + 4);
        y += 28;

        for (var fp = 0; fp < fotosDesc.length; fp++) {
          y = check(y, 280);
          var fd = fotosDesc[fp], foto = fd.info;
          var esNov = foto.tipo === 'novedad';
          var lc = esNov ? ROJO : VERDE;

          doc.rect(M, y, 70, 14).fill(lc);
          doc.fill(BLANCO).fontSize(7).font('Helvetica-Bold').text(esNov ? 'NOVEDAD' : 'VERIFICACION', M + 5, y + 3);
          doc.fill(NEGRO).fontSize(8).font('Helvetica-Bold').text(foto.descripcion || '', M + 80, y + 2);
          y += 20;

          if (fd.buffer) {
            try { doc.image(fd.buffer, 80, y, { fit: [380, 220], align: 'center' }); y += 230; }
            catch(e) { doc.rect(80,y,380,40).strokeColor(GRIS_LIN).stroke(); doc.fill(GRIS_CLR).fontSize(7).text('[Foto no disponible]',220,y+14); y+=50; }
          } else {
            doc.rect(80,y,380,40).strokeColor(GRIS_LIN).stroke(); doc.fill(GRIS_CLR).fontSize(7).text('[Foto no disponible]',220,y+14); y+=50;
          }

          doc.fill(lc).fontSize(7).font('Helvetica').text('IA: ' + (foto.validacion || 'Foto recibida'), 80, y, { width: 380 });
          y = doc.y + 18;
        }
      }

      // Firma
      y = check(y, 110);
      y += 10;
      doc.moveTo(M, y).lineTo(W-M, y).strokeColor(GRIS_LIN).lineWidth(0.5).stroke(); y += 10;
      doc.fill(NEGRO).fontSize(7).font('Helvetica-Bold').text('VERIFICACION Y TRAZABILIDAD LEGAL', M, y); y += 14;
      var tel = sesion.telefono ? sesion.telefono.replace('whatsapp:','') : (cond.telefono||'N/R');
      var idTx = 'CERO-'+(sesion.placa||'')+'-'+ahora.getFullYear()+('0'+(ahora.getMonth()+1)).slice(-2)+('0'+ahora.getDate()).slice(-2);
      doc.fill(GRIS_OSC).fontSize(7).font('Helvetica')
        .text('Firma: Firmado digitalmente por '+(cond.nombre||'N/R')+' mediante WhatsApp ('+tel+')', M, y, {width:520}); y+=12;
      doc.text('Timestamp: '+ahora.getDate()+'/'+(ahora.getMonth()+1)+'/'+ahora.getFullYear()+', '+horaCol(ahora)+' | ID Transaccion: '+idTx, M, y, {width:520}); y+=12;
      doc.text('Base Legal: Cumple con Ley 527/1999 y Decreto 2364/2012. Firma electronica simple valida para PESV.', M, y, {width:520}); y+=28;
      doc.moveTo(M,y).lineTo(W-M,y).strokeColor(GRIS_LIN).lineWidth(0.5).stroke(); y+=8;
      doc.rect(M,y,CW,35).fill(NEGRO);
      doc.fill(BLANCO).fontSize(7).font('Helvetica')
        .text('Delega el papeleo al sistema. Asegura el cumplimiento PESV, registra novedades con evidencia fotografica', M+10, y+6, {width:390})
        .text('y valida cada paso legalmente con firmas digitales.', M+10, y+17, {width:390});
      doc.fill(BLANCO).fontSize(12).font('Helvetica-Bold').text('CERO', 490, y+10);

      doc.end();

    } catch(err) { console.error('Error PDF:', err); reject(err); }
  });
}

async function subirYEnviarPDF(sesion, preoperacionalId, telefono) {
  try {
    var buf = await generarPDF(sesion);
    var nombre = 'preop_' + sesion.placa + '_' + Date.now() + '.pdf';
    var up = await config.supabase.storage.from('preoperacionales').upload(nombre, buf, { contentType: 'application/pdf', upsert: false });
    if (up.error) { console.error('Error subiendo PDF:', up.error); return null; }
    var pdfUrl = config.supabase.storage.from('preoperacionales').getPublicUrl(nombre).data.publicUrl;
    await config.supabase.from('preoperacionales').update({ pdf_url: pdfUrl }).eq('id', preoperacionalId);
    var ahora = new Date();
    var meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    await config.twilioClient.messages.create({
      from: config.TWILIO_WHATSAPP_NUMBER, to: telefono,
      body: '\uD83D\uDCC4 *PDF Preoperacional*\n' + (sesion.placa||'') + ' | ' + ahora.getDate()+'/'+meses[ahora.getMonth()]+'/'+ahora.getFullYear() + '\n\nDescarga aqui:\n' + pdfUrl
    });
    console.log('PDF enviado a ' + telefono);
    return pdfUrl;
  } catch(e) { console.error('Error subirYEnviarPDF:', e); return null; }
}

module.exports = { generarPDF, subirYEnviarPDF };
