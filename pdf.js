const PDFDocument = require('pdfkit');
const { createClient } = require('@supabase/supabase-js');
const { descargarImagen } = require('./ia');
const { LOGO_BASE64: logoBase64 } = require('./logo');

// Función para quitar comillas
const clean = (value) => value ? value.replace(/^["']|["']$/g, '') : value;

const supabase = createClient(
  clean(process.env.SUPABASE_URL), 
  clean(process.env.SUPABASE_KEY)
);

async function generarPDF(datos) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // ENCABEZADO
      const logoBuffer = Buffer.from(logoBase64, 'base64');
      doc.image(logoBuffer, 50, 40, { width: 80 });
      
      doc.fontSize(20).font('Helvetica-Bold')
         .text('CERO SYSTEM', 150, 45);
      
      doc.fontSize(8).font('Helvetica')
         .text('I-GL-001-F04 Rev 05', 450, 50, { align: 'right' });

      doc.moveTo(50, 90).lineTo(562, 90).stroke();

      // PLACA HERO
      doc.fontSize(28).font('Helvetica-Bold')
         .text(datos.placa, 50, 110);

      doc.fontSize(12).font('Helvetica')
         .text(`${datos.marca} ${datos.modelo} ${datos.anio}`, 50, 145);

      // TARJETAS DE INFO
      const yCards = 180;
      const cardData = [
        { label: 'PILOTO', value: datos.conductor },
        { label: 'LICENCIA', value: datos.licencia },
        { label: 'ODÓMETRO', value: `${datos.kilometraje} km` },
        { label: 'FECHA', value: new Date(datos.fecha).toLocaleDateString('es-CO') }
      ];

      cardData.forEach((card, i) => {
        const x = 50 + (i * 128);
        doc.rect(x, yCards, 120, 50).fillAndStroke('#F5F5F5', '#E0E0E0');
        doc.fillColor('#000')
           .fontSize(8).font('Helvetica-Bold')
           .text(card.label, x + 10, yCards + 10);
        doc.fontSize(10).font('Helvetica')
           .text(card.value, x + 10, yCards + 28, { width: 100 });
      });

      let yPos = 260;

      // NOVEDADES CRÍTICAS
      const criticas = datos.items.filter(i => i.critico && i.estado !== 'OK');
      if (criticas.length > 0) {
        doc.rect(50, yPos, 512, 40).fill('#000');
        doc.fillColor('#FFF').fontSize(12).font('Helvetica-Bold')
           .text('⚠ NOVEDADES CRÍTICAS', 60, yPos + 12);
        
        doc.fontSize(10).font('Helvetica')
           .text(criticas.map(c => `${c.nombre}: ${c.estado}`).join(' • '), 60, yPos + 28);
        
        yPos += 60;
      }

      // BLOQUES DE INSPECCIÓN
      doc.fillColor('#000');
      datos.bloques.forEach(bloque => {
        if (yPos > 650) {
          doc.addPage();
          yPos = 50;
        }

        doc.fontSize(14).font('Helvetica-Bold')
           .text(bloque.nombre, 50, yPos);
        yPos += 25;

        bloque.items.forEach(item => {
          const color = item.estado === 'OK' ? '#4CAF50' : 
                       item.critico ? '#F44336' : '#FF9800';
          
          doc.rect(50, yPos, 8, 8).fill(color);
          doc.fillColor('#000').fontSize(10).font('Helvetica')
             .text(item.nombre, 65, yPos);
          
          doc.fontSize(9).font('Helvetica-Bold')
             .text(item.estado, 300, yPos);
          
          if (item.critico) {
            doc.fontSize(7).fillColor('#F44336')
               .text('[CRÍTICO]', 400, yPos);
          }
          
          yPos += 20;
        });

        yPos += 15;
      });

      // OBSERVACIONES
      if (datos.observacion) {
        if (yPos > 680) {
          doc.addPage();
          yPos = 50;
        }
        
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#000')
           .text('OBSERVACIONES', 50, yPos);
        yPos += 20;
        
        doc.fontSize(10).font('Helvetica')
           .text(datos.observacion, 50, yPos, { width: 512 });
        yPos += 40;
      }

      // FOTOS (NUEVA PÁGINA)
      if (datos.fotos && datos.fotos.length > 0) {
        doc.addPage();
        doc.fontSize(16).font('Helvetica-Bold')
           .text('EVIDENCIA FOTOGRÁFICA', 50, 50);

        let yFoto = 90;

        for (const foto of datos.fotos) {
          try {
            const { base64 } = await descargarImagen(foto.url);
            const imgBuffer = Buffer.from(base64, 'base64');

            if (yFoto > 600) {
              doc.addPage();
              yFoto = 50;
            }

            // TAG
            const tagColor = foto.tipo === 'verificacion' ? '#4CAF50' : '#F44336';
            const tagText = foto.tipo === 'verificacion' ? 'VERIFICACIÓN' : 'NOVEDAD';
            
            doc.rect(50, yFoto, 100, 20).fill(tagColor);
            doc.fillColor('#FFF').fontSize(10).font('Helvetica-Bold')
               .text(tagText, 55, yFoto + 5);

            yFoto += 30;

            // FOTO
            doc.image(imgBuffer, 50, yFoto, { 
              width: 250, 
              align: 'left' 
            });

            // COMENTARIO IA
            doc.fillColor('#000').fontSize(9).font('Helvetica')
               .text(foto.comentario || foto.descripcion, 320, yFoto, { 
                 width: 220,
                 align: 'left'
               });

            yFoto += 210;

          } catch (error) {
            console.error('Error incrustando foto:', error.message);
            doc.fillColor('#F44336').fontSize(9)
               .text(`[Error: ${foto.descripcion}]`, 50, yFoto);
            yFoto += 30;
          }
        }
      }

      // FIRMA
      doc.addPage();
      doc.fontSize(12).font('Helvetica-Bold')
         .text('FIRMA ELECTRÓNICA', 50, 50);

      doc.fontSize(10).font('Helvetica').fillColor('#000')
         .text(`Piloto: ${datos.conductor ? (datos.conductor.nombre || datos.conductor) : 'N/A'}`, 50, 80)
         .text(`Teléfono: ${datos.telefono}`, 50, 100)
         .text(`Fecha: ${new Date(datos.fecha).toLocaleString('es-CO')}`, 50, 120)
         .text(`ID Transacción: CERO-${datos.placa}-${Date.now()}`, 50, 140);

      doc.fontSize(8).fillColor('#666')
         .text('Firma válida según Ley 527/1999 - Firma Electrónica Simple', 50, 170);

      // FOOTER
      doc.rect(0, 720, 612, 72).fill('#000');
      doc.fillColor('#FFF').fontSize(10).font('Helvetica-Bold')
         .text('CERO SYSTEM', 50, 740)
         .fontSize(8).font('Helvetica')
         .text('Cero Papel • Cero Accidentes', 50, 760);

      doc.end();

    } catch (error) {
      reject(error);
    }
  });
}

async function subirYEnviarPDF(datos) {
  try {
    const pdfBuffer = await generarPDF(datos);
    const nombreArchivo = `preop_${datos.placa}_${Date.now()}.pdf`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('preoperacionales')
      .upload(nombreArchivo, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: false
      });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from('preoperacionales')
      .getPublicUrl(nombreArchivo);

    return urlData.publicUrl;

  } catch (error) {
    console.error('Error generando/subiendo PDF:', error);
    throw error;
  }
}

module.exports = { generarPDF, subirYEnviarPDF };
