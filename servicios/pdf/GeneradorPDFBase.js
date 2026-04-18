'use strict';

const PDFDocument = require('pdfkit');
const https = require('https');
const http = require('http');
const config = require('../../config/config');
const LOGO_BASE64 = require('../logo').LOGO_BASE64;

class GeneradorPDFBase {
  constructor(opciones = {}) {
    this.LAYOUT = {
      margin: 45,
      anchoUtil: 505,
      PAGE_W: 612,
      PAGE_H: 792,
      fuenteTitulo: 11,
      fuenteBase: 9,
      fuentePie: 7,
      colores: {
        negro: '#1A1A1A',
        grisOsc: '#333333',
        gris: '#666666',
        grisCla: '#999999',
        grisFondo: '#F5F5F5',
        grisLin: '#E0E0E0',
        verde: '#2E7D32',
        rojo: '#C62828',
        rojoCla: '#FFEBEE',
        amarillo: '#F9A825',
        naranja: '#E65100',
        azul: '#1F4E79'
      }
    };

    this.doc = new PDFDocument({
      size: 'LETTER',
      margins: {
        top: this.LAYOUT.margin,
        bottom: this.LAYOUT.margin,
        left: this.LAYOUT.margin,
        right: this.LAYOUT.margin
      }
    });

    this.numPagina = 1;
    
    // Configuración para el header
    this.nombreEmpresa = opciones.nombreEmpresa || 'dialk | CERO SYSTEM';
    
    // Inicializar buffers
    this.chunks = [];
    this.doc.on('data', chunk => this.chunks.push(chunk));
  }

  obtenerFechaColombia() {
    const ahora = new Date();
    return new Date(ahora.getTime() - (5 * 60 * 60 * 1000));
  }

  calcularDiasRestantes(fechaVencimiento) {
    if (!fechaVencimiento) return null;
    const hoy = this.obtenerFechaColombia();
    hoy.setHours(0, 0, 0, 0);
    const fecha = new Date(fechaVencimiento + 'T00:00:00');
    return Math.floor((fecha.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
  }

  formatearFechaCorta(fechaISO) {
    if (!fechaISO) return 'Sin fecha';
    const p = String(fechaISO).split('T')[0].split('-');
    if (p.length !== 3) return String(fechaISO);
    return `${p[2]}/${p[1]}/${p[0]}`;
  }

  descargarImagen(url) {
    return new Promise((resolve, reject) => {
      if (!url) return resolve(null);

      const isTwilio = url.indexOf('twilio.com') >= 0 || url.indexOf('api.twilio.com') >= 0;

      if (isTwilio) {
        const credentials = Buffer.from(
          `${config.TWILIO_ACCOUNT_SID || ''}:${config.TWILIO_AUTH_TOKEN || ''}`
        ).toString('base64');

        const seguirUrl = (currentUrl, saltos) => {
          if (saltos > 5) return reject(new Error('Demasiadas redirecciones'));
          const urlObj = new URL(currentUrl);
          const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            headers: { 'Authorization': `Basic ${credentials}` }
          };
          const req = https.request(options, res => {
            if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
              res.resume();
              return seguirUrl(res.headers.location, saltos + 1);
            }
            if (res.statusCode !== 200) {
              res.resume();
              return reject(new Error(`HTTP ${res.statusCode}`));
            }
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
          });
          req.on('error', reject);
          req.setTimeout(12000, () => req.destroy(new Error('Timeout descarga')));
          req.end();
        };
        return seguirUrl(url, 0);
      }

      const client = url.startsWith('https') ? https : http;
      client.get(url, response => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          return this.descargarImagen(response.headers.location).then(resolve).catch(reject);
        }
        const chunks = [];
        response.on('data', c => chunks.push(c));
        response.on('end', () => resolve(Buffer.concat(chunks)));
        response.on('error', reject);
      }).on('error', reject);
    });
  }

  async descargarImagenes(fotos) {
    if (!Array.isArray(fotos) || fotos.length === 0) return [];
    return Promise.all(fotos.map(async (foto, idx) => {
      try {
        const buffer = await this.descargarImagen(foto.url);
        return { info: foto, buffer };
      } catch (e) {
        console.error(`Error descargando foto ${idx}:`, e.message);
        return { info: foto, buffer: null };
      }
    }));
  }

  checkY(y, needed, subtituloHeader, placa, fecha) {
    if (y + needed > this.LAYOUT.PAGE_H - 50) {
      this.numPagina++;
      this.doc.addPage({ size: 'LETTER', margins: { top: this.LAYOUT.margin, bottom: this.LAYOUT.margin, left: this.LAYOUT.margin, right: this.LAYOUT.margin } });
      this.agregarHeaderSecundaria(subtituloHeader, placa, fecha);
      this.agregarFooter();
      return 46;
    }
    return y;
  }

  agregarHeaderPrimera(opciones = {}) {
    const C = this.LAYOUT.colores;
    const M = this.LAYOUT.margin;

    try {
      if (LOGO_BASE64) {
        const logoBuffer = Buffer.from(LOGO_BASE64, 'base64');
        this.doc.image(logoBuffer, M, 12, { width: 50, height: 45 });
      }
    } catch (e) {}

    this.doc.fill(C.negro).fontSize(this.LAYOUT.fuenteBase).font('Helvetica-Bold')
      .text(this.nombreEmpresa, 105, 18);
    this.doc.fill(C.grisCla).fontSize(this.LAYOUT.fuentePie).font('Helvetica')
      .text(opciones.subtitulo || 'Documento de operaciones', 105, 30);

    this.doc.fill(C.grisCla).fontSize(this.LAYOUT.fuentePie).font('Helvetica')
      .text(opciones.codDoc || '', 420, 18, { align: 'right', width: 147 });
    this.doc.text(opciones.resolucion || 'RES: 40595 DE 2022 (PESV)', 420, 30, { align: 'right', width: 147 });

    this.doc.moveTo(M, 62).lineTo(this.LAYOUT.PAGE_W - M, 62)
      .strokeColor(C.grisLin).lineWidth(0.5).stroke();

    return this.LAYOUT.margin + 27;
  }

  agregarHeaderSecundaria(titulo = '', placa = '', fechaTexto = '') {
    const C = this.LAYOUT.colores;
    const M = this.LAYOUT.margin;

    try {
      if (LOGO_BASE64) {
        const lb = Buffer.from(LOGO_BASE64, 'base64');
        this.doc.image(lb, M, 8, { width: 24, height: 22 });
      }
    } catch (e) {}

    this.doc.fill(C.negro).fontSize(this.LAYOUT.fuentePie).font('Helvetica-Bold')
      .text(this.nombreEmpresa, 75, 11, { lineBreak: false });
    this.doc.fill(C.grisCla).fontSize(6).font('Helvetica')
      .text(`${placa ? placa + '  |  ' : ''}${fechaTexto}`, 75, 21, { lineBreak: false });
    this.doc.moveTo(M, 36).lineTo(this.LAYOUT.PAGE_W - M, 36)
      .strokeColor(C.grisLin).lineWidth(0.3).stroke();
  }

  agregarFooter() {
    const C = this.LAYOUT.colores;
    const M = this.LAYOUT.margin;

    this.doc.fontSize(6).font('Helvetica').fill(C.grisCla)
      .text(
        `Pag. ${this.numPagina}  |  CERO  |  Diseñado por Sergio Andres Estrada Velez  |  v1.0`,
        M, this.LAYOUT.PAGE_H - 56,
        { width: this.LAYOUT.anchoUtil, align: 'center', lineBreak: false }
      );
  }

  agregarHeroVehiculo(y, vehiculo, placa) {
    const C = this.LAYOUT.colores;
    const M = this.LAYOUT.margin;
    const v = vehiculo || {};
    const marcaModelo = `${v.marca || ''} ${v.modelo || ''}`.trim() || 'Vehículo';

    this.doc.fill(C.negro).fontSize(16).font('Helvetica-Bold')
      .text(marcaModelo, M, y, { width: 360, lineBreak: false });
    y += 22;

    this.doc.fill(C.negro).fontSize(26).font('Helvetica-Bold')
      .text(placa || '', M, y);

    this.doc.fill(C.gris).fontSize(8).font('Helvetica')
      .text(`Año ${v.anio || 'N/R'}`, 420, y + 4, { align: 'right', width: 147 });
    y += 32;

    this.doc.moveTo(M, y).lineTo(this.LAYOUT.PAGE_W - M, y)
      .strokeColor(C.grisLin).lineWidth(0.5).stroke();
    y += 12;

    return y;
  }

  agregarTarjetasInfo(y, cards) {
    const C = this.LAYOUT.colores;
    const M = this.LAYOUT.margin;
    const cardW = 123;

    for (let i = 0; i < Math.min(cards.length, 4); i++) {
      const cx = M + i * (cardW + 10);
      this.doc.rect(cx, y, cardW, 35).fill(C.grisFondo);
      this.doc.fill(C.grisCla).fontSize(6).font('Helvetica-Bold')
        .text(cards[i].label, cx + 8, y + 6, { width: cardW - 16 });
      this.doc.fill(C.negro).fontSize(this.LAYOUT.fuenteBase).font('Helvetica-Bold')
        .text(String(cards[i].value || 'N/R'), cx + 8, y + 18, { width: cardW - 16 });
    }
    y += 48;
    return y;
  }

  agregarSeccionDocumentos(y, vehiculo, conductor) {
    const C = this.LAYOUT.colores;
    const M = this.LAYOUT.margin;
    const v = vehiculo || {};
    const c = conductor || {};

    this.doc.rect(M, y, this.LAYOUT.anchoUtil, 16).fill(C.grisFondo);
    this.doc.fill(C.negro).fontSize(8).font('Helvetica-Bold')
      .text('DOCUMENTOS DEL VEHICULO Y CONDUCTOR', M + 10, y + 4);
    y += 22;

    const documentos = [
      { nombre: 'SOAT', fecha: v.soat_vencimiento || null },
      { nombre: 'Tecnomecanica', fecha: v.tecnomecanica_vencimiento || null },
      { nombre: 'Licencia de conduccion', fecha: c.licencia_vencimiento || null }
    ];

    for (let doc_info of documentos) {
      const dias = this.calcularDiasRestantes(doc_info.fecha);
      let texto, color;

      if (!doc_info.fecha) {
        texto = 'Sin fecha registrada';
        color = C.grisCla;
      } else if (dias <= 0) {
        texto = `VENCIDO — ${this.formatearFechaCorta(doc_info.fecha)}`;
        color = C.rojo;
      } else if (dias <= 7) {
        texto = `Vence en ${dias} dia(s) — ${this.formatearFechaCorta(doc_info.fecha)}`;
        color = C.rojo;
      } else if (dias <= 15) {
        texto = `Vence en ${dias} dia(s) — ${this.formatearFechaCorta(doc_info.fecha)}`;
        color = C.naranja;
      } else if (dias <= 30) {
        texto = `Vence en ${dias} dia(s) — ${this.formatearFechaCorta(doc_info.fecha)}`;
        color = C.amarillo;
      } else {
        texto = `Vigente — ${this.formatearFechaCorta(doc_info.fecha)}`;
        color = C.verde;
      }

      this.doc.fill(C.negro).fontSize(8).font('Helvetica')
        .text(doc_info.nombre, M + 10, y);
      this.doc.fill(color).fontSize(8).font('Helvetica-Bold')
        .text(texto, 280, y, { width: 260, align: 'right' });

      y += 12;
      this.doc.moveTo(M + 10, y).lineTo(this.LAYOUT.PAGE_W - M, y)
        .strokeColor(C.grisLin).lineWidth(0.3).stroke();
      y += 8;
    }

    y += 5;
    return y;
  }

  agregarFotos(y, fotosDescargadas, subtituloHeader, placa, fechaTexto) {
    const C = this.LAYOUT.colores;
    const M = this.LAYOUT.margin;

    if (!fotosDescargadas || fotosDescargadas.length === 0) return y;

    y = this.checkY(y, 40, subtituloHeader, placa, fechaTexto);
    this.doc.rect(M, y, this.LAYOUT.anchoUtil, 18).fill(C.negro);
    this.doc.fill('#ffffff').fontSize(this.LAYOUT.fuenteBase).font('Helvetica-Bold')
      .text('EVIDENCIA FOTOGRAFICA', M + 10, y + 4);
    y += 30;

    for (let fotoData of fotosDescargadas) {
      y = this.checkY(y, 270, subtituloHeader, placa, fechaTexto);
      const foto = fotoData.info;

      let etiqueta = 'EVIDENCIA';
      let labelColor = C.negro;
      if (foto.tipo === 'inicio_placa') { etiqueta = 'PLACA'; labelColor = C.negro; }
      else if (foto.tipo === 'inicio_odometro') { etiqueta = 'ODOMETRO'; labelColor = C.verde; }
      else if (foto.tipo === 'odometro') { etiqueta = 'ODOMETRO'; labelColor = C.verde; }
      else if (foto.tipo === 'novedad') { etiqueta = 'NOVEDAD'; labelColor = C.rojo; }
      else if (foto.tipo === 'adicional') { etiqueta = 'ADICIONAL'; labelColor = C.negro; }
      else if (foto.tipo === 'estado_general') { etiqueta = 'ESTADO'; labelColor = C.azul; }
      else if (foto.tipo === 'adicional_posop') { etiqueta = 'CIERRE'; labelColor = C.negro; }

      const tituloFoto = foto.descripcion || etiqueta;

      this.doc.rect(M, y, 86, 14).fill(labelColor);
      this.doc.fill('#ffffff').fontSize(this.LAYOUT.fuentePie).font('Helvetica-Bold')
        .text(etiqueta, M + 6, y + 3);
      this.doc.fill(C.negro).fontSize(8).font('Helvetica-Bold')
        .text(tituloFoto, M + 96, y + 2, { width: 300 });
      y += 20;

      if (fotoData.buffer) {
        try {
          this.doc.image(fotoData.buffer, 100, y, { fit: [340, 220], align: 'center', valign: 'center' });
          y += 228;
        } catch (e) {
          this.doc.rect(100, y, 340, 60).strokeColor(C.grisLin).lineWidth(1).stroke();
          this.doc.fill(C.grisCla).fontSize(8).font('Helvetica')
            .text('[Foto no disponible]', 212, y + 22);
          y += 70;
        }
      } else {
        this.doc.rect(100, y, 340, 60).strokeColor(C.grisLin).lineWidth(1).stroke();
        this.doc.fill(C.grisCla).fontSize(8).font('Helvetica')
          .text('[Foto no disponible]', 212, y + 22);
        y += 70;
      }

      y += 12;
    }

    return y;
  }

  agregarFirmaDigital(y, opciones = {}) {
    const C = this.LAYOUT.colores;
    const M = this.LAYOUT.margin;
    const ahora = opciones.fecha || this.obtenerFechaColombia();

    y += 15;
    this.doc.moveTo(M, y).lineTo(this.LAYOUT.PAGE_W - M, y)
      .strokeColor(C.grisLin).lineWidth(0.5).stroke();
    y += 10;

    this.doc.fill(C.negro).fontSize(this.LAYOUT.fuentePie).font('Helvetica-Bold')
      .text('VERIFICACION Y TRAZABILIDAD LEGAL', M, y);
    y += 14;

    const cedula = opciones.cedula ? ` — CC ${opciones.cedula}` : '';
    const telefono = opciones.telefono ? opciones.telefono.replace('whatsapp:', '') : 'N/R';
    const nombre = opciones.nombre || 'Conductor';

    this.doc.fill(C.grisOsc).fontSize(this.LAYOUT.fuentePie).font('Helvetica')
      .text(
        `Firma: Firmado digitalmente por ${nombre}${cedula} mediante WhatsApp (${telefono})`,
        M, y, { width: 520 }
      );
    y += 12;

    const idTx = `CERO-${opciones.placa || ''}-${ahora.toISOString().split('T')[0].replace(/-/g, '')}`;
    this.doc.text(
      `Timestamp: ${ahora.toLocaleString('es-CO')} | ID Transaccion: ${idTx}`,
      M, y, { width: 520 }
    );
    y += 12;

    this.doc.text(
      'Base Legal: Cumple con Ley 527/1999 y Decreto 2364/2012. Firma electronica simple valida para PESV.',
      M, y, { width: 520 }
    );
    y += 30;

    this.doc.moveTo(M, y).lineTo(this.LAYOUT.PAGE_W - M, y)
      .strokeColor(C.grisLin).lineWidth(0.5).stroke();
    y += 10;

    this.doc.rect(M, y, this.LAYOUT.anchoUtil, 35).fill(C.negro);
    this.doc.fill('#ffffff').fontSize(this.LAYOUT.fuentePie).font('Helvetica')
      .text(
        'Delega el papeleo al sistema. Asegura el cumplimiento PESV, registra novedades con evidencia fotografica',
        M + 10, y + 6, { width: 390 }
      );
    this.doc.text('y valida cada paso legalmente con firmas digitales.', M + 10, y + 17, { width: 390 });
    this.doc.fill('#ffffff').fontSize(12).font('Helvetica-Bold').text('CERO', 490, y + 10);

    return y + 45;
  }

  obtenerBuffer() {
    return new Promise((resolve, reject) => {
      this.doc.on('end', () => resolve(Buffer.concat(this.chunks)));
      this.doc.on('error', reject);
      this.doc.end();
    });
  }
}

module.exports = GeneradorPDFBase;
