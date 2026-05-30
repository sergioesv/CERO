// ============================================================
// DEPRECADO — no agregar nueva logica aqui.
// El motor activo es servicios/pdf/GeneradorPDFBase.js (clase).
// Este archivo existe solo para compatibilidad con wrappers legacy.
// Eliminar cuando preoperacional.js y posoperacional.js
// importen GeneradorPDF* directamente desde cierre.js.
// ============================================================

/**
 * Motor compartido de generación de PDF para CERO.
 * Expone helpers reutilizables por preoperacional y posoperacional.
 * No genera documentos por sí solo — es una librería de funciones.
 */

'use strict';

var PDFDocument = require('pdfkit'); // Motor de documentos (usado en crearDocumento)
var https       = require('https');
var http        = require('http');
var config      = require('../../config/config');
var LOGO_BASE64 = require('../logo').LOGO_BASE64;

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES DE LAYOUT — fuente única de verdad para colores, fuentes y márgenes
// ─────────────────────────────────────────────────────────────────────────────
var LAYOUT = {
  margin:       45,
  anchoUtil:    505,
  PAGE_W:       612,
  PAGE_H:       792,
  fuenteTitulo: 11,
  fuenteBase:   9,
  fuentePie:    7,
  colores: {
    negro:     '#1A1A1A',
    grisOsc:   '#333333',
    gris:      '#666666',
    grisCla:   '#999999',
    grisFondo: '#F5F5F5',
    grisLin:   '#E0E0E0',
    verde:     '#2E7D32',
    rojo:      '#C62828',
    rojoCla:   '#FFEBEE',
    amarillo:  '#F9A825',
    naranja:   '#E65100',
    azul:      '#1F4E79'
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// FECHA COLOMBIA — UTC-5, función centralizada
// ─────────────────────────────────────────────────────────────────────────────
function obtenerFechaColombia() {
  var ahora = new Date();
  return new Date(ahora.getTime() - (5 * 60 * 60 * 1000));
}

// ─────────────────────────────────────────────────────────────────────────────
// Calcula los días restantes a partir de hoy (Colombia) hasta una fecha ISO
// Positivo = faltan días, Negativo = ya venció, 0 = vence hoy
// ─────────────────────────────────────────────────────────────────────────────
function calcularDiasRestantes(fechaVencimiento) {
  if (!fechaVencimiento) return null;
  var hoy = obtenerFechaColombia();
  hoy.setHours(0, 0, 0, 0);
  var fecha = new Date(fechaVencimiento + 'T00:00:00');
  return Math.floor((fecha.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatea una fecha ISO 'YYYY-MM-DD' a 'dd/mm/aaaa'
// ─────────────────────────────────────────────────────────────────────────────
function formatearFechaCorta(fechaISO) {
  if (!fechaISO) return 'Sin fecha';
  var p = String(fechaISO).split('T')[0].split('-');
  if (p.length !== 3) return String(fechaISO);
  return p[2] + '/' + p[1] + '/' + p[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Descarga una imagen desde URL (soporta Twilio con autenticación y redirects)
// Retorna un Buffer o null si falla
// ─────────────────────────────────────────────────────────────────────────────
function descargarImagen(url) {
  return new Promise(function(resolve, reject) {
    if (!url) return resolve(null);

    var isTwilio = url.indexOf('twilio.com') >= 0 || url.indexOf('api.twilio.com') >= 0;

    if (isTwilio) {
      var credentials = Buffer.from(
        (config.TWILIO_ACCOUNT_SID || '') + ':' + (config.TWILIO_AUTH_TOKEN || '')
      ).toString('base64');

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
      return seguirUrl(url, 0);
    }

    // URL normal (no Twilio)
    var client = url.startsWith('https') ? https : http;
    client.get(url, function(response) {
      if (response.statusCode === 301 || response.statusCode === 302) {
        return descargarImagen(response.headers.location).then(resolve).catch(reject);
      }
      var chunks = [];
      response.on('data', function(c) { chunks.push(c); });
      response.on('end', function() { resolve(Buffer.concat(chunks)); });
      response.on('error', reject);
    }).on('error', reject);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Descarga todas las fotos de un array en paralelo con fallback por error
// Retorna array de { info: fotoOriginal, buffer: Buffer|null }
// ─────────────────────────────────────────────────────────────────────────────
async function descargarImagenes(fotos) {
  if (!Array.isArray(fotos) || fotos.length === 0) return [];

  var resultados = await Promise.all(fotos.map(async function(foto, idx) {
    try {
      var buffer = await descargarImagen(foto.url);
      return { info: foto, buffer: buffer };
    } catch (e) {
      console.error('Error descargando foto ' + idx + ':', e.message);
      return { info: foto, buffer: null };
    }
  }));

  return resultados;
}

// ─────────────────────────────────────────────────────────────────────────────
// Crea un PDFDocument con márgenes estándar de CERO
// ─────────────────────────────────────────────────────────────────────────────
function crearDocumento() {
  return new PDFDocument({
    size: 'LETTER',
    margins: {
      top:    LAYOUT.margin,
      bottom: LAYOUT.margin,
      left:   LAYOUT.margin,
      right:  LAYOUT.margin
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Agrega el header de primera página: logo + empresa + subtítulo + línea
// opciones: { subtitulo, codDoc, resolucion }
// Retorna el nuevo valor de y después del header
// ─────────────────────────────────────────────────────────────────────────────
function agregarHeaderPrimera(doc, opciones) {
  var C = LAYOUT.colores;
  var M = LAYOUT.margin;
  var opts = opciones || {};

  // Logo
  try {
    var logoBuffer = Buffer.from(LOGO_BASE64, 'base64');
    doc.image(logoBuffer, M, 12, { width: 50, height: 45 });
  } catch (e) {}

  // Nombre empresa y subtítulo
  doc.fill(C.negro).fontSize(LAYOUT.fuenteBase).font('Helvetica-Bold')
    .text('EDEMSA | CERO SYSTEM', 105, 18);
  doc.fill(C.grisCla).fontSize(LAYOUT.fuentePie).font('Helvetica')
    .text(opts.subtitulo || 'Documento de operaciones', 105, 30);

  // Código y resolución alineados a la derecha
  doc.fill(C.grisCla).fontSize(LAYOUT.fuentePie).font('Helvetica')
    .text(opts.codDoc || '', 420, 18, { align: 'right', width: 147 });
  doc.text(opts.resolucion || 'RES: 40595 DE 2022 (PESV)', 420, 30, { align: 'right', width: 147 });

  // Línea separadora
  doc.moveTo(M, 62).lineTo(LAYOUT.PAGE_W - M, 62)
    .strokeColor(C.grisLin).lineWidth(0.5).stroke();

  return LAYOUT.margin + 27; // y después del header
}

// ─────────────────────────────────────────────────────────────────────────────
// Agrega header de páginas secundarias (logo pequeño + placa + fecha)
// ─────────────────────────────────────────────────────────────────────────────
function agregarHeaderSecundaria(doc, placa, fechaTexto) {
  var C = LAYOUT.colores;
  var M = LAYOUT.margin;

  try {
    var lb = Buffer.from(LOGO_BASE64, 'base64');
    doc.image(lb, M, 8, { width: 24, height: 22 });
  } catch (e) {}

  doc.fill(C.negro).fontSize(LAYOUT.fuentePie).font('Helvetica-Bold')
    .text('EDEMSA | CERO SYSTEM', 75, 11, { lineBreak: false });
  doc.fill(C.grisCla).fontSize(6).font('Helvetica')
    .text((placa || '') + '  |  ' + (fechaTexto || ''), 75, 21, { lineBreak: false });
  doc.moveTo(M, 36).lineTo(LAYOUT.PAGE_W - M, 36)
    .strokeColor(C.grisLin).lineWidth(0.3).stroke();
}

// ─────────────────────────────────────────────────────────────────────────────
// Agrega pie de página con número de página centrado
// ─────────────────────────────────────────────────────────────────────────────
function agregarFooter(doc, numPagina) {
  var C = LAYOUT.colores;
  var M = LAYOUT.margin;

  doc.fontSize(6).font('Helvetica').fill(C.grisCla)
    .text(
      'Pag. ' + numPagina + '  |  CERO  |  Diseñado por Sergio Andres Estrada Velez  |  v1.0',
      M, LAYOUT.PAGE_H - 56,
      { width: LAYOUT.anchoUtil, align: 'center', lineBreak: false }
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Agrega el bloque "Hero del vehículo": marca/modelo + placa grande + año
// Retorna el nuevo valor de y
// ─────────────────────────────────────────────────────────────────────────────
function agregarHeroVehiculo(doc, y, vehiculo, placa) {
  var C = LAYOUT.colores;
  var M = LAYOUT.margin;
  var v = vehiculo || {};
  var marcaModelo = ((v.marca || '') + ' ' + (v.modelo || '')).trim() || 'Vehículo';

  doc.fill(C.negro).fontSize(16).font('Helvetica-Bold')
    .text(marcaModelo, M, y, { width: 360, lineBreak: false });
  y += 22;

  doc.fill(C.negro).fontSize(26).font('Helvetica-Bold')
    .text(placa || '', M, y);

  doc.fill(C.gris).fontSize(8).font('Helvetica')
    .text('Año ' + (v.anio || 'N/R'), 420, y + 4, { align: 'right', width: 147 });
  y += 32;

  doc.moveTo(M, y).lineTo(LAYOUT.PAGE_W - M, y)
    .strokeColor(C.grisLin).lineWidth(0.5).stroke();
  y += 12;

  return y;
}

// ─────────────────────────────────────────────────────────────────────────────
// Agrega fila de 4 tarjetas de información
// cards: array de { label: string, value: string }
// Retorna el nuevo valor de y
// ─────────────────────────────────────────────────────────────────────────────
function agregarTarjetasInfo(doc, y, cards) {
  var C = LAYOUT.colores;
  var M = LAYOUT.margin;
  var cardW = 123;

  for (var i = 0; i < Math.min(cards.length, 4); i++) {
    var cx = M + i * (cardW + 10);
    doc.rect(cx, y, cardW, 35).fill(C.grisFondo);
    doc.fill(C.grisCla).fontSize(6).font('Helvetica-Bold')
      .text(cards[i].label, cx + 8, y + 6, { width: cardW - 16 });
    doc.fill(C.negro).fontSize(LAYOUT.fuenteBase).font('Helvetica-Bold')
      .text(String(cards[i].value || 'N/R'), cx + 8, y + 18, { width: cardW - 16 });
  }
  y += 48;
  return y;
}

// ─────────────────────────────────────────────────────────────────────────────
// Agrega sección de documentos vigentes con semáforo de colores
// vehiculo: { soat_vencimiento, tecnomecanica_vencimiento }
// conductor: { licencia_vencimiento }
// Retorna el nuevo valor de y
// ─────────────────────────────────────────────────────────────────────────────
function agregarSeccionDocumentos(doc, y, vehiculo, conductor) {
  var C = LAYOUT.colores;
  var M = LAYOUT.margin;
  var v = vehiculo || {};
  var c = conductor || {};

  // Encabezado de sección
  doc.rect(M, y, LAYOUT.anchoUtil, 16).fill(C.grisFondo);
  doc.fill(C.negro).fontSize(8).font('Helvetica-Bold')
    .text('DOCUMENTOS DEL VEHICULO Y CONDUCTOR', M + 10, y + 4);
  y += 22;

  var documentos = [
    { nombre: 'SOAT',                fecha: v.soat_vencimiento || null },
    { nombre: 'Tecnomecanica',        fecha: v.tecnomecanica_vencimiento || null },
    { nombre: 'Licencia de conduccion', fecha: c.licencia_vencimiento || null }
  ];

  for (var i = 0; i < documentos.length; i++) {
    var doc_info = documentos[i];
    var dias = calcularDiasRestantes(doc_info.fecha);
    var texto, color;

    if (!doc_info.fecha) {
      texto = 'Sin fecha registrada';
      color = C.grisCla;
    } else if (dias <= 0) {
      texto = 'VENCIDO — ' + formatearFechaCorta(doc_info.fecha);
      color = C.rojo;
    } else if (dias <= 7) {
      texto = 'Vence en ' + dias + ' dia(s) — ' + formatearFechaCorta(doc_info.fecha);
      color = C.rojo;
    } else if (dias <= 15) {
      texto = 'Vence en ' + dias + ' dia(s) — ' + formatearFechaCorta(doc_info.fecha);
      color = C.naranja;
    } else if (dias <= 30) {
      texto = 'Vence en ' + dias + ' dia(s) — ' + formatearFechaCorta(doc_info.fecha);
      color = C.amarillo;
    } else {
      texto = 'Vigente — ' + formatearFechaCorta(doc_info.fecha);
      color = C.verde;
    }

    doc.fill(C.negro).fontSize(8).font('Helvetica')
      .text(doc_info.nombre, M + 10, y);
    doc.fill(color).fontSize(8).font('Helvetica-Bold')
      .text(texto, 280, y, { width: 260, align: 'right' });

    y += 12;
    doc.moveTo(M + 10, y).lineTo(LAYOUT.PAGE_W - M, y)
      .strokeColor(C.grisLin).lineWidth(0.3).stroke();
    y += 8;
  }

  y += 5;
  return y;
}

// ─────────────────────────────────────────────────────────────────────────────
// Agrega galería de fotos con etiquetas de tipo
// fotosDescargadas: array de { info: { tipo, descripcion }, buffer: Buffer|null }
// Retorna el nuevo valor de y
// ─────────────────────────────────────────────────────────────────────────────
function agregarFotos(doc, y, fotosDescargadas, checkYFn) {
  var C = LAYOUT.colores;
  var M = LAYOUT.margin;

  if (!fotosDescargadas || fotosDescargadas.length === 0) return y;

  // Encabezado de sección
  y = checkYFn(y, 40);
  doc.rect(M, y, LAYOUT.anchoUtil, 18).fill(C.negro);
  doc.fill('#ffffff').fontSize(LAYOUT.fuenteBase).font('Helvetica-Bold')
    .text('EVIDENCIA FOTOGRAFICA', M + 10, y + 4);
  y += 30;

  for (var i = 0; i < fotosDescargadas.length; i++) {
    y = checkYFn(y, 270);
    var fotoData = fotosDescargadas[i];
    var foto = fotoData.info;

    // Determinar etiqueta y color
    var etiqueta = 'EVIDENCIA';
    var labelColor = C.negro;
    if (foto.tipo === 'inicio_placa')      { etiqueta = 'PLACA';     labelColor = C.negro; }
    else if (foto.tipo === 'inicio_odometro') { etiqueta = 'ODOMETRO';  labelColor = C.verde; }
    else if (foto.tipo === 'odometro')     { etiqueta = 'ODOMETRO';  labelColor = C.verde; }
    else if (foto.tipo === 'novedad')      { etiqueta = 'NOVEDAD';   labelColor = C.rojo; }
    else if (foto.tipo === 'adicional')    { etiqueta = 'ADICIONAL'; labelColor = C.negro; }
    else if (foto.tipo === 'estado_general') { etiqueta = 'ESTADO';  labelColor = C.azul; }
    else if (foto.tipo === 'adicional_posop') { etiqueta = 'CIERRE'; labelColor = C.negro; }

    var tituloFoto = foto.descripcion || etiqueta;

    doc.rect(M, y, 86, 14).fill(labelColor);
    doc.fill('#ffffff').fontSize(LAYOUT.fuentePie).font('Helvetica-Bold')
      .text(etiqueta, M + 6, y + 3);
    doc.fill(C.negro).fontSize(8).font('Helvetica-Bold')
      .text(tituloFoto, M + 96, y + 2, { width: 300 });
    y += 20;

    if (fotoData.buffer) {
      try {
        doc.image(fotoData.buffer, 100, y, { fit: [340, 220], align: 'center', valign: 'center' });
        y += 228;
      } catch (e) {
        doc.rect(100, y, 340, 60).strokeColor(C.grisLin).lineWidth(1).stroke();
        doc.fill(C.grisCla).fontSize(8).font('Helvetica')
          .text('[Foto no disponible]', 212, y + 22);
        y += 70;
      }
    } else {
      doc.rect(100, y, 340, 60).strokeColor(C.grisLin).lineWidth(1).stroke();
      doc.fill(C.grisCla).fontSize(8).font('Helvetica')
        .text('[Foto no disponible]', 212, y + 22);
      y += 70;
    }

    y += 12;
  }

  return y;
}

// ─────────────────────────────────────────────────────────────────────────────
// Agrega bloque de firma digital con cédula, timestamp e ID de transacción
// opciones: { nombre, cedula, telefono, fecha (Date), placa }
// Retorna el nuevo valor de y
// ─────────────────────────────────────────────────────────────────────────────
function agregarFirmaDigital(doc, y, opciones) {
  var C = LAYOUT.colores;
  var M = LAYOUT.margin;
  var opts = opciones || {};
  var ahora = opts.fecha || obtenerFechaColombia();

  y += 15;
  doc.moveTo(M, y).lineTo(LAYOUT.PAGE_W - M, y)
    .strokeColor(C.grisLin).lineWidth(0.5).stroke();
  y += 10;

  doc.fill(C.negro).fontSize(LAYOUT.fuentePie).font('Helvetica-Bold')
    .text('VERIFICACION Y TRAZABILIDAD LEGAL', M, y);
  y += 14;

  // Línea de firma con cédula
  var cedula   = opts.cedula   ? ' — CC ' + opts.cedula   : '';
  var telefono = opts.telefono ? opts.telefono.replace('whatsapp:', '') : 'N/R';
  var nombre   = opts.nombre   || 'Conductor';

  doc.fill(C.grisOsc).fontSize(LAYOUT.fuentePie).font('Helvetica')
    .text(
      'Firma: Firmado digitalmente por ' + nombre + cedula +
      ' mediante WhatsApp (' + telefono + ')',
      M, y, { width: 520 }
    );
  y += 12;

  // Timestamp e ID de transacción
  var idTx = 'CERO-' + (opts.placa || '') + '-' + ahora.toISOString().split('T')[0].replace(/-/g, '');
  doc.text(
    'Timestamp: ' + ahora.toLocaleString('es-CO') + ' | ID Transaccion: ' + idTx,
    M, y, { width: 520 }
  );
  y += 12;

  doc.text(
    'Base Legal: Cumple con Ley 527/1999 y Decreto 2364/2012. Firma electronica simple valida para PESV.',
    M, y, { width: 520 }
  );
  y += 30;

  // Banner final CERO
  doc.moveTo(M, y).lineTo(LAYOUT.PAGE_W - M, y)
    .strokeColor(C.grisLin).lineWidth(0.5).stroke();
  y += 10;

  doc.rect(M, y, LAYOUT.anchoUtil, 35).fill(C.negro);
  doc.fill('#ffffff').fontSize(LAYOUT.fuentePie).font('Helvetica')
    .text(
      'Delega el papeleo al sistema. Asegura el cumplimiento PESV, registra novedades con evidencia fotografica',
      M + 10, y + 6, { width: 390 }
    );
  doc.text('y valida cada paso legalmente con firmas digitales.', M + 10, y + 17, { width: 390 });
  doc.fill('#ffffff').fontSize(12).font('Helvetica-Bold').text('CERO', 490, y + 10);

  return y + 45;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sube un buffer PDF a Supabase Storage y retorna la URL firmada (7 días)
// Retorna null si falla
// ─────────────────────────────────────────────────────────────────────────────
async function subirPDF(buffer, bucket, nombreArchivo) {
  var uploadResult = await config.supabase.storage
    .from(bucket)
    .upload(nombreArchivo, buffer, { contentType: 'application/pdf', upsert: false });

  if (uploadResult.error) {
    console.error('Error subiendo PDF:', uploadResult.error.message || uploadResult.error);
    return null;
  }

  var signedResult = await config.supabase.storage
    .from(bucket)
    .createSignedUrl(nombreArchivo, 60 * 60 * 24 * 7);

  if (signedResult.error || !signedResult.data || !signedResult.data.signedUrl) {
    console.error('Error generando URL firmada:', signedResult.error && (signedResult.error.message || signedResult.error));
    return null;
  }

  return signedResult.data.signedUrl;
}

// ─────────────────────────────────────────────────────────────────────────────
// Envía el PDF por WhatsApp via Twilio
// opciones: { placa, fechaTexto, titulo }
// ─────────────────────────────────────────────────────────────────────────────
async function enviarPDFWhatsApp(pdfUrl, telefono, opciones) {
  var opts = opciones || {};
  var titulo = opts.titulo || 'PDF';
  var placa  = opts.placa  || '';
  var fecha  = opts.fechaTexto || '';

  try {
    await config.twilioClient.messages.create({
      from: config.TWILIO_WHATSAPP_NUMBER,
      to:   telefono,
      body: '📄 *' + titulo + '*\n' + placa + ' | ' + fecha + '\n\nDescarga aqui:\n' + pdfUrl
    });
    return true;
  } catch (e) {
    console.error('Error enviando PDF por WhatsApp:', e.message || e);
    return false;
  }
}

module.exports = {
  LAYOUT,
  obtenerFechaColombia,
  calcularDiasRestantes,
  formatearFechaCorta,
  descargarImagen,
  descargarImagenes,
  crearDocumento,
  agregarHeaderPrimera,
  agregarHeaderSecundaria,
  agregarFooter,
  agregarHeroVehiculo,
  agregarTarjetasInfo,
  agregarSeccionDocumentos,
  agregarFotos,
  agregarFirmaDigital,
  subirPDF,
  enviarPDFWhatsApp
};
