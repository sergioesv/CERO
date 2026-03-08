const PDFDocument = require('pdfkit');
const { createClient } = require('@supabase/supabase-js');
const { descargarImagen } = require('./ia');
const { LOGO_BASE64: logoBase64 } = require('./logo');

const clean = (value) => value ? value.replace(/^["']|["']$/g, '') : value;

const supabase = createClient(
  clean(process.env.SUPABASE_URL),
  clean(process.env.SUPABASE_KEY)
);

// Colores
const NEGRO    = '#1A1A1A';
const BLANCO   = '#FFFFFF';
const GRIS_BG  = '#F7F7F7';
const GRIS_LIN = '#E0E0E0';
const VERDE    = '#2E7D32';
const NARANJA  = '#E65100';
const ROJO     = '#C62828';
const ROJO_CLR = '#FFEBEE';
const VERDE_CLR= '#E8F5E9';

async function generarPDF(datos) {
  console.log('generarPDF iniciado para:', datos.placa);

  // Descargar fotos ANTES de crear el documento
  const fotosConBuffer = [];
  if (datos.fotos && datos.fotos.length > 0) {
    for (const foto of datos.fotos) {
      try {
        const { base64 } = await descargarImagen(foto.url);
        fotosConBuffer.push({ ...foto, buffer: Buffer.from(base64, 'base64') });
      } catch (err) {
        console.error('Error descargando foto:', err.message);
        fotosConBuffer.push({ ...foto, buffer: null });
      }
    }
  }

  console.log('Fotos listas, generando PDF...');

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'LETTER', margin: 0, autoFirstPage: true });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => { console.log('PDF OK'); resolve(Buffer.concat(chunks)); });
      doc.on('error', reject);

      const W = 612; // ancho carta
      const MAR = 40;
      const CONT = W - MAR * 2;

      // ─── PÁGINA 1 ───────────────────────────────────────────────

      // Franja superior negra
      doc.rect(0, 0, W, 56).fill(NEGRO);

      // Logo
      try {
        const logoBuf = Buffer.from(logoBase64, 'base64');
        doc.image(logoBuf, MAR, 8, { height: 40 });
      } catch(e) { /* sin logo */ }

      // Titulo encabezado
      doc.fillColor(BLANCO).fontSize(13).font('Helvetica-Bold')
         .text('EDEMSA | CERO SYSTEM', 150, 14);
      doc.fontSize(9).font('Helvetica')
         .text('Inspeccion Preoperacional de Vehiculo', 150, 30);

      // Codigos derecha
      doc.fontSize(8).font('Helvetica')
         .text('COD: I-GL-001-F04 V05', W - MAR - 160, 16, { width: 160, align: 'right' })
         .text('RES: 40595 DE 2022 (PESV)', W - MAR - 160, 28, { width: 160, align: 'right' });

      // ─── HERO VEHÍCULO ──────────────────────────────────────────
      const vehiculo = datos.vehiculo || {};
      const marca  = vehiculo.marca  || '';
      const modelo = vehiculo.modelo || '';
      const tipo   = vehiculo.tipo   || '';
      const anio   = vehiculo.anio   || '';

      doc.fillColor(NEGRO).fontSize(22).font('Helvetica')
         .text(marca + ' ' + modelo, MAR, 70);
      doc.fontSize(38).font('Helvetica-Bold')
         .text(datos.placa || '', MAR, 90);

      // Tipo y año derecha
      doc.fontSize(11).font('Helvetica')
         .text(tipo, W - MAR - 120, 78, { width: 120, align: 'right' })
         .text('Anio ' + anio, W - MAR - 120, 94, { width: 120, align: 'right' });

      // Línea separadora
      doc.moveTo(MAR, 138).lineTo(W - MAR, 138).lineWidth(1).strokeColor(GRIS_LIN).stroke();

      // ─── TARJETAS INFO ──────────────────────────────────────────
      const conductor = datos.conductor || {};
      const nombre    = conductor.nombre || (typeof datos.conductor === 'string' ? datos.conductor : 'N/A');
      const licencia  = conductor.licencia_categoria || 'N/A';
      const km        = datos.kilometraje ? datos.kilometraje.toLocaleString('es-CO') + ' km' : 'N/A';
      const fecha     = datos.fecha ? new Date(datos.fecha).toLocaleDateString('es-CO', { day:'numeric', month:'short', year:'numeric' }) : 'N/A';

      const cards = [
        { label: 'PILOTO',    value: nombre },
        { label: 'LICENCIA',  value: 'Cat. ' + licencia },
        { label: 'ODOMETRO',  value: km },
        { label: 'FECHA',     value: fecha }
      ];
      const cardW = CONT / 4;
      const cardY = 148;

      cards.forEach((card, i) => {
        const cx = MAR + i * cardW;
        doc.rect(cx, cardY, cardW - 4, 52).fill(GRIS_BG);
        doc.fillColor('#888888').fontSize(7).font('Helvetica-Bold')
           .text(card.label, cx + 8, cardY + 8);
        doc.fillColor(NEGRO).fontSize(12).font('Helvetica-Bold')
           .text(card.value, cx + 8, cardY + 22, { width: cardW - 16 });
      });

      let y = cardY + 64;

      // ─── NOVEDADES CRÍTICAS ──────────────────────────────────────
      const novedades = datos.novedades || datos.items || [];
      const criticas  = novedades.filter(n => n.critico || n.estado === 'CRITICO' || n.estado === 'No funciona' || n.estado === 'Vacio' || n.estado === 'Danada');
      const atencion  = novedades.filter(n => !criticas.includes(n) && n.estado && n.estado !== 'OK');

      const todasNovedades = [...criticas, ...atencion];

      if (todasNovedades.length > 0) {
        // Header negro
        doc.rect(MAR, y, CONT, 28).fill(NEGRO);
        doc.fillColor(BLANCO).fontSize(10).font('Helvetica-Bold')
           .text('NOVEDADES CRITICAS REPORTADAS', MAR + 10, y + 9);
        y += 28;

        todasNovedades.forEach(nov => {
          const esCritico = criticas.includes(nov);
          const color = esCritico ? ROJO : NARANJA;
          const grupo = nov.grupo || '';
          const item  = nov.item  || nov.nombre || '';
          const nota  = nov.nota  || nov.estado  || '';

          // Barra lateral de color
          doc.rect(MAR, y, 4, 36).fill(color);

          // Grupo
          doc.fillColor('#666666').fontSize(8).font('Helvetica-Bold')
             .text(grupo.toUpperCase(), MAR + 12, y + 4);
          // Item + estado
          doc.fillColor(color).fontSize(10).font('Helvetica-Bold')
             .text(item + (nov.estado ? ' (' + nov.estado.toUpperCase() + ')' : ''), MAR + 12, y + 16, { width: 280 });
          // Nota
          doc.fillColor('#444444').fontSize(9).font('Helvetica')
             .text(nota, MAR + 300, y + 16, { width: 180 });

          // Badge "Alerta Supervisor" si es crítico
          if (esCritico) {
            doc.rect(W - MAR - 110, y + 10, 106, 18).fill(ROJO_CLR);
            doc.fillColor(ROJO).fontSize(8).font('Helvetica-Bold')
               .text('Alerta Supervisor', W - MAR - 107, y + 14);
          }

          y += 40;
        });

        y += 8;
      }

      // ─── BLOQUES DE INSPECCIÓN ───────────────────────────────────
      const bloques = datos.bloques || [];

      bloques.forEach(bloque => {
        if (y > 680) { doc.addPage(); y = MAR; }

        // Header bloque
        doc.rect(MAR, y, CONT, 22).fill('#EEEEEE');
        doc.fillColor(NEGRO).fontSize(10).font('Helvetica-Bold')
           .text(bloque.nombre, MAR + 8, y + 6);
        y += 22;

        (bloque.items || []).forEach(item => {
          if (y > 700) { doc.addPage(); y = MAR; }

          const est = item.estado || 'OK';
          let estadoColor = VERDE;
          let estadoTag   = 'OK';

          if (est === 'OK' || est === 'ok') {
            estadoColor = VERDE; estadoTag = 'OK';
          } else if (item.critico) {
            estadoColor = ROJO; estadoTag = 'CRITICO';
          } else {
            estadoColor = NARANJA; estadoTag = 'ATENCION';
          }

          // Fila
          doc.rect(MAR, y, CONT, 18).fill(BLANCO);
          doc.moveTo(MAR, y + 18).lineTo(W - MAR, y + 18).lineWidth(0.5).strokeColor('#EEEEEE').stroke();

          // Nombre item
          doc.fillColor('#333333').fontSize(9).font('Helvetica')
             .text(item.nombre, MAR + 8, y + 5, { width: 180 });

          // Estado descriptivo (verde/naranja)
          doc.fillColor(estadoColor).fontSize(9).font('Helvetica-Bold')
             .text(est, MAR + 200, y + 5, { width: 180 });

          // Tag derecha
          doc.fillColor(estadoColor).fontSize(8).font('Helvetica-Bold')
             .text(estadoTag, W - MAR - 70, y + 5, { width: 66, align: 'right' });

          y += 18;
        });

        y += 10;
      });

      // ─── OBSERVACIONES ───────────────────────────────────────────
      if (datos.observacion) {
        if (y > 680) { doc.addPage(); y = MAR; }
        doc.rect(MAR, y, CONT, 22).fill('#EEEEEE');
        doc.fillColor(NEGRO).fontSize(10).font('Helvetica-Bold')
           .text('OBSERVACIONES', MAR + 8, y + 6);
        y += 26;
        doc.fillColor('#333333').fontSize(9).font('Helvetica')
           .text(datos.observacion, MAR + 8, y, { width: CONT - 16 });
        y += 30;
      }

      // ─── PÁGINA FOTOS ─────────────────────────────────────────────
      if (fotosConBuffer.length > 0) {
        doc.addPage();

        // Header
        doc.rect(0, 0, W, 40).fill(NEGRO);
        doc.fillColor(BLANCO).fontSize(13).font('Helvetica-Bold')
           .text('EVIDENCIA FOTOGRAFICA (VALIDACION IA)', MAR, 13);

        let yF = 55;

        fotosConBuffer.forEach(foto => {
          if (yF > 600) { doc.addPage(); yF = MAR; }

          const esVerif  = foto.tipo === 'verificacion';
          const tagColor = esVerif ? VERDE : ROJO;
          const tagText  = esVerif ? 'VERIFICACION' : 'NOVEDAD';
          const desc     = foto.descripcion || '';
          const comentario = foto.comentario || foto.validacion || '';

          // Tag
          doc.rect(MAR, yF, 90, 16).fill(tagColor);
          doc.fillColor(BLANCO).fontSize(8).font('Helvetica-Bold')
             .text(tagText, MAR + 4, yF + 4);

          // Descripcion
          doc.fillColor(NEGRO).fontSize(9).font('Helvetica-Bold')
             .text(desc, MAR + 96, yF + 2);
          yF += 20;

          // Foto
          const IMG_H = 160;
          if (foto.buffer) {
            try {
              doc.image(foto.buffer, MAR, yF, { width: 220, height: IMG_H });
            } catch(e) {
              doc.rect(MAR, yF, 220, IMG_H).fill('#EEEEEE');
              doc.fillColor(ROJO).fontSize(9).text('[Error imagen]', MAR + 70, yF + 70);
            }
          } else {
            doc.rect(MAR, yF, 220, IMG_H).fill('#EEEEEE');
            doc.fillColor('#999').fontSize(9).text('[FOTO]', MAR + 85, yF + 70);
          }

          // Comentario IA al lado
          if (comentario) {
            doc.fillColor('#444444').fontSize(8).font('Helvetica')
               .text('IA: ' + comentario, MAR + 234, yF + 8, { width: CONT - 234, lineGap: 4 });
          }

          yF += IMG_H + 16;
        });
      }

      // ─── PÁGINA FIRMA ─────────────────────────────────────────────
      doc.addPage();

      doc.rect(0, 0, W, 40).fill(NEGRO);
      doc.fillColor(BLANCO).fontSize(13).font('Helvetica-Bold')
         .text('VERIFICACION Y TRAZABILIDAD LEGAL', MAR, 13);

      const nombreFirma = typeof datos.conductor === 'object'
        ? (datos.conductor.nombre || 'N/A')
        : (datos.conductor || 'N/A');
      const telFirma = datos.telefono
        ? datos.telefono.replace('whatsapp:', '').replace('+57', '+57 ').replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3')
        : 'N/A';
      const fechaFirma = datos.fecha
        ? new Date(datos.fecha).toLocaleString('es-CO')
        : new Date().toLocaleString('es-CO');
      const idTx = 'CERO-' + (datos.placa || '') + '-' + new Date().toISOString().slice(0,10).replace(/-/g,'');

      doc.rect(MAR, 56, CONT, 80).fill(VERDE_CLR);
      doc.fillColor(NEGRO).fontSize(10).font('Helvetica-Bold')
         .text('Firma: Firmado digitalmente por ' + nombreFirma + ' mediante WhatsApp (' + telFirma + ')', MAR + 12, 66, { width: CONT - 24 });
      doc.fontSize(9).font('Helvetica')
         .text('Timestamp: ' + fechaFirma + '  |  ID Transaccion: ' + idTx, MAR + 12, 90, { width: CONT - 24 })
         .text('Base Legal: Cumple con Ley 527/1999 y Decreto 2364/2012. Firma electronica simple valida para PESV.', MAR + 12, 108, { width: CONT - 24 });

      console.log('Llamando doc.end()...');
      doc.end();

    } catch (error) {
      console.error('Error generando PDF:', error.message);
      reject(error);
    }
  });
}

async function subirYEnviarPDF(datos) {
  try {
    console.log('subirYEnviarPDF iniciado');
    const pdfBuffer = await generarPDF(datos);
    console.log('PDF buffer listo, tamaño:', pdfBuffer.length);

    const nombreArchivo = `preop_${datos.placa}_${Date.now()}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from('preoperacionales')
      .upload(nombreArchivo, pdfBuffer, { contentType: 'application/pdf', upsert: false });

    if (uploadError) { console.error('Error subiendo PDF:', uploadError); throw uploadError; }

    console.log('PDF subido:', nombreArchivo);

    const { data: urlData } = supabase.storage
      .from('preoperacionales')
      .getPublicUrl(nombreArchivo);

    console.log('URL publica:', urlData.publicUrl);
    return urlData.publicUrl;

  } catch (error) {
    console.error('Error en subirYEnviarPDF:', error);
    throw error;
  }
}

module.exports = { generarPDF, subirYEnviarPDF };
