const PDFDocument = require('pdfkit');
const { createClient } = require('@supabase/supabase-js');
const { descargarImagen } = require('./ia');
const { LOGO_BASE64: logoBase64 } = require('./logo');

const clean = (value) => value ? value.replace(/^["']|["']$/g, '') : value;

const supabase = createClient(
  clean(process.env.SUPABASE_URL),
  clean(process.env.SUPABASE_KEY)
);

async function generarPDF(datos) {
  console.log('generarPDF iniciado para:', datos.placa);

  // 1. Descargar todas las fotos ANTES de crear el documento
  const fotosConBuffer = [];
  if (datos.fotos && datos.fotos.length > 0) {
    for (const foto of datos.fotos) {
      try {
        console.log('Descargando foto para PDF:', foto.url);
        const { base64 } = await descargarImagen(foto.url);
        fotosConBuffer.push({ ...foto, buffer: Buffer.from(base64, 'base64') });
        console.log('Foto descargada OK');
      } catch (err) {
        console.error('Error descargando foto para PDF:', err.message);
        fotosConBuffer.push({ ...foto, buffer: null });
      }
    }
  }

  console.log('Fotos listas, generando documento PDF...');

  // 2. Generar el PDF de forma sincrona (sin async dentro del Promise)
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => {
        console.log('PDF generado OK, chunks:', chunks.length);
        resolve(Buffer.concat(chunks));
      });
      doc.on('error', reject);

      // ENCABEZADO
      try {
        const logoBuffer = Buffer.from(logoBase64, 'base64');
        doc.image(logoBuffer, 50, 40, { width: 80 });
      } catch (e) {
        console.error('Error con logo:', e.message);
      }

      doc.fontSize(20).font('Helvetica-Bold').text('CERO SYSTEM', 150, 45);
      doc.fontSize(8).font('Helvetica').text('I-GL-001-F04 Rev 05', 450, 50, { align: 'right' });
      doc.moveTo(50, 90).lineTo(562, 90).stroke();

      // PLACA HERO
      doc.fontSize(28).font('Helvetica-Bold').text(datos.placa || 'N/A', 50, 110);
      const vehiculo = datos.vehiculo || {};
      doc.fontSize(12).font('Helvetica')
         .text(`${vehiculo.marca || ''} ${vehiculo.modelo || ''} ${vehiculo.anio || ''}`.trim(), 50, 145);

      // TARJETAS DE INFO
      const conductor = datos.conductor || {};
      const nombreConductor = conductor.nombre || conductor || 'N/A';
      const licencia = conductor.licencia_categoria || 'N/A';
      const yCards = 180;
      const cardData = [
        { label: 'PILOTO', value: String(nombreConductor) },
        { label: 'LICENCIA', value: String(licencia) },
        { label: 'ODÓMETRO', value: `${datos.kilometraje || 0} km` },
        { label: 'FECHA', value: datos.fecha ? new Date(datos.fecha).toLocaleDateString('es-CO') : new Date().toLocaleDateString('es-CO') }
      ];

      cardData.forEach((card, i) => {
        const x = 50 + (i * 128);
        doc.rect(x, yCards, 120, 50).fillAndStroke('#F5F5F5', '#E0E0E0');
        doc.fillColor('#000').fontSize(8).font('Helvetica-Bold').text(card.label, x + 10, yCards + 10);
        doc.fontSize(10).font('Helvetica').text(card.value, x + 10, yCards + 28, { width: 100 });
      });

      let yPos = 260;

      // NOVEDADES CRÍTICAS
      const items = datos.items || [];
      const criticas = items.filter(i => i.critico && i.estado !== 'OK');
      if (criticas.length > 0) {
        doc.rect(50, yPos, 512, 40).fill('#000');
        doc.fillColor('#FFF').fontSize(12).font('Helvetica-Bold').text('NOVEDADES CRITICAS', 60, yPos + 12);
        doc.fontSize(10).font('Helvetica').text(criticas.map(c => `${c.nombre}: ${c.estado}`).join(' | '), 60, yPos + 28);
        yPos += 60;
      }

      // BLOQUES DE INSPECCIÓN
      doc.fillColor('#000');
      const bloques = datos.bloques || [];
      bloques.forEach(bloque => {
        if (yPos > 650) { doc.addPage(); yPos = 50; }

        doc.fontSize(14).font('Helvetica-Bold').text(bloque.nombre, 50, yPos);
        yPos += 25;

        (bloque.items || []).forEach(item => {
          const color = item.estado === 'OK' ? '#4CAF50' : item.critico ? '#F44336' : '#FF9800';
          doc.rect(50, yPos, 8, 8).fill(color);
          doc.fillColor('#000').fontSize(10).font('Helvetica').text(item.nombre, 65, yPos);
          doc.fontSize(9).font('Helvetica-Bold').text(item.estado, 300, yPos);
          if (item.critico && item.estado !== 'OK') {
            doc.fontSize(7).fillColor('#F44336').text('[CRITICO]', 400, yPos);
          }
          yPos += 20;
        });

        yPos += 15;
      });

      // OBSERVACIONES
      if (datos.observacion) {
        if (yPos > 680) { doc.addPage(); yPos = 50; }
        doc.fillColor('#000').fontSize(12).font('Helvetica-Bold').text('OBSERVACIONES', 50, yPos);
        yPos += 20;
        doc.fontSize(10).font('Helvetica').text(datos.observacion, 50, yPos, { width: 512 });
        yPos += 40;
      }

      // FOTOS
      if (fotosConBuffer.length > 0) {
        doc.addPage();
        doc.fontSize(16).font('Helvetica-Bold').text('EVIDENCIA FOTOGRAFICA', 50, 50);
        let yFoto = 90;

        fotosConBuffer.forEach(foto => {
          if (yFoto > 600) { doc.addPage(); yFoto = 50; }

          const tagColor = foto.tipo === 'verificacion' ? '#4CAF50' : '#F44336';
          const tagText = foto.tipo === 'verificacion' ? 'VERIFICACION' : 'NOVEDAD';
          doc.rect(50, yFoto, 100, 20).fill(tagColor);
          doc.fillColor('#FFF').fontSize(10).font('Helvetica-Bold').text(tagText, 55, yFoto + 5);
          yFoto += 30;

          if (foto.buffer) {
            try {
              doc.image(foto.buffer, 50, yFoto, { width: 250, align: 'left' });
            } catch (e) {
              console.error('Error insertando imagen en PDF:', e.message);
              doc.fillColor('#F44336').fontSize(9).text('[Error al insertar imagen]', 50, yFoto);
            }
          } else {
            doc.fillColor('#F44336').fontSize(9).text('[Foto no disponible]', 50, yFoto);
          }

          doc.fillColor('#000').fontSize(9).font('Helvetica')
             .text(foto.comentario || foto.descripcion || '', 320, yFoto, { width: 220 });

          yFoto += 210;
        });
      }

      // FIRMA
      doc.addPage();
      doc.fontSize(12).font('Helvetica-Bold').text('FIRMA ELECTRONICA', 50, 50);
      const nombreFirma = typeof datos.conductor === 'object' ? (datos.conductor.nombre || 'N/A') : (datos.conductor || 'N/A');
      doc.fontSize(10).font('Helvetica').fillColor('#000')
         .text(`Piloto: ${nombreFirma}`, 50, 80)
         .text(`Telefono: ${datos.telefono || 'N/A'}`, 50, 100)
         .text(`Fecha: ${datos.fecha ? new Date(datos.fecha).toLocaleString('es-CO') : new Date().toLocaleString('es-CO')}`, 50, 120)
         .text(`ID Transaccion: CERO-${datos.placa}-${Date.now()}`, 50, 140);

      doc.fontSize(8).fillColor('#666')
         .text('Firma valida segun Ley 527/1999 - Firma Electronica Simple', 50, 170);

      // FOOTER
      doc.rect(0, 720, 612, 72).fill('#000');
      doc.fillColor('#FFF').fontSize(10).font('Helvetica-Bold').text('CERO SYSTEM', 50, 740);
      doc.fontSize(8).font('Helvetica').text('Cero Papel - Cero Accidentes', 50, 760);

      console.log('Llamando doc.end()...');
      doc.end();

    } catch (error) {
      console.error('Error dentro del PDF:', error.message);
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

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('preoperacionales')
      .upload(nombreArchivo, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: false
      });

    if (uploadError) {
      console.error('Error subiendo PDF a Supabase:', uploadError);
      throw uploadError;
    }

    console.log('PDF subido a Supabase:', nombreArchivo);

    const { data: urlData } = supabase.storage
      .from('preoperacionales')
      .getPublicUrl(nombreArchivo);

    console.log('URL publica PDF:', urlData.publicUrl);
    return urlData.publicUrl;

  } catch (error) {
    console.error('Error generando/subiendo PDF:', error);
    throw error;
  }
}

module.exports = { generarPDF, subirYEnviarPDF };
