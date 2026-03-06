var config = require('./config');

async function interpretarRespuesta(grupo, mensaje) {
  try {
    var itemsTexto = grupo.items.map(function(i) { return i.nombre; }).join(', ');

    var response = await config.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: 'Eres el sistema CERO de inspeccion vehicular colombiano. El operario responde sobre el grupo "' + grupo.nombre + '" con estos items: ' + itemsTexto + '.\n\nEl operario escribio: "' + mensaje + '"\n\nOpciones rapidas: 1=OK, 2=Requiere atencion, 3=Critico/Malo, 4=N/A\nSi dice "1" solo, significa TODO OK para todos los items.\n\nIMPORTANTE: Interpreta segun el tipo de item:\n- Niveles de liquidos (aceite, refrigerante, frenos): OK / Bajo / Vacio\n- Fugas: Sin fugas / Con fugas\n- Llantas: OK / Desgastada / Danada / Sin presion\n- Luces y electricos: Funciona / Intermitente / No funciona\n- Frenos y pedales: Funciona / Duro o flojo / No funciona\n- Equipo carretera: Completo / Incompleto / Falta\n- Cinturones y espejos: OK / Danado / Falta\n- General: OK / Regular / Malo\n\nEl operario puede escribir con errores, jerga colombiana o frases incompletas. Ejemplos: "aceite bajito" = nivel bajo, "llanta lisa" = desgastada, "no hay extintor" = falta, "pito no suena" = no funciona.\n\nResponde SOLO en JSON:\n{\n  "items": [\n    {"nombre": "nombre del item", "estado": 1, "nota": null, "descripcion_estado": "OK"},\n    {"nombre": "nombre del item", "estado": 2, "nota": "lo que dijo el operario", "descripcion_estado": "Nivel bajo"}\n  ],\n  "hay_novedad": false,\n  "resumen": "texto corto para confirmar al operario"\n}\n\nEl campo "descripcion_estado" debe ser especifico al tipo de item, no generico. Nunca pongas "Regular" para un nivel de liquido - pon "Nivel bajo" o "Nivel OK".'
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
            text: 'Eres el validador de fotos del sistema CERO de inspeccion vehicular. Se pidio al operario: "' + descripcionEsperada + '".\n\nAnaliza la foto y responde SOLO en JSON:\n{\n  "valida": true o false,\n  "descripcion": "que se ve en la foto",\n  "razon_rechazo": null o "por que no es valida"\n}'
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
