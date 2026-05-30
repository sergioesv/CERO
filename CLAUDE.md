# CERO — CLAUDE.md
# Punto de entrada del orquestador. Máximo 80 líneas. Denso y directo.

## Proyecto
SaaS de gestión de operaciones de campo vía WhatsApp. Colombia, PESV (Res. 40595/2022).
Stack: Node.js 20 CommonJS · Supabase PostgreSQL (São Paulo) · Railway · Twilio · Gemini 2.0 Flash
Repo: sergioesv/CERO · Rama activa: desarrollo · Deploy: auto en push a desarrollo

## Estado actual
- Fase 1 completa: preop, posop, tanqueo, alertas, inscripción, autorización v12
- Fase 2 completa: panel admin web (flota, preop, posop, tanqueos, conductores, alertas, sedes, usuarios)
- Cliente activo: Enerlight (negociación — requiere estabilización antes de cierre)

## Canon arquitectónico (leer si la tarea lo requiere)
1. docs/canon/CERO_CANON.md
2. docs/canon/CERO_ARCHITECTURE_RULES.md
3. docs/canon/CERO_DATABASE_CONTRACT.md
4. docs/canon/CERO_RELEASE_CHECKLIST.md

## Reglas de dominio para subagentes
- Backend (rutas/, data/, servicios/, middlewares/): .cursor/rules-backend.md
- Frontend (public/): .cursor/rules-frontend.md
- WhatsApp (modulos/, canales/whatsapp.js, servicios/sesiones.js): .cursor/rules-whatsapp.md

## Schema de BD
- Fuente de verdad: supabase/schema.sql (extraer de Supabase si no existe)
- Schema canónico: supabase/migrations/20260518000001_schema_canonico_v2.sql
- Tablas clave: activos, conductores, preoperacionales, posoperacionales, tanqueos,
  autorizaciones_novedad, historial_estado_activo, empresas, sedes, usuarios_panel,
  plantillas_inspeccion, plantilla_grupos, plantilla_items
- v26: tabla vehiculos eliminada — todo sobre activos con activo_id (UUID)
- JSONB: activos.documentos (merge siempre), activos.datos, preoperacionales.respuestas

## Violaciones SOLID activas (pendientes de corrección)
| ID  | Archivo                                          | Prioridad | Descripción |
|-----|--------------------------------------------------|-----------|-------------|
| ~~V-01~~ | ~~servicios/ocr.js línea 3~~                | ~~ALTA~~ | ✅ CERRADA 2026-05-29 — extraído a interpretadorNovedades.js |
| ~~V-02~~ | ~~servicios/ocr.js líneas 228-404~~          | ~~ALTA~~ | ✅ CERRADA 2026-05-29 — extraído a interpretadorNovedades.js |
| V-04 | servicios/ocr.js aliasPorItem (líneas 237-256) vs scripts/seed-templates.js / plantilla_items | MEDIA | Alias de ítems hardcodeados en ocr.js, sin sincronizar con el vocabulario real sembrado en BD |
| V-05 | ocr.js línea 354                                | MEDIA | Fallback implícito clasifica cualquier texto no reconocido como BLOQUEO |
| V-07 | servicios/ocr.js vs modulos/inspecciones/preoperacional/estado.js | BAJA  | Matching de nombres duplicado entre ocr.js y el estado del preoperacional |

Orden de corrección: V-01/V-02 → V-04 → V-05 → V-07

## Pendientes críticos antes del segundo cliente
- [ ] supabase/schema.sql — extraer y versionar
- [ ] docs/DECISION_LOG.md — separar del ARCHITECTURE.md
- [ ] Multi-tenant audit — todos los endpoints filtran por empresa_id
- [ ] RLS Supabase
- [ ] Sesiones WhatsApp en memoria → migrar a supabase.sesiones_activas (Fix 10)

## Patrones críticos (no olvidar)
- onExitoPlaca: guardar vehiculo/conductor antes de reiniciarDatosOperativos, restaurar después
- JSONB: siempre merge ({ ...anterior, campo: valor }), nunca sobreescribir
- cambiado_por en historial: UUID válido o null — nunca string
- Timezone: siempre America/Bogota (UTC-5)
- RLS se activa automáticamente en tablas nuevas — hacer DISABLE ROW LEVEL SECURITY después de crear
- PostgREST: NOTIFY pgrst, 'reload schema' después de cambios de schema
- Twilio media: proxy server-side obligatorio — browser no autentica con Twilio

## Git
- Conventional commits obligatorios: feat/fix/docs/chore/refactor/test(scope): mensaje en español
- git add [archivos exactos] — nunca git add .
- git push solo el humano
- ARCHITECTURE.md: árbol auto-generado por update-architecture.yml en cada push
- DECISION_LOG.md: actualizar manualmente en el mismo commit si hay decisión arquitectónica
