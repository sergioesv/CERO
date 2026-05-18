'use strict';

/**
 * tests/servicios/ocr.novedades.test.js
 *
 * Tests de comportamiento para servicios/ocr.js — función interpretarNovedad.
 *
 * Comportamiento que estos tests congelan ANTES del refactor:
 *
 *   TEST A — Gemini es el camino principal:
 *     Con el código NUEVO (Gemini primero), cuando llamarGeminiJson retorna
 *     un resultado válido, interpretarNovedad debe retornarlo con fuente='gemini'
 *     sin invocar las reglas locales como camino principal.
 *     Este test FALLA con el código actual (reglas primero) cuando las reglas
 *     también matchean — pero se escribe el input de modo que las reglas locales
 *     NO matcheen, así el test FALLA con el código actual porque Gemini nunca
 *     es invocado (reglas retornan vacío y luego Gemini sí, pero el resultado
 *     vendría de Gemini de todas formas — sin embargo, el assert de que
 *     llamarGeminiJson fue llamado SIEMPRE falla con el código actual cuando
 *     las reglas sí matchean y retornan antes).
 *     Para hacer que FALLE de forma determinista con el código actual:
 *     se usa un input que las reglas locales SÍ matchean, y se verifica que
 *     fuente === 'gemini'. Con el código actual, fuente sería 'reglas'.
 *
 *   TEST B — fallback a reglas locales si Gemini falla:
 *     Cuando llamarGeminiJson lanza error, el resultado debe venir de reglas
 *     locales con fuente='reglas'. Con el código actual, las reglas son el
 *     camino principal, por lo que este test PASA antes y después del refactor.
 *     Su valor es documentar el contrato del fallback.
 *
 *   TEST C — fallback retorna vacío si Gemini falla y reglas tampoco matchean:
 *     Cuando llamarGeminiJson lanza error y el texto es irreconocible, el
 *     resultado debe tener items=[]. Con el código actual este test PASA
 *     (reglas retornan vacío, Gemini lanza error → items=[]). Con el código
 *     nuevo (Gemini primero, falla, reglas tampoco matchean) también PASA.
 *
 *   TEST D — Gemini retorna ítem que no está en la lista (alucinación):
 *     limpiarItemsInterpretados debe filtrar el ítem inválido.
 *     Con el código actual: si las reglas retornan vacío, Gemini es invocado y
 *     el filtro aplica → items=[]. Con el código nuevo: Gemini siempre es
 *     invocado primero y el filtro aplica → items=[].
 *     Este test PASA antes y después del refactor y documenta el contrato de
 *     limpiarItemsInterpretados.
 *
 * Estrategia de mocks:
 *   - axios es mockeado completamente para controlar llamarGeminiJson sin
 *     tocar la red.
 *   - config/config es mockeado con GOOGLE_API_KEY presente para que
 *     llamarGeminiJson no falle por clave ausente.
 *
 * Cómo ejecutar:
 *   npx jest tests/servicios/ocr.novedades.test.js --no-coverage
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. MOCKS — deben declararse antes del require del módulo bajo prueba
// ─────────────────────────────────────────────────────────────────────────────

// config/config: mock minimalista con GOOGLE_API_KEY para que llamarGeminiJson
// no aborte por clave faltante antes de llegar a axios.
jest.mock('../../config/config', function() {
  return {
    GOOGLE_API_KEY: 'test-api-key-mock',
    TWILIO_ACCOUNT_SID: null,
    TWILIO_AUTH_TOKEN: null,
    clean: function(v) { return v; }
  };
});

// modulos/inspecciones/preoperacional/validaciones: mock del único require
// que ocr.js hace fuera de config y axios.
jest.mock('../../modulos/inspecciones/preoperacional/validaciones', function() {
  return {
    normalizarPlaca: jest.fn(function(p) { return p; })
  };
});

// axios: mock completo para interceptar las llamadas POST a Gemini.
// El valor por defecto retorna error — cada test lo sobreescribe según necesite.
jest.mock('axios', function() {
  return {
    get:  jest.fn(),
    post: jest.fn().mockRejectedValue(new Error('axios no configurado en este test'))
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. IMPORTS tras los mocks
// ─────────────────────────────────────────────────────────────────────────────

var axios  = require('axios');
var ocr    = require('../../servicios/ocr');

// ─────────────────────────────────────────────────────────────────────────────
// 3. HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Construye la respuesta HTTP que Gemini devolvería para un resultado dado.
 * llamarGeminiJson llama a extraerTextoGemini(response.data) y luego
 * parsearJsonSeguro(texto), por lo tanto el payload debe seguir la estructura
 * real de la API de Gemini.
 *
 * @param {Object} resultado — objeto a serializar como respuesta de Gemini
 * @returns {{ data: Object }} — respuesta de axios simulada
 */
function respuestaGeminiOk(resultado) {
  return {
    data: {
      candidates: [
        {
          content: {
            parts: [{ text: JSON.stringify(resultado) }]
          },
          finishReason: 'STOP'
        }
      ]
    }
  };
}

/** Items de ejemplo usados en múltiples tests. */
var ITEMS_EJEMPLO = [
  'Luces delanteras y traseras',
  'Pito y alarma reversa',
  'Cinturon de seguridad'
];

// ─────────────────────────────────────────────────────────────────────────────
// 4. TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('interpretarNovedad — contrato pre y post refactor', function() {

  beforeEach(function() {
    // Resetear el mock de axios antes de cada test para evitar interferencias.
    axios.post.mockReset();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST A — Gemini es el camino principal
  //
  // Input: texto que las reglas locales SÍ pueden matchear ("luces no funcionan").
  // Con el código ACTUAL (reglas primero): las reglas retornan items con
  //   fuente='reglas' y Gemini nunca es invocado → el assert fuente==='gemini' FALLA.
  // Con el código NUEVO (Gemini primero): Gemini es invocado, retorna el ítem
  //   correctamente → fuente='gemini' y axios.post fue llamado → ambos asserts PASAN.
  // ──────────────────────────────────────────────────────────────────────────
  it('TEST A — debe retornar fuente gemini y llamar a llamarGeminiJson cuando Gemini responde OK', async function() {
    // arrange: Gemini retorna el ítem correcto con estado correcto
    var resultadoGemini = {
      items: [{ nombre: 'Luces delanteras y traseras', estado: 'No funciona' }],
      observacion: 'luz trasera apagada'
    };
    axios.post.mockResolvedValue(respuestaGeminiOk(resultadoGemini));

    // act: texto que las reglas locales matchearían (para que el FALLO sea determinista)
    var resultado = await ocr.interpretarNovedad('luces no funcionan', ITEMS_EJEMPLO);

    // assert — Gemini fue el camino principal
    expect(axios.post).toHaveBeenCalledTimes(1);

    // assert — la fuente es gemini, no reglas
    expect(resultado.fuente).toBe('gemini');

    // assert — el ítem retornado es el que Gemini devolvió
    expect(resultado.items).toHaveLength(1);
    expect(resultado.items[0].nombre).toBe('Luces delanteras y traseras');
    expect(resultado.items[0].estado).toBe('No funciona');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST B — fallback a reglas locales si Gemini falla
  //
  // Input: texto que las reglas locales SÍ matchean.
  // Con el código ACTUAL (reglas primero): las reglas retornan antes, Gemini
  //   nunca se invoca → resultado.fuente='reglas' → PASA.
  // Con el código NUEVO (Gemini primero, falla): fallback a reglas → PASA.
  // El test documenta el contrato del fallback independientemente del orden.
  // ──────────────────────────────────────────────────────────────────────────
  it('TEST B — debe caer a reglas locales si Gemini lanza error de red', async function() {
    // arrange: Gemini falla con error de red
    axios.post.mockRejectedValue(new Error('network failure simulado'));

    // act: texto que las reglas locales matchean con "luces"
    var resultado = await ocr.interpretarNovedad('luces no funcionan', ITEMS_EJEMPLO);

    // assert — el resultado viene de reglas locales
    expect(resultado.fuente).toBe('reglas');

    // assert — se encontró el ítem de luces
    expect(resultado.items).toHaveLength(1);
    expect(resultado.items[0].nombre).toBe('Luces delanteras y traseras');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST C — fallback retorna items vacíos si Gemini falla y reglas no matchean
  //
  // Con el código ACTUAL: reglas no matchean → llama Gemini → Gemini falla →
  //   interpretarNovedad lanza el error de Gemini (no hay manejo de fallback
  //   en el código actual cuando las reglas retornan vacío y Gemini falla).
  //   Por tanto este test FALLA con el código actual.
  // Con el código NUEVO: Gemini falla → fallback a reglas → reglas no matchean
  //   → retorna items=[] con fuente='reglas' → PASA.
  // ──────────────────────────────────────────────────────────────────────────
  it('TEST C — debe retornar items vacíos (no lanzar) si Gemini falla y reglas no matchean', async function() {
    // arrange: Gemini falla
    axios.post.mockRejectedValue(new Error('timeout simulado'));

    // act: texto completamente irreconocible (sin tokens que matcheen ningún ítem)
    var resultado = await ocr.interpretarNovedad('asdfgh qwerty zxcvbn', ITEMS_EJEMPLO);

    // assert — no lanza, retorna estructura válida
    expect(resultado).toBeDefined();
    expect(Array.isArray(resultado.items)).toBe(true);

    // assert — sin matcheo, items debe estar vacío
    expect(resultado.items).toHaveLength(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST D — Gemini retorna ítem que no está en la lista (alucinación)
  //
  // Con el código ACTUAL: si las reglas retornan vacío, se llama Gemini →
  //   limpiarItemsInterpretados filtra el ítem inválido → items=[].
  // Con el código NUEVO: Gemini siempre primero → limpiarItemsInterpretados
  //   filtra → items=[].
  // El test PASA antes y después del refactor y documenta el contrato de
  // limpiarItemsInterpretados.
  // ──────────────────────────────────────────────────────────────────────────
  it('TEST D — debe filtrar items alucinados que no están en la lista permitida', async function() {
    // arrange: Gemini devuelve un ítem que NO existe en ITEMS_EJEMPLO
    var resultadoGeminiAlucinado = {
      items: [{ nombre: 'Motor principal', estado: 'Danado' }],
      observacion: 'motor roto'
    };
    axios.post.mockResolvedValue(respuestaGeminiOk(resultadoGeminiAlucinado));

    // act: texto irreconocible para que las reglas locales no matcheen antes
    var resultado = await ocr.interpretarNovedad('motor roto xyzzy', ITEMS_EJEMPLO);

    // assert — el ítem alucinado fue filtrado
    expect(resultado.items).toHaveLength(0);
  });

});
