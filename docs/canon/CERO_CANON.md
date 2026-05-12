# CERO Canon

## Estado real

CERO funciona funcionalmente, pero aún no está en producción.

Objetivo actual:
Preparar CERO para piloto y producción con control, trazabilidad, pruebas y arquitectura evolutiva.

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

## Orden de trabajo

1. Canon y reglas
2. Ambientes
3. Migrations
4. Tests mínimos
5. Refactor por capas
6. Piloto
7. Producción
