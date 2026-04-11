#!/usr/bin/env node
/**
 * Genera las secciones automáticas de ARCHITECTURE.md
 * Corre en GitHub Actions en cada push a desarrollo
 *
 * Para agregar descripcion a un archivo nuevo:
 * 1. Agregar entrada en el objeto DESCRIPCIONES con la ruta relativa como clave
 * 2. El script la aplica automaticamente en el proximo push
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ============================================================================
// DESCRIPCIONES — ruta relativa desde la raiz del repo → comentario inline
// Actualizar aqui cuando se agrega un archivo nuevo al proyecto
// ============================================================================

const DESCRIPCIONES = {
  // Raiz
  'index.js':                                                  'Entrada Express — helmet, rutas, cron, endpoints API',

  // Canales
  'canales/whatsapp.js':                                       'Webhook Twilio — enrutador principal de flujos WhatsApp',
  'canales/dashboard.js':                                      'Canal del dashboard operativo',

  // Config
  'config/config.js':                                          'Configuracion centralizada — Supabase, Twilio, Gemini, variables de entorno',

  // Middlewares
  'middlewares/auth.js':                                       'JWT verificarToken + verificarPermiso con roles canonicos',

  // Data — acceso a Supabase, una funcion por operacion
  'data/activos.js':                                           'Activos — tabla activos + registrarCambioEstado + historial',
  'data/alertas.js':                                           'Alertas — vencimientos de documentos y licencias',
  'data/ats.js':                                               'ATS — Analisis de Trabajo Seguro (Fase 3)',
  'data/autorizaciones.js':                                    'Autorizaciones de novedades — pendientes, resueltas, decidir',
  'data/dashboard.js':                                         'Dashboard — consultas agregadas para el panel ejecutivo',
  'data/inspecciones.js':                                      'Inspecciones — consultas compartidas entre modulos',
  'data/permisos.js':                                          'Permisos — roles canonicos, seed de permisos base, classifyRoleName',
  'data/posoperacionales.js':                                  'Posoperacionales — registro de cierre de turno',
  'data/revisionesEquipos.js':                                 'Revision de equipos — arneses, escaleras, EPP (Fase 3)',
  'data/riesgosLocativos.js':                                  'Riesgos locativos (Fase 3)',
  'data/tanqueos.js':                                          'Tanqueos — registro de combustible',
  'data/vehiculos.js':                                         'Vehiculos — flota, buscar por telefono, bloqueos',

  // Modulos — alertas
  'modulos/alertas/notificador.js':                            'Cron 6:00 AM — envia alertas de documentos por WhatsApp',
  'modulos/alertas/reglas.js':                                 'Reglas de alerta — umbrales 30/15/7/0 dias, clasificacion',

  // Modulos — seguridad de campo (Fase 3, estructura lista, no activa)
  'modulos/seguridad-campo/ats/flujo.js':                      'Flujo ATS (Fase 3)',
  'modulos/seguridad-campo/ats/validaciones.js':               'Validaciones ATS (Fase 3)',
  'modulos/seguridad-campo/revision-equipos/flujo.js':         'Flujo revision de equipos (Fase 3)',
  'modulos/seguridad-campo/revision-equipos/validaciones.js':  'Validaciones revision de equipos (Fase 3)',
  'modulos/seguridad-campo/riesgos-locativos/flujo.js':        'Flujo riesgos locativos (Fase 3)',
  'modulos/seguridad-campo/riesgos-locativos/validaciones.js': 'Validaciones riesgos locativos (Fase 3)',

  // Modulos — vehiculos compartido
  'modulos/vehiculos/compartido/baseFlujo.js':                 'Base compartida para maquinas de estado de flujos WhatsApp',
  'modulos/vehiculos/compartido/kilometraje.js':               'Validacion y logica de kilometraje entre turnos',
  'modulos/vehiculos/compartido/navegacion.js':                'Textos de navegacion — menu principal, 0=atras, 9=menu',
  'modulos/vehiculos/compartido/validacionVisual.js':          'Validacion de fotos via Gemini OCR',

  // Modulos — inscripcion
  'modulos/vehiculos/inscripcion/estado.js':                   'Estados del flujo de auto-registro de conductores',
  'modulos/vehiculos/inscripcion/flujo.js':                    'Flujo de inscripcion automatica de conductor nuevo',
  'modulos/vehiculos/inscripcion/mensajes.js':                 'Mensajes del flujo de inscripcion',
  'modulos/vehiculos/inscripcion/validaciones.js':             'Validaciones de inscripcion — cedula, telefono, nombre',

  // Modulos — preoperacional
  'modulos/vehiculos/preoperacional/cierre.js':                'Cierre preoperacional — PDF, novedades, autorizaciones',
  'modulos/vehiculos/preoperacional/estado.js':                'Estados del flujo preoperacional',
  'modulos/vehiculos/preoperacional/flujo.js':                 'Maquina de estados del preoperacional WhatsApp',
  'modulos/vehiculos/preoperacional/mensajes.js':              'Mensajes y preguntas del preoperacional',
  'modulos/vehiculos/preoperacional/validaciones.js':          'Validaciones de respuestas del preoperacional',

  // Modulos — posoperacional
  'modulos/vehiculos/posoperacional/cierre.js':                'Cierre posoperacional — PDF y notificaciones',
  'modulos/vehiculos/posoperacional/estado.js':                'Estados del flujo posoperacional',
  'modulos/vehiculos/posoperacional/flujo.js':                 'Maquina de estados del posoperacional WhatsApp',
  'modulos/vehiculos/posoperacional/mensajes.js':              'Mensajes del posoperacional',
  'modulos/vehiculos/posoperacional/validaciones.js':          'Validaciones del posoperacional',

  // Modulos — tanqueo
  'modulos/vehiculos/tanqueo/flujo.js':                        'Flujo de registro de combustible WhatsApp',
  'modulos/vehiculos/tanqueo/validaciones.js':                 'Validaciones del tanqueo',

  // Servicios
  'servicios/logo.js':                                         'Logo CERO en base64 para PDFs',
  'servicios/ocr.js':                                          'OCR via Gemini — lectura de placas y odometros',
  'servicios/sesiones.js':                                     'Sesiones WhatsApp — Map en memoria + persistencia Supabase + cola serializada anti race condition',
  'servicios/storage.js':                                      'Supabase Storage — subida de fotos y PDFs, signed URLs',
  'servicios/pdf/base.js':                                     'Motor PDF compartido — nunca duplicar logica aqui',
  'servicios/pdf/preoperacional.js':                           'Generador PDF preoperacional',
  'servicios/pdf/posoperacional.js':                           'Generador PDF posoperacional',

  // Frontend — componentes reutilizables
  'public/components/badge.js':                                'Componente Badge — estados y alertas',
  'public/components/card.js':                                 'Componente Card — stat cards del panel',
  'public/components/modal.js':                                'Componente Modal — detalle y formularios',
  'public/components/sidebar.js':                              'Sidebar dinamico con filtro por rol',
  'public/components/table.js':                                'Tabla reutilizable con ordenamiento y paginacion',
  'public/components/toast.js':                                'Notificaciones toast',

  // Frontend — JS base
  'public/js/api.js':                                          'Cliente API — fetch con JWT y manejo de errores',
  'public/js/app.js':                                          'Inicializacion del panel — tema, sidebar, ruta inicial',
  'public/js/router.js':                                       'Router SPA — navegacion sin recarga',
  'public/js/theme.js':                                        'Toggle tema claro/oscuro',
  'public/js/utils.js':                                        'Helpers compartidos del frontend',

  // Frontend — modulos del panel
  'public/modules/dashboard.js':                               'Modulo Dashboard — 4 pestanas, Indice de Seguridad Operativa',
  'public/modules/posoperacionales.js':                        'Modulo Posoperacionales del panel',
  'public/modules/sedes.js':                                   'Modulo Sedes — gestion multi-sede',
  'public/modules/tanqueos.js':                                'Modulo Tanqueos del panel',
  'public/modules/usuarios.js':                                'Modulo Usuarios y roles del panel',
  'public/modules/vehiculos/alertas.js':                       'Modulo Alertas — documentos y autorizaciones pendientes',
  'public/modules/vehiculos/conductores.js':                   'Modulo Conductores del panel',
  'public/modules/vehiculos/flota.js':                         'Modulo Flota — gestion de vehiculos con drawer de detalle',
  'public/modules/vehiculos/preoperacionales.js':                'Modulo Preoperacionales — lista, filtros, drawer con autorizacion',

  // Frontend — paginas
  'public/index.html':                                         'Panel de administracion',
  'public/login.html':                                         'Pagina de autenticacion',
  'public/landing.html':                                       'Landing page publica',

  // Rutas
  'rutas/auth.js':                                             'Rutas de autenticacion — /auth/login, /auth/me, /auth/logout',
  'rutas/dashboard.js':                                        'Rutas del dashboard operativo',

  // Scripts
  'scripts/update-architecture.js':                            'Auto-genera folder structure y dependencias en ARCHITECTURE.md',

  // Raiz — archivos de configuracion
  'eslint.config.cjs':                                         'ESLint — compatible con CommonJS',
  'ARCHITECTURE.md':                                           'Fuente de verdad del proyecto — leer antes de cada sesion',
};

// ============================================================================
// IGNORADOS — no aparecen en el arbol
// ============================================================================

const IGNORAR = new Set([
  'node_modules', '.git', '.cursor', 'coverage',
  '.env', '.env.local', 'dist', 'build', '__pycache__',
  'package-lock.json', 'cero_dashboard_mockup_v16.html',
  'README.md'
]);

// ============================================================================
// GENERADOR DE ARBOL
// ============================================================================

function generarArbol(dir, prefijo, rutaRelativa) {
  prefijo      = prefijo      || '';
  rutaRelativa = rutaRelativa || '';

  let resultado = '';
  let entradas;

  try {
    entradas = fs.readdirSync(dir)
      .filter(function(e) {
        return !IGNORAR.has(e) && !e.startsWith('.');
      })
      .sort(function(a, b) {
        var aDir = fs.statSync(path.join(dir, a)).isDirectory();
        var bDir = fs.statSync(path.join(dir, b)).isDirectory();
        if (aDir && !bDir) return -1;
        if (!aDir && bDir) return 1;
        return a.localeCompare(b);
      });
  } catch (e) {
    return resultado;
  }

  entradas.forEach(function(entrada, i) {
    var rutaCompleta  = path.join(dir, entrada);
    var rutaRel       = rutaRelativa ? rutaRelativa + '/' + entrada : entrada;
    var esUltimo      = i === entradas.length - 1;
    var conector      = esUltimo ? '└── ' : '├── ';
    var esCarpeta     = fs.statSync(rutaCompleta).isDirectory();
    var descripcion   = !esCarpeta ? (DESCRIPCIONES[rutaRel] || '') : '';
    var sufijo        = descripcion ? ('  # ' + descripcion) : '';

    resultado += prefijo + conector + entrada + sufijo + '\n';

    if (esCarpeta) {
      var nuevoPrefijo = prefijo + (esUltimo ? '    ' : '│   ');
      resultado += generarArbol(rutaCompleta, nuevoPrefijo, rutaRel);
    }
  });

  return resultado;
}

// ============================================================================
// DEPENDENCIAS
// ============================================================================

function leerDependencias() {
  try {
    var pkg     = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    var deps    = Object.entries(pkg.dependencies    || {}).map(function(e) { return '| `' + e[0] + '` | ' + e[1] + ' |'; }).join('\n');
    var devDeps = Object.entries(pkg.devDependencies || {}).map(function(e) { return '| `' + e[0] + '` | ' + e[1] + ' |'; }).join('\n');
    return { deps: deps, devDeps: devDeps };
  } catch (e) {
    return { deps: '_no encontrado_', devDeps: '_no encontrado_' };
  }
}

// ============================================================================
// BLOQUE AUTO-GENERADO
// ============================================================================

function construirBloqueAuto() {
  var fecha  = new Date().toISOString().split('T')[0];
  var arbol  = generarArbol('.').trimEnd();
  var dep    = leerDependencias();

  return [
    '<!-- AUTO-GENERATED START — no editar manualmente -->',
    '<!-- Última actualización: ' + fecha + ' -->',
    '',
    '## Folder structure',
    '',
    '```',
    arbol,
    '```',
    '',
    '## Dependencies',
    '',
    '| Package | Version |',
    '|---|---|',
    dep.deps || '_ninguna_',
    '',
    '### Dev dependencies',
    '',
    '| Package | Version |',
    '|---|---|',
    dep.devDeps || '_ninguna_',
    '',
    '<!-- AUTO-GENERATED END -->'
  ].join('\n');
}

// ============================================================================
// ACTUALIZAR ARCHITECTURE.md
// ============================================================================

function actualizarArchitecture() {
  var archivo = 'ARCHITECTURE.md';

  if (!fs.existsSync(archivo)) {
    console.error('❌ ' + archivo + ' no encontrado en la raíz del repo');
    process.exit(1);
  }

  var contenido  = fs.readFileSync(archivo, 'utf8');
  var inicio     = '<!-- AUTO-GENERATED START — no editar manualmente -->';
  var fin        = '<!-- AUTO-GENERATED END -->';
  var bloqueNuevo = construirBloqueAuto();

  if (contenido.includes(inicio) && contenido.includes(fin)) {
    var regex = new RegExp(inicio.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + fin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    contenido = contenido.replace(regex, bloqueNuevo);
  } else {
    contenido = contenido.trimEnd() + '\n\n' + bloqueNuevo + '\n';
  }

  fs.writeFileSync(archivo, contenido, 'utf8');
  console.log('✅ ARCHITECTURE.md actualizado — ' + new Date().toISOString());
}

actualizarArchitecture();
