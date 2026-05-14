-- ============================================================================
-- Migration: 20260514120000_rename_permiso_vehiculos_a_activos
-- Fase 2 del plan H2.2 (ADR 0002).
-- Objetivo: eliminar filas legacy permisos_rol.modulo='vehiculos' tras el
--           rename del recurso en codigo (Fase 1, origin/desarrollo @ 62786ee).
--
-- Precondiciones verificadas en BD (2026-05-14):
--   - UNIQUE(rol_id, modulo, accion) presente: permisos_rol_unique
--   - 21 filas modulo='vehiculos' y 21 modulo='activos' con cobertura 1:1
--   - 0 duplicados
--   - 0 discrepancias de 'permitido' entre pares (vehiculos, activos)
--   - RLS desactivado, sin policies, sin triggers en permisos_rol
--   - Columnas: id (uuid PK default gen_random_uuid()),
--               rol_id (uuid NOT NULL),
--               modulo (text NOT NULL),
--               accion (text NOT NULL),
--               permitido (boolean DEFAULT true)
--
-- Propiedades garantizadas:
--   - Idempotente (segunda corrida no afecta filas, no falla).
--   - Conflict-safe (ON CONFLICT DO NOTHING).
--   - Transaccional (BEGIN/COMMIT; cualquier RAISE EXCEPTION revierte todo).
--   - No destructiva: el DELETE solo corre tras verificar cobertura Y
--     consistencia de la columna 'permitido' entre vehiculos y activos.
--
-- Fuera de alcance (NO se tocan):
--   - Tabla legacy 'vehiculos' (ya eliminada en v26 del schema).
--   - Funciones SQL legacy que referencian la tabla 'vehiculos' (H2.7).
--   - H2.3 alias /api/vehiculos, H2.4 vehiculo_placa, H2.5 t.vehiculos,
--     H2.6 vehiculosOperativosPanel.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Paso 1: copiar a 'activos' las filas 'vehiculos' que aun no tengan
-- equivalente. Si Fase 1 ya hizo seed (caso actual: cobertura 1:1), este
-- INSERT no afecta ninguna fila. Si por cualquier motivo hubiera una fila
-- 'vehiculos' sin contraparte 'activos', se crea aqui antes del DELETE.
-- Se preserva el valor real de 'permitido' (no se asume true).
-- ---------------------------------------------------------------------------
INSERT INTO permisos_rol (rol_id, modulo, accion, permitido)
SELECT
    v.rol_id,
    'activos'    AS modulo,
    v.accion,
    v.permitido
FROM permisos_rol AS v
WHERE v.modulo = 'vehiculos'
  AND NOT EXISTS (
    SELECT 1
    FROM permisos_rol AS a
    WHERE a.rol_id = v.rol_id
      AND a.modulo = 'activos'
      AND a.accion = v.accion
  )
ON CONFLICT (rol_id, modulo, accion) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Paso 2: verificar COBERTURA. Cada fila 'vehiculos' debe tener su gemela
-- 'activos' por (rol_id, accion). Si alguna queda huerfana, abortar.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    huerfanas integer;
BEGIN
    SELECT count(*) INTO huerfanas
    FROM permisos_rol AS v
    WHERE v.modulo = 'vehiculos'
      AND NOT EXISTS (
        SELECT 1
        FROM permisos_rol AS a
        WHERE a.rol_id = v.rol_id
          AND a.modulo = 'activos'
          AND a.accion = v.accion
      );

    IF huerfanas > 0 THEN
        RAISE EXCEPTION
          'Migration aborta (cobertura): % fila(s) vehiculos sin equivalente activos. No se elimina nada.',
          huerfanas;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Paso 3: verificar CONSISTENCIA DE 'permitido' entre cada par
-- (vehiculos, activos). Si alguna fila gemela difiere en el valor de
-- 'permitido', abortar la transaccion.
--
-- Justificacion: el Paso 2 solo asegura que existe una fila 'activos' para
-- cada 'vehiculos' por (rol_id, accion), pero no que ambas concuerden en
-- 'permitido'. Sin este chequeo, una discrepancia historica
-- (ej. vehiculos.permitido=false, activos.permitido=true) se perderia
-- silenciosamente al borrar la fila legacy.
--
-- Se usa IS DISTINCT FROM para que la comparacion sea robusta ante NULL
-- (aunque 'permitido' tiene DEFAULT true y el seed siempre escribe true,
-- IS DISTINCT FROM es la semantica correcta para asimetria de booleanos).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    discrepancias integer;
BEGIN
    SELECT count(*) INTO discrepancias
    FROM permisos_rol AS v
    JOIN permisos_rol AS a
      ON a.rol_id = v.rol_id
     AND a.accion = v.accion
     AND a.modulo = 'activos'
    WHERE v.modulo = 'vehiculos'
      AND v.permitido IS DISTINCT FROM a.permitido;

    IF discrepancias > 0 THEN
        RAISE EXCEPTION
          'Migration aborta (consistencia permitido): % par(es) vehiculos/activos con permitido distinto. Revisar manualmente antes de proceder.',
          discrepancias;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Paso 4: eliminar las filas legacy 'vehiculos'. Solo se ejecuta si los
-- Pasos 2 y 3 pasaron (cobertura completa + consistencia de 'permitido').
-- ---------------------------------------------------------------------------
DELETE FROM permisos_rol WHERE modulo = 'vehiculos';

-- ---------------------------------------------------------------------------
-- Paso 5: verificacion post-condicion. Si quedo alguna fila 'vehiculos'
-- (race condition, insert concurrente), abortar.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    sobrevivientes integer;
BEGIN
    SELECT count(*) INTO sobrevivientes
    FROM permisos_rol
    WHERE modulo = 'vehiculos';

    IF sobrevivientes > 0 THEN
        RAISE EXCEPTION
          'Migration aborta (post-condicion): % fila(s) vehiculos sobrevivieron al DELETE.',
          sobrevivientes;
    END IF;
END $$;

COMMIT;

-- ============================================================================
-- ROLLBACK (manual, post-commit) -- ejecutar solo bajo aprobacion humana
-- ============================================================================
-- Caso A: revertir SOLO Fase 2, manteniendo Fase 1 en codigo.
--   Re-inserta filas 'vehiculos' a partir de las 'activos' actuales,
--   preservando 'permitido'.
--   El seed del servicio NO las re-creara (el codigo ya escribe 'activos').
--
--   BEGIN;
--   INSERT INTO permisos_rol (rol_id, modulo, accion, permitido)
--   SELECT rol_id, 'vehiculos', accion, permitido
--   FROM permisos_rol
--   WHERE modulo = 'activos'
--   ON CONFLICT (rol_id, modulo, accion) DO NOTHING;
--   COMMIT;
--
-- Caso B: revertir Fase 2 Y Fase 1 (codigo + BD).
--   1. Aplicar el INSERT del Caso A.
--   2. git revert <sha-fase1> en la rama desarrollo.
--   3. (Opcional) DELETE FROM permisos_rol WHERE modulo = 'activos';
--      Solo si Fase 1 NO va a redeployearse -- en caso contrario el seed
--      reinsertaria las filas en el siguiente arranque.
--
-- En ambos casos: backup previo de permisos_rol obligatorio.
-- ============================================================================
