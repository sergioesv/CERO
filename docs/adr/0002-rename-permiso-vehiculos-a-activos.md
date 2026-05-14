# ADR 0002: Rename del recurso de permisos `vehiculos` a `activos`

## Estado
Implementado — 2026-05-14

## Contexto

CERO sigue usando el string `"vehiculos"` como nombre del recurso de permisos en dos puntos del código:

- `data/permisos.js:5,18,31,40,50,67,75` — la tabla canónica `CANONICAL_ROLE_PERMISSIONS` declara la clave `vehiculos: [...]` para 7 de los 8 roles canónicos (`superadmin_plataforma`, `superadmin_emp`, `administrador`, `supervisor`, `operador`, `auditor`, `reportes`). El octavo rol canónico, `sst`, no tiene la clave.
- `rutas/activos.js:14,54,129,140,157,232,265,298` — los 8 endpoints CRUD de activos llaman `verificarPermiso('vehiculos', <accion>)`.

Adicionalmente, `index.js:176` invoca `seedPermisosBase()` en arranque, que vía `data/permisos.js:164-186` persiste filas en la tabla `permisos_rol` con `modulo='vehiculos'`, usando `upsert` con `onConflict: 'rol_id,modulo,accion'` e `ignoreDuplicates: true`. Las columnas escritas por el seed son `rol_id`, `modulo`, `accion`, `permitido` (`data/permisos.js:151-156`).

La tabla `vehiculos` fue eliminada en la migración v26 (19/04/2026). `CERO_DATABASE_CONTRACT.md:51` lo declara explícitamente: *"`vehiculos` fue eliminada en la migración v26 (19/04/2026). Todo opera sobre `activos`. No existe, no debe existir, y ningún código nuevo debe referenciarla."* `CERO_ARCHITECTURE_RULES.md:240` lo refuerza como violación crítica del canon (§8 punto 7): *"Referenciar la tabla `vehiculos` en cualquier código nuevo."*

El string del recurso de permiso no es estrictamente "la tabla", pero hereda el nombre eliminado y crea una inconsistencia conceptual permanente. Si en el futuro se introduce RLS o auditoría que correlacione recurso de permiso con tabla de dominio, el string `"vehiculos"` no podrá mapearse a ningún recurso real.

Auditoría H2.2 confirmó:

- El cambio es **código + BD**. **No requiere frontend**: `public/js/app.js:1-18` mantiene un objeto `PERMISOS` cuyas claves no incluyen `"vehiculos"` — el cliente no envía ni recibe ese string como nombre de permiso. Las menciones a `vehiculos` en frontend (`public/js/app.js:195-205`, `public/js/router.js:26`) son hashes de URL legacy (H2.3, fuera de alcance de este ADR).
- El middleware `verificarPermiso` (`middlewares/auth.js:29-50`) verifica permisos en memoria contra `CANONICAL_ROLE_PERMISSIONS`, no consulta `permisos_rol` en runtime. Por tanto, una ventana corta de coexistencia entre filas `'vehiculos'` y `'activos'` en BD no rompe el acceso.
- No se encontró ningún consumer adicional de `permisos_rol` en código productivo fuera del seed.

La Fase 0 de este plan (tests de contrato que congelan el comportamiento actual con `"vehiculos"`) ya fue completada y publicada en `origin/desarrollo` como commit `2b51978` (verificable con `git log --oneline origin/desarrollo`). Los 43 tests pasan contra el código actual.

---

## Decisión

**Renombrar el recurso de permisos de `"vehiculos"` a `"activos"` en código, y limpiar las filas residuales en `permisos_rol` mediante migration versionada bajo `supabase/migrations/`.**

Patrón elegido: **rename progresivo en fases discretas, sin alias en código y sin doble-escritura.**

### Alternativas rechazadas

- **Alias en código** (modificar `getAllowedCanonicalRolesForItem` para aceptar tanto `'vehiculos'` como `'activos'`): introduce lógica especial permanente que nunca debería generalizarse. Rechazado.
- **Doble-escritura en seed** (que `seedPermisosBase` inserte filas para ambos strings durante una ventana): contamina la BD y deja residuos a limpiar posteriormente. Rechazado.
- **Mantener el nombre `"vehiculos"`**: deuda conceptual permanente que bloquea RLS futura y viola el espíritu de la regla de no referenciar el recurso eliminado. Rechazado.
- **`UPDATE permisos_rol SET modulo='activos' WHERE modulo='vehiculos'` directo en Fase 2**: peligroso bajo coexistencia. Si existe `UNIQUE(rol_id, modulo, accion)` y Fase 1 ya escribió la fila `'activos'`, el `UPDATE` lanza `duplicate key violation` y aborta la transacción. Si no existe el constraint, el `UPDATE` "pasa" pero genera filas semánticamente duplicadas que corrompen la tabla. No es idempotente bajo coexistencia. Rechazado.

### Justificación

- CERO es pre-piloto (`CERO_CANON.md:5`): sin usuarios reales que perder durante la ventana de coexistencia entre Fase 1 y Fase 2.
- El middleware no consulta `permisos_rol` en runtime; las filas obsoletas son ruido inerte, no rotura de acceso.
- La infraestructura de `supabase/migrations/` ya existe (precondición resuelta por commit anterior).
- Los tests de Fase 0 funcionan como contrato del nuevo estado al actualizarlos en Fase 1.

### Fases de implementación

**Fase 0 — Tests de contrato.** Estado: **completada**. Publicada en `origin/desarrollo` como commit `2b51978`. Archivos creados: `tests/data/permisos.test.js`, `tests/rutas/activos.test.js`. Congela el comportamiento actual con `"vehiculos"`: 43/43 tests pasan contra el código actual. Estos tests funcionan como red de seguridad para Fase 1.

**Fase 1 — Rename en código.** Estado: **completada**. Commit `62786ee` en `origin/desarrollo`. Archivos modificados:

- `data/permisos.js`: clave `vehiculos` reemplazada por `activos` en los 7 roles canónicos de `CANONICAL_ROLE_PERMISSIONS`.
- `rutas/activos.js`: primer argumento de `verificarPermiso` reemplazado de `'vehiculos'` a `'activos'` en las 8 llamadas.
- `tests/data/permisos.test.js` y `tests/rutas/activos.test.js`: aserciones actualizadas a `'activos'`. Tests pasan tras el rename, confirmando comportamiento idéntico al previo.

Efecto observable: el seed escribe `modulo:'activos'` en `permisos_rol` al arranque. Las filas previas con `modulo:'vehiculos'` quedaron como ruido inerte hasta Fase 2.

**Fase 2 — Migration de BD conflict-safe.** Estado: **completada**. Archivo: `supabase/migrations/20260514120000_rename_permiso_vehiculos_a_activos.sql`. Commit local `1152ba2` (pendiente de push al momento del cierre documental). Migration aplicada manualmente en Supabase el 2026-05-14. Resultado verificado post-migration: `permisos_rol` sin filas `modulo='vehiculos'` (P1: 0 filas), 21 filas `modulo='activos'` conservadas (P2), snapshot por módulo sin entrada `'vehiculos'` (P3). Las 8 precondiciones de schema listadas en este ADR fueron verificadas el 2026-05-14; el detalle queda documentado dentro del propio archivo `.sql` de la migration.

**Fase 3 — Verificación y cierre.** Estado: **completada** (2026-05-14). Grep residual confirmó 0 ocurrencias de `"vehiculos"` como string de recurso de permiso en código productivo. `supabase/migrations/README.md` actualizado. Este ADR actualizado a estado *Implementado*.

### Estrategia conflict-safe de Fase 2 (pseudo-SQL — el SQL definitivo se redacta tras inspeccionar el schema real)

```sql
-- ============================================================
-- Migration: rename_permiso_vehiculos_a_activos
-- Objetivo: limpiar filas residuales permisos_rol.modulo='vehiculos'
--           sin generar duplicados ni perder permisos efectivos.
-- Precondicion: existe UNIQUE (rol_id, modulo, accion) en permisos_rol.
-- ============================================================

BEGIN;

-- Paso 1: copiar a 'activos' solo lo que aun no existe como 'activos'.
-- Preserva las columnas relevantes (lista completa pendiente — ver precondiciones).
INSERT INTO permisos_rol (<columnas relevantes a confirmar tras inspeccion>)
SELECT
    <mismas columnas, con modulo='activos' en vez de modulo='vehiculos'>
FROM permisos_rol AS origen
WHERE origen.modulo = 'vehiculos'
  AND NOT EXISTS (
    SELECT 1
    FROM permisos_rol AS destino
    WHERE destino.rol_id = origen.rol_id
      AND destino.modulo = 'activos'
      AND destino.accion = origen.accion
  )
ON CONFLICT (rol_id, modulo, accion) DO NOTHING;

-- Paso 2: verificar cobertura — toda fila vehiculos debe tener
-- ahora su equivalente activos. Si alguna no, abortar la transaccion.
DO $$
DECLARE
    huerfanas int;
BEGIN
    SELECT count(*) INTO huerfanas
    FROM permisos_rol AS v
    WHERE v.modulo = 'vehiculos'
      AND NOT EXISTS (
        SELECT 1 FROM permisos_rol AS a
        WHERE a.rol_id = v.rol_id
          AND a.modulo = 'activos'
          AND a.accion = v.accion
      );
    IF huerfanas > 0 THEN
        RAISE EXCEPTION 'Migration aborta: % filas vehiculos sin equivalente activos', huerfanas;
    END IF;
END $$;

-- Paso 3: eliminar las filas vehiculos.
DELETE FROM permisos_rol WHERE modulo = 'vehiculos';

COMMIT;

-- ============================================================
-- Rollback (ejecutar manualmente si fuera necesario tras el commit):
--   1. Re-insertar filas con modulo='vehiculos' a partir de las 'activos' actuales,
--      ON CONFLICT (rol_id, modulo, accion) DO NOTHING.
--   2. (Opcional) DELETE de las filas 'activos' creadas por esta migration —
--      solo si se decide revertir tambien el deploy de Fase 1.
-- ============================================================
```

Propiedades garantizadas por esta estrategia:

- **Idempotente.** Una segunda corrida no inserta nada (`NOT EXISTS` bloquea), la verificación pasa, el `DELETE` afecta 0 filas. Sin error.
- **Conflict-safe.** El `ON CONFLICT (rol_id, modulo, accion) DO NOTHING` evita `duplicate key violation` cuando Fase 1 ya creó la fila `'activos'` correspondiente.
- **No destructiva en estado intermedio.** Si el Paso 2 detecta huérfanas, la transacción hace rollback y no se pierden filas ni se generan huérfanos.
- **No genera duplicados semánticos.** Por construcción (`NOT EXISTS` + `ON CONFLICT DO NOTHING`).

### Precondiciones obligatorias antes de redactar el SQL definitivo de Fase 2

El SQL real no debe escribirse hasta inspeccionar el schema vigente de `permisos_rol` y resolver:

1. **Lista completa y tipos de columnas de `permisos_rol`.** El código sembrador solo escribe 4 columnas (`rol_id`, `modulo`, `accion`, `permitido`). Es probable que existan además: `id` (uuid PK, por `CERO_DATABASE_CONTRACT.md:58-66` Regla 1), `created_at`, `updated_at`. Pueden existir otras (`empresa_id`, `creado_por`, `actualizado_por`, `condicion`, `descripcion`, `meta`). La migration debe copiar el conjunto correcto.
2. **¿Existe `UNIQUE (rol_id, modulo, accion)`?** El código asume su presencia al usar `onConflict: 'rol_id,modulo,accion'`. Confirmar con `\d permisos_rol`. Sin el constraint, la estrategia `ON CONFLICT` falla y la migration debe rediseñarse.
3. **¿Hay foreign keys saliendo o entrando a `permisos_rol`?** Saber si `rol_id` referencia `roles(id)` con `ON DELETE CASCADE/RESTRICT`. Afecta el orden de operaciones si hay registros relacionados.
4. **¿RLS habilitado en `permisos_rol`?** Según `CERO_DATABASE_CONTRACT.md:187` RLS aún no está activo. Confirmar para esta tabla específicamente. Si lo está, la migration debe correr como rol con bypass o ajustarse a las políticas.
5. **¿Triggers asociados?** Si hay `BEFORE INSERT/UPDATE/DELETE`, pueden afectar comportamiento esperado (p. ej. trigger que actualiza `updated_at`).
6. **Cardinalidad real actual.** `SELECT count(*) FROM permisos_rol WHERE modulo IN ('vehiculos','activos') GROUP BY modulo;` antes de la migration. Si la cuenta no coincide con lo esperado (sembrado dinámico por roles × acciones), hay filas residuales o no documentadas que la migration debe contemplar.
7. **¿Existe ya algún registro con `modulo='activos'`?** Si Fase 1 todavía no se desplegó, no debería haber ninguno. Si ya corrió en algún ambiente, el INSERT-NOT-EXISTS de la migration es el camino correcto.
8. **¿Soft-delete?** Confirmar que no hay columna `deleted_at` o similar. Si la hay, el `DELETE` final debe sustituirse por un `UPDATE deleted_at = now()`.

La inspección se realiza fuera de esta sesión (psql o Supabase Studio con aprobación humana). Esta auditoría queda como pre-requisito explícito de Fase 2.

**Verificación completada el 2026-05-14.** Las 8 precondiciones fueron resueltas antes de redactar el SQL definitivo. El detalle de cada verificación (columnas, constraints, RLS, triggers, cardinalidad, soft-delete) queda documentado en `supabase/migrations/20260514120000_rename_permiso_vehiculos_a_activos.sql`.

### Fuera de alcance de este ADR

Este ADR cubre exclusivamente el renombrado del **recurso de permisos** `vehiculos` → `activos`. Quedan explícitamente fuera de alcance:

- **H2.3** — alias HTTP `app.use('/api/vehiculos', rutasActivos)` en `index.js:88`. Es deprecación de URL pública, ciclo de vida independiente.
- **H2.4** — campo virtual `vehiculo_placa` en código. Compatibilidad de datos.
- **H2.5** — alias `t.vehiculos` virtual. Compatibilidad de schema.
- **H2.6** — `vehiculosOperativosPanel`. Nombre en código JS frontend.
- **RLS sobre `permisos_rol`.** Decisión separada con su propio ADR.
- **Refactor de `seedPermisosBase`** para que `buildSeedRowsForRoles` quede exportada y testeable directamente (señal arquitectónica detectada en Fase 0, no resuelta aquí).
- **Cambios en otros recursos de `CANONICAL_ROLE_PERMISSIONS`** (`conductores`, `usuarios`, `flota`, etc.).
- **H2.7 — Funciones SQL legacy** que referencian la tabla `vehiculos` (ya eliminada en migración v26). Detectadas durante la inspección de Fase 2 (`verificar_vehiculo_operable`, `actualizar_kilometraje_posoperacional`, `actualizar_kilometraje_tanqueo`, `alertas_documentos_activas`, `bloquear_vehiculos_vencidos`, `verificar_pico_placa`). Deuda técnica pendiente; requiere ADR propio antes de ejecutarse.

---

## Consecuencias

### Tras Fase 1

- El seed `seedPermisosBase` empieza a escribir filas con `modulo:'activos'` en arranque. Las filas previas con `modulo:'vehiculos'` quedan como ruido inerte hasta Fase 2.
- Los tests de Fase 0 quedan actualizados a `'activos'`. Si pasan tras el cambio, confirman que el comportamiento es idéntico al previo.
- Riesgo principal: si `permisos_rol` no tiene constraint `UNIQUE(rol_id, modulo, accion)`, el `upsert` con `onConflict` puede generar duplicados que el seed lance en arranque. Mitigación: verificar el constraint antes del deploy de Fase 1.
- Riesgo secundario: consumer no detectado de `permisos_rol` con filtro `WHERE modulo='vehiculos'`. La auditoría H2.2 no encontró ninguno; re-confirmar en Fase 1 con grep amplio antes del PR.

### Tras Fase 2

- `permisos_rol` queda con solo filas `modulo='activos'` para el dominio de activos. Filas históricas `'vehiculos'` eliminadas tras verificación de cobertura.
- Riesgo: ejecutar la migration sin backup. Aunque CERO sea pre-piloto, si la BD tiene datos demo de valor para piloto, el backup aplica (`CERO_DATABASE_CONTRACT.md:180`).
- Riesgo de orden invertido: si la migration corre antes del deploy de Fase 1, el seed re-introducirá `'vehiculos'` en el siguiente arranque (inconsistencia, no rotura).

### Tras Fase 3

- Cero referencias a `"vehiculos"` como string de recurso de permiso en código productivo. Estado *Implementado* en este ADR.
- No hay cambio de comportamiento observable.

---

## Rollback

### Fase 1
`git revert <sha-rename-código>`. El seed volverá a escribir `'vehiculos'` al próximo arranque. Las filas `'activos'` escritas entre el deploy de Fase 1 y el revert quedan como basura inerte (el middleware no las lee); limpieza manual solo si se considera necesaria, previa aprobación humana.

### Fase 2
Ejecutar el bloque de reversa documentado dentro del propio archivo `.sql` (paso 1 del rollback: re-insertar filas con `modulo='vehiculos'` a partir de las `'activos'` actuales con `ON CONFLICT DO NOTHING`). Si la migration no corrió aún, simplemente revertir el PR. Si se decide revertir también el deploy de Fase 1, ejecutar el paso 2 del rollback (`DELETE` de las filas `'activos'` que la migration insertó), siempre con backup previo y aprobación humana.

### Fase 3
No aplica rollback.
