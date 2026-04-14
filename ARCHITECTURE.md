# CERO — Architecture

Field operations management SaaS via WhatsApp + AI.
**Tagline:** cero papel, cero accidentes
**Regulatory framework:** PESV (Colombia road safety)
**Deploy:** [cero-production.up.railway.app](https://cero-production.up.railway.app)

---

## How to start a session with Claude Chat

Paste this file at the start of every session. That is all the context needed.
No history, no repetition.

---

## Stack

| Layer | Technology | Version |
|---|---|---|
| Runtime | Node.js — CommonJS (`require`) | 20 |
| Database | Supabase — PostgreSQL + Storage (São Paulo) | ^2.48.0 |
| Deploy | Railway — auto-deploy from `desarrollo` | — |
| WhatsApp | Twilio | ^5.3.5 |
| AI | Google Gemini API — OCR + interpretation | ^0.21.0 |
| PDF | PDFKit | ^0.15.1 |
| Auth | JWT + bcrypt — 8h expiration | ^9.0.3 / ^3.0.3 |
| HTTP security | Helmet | ^8.1.0 |
| Frontend | HTML + CSS + JS — no frameworks, served by Express | — |
| Scheduler | node-cron — daily document alerts | ^3.0.3 |

**Rule:** never swap a technology without a documented technical reason.

---

## Repository

- **Repo:** `sergioesv/CERO` (private)
- **Main branch:** `desarrollo`
- **Feature branches:** `claude/<description>` — auto-merged to `desarrollo` via GitHub Actions
- **Rule:** commit directly to `desarrollo` for fixes; new branch only for complete new modules

---

## CI/CD pipeline

Three workflows run in parallel on every push to `desarrollo`:

| Workflow | Triggers when | Validates |
|---|---|---|
| `backend.yml` | `routes/` `data/` `modulos/` `servicios/` `index.js` | ESLint, npm audit, hardcoded secrets, .env in repo |
| `frontend.yml` | `public/` | ESLint, credentials in client JS, folder structure |
| `security.yml` | Always | Secrets in diff, npm audit high, .gitignore, helmet present |
| `update-architecture.yml` | Always | Regenerates folder structure + deps in this file |

**Rule:** if any workflow fails, merge is blocked.

---

## Project phases

### Phase 1 — Vehicle control ✅ COMPLETE
- Preoperational inspection via WhatsApp + PDF
- Postoperational inspection via WhatsApp + PDF
- Fueling records
- Automatic document alerts (SOAT, tecno, license)
- Driver auto-registration
- Authorization system v12 (INFORMATIVO / ALERTA / BLOQUEO)

### Phase 2 — Dashboard & admin panel 🔄 IN PROGRESS
- 2.1 Web admin panel — Flota, Preoperacionales, Alertas, Conductores, Posoperacionales, Tanqueos — todos COMPLETE
- 2.2 Operational dashboard — complete
- 2.3 History and reports — pending
- 2.4 Power BI integration — future

### Phase 3 — Personnel safety ⏳ FUTURE
- Harness inspection, ladder inspection, ATS (structure exists in `modulos/seguridad-campo/`)

---

## Folder structure

> Generada automáticamente en la sección al final de este archivo. No editar manualmente.

---

## Database — key tables

| Table | Purpose |
|---|---|
| `vehiculos` | Fleet — plate, type, docs, status |
| `conductores` | Drivers — license, category, active |
| `preoperacionales` | Pre-shift inspections |
| `posoperacionales` | Post-shift inspections |
| `tanqueos` | Fueling records |
| `activos` | Assets (vehicles migrated here for dashboard) |
| `historial_estado_activo` | Asset state change history |
| `autorizaciones_novedad` | Supervisor authorizations |
| `empresas / sedes / usuarios_panel` | Multi-company schema |
| `sesiones_activas` | Active WhatsApp sessions |

---

## Platform hierarchy

```
Platform (superadmin_plataforma)
  └── Empresa
        └── Sede
              └── Usuario
```

Conductors can operate across any sede. Roles are configurable per company.

---

## WhatsApp flow architecture

Each module is strictly modular:

```
modulos/vehiculos/<module>/
├── flujo.js         # State machine
├── estado.js        # State definitions
├── mensajes.js      # Message templates
├── validaciones.js  # Input validation
└── cierre.js        # Session close + PDF + notifications
```

**UX rule:** max 2-minute flow. Single-number responses only. `0` = back, `9` = main menu.

---

## Frontend pattern

Each panel module exports a global object:

```js
const ModuleName = {
  render()        // Mount HTML into main container
  cargarDatos()   // Fetch from API and populate
  renderStats()   // Update stat cards
  renderTabla()   // Render reusable Table component
}
```

Routes: `/` landing · `/login` auth · `/panel` admin panel

---

## Security checklist — before production

- [ ] RLS enabled in Supabase
- [ ] Twilio webhook signature validation (`X-Twilio-Signature`)
- [ ] Custom domain purchased and configured
- [ ] All routes behind `verificarPermiso` middleware
- [ ] No credentials in source code
- [ ] `.env` in `.gitignore` ✅
- [ ] Signed URL regeneration at query time (Supabase Storage)
- [ ] Helmet installed and active ✅
- [ ] CSP configurado con scriptSrc/scriptSrcElem/scriptSrcAttr ✅

---

## Estado de salud del código

### Crítico — antes de producción real
- [ ] RLS en Supabase
- [ ] Twilio webhook signature validation
- [ ] Migrar onclick inline a addEventListener (CSP scriptSrcAttr → 'none')
- [ ] Dominio propio configurado

### Importante — antes de segundo cliente
- [ ] Tests integración flujos WhatsApp críticos
- [ ] Separar lógica de negocio de data/ (queries puras vs lógica)
- [ ] Manejo de errores consistente en todas las rutas API
- [ ] Zona horaria UTC-5 en queries de "hoy"
- [ ] Foto recibo en drawer tanqueos — URLs firmadas Supabase Storage
- [ ] Mover /api/dashboard/resumen de index.js a rutas/dashboard.js

### Deuda aceptada conscientemente
- unsafe-inline en CSP — temporal para demo, revertir antes de producción
- Sin tests — prioridad demo sobre cobertura
- Frontend módulos mezclan lógica + render — refactor post-demo

### Resuelto hoy
- [x] index.js refactorizado — 925 líneas → ~190, 6 archivos de rutas ✅
- [x] Bug rendimiento primer tanqueo — es_primer_tanqueo flag ✅
- [x] CSP Helmet — 3 directivas configuradas, panel completamente funcional ✅

---

## Decision log

| Date | Decision | Reason |
|---|---|---|
| 14/04/2026 | Eliminar endpoint /api/tanqueos duplicado en canales/dashboard.js | Interceptaba requests antes que rutas/tanqueos.js — stats nunca llegaban al frontend |
| 14/04/2026 | Proxy seguro imágenes Twilio — GET /api/tanqueos/media/:fotoId | Frontend nunca controla URL — backend resuelve desde BD |
| 14/04/2026 | Zona horaria Bogotá (UTC-5) en backend y frontend | Stats "hoy" calculaban en UTC — diferencia de 5h causaba 0s en cards |
| 14/04/2026 | Security workflow corregido — regex .env y agregar *.pem *.key | Workflow bloqueaba deploys de Railway con Wait for CI activo |
| 14/04/2026 | es_primer_tanqueo corregido en BD — 2 registros existentes | kmReferencia null generaba rendimiento 11402 km/u en datos históricos |
| 14/04/2026 | CSP Helmet — scriptSrc + scriptSrcElem + scriptSrcAttr unsafe-inline | onclick inline bloqueado en panel admin |
| 14/04/2026 | Refactor index.js — 6 archivos de rutas extraídos | index.js de 925 a ~190 líneas |
| 14/04/2026 | Fix rendimiento primer tanqueo — es_primer_tanqueo flag | kmReferencia null generaba 11402 km/u |
| 12/04/2026 | Tanqueo v2 — flujo reconstruido sobre patrón preoperacional | OCR síncrono, reutiliza kmCompartido, foto placa → odómetro → recibo |
| 12/04/2026 | Validación cruzada 4 campos — placa, km, cantidad, factura | Antifraude, auto_validado vs pendiente_revision |
| 12/04/2026 | Plan tanqueo v21 — OCR, validación cruzada 4 campos, antifraude rendimiento | 4 semanas, semana 1 en curso |
| 10/04/2026 | Pipeline CI/CD — 3 workflows | Validación automática antes de merge |
| 10/04/2026 | Helmet instalado | Headers de seguridad HTTP obligatorios |
| 10/04/2026 | ARCHITECTURE.md como fuente de verdad | Reemplaza archivos de sesión de diseño |
| 10/04/2026 | Cursor como ejecutor, Claude Chat como orquestador | Separación de roles clara |
| 10/04/2026 | Migrar a WhatsApp Business API | Sandbox no apto para producción real |
| 27/03/2026 | Dashboard 4 pestañas — General, Activos, Seguridad, Reportes | Vista gerencial + operativa separadas |
| 27/03/2026 | Índice de Seguridad Operativa (score 0-100) | KPI hero del dashboard |
| 27/03/2026 | Tendencias y análisis profundo van a Power BI | Evita scope creep en JS |
| 27/03/2026 | Camino B — tablas separadas por tipo de inspección | Fase 1 intacta, sin riesgo |
| 27/03/2026 | KPIs financieros como "susurro" en dashboard | Ejecutivos leen dinero primero |
| 27/03/2026 | Seguridad personal visible en demo, oculta en prod | Estrategia comercial |

## Cursor — cómo usar las reglas especializadas

`rules.md` siempre activo. Para tareas específicas agregar al inicio de la instrucción:

| Tipo de tarea | Archivo adicional |
|---|---|
| Rutas API, data/, middlewares/, servicios/, index.js | `Contexto adicional: leer .cursor/rules-backend.md` |
| Panel web, public/, módulos, CSS, HTML | `Contexto adicional: leer .cursor/rules-frontend.md` |
| Flujos WhatsApp, modulos/vehiculos/, sesiones | `Contexto adicional: leer .cursor/rules-whatsapp.md` |

<!-- AUTO-GENERATED START — no editar manualmente -->
<!-- Última actualización: 2026-04-14 -->

## Folder structure

```
├── canales
│   ├── dashboard.js  # Canal del dashboard operativo
│   └── whatsapp.js  # Webhook Twilio — enrutador principal de flujos WhatsApp
├── config
│   └── config.js  # Configuracion centralizada — Supabase, Twilio, Gemini, variables de entorno
├── data
│   ├── activos.js  # Activos — tabla activos + registrarCambioEstado + historial
│   ├── alertas.js  # Alertas — vencimientos de documentos y licencias
│   ├── ats.js  # ATS — Analisis de Trabajo Seguro (Fase 3)
│   ├── autorizaciones.js  # Autorizaciones de novedades — pendientes, resueltas, decidir
│   ├── dashboard.js  # Dashboard — consultas agregadas para el panel ejecutivo
│   ├── inspecciones.js  # Inspecciones — consultas compartidas entre modulos
│   ├── permisos.js  # Permisos — roles canonicos, seed de permisos base, classifyRoleName
│   ├── posoperacionales.js  # Posoperacionales — registro de cierre de turno
│   ├── revisionesEquipos.js  # Revision de equipos — arneses, escaleras, EPP (Fase 3)
│   ├── riesgosLocativos.js  # Riesgos locativos (Fase 3)
│   ├── tanqueos.js  # Tanqueos — registro de combustible
│   └── vehiculos.js  # Vehiculos — flota, buscar por telefono, bloqueos
├── middlewares
│   └── auth.js  # JWT verificarToken + verificarPermiso con roles canonicos
├── modulos
│   ├── alertas
│   │   ├── notificador.js  # Cron 6:00 AM — envia alertas de documentos por WhatsApp
│   │   └── reglas.js  # Reglas de alerta — umbrales 30/15/7/0 dias, clasificacion
│   ├── seguridad-campo
│   │   ├── ats
│   │   │   ├── flujo.js  # Flujo ATS (Fase 3)
│   │   │   └── validaciones.js  # Validaciones ATS (Fase 3)
│   │   ├── revision-equipos
│   │   │   ├── flujo.js  # Flujo revision de equipos (Fase 3)
│   │   │   └── validaciones.js  # Validaciones revision de equipos (Fase 3)
│   │   └── riesgos-locativos
│   │       ├── flujo.js  # Flujo riesgos locativos (Fase 3)
│   │       └── validaciones.js  # Validaciones riesgos locativos (Fase 3)
│   └── vehiculos
│       ├── compartido
│       │   ├── baseFlujo.js  # Base compartida para maquinas de estado de flujos WhatsApp
│       │   ├── kilometraje.js  # Validacion y logica de kilometraje entre turnos
│       │   ├── navegacion.js  # Textos de navegacion — menu principal, 0=atras, 9=menu
│       │   └── validacionVisual.js  # Validacion de fotos via Gemini OCR
│       ├── inscripcion
│       │   ├── estado.js  # Estados del flujo de auto-registro de conductores
│       │   ├── flujo.js  # Flujo de inscripcion automatica de conductor nuevo
│       │   ├── mensajes.js  # Mensajes del flujo de inscripcion
│       │   └── validaciones.js  # Validaciones de inscripcion — cedula, telefono, nombre
│       ├── posoperacional
│       │   ├── cierre.js  # Cierre posoperacional — PDF y notificaciones
│       │   ├── estado.js  # Estados del flujo posoperacional
│       │   ├── flujo.js  # Maquina de estados del posoperacional WhatsApp
│       │   ├── mensajes.js  # Mensajes del posoperacional
│       │   └── validaciones.js  # Validaciones del posoperacional
│       ├── preoperacional
│       │   ├── cierre.js  # Cierre preoperacional — PDF, novedades, autorizaciones
│       │   ├── estado.js  # Estados del flujo preoperacional
│       │   ├── flujo.js  # Maquina de estados del preoperacional WhatsApp
│       │   ├── mensajes.js  # Mensajes y preguntas del preoperacional
│       │   └── validaciones.js  # Validaciones de respuestas del preoperacional
│       └── tanqueo
│           ├── cierre.js
│           ├── estado.js
│           ├── flujo.js  # Flujo de registro de combustible WhatsApp
│           ├── mensajes.js
│           └── validaciones.js  # Validaciones del tanqueo
├── public
│   ├── components
│   │   ├── badge.js  # Componente Badge — estados y alertas
│   │   ├── card.js  # Componente Card — stat cards del panel
│   │   ├── modal.js  # Componente Modal — detalle y formularios
│   │   ├── sidebar.js  # Sidebar dinamico con filtro por rol
│   │   ├── table.js  # Tabla reutilizable con ordenamiento y paginacion
│   │   └── toast.js  # Notificaciones toast
│   ├── css
│   │   ├── components.css
│   │   ├── layout.css
│   │   ├── theme-dark.css
│   │   ├── theme-light.css
│   │   └── variables.css
│   ├── js
│   │   ├── api.js  # Cliente API — fetch con JWT y manejo de errores
│   │   ├── app.js  # Inicializacion del panel — tema, sidebar, ruta inicial
│   │   ├── login-init.js
│   │   ├── login.js
│   │   ├── router.js  # Router SPA — navegacion sin recarga
│   │   ├── theme.js  # Toggle tema claro/oscuro
│   │   ├── transitions.js  # Transiciones suaves entre páginas — fade-out/fade-in, intercepta links internos
│   │   └── utils.js  # Helpers compartidos del frontend
│   ├── modules
│   │   ├── vehiculos
│   │   │   ├── alertas.js  # Modulo Alertas — documentos y autorizaciones pendientes
│   │   │   ├── conductores.js  # Modulo Conductores del panel
│   │   │   ├── flota.js  # Modulo Flota — gestion de vehiculos con drawer de detalle
│   │   │   └── preoperacionales.js  # Modulo Preoperacionales — lista, filtros, drawer con autorizacion
│   │   ├── dashboard.js  # Modulo Dashboard — 4 pestanas, Indice de Seguridad Operativa
│   │   ├── posoperacionales.js  # Modulo Posoperacionales del panel
│   │   ├── sedes.js  # Modulo Sedes — gestion multi-sede
│   │   ├── tanqueos.js  # Modulo Tanqueos del panel
│   │   └── usuarios.js  # Modulo Usuarios y roles del panel
│   ├── index.html  # Panel de administracion
│   ├── landing.html  # Landing page publica
│   └── login.html  # Pagina de autenticacion
├── rutas
│   ├── alertas.js
│   ├── auth.js  # Rutas de autenticacion — /auth/login, /auth/me, /auth/logout
│   ├── autorizaciones.js
│   ├── conductores.js
│   ├── dashboard.js  # Rutas del dashboard operativo
│   ├── preoperacionales.js
│   ├── tanqueos.js
│   └── vehiculos.js
├── scripts
│   └── update-architecture.js  # Auto-genera folder structure y dependencias en ARCHITECTURE.md
├── servicios
│   ├── pdf
│   │   ├── base.js  # Motor PDF compartido — nunca duplicar logica aqui
│   │   ├── posoperacional.js  # Generador PDF posoperacional
│   │   └── preoperacional.js  # Generador PDF preoperacional
│   ├── logo.js  # Logo CERO en base64 para PDFs
│   ├── ocr.js  # OCR via Gemini — lectura de placas y odometros
│   ├── sesiones.js  # Sesiones WhatsApp — Map en memoria + persistencia Supabase + cola serializada anti race condition
│   └── storage.js  # Supabase Storage — subida de fotos y PDFs, signed URLs
├── ARCHITECTURE.md  # Fuente de verdad del proyecto — leer antes de cada sesion
├── eslint.config.cjs  # ESLint — compatible con CommonJS
├── index.js  # Entrada Express — helmet, rutas, cron, endpoints API
└── package.json
```

## Dependencies

| Package | Version |
|---|---|
| `@google/generative-ai` | ^0.21.0 |
| `@supabase/supabase-js` | ^2.48.0 |
| `axios` | ^1.7.9 |
| `bcryptjs` | ^3.0.3 |
| `express` | ^4.21.2 |
| `helmet` | ^8.1.0 |
| `jsonwebtoken` | ^9.0.3 |
| `node-cron` | ^3.0.3 |
| `pdfkit` | ^0.15.1 |
| `twilio` | ^5.3.5 |

### Dev dependencies

| Package | Version |
|---|---|
| `@eslint/js` | ^10.0.1 |
| `eslint` | ^10.2.0 |
| `globals` | ^17.4.0 |

<!-- AUTO-GENERATED END -->
