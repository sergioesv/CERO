var PDFDocument = require('pdfkit');
var https = require('https');
var http = require('http');
var config = require('../config/config');
var GRUPOS = require('../modulos/vehiculos/preoperacional/validaciones').GRUPOS;
var utils = require('../modulos/vehiculos/preoperacional/validaciones');
var LOGO_BASE64 = require('./logo').LOGO_BASE64;

// FIX: extraer constantes de layout y estilo a un objeto centralizado
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

// ───────────────────────────────────────────────────────────
// Obtiene la fecha y hora actual en Colombia (UTC-5)
// Retorna un objeto Date ajustado a zona horaria colombiana
// ───────────────────────────────────────────────────────────
function obtenerFechaColombia() {
  var ahora = new Date();
  return new Date(ahora.getTime() - (5 * 60 * 60 * 1000));
}

// ───────────────────────────────────────────────────────────
// Calcula los días restantes entre hoy (Colombia) y una fecha
// Positivo = faltan días, Negativo = ya venció, 0 = vence hoy
// ───────────────────────────────────────────────────────────
function calcularDiasRestantes(fechaVencimiento) {
  if (!fechaVencimiento) return null;
  var hoy = obtenerFechaColombia();
  hoy.setHours(0, 0, 0, 0);
  var fecha = new Date(fechaVencimiento + 'T00:00:00');
  var diferencia = fecha.getTime() - hoy.getTime();
  return Math.floor(diferencia / (1000 * 60 * 60 * 24));
}

// ───────────────────────────────────────────────────────────
// Formatea una fecha ISO a dd/mm/aaaa
// ───────────────────────────────────────────────────────────
function formatearFechaCorta(fechaISO) {
  if (!fechaISO) return 'Sin fecha';
  var partes = fechaISO.split('-');
  if (partes.length !== 3) return fechaISO;
  return partes[2] + '/' + partes[1] + '/' + partes[0];
}

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
          if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
          var chunks = [];
          res.on('data', function(c) { chunks.push(c); });
          res.on('end', function() { resolve(Buffer.concat(chunks)); });
        });
        req.on('error', reject);
        // FIX: agregar timeout a la descarga para evitar bloqueos indefinidos en https.request
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
  // FIX: registrar fotos con error de descarga para trazabilidad sin abortar la generación del PDF
  var fotosConError = [];
  if (sesion.fotos && sesion.fotos.length > 0) {
    for (var d = 0; d < sesion.fotos.length; d++) {
      try {
        var imgBuffer = await descargarImagen(sesion.fotos[d].url);
        fotosDescargadas.push({ buffer: imgBuffer, info: sesion.fotos[d] });
      } catch (e) {
        console.error('Error descargando foto ' + d + ':', e.message);
        // FIX: almacenar la foto fallida y el motivo para facilitar el log operativo
        fotosConError.push({
          index: d,
          url: sesion.fotos[d] && sesion.fotos[d].url,
          tipo: sesion.fotos[d] && sesion.fotos[d].tipo,
          error: e.message
        });
        fotosDescargadas.push({ buffer: null, info: sesion.fotos[d] });
      }
    }
  }

  // FIX: emitir log consolidado de fotos no descargadas sin interrumpir la generación del PDF
  if (fotosConError.length > 0) {
    console.warn('Fotos con error al generar PDF:', fotosConError);
  }

  return new Promise(function(resolve, reject) {
    try {
      // ===== CONSTANTES =====
      var NEGRO      = LAYOUT.colores.negro;
      var GRIS_OSC   = '#333333';
      var GRIS       = '#666666';
      var GRIS_CLR   = '#999999';
      var GRIS_FONDO = '#F5F5F5';
      var GRIS_LIN   = '#E0E0E0';
      var VERDE      = '#2E7D32';
      var ROJO       = '#C62828';
      var ROJO_CLR   = '#FFEBEE';
      var AMARILLO   = '#F9A825';
      var NARANJA    = '#E65100';
      var PAGE_W     = 612;
      var PAGE_H     = 792;
      var MARGIN     = LAYOUT.margin;
      var CONTENT_W  = LAYOUT.anchoUtil;
      var FOOTER_Y   = PAGE_H - 30;

      // FIX: usar fecha Colombia centralizada en todo el PDF
      var ahora = obtenerFechaColombia();
      var fecha = ahora.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });

      var doc = new PDFDocument({ size: 'LETTER', margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } });
      var chunks = [];
      doc.on('data', function(c) { chunks.push(c); });
      doc.on('end', function() { resolve(Buffer.concat(chunks)); });
      doc.on('error', reject);

      var numPagina = 1;

      // Dibuja header/footer en la página actual sin mover el cursor de contenido
      function decorarPagina(esPrimera) {
        var savedX = doc.x;
        var savedY = doc.y;

        // Footer
        doc.fontSize(6).font('Helvetica').fill(GRIS_CLR)
          .text(
            'Pag. ' + numPagina + '  |  CERO  |  Diseñado por Sergio Andres Estrada Velez  |  v1.0',
            MARGIN, PAGE_H - 56, { width: CONTENT_W, align: 'center', lineBreak: false }
          );

        if (!esPrimera) {
          try {
            var lb = Buffer.from(LOGO_BASE64, 'base64');
            doc.image(lb, MARGIN, 8, { width: 24, height: 22 });
          } catch(e) {}
          doc.fill(NEGRO).fontSize(LAYOUT.fuentePie).font('Helvetica-Bold')
            .text('EDEMSA | CERO SYSTEM  —  Inspeccion Preoperacional', 75, 11, { lineBreak: false });
          doc.fill(GRIS_CLR).fontSize(6).font('Helvetica')
            .text((sesion.placa || '') + '  |  ' + fecha, 75, 21, { lineBreak: false });
          doc.moveTo(MARGIN, 36).lineTo(PAGE_W - MARGIN, 36).strokeColor(GRIS_LIN).lineWidth(0.3).stroke();
        }

        doc.x = savedX;
        doc.y = savedY;
      }

      // ===== HELPER: nueva página =====
      function nuevaPagina(esPrimera) {
        if (esPrimera) {
          decorarPagina(true);
          return MARGIN + 10;
        }

        numPagina++;
        doc.addPage({ size: 'LETTER', margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } });
        decorarPagina(false);
        return 46;
      }

      // ===== HELPER: verificar espacio disponible =====
      function checkY(y, needed) {
        if (y + needed > PAGE_H - 50) {
          return nuevaPagina(false);
        }
        return y;
      }

      // ===== PÁGINA 1 =====
      var y = nuevaPagina(true);

      // Header completo p1
      try {
        var logoBuffer = Buffer.from(LOGO_BASE64, 'base64');
        doc.image(logoBuffer, MARGIN, 12, { width: 50, height: 45 });
      } catch (e) {}

      doc.fill(NEGRO).fontSize(LAYOUT.fuenteBase).font('Helvetica-Bold').text('EDEMSA | CERO SYSTEM', 105, 18);
      doc.fill(GRIS_CLR).fontSize(LAYOUT.fuentePie).font('Helvetica').text('Inspeccion Preoperacional de Vehiculo', 105, 30);
      doc.fill(GRIS_CLR).fontSize(LAYOUT.fuentePie).font('Helvetica')
        .text('COD: I-GL-001-F04 V05', 420, 18, { align: 'right', width: 147 });
      doc.text('RES: 40595 DE 2022 (PESV)', 420, 30, { align: 'right', width: 147 });
      doc.moveTo(MARGIN, 62).lineTo(PAGE_W - MARGIN, 62).strokeColor(GRIS_LIN).lineWidth(0.5).stroke();

      // ===== HERO VEHÍCULO =====
      y = LAYOUT.headerAlto;
      var vehiculo = sesion.vehiculo || {};
      var marcaModelo = ((vehiculo.marca || '') + ' ' + (vehiculo.modelo || '')).trim();

      doc.fill(NEGRO).fontSize(20).font('Helvetica-Bold')
        .text(marcaModelo, MARGIN, y, { width: 360, lineBreak: false });
      y += 26;

      doc.fill(NEGRO).fontSize(28).font('Helvetica-Bold')
        .text(sesion.placa || '', MARGIN, y);

      // Año a la derecha
      doc.fill(GRIS).fontSize(8).font('Helvetica')
        .text('Año ' + (vehiculo.anio || 'N/R'), 420, 80, { align: 'right', width: 147 });

      y += 36;
      doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor(GRIS_LIN).lineWidth(0.5).stroke();
      y += 12;

      // ===== TARJETAS INFO =====
      var conductor = sesion.conductor || {};
      var nombreConductor = conductor.nombre || 'N/R';
      var licenciaCat = conductor.licencia_categoria ? 'Cat. ' + conductor.licencia_categoria : 'N/R';
      var diaNum = ahora.getDate();
      var mesNombre = ahora.toLocaleDateString('es-CO', { month: 'long' });
      var horaStr = ahora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
      var fechaCorta = diaNum + '/' + mesNombre.charAt(0).toUpperCase() + mesNombre.slice(1) + ' ' + horaStr;

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
        doc.fill(NEGRO).fontSize(LAYOUT.fuenteBase).font('Helvetica-Bold').text(cards[ci].value, cx + 8, y + 18, { width: cardW - 16 });
      }
      y += 48;

      // ═══════════════════════════════════════════════════════
      // SECCIÓN DOCUMENTOS VIGENTES — Requisito Res. 40595/2022
      // Muestra estado de SOAT, Tecnomecánica y Licencia
      // al momento exacto de la inspección (inmutable para auditoría)
      // ═══════════════════════════════════════════════════════
      y = checkY(y, 80);
      doc.rect(MARGIN, y, CONTENT_W, 16).fill(GRIS_FONDO);
      doc.fill(NEGRO).fontSize(8).font('Helvetica-Bold').text('DOCUMENTOS DEL VEHICULO Y CONDUCTOR', MARGIN + 10, y + 4);
      y += 22;

      // Preparar datos de documentos
      var documentos = [
        {
          nombre: 'SOAT',
          fecha: vehiculo.soat_vencimiento || null,
          obligatorio: true
        },
        {
          nombre: 'Tecnomecanica',
          fecha: vehiculo.tecnomecanica_vencimiento || null,
          obligatorio: true
        },
        {
          nombre: 'Licencia conduccion',
          fecha: conductor.licencia_vencimiento || null,
          obligatorio: true
        }
      ];

      for (var di = 0; di < documentos.length; di++) {
        y = checkY(y, 18);
        var docInfo = documentos[di];
        var diasRest = calcularDiasRestantes(docInfo.fecha);
        var estadoDocTexto = '';
        var estadoDocColor = VERDE;

        if (!docInfo.fecha) {
          // Sin fecha registrada
          estadoDocTexto = 'Sin fecha registrada';
          estadoDocColor = GRIS_CLR;
        } else if (diasRest <= 0) {
          // Vencido
          estadoDocTexto = 'VENCIDO — ' + formatearFechaCorta(docInfo.fecha);
          estadoDocColor = ROJO;
        } else if (diasRest <= 7) {
          // Crítico — 7 días o menos
          estadoDocTexto = 'Vence en ' + diasRest + ' dia(s) — ' + formatearFechaCorta(docInfo.fecha);
          estadoDocColor = ROJO;
        } else if (diasRest <= 15) {
          // Urgente — 15 días o menos
          estadoDocTexto = 'Vence en ' + diasRest + ' dia(s) — ' + formatearFechaCorta(docInfo.fecha);
          estadoDocColor = NARANJA;
        } else if (diasRest <= 30) {
          // Próximo — 30 días o menos
          estadoDocTexto = 'Vence en ' + diasRest + ' dia(s) — ' + formatearFechaCorta(docInfo.fecha);
          estadoDocColor = AMARILLO;
        } else {
          // Vigente
          estadoDocTexto = 'Vigente — ' + formatearFechaCorta(docInfo.fecha);
          estadoDocColor = VERDE;
        }

        // Nombre del documento a la izquierda
        doc.fill(NEGRO).fontSize(8).font('Helvetica').text(docInfo.nombre, MARGIN + 10, y);

        // Estado a la derecha con color
        doc.fill(estadoDocColor).fontSize(8).font('Helvetica-Bold')
          .text(estadoDocTexto, 280, y, { width: 260, align: 'right' });

        y += 12;
        doc.moveTo(MARGIN + 10, y).lineTo(PAGE_W - MARGIN, y).strokeColor(GRIS_LIN).lineWidth(0.3).stroke();
        y += 8;
      }

      y += 5;

      // ===== NOVEDADES =====
      var novedades = sesion.novedades || [];
      if (novedades.length > 0) {
        y = checkY(y, 30);
        doc.rect(MARGIN, y, CONTENT_W, 18).fill(NEGRO);
        doc.fill('#ffffff').fontSize(8).font('Helvetica-Bold').text('NOVEDADES CRITICAS REPORTADAS', MARGIN + 10, y + 5);
        y += 25;

        for (var ni = 0; ni < novedades.length; ni++) {
          y = checkY(y, 36);
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
        y = checkY(y, 40);

        doc.rect(MARGIN, y, CONTENT_W, 16).fill(GRIS_FONDO);
        doc.fill(NEGRO).fontSize(8).font('Helvetica-Bold').text(grupo.nombre, MARGIN + 10, y + 4);
        y += 22;

        // Mapa de estados reportados
        var respuesta = (sesion.respuestas && sesion.respuestas[grupo.id]) ? sesion.respuestas[grupo.id] : null;
        var itemsReportados = (respuesta && respuesta.items) ? respuesta.items : [];
        var mapaEstados = {};
        for (var ri = 0; ri < itemsReportados.length; ri++) {
          mapaEstados[itemsReportados[ri].nombre] = itemsReportados[ri].estado;
        }

        for (var j = 0; j < grupo.items.length; j++) {
          y = checkY(y, 22);
          var itemDef = grupo.items[j];
          var estadoVal = mapaEstados.hasOwnProperty(itemDef.nombre) ? mapaEstados[itemDef.nombre] : 'OK';
          var estadoTexto, estadoColor;

          var clasificacion = utils.clasificarEstado(estadoVal);
          estadoTexto = typeof estadoVal === 'number'
            ? (estadoVal === 1 ? 'OK' : estadoVal === 2 ? 'Atencion' : estadoVal === 3 ? 'Malo' : 'N/A')
            : (estadoVal || 'OK');

          if (clasificacion === 'ok') {
            estadoColor = VERDE;
          } else if (clasificacion === 'advertencia') {
            estadoColor = AMARILLO;
          } else if (clasificacion === 'na') {
            estadoColor = GRIS_CLR;
          } else {
            estadoColor = ROJO;
          }

          doc.fill(NEGRO).fontSize(8).font('Helvetica').text(itemDef.nombre, MARGIN + 10, y);
          doc.fill(estadoColor).fontSize(8).font('Helvetica-Bold')
            .text(estadoTexto, 405, y, { width: 135, align: 'right' });
          y += 12;
          doc.moveTo(MARGIN + 10, y).lineTo(PAGE_W - MARGIN, y).strokeColor(GRIS_LIN).lineWidth(0.3).stroke();
          y += 8;
        }
        y += 5;
      }

      // ===== OBSERVACIONES =====
      if (sesion.observacion) {
        y = checkY(y, 50);
        doc.rect(MARGIN, y, CONTENT_W, 16).fill(GRIS_FONDO);
        doc.fill(NEGRO).fontSize(8).font('Helvetica-Bold').text('OBSERVACIONES', MARGIN + 10, y + 4);
        y += 22;
        doc.fill(GRIS_OSC).fontSize(8).font('Helvetica').text(sesion.observacion, MARGIN + 10, y, { width: 500 });
        y += 25;
      }

      // ===== EVIDENCIA FOTOGRAFICA =====
      if (fotosDescargadas.length > 0) {
        y = checkY(y, 40);

        doc.rect(MARGIN, y, CONTENT_W, 18).fill(NEGRO);
        doc.fill('#ffffff').fontSize(LAYOUT.fuenteBase).font('Helvetica-Bold')
          .text('EVIDENCIA FOTOGRAFICA', MARGIN + 10, y + 4);
        y += 30;

        for (var fp = 0; fp < fotosDescargadas.length; fp++) {
          y = checkY(y, 270);
          var fotoData = fotosDescargadas[fp];
          var foto = fotoData.info;
          var esFotoNovedad = foto.tipo === 'novedad';
          var labelColor = esFotoNovedad ? ROJO : (foto.tipo === 'inicio_odometro' ? VERDE : NEGRO);
          var fotoLabel = 'EVIDENCIA';
          if (foto.tipo === 'inicio_placa') fotoLabel = 'PLACA';
          else if (foto.tipo === 'inicio_odometro') fotoLabel = 'ODOMETRO';
          else if (foto.tipo === 'novedad') fotoLabel = 'NOVEDAD';
          else if (foto.tipo === 'adicional') fotoLabel = 'ADICIONAL';

          var tituloFoto = foto.descripcion || '';
          if (foto.tipo === 'adicional') {
            tituloFoto = 'Evidencia adicional';
          }

          doc.rect(MARGIN, y, 86, 14).fill(labelColor);
          doc.fill('#ffffff').fontSize(LAYOUT.fuentePie).font('Helvetica-Bold').text(fotoLabel, MARGIN + 6, y + 3);
          if (tituloFoto) {
            doc.fill(NEGRO).fontSize(8).font('Helvetica-Bold')
              .text(tituloFoto, MARGIN + 96, y + 2, { width: 300 });
          }
          y += 20;

          if (fotoData.buffer) {
            try {
              doc.image(fotoData.buffer, 100, y, { fit: [340, 220], align: 'center', valign: 'center' });
              y += 228;
            } catch (imgErr) {
              doc.rect(100, y, 340, 60).strokeColor(GRIS_LIN).lineWidth(1).stroke();
              doc.fill(GRIS_CLR).fontSize(8).font('Helvetica').text('[Foto no disponible]', 212, y + 22);
              y += 70;
            }
          } else {
            doc.rect(100, y, 340, 60).strokeColor(GRIS_LIN).lineWidth(1).stroke();
            doc.fill(GRIS_CLR).fontSize(8).font('Helvetica').text('[Foto no disponible]', 212, y + 22);
            y += 70;
          }

          y += 12;
        }
      }

      // ===== FIRMA Y FOOTER FINAL =====
      y = checkY(y, 120);
      y += 15;
      doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor(GRIS_LIN).lineWidth(0.5).stroke();
      y += 10;

      doc.fill(NEGRO).fontSize(LAYOUT.fuentePie).font('Helvetica-Bold').text('VERIFICACION Y TRAZABILIDAD LEGAL', MARGIN, y);
      y += 14;

      var telFirma = sesion.telefono ? sesion.telefono.replace('whatsapp:', '') : (conductor.telefono || 'N/R');
      doc.fill(GRIS_OSC).fontSize(LAYOUT.fuentePie).font('Helvetica')
        .text('Firma: Firmado digitalmente por ' + nombreConductor + ' mediante WhatsApp (' + telFirma + ')', MARGIN, y, { width: 520 });
      y += 12;
      var idTx = 'CERO-' + (sesion.placa || '') + '-' + ahora.toISOString().split('T')[0].replace(/-/g, '');
      doc.text('Timestamp: ' + ahora.toLocaleString('es-CO') + ' | ID Transaccion: ' + idTx, MARGIN, y, { width: 520 });
      y += 12;
      doc.text('Base Legal: Cumple con Ley 527/1999 y Decreto 2364/2012. Firma electronica simple valida para PESV.', MARGIN, y, { width: 520 });
      y += 30;

      doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor(GRIS_LIN).lineWidth(0.5).stroke();
      y += 10;
      doc.rect(MARGIN, y, CONTENT_W, 35).fill(NEGRO);
      doc.fill('#ffffff').fontSize(LAYOUT.fuentePie).font('Helvetica')
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
      .from(config.STORAGE_BUCKET_PREOPERACIONALES)
      .upload(nombreArchivo, pdfBuffer, { contentType: 'application/pdf', upsert: false });

    if (uploadResult.error) {
      console.error('Error subiendo PDF:', uploadResult.error);
      return null;
    }

    var signedUrlResult = await config.supabase.storage
      .from(config.STORAGE_BUCKET_PREOPERACIONALES)
      .createSignedUrl(nombreArchivo, 60 * 60 * 24 * 7);

    if (signedUrlResult.error || !signedUrlResult.data || !signedUrlResult.data.signedUrl) {
      console.error('Error generando URL firmada:', signedUrlResult.error);
      return null;
    }

    var pdfUrl = signedUrlResult.data.signedUrl;
    console.log('PDF subido:', nombreArchivo);

    await config.supabase.from(config.TABLES.preoperacionales).update({ pdf_url: pdfUrl }).eq('id', preoperacionalId);

    // FIX: usar fecha Colombia para el mensaje de envío
    var ahoraCo = obtenerFechaColombia();
    var fechaEnvio = ahoraCo.toLocaleDateString('es-CO');

    var ultimoErrorEnvio = null;
    for (var intento = 1; intento <= 2; intento++) {
      try {
        await config.twilioClient.messages.create({
          from: config.TWILIO_WHATSAPP_NUMBER,
          to: telefono,
          body: '📄 *PDF Preoperacional*\n' + (sesion.placa || '') + ' | ' + fechaEnvio + '\n\nDescarga aqui:\n' + pdfUrl
        });
        console.log('PDF enviado a ' + telefono);
        return pdfUrl;
      } catch (envioError) {
        ultimoErrorEnvio = envioError;
        console.error('Intento ' + intento + ' de envio PDF fallido:', envioError.message);
      }
    }

    if (ultimoErrorEnvio) {
      console.error('Error enviando PDF:', ultimoErrorEnvio.message);
    }
    return null;

  } catch (error) {
    console.error('Error en subirYEnviarPDF:', error);
    return null;
  }
}

module.exports = { generarPDF, subirYEnviarPDF };
