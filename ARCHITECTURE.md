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
- 2.1 Web admin panel — Flota, Preoperacionales, Alertas, Conductores complete; Posoperacionales, Tanqueos pending
- 2.2 Operational dashboard — complete
- 2.3 History and reports — pending
- 2.4 Power BI integration — future

### Phase 3 — Personnel safety ⏳ FUTURE
- Harness inspection, ladder inspection, ATS (structure exists in `modulos/seguridad-campo/`)

---

## Folder structure

```
/
├── index.js                              # Express entry — helmet, routes, cron
├── canales/
│   ├── whatsapp.js                       # Twilio webhook handler
│   └── dashboard.js                      # Dashboard channel
├── config/
│   └── config.js                         # Centralized config
├── middlewares/
│   └── auth.js                           # JWT verify + verificarPermiso
├── data/                                 # Supabase access — one function per operation
│   ├── activos.js
│   ├── alertas.js
│   ├── autorizaciones.js
│   ├── dashboard.js
│   ├── inspecciones.js
│   ├── posoperacionales.js
│   ├── tanqueos.js
│   └── vehiculos.js
├── modulos/
│   ├── alertas/
│   │   ├── notificador.js                # Cron + WhatsApp notifications
│   │   └── reglas.js                     # Alert rules
│   ├── vehiculos/
│   │   ├── compartido/                   # Shared flow utilities
│   │   ├── inscripcion/                  # Driver auto-registration
│   │   ├── preoperacional/               # flujo estado mensajes validaciones cierre
│   │   ├── posoperacional/               # flujo estado mensajes validaciones cierre
│   │   └── tanqueo/                      # flujo validaciones
│   └── seguridad-campo/                  # Phase 3 — structure ready, not active
│       ├── ats/
│       ├── revision-equipos/
│       └── riesgos-locativos/
├── servicios/
│   └── pdf/
│       ├── base.js                       # Shared PDF engine — never duplicate
│       ├── preoperacional.js
│       └── posoperacional.js
├── public/                               # Static admin panel
│   ├── css/                              # variables.css theme-*.css components.css layout.css
│   ├── js/                               # app.js api.js router.js theme.js utils.js
│   ├── components/                       # sidebar table badge card modal toast
│   ├── modules/
│   │   ├── dashboard.js
│   │   ├── posoperacionales.js
│   │   ├── sedes.js
│   │   ├── tanqueos.js
│   │   ├── usuarios.js
│   │   └── vehiculos/                    # alertas conductores flota preoperacionales
│   ├── index.html                        # Admin panel
│   ├── login.html                        # Auth page
│   └── landing.html                      # Public landing page
├── scripts/
│   └── update-architecture.js            # Auto-generates folder structure in this file
├── .github/workflows/
│   ├── backend.yml
│   ├── frontend.yml
│   ├── security.yml
│   ├── update-architecture.yml
│   └── auto-merge-claude.yml
├── .cursor/
│   └── rules.md                          # Cursor coding rules (versioned)
├── eslint.config.cjs                     # ESLint — CommonJS compatible
├── .env.example                          # Environment variable template
└── ARCHITECTURE.md                       # This file — source of truth
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

---

## Design sessions

Decisions are documented in versioned design sessions:
`CERO_Sesion_Diseno_vNN_DDMMYYYY.txt`

**Current version: v19 (10/04/2026)**

Before writing any code, read the latest session file.
If a session file contradicts this document, the session file wins — it is more recent.

---

## Decision log

| Date | Decision | Reason |
|---|---|---|
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