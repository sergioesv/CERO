const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const twilio = require('twilio');

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ==================== CONFIGURACIÓN ====================
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

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
    abreviado: 'DI · DD · TI · TD · Repuesto'
  },
  {
    id: 'frenos_direccion',
    nombre: 'FRENOS Y DIRECCIÓN',
    items: ['Freno servicio', 'Freno emergencia', 'Dirección'],
    abreviado: 'Servicio · Emergencia · Dirección'
  },
  {
    id: 'niveles',
    nombre: 'NIVELES',
    items: ['Aceite', 'Agua', 'Líquido frenos', 'Hidráulico', 'Combustible'],
    abreviado: 'Aceite · Agua · Líq.frenos · Hidráulico · Combustible'
  },
  {
    id: 'luces_pitos',
    nombre: 'LUCES Y PITOS',
    items: ['Altas', 'Bajas', 'Reversa', 'Pito', 'Emergencia', 'Balizas'],
    abreviado: 'Altas · Bajas · Reversa · Pito · Emergencia · Balizas'
  },
  {
    id: 'documentos',
    nombre: 'DOCUMENTOS',
    items: ['SOAT', 'Tecnomecánica', 'Tarjeta propiedad', 'Licencia'],
    abreviado: 'SOAT · Tecno · Tarjeta · Licencia'
  },
  {
    id: 'cinturon_espejos',
    nombre: 'CINTURÓN Y ESPEJOS',
    items: ['Cinturón conductor', 'Cinturón copiloto', 'Retrovisor', 'Lateral izq', 'Lateral der'],
    abreviado: 'Conductor · Copiloto · Retrovisor · Lat.izq · Lat.der'
  },
  {
    id: 'kit_carretera',
    nombre: 'KIT DE CARRETERA',
    items: ['Extintor', 'Botiquín', 'Triángulos', 'Linterna', 'Chaleco'],
    abreviado: 'Extintor · Botiquín · Triángulos · Linterna · Chaleco'
  },
  {
    id: 'carroceria_canasta',
    nombre: 'CARROCERÍA Y CANASTA',
    items: ['Estado general'],
    abreviado: 'Estado general de carrocería y canasta'
  }
];

const FOTOS_VERIFICACION = [
  'Tome foto del odómetro mostrando el kilometraje',
  'Tome foto del tablero encendido',
  'Tome foto de las llantas delanteras',
  'Tome foto de las llantas traseras',
  'Tome foto del extintor'
];

// ==================== FUNCIÓN IA — INTERPRETAR RESPUESTA ====================
async function interpretarRespuesta(grupo, mensaje) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Eres el sistema CERO de inspección vehicular. El operario está respondiendo sobre el grupo "${grupo.nombre}" con estos ítems: ${grupo.items.join(', ')}.

El operario escribió: "${mensaje}"

Las opciones por ítem son: 1=Bueno, 2=Regular, 3=Malo, 4=N/A

Interpreta la respuesta del operario. Si dice "1" solo, significa TODO BUENO para todos los ítems. Si menciona algo específico como "aceite bajo" o "llanta pinchada", identifica qué ítem tiene problema.

Responde SOLO en este formato JSON exacto, sin texto adicional:
{
  "items": [
    {"nombre": "nombre del item", "estado": 1, "nota": null},
    {"nombre": "nombre del item", "estado": 3, "nota": "descripción del problema"}
  ],
  "hay_novedad": false,
  "resumen": "texto corto de confirmación para el operario"
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

// ==================== FUNCIÓN IA — VALIDAR FOTO ====================
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
            text: `Eres el validador de fotos del sistema CERO de inspección vehicular. Se pidió al operario: "${descripcionEsperada}".

Analiza la foto y responde SOLO en este formato JSON:
{
  "valida": true o false,
  "descripcion": "qué se ve en la foto",
  "razon_rechazo": null o "por qué no es válida"
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
    console.error('Error validación foto:', error);
    return { valida: true, descripcion: 'Error en validación', razon_rechazo: null };
  }
}

// ==================== ENVIAR MENSAJE ====================
function responderTwiml(res, mensaje) {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${mensaje}</Message>
</Response>`;
  res.type('text/xml');
  res.send(twiml);
}

// ==================== GENERAR RESUMEN ====================
function generarResumen(sesion) {
  let resumen = `📋 *Revisión completa — RESUMEN ${sesion.placa}*\n`;
  let hayNovedades = false;

  for (const grupo of GRUPOS) {
    const respuesta = sesion.respuestas[grupo.id];
    if (!respuesta) continue;

    const itemsMalos = respuesta.items.filter(i => i.estado === 2 || i.estado === 3);
    const itemsNA = respuesta.items.filter(i => i.estado === 4);

    if (itemsMalos.length > 0 || itemsNA.length > 0) {
      hayNovedades = true;
      for (const item of itemsMalos) {
        const icono = item.estado === 2 ? '🟡' : '🔴';
        resumen += `${icono} ${grupo.nombre} — ${item.nombre}`;
        if (item.nota) resumen += ` · ${item.nota}`;
        resumen += '\n';
      }
      for (const item of itemsNA) {
        resumen += `⚪ ${grupo.nombre} — ${item.nombre} N/A\n`;
      }
    }
  }

  if (!hayNovedades) {
    resumen += '✅ Todo en buen estado — sin novedades';
  }

  return resumen;
}

// ==================== WEBHOOK PRINCIPAL ====================
app.get('/', (req, res) => {
  res.send('CERO está corriendo');
});

app.post('/webhook', async (req, res) => {
  const mensaje = (req.body.Body || '').trim();
  const telefono = req.body.From || '';
  const mediaUrl = req.body.MediaUrl0 || null;
  const numMedia = parseInt(req.body.NumMedia || '0');

  console.log(`[${telefono}] Estado: ${obtenerSesion(telefono).estado} | Mensaje: ${mensaje} | Media: ${numMedia}`);

  const sesion = obtenerSesion(telefono);

  try {
    switch (sesion.estado) {

      // ==================== INICIO ====================
      case 'INICIO': {
        sesion.estado = 'ESPERANDO_PLACA';
        return responderTwiml(res, '🚗 *BOT MTO*\nBuenos días 👋 ¿Placa del vehículo?');
      }

      // ==================== PLACA ====================
      case 'ESPERANDO_PLACA': {
        const placaLimpia = mensaje.toUpperCase().replace(/[^A-Z0-9]/g, '');

        const { data: vehiculo, error } = await supabase
          .from('vehiculos')
          .select('*')
          .eq('placa', placaLimpia)
          .single();

        if (error || !vehiculo) {
          return responderTwiml(res, `❌ Placa ${placaLimpia} no encontrada. Verifica e intenta de nuevo.`);
        }

        if (vehiculo.bloqueado) {
          return responderTwiml(res, `🚫 Vehículo ${placaLimpia} BLOQUEADO: ${vehiculo.motivo_bloqueo || 'Contacte al supervisor'}`);
        }

        sesion.placa = placaLimpia;
        sesion.vehiculo = vehiculo;

        const { data: conductor } = await supabase
          .from('conductores')
          .select('*')
          .eq('telefono', telefono.replace('whatsapp:', ''))
          .single();

        sesion.conductor = conductor;

        sesion.estado = 'ESPERANDO_KILOMETRAJE';
        return responderTwiml(res,
          `✅ *${placaLimpia}* · ${vehiculo.tipo} ${vehiculo.marca} ${vehiculo.modelo || ''}\n¿Kilometraje actual?`
        );
      }

      // ==================== KILOMETRAJE ====================
      case 'ESPERANDO_KILOMETRAJE': {
        const km = parseInt(mensaje.replace(/[^0-9]/g, ''));
        if (isNaN(km) || km < 0) {
          return responderTwiml(res, '❌ Escribe solo el número del kilometraje.');
        }

        sesion.kilometraje = km;
        sesion.grupoActual = 0;
        sesion.estado = 'GRUPO';

        const grupo = GRUPOS[0];
        return responderTwiml(res,
          `📝 *${grupo.nombre}* (${grupo.abreviado})\n1=Bueno 2=Regular 3=Malo 4=N/A\nResponde todo el grupo junto. Si hay novedad, descríbela.`
        );
      }

      // ==================== GRUPOS ====================
      case 'GRUPO': {
        const grupoActual = GRUPOS[sesion.grupoActual];
        const interpretacion = await interpretarRespuesta(grupoActual, mensaje);

        if (!interpretacion) {
          return responderTwiml(res, '❌ No entendí la respuesta. Intenta de nuevo con números o describe el estado.');
        }

        sesion.respuestas[grupoActual.id] = interpretacion;

        if (interpretacion.hay_novedad) {
          const novedadesGrupo = interpretacion.items
            .filter(i => i.estado === 2 || i.estado === 3)
            .map(i => ({
              grupo: grupoActual.nombre,
              item: i.nombre,
              estado: i.estado,
              nota: i.nota
            }));
          sesion.novedades.push(...novedadesGrupo);
        }

        let confirmacion = interpretacion.resumen ? `✅ ${interpretacion.resumen}\n\n` : '';

        sesion.grupoActual++;

        if (sesion.grupoActual < GRUPOS.length) {
          const siguiente = GRUPOS[sesion.grupoActual];
          sesion.estado = 'GRUPO';
          return responderTwiml(res,
            `${confirmacion}📝 *${siguiente.nombre}* (${siguiente.abreviado})`
          );
        }

        const resumen = generarResumen(sesion);
        sesion.estado = 'FOTO_VERIFICACION';
        sesion.fotoVerificacionDescripcion = FOTOS_VERIFICACION[Math.floor(Math.random() * FOTOS_VERIFICACION.length)];

        return responderTwiml(res,
          `${resumen}\n\n📸 *FOTO 1 — Verificación aleatoria*\n${sesion.fotoVerificacionDescripcion}`
        );
      }

      // ==================== FOTO VERIFICACIÓN ====================
      case 'FOTO_VERIFICACION': {
        if (numMedia === 0) {
          return responderTwiml(res, '📸 Necesito la foto. Toma la foto y envíala por favor.');
        }

        const validacion = await validarFoto(mediaUrl, sesion.fotoVerificacionDescripcion);

        if (!validacion.valida) {
          return responderTwiml(res,
            `❌ Foto no válida — ${validacion.razon_rechazo}\nNecesito: ${sesion.fotoVerificacionDescripcion}`
          );
        }

        sesion.fotos.push({
          tipo: 'verificacion',
          url: mediaUrl,
          descripcion: sesion.fotoVerificacionDescripcion,
          validacion: validacion.descripcion
        });

        if (sesion.novedades.length > 0) {
          sesion.fotosNovedadPendientes = [...sesion.novedades];
          const novedad = sesion.fotosNovedadPendientes[0];
          sesion.estado = 'FOTO_NOVEDAD';
          return responderTwiml(res,
            `✅ Foto válida\n\n📸 *FOTO ${sesion.fotos.length + 1} — Novedad*\nTome foto de: ${novedad.item} — ${novedad.nota || novedad.grupo}`
          );
        }

        sesion.estado = 'OBSERVACION';
        return responderTwiml(res, '✅ Foto válida\n\n💬 ¿Observación final? Si no hay, escribe *no*');
      }

      // ==================== FOTOS DE NOVEDADES ====================
      case 'FOTO_NOVEDAD': {
        if (numMedia === 0) {
          return responderTwiml(res, '📸 Necesito la foto de la novedad. Envíala por favor.');
        }

        const novedadActual = sesion.fotosNovedadPendientes[0];
        const validacion = await validarFoto(mediaUrl, `${novedadActual.item} - ${novedadActual.nota || ''}`);

        sesion.fotos.push({
          tipo: 'novedad',
          url: mediaUrl,
          descripcion: `${novedadActual.grupo} — ${novedadActual.item}`,
          validacion: validacion.descripcion
        });

        sesion.fotosNovedadPendientes.shift();

        if (sesion.fotosNovedadPendientes.length > 0) {
          const siguiente = sesion.fotosNovedadPendientes[0];
          return responderTwiml(res,
            `✅ Foto recibida\n\n📸 *FOTO ${sesion.fotos.length + 1} — Novedad*\nTome foto de: ${siguiente.item} — ${siguiente.nota || siguiente.grupo}`
          );
        }

        sesion.estado = 'OBSERVACION';
        return responderTwiml(res, '✅ Foto recibida\n\n💬 ¿Observación final? Si no hay, escribe *no*');
      }

      // ==================== OBSERVACIÓN ====================
      case 'OBSERVACION': {
        sesion.observacion = mensaje.toLowerCase() === 'no' ? null : mensaje;
        sesion.estado = 'CONFIRMACION';

        let textoFirma = `📝 *CONFIRMACIÓN*\n`;
        textoFirma += `Vehículo: ${sesion.placa}\n`;
        textoFirma += `Kilometraje: ${sesion.kilometraje}\n`;
        textoFirma += `Novedades: ${sesion.novedades.length > 0 ? sesion.novedades.length : 'Ninguna'}\n`;
        textoFirma += `Fotos: ${sesion.fotos.length}\n`;
        if (sesion.observacion) textoFirma += `Observación: ${sesion.observacion}\n`;
        textoFirma += `\n¿Confirma el preoperacional? Escriba *SI* para firmar.`;

        return responderTwiml(res, textoFirma);
      }

      // ==================== CONFIRMACIÓN / FIRMA ====================
      case 'CONFIRMACION': {
        if (mensaje.toUpperCase() !== 'SI') {
          return responderTwiml(res, 'Escriba *SI* para confirmar y firmar, o *CANCELAR* para anular.');
        }

        const ahora = new Date();

        const datosPreoperacional = {
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
          novedades: sesion.novedades.map(n => `${n.grupo}: ${n.item} - ${n.nota || ''}`),
          observaciones: sesion.observacion,
          firma_operario: true,
          firma_timestamp: ahora.toISOString()
        };

        const { data: preop, error: errorPreop } = await supabase
          .from('preoperacionales')
          .insert(datosPreoperacional)
          .select()
          .single();

        if (errorPreop) {
          console.error('Error guardando preoperacional:', errorPreop);
          return responderTwiml(res, '❌ Error guardando el preoperacional. Intente de nuevo o contacte al supervisor.');
        }

        if (sesion.fotos.length > 0) {
          const fotosParaGuardar = sesion.fotos.map(f => ({
            preoperacional_id: preop.id,
            tipo: f.tipo,
            descripcion: f.descripcion,
            foto_url: f.url,
            validada: true,
            resultado_validacion: f.validacion
          }));

          await supabase.from('fotos_evidencia').insert(fotosParaGuardar);
        }

        await supabase
          .from('vehiculos')
          .update({ kilometraje: sesion.kilometraje })
          .eq('id', sesion.vehiculo.id);

        sesion.estado = 'INICIO';
        sesiones.delete(telefono);

        let mensajeFinal = `✅ *PREOPERACIONAL FIRMADO*\n`;
        mensajeFinal += `📋 ${sesion.placa} — ${ahora.toLocaleDateString('es-CO')}\n`;
        mensajeFinal += `👤 ${sesion.conductor ? sesion.conductor.nombre : 'Conductor'}\n`;
        mensajeFinal += `📏 ${sesion.kilometraje} km\n`;
        if (sesion.novedades.length > 0) {
          mensajeFinal += `⚠️ ${sesion.novedades.length} novedad(es) reportada(s)\n`;
        } else {
          mensajeFinal += `✅ Sin novedades\n`;
        }
        mensajeFinal += `\n📄 PDF se enviará en un momento...`;

        return responderTwiml(res, mensajeFinal);
      }

      default: {
        sesion.estado = 'INICIO';
        return responderTwiml(res, '🚗 *BOT MTO*\nBuenos días 👋 ¿Placa del vehículo?');
      }
    }
  } catch (error) {
    console.error('Error en webhook:', error);
    return responderTwiml(res, '❌ Error interno. Intente de nuevo en un momento.');
  }
});

// ==================== INICIAR SERVIDOR ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`CERO corriendo en puerto ${PORT}`);
});
