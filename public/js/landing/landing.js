/* ═══════════════════════════════════════════════════════════════
 * public/js/landing/landing.js
 * Orquestador de la landing page de CERO.
 *
 * Responsabilidades:
 *   1. Inicializar el motor del chat (CeroChatDemo.init)
 *   2. Scroll reveal de elementos con IntersectionObserver
 *   3. Smooth scroll para anchors internos
 *
 * Este archivo depende de chat-demo.js — debe cargarse DESPUÉS.
 * ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // Rutas de assets — centralizadas para facilitar mantenimiento.
  // Servidas por express.static desde la carpeta public/
  var ASSETS = {
    placa:    '/img/landing/placa-aaa123.jpg',
    odometro: '/img/landing/odometro-aaa123.jpg',
    pdf:      '/files/preop_AAA123_demo.pdf'
  };

  function $(selector) {
    return document.querySelector(selector);
  }

  function $all(selector) {
    return Array.prototype.slice.call(document.querySelectorAll(selector));
  }

  // ─────────────────────────────────────────────────────────────
  // Inicialización del chat
  // ─────────────────────────────────────────────────────────────

  function inicializarChat() {
    if (!window.CeroChatDemo) {
      return;
    }

    var chatEl     = $('[data-chat="feed"]');
    var actionsEl  = $('[data-chat="actions"]');
    var overlayEl  = $('[data-chat="overlay"]');
    var startBtnEl = $('[data-chat="start"]');

    if (!chatEl || !actionsEl || !overlayEl || !startBtnEl) {
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
  // ─────────────────────────────────────────────────────────────

  function inicializarReveal() {
    var elementos = $all('.lp-reveal');
    if (elementos.length === 0) return;

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
  // Smooth scroll para anchors internos
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
    inicializarSmoothScroll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arrancar);
  } else {
    arrancar();
  }

  window.CeroLanding = { assets: ASSETS };
}());
