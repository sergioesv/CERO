/* ═══════════════════════════════════════════════════════════════
 * public/js/landing/landing.js
 * Orquestador de la landing page de CERO.
 *
 * Responsabilidades:
 *   1. Inicializar el motor del chat (CeroChatDemo.init)
 *   2. Scroll reveal de elementos con IntersectionObserver
 *   3. Galería + lightbox con navegación por teclado y swipe
 *
 * Este archivo depende de chat-demo.js — debe cargarse DESPUÉS.
 * ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // Constantes y rutas de assets
  // Todas las rutas son relativas al raíz de public/ — servido
  // automáticamente por express.static en index.js.
  // ─────────────────────────────────────────────────────────────
  var ASSETS = {
    placa:    '/img/landing/placa-wds340.jpg',
    odometro: '/img/landing/odometro-wds340.jpg',
    pdf:      '/files/preop_WDS340_demo.pdf',
    // 8 screenshots reales del chat — orden cronológico
    chat: [
      '/img/landing/chat-01.jpg',
      '/img/landing/chat-02.jpg',
      '/img/landing/chat-03.jpg',
      '/img/landing/chat-04.jpg',
      '/img/landing/chat-05.jpg',
      '/img/landing/chat-06.jpg',
      '/img/landing/chat-07.jpg',
      '/img/landing/chat-08.jpg'
    ]
  };

  // ─────────────────────────────────────────────────────────────
  // Estado interno — nodos DOM cacheados tras DOMContentLoaded
  // ─────────────────────────────────────────────────────────────
  var nodos = {};

  // ─────────────────────────────────────────────────────────────
  // Utilidades cortas
  // ─────────────────────────────────────────────────────────────

  /** Atajo para document.querySelector. */
  function $(selector) {
    return document.querySelector(selector);
  }

  /** Atajo para document.querySelectorAll devuelto como Array. */
  function $all(selector) {
    return Array.prototype.slice.call(document.querySelectorAll(selector));
  }

  // ─────────────────────────────────────────────────────────────
  // Inicialización del chat
  // Conecta el motor (chat-demo.js) con los nodos del HTML.
  // ─────────────────────────────────────────────────────────────

  function inicializarChat() {
    if (!window.CeroChatDemo) {
      console.error('CeroChatDemo no está cargado. Verificar orden de <script>.');
      return;
    }

    var chatEl     = $('[data-chat="feed"]');
    var actionsEl  = $('[data-chat="actions"]');
    var overlayEl  = $('[data-chat="overlay"]');
    var startBtnEl = $('[data-chat="start"]');

    if (!chatEl || !actionsEl || !overlayEl || !startBtnEl) {
      console.warn('Faltan nodos del chat en el DOM. La demo no arrancará.');
      return;
    }

    window.CeroChatDemo.init({
      chatEl:      chatEl,
      actionsEl:   actionsEl,
      overlayEl:   overlayEl,
      startBtnEl:  startBtnEl,
      placaSrc:    ASSETS.placa,
      odometroSrc: ASSETS.odometro,
      pdfHref:     ASSETS.pdf,
      ctaHref:     '#contacto'
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Scroll reveal con IntersectionObserver
  // Los elementos .lp-reveal empiezan invisibles (CSS) y se
  // revelan cuando entran al viewport.
  // ─────────────────────────────────────────────────────────────

  function inicializarReveal() {
    var elementos = $all('.lp-reveal');
    if (elementos.length === 0) return;

    // Fallback para navegadores muy viejos: mostrar todo de inmediato
    if (typeof IntersectionObserver === 'undefined') {
      elementos.forEach(function (el) {
        el.classList.add('lp-reveal--active');
      });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('lp-reveal--active');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold:  0.15,
      rootMargin: '0px 0px -50px 0px'
    });

    elementos.forEach(function (el) {
      observer.observe(el);
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Lightbox de la galería
  // Abre al hacer click en [data-gallery-index], navega con
  // flechas del teclado, swipe en mobile y cierra con ESC.
  // ─────────────────────────────────────────────────────────────

  var lightbox = {
    indice:    0,
    abierto:   false,
    touchX:    0
  };

  function abrirLightbox(indice) {
    if (!nodos.lightboxEl || !nodos.lightboxImg) return;
    lightbox.indice  = indice;
    lightbox.abierto = true;
    nodos.lightboxImg.src = ASSETS.chat[indice];
    nodos.lightboxImg.alt = 'Captura ' + (indice + 1) + ' de 8 del chat real';
    nodos.lightboxEl.classList.add('lp-lightbox--open');
    document.body.style.overflow = 'hidden';
  }

  function cerrarLightbox() {
    if (!nodos.lightboxEl) return;
    lightbox.abierto = false;
    nodos.lightboxEl.classList.remove('lp-lightbox--open');
    document.body.style.overflow = '';
  }

  function navegarLightbox(delta) {
    if (!lightbox.abierto) return;
    var total = ASSETS.chat.length;
    lightbox.indice = (lightbox.indice + delta + total) % total;
    nodos.lightboxImg.src = ASSETS.chat[lightbox.indice];
    nodos.lightboxImg.alt = 'Captura ' + (lightbox.indice + 1) + ' de ' + total + ' del chat real';
  }

  function inicializarGaleria() {
    // Asignar click en cada item de la galería
    var items = $all('[data-gallery-index]');
    items.forEach(function (item) {
      item.addEventListener('click', function () {
        var idx = parseInt(item.getAttribute('data-gallery-index'), 10);
        if (!isNaN(idx)) abrirLightbox(idx);
      });
    });

    // Conectar controles del lightbox
    nodos.lightboxEl  = $('[data-lightbox="root"]');
    nodos.lightboxImg = $('[data-lightbox="img"]');

    var btnClose = $('[data-lightbox="close"]');
    var btnPrev  = $('[data-lightbox="prev"]');
    var btnNext  = $('[data-lightbox="next"]');

    if (btnClose) btnClose.addEventListener('click', cerrarLightbox);
    if (btnPrev)  btnPrev.addEventListener('click',  function () { navegarLightbox(-1); });
    if (btnNext)  btnNext.addEventListener('click',  function () { navegarLightbox(+1); });

    // Click fuera de la imagen → cerrar
    if (nodos.lightboxEl) {
      nodos.lightboxEl.addEventListener('click', function (e) {
        if (e.target === nodos.lightboxEl) cerrarLightbox();
      });
    }

    // Teclado: ESC cierra, flechas navegan
    document.addEventListener('keydown', function (e) {
      if (!lightbox.abierto) return;
      if (e.key === 'Escape')     cerrarLightbox();
      if (e.key === 'ArrowLeft')  navegarLightbox(-1);
      if (e.key === 'ArrowRight') navegarLightbox(+1);
    });

    // Swipe en mobile
    if (nodos.lightboxEl) {
      nodos.lightboxEl.addEventListener('touchstart', function (e) {
        lightbox.touchX = e.touches[0].clientX;
      }, { passive: true });

      nodos.lightboxEl.addEventListener('touchend', function (e) {
        var deltaX = e.changedTouches[0].clientX - lightbox.touchX;
        if (Math.abs(deltaX) > 50) {
          navegarLightbox(deltaX > 0 ? -1 : +1);
        }
      }, { passive: true });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Smooth scroll para anchors internos (#contacto, #pdf, #demo...)
  // No interfiere con transitions.js porque esos son hash-links,
  // no rutas. transitions.js solo intercepta href que empiezan con "/".
  // ─────────────────────────────────────────────────────────────

  function inicializarSmoothScroll() {
    $all('a[href^="#"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var href = a.getAttribute('href');
        if (!href || href.length < 2) return;
        var destino = document.querySelector(href);
        if (!destino) return;
        e.preventDefault();
        destino.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Arranque
  // ─────────────────────────────────────────────────────────────

  function arrancar() {
    inicializarChat();
    inicializarReveal();
    inicializarGaleria();
    inicializarSmoothScroll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arrancar);
  } else {
    arrancar();
  }

  // Exposición pública mínima (útil para debugging en consola)
  window.CeroLanding = {
    assets: ASSETS,
    abrirLightbox: abrirLightbox,
    cerrarLightbox: cerrarLightbox
  };
}());
