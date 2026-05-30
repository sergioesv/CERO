# CERO — Architecture

Field operations management SaaS via WhatsApp + AI.
**Tagline:** cero papel, cero accidentes
**Regulatory framework:** PESV (Colombia road safety)
**Deploy:** [cero-production.up.railway.app](https://cero-production.up.railway.app)

> **Empresa:** dialk S.A.S. (en constitución). **Producto:** CERO.

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

## Repository & CI/CD

- **Repo:** `sergioesv/CERO` (private) · **Main branch:** `desarrollo`
- **Commit rule:** directly to `desarrollo` for fixes; new branch for complete new modules
- **Workflows:** `backend.yml`, `frontend.yml`, `security.yml`, `update-architecture.yml` — all must pass before merge

---

## Project phases

| Phase | Status |
|---|---|
| 1 — Vehicle control (WhatsApp inspections, fueling, alerts, registration, authorization v12) | ✅ COMPLETE |
| 2 — Dashboard & admin panel (Flota, Preop, Alertas, Conductores, Posop, Tanqueos, Sedes, Usuarios) | ✅ COMPLETE |
| 3 — Personnel safety (harness, ladder, ATS) | ⏳ FUTURE |

---

## Database — key tables (v26)

> **v26 migration (19/04/2026):** tabla `vehiculos` eliminada. Todo opera sobre `activos`.
> Inspecciones usan `activo_id` (UUID) en lugar de `vehiculo_placa` (string).
> Respuestas de inspección son JSONB dinámico, no columnas hardcodeadas.

| Table | Purpose |
|---|---|
| `activos` | Assets — plate, type, docs (JSONB), status, km |
| `tipos_activo` | Asset types — vehiculo_liviano, grua, moto, maquina_estatica |
| `plantillas_inspeccion` | Dynamic inspection templates per asset type |
| `plantilla_grupos` | Groups within a template |
| `plantilla_items` | Items within a group — with sub-questions |
| `conductores` | Drivers — license, category, active |
| `preoperacionales` | Pre-shift inspections — activo_id, respuestas JSONB, plantilla_id |
| `posoperacionales` | Post-shift inspections — activo_id, plantilla_id |
| `tanqueos` | Fueling records — activo_id, OCR score/tier, validation |
| `autorizaciones_novedad` | Supervisor authorizations — activo_id |
| `historial_estado_activo` | Asset state timeline — cambiado_por UUID or null |
| `empresas / sedes / usuarios_panel` | Multi-company schema with audit fields |

**Hierarchy:** Platform → Empresa → Sede → Usuario. Conductors operate across any sede.

**Key rules:**
- `activos.documentos` is JSONB — always merge, never overwrite: `{ soat_vencimiento, tecnomecanica_vencimiento }`
- `activos.datos` is JSONB — vehicle metadata: `{ marca, modelo, tipo_vehiculo, anio }`
- API GET `/api/activos` flattens both JSONB fields into root-level properties for frontend consumption
- `historial_estado_activo.cambiado_por` must be a valid UUID or NULL — never a plain string
- `plantillas.cargar()` returns a safe default `{ config: { medicion: 'km' }, grupos: [] }` when no template exists

---

## WhatsApp flow architecture

Each module follows a class-based pattern extending `FlujoBase`:

```
modulos/inspecciones/compartido/
├── baseFlujo.js      # Base class — Twilio validation, concurrency lock,
│                     #   global nav (0=back, 9=menu), shared plate/odometer states
├── twiml.js          # responderTwiml, escaparXml, firmaTwilioValida (single source)
├── iniciadorFlujo.js # Factory — plate OCR + odometer OCR handlers
├── kilometraje.js    # Shared km validation logic
└── navegacion.js     # Menu text, esAtras(), esMenu(), PIE_NAV

modulos/inspecciones/<module>/
├── flujo.js          # Extends FlujoBase — only module-specific states
├── estado.js         # State constants + session management
├── mensajes.js       # All user-facing message templates
├── validaciones.js   # Input validation (uses shared twiml.js)
└── cierre.js         # Session close + PDF + notifications
```

**Critical pattern — state isolation:**
When `onExitoPlaca` is called, `reiniciarDatosOperativos()` resets `sesion.vehiculo`
and `sesion.conductor` to null. Always save and restore both before/after:

```js
onExitoPlaca: async function(sesion) {
  var vehiculo = sesion.vehiculo;
  var conductor = sesion.conductor;
  estadoModulo.reiniciarDatosOperativos(sesion);
  sesion.vehiculo = vehiculo;   // restore — reiniciar wipes this
  sesion.conductor = conductor; // restore — reiniciar wipes this
  // ... rest of logic
}
```

**Critical pattern — shared odometer flow:**
`preoperacional`, `posoperacional`, and `tanqueo` share odometer handling through
`modulos/inspecciones/compartido/baseFlujo.js` + `modulos/inspecciones/compartido/kilometraje.js`.
Flow children do not intercept `ODOMETRO_CONFIRMACION` / `ODOMETRO_MANUAL` locally.
They delegate odometer handling to `procesarEstadoCompartido()` and define only what
happens after odometer confirmation through extension points such as
`onKilometrajeConfirmado` and `politicaKilometraje`.

```js
var flujo = new FlujoBase({
  // ...
  onKilometrajeConfirmado: async function(datosKm) {
    return resolverKilometrajeConfirmadoModulo(datosKm);
  },
  politicaKilometraje: crearPoliticaKilometrajeModulo()
});
```

**UX rule:** max 2-minute flow. Single-number responses. `0` = back, `9` = main menu.

### Session lifecycle — timeout + recoverable window

Every session has two horizons, both defined in `config/config.js`:

| Horizon | Constant | Default | What happens |
|---|---|---|---|
| Inactivity timeout (per flow) | `TIMEOUT_FLUJO_MS[tipo]` | 30 min (10 min for tanqueo) | Session marked `expirada = true`, data preserved, lock freed |
| Recovery window | `TIMEOUT_RECUPERACION_MS` | 5 min | Additional time to resume; after this, session is purged |

When a user sends a message and `sesion.expirada === true`, `canales/whatsapp.js`
intercepts **before** routing to the flow and offers:

- `1` → `reactivarSesion(telefono)` clears the flag and preserves every field.
- `2` → `eliminarSesion(telefono)` + main menu.
- `9` / `MENU` / `INICIO` / `CANCELAR` → handled by the global intercept (same as `2`).
- Anything else → repeats the recovery message with `textoSesionExpirada(sesion)`.

**Not recoverable:** `inscripcion` sessions (few steps, cleaner to restart) and
sessions still in `INICIO` (no progress worth preserving). Both are purged
directly on timeout.

**Media retention (fotos):** session photos are Twilio CDN URLs, not uploaded to
Supabase Storage. Only the generated PDF is uploaded at close. Twilio purges
media automatically ~72h after the inbound message, so abandoned sessions do
not create orphans in our infra. If explicit deletion is ever needed, use the
Twilio REST API (`DELETE /Accounts/{sid}/Messages/{sid}/Media/{sid}`); no
background job exists today.

**Step labels:** `navegacion.js` exports a flat `LABEL_PASO` map from `sesion.estado`
to human text for the recovery message. Keep this map synced with each module's
`ESTADOS` when adding new states.

---

## Frontend pattern

Each panel module splits into 4 objects:

```js
const ModuleAPI    = { ... }  // Fetch from API
const ModuleLogic  = { ... }  // Business logic, data transforms
const ModuleRender = { ... }  // HTML generation (strict Utils.escaparHTML)
const Module = {
  render()       // Orchestrate Drawer, Filters, Table
  cargarDatos()  // Coordinate API → Logic → Render
}
```

**Critical rules:**
- API responses are flattened — read `row.soat_vencimiento`, NOT `row.documentos?.soat_vencimiento`
- API PUT `/api/activos/:id` sends flat fields: `{ marca, soat_vencimiento, tecnomecanica_vencimiento }`, NOT `{ datos: {}, documentos: {} }`
- State comparisons are case-insensitive: `datos.estado.toUpperCase() !== 'OK'`
- `cambiado_por` must pass UUID validation before insert — strings like `'panel'` become `null`

Routes: `/` landing · `/login` auth · `/panel` admin panel

---

## SOLID principles applied to CERO

These principles govern every new file, module, and function in this codebase.

**S — Single Responsibility**
Each file has one job. `flujo.js` orchestrates state. `mensajes.js` formats text.
`cierre.js` persists data. `estado.js` defines constants. Never mix these concerns.
If a function does two things, split it.

**O — Open/Closed**
Add new inspection types by inserting rows in `plantillas_inspeccion`, `plantilla_grupos`,
`plantilla_items` — zero code changes. The engine reads templates dynamically.
New WhatsApp modules extend `FlujoBase`, never modify it.

**L — Liskov Substitution**
Any module extending `FlujoBase` must honor the base contract:
- `procesarEstado(res, sesion, telefono, mensaje, msgUpper, mediaUrls)` must return a TwiML response
- `inicializarSesion(sesion)` must set `sesion.tipo` and `sesion.estado`
- `manejarAtras(res, sesion)` must return a TwiML response for every valid state

**I — Interface Segregation**
`data/` files expose only what their consumers need. `data/inspecciones.js` handles
shared queries. `data/activos.js` handles asset state. Never import all of `data/activos.js`
when you only need `obtenerActivoIdPorPlaca`.

**D — Dependency Inversion**
`cierre.js` depends on `data/` abstractions, not on Supabase directly.
`flujo.js` depends on `servicios/plantillas.js`, not on `data/plantillas.js` directly.
Route handlers depend on `data/` functions, not on raw `supabase` queries.
Exception: `rutas/activos.js` uses supabase directly for simple CRUD — acceptable
until a `data/activos.js` abstraction covers all cases.

---

## Multi-tenant rules (critical before second client)

The architecture supports multiple companies. Before onboarding a second client:

1. Every API endpoint must filter by `empresa_id` or `sede_id` from `req.usuario`
2. `superadmin_plataforma` bypasses filters — sees all companies
3. `admin_empresa` sees only their company's data
4. RLS must be enabled in Supabase as defense-in-depth
5. Test: log in as company B admin — must NOT see company A data

Current gap: several dashboard queries do not filter by empresa_id. Audit required before client 2.

---

## Security — before production

- [ ] RLS enabled in Supabase
- [ ] Twilio webhook signature validation
- [ ] Custom domain configured
- [ ] All routes behind `verificarPermiso` middleware
- [ ] No credentials in source code
- [ ] Migrate onclick inline to addEventListener (CSP strict)
- [ ] Audit all dashboard/panel queries for empresa_id filtering (multi-tenant)
- [x] `.env` in `.gitignore` ✅
- [x] Helmet active ✅
- [x] Trust proxy = 1 (Railway) ✅
- [x] Timing attack login fixed ✅
- [x] bcrypt in all password flows ✅
- [x] UUID validation on `cambiado_por` before historial insert ✅

---

## Pending before pilot

| Item | Priority | Notes |
|---|---|---|
| Plantilla grúa (WDH689) | HIGH | Sin plantilla → preop falla para ese activo |
| Limpieza BD y datos demo neutros | HIGH | Datos actuales son de prueba con nombres reales |
| Ciclo completo conductor real | HIGH | Preop + posop + tanqueo mismo día verificado en panel |
| RLS Supabase | MEDIUM | Antes de segundo cliente |
| Audit empresa_id en queries | MEDIUM | Antes de segundo cliente |
| Fix 10: sesiones WhatsApp race condition | MEDIUM | Necesario antes de flotas grandes |
| Dominio propio | LOW | Antes de firma de contrato |

---

## Agent rules

Agentes en `.claude/agents/` — invocar con "Usa el agente cero-orchestrator".
El orquestador pasa las reglas de dominio a los subagentes según el área tocada:

| Dominio | Archivos | Rules a usar |
|---|---|---|
| Backend | `rutas/`, `data/`, `servicios/`, `middlewares/` | `.cursor/rules-backend.md` |
| Frontend | `public/` | `.cursor/rules-frontend.md` |
| WhatsApp | `modulos/`, `canales/whatsapp.js`, `servicios/sesiones.js` | `.cursor/rules-whatsapp.md` |

Decisiones arquitectónicas: `docs/DECISION_LOG.md` — actualizar en el mismo commit del cambio.

<!-- AUTO-GENERATED START — no editar manualmente -->
<!-- Última actualización: 2026-05-30 -->

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
│   ├── autorizaciones.js  # Autorizaciones de novedades — pendientes, resueltas, decidir
│   ├── conductores.js
│   ├── dashboard.js  # Dashboard — consultas agregadas para el panel ejecutivo
│   ├── inspecciones.js  # Inspecciones — consultas compartidas entre modulos
│   ├── permisos.js  # Permisos — roles canonicos, seed de permisos base, classifyRoleName
│   ├── plantillas.js
│   ├── posoperacionales.js  # Posoperacionales — registro de cierre de turno
│   ├── tanqueos.js  # Tanqueos — registro de combustible
│   └── usuarios.js
├── docs
│   ├── adr
│   │   ├── 0001-twiml-compartido-y-data-conductores.md
│   │   └── 0002-rename-permiso-vehiculos-a-activos.md
│   ├── canon
│   │   ├── CERO_ARCHITECTURE_RULES.md
│   │   ├── CERO_CANON.md
│   │   ├── CERO_DATABASE_CONTRACT.md
│   │   └── CERO_RELEASE_CHECKLIST.md
│   ├── DECISION_LOG.md
│   └── HANDOFF_SOLID.md
├── middlewares
│   └── auth.js  # JWT verificarToken + verificarPermiso con roles canonicos
├── modulos
│   ├── alertas
│   │   ├── notificador.js  # Cron 6:00 AM — envia alertas de documentos por WhatsApp
│   │   └── reglas.js  # Reglas de alerta — umbrales 30/15/7/0 dias, clasificacion
│   ├── compartido
│   │   └── twiml.js
│   ├── inscripcion
│   │   ├── estado.js  # Estados del flujo de auto-registro de conductores
│   │   ├── flujo.js  # Flujo de inscripcion automatica de conductor nuevo
│   │   ├── mensajes.js  # Mensajes del flujo de inscripcion
│   │   └── validaciones.js  # Validaciones de inscripcion — cedula, telefono, nombre
│   ├── inspecciones
│   │   ├── compartido
│   │   │   ├── baseFlujo.js  # Base compartida para maquinas de estado de flujos WhatsApp
│   │   │   ├── iniciadorFlujo.js  # Iniciador de flujo — OCR placa y odometro
│   │   │   ├── interpretadorNovedades.js
│   │   │   ├── kilometraje.js  # Validacion y logica de kilometraje entre turnos
│   │   │   ├── navegacion.js  # Textos de navegacion — menu principal, 0=atras, 9=menu
│   │   │   ├── twiml.js  # TwiML utilidades — respuestas WhatsApp
│   │   │   └── validacionVisual.js  # Validacion de fotos via Gemini OCR
│   │   ├── posoperacional
│   │   │   ├── cierre.js  # Cierre posoperacional — PDF y notificaciones
│   │   │   ├── estado.js  # Estados del flujo posoperacional
│   │   │   ├── flujo.js  # Maquina de estados del posoperacional WhatsApp
│   │   │   ├── mensajes.js  # Mensajes del posoperacional
│   │   │   └── validaciones.js  # Validaciones del posoperacional
│   │   └── preoperacional
│   │       ├── cierre.js  # Cierre preoperacional — PDF, novedades, autorizaciones
│   │       ├── estado.js  # Estados del flujo preoperacional
│   │       ├── flujo.js  # Maquina de estados del preoperacional WhatsApp
│   │       ├── mensajes.js  # Mensajes y preguntas del preoperacional
│   │       └── validaciones.js  # Validaciones de respuestas del preoperacional
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
│   └── tanqueo
│       ├── cierre.js  # Cierre tanqueo — registro en DB y PDF
│       ├── estado.js  # Estados del flujo de tanqueo
│       ├── flujo.js  # Flujo de registro de combustible WhatsApp
│       ├── mensajes.js  # Mensajes del flujo de tanqueo
│       └── validaciones.js  # Validaciones del tanqueo
├── public
│   ├── components
│   │   ├── badge.js  # Componente Badge — estados y alertas
│   │   ├── card.js  # Componente Card — stat cards del panel
│   │   ├── drawer.js
│   │   ├── filters.js
│   │   ├── modal.js  # Componente Modal — detalle y formularios
│   │   ├── sidebar.js  # Sidebar dinamico con filtro por rol
│   │   ├── table.js  # Tabla reutilizable con ordenamiento y paginacion
│   │   └── toast.js  # Notificaciones toast
│   ├── css
│   │   ├── components.css
│   │   ├── landing.css
│   │   ├── layout.css
│   │   ├── theme-dark.css
│   │   ├── theme-light.css
│   │   └── variables.css
│   ├── files
│   │   └── preop_AAA123_demo.pdf
│   ├── img
│   │   └── landing
│   │       ├── odometro-aaa123.jpg
│   │       └── placa-aaa123.jpg
│   ├── js
│   │   ├── landing
│   │   │   ├── chat-demo.js
│   │   │   └── landing.js
│   │   ├── api.js  # Cliente API — fetch con JWT y manejo de errores
│   │   ├── app.js  # Inicializacion del panel — tema, sidebar, ruta inicial
│   │   ├── login-init.js
│   │   ├── login.js
│   │   ├── router.js  # Router SPA — navegacion sin recarga
│   │   ├── theme.js  # Toggle tema claro/oscuro
│   │   ├── transitions.js  # Transiciones suaves entre páginas — fade-out/fade-in, intercepta links internos
│   │   └── utils.js  # Helpers compartidos del frontend
│   ├── modules
│   │   ├── alertas.js  # Modulo Alertas — documentos y autorizaciones pendientes
│   │   ├── conductores.js  # Modulo Conductores del panel
│   │   ├── dashboard.js  # Modulo Dashboard — 4 pestanas, Indice de Seguridad Operativa
│   │   ├── flota.js  # Modulo Flota — gestion de activos con drawer de detalle
│   │   ├── metricas.js
│   │   ├── plantillas.js
│   │   ├── posoperacionales.js  # Modulo Posoperacionales del panel
│   │   ├── preoperacionales.js  # Modulo Preoperacionales — lista, filtros, drawer con autorizacion
│   │   ├── sedes.js  # Modulo Sedes — gestion multi-sede
│   │   ├── tanqueos.js  # Modulo Tanqueos del panel
│   │   └── usuarios.js  # Modulo Usuarios y roles del panel
│   ├── index.html  # Panel de administracion
│   ├── landing.html  # Landing page publica
│   └── login.html  # Pagina de autenticacion
├── rutas
│   ├── activos.js
│   ├── alertas.js
│   ├── auth.js  # Rutas de autenticacion — /auth/login, /auth/me, /auth/logout
│   ├── autorizaciones.js
│   ├── conductores.js
│   ├── dashboard.js  # Rutas del dashboard operativo
│   ├── plantillas.js
│   ├── preoperacionales.js
│   ├── roles.js
│   ├── tanqueos.js
│   ├── usuarios.js
│   └── usuariosRoles.js
├── scripts
│   ├── inspect_db.js
│   ├── seed-templates.js
│   ├── test-flujos.js
│   ├── test-pdf.js
│   └── update-architecture.js  # Auto-genera folder structure y dependencias en ARCHITECTURE.md
├── servicios
│   ├── pdf
│   │   ├── base.js  # Motor PDF compartido — nunca duplicar logica aqui
│   │   ├── GeneradorPDFBase.js
│   │   ├── GeneradorPDFPosoperacional.js
│   │   ├── GeneradorPDFPreoperacional.js
│   │   ├── posoperacional.js  # Generador PDF posoperacional
│   │   └── preoperacional.js  # Generador PDF preoperacional
│   ├── logo.js  # Logo CERO en base64 para PDFs
│   ├── ocr.js  # OCR via Gemini — lectura de placas y odometros
│   ├── passwords.js
│   ├── plantillas.js
│   ├── sesiones.js  # Sesiones WhatsApp — Map en memoria + persistencia Supabase + cola serializada anti race condition
│   └── storage.js  # Supabase Storage — subida de fotos y PDFs, signed URLs
├── supabase
│   └── migrations
│       └── 20260518000001_schema_canonico_v2.sql
├── tests
│   ├── __mocks__
│   │   └── supabase.js
│   ├── data
│   │   ├── autorizaciones.test.js
│   │   └── permisos.test.js
│   ├── helpers
│   │   └── twilio.js
│   ├── modulos
│   │   ├── inscripcion
│   │   │   ├── estado.test.js
│   │   │   ├── flujo.test.js
│   │   │   └── validaciones.test.js
│   │   └── inspecciones
│   │       ├── compartido
│   │       │   └── baseFlujo.test.js
│   │       └── preoperacional
│   │           └── cierre.test.js
│   ├── rutas
│   │   └── activos.test.js
│   └── servicios
│       └── ocr.novedades.test.js
├── ARCHITECTURE.md  # Fuente de verdad del proyecto — leer antes de cada sesion
├── cero_powersell.ps1
├── CLAUDE.md
├── eslint.config.cjs  # ESLint — compatible con CommonJS
├── index.js  # Entrada Express — helmet, rutas, cron, endpoints API
├── jest.config.js
└── package.json
```

## Dependencies

| Package | Version |
|---|---|
| `@google/generative-ai` | ^0.21.0 |
| `@supabase/supabase-js` | ^2.48.0 |
| `axios` | ^1.7.9 |
| `bcryptjs` | ^3.0.3 |
| `dotenv` | ^17.4.2 |
| `express` | ^4.21.2 |
| `express-rate-limit` | ^8.3.2 |
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
| `jest` | ^30.4.2 |

<!-- AUTO-GENERATED END -->
