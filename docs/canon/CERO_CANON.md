# CERO Canon

## Estado real

**Fase 1 completa.** Fase 2 completa. Cliente activo: Enerlight (en negociación — requiere estabilización antes de cierre).
Bloqueadores actuales y violaciones SOLID activas: ver `CLAUDE.md`.

Objetivo actual:
Estabilizar para piloto con Enerlight. Cerrar violaciones V-01/V-02, completar audit multi-tenant, habilitar RLS.

## Stack oficial

- Node.js
- Supabase/Postgres
- Twilio WhatsApp
- Gemini AI
- Vanilla JS SPA

## Fuente de verdad

- Arquitectura y reglas: docs/canon/
- Schema y cambios de BD: supabase/migrations/
- Reglas para Claude: CLAUDE.md y .claude/
- Código funcional actual: ramas protegidas de GitHub

## Módulos principales

- Activos
- Conductores
- Inspecciones
- Tanqueos
- Plantillas de inspección
- WhatsApp
- Panel administrativo
- PDFs
- Storage de evidencias

## Regla central

CERO no se reescribe desde cero.
CERO se estabiliza, se prueba y se refactoriza por capas.

## No negociables

1. No se modifica producción manualmente.
2. No se cambia base de datos sin migration.
3. No se introducen secretos al repo.
4. No se agregan nuevas queries directas a Supabase dentro de módulos de negocio.
5. No se agrega nueva lógica de negocio dentro de data/.
6. Toda regla crítica debe poder probarse.
7. Toda salida a piloto debe pasar por checklist.
8. Toda decisión arquitectónica importante debe quedar escrita en docs/canon/ o docs/adr/.
9. El código legacy puede existir, pero debe quedar aislado y documentado.
10. Claude puede ayudar, pero no decide la arquitectura por encima del canon.

## Orden de trabajo (estado 2026-05-29)

✅ Canon y reglas
✅ Ambientes
✅ Migrations (schema v2 aplicado)
⏳ Tests mínimos — cobertura parcial, faltan tanqueos/ocr/conductores
⏳ Refactor por capas — V-01/V-02 pendientes (ver CLAUDE.md)
⏳ Piloto — bloqueado hasta estabilización
⬜ Producción — bloqueado por RLS y audit multi-tenant
