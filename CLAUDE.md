# CERO Instructions for Claude

## Estado real

CERO aún no está en producción.
Funciona, pero debe prepararse para piloto y producción.

## Prioridad

Optimizar por control, verificabilidad y reversibilidad.

## Fuente de verdad

Antes de proponer cambios de arquitectura, leer:

1. docs/canon/CERO_CANON.md
2. ARCHITECTURE.md

Si el código contradice el canon:
- No cambies el canon automáticamente.
- Reporta la contradicción.
- Propón una decisión explícita.

## Proceso obligatorio

Antes de editar código productivo:

1. Explicar objetivo.
2. Listar archivos a tocar.
3. Listar pruebas a crear o ejecutar.
4. Explicar riesgo.
5. Explicar rollback.
6. Esperar aprobación humana.

## Prohibido

- Leer .env o archivos de secretos.
- Hacer git push.
- Ejecutar deploy.
- Ejecutar migrations contra remoto.
- Crear nuevas dependencias directas de Supabase en modulos/.
- Crear nueva lógica de negocio en data/.
- Reescribir módulos completos sin plan incremental.
- Inventar que CERO ya está en producción.

## Permitido

- Leer código.
- Auditar.
- Proponer planes.
- Crear documentación de control.
- Crear tests.
- Hacer refactors pequeños aprobados.

## Estrategia

1. Tests de comportamiento actual.
2. Interfaces.
3. Adapters.
4. Fachadas legacy.
5. Casos de uso.
6. Dominio puro.
7. Migración gradual.
8. Eliminación de legacy solo cuando no haya consumidores.
