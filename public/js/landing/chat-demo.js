/* ═══════════════════════════════════════════════════════════════
 * public/js/landing/chat-demo.js
 * Motor del chat WhatsApp animado de la landing de CERO.
 *
 * Expone una única API global: window.CeroChatDemo
 *
 *   CeroChatDemo.init({
 *     chatEl, actionsEl, overlayEl, startBtnEl,
 *     placaSrc, odometroSrc, pdfHref, ctaHref
 *   });
 *
 * Caso demostrativo: Toyota Hilux placa AAA 123, conductor Carlos Ramírez.
 * Todos los datos son ficticios — cualquier parecido con personas
 * reales es coincidencia.
 * ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var cfg = null;
  var iniciado = false;

  // ─────────────────────────────────────────────────────────────
  // Utilidades DOM
  // ─────────────────────────────────────────────────────────────

  function escaparHtml(texto) {
    var div = document.createElement('div');
    div.textContent = String(texto);
    return div.innerHTML;
  }

  function formatearWa(textoSeguro) {
    return textoSeguro
      .replace(/\*([^*\n]+)\*/g, '<b>$1</b>')
      .replace(/_([^_\n]+)_/g,   '<i>$1</i>');
  }

  function scrollAbajo() {
    cfg.chatEl.scrollTo({
      top:      cfg.chatEl.scrollHeight + 300,
      behavior: 'smooth'
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Renderizadores de burbujas
  // ─────────────────────────────────────────────────────────────

  function mensajeBot(contenido, hora) {
    var wrap = document.createElement('div');
    wrap.className = 'lp-msg lp-msg--bot';
    var bubble   = document.createElement('div');
    bubble.className = 'lp-bubble lp-bubble--bot';
    var texto = document.createElement('div');
    texto.className = 'lp-bubble__text';
    texto.innerHTML = formatearWa(escaparHtml(contenido));
    var time  = document.createElement('div');
    time.className    = 'lp-bubble__time';
    time.textContent  = hora;
    bubble.appendChild(texto);
    bubble.appendChild(time);
    wrap.appendChild(bubble);
    cfg.chatEl.appendChild(wrap);
    scrollAbajo();
  }

  function mensajeUsuario(contenido, hora) {
    var wrap = document.createElement('div');
    wrap.className = 'lp-msg lp-msg--user';
    var bubble   = document.createElement('div');
    bubble.className = 'lp-bubble lp-bubble--user';
    var texto = document.createElement('div');
    texto.className = 'lp-bubble__text';
    texto.innerHTML = formatearWa(escaparHtml(contenido));
    var time  = document.createElement('div');
    time.className    = 'lp-bubble__time lp-bubble__time--user';
    time.textContent  = hora;
    bubble.appendChild(texto);
    bubble.appendChild(time);
    wrap.appendChild(bubble);
    cfg.chatEl.appendChild(wrap);
    scrollAbajo();
  }

  function imagenUsuario(src, hora) {
    var wrap = document.createElement('div');
    wrap.className = 'lp-msg lp-msg--user';
    var bubble   = document.createElement('div');
    bubble.className = 'lp-bubble lp-bubble--user lp-bubble--img';
    var img = document.createElement('img');
    img.className   = 'lp-bubble__img';
    img.src         = src;
    img.alt         = 'Foto enviada por el conductor';
    img.loading     = 'lazy';
    var time = document.createElement('div');
    time.className    = 'lp-bubble__img-time';
    time.textContent  = hora + ' ✓✓';
    bubble.appendChild(img);
    bubble.appendChild(time);
    wrap.appendChild(bubble);
    cfg.chatEl.appendChild(wrap);
    scrollAbajo();
  }

  function mensajePdf(hora) {
    var wrap = document.createElement('div');
    wrap.className = 'lp-msg lp-msg--bot';
    var bubble = document.createElement('div');
    bubble.className = 'lp-bubble lp-bubble--bot';
    var cont = document.createElement('div');
    cont.className = 'lp-pdfmsg';
    var icon = document.createElement('div');
    icon.className   = 'lp-pdfmsg__icon';
    icon.textContent = 'PDF';
    var info = document.createElement('div');
    var titulo = document.createElement('div');
    titulo.className   = 'lp-pdfmsg__title';
    titulo.textContent = '📄 PDF Preoperacional';
    var meta = document.createElement('div');
    meta.className   = 'lp-pdfmsg__meta';
    meta.textContent = 'AAA 123 | 15/4/2026';
    var link = document.createElement('a');
    link.className    = 'lp-pdfmsg__link';
    link.href         = cfg.pdfHref;
    link.target       = '_blank';
    link.rel          = 'noopener';
    link.textContent  = '⬇ Descargar PDF';
    info.appendChild(titulo);
    info.appendChild(meta);
    info.appendChild(link);
    cont.appendChild(icon);
    cont.appendChild(info);
    var time = document.createElement('div');
    time.className   = 'lp-bubble__time';
    time.textContent = hora;
    bubble.appendChild(cont);
    bubble.appendChild(time);
    wrap.appendChild(bubble);
    cfg.chatEl.appendChild(wrap);
    scrollAbajo();
  }

  function escribiendo(ms) {
    var duracion = ms || 1100;
    var wrap = document.createElement('div');
    wrap.className = 'lp-typing';
    var bubble = document.createElement('div');
    bubble.className = 'lp-typing__bubble';
    bubble.innerHTML =
      '<span class="lp-typing__dot"></span>' +
      '<span class="lp-typing__dot"></span>' +
      '<span class="lp-typing__dot"></span>';
    wrap.appendChild(bubble);
    cfg.chatEl.appendChild(wrap);
    scrollAbajo();
    return new Promise(function (resolve) {
      setTimeout(function () {
        wrap.remove();
        resolve();
      }, duracion);
    });
  }

  // ─────────────────────────────────────────────────────────────
  // CTA final
  // ─────────────────────────────────────────────────────────────
  function renderCtaFinal() {
    var cta = document.createElement('div');
    cta.className = 'lp-chat-cta';
    var texto = document.createElement('p');
    texto.className   = 'lp-chat-cta__text';
    texto.textContent = '¿Quieres CERO en tu empresa?';
    var btn = document.createElement('a');
    btn.className   = 'lp-chat-cta__btn';
    btn.href        = cfg.ctaHref || '#contacto';
    btn.textContent = 'Agendar demo →';
    cta.appendChild(texto);
    cta.appendChild(btn);
    cfg.chatEl.appendChild(cta);
    scrollAbajo();
  }

  // ─────────────────────────────────────────────────────────────
  // Botones de acción
  // ─────────────────────────────────────────────────────────────
  function setAcciones(botones) {
    cfg.actionsEl.innerHTML = '';
    botones.forEach(function (b) {
      var btn = document.createElement('button');
      btn.type      = 'button';
      btn.className = 'lp-actions__btn' + (b.ghost ? ' lp-actions__btn--ghost' : '');
      btn.textContent = b.label;
      if (typeof b.fn === 'function') {
        btn.addEventListener('click', b.fn);
      } else {
        btn.addEventListener('click', function () {});
        btn.style.opacity = '0.75';
      }
      cfg.actionsEl.appendChild(btn);
    });
    scrollAbajo();
  }

  function limpiarAcciones() {
    cfg.actionsEl.innerHTML = '';
  }

  // ─────────────────────────────────────────────────────────────
  // Flujo del preoperacional — caso demostrativo AAA 123
  // ─────────────────────────────────────────────────────────────

  async function pasoInicio() {
    cfg.overlayEl.classList.add('lp-overlay--hidden');
    setTimeout(function () {
      cfg.overlayEl.style.display = 'none';
    }, 280);

    await escribiendo(900);
    mensajeBot(
      '🚗 *CERO — Preoperacional*\nBuenos días 👋\n\n' +
      '📸 *Paso 1 de 2*\nEnvía una foto frontal donde la placa ocupe buena parte de la imagen. ' +
      'Acércate un poco, con buena luz y sin reflejos.\n\n' +
      '9️⃣ Menú principal',
      '11:34 a.m.'
    );
    setAcciones([{ label: '📷 Enviar foto placa AAA 123', fn: pasoFotoPlaca }]);
  }

  async function pasoFotoPlaca() {
    limpiarAcciones();
    imagenUsuario(cfg.placaSrc, '11:35 a.m.');
    await escribiendo(1300);
    mensajeBot(
      '✅ *AAA 123*\nCAMIONETA (HILUX)\nTOYOTA HILUX\n\n' +
      '📸 *Paso 2 de 2*\nEnvía una foto de frente al display del odómetro. ' +
      'Acércate al tablero para que el número quede centrado y legible.\n\n' +
      'Último registrado: *38726 km*\n\n' +
      '0️⃣ Atrás · 9️⃣ Menú principal',
      '11:35 a.m.'
    );
    setAcciones([{ label: '📷 Enviar foto odómetro', fn: pasoFotoOdometro }]);
  }

  async function pasoFotoOdometro() {
    limpiarAcciones();
    imagenUsuario(cfg.odometroSrc, '11:35 a.m.');
    await escribiendo(1600);
    mensajeBot(
      '⚠️ *Lectura del odómetro fuera de rango*\n' +
      'Detecté: *38999 km*\n' +
      'Último registrado: *38726 km*\n' +
      'Rango automático: hasta 200 km sobre el último registro.\n' +
      'El salto detectado fue de *273 km*.\n\n' +
      '1️⃣ Escribir el kilometraje correcto\n' +
      '2️⃣ Enviar otra foto\n\n' +
      '0️⃣ Atrás · 9️⃣ Menú principal\n\n' +
      '_Tip: acerca el celular al display y que solo se vea el tablero._',
      '11:35 a.m.'
    );
    setAcciones([
      { label: '1', fn: pasoEscribirKm },
      { label: '2', ghost: true }
    ]);
  }

  async function pasoEscribirKm() {
    limpiarAcciones();
    mensajeUsuario('1', '11:36 a.m.');
    await escribiendo(800);
    mensajeBot(
      '⌨️ Escribe el kilometraje correcto usando solo números.\nEjemplo: 267354\n\n' +
      '0️⃣ Atrás · 9️⃣ Menú principal',
      '11:36 a.m.'
    );
    setAcciones([{ label: '38999', fn: pasoConfirmarKm }]);
  }

  async function pasoConfirmarKm() {
    limpiarAcciones();
    mensajeUsuario('38999', '11:36 a.m.');
    await escribiendo(900);
    mensajeBot(
      '⚠️ Kilometraje fuera del rango automático. Queda registrado para revisión.',
      '11:36 a.m.'
    );
    await escribiendo(500);
    mensajeBot(
      '✅ OK\n\n' +
      '*ELÉCTRICO Y LUCES*\n' +
      'Luces · Stops · Pito · Tablero · Baterías\n\n' +
      '1️⃣ Todo OK\n2️⃣ Novedad\n\n' +
      '0️⃣ Atrás · 9️⃣ Menú principal',
      '11:36 a.m.'
    );
    setAcciones([
      { label: '1', fn: pasoFrenos },
      { label: '2', ghost: true }
    ]);
  }

  async function pasoFrenos() {
    limpiarAcciones();
    mensajeUsuario('1', '11:36 a.m.');
    await escribiendo(700);
    mensajeBot(
      '✅ OK\n\n' +
      '*FRENOS, DIRECCIÓN Y LLANTAS*\n' +
      'Freno parqueo · Llantas · Pernos · Repuesto\n\n' +
      '1️⃣ Todo OK\n2️⃣ Novedad\n\n' +
      '0️⃣ Atrás · 9️⃣ Menú principal',
      '11:36 a.m.'
    );
    setAcciones([
      { label: '1', fn: pasoCabina },
      { label: '2', ghost: true }
    ]);
  }

  async function pasoCabina() {
    limpiarAcciones();
    mensajeUsuario('1', '11:36 a.m.');
    await escribiendo(700);
    mensajeBot(
      '✅ OK\n\n' +
      '*CABINA Y EQUIPO*\n' +
      'Cinturones · Retrovisores · Pedales · Vidrios · Aseo · Aire · Equipo carretera\n\n' +
      '1️⃣ Todo OK\n2️⃣ Novedad\n\n' +
      '0️⃣ Atrás · 9️⃣ Menú principal',
      '11:36 a.m.'
    );
    setAcciones([
      { label: '1', fn: pasoResumenFotos },
      { label: '2', ghost: true }
    ]);
  }

  async function pasoResumenFotos() {
    limpiarAcciones();
    mensajeUsuario('1', '11:36 a.m.');
    await escribiendo(900);
    mensajeBot(
      '*RESUMEN AAA 123*\n✅ Todo en buen estado\n\n' +
      '📸 ¿Fotos adicionales?\n' +
      'Envía una foto para agregar evidencia, o:\n\n' +
      '1️⃣ Continuar a la observación final\n' +
      '0️⃣ Atrás · 9️⃣ Menú principal',
      '11:36 a.m.'
    );
    setAcciones([{ label: '1', fn: pasoObservacion }]);
  }

  async function pasoObservacion() {
    limpiarAcciones();
    mensajeUsuario('1', '11:36 a.m.');
    await escribiendo(700);
    mensajeBot(
      '💬 *Observación final*\n' +
      '1️⃣ Sin observaciones\n' +
      '2️⃣ Escribir observación\n\n' +
      '0️⃣ Atrás · 9️⃣ Menú principal',
      '11:36 a.m.'
    );
    setAcciones([
      { label: '1', fn: pasoResumenFinal },
      { label: '2', ghost: true }
    ]);
  }

  async function pasoResumenFinal() {
    limpiarAcciones();
    mensajeUsuario('1', '11:36 a.m.');
    await escribiendo(800);
    mensajeBot(
      '📋 *RESUMEN PREOPERACIONAL*\n' +
      '🚗 Vehículo: *AAA 123*\n' +
      '📏 Kilometraje: *38999 km*\n' +
      '📸 Validación por foto: *OK*\n' +
      '✅ Sin novedades\n' +
      '📷 Fotos: 2\n\n' +
      '1️⃣ Firmar y cerrar\n' +
      '2️⃣ Corregir (volver a observación)\n' +
      '0️⃣ Atrás · 9️⃣ Menú principal',
      '11:37 a.m.'
    );
    setAcciones([
      { label: '1 · Firmar y cerrar', fn: pasoFirmar },
      { label: '2', ghost: true }
    ]);
  }

  async function pasoFirmar() {
    limpiarAcciones();
    mensajeUsuario('1', '11:37 a.m.');
    await escribiendo(2200);
    mensajePdf('11:37 a.m.');
    await escribiendo(500);
    mensajeBot(
      '✅ *PREOPERACIONAL FIRMADO*\n\n' +
      '🚗 AAA 123 | 15/4/2026\n' +
      '👤 Carlos Ramírez\n' +
      '📏 38999 km\n' +
      '✅ Sin novedades\n\n' +
      '📄 PDF generado y enviado por WhatsApp.\n\n' +
      '9️⃣ Menú principal',
      '11:37 a.m.'
    );
    limpiarAcciones();
    renderCtaFinal();
  }

  // ─────────────────────────────────────────────────────────────
  // API pública
  // ─────────────────────────────────────────────────────────────

  function init(config) {
    if (iniciado) {
      return;
    }
    if (!config || !config.chatEl || !config.actionsEl ||
        !config.overlayEl || !config.startBtnEl) {
      return;
    }
    cfg = config;
    iniciado = true;
    cfg.startBtnEl.addEventListener('click', pasoInicio);
  }

  window.CeroChatDemo = { init: init };
}());
