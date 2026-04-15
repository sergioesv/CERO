-- CERO v24 Día 5 — Ejecutar en el SQL Editor de Supabase (proyecto "cero")
-- Tanqueos: nuevos campos v3 + índices
-- Vehículos: columnas opcionales para rangos de rendimiento

-- Nuevos campos v3 en tabla tanqueos
ALTER TABLE tanqueos
  ADD COLUMN IF NOT EXISTS score_ocr_global      NUMERIC(4,3)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tier_ocr              INTEGER       DEFAULT 3,
  ADD COLUMN IF NOT EXISTS serial_ibutton        TEXT,
  ADD COLUMN IF NOT EXISTS autorizacion_terpel   TEXT,
  ADD COLUMN IF NOT EXISTS nit_estacion          TEXT,
  ADD COLUMN IF NOT EXISTS placa_ocr_foto        TEXT,
  ADD COLUMN IF NOT EXISTS flag_sin_factura      BOOLEAN       DEFAULT false,
  ADD COLUMN IF NOT EXISTS tiene_factura_fisica  BOOLEAN       DEFAULT true,
  ADD COLUMN IF NOT EXISTS revisado_por          TEXT,
  ADD COLUMN IF NOT EXISTS fecha_revision        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notas_admin           TEXT;

-- Verificar que estos ya existen (si no, agregarlos también):
-- factura_numero_ocr, factura_numero_manual, placa_ocr_factura,
-- km_ocr_factura, km_ocr_odometro, cantidad_ocr, cantidad_manual,
-- datos_ocr_factura, estado_validacion, discrepancias,
-- rendimiento_calculado, rendimiento_alerta, es_primer_tanqueo
-- → estos YA existen según el flujo actual, no se tocan.

-- Agregar columnas a vehiculos si no existen
ALTER TABLE vehiculos
  ADD COLUMN IF NOT EXISTS tipo_combustible  TEXT,
  ADD COLUMN IF NOT EXISTS rendimiento_min   NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS rendimiento_max   NUMERIC(6,2);

-- Índices útiles para el panel
CREATE INDEX IF NOT EXISTS idx_tanqueos_estado_validacion
  ON tanqueos(estado_validacion);

CREATE INDEX IF NOT EXISTS idx_tanqueos_vehiculo_placa_created
  ON tanqueos(vehiculo_placa, created_at DESC);
