var config = require('./config');

async function interpretarRespuesta(grupo, mensaje) {
  try {
    var itemsTexto = grupo.items.map(function(i) { return i.nombre; }).join(', ');

    var response = await config.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: 'Eres el sistema CERO de inspeccion vehicular colombiano. El operario esta respondiendo sobre el grupo "' + grupo.nombre + '" con estos items: ' + itemsTexto + '.\n\nEl operario escribio: "' + mensaje + '"\n\nLas opciones por item son: 1=Bueno, 2=Regular, 3=Malo, 4=N/A\n\nInterpreta la respuesta del operario. Si dice "1" solo, significa TODO BUENO para todos los items. Si menciona algo especifico como "aceite bajo" o "llanta pinchada", identifica que item tiene problema. El operario puede escribir con errores de ortografia, jerga colombiana o frases incompletas - interpreta la intencion.\n\nResponde SOLO en este formato JSON exacto, sin texto adicional:\n{\n  "items": [\n    {"nombre": "nombre del item", "estado": 1, "nota": null},\n    {"nombre": "nombre del item", "estado": 3, "nota": "descripcion del problema"}\n  ],\n  "hay_novedad": false,\n  "resumen": "texto corto de confirmacion para el operario"\n}'
      }]
    });

    var texto = response.content[0].text.trim();
    var jsonMatch = texto.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
  } catch (error) {
    console.error('Error Claude interpretacion:', error);
    return null;
  }
}

async function validarFoto(mediaUrl, descripcionEsperada) {
  try {
    var response = await config.anthropic.messages.create({
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
            text: 'Eres el validador de fotos del sistema CERO de inspeccion vehicular. Se pidio al operario: "' + descripcionEsperada + '".\n\nAnaliza la foto y responde SOLO en este formato JSON:\n{\n  "valida": true o false,\n  "descripcion": "que se ve en la foto",\n  "razon_rechazo": null o "por que no es valida"\n}'
          }
        ]
      }]
    });

    var texto = response.content[0].text.trim();
    var jsonMatch = texto.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return { valida: true, descripcion: 'No se pudo validar', razon_rechazo: null };
  } catch (error) {
    console.error('Error validacion foto:', error);
    return { valida: true, descripcion: 'Error en validacion', razon_rechazo: null };
  }
}

module.exports = { interpretarRespuesta, validarFoto };
