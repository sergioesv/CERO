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
<!-- Esta sección se regenera automáticamente en cada push a desarrollo -->

## Folder structure

_Se genera en el siguiente push_

## Dependencies

_Se genera en el siguiente push_

<!-- AUTO-GENERATED END -->
