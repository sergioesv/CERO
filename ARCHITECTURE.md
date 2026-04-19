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
| 2 — Dashboard & admin panel (Flota, Preop, Alertas, Conductores, Posop, Tanqueos, Sedes, Usuarios) | 🔄 IN PROGRESS |
| 3 — Personnel safety (harness, ladder, ATS) | ⏳ FUTURE |

---

## Database — key tables

| Table | Purpose |
|---|---|
| `vehiculos` | Fleet — plate, type, docs, status |
| `conductores` | Drivers — license, category, active |
| `preoperacionales` | Pre-shift inspections |
| `posoperacionales` | Post-shift inspections |
| `tanqueos` | Fueling records |
| `activos` | Assets (vehicles) for dashboard |
| `autorizaciones_novedad` | Supervisor authorizations |
| `empresas / sedes / usuarios_panel` | Multi-company schema with audit fields |

**Hierarchy:** Platform → Empresa → Sede → Usuario. Conductors operate across any sede.

---

## WhatsApp flow architecture

Each module follows a class-based pattern extending `FlujoBase`:

```
modulos/vehiculos/compartido/
├── baseFlujo.js     # Base class — Twilio validation, concurrency lock,
│                    #   global nav (0=back, 9=menu), shared plate/odometer states
├── twiml.js         # responderTwiml, escaparXml, firmaTwilioValida (single source)
├── iniciadorFlujo.js # Factory — plate OCR + odometer OCR handlers
├── kilometraje.js   # Shared km validation logic
└── navegacion.js    # Menu text, esAtras(), esMenu(), PIE_NAV

modulos/vehiculos/<module>/
├── flujo.js         # Extends FlujoBase — only module-specific states
├── estado.js        # State constants + session management
├── mensajes.js      # All user-facing message templates
├── validaciones.js  # Input validation (uses shared twiml.js)
└── cierre.js        # Session close + PDF + notifications
```

**UX rule:** max 2-minute flow. Single-number responses. `0` = back, `9` = main menu.

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

Routes: `/` landing · `/login` auth · `/panel` admin panel

---

## Security — before production

- [ ] RLS enabled in Supabase
- [ ] Twilio webhook signature validation
- [ ] Custom domain configured
- [ ] All routes behind `verificarPermiso` middleware
- [ ] No credentials in source code
- [ ] Migrate onclick inline to addEventListener (CSP strict)
- [x] `.env` in `.gitignore` ✅
- [x] Helmet active ✅
- [x] Trust proxy = 1 (Railway) ✅
- [x] Timing attack login fixed ✅
- [x] bcrypt in all password flows ✅

---

## Decision log (key decisions only)

| Date | Decision | Reason |
|---|---|---|
| 18/04/2026 | Refactor flujos WhatsApp a clases (FlujoBase + herencia) | Eliminar código duplicado masivo (~50% reducción), separar estados compartidos de placa/odómetro en clase base |
| 18/04/2026 | Centralizar TwiML en `compartido/twiml.js` | responderTwiml y escaparXml estaban copiados en 4 archivos |
| 18/04/2026 | Factory pattern `iniciadorFlujo.js` para placa/km | Una sola implementación de OCR placa y odómetro para los 3 flujos |
| 17/04/2026 | Rebranding a dialk — eliminar EDEMSA | Riesgo legal — EDEMSA no es cliente firmado |
| 15/04/2026 | Frontend en 4 objetos (API/Logic/Render/Module) | Anti-XSS, separación de responsabilidades |
| 14/04/2026 | Tanqueo v3 — OCR factura con score/tier/fallback | Validación cruzada 4 campos, antifraude |
| 14/04/2026 | Refactor index.js — 925 → ~190 líneas | 6 archivos de rutas extraídos |
| 10/04/2026 | ARCHITECTURE.md como fuente de verdad | Reemplaza archivos de sesión de diseño |

---

## Cursor rules

`rules.md` siempre activo. Para tareas específicas:

| Tipo de tarea | Archivo adicional |
|---|---|
| Backend (rutas, data, servicios) | `.cursor/rules-backend.md` |
| Frontend (public, CSS, HTML) | `.cursor/rules-frontend.md` |
| WhatsApp (modulos/vehiculos, sesiones) | `.cursor/rules-whatsapp.md` |

<!-- AUTO-GENERATED START — no editar manualmente -->
<!-- Última actualización: 2026-04-18 -->

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
│   │   ├── ats/
│   │   ├── revision-equipos/
│   │   └── riesgos-locativos/
│   └── vehiculos
│       ├── compartido
│       │   ├── baseFlujo.js  # Clase base FlujoBase — estados compartidos placa/odómetro
│       │   ├── iniciadorFlujo.js  # Factory — OCR placa + odómetro reutilizable
│       │   ├── kilometraje.js  # Validacion de kilometraje entre turnos
│       │   ├── navegacion.js  # Menu principal, 0=atras, 9=menu
│       │   ├── twiml.js  # TwiML compartido — responderTwiml, escaparXml, firmaTwilioValida
│       │   └── validacionVisual.js  # Validacion de fotos via Gemini OCR
│       ├── inscripcion
│       │   ├── estado.js / flujo.js / mensajes.js / validaciones.js
│       ├── posoperacional
│       │   ├── cierre.js / estado.js / flujo.js / mensajes.js / validaciones.js
│       ├── preoperacional
│       │   ├── cierre.js / estado.js / flujo.js / interpretacion.js / mensajes.js / validaciones.js
│       └── tanqueo
│           ├── cierre.js / estado.js / flujo.js / mensajes.js / validaciones.js
├── public
│   ├── components/  # badge, card, drawer, filters, modal, sidebar, table, toast
│   ├── css/  # variables, layout, components, themes
│   ├── js/  # api, app, router, theme, utils, login, transitions
│   ├── modules/  # dashboard, flota, preoperacionales, posoperacionales, tanqueos, alertas, conductores, sedes, usuarios
│   ├── index.html / landing.html / login.html
├── rutas
│   ├── alertas.js / auth.js / autorizaciones.js / conductores.js
│   ├── dashboard.js / preoperacionales.js / roles.js / tanqueos.js
│   ├── usuarios.js / usuariosRoles.js / vehiculos.js
├── scripts
│   ├── test-flujos.js  # Tests de carga y estructura de flujos WhatsApp
│   ├── test-pdf.js
│   └── update-architecture.js
├── servicios
│   ├── pdf/  # GeneradorPDFBase, Preoperacional, Posoperacional, base, logo
│   ├── ocr.js / passwords.js / sesiones.js / storage.js
├── ARCHITECTURE.md
├── index.js  # Entrada Express — helmet, rutas, cron
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

<!-- AUTO-GENERATED END -->
