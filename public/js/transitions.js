/**
 * transitions.js
 * Transiciones suaves entre páginas de CERO.
 * Fade-out al salir (150ms) + fade-in al entrar (250ms).
 * Cargar en landing.html, login.html e index.html.
 */

(function () {
    'use strict';
  
    var DURACION_SALIDA  = 150; // ms
    var DURACION_ENTRADA = 250; // ms
  
    // Inyectar estilos base una sola vez
    var style = document.createElement('style');
    style.textContent = [
      'body.cero-fade-out {',
      '  opacity: 0 !important;',
      '  transition: opacity ' + DURACION_SALIDA + 'ms ease !important;',
      '}',
      'body.cero-fade-in {',
      '  opacity: 0;',
      '}',
      'body.cero-visible {',
      '  opacity: 1;',
      '  transition: opacity ' + DURACION_ENTRADA + 'ms ease;',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  
    // Fade-in al cargar la página
    document.addEventListener('DOMContentLoaded', function () {
      document.body.classList.add('cero-fade-in');
      // Forzar reflow para que la transición arranque
      void document.body.offsetHeight;
      document.body.classList.add('cero-visible');
    });
  
    /**
     * Navega a una URL con fade-out previo.
     * Usar en lugar de window.location para transiciones animadas.
     */
    function navegarCon(url) {
      document.body.classList.add('cero-fade-out');
      setTimeout(function () {
        window.location.href = url;
      }, DURACION_SALIDA);
    }
  
    // Interceptar clicks en <a> internos
    document.addEventListener('click', function (e) {
      var link = e.target.closest('a');
      if (!link) return;
  
      var href = link.getAttribute('href');
      if (!href) return;
  
      // Solo rutas internas relativas o del mismo origen
      var esInterno = (
        href.startsWith('/') &&
        !href.startsWith('//') &&
        !link.hasAttribute('target') &&
        !link.hasAttribute('download')
      );
  
      if (!esInterno) return;
  
      // No animar si ya estamos en esa ruta
      var rutaActual = window.location.pathname;
      if (href === rutaActual) return;
  
      e.preventDefault();
      navegarCon(href);
    });
  
    // Exponer para uso programático (ej: después del login)
    window.CeroTransitions = {
      ir: navegarCon
    };
  }());