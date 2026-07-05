# CERO — CLAUDE.md
# Punto de entrada del orquestador. Máximo 80 líneas. Denso y directo.

## Proyecto
SaaS de gestión de operaciones de campo vía WhatsApp. Colombia, PESV (Res. 40595/2022).
Stack: Node.js 20 CommonJS · Supabase PostgreSQL (São Paulo) · Railway · Twilio · Gemini 2.5 Flash (GOOGLE_MODEL_VISION, default en servicios/ocr.js)
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
| V-04 | modulos/inspecciones/compartido/interpretadorNovedades.js:56-87 vs plantilla_items | MEDIA | aliasPorItem hardcodeado (migró desde ocr.js), sin sincronizar con el vocabulario sembrado en BD |
| V-05 | interpretadorNovedades.js:190-193               | MEDIA | Fallback clasifica todo texto no reconocido como "Mal estado" (documentado como intencional) |
| ~~V-07~~ | ~~ocr.js vs preoperacional/estado.js~~      | ~~BAJA~~ | ✅ CERRADA — estado.js ya no contiene matching; ocr.js delega en interpretadorNovedades |

Orden de corrección: V-04 → V-05 (únicas abiertas)

## Pendientes críticos antes del segundo cliente
- [ ] supabase/schema.sql — extraer y versionar
- [x] docs/DECISION_LOG.md — separado (131 líneas, docs/DECISION_LOG.md)
- [ ] Multi-tenant audit — todos los endpoints filtran por empresa_id
- [ ] RLS Supabase
- [x] Fix 10 hecho: sesiones persisten en supabase.sesiones_activas (servicios/sesiones.js). PENDIENTE real: lock "procesando" sigue en memoria → máximo 1 réplica en Railway

## Patrones críticos (no olvidar)
- onExitoPlaca: guardar vehiculo/conductor antes de reiniciarDatosOperativos, restaurar después
- JSONB: siempre merge ({ ...anterior, campo: valor }), nunca sobreescribir
- cambiado_por en historial: UUID válido o null — nunca string
- Timezone: siempre America/Bogota (UTC-5)
- RLS se activa automáticamente en tablas nuevas — hacer DISABLE ROW LEVEL SECURITY después de crear
- PostgREST: NOTIFY pgrst, 'reload schema' después de cambios de schema
- Twilio media: proxy server-side obligatorio — browser no autentica con Twilio
- PDF: generación en GeneradorPDF*, entrega (Storage+WhatsApp) en servicios/pdf/entrega.js — base.js eliminado 2026-07-04

## Git
- Conventional commits obligatorios: feat/fix/docs/chore/refactor/test(scope): mensaje en español
- git add [archivos exactos] — nunca git add .
- git push solo el humano
- ARCHITECTURE.md: árbol auto-generado por update-architecture.yml en cada push
- DECISION_LOG.md: actualizar manualmente en el mismo commit si hay decisión arquitectónica
