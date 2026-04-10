# CERO — Architecture

Field operations management SaaS via WhatsApp + AI.
**Tagline:** cero papel, cero accidentes
**Regulatory framework:** PESV (Colombia road safety)
**Deploy:** [cero-production.up.railway.app](https://cero-production.up.railway.app)

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js — CommonJS (`require`) |
| Database | Supabase — PostgreSQL + Storage (São Paulo) |
| Deploy | Railway — auto-deploy from `desarrollo` branch |
| WhatsApp | Twilio — webhook in/out |
| AI | Google Gemini API — OCR + interpretation (invoke only when it adds value) |
| PDF | PDFKit |
| Auth | JWT + bcrypt — 8h expiration |
| Frontend | HTML + CSS + JS — no frameworks, served by Express |
| Charts | Chart.js |

**Rule:** never swap a technology without a documented technical reason.

---

## Repository

- **Repo:** `sergioesv/CERO` (private)
- **Main branch:** `desarrollo`
- **Feature branches:** `claude/<description>` — auto-merged to `desarrollo` via GitHub Actions
- **Rule:** commit directly to `desarrollo` for fixes; new branch only for complete new modules

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
- 2.1 Web admin panel — Flota, Preoperacionales, Alertas complete; Conductores, Posoperacionales, Tanqueos pending
- 2.2 Operational dashboard — complete
- 2.3 History and reports — pending
- 2.4 Power BI integration — future

### Phase 3 — Personnel safety ⏳ FUTURE
- Harness inspection, ladder inspection, ATS

---

## Folder structure

```
/
├── index.js                        # Express entry point
├── routes/                         # API routes + webhook
├── data/                           # Supabase access (one function per operation)
├── modulos/
│   └── vehiculos/
│       ├── preoperacional/         # flujo.js estado.js mensajes.js validaciones.js cierre.js
│       ├── posoperacional/
│       └── tanqueo/
├── servicios/
│   ├── pdf/
│   │   ├── base.js                 # Shared PDF engine — never duplicate
│   │   ├── preoperacional.js
│   │   └── posoperacional.js
│   └── twilio.js
├── compartido/                     # Cross-cutting utilities
├── public/                         # Static admin panel
│   ├── css/                        # variables.css theme-*.css components.css layout.css
│   ├── js/                         # app.js api.js router.js theme.js utils.js
│   ├── components/                 # sidebar.js table.js badge.js card.js modal.js toast.js
│   └── modules/                    # One subdirectory per panel module
├── .cursor/
│   └── rules.md                    # Cursor coding rules
└── ARCHITECTURE.md                 # This file
```

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
├── flujo.js         # State machine — handles incoming messages
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
  render()       // Mount HTML into main container
  cargarDatos()  // Fetch from API and populate
  renderStats()  // Update stat cards
  renderTabla()  // Render reusable Table component
}
```

Reusable components: `Table`, `Badge`, `Card`, `Modal`, `Toast`, `Sidebar`
Detail view: lateral drawer (not centered modal)
Themes: light/dark via CSS variables — no JS for colors

---

## Security checklist — before production

- [ ] RLS enabled in Supabase
- [ ] Twilio webhook signature validation (`X-Twilio-Signature`)
- [ ] Custom domain purchased and configured
- [ ] All routes behind `verificarPermiso` middleware
- [ ] No credentials in source code
- [ ] `.env` in `.gitignore`
- [ ] Signed URL regeneration at query time (Supabase Storage)

---

## Design sessions

Decisions are documented in versioned design sessions:
`CERO_Sesion_Diseno_vNN_DDMMYYYY.txt`

**Current version: v19 (10/04/2026)**

Before writing any code, read the latest session file.
If a session file contradicts this document, the session file wins — it is more recent.

<!-- AUTO-GENERATED START — no editar manualmente -->
<!-- Última actualización: 2026-04-10 -->

## Folder structure

```
├── canales
│   ├── dashboard.js
│   └── whatsapp.js
├── config
│   └── config.js
├── data
│   ├── activos.js
│   ├── alertas.js
│   ├── ats.js
│   ├── autorizaciones.js
│   ├── dashboard.js
│   ├── inspecciones.js
│   ├── permisos.js
│   ├── posoperacionales.js
│   ├── revisionesEquipos.js
│   ├── riesgosLocativos.js
│   ├── tanqueos.js
│   └── vehiculos.js
├── middlewares
│   └── auth.js
├── modulos
│   ├── alertas
│   │   ├── notificador.js
│   │   └── reglas.js
│   ├── seguridad-campo
│   │   ├── ats
│   │   │   ├── flujo.js
│   │   │   └── validaciones.js
│   │   ├── revision-equipos
│   │   │   ├── flujo.js
│   │   │   └── validaciones.js
│   │   └── riesgos-locativos
│   │       ├── flujo.js
│   │       └── validaciones.js
│   └── vehiculos
│       ├── compartido
│       │   ├── baseFlujo.js
│       │   ├── kilometraje.js
│       │   ├── navegacion.js
│       │   └── validacionVisual.js
│       ├── inscripcion
│       │   ├── estado.js
│       │   ├── flujo.js
│       │   ├── mensajes.js
│       │   └── validaciones.js
│       ├── posoperacional
│       │   ├── cierre.js
│       │   ├── estado.js
│       │   ├── flujo.js
│       │   ├── mensajes.js
│       │   └── validaciones.js
│       ├── preoperacional
│       │   ├── cierre.js
│       │   ├── estado.js
│       │   ├── flujo.js
│       │   ├── mensajes.js
│       │   └── validaciones.js
│       └── tanqueo
│           ├── flujo.js
│           └── validaciones.js
├── public
│   ├── components
│   │   ├── badge.js
│   │   ├── card.js
│   │   ├── modal.js
│   │   ├── sidebar.js
│   │   ├── table.js
│   │   └── toast.js
│   ├── css
│   │   ├── components.css
│   │   ├── layout.css
│   │   ├── theme-dark.css
│   │   ├── theme-light.css
│   │   └── variables.css
│   ├── js
│   │   ├── api.js
│   │   ├── app.js
│   │   ├── router.js
│   │   ├── theme.js
│   │   └── utils.js
│   ├── modules
│   │   ├── vehiculos
│   │   │   ├── alertas.js
│   │   │   ├── conductores.js
│   │   │   ├── flota.js
│   │   │   └── preoperacionales.js
│   │   ├── dashboard.js
│   │   ├── posoperacionales.js
│   │   ├── sedes.js
│   │   ├── tanqueos.js
│   │   └── usuarios.js
│   ├── index.html
│   ├── landing.html
│   └── login.html
├── rutas
│   ├── auth.js
│   └── dashboard.js
├── scripts
│   └── update-architecture.js
├── servicios
│   ├── pdf
│   │   ├── base.js
│   │   ├── posoperacional.js
│   │   └── preoperacional.js
│   ├── logo.js
│   ├── ocr.js
│   ├── sesiones.js
│   └── storage.js
├── ARCHITECTURE.md
├── cero_dashboard_mockup_v16.html
├── CERO_Sesion_Diseno_v15_23032026.txt
├── CERO_Sesion_Diseno_v16_27032026.txt
├── CERO_Sesion_Diseno_v17_27032026.txt
├── eslint.config.cjs
├── index.js
├── package-lock.json
├── package.json
└── README.md
```

## Dependencies

| Package | Version |
|---|---|
| `@google/generative-ai` | ^0.21.0 |
| `@supabase/supabase-js` | ^2.48.0 |
| `axios` | ^1.7.9 |
| `bcryptjs` | ^3.0.3 |
| `express` | ^4.21.2 |
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
