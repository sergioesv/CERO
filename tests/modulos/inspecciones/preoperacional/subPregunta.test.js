'use strict';

/**
 * tests/modulos/inspecciones/preoperacional/subPregunta.test.js
 *
 * Fija que las opciones de una sub-pregunta se envien UNA sola vez.
 *
 * Contexto: las 7 plantillas sembradas traian las opciones escritas dentro de
 * sub_pregunta.mensaje ADEMAS de en sub_pregunta.opciones, y
 * formatSubPreguntaMsg pinta siempre las opciones. Al conductor le llegaba la
 * lista dos veces seguidas, separadas por la linea de guiones. Los datos ya se
 * corrigieron; esto impide que vuelva por la puerta del panel de Plantillas,
 * donde el mensaje es texto libre.
 */

jest.mock('../../../../config/config', function() {
  return { supabase: { from: jest.fn() }, TABLES: {} };
});

var v = require('../../../../modulos/inspecciones/preoperacional/validaciones');

var SUB_PREGUNTA = {
  mensaje: '⚠️ *Aceite motor — ¿qué nivel tiene?*',
  opciones: [
    { num: 1, texto: 'Está en la mitad',        estado: 'Nivel medio',  severidad: 'alerta' },
    { num: 2, texto: 'Por debajo del mínimo',   estado: 'Bajo mínimo',  severidad: 'alerta' },
    { num: 3, texto: 'No tiene / vacío',        estado: 'Sin aceite',   severidad: 'bloqueo' }
  ]
};

function vecesQueAparece(texto, fragmento) {
  return texto.split(fragmento).length - 1;
}

describe('titularSubPregunta', function() {
  it('deja intacto un enunciado limpio', function() {
    expect(v.titularSubPregunta('⚠️ *Aceite motor — ¿qué nivel tiene?*'))
      .toBe('⚠️ *Aceite motor — ¿qué nivel tiene?*');
  });

  it('descarta las lineas de opcion incrustadas en el enunciado', function() {
    var sucio = '⚠️ *Aceite motor — ¿qué nivel tiene?*\n\n1️⃣ Está en la mitad\n2️⃣ Por debajo del mínimo';
    expect(v.titularSubPregunta(sucio)).toBe('⚠️ *Aceite motor — ¿qué nivel tiene?*');
  });

  it('tolera mensaje vacio o ausente', function() {
    expect(v.titularSubPregunta('')).toBe('');
    expect(v.titularSubPregunta(null)).toBe('');
    expect(v.titularSubPregunta(undefined)).toBe('');
  });

  it('no toca un enunciado que menciona numeros sin emoji', function() {
    expect(v.titularSubPregunta('¿Cuántos de los 4 pernos faltan?'))
      .toBe('¿Cuántos de los 4 pernos faltan?');
  });
});

describe('formatSubPreguntaMsg', function() {
  it('lista cada opcion exactamente una vez', function() {
    var msg = v.formatSubPreguntaMsg(SUB_PREGUNTA, '📋 Necesito precisar la novedad:');

    SUB_PREGUNTA.opciones.forEach(function(op) {
      expect(vecesQueAparece(msg, op.texto)).toBe(1);
    });
    expect(vecesQueAparece(msg, '───────────────')).toBe(1);
  });

  it('tampoco las duplica si la plantilla las trae dentro del mensaje', function() {
    var sucia = {
      mensaje: '⚠️ *Aceite motor — ¿qué nivel tiene?*\n\n' +
               '1️⃣ Está en la mitad\n2️⃣ Por debajo del mínimo\n3️⃣ No tiene / vacío',
      opciones: SUB_PREGUNTA.opciones
    };
    var msg = v.formatSubPreguntaMsg(sucia, '📋 Necesito precisar la novedad:');

    sucia.opciones.forEach(function(op) {
      expect(vecesQueAparece(msg, op.texto)).toBe(1);
    });
  });

  it('conserva el prefijo, el enunciado y el pie de navegacion', function() {
    var msg = v.formatSubPreguntaMsg(SUB_PREGUNTA, '📋 Necesito precisar la novedad:');
    expect(msg.indexOf('📋 Necesito precisar la novedad:')).toBe(0);
    expect(msg).toContain('¿qué nivel tiene?');
    expect(msg).toContain('9️⃣');
  });
});
