'use strict';

/**
 * tests/e2e/preoperacional.e2e.test.js
 *
 * Recorre el preoperacional completo por WhatsApp, tal como lo haría
 * un conductor en la demo: menú → foto de placa → foto de odómetro →
 * bloques de inspección → novedad → sub-pregunta → fotos → firma.
 *
 * Todo corre contra dependencias falsas: no toca red, Twilio, Gemini
 * ni Supabase.
 */

var { montarEntorno } = require('../helpers/entornoWhatsapp');
var { construirSeed, TELEFONO_DEMO, PLACA_DEMO } = require('../helpers/seedDemo');

var FOTO = ['https://api.twilio.com/media/foto1.jpg'];

describe('E2E — preoperacional por WhatsApp', function () {

  test('recorrido feliz completo: de "hola" a preoperacional firmado', async function () {
    var env = montarEntorno(construirSeed());
    var tel = TELEFONO_DEMO;

    // 1. Saludo → menú principal
    var r = await env.enviar(tel, 'hola');
    expect(r).toContain('1');

    // 2. Elegir preoperacional
    r = await env.enviar(tel, '1');
    expect(r.toLowerCase()).toContain('placa');

    // 3. Foto de la placa (OCR lee IDL354, que existe en activos)
    r = await env.enviar(tel, '', FOTO);
    expect(r).toContain(PLACA_DEMO);
    expect(r.toLowerCase()).toContain('odómetro');

    // 4. Foto del odómetro (OCR lee 125150; el activo venía en 125000)
    r = await env.enviar(tel, '', FOTO);
    expect(r).toContain('125150');

    // 5. Confirmar kilometraje → primer bloque
    r = await env.enviar(tel, '1');
    expect(r).toContain('MOTOR Y NIVELES');

    // 6. Bloque 1 todo OK → bloque 2
    r = await env.enviar(tel, '1');
    expect(r).toContain('FRENOS Y DIRECCION');

    // 7. Bloque 2: reportar novedad
    r = await env.enviar(tel, '2');
    expect(r.toLowerCase()).toContain('describe');

    // 8. Describir la novedad — Gemini la asocia al freno de servicio
    env.ocr._estado.novedad = {
      items: [{ nombre: 'Freno de servicio', estado: 'Malo' }],
      observacion: 'El freno se va al fondo'
    };
    r = await env.enviar(tel, 'el freno de servicio se va al fondo');

    // 9. El ítem tiene sub-pregunta → debe preguntar severidad
    expect(r).toContain('¿Cómo está el freno de servicio?');

    // 10. Elegir "No frena" → severidad bloqueo → pasa al bloque 3
    r = await env.enviar(tel, '2');
    expect(r).toContain('LUCES');

    // 11. Bloque 3 OK → resumen + fotos de novedad
    r = await env.enviar(tel, '1');
    expect(r).toContain('RESUMEN');

    // 12. Foto de la novedad
    r = await env.enviar(tel, '', FOTO);

    // 13. Sin fotos adicionales
    r = await env.enviar(tel, '1');
    expect(r.toLowerCase()).toContain('observaci');

    // 14. Sin observaciones → confirmación final
    r = await env.enviar(tel, '1');
    expect(r).toContain('RESUMEN PREOPERACIONAL');

    // 15. Firmar
    r = await env.enviar(tel, '1');
    expect(r).toContain('FIRMADO');

    // ── Verificaciones sobre lo que quedó guardado ──
    var preops = env.supabase._volcar('preoperacionales');
    expect(preops).toHaveLength(1);

    var preop = preops[0];
    expect(preop.kilometraje).toBe(125150);
    expect(preop.conductor_id).toBe('cond-0001');
    expect(preop.activo_id).toBe('activo-0001');
    expect(preop.clasificacion).toBe('BLOQUEO');
    expect(preop.firma_operario).toBe(true);

    // El kilometraje del activo se actualizó
    var activo = env.supabase._volcar('activos')[0];
    expect(activo.kilometraje).toBe(125150);

    // Se generó y envió el PDF
    expect(env.pdfsGenerados).toHaveLength(1);

    // La sesión quedó cerrada
    expect(env.supabase._volcar('sesiones_activas')).toHaveLength(0);
  });

  test('la evidencia fotográfica se guarda apuntando a Twilio, no a Storage', async function () {
    var env = montarEntorno(construirSeed());
    var tel = TELEFONO_DEMO;

    await env.enviar(tel, 'hola');
    await env.enviar(tel, '1');
    await env.enviar(tel, '', FOTO);
    await env.enviar(tel, '', FOTO);
    await env.enviar(tel, '1');
    await env.enviar(tel, '1');
    await env.enviar(tel, '1');
    await env.enviar(tel, '1');
    await env.enviar(tel, '1');
    await env.enviar(tel, '1');
    await env.enviar(tel, '1');

    var evidencias = env.supabase._volcar('evidencia');
    expect(evidencias.length).toBeGreaterThan(0);

    // HALLAZGO 1 del informe: las URLs apuntan al CDN de Twilio.
    // Cuando Twilio purgue el media por retención, la evidencia desaparece.
    evidencias.forEach(function (e) {
      expect(e.foto_url).toMatch(/api\.twilio\.com/);
    });
  });

  test('sin plantilla en BD el flujo se corta y borra la sesión', async function () {
    var env = montarEntorno(construirSeed({ sinPlantilla: true }));
    var tel = TELEFONO_DEMO;

    await env.enviar(tel, 'hola');
    await env.enviar(tel, '1');
    await env.enviar(tel, '', FOTO);
    await env.enviar(tel, '', FOTO);
    var r = await env.enviar(tel, '1');

    // No hay grupos → el preoperacional no puede continuar
    expect(r.toLowerCase()).toContain('plantilla');
    expect(env.supabase._volcar('preoperacionales')).toHaveLength(0);
  });

  test('todos los grupos en solo_panel deja la inspección vacía', async function () {
    var env = montarEntorno(construirSeed({ todosGruposSoloPanel: true }));
    var tel = TELEFONO_DEMO;

    await env.enviar(tel, 'hola');
    await env.enviar(tel, '1');
    await env.enviar(tel, '', FOTO);
    await env.enviar(tel, '', FOTO);
    var r = await env.enviar(tel, '1');

    expect(r.toLowerCase()).toContain('plantilla');
  });

  test('placa que no existe en la base ofrece reintento, no error', async function () {
    var env = montarEntorno(construirSeed());
    var tel = TELEFONO_DEMO;

    env.ocr._estado.placa = { valida: true, placa: 'ZZZ999', razon: '' };

    await env.enviar(tel, 'hola');
    await env.enviar(tel, '1');
    var r = await env.enviar(tel, '', FOTO);

    expect(r.toLowerCase()).toMatch(/no pude leer|no existe|otra foto/);
  });

  test('número no registrado entra a inscripción automática', async function () {
    var env = montarEntorno(construirSeed());

    var r = await env.enviar('whatsapp:+573009998877', 'hola');
    expect(r.toLowerCase()).toMatch(/nombre|registr|bienvenid/);
  });
});
