-- ============================================================================
-- Backfill manual: autorizacion_novedad faltante para preoperacional MSO120
-- ============================================================================
-- Fecha:     2026-05-14
-- Bug fix:   fix(preoperacional): crear autorizacion_novedad al cerrar
--            inspeccion con bloqueo
-- Contexto:  El preoperacional MSO120 del 13/05/2026 fue cerrado antes del
--            fix con clasificacion='BLOQUEO' pero NO se creo la fila
--            correspondiente en autorizaciones_novedad. Sin esa fila, el
--            panel admin no renderiza los botones Autorizar/Taller/Restringir.
--            Este script reconstruye ese registro a partir del preoperacional
--            existente para destrabar al supervisor.
--
-- Idempotencia: WHERE NOT EXISTS sobre preoperacional_id. Re-ejecutar es
--               seguro: no creara duplicados.
--
-- Ejecucion:    NO ejecutar automaticamente. Sergio lo ejecuta manualmente
--               en Supabase SQL Editor despues de revisar y verificar.
-- ============================================================================

-- ------- PREVIEW (ejecutar primero para validar que hay 1 fila objetivo) ----
-- SELECT
--   p.id              AS preoperacional_id,
--   p.fecha,
--   p.hora,
--   p.clasificacion,
--   a.placa,
--   p.activo_id,
--   p.conductor_id,
--   (
--     SELECT jsonb_agg(elem)
--     FROM jsonb_array_elements(p.novedades) elem
--     WHERE elem->>'severidad' = 'bloqueo'
--   ) AS novedades_bloqueo_preview,
--   EXISTS (
--     SELECT 1 FROM autorizaciones_novedad au
--     WHERE au.preoperacional_id = p.id
--   ) AS ya_existe_autorizacion
-- FROM preoperacionales p
-- JOIN activos a ON a.id = p.activo_id
-- WHERE a.placa = 'MSO120'
--   AND p.fecha = '2026-05-13'
--   AND p.clasificacion = 'BLOQUEO';
-- ----------------------------------------------------------------------------

INSERT INTO autorizaciones_novedad (
  preoperacional_id,
  activo_id,
  conductor_id,
  novedades_bloqueo,
  decision,
  supervisor_id,
  justificacion,
  timestamp_alerta,
  timestamp_decision
)
SELECT
  p.id,
  p.activo_id,
  p.conductor_id,
  COALESCE(
    (
      SELECT jsonb_agg(elem)
      FROM jsonb_array_elements(p.novedades) elem
      WHERE elem->>'severidad' = 'bloqueo'
    ),
    '[]'::jsonb
  ),
  NULL,
  NULL,
  NULL,
  (p.fecha::text || ' ' || COALESCE(p.hora::text, '00:00:00') || '-05:00')::timestamptz,
  NULL
FROM preoperacionales p
JOIN activos a ON a.id = p.activo_id
WHERE a.placa = 'MSO120'
  AND p.fecha = '2026-05-13'
  AND p.clasificacion = 'BLOQUEO'
  AND NOT EXISTS (
    SELECT 1 FROM autorizaciones_novedad au
    WHERE au.preoperacional_id = p.id
  );

-- ------- VERIFICACION POST-INSERT (ejecutar para confirmar el backfill) -----
-- SELECT au.id, au.preoperacional_id, au.activo_id, au.conductor_id,
--        au.decision, au.timestamp_alerta,
--        jsonb_array_length(au.novedades_bloqueo) AS cant_bloqueos
-- FROM autorizaciones_novedad au
-- JOIN preoperacionales p ON p.id = au.preoperacional_id
-- JOIN activos a ON a.id = p.activo_id
-- WHERE a.placa = 'MSO120' AND p.fecha = '2026-05-13';
-- ----------------------------------------------------------------------------
