# CERO — Cursor Rules
# Estas reglas aplican a TODAS las tareas en este repositorio.
# Leer completo antes de tocar cualquier archivo.

---

## Proyecto

Sistema de gestión de operaciones de campo vía WhatsApp + IA.
Tagline: cero papel, cero accidentes.
Marco regulatorio: PESV (Colombia).
Deploy: Railway — cero-production.up.railway.app

---

## Stack — FIJO, no cambiar sin instrucción explícita

- Runtime: Node.js 20, CommonJS (`require`, no `import`)
- Base de datos: Supabase (PostgreSQL + Storage, São Paulo)
- Deploy: Railway, auto-deploy desde rama `desarrollo`
- WhatsApp: Twilio
- IA: Google Gemini API (OCR e interpretación)
- PDF: PDFKit
- Auth: JWT + bcrypt, expiración 8 horas
- HTTP security: Helmet (ya instalado en index.js)
- Frontend: HTML + CSS + JS puros, sin frameworks, servido por Express
- Scheduler: node-cron

---

## Repositorio

- Rama principal: `desarrollo`
- Para fixes y ajustes menores: commit directo a `desarrollo`
- Para módulos nuevos completos: rama `claude/<descripcion>`
- Las ramas `claude/*` se auto-mergean a `desarrollo` via GitHub Actions

---

## Reglas de código — OBLIGATORIAS

1. CommonJS siempre: `require()` y `module.exports`. Nunca `import/export`.
2. Código completo siempre. Nunca escribir `// resto del código aquí` ni placeholders.
3. Comentarios en español. Nombres de variables y funciones en inglés o español consistente con el archivo que se edita.
4. Arquitectura modular: cada responsabilidad en su archivo. No mezclar lógica de negocio con rutas.
5. Nunca duplicar lógica. Si algo ya existe en `compartido/` o `servicios/`, usarlo.
6. Nunca hardcodear credenciales, URLs ni secrets. Todo desde `config/config.js`.
7. El error handler global está al final de `index.js`. No agregar otros.
8. Todas las rutas API deben pasar por `verificarToken` y `verificarPermiso`.
9. Nunca modificar `servicios/pdf/base.js` sin instrucción explícita — es el motor compartido.
10. Nunca cambiar el esquema de Supabase desde código — solo desde el dashboard de Supabase o con instrucción SQL explícita.

---

## Estructura de archivos — respetar siempre

```
canales/          # Webhooks y canales de entrada (WhatsApp, dashboard)
config/           # config.js — única fuente de variables de entorno
data/             # Acceso a Supabase — una función por operación
middlewares/      # auth.js — JWT y permisos
modulos/          # Lógica de negocio por módulo
  vehiculos/
    compartido/   # Utilidades compartidas entre flujos WhatsApp
    preoperacional/  # flujo.js estado.js mensajes.js validaciones.js cierre.js
    posoperacional/  # igual
    tanqueo/         # flujo.js validaciones.js
    inscripcion/     # flujo.js estado.js mensajes.js validaciones.js
  alertas/        # notificador.js reglas.js
  seguridad-campo/ # Fase 3 — estructura lista, NO activar sin instrucción
rutas/            # auth.js dashboard.js
servicios/        # pdf/ ocr.js sesiones.js storage.js logo.js
public/           # Frontend estático
  css/            # variables.css theme-light.css theme-dark.css components.css layout.css
  js/             # app.js api.js router.js theme.js utils.js
  components/     # sidebar table badge card modal toast
  modules/        # Un archivo JS por módulo del panel
scripts/          # update-architecture.js
```

---

## Flujos WhatsApp — reglas específicas

- Cada módulo tiene exactamente: `flujo.js estado.js mensajes.js validaciones.js cierre.js`
- Navegación universal: `0` = atrás, `9` = menú principal, respuestas solo numéricas
- Tiempo máximo de flujo: 2 minutos
- Sesiones en `servicios/sesiones.js` — Map en memoria + persistencia Supabase
- Nunca acceder a sesiones directamente desde un flujo sin usar `obtenerSesion()`

---

## Frontend — reglas específicas

- Sin frameworks. HTML + CSS + JS vanilla.
- Cada módulo del panel exporta un objeto global con: `render()`, `cargarDatos()`, `renderStats()`, `renderTabla()`
- Temas claro/oscuro via CSS variables en `variables.css` — nunca colores hardcodeados en JS
- Componentes reutilizables en `public/components/` — no duplicar
- El token JWT se guarda en `sessionStorage`, nunca en `localStorage`
- Rutas del panel: `/` landing · `/login` auth · `/panel` admin

---

## Seguridad — no negociable

- Nunca exponer stack traces al cliente en respuestas 500
- Nunca loggear tokens, passwords ni datos sensibles
- Validar firma Twilio en producción (`X-Twilio-Signature`)
- JWT_SECRET sin valor por defecto — falla en arranque si no está definido
- Helmet activo en todas las respuestas

---

## Fuente de verdad

Antes de cualquier tarea leer `ARCHITECTURE.md` en la raíz del repo.
Si hay contradicción entre estas reglas y una instrucción puntual recibida en el chat, la instrucción puntual tiene prioridad para esa tarea específica.