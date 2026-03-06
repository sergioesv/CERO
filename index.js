const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const twilio = require('twilio');
const PDFDocument = require('pdfkit');

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ==================== CONFIGURACIÓN ====================
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const TWILIO_WHATSAPP_NUMBER = 'whatsapp:+14155238886';

// ==================== SESIONES EN MEMORIA ====================
const sesiones = new Map();

function obtenerSesion(telefono) {
  if (!sesiones.has(telefono)) {
    sesiones.set(telefono, {
      estado: 'INICIO',
      placa: null,
      vehiculo: null,
      conductor: null,
      kilometraje: null,
      respuestas: {},
      novedades: [],
      fotos: [],
      fotosNovedadPendientes: [],
      observacion: null,
      preoperacionalId: null
    });
  }
  return sesiones.get(telefono);
}

// ==================== GRUPOS DEL PREOPERACIONAL ====================
const GRUPOS = [
  {
    id: 'llantas',
    nombre: 'LLANTAS',
    items: ['Delantera izq', 'Delantera der', 'Trasera izq', 'Trasera der', 'Repuesto'],
    abreviado: 'DI . DD . TI . TD . Repuesto'
  },
  {
    id: 'frenos_direccion',
    nombre: 'FRENOS Y DIRECCION',
    items: ['Freno servicio', 'Freno emergencia', 'Direccion'],
    abreviado: 'Servicio . Emergencia . Direccion'
  },
  {
    id: 'niveles',
    nombre: 'NIVELES',
    items: ['Aceite', 'Agua', 'Liquido frenos', 'Hidraulico', 'Combustible'],
    abreviado: 'Aceite . Agua . Liq.frenos . Hidraulico . Combustible'
  },
  {
    id: 'luces_pitos',
    nombre: 'LUCES Y PITOS',
    items: ['Altas', 'Bajas', 'Reversa', 'Pito', 'Emergencia', 'Balizas'],
    abreviado: 'Altas . Bajas . Reversa . Pito . Emergencia . Balizas'
  },
  {
    id: 'documentos',
    nombre: 'DOCUMENTOS',
    items: ['SOAT', 'Tecnomecanica', 'Tarjeta propiedad', 'Licencia'],
    abreviado: 'SOAT . Tecno . Tarjeta . Licencia'
  },
  {
    id: 'cinturon_espejos',
    nombre: 'CINTURON Y ESPEJOS',
    items: ['Cinturon conductor', 'Cinturon copiloto', 'Retrovisor', 'Lateral izq', 'Lateral der'],
    abreviado: 'Conductor . Copiloto . Retrovisor . Lat.izq . Lat.der'
  },
  {
    id: 'kit_carretera',
    nombre: 'KIT DE CARRETERA',
    items: ['Extintor', 'Botiquin', 'Triangulos', 'Linterna', 'Chaleco'],
    abreviado: 'Extintor . Botiquin . Triangulos . Linterna . Chaleco'
  },
  {
    id: 'carroceria_canasta',
    nombre: 'CARROCERIA Y CANASTA',
    items: ['Estado general'],
    abreviado: 'Estado general de carroceria y canasta'
  }
];

const FOTOS_VERIFICACION = [
  'Tome foto del odometro mostrando el kilometraje',
  'Tome foto del tablero encendido',
  'Tome foto de las llantas delanteras',
  'Tome foto de las llantas traseras',
  'Tome foto del extintor'
];

// ==================== FUNCION IA — INTERPRETAR RESPUESTA ====================
async function interpretarRespuesta(grupo, mensaje) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Eres el sistema CERO de inspeccion vehicular. El operario esta respondiendo sobre el grupo "${grupo.nombre}" con estos items: ${grupo.items.join(', ')}.

El operario escribio: "${mensaje}"

Las opciones por item son: 1=Bueno, 2=Regular, 3=Malo, 4=N/A

Interpreta la respuesta del operario. Si dice "1" solo, significa TODO BUENO para todos los items. Si menciona algo especifico como "aceite bajo" o "llanta pinchada", identifica que item tiene problema.

Responde SOLO en este formato JSON exacto, sin texto adicional:
{
  "items": [
    {"nombre": "nombre del item", "estado": 1, "nota": null},
    {"nombre": "nombre del item", "estado": 3, "nota": "descripcion del problema"}
  ],
  "hay_novedad": false,
  "resumen": "texto corto de confirmacion para el operario"
}`
      }]
    });

    const texto = response.content[0].text.trim();
    const jsonMatch = texto.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
  } catch (error) {
    console.error('Error Claude:', error);
    return null;
  }
}

// ==================== FUNCION IA — VALIDAR FOTO ====================
async function validarFoto(mediaUrl, descripcionEsperada) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'url',
              url: mediaUrl
            }
          },
          {
            type: 'text',
            text: `Eres el validador de fotos del sistema CERO de inspeccion vehicular. Se pidio al operario: "${descripcionEsperada}".

Analiza la foto y responde SOLO en este formato JSON:
{
  "valida": true o false,
  "descripcion": "que se ve en la foto",
  "razon_rechazo": null o "por que no es valida"
}`
          }
        ]
      }]
    });

    const texto = response.content[0].text.trim();
    const jsonMatch = texto.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return { valida: true, descripcion: 'No se pudo validar', razon_rechazo: null };
  } catch (error) {
    console.error('Error validacion foto:', error);
    return { valida: true, descripcion: 'Error en validacion', razon_rechazo: null };
  }
}

// ==================== GENERAR PDF ====================
async function generarPDF(sesion) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
      const chunks = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      const ahora = new Date();
      const fecha = ahora.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
      const hora = ahora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

      // ===== ENCABEZADO =====
      doc.rect(0, 0, 612, 80).fill('#1a237e');

      doc.fill('#ffffff')
        .fontSize(22)
        .font('Helvetica-Bold')
        .text('INSPECCION PREOPERACIONAL', 50, 20, { align: 'center' });

      doc.fontSize(11)
        .font('Helvetica')
        .text('CERO - Sistema de Gestion de Operaciones de Campo', 50, 48, { align: 'center' });

      doc.fill('#000000');

      // ===== DATOS DEL VEHICULO =====
      let y = 100;
      doc.rect(50, y, 512, 25).fill('#e8eaf6');
      doc.fill('#1a237e')
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('DATOS DEL VEHICULO', 60, y + 7);
      doc.fill('#000000');

      y += 35;
      doc.fontSize(10).font('Helvetica');

      const datosVehiculo = [
        ['Placa', sesion.placa],
        ['Tipo', (sesion.vehiculo.tipo || '') + ' ' + (sesion.vehiculo.marca || '') + ' ' + (sesion.vehiculo.modelo || '')],
        ['Anio', sesion.vehiculo.anio || 'N/R'],
        ['Kilometraje', sesion.kilometraje + ' km'],
        ['Fecha', fecha],
        ['Hora', hora]
      ];

      for (let i = 0; i < datosVehiculo.length; i += 2) {
        const izq = datosVehiculo[i];
        const der = datosVehiculo[i + 1];

        doc.font('Helvetica-Bold').text(izq[0] + ':', 60, y);
        doc.font('Helvetica').text(String(izq[1]), 160, y);

        if (der) {
          doc.font('Helvetica-Bold').text(der[0] + ':', 320, y);
          doc.font('Helvetica').text(String(der[1]), 420, y);
        }
        y += 18;
      }

      // ===== DATOS DEL CONDUCTOR =====
      y += 10;
      doc.rect(50, y, 512, 25).fill('#e8eaf6');
      doc.fill('#1a237e')
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('DATOS DEL CONDUCTOR', 60, y + 7);
      doc.fill('#000000');

      y += 35;
      doc.fontSize(10);

      if (sesion.conductor) {
        doc.font('Helvetica-Bold').text('Nombre:', 60, y);
        doc.font('Helvetica').text(sesion.conductor.nombre, 160, y);
        doc.font('Helvetica-Bold').text('Cedula:', 320, y);
        doc.font('Helvetica').text(sesion.conductor.cedula, 420, y);
        y += 18;
        doc.font('Helvetica-Bold').text('Licencia:', 60, y);
        doc.font('Helvetica').text(sesion.conductor.licencia_categoria || 'N/R', 160, y);
        doc.font('Helvetica-Bold').text('Telefono:', 320, y);
        doc.font('Helvetica').text(sesion.conductor.telefono, 420, y);
      } else {
        doc.font('Helvetica').text('Conductor no registrado', 60, y);
      }

      // ===== INSPECCION POR GRUPOS =====
      y += 35;
      doc.rect(50, y, 512, 25).fill('#e8eaf6');
      doc.fill('#1a237e')
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('RESULTADO DE LA INSPECCION', 60, y + 7);
      doc.fill('#000000');

      y += 35;

      const estadoTexto = { 1: 'Bueno', 2: 'Regular', 3: 'Malo', 4: 'N/A' };
      const estadoColor = { 1: '#2e7d32', 2: '#f9a825', 3: '#c62828', 4: '#757575' };

      for (const grupo of GRUPOS) {
        const respuesta = sesion.respuestas[grupo.id];
        if (!respuesta) continue;

        if (y > 680) {
          doc.addPage();
          y = 50;
        }

        doc.rect(60, y, 492, 20).fill('#f5f5f5');
        doc.fill('#1a237e')
          .fontSize(10)
          .font('Helvetica-Bold')
          .text(grupo.nombre, 65, y + 5);
        doc.fill('#000000');

        y += 25;

        for (const item of respuesta.items) {
          if (y > 700) {
            doc.addPage();
            y = 50;
          }

          doc.fontSize(9).font('Helvetica');
          doc.text('  ' + item.nombre, 70, y);

          const color = estadoColor[item.estado] || '#000000';
          doc.fill(color)
            .font('Helvetica-Bold')
            .text(estadoTexto[item.estado] || 'N/R', 250, y);
          doc.fill('#000000');

          if (item.nota) {
            doc.font('Helvetica')
              .fontSize(8)
              .fill('#c62828')
              .text('-> ' + item.nota, 330, y);
            doc.fill('#000000');
          }

          y += 16;
        }
        y += 5;
      }

      // ===== NOVEDADES =====
      if (sesion.novedades.length > 0) {
        if (y > 650) {
          doc.addPage();
          y = 50;
        }

        y += 10;
        doc.rect(50, y, 512, 25).fill('#ffebee');
        doc.fill('#c62828')
          .fontSize(12)
          .font('Helvetica-Bold')
          .text('NOVEDADES REPORTADAS', 60, y + 7);
        doc.fill('#000000');

        y += 35;

        for (const novedad of sesion.novedades) {
          if (y > 700) {
            doc.addPage();
            y = 50;
          }

          doc.fontSize(9)
            .font('Helvetica-Bold')
            .fill('#c62828')
            .text('! ' + novedad.grupo + ' - ' + novedad.item, 70, y);

          if (novedad.nota) {
            doc.font('Helvetica')
              .fill('#000000')
              .text('  ' + novedad.nota, 70, y + 14);
            y += 14;
          }
          doc.fill('#000000');
          y += 18;
        }
      }

      // ===== OBSERVACIONES =====
      if (sesion.observacion) {
        if (y > 680) {
          doc.addPage();
          y = 50;
        }

        y += 10;
        doc.rect(50, y, 512, 25).fill('#e8eaf6');
        doc.fill('#1a237e')
          .fontSize(12)
          .font('Helvetica-Bold')
          .text('OBSERVACIONES', 60, y + 7);
        doc.fill('#000000');

        y += 35;
        doc.fontSize(10).font('Helvetica').text(sesion.observacion, 60, y, { width: 492 });
        y += 30;
      }

      // ===== FIRMA ELECTRONICA =====
      if (y > 650) {
        doc.addPage();
        y = 50;
      }

      y += 20;
      doc.rect(50, y, 512, 25).fill('#e8f5e9');
      doc.fill('#2e7d32')
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('FIRMA ELECTRONICA', 60, y + 7);
      doc.fill('#000000');

      y += 35;
      doc.fontSize(9).font('Helvetica');

      const firmaData = [
        ['Confirmacion', 'SI - Firmado por WhatsApp'],
        ['Conductor', sesion.conductor ? sesion.conductor.nombre : 'No registrado'],
        ['Telefono', sesion.conductor ? sesion.conductor.telefono : 'N/R'],
        ['Fecha y hora', ahora.toLocaleString('es-CO')],
        ['Base legal', 'Ley 527/1999 - Decreto 2364/2012 - Firma electronica simple']
      ];

      for (const par of firmaData) {
        doc.font('Helvetica-Bold').text(par[0] + ':', 60, y);
        doc.font('Helvetica').text(par[1], 200, y);
        y += 16;
      }

      // ===== PIE DE PAGINA =====
      y += 30;
      doc.rect(50, y, 512, 1).fill('#cccccc');
      y += 10;
      doc.fontSize(7)
        .fill('#999999')
        .font('Helvetica')
        .text('Documento generado automaticamente por CERO - ' + ahora.toLocaleString('es-CO'), 50, y, { align: 'center' });
      doc.text('Valido como registro de inspeccion preoperacional segun Resolucion 40595 de 2022', 50, y + 10, { align: 'center' });

      doc.end();
    } catch (error) {
      console.error('Error generando PDF:', error);
      reject(error);
    }
  });
}

// ==================== SUBIR PDF A SUPABASE Y ENVIAR POR WHATSAPP ====================
async function subirYEnviarPDF(sesion, preoperacionalId, telefono) {
  try {
    const pdfBuffer = await generarPDF(sesion);

    const fecha = new Date().toISOString().split('T')[0];
    const nombreArchivo = 'preop_' + sesion.placa + '_' + fecha + '_' + Date.now() + '.pdf';

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('preoperacionales')
      .upload(nombreArchivo, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: false
      });

    if (uploadError) {
      console.error('Error subiendo PDF:', uploadError);
      return;
    }

    const { data: urlData } = supabase.storage
      .from('preoperacionales')
      .getPublicUrl(nombreArchivo);

    const pdfUrl = urlData.publicUrl;

    await supabase
      .from('preoperacionales')
      .update({ pdf_url: pdfUrl })
      .eq('id', preoperacionalId);

    await twilioClient.messages.create({
      from: TWILIO_WHATSAPP_NUMBER,
      to: telefono,
      body: 'PDF Preoperacional - ' + sesion.placa + '\n' + new Date().toLocaleDateString('es-CO') + '\n\nDescarga aqui:\n' + pdfUrl
    });

    console.log('PDF enviado a ' + telefono + ': ' + pdfUrl);

  } catch (error) {
    console.error('Error en subirYEnviarPDF:', error);
  }
}

// ==================== ENVIAR MENSAJE ====================
function responderTwiml(res, mensaje) {
  var twiml = '<?xml version="1.0" encoding="UTF-8"?>';
  twiml += '<Response>';
  twiml += '<Message>' + mensaje + '</Message>';
  twiml += '</Response>';
  res.type('text/xml');
  res.send(twiml);
}

// ==================== GENERAR RESUMEN ====================
function generarResumen(sesion) {
  var resumen = 'Revision completa - RESUMEN ' + sesion.placa + '\n';
  var hayNovedades = false;

  for (var g = 0; g < GRUPOS.length; g++) {
    var grupo = GRUPOS[g];
    var respuesta = sesion.respuestas[grupo.id];
    if (!respuesta) continue;

    var itemsMalos = respuesta.items.filter(function(i) { return i.estado === 2 || i.estado === 3; });
    var itemsNA = respuesta.items.filter(function(i) { return i.estado === 4; });

    if (itemsMalos.length > 0 || itemsNA.length > 0) {
      hayNovedades = true;
      for (var m = 0; m < itemsMalos.length; m++) {
        var item = itemsMalos[m];
        var icono = item.estado === 2 ? '[!]' : '[X]';
        resumen += icono + ' ' + grupo.nombre + ' - ' + item.nombre;
        if (item.nota) resumen += ' . ' + item.nota;
        resumen += '\n';
      }
      for (var n = 0; n < itemsNA.length; n++) {
        resumen += '[ ] ' + grupo.nombre + ' - ' + itemsNA[n].nombre + ' N/A\n';
      }
    }
  }

  if (!hayNovedades) {
    resumen += 'Todo en buen estado - sin novedades';
  }

  return resumen;
}

// ==================== WEBHOOK PRINCIPAL ====================
app.get('/', function(req, res) {
  res.send('CERO esta corriendo');
});

app.post('/webhook', async function(req, res) {
  var mensaje = (req.body.Body || '').trim();
  var telefono = req.body.From || '';
  var mediaUrl = req.body.MediaUrl0 || null;
  var numMedia = parseInt(req.body.NumMedia || '0');

  console.log('[' + telefono + '] Estado: ' + obtenerSesion(telefono).estado + ' | Mensaje: ' + mensaje + ' | Media: ' + numMedia);

  var sesion = obtenerSesion(telefono);

  try {
    switch (sesion.estado) {

      // ==================== INICIO ====================
      case 'INICIO': {
        sesion.estado = 'ESPERANDO_PLACA';
        return responderTwiml(res, 'BOT MTO\nBuenos dias. Placa del vehiculo?');
      }

      // ==================== PLACA ====================
      case 'ESPERANDO_PLACA': {
        var placaLimpia = mensaje.toUpperCase().replace(/[^A-Z0-9]/g, '');

        var resultado = await supabase
          .from('vehiculos')
          .select('*')
          .eq('placa', placaLimpia)
          .single();

        if (resultado.error || !resultado.data) {
          return responderTwiml(res, 'Placa ' + placaLimpia + ' no encontrada. Verifica e intenta de nuevo.');
        }

        var vehiculo = resultado.data;

        if (vehiculo.bloqueado) {
          return responderTwiml(res, 'Vehiculo ' + placaLimpia + ' BLOQUEADO: ' + (vehiculo.motivo_bloqueo || 'Contacte al supervisor'));
        }

        sesion.placa = placaLimpia;
        sesion.vehiculo = vehiculo;

        var resConductor = await supabase
          .from('conductores')
          .select('*')
          .eq('telefono', telefono.replace('whatsapp:', ''))
          .single();

        sesion.conductor = resConductor.data;

        sesion.estado = 'ESPERANDO_KILOMETRAJE';
        return responderTwiml(res,
          placaLimpia + ' . ' + vehiculo.tipo + ' ' + vehiculo.marca + ' ' + (vehiculo.modelo || '') + '\nKilometraje actual?'
        );
      }

      // ==================== KILOMETRAJE ====================
      case 'ESPERANDO_KILOMETRAJE': {
        var km = parseInt(mensaje.replace(/[^0-9]/g, ''));
        if (isNaN(km) || km < 0) {
          return responderTwiml(res, 'Escribe solo el numero del kilometraje.');
        }

        if (sesion.vehiculo.kilometraje && km < sesion.vehiculo.kilometraje) {
          return responderTwiml(res, 'Kilometraje invalido. El ultimo registrado fue ' + sesion.vehiculo.kilometraje + ' km. El nuevo debe ser igual o mayor.');
        }
        
        sesion.kilometraje = km;
        sesion.grupoActual = 0;
        sesion.estado = 'GRUPO';

        var grupo = GRUPOS[0];
        return responderTwiml(res,
          grupo.nombre + ' (' + grupo.abreviado + ')\n1=Bueno 2=Regular 3=Malo 4=N/A\nResponde todo el grupo junto. Si hay novedad, describela.'
        );
      }

      // ==================== GRUPOS ====================
      case 'GRUPO': {
        var grupoActual = GRUPOS[sesion.grupoActual];
        var interpretacion = await interpretarRespuesta(grupoActual, mensaje);

        if (!interpretacion) {
          return responderTwiml(res, 'No entendi la respuesta. Intenta de nuevo con numeros o describe el estado.');
        }

        sesion.respuestas[grupoActual.id] = interpretacion;

        if (interpretacion.hay_novedad) {
          var novedadesGrupo = interpretacion.items
            .filter(function(i) { return i.estado === 2 || i.estado === 3; })
            .map(function(i) {
              return {
                grupo: grupoActual.nombre,
                item: i.nombre,
                estado: i.estado,
                nota: i.nota
              };
            });
          for (var x = 0; x < novedadesGrupo.length; x++) {
            sesion.novedades.push(novedadesGrupo[x]);
          }
        }

        var confirmacion = interpretacion.resumen ? interpretacion.resumen + '\n\n' : '';

        sesion.grupoActual++;

        if (sesion.grupoActual < GRUPOS.length) {
          var siguiente = GRUPOS[sesion.grupoActual];
          sesion.estado = 'GRUPO';
          return responderTwiml(res,
            confirmacion + siguiente.nombre + ' (' + siguiente.abreviado + ')'
          );
        }

        var resumen = generarResumen(sesion);
        sesion.estado = 'FOTO_VERIFICACION';
        sesion.fotoVerificacionDescripcion = FOTOS_VERIFICACION[Math.floor(Math.random() * FOTOS_VERIFICACION.length)];

        return responderTwiml(res,
          resumen + '\n\nFOTO 1 - Verificacion aleatoria\n' + sesion.fotoVerificacionDescripcion
        );
      }

      // ==================== FOTO VERIFICACION ====================
      case 'FOTO_VERIFICACION': {
        if (numMedia === 0) {
          return responderTwiml(res, 'Necesito la foto. Toma la foto y enviala por favor.');
        }

        var validacion = await validarFoto(mediaUrl, sesion.fotoVerificacionDescripcion);

        if (!validacion.valida) {
          return responderTwiml(res,
            'Foto no valida - ' + validacion.razon_rechazo + '\nNecesito: ' + sesion.fotoVerificacionDescripcion
          );
        }

        sesion.fotos.push({
          tipo: 'verificacion',
          url: mediaUrl,
          descripcion: sesion.fotoVerificacionDescripcion,
          validacion: validacion.descripcion
        });

        if (sesion.novedades.length > 0) {
          sesion.fotosNovedadPendientes = [];
          for (var nn = 0; nn < sesion.novedades.length; nn++) {
            sesion.fotosNovedadPendientes.push(sesion.novedades[nn]);
          }
          var novedad = sesion.fotosNovedadPendientes[0];
          sesion.estado = 'FOTO_NOVEDAD';
          return responderTwiml(res,
            'Foto valida\n\nFOTO ' + (sesion.fotos.length + 1) + ' - Novedad\nTome foto de: ' + novedad.item + ' - ' + (novedad.nota || novedad.grupo)
          );
        }

        sesion.estado = 'OBSERVACION';
        return responderTwiml(res, 'Foto valida\n\nObservacion final? Si no hay, escribe no');
      }

      // ==================== FOTOS DE NOVEDADES ====================
      case 'FOTO_NOVEDAD': {
        if (numMedia === 0) {
          return responderTwiml(res, 'Necesito la foto de la novedad. Enviala por favor.');
        }

        var novedadActual = sesion.fotosNovedadPendientes[0];
        var validacionNov = await validarFoto(mediaUrl, novedadActual.item + ' - ' + (novedadActual.nota || ''));

        sesion.fotos.push({
          tipo: 'novedad',
          url: mediaUrl,
          descripcion: novedadActual.grupo + ' - ' + novedadActual.item,
          validacion: validacionNov.descripcion
        });

        sesion.fotosNovedadPendientes.shift();

        if (sesion.fotosNovedadPendientes.length > 0) {
          var siguienteNov = sesion.fotosNovedadPendientes[0];
          return responderTwiml(res,
            'Foto recibida\n\nFOTO ' + (sesion.fotos.length + 1) + ' - Novedad\nTome foto de: ' + siguienteNov.item + ' - ' + (siguienteNov.nota || siguienteNov.grupo)
          );
        }

        sesion.estado = 'OBSERVACION';
        return responderTwiml(res, 'Foto recibida\n\nObservacion final? Si no hay, escribe no');
      }

      // ==================== OBSERVACION ====================
      case 'OBSERVACION': {
        sesion.observacion = mensaje.toLowerCase() === 'no' ? null : mensaje;
        sesion.estado = 'CONFIRMACION';

        var textoFirma = 'CONFIRMACION\n';
        textoFirma += 'Vehiculo: ' + sesion.placa + '\n';
        textoFirma += 'Kilometraje: ' + sesion.kilometraje + '\n';
        textoFirma += 'Novedades: ' + (sesion.novedades.length > 0 ? sesion.novedades.length : 'Ninguna') + '\n';
        textoFirma += 'Fotos: ' + sesion.fotos.length + '\n';
        if (sesion.observacion) textoFirma += 'Observacion: ' + sesion.observacion + '\n';
        textoFirma += '\nConfirma el preoperacional? Escriba SI para firmar.';

        return responderTwiml(res, textoFirma);
      }

      // ==================== CONFIRMACION / FIRMA ====================
      case 'CONFIRMACION': {
        if (mensaje.toUpperCase() !== 'SI') {
          return responderTwiml(res, 'Escriba SI para confirmar y firmar, o CANCELAR para anular.');
        }

        var ahora = new Date();

        var datosPreoperacional = {
          vehiculo_id: sesion.vehiculo.id,
          conductor_id: sesion.conductor ? sesion.conductor.id : null,
          placa: sesion.placa,
          kilometraje: sesion.kilometraje,
          fecha: ahora.toISOString().split('T')[0],
          hora: ahora.toTimeString().split(' ')[0],
          estado: 'completado',
          llantas: sesion.respuestas.llantas || null,
          frenos_direccion: sesion.respuestas.frenos_direccion || null,
          niveles: sesion.respuestas.niveles || null,
          luces_pitos: sesion.respuestas.luces_pitos || null,
          documentos: sesion.respuestas.documentos || null,
          cinturon_espejos: sesion.respuestas.cinturon_espejos || null,
          kit_carretera: sesion.respuestas.kit_carretera || null,
          carroceria_canasta: sesion.respuestas.carroceria_canasta || null,
          novedades: sesion.novedades.map(function(n) { return n.grupo + ': ' + n.item + ' - ' + (n.nota || ''); }),
          observaciones: sesion.observacion,
          firma_operario: true,
          firma_timestamp: ahora.toISOString()
        };

        var resPreop = await supabase
          .from('preoperacionales')
          .insert(datosPreoperacional)
          .select()
          .single();

        if (resPreop.error) {
          console.error('Error guardando preoperacional:', resPreop.error);
          return responderTwiml(res, 'Error guardando el preoperacional. Intente de nuevo o contacte al supervisor.');
        }

        var preop = resPreop.data;

        if (sesion.fotos.length > 0) {
          var fotosParaGuardar = sesion.fotos.map(function(f) {
            return {
              preoperacional_id: preop.id,
              tipo: f.tipo,
              descripcion: f.descripcion,
              foto_url: f.url,
              validada: true,
              resultado_validacion: f.validacion
            };
          });

          await supabase.from('fotos_evidencia').insert(fotosParaGuardar);
        }

        await supabase
          .from('vehiculos')
          .update({ kilometraje: sesion.kilometraje })
          .eq('id', sesion.vehiculo.id);

        var datosSesion = {
          placa: sesion.placa,
          vehiculo: sesion.vehiculo,
          conductor: sesion.conductor,
          kilometraje: sesion.kilometraje,
          respuestas: sesion.respuestas,
          novedades: sesion.novedades,
          fotos: sesion.fotos,
          observacion: sesion.observacion
        };

        sesiones.delete(telefono);

        var msgFinal = 'PREOPERACIONAL FIRMADO\n';
        msgFinal += datosSesion.placa + ' - ' + ahora.toLocaleDateString('es-CO') + '\n';
        msgFinal += (datosSesion.conductor ? datosSesion.conductor.nombre : 'Conductor') + '\n';
        msgFinal += datosSesion.kilometraje + ' km\n';
        msgFinal += datosSesion.novedades.length > 0 ? datosSesion.novedades.length + ' novedad(es)' : 'Sin novedades';
        msgFinal += '\n\nGenerando PDF...';

        responderTwiml(res, msgFinal);

        subirYEnviarPDF(datosSesion, preop.id, telefono);
        return;
      }

      default: {
        sesion.estado = 'INICIO';
        return responderTwiml(res, 'BOT MTO\nBuenos dias. Placa del vehiculo?');
      }
    }
  } catch (error) {
    console.error('Error en webhook:', error);
    return responderTwiml(res, 'Error interno. Intente de nuevo en un momento.');
  }
});

// ==================== INICIAR SERVIDOR ====================
var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log('CERO corriendo en puerto ' + PORT);
});
