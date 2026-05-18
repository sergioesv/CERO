-- ================================================================
-- CERO — Migración schema canónico v2
-- Archivo destino: supabase/migrations/20260518000001_schema_canonico_v2.sql
-- MODO REVISIÓN: No ejecutar en prod sin completar backfill de datos.
-- Cada paso está comentado con su backfill correspondiente.
-- ================================================================

-- ----------------------------------------------------------------
-- PASO 1: CONSTRAINTS FALTANTES EN TABLAS EXISTENTES
-- Problemas: sin unicidad en campos críticos, sesiones sin PK.
-- ----------------------------------------------------------------

-- nit de empresa debe ser irrepetible
ALTER TABLE empresas
  ADD CONSTRAINT empresas_nit_unique UNIQUE (nit);

-- email de usuario es credencial de acceso — no puede duplicarse
ALTER TABLE usuarios_panel
  ADD CONSTRAINT usuarios_panel_email_unique UNIQUE (email);

-- codigo de tipo_activo es referencia interna del sistema
ALTER TABLE tipos_activo
  ADD CONSTRAINT tipos_activo_codigo_unique UNIQUE (codigo);

-- telefono es la clave natural de sesiones — sin PK un INSERT duplicado no falla, corrompe
ALTER TABLE sesiones_activas
  ADD PRIMARY KEY (telefono);

-- placa única por empresa, no global
-- (dos empresas distintas pueden tener placas iguales en sus registros)
ALTER TABLE activos
  ADD CONSTRAINT activos_placa_empresa_unique UNIQUE (placa, empresa_id);


-- ----------------------------------------------------------------
-- PASO 2: CONDUCTORES — multi-tenant roto
-- Problema: solo tiene sede_id. Sin empresa_id, cruzar datos entre
-- clientes requiere JOIN a sedes. Es una bomba de datos para multi-tenant.
-- ----------------------------------------------------------------

ALTER TABLE conductores
  ADD COLUMN empresa_id uuid;

-- BACKFILL (ejecutar antes de activar constraint):
-- UPDATE conductores c
--   SET empresa_id = s.empresa_id
--   FROM sedes s
--   WHERE c.sede_id = s.id;

-- Después del backfill verificar que no quedaron nulls:
-- SELECT COUNT(*) FROM conductores WHERE empresa_id IS NULL;

-- Luego activar:
-- ALTER TABLE conductores ALTER COLUMN empresa_id SET NOT NULL;
-- ALTER TABLE conductores
--   ADD CONSTRAINT conductores_empresa_id_fkey
--   FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT;

-- cedula única por empresa (dos empresas pueden tener mismo conductor)
-- ALTER TABLE conductores
--   ADD CONSTRAINT conductores_cedula_empresa_unique UNIQUE (cedula, empresa_id);


-- ----------------------------------------------------------------
-- PASO 3: TANQUEOS — tabla hinchada (~45 cols) y conductor sin FK
--
-- Problema A: datos OCR mezclados con datos operacionales.
-- Solución: tabla tanqueos_ocr separada, relación 1:1.
--
-- Problema B: conductor referenciado por telefono_reporta (texto libre).
-- Solución: agregar conductor_id con FK a conductores.
-- ----------------------------------------------------------------

-- 3a. Tabla OCR separada
CREATE TABLE tanqueos_ocr (
  id                   uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tanqueo_id           uuid NOT NULL,

  -- Capturas OCR crudas
  factura_numero_ocr   text,
  placa_ocr_factura    text,
  placa_ocr_foto       text,
  km_ocr_factura       integer,
  km_ocr_odometro      integer,
  cantidad_ocr         numeric,
  datos_brutos         jsonb,         -- respuesta completa de Gemini

  -- Scoring y clasificación de confianza
  score_ocr_global     numeric DEFAULT 0,
  tier_ocr             integer DEFAULT 3,

  -- Discrepancias detectadas automáticamente
  discrepancias        jsonb DEFAULT '[]'::jsonb,

  -- Validación manual por supervisor
  estado_validacion    text DEFAULT 'pendiente_revision'::text,
  validado_por         text,
  fecha_validacion     timestamp with time zone,
  motivo_rechazo       text,
  revisado_por         text,
  fecha_revision       timestamp with time zone,
  notas_admin          text,

  created_at           timestamp with time zone DEFAULT now(),

  CONSTRAINT tanqueos_ocr_tanqueo_id_fkey
    FOREIGN KEY (tanqueo_id) REFERENCES tanqueos(id) ON DELETE CASCADE,

  -- Relación 1:1 — un tanqueo tiene máximo un registro OCR
  CONSTRAINT tanqueos_ocr_tanqueo_id_unique UNIQUE (tanqueo_id),

  CONSTRAINT tanqueos_ocr_estado_check
    CHECK (estado_validacion IN ('pendiente_revision', 'aprobado', 'rechazado'))
);

COMMENT ON TABLE tanqueos_ocr IS
  'Datos de validación OCR separados de la operación de tanqueo. '
  'Relación 1:1 con tanqueos. Generado por Gemini 2.0 Flash.';

-- BACKFILL tanqueos_ocr desde tanqueos existentes:
-- INSERT INTO tanqueos_ocr (
--   tanqueo_id, factura_numero_ocr, placa_ocr_factura, placa_ocr_foto,
--   km_ocr_factura, km_ocr_odometro, cantidad_ocr, datos_brutos,
--   score_ocr_global, tier_ocr, discrepancias, estado_validacion,
--   validado_por, fecha_validacion, motivo_rechazo,
--   revisado_por, fecha_revision, notas_admin
-- )
-- SELECT
--   id, factura_numero_ocr, placa_ocr_factura, placa_ocr_foto,
--   km_ocr_factura, km_ocr_odometro, cantidad_ocr, datos_ocr_factura,
--   score_ocr_global, tier_ocr, discrepancias, estado_validacion,
--   validado_por, fecha_validacion, motivo_rechazo,
--   revisado_por, fecha_revision, notas_admin
-- FROM tanqueos
-- WHERE placa_ocr_factura IS NOT NULL
--    OR km_ocr_factura IS NOT NULL
--    OR datos_ocr_factura IS NOT NULL;

-- 3b. Agregar conductor_id a tanqueos
ALTER TABLE tanqueos
  ADD COLUMN conductor_id_v2 uuid;

-- BACKFILL (aproximación por telefono — revisar manualmente los que no matcheen):
-- UPDATE tanqueos t
--   SET conductor_id_v2 = c.id
--   FROM conductores c
--   WHERE t.telefono_reporta = c.telefono
--     AND t.sede_id = c.sede_id;

-- Verificar cobertura antes de activar constraint:
-- SELECT COUNT(*) AS sin_match FROM tanqueos WHERE conductor_id_v2 IS NULL;

-- Después del backfill:
-- ALTER TABLE tanqueos ALTER COLUMN conductor_id_v2 SET NOT NULL;
-- ALTER TABLE tanqueos
--   ADD CONSTRAINT tanqueos_conductor_id_fkey
--   FOREIGN KEY (conductor_id_v2) REFERENCES conductores(id) ON DELETE RESTRICT;

-- telefono_reporta y nombre_reportado se conservan como audit trail histórico
COMMENT ON COLUMN tanqueos.telefono_reporta IS
  'DEPRECADO v2. Conservar como audit trail histórico. Usar conductor_id_v2.';
COMMENT ON COLUMN tanqueos.nombre_reportado IS
  'DEPRECADO v2. Conservar como audit trail histórico. Usar conductor_id_v2.';


-- ----------------------------------------------------------------
-- PASO 4: EVIDENCIA — unificar tres tablas de fotos idénticas
--
-- Problema: fotos_evidencia, fotos_posoperacional, fotos_tanqueo
-- tienen estructura idéntica. Triple mantenimiento para el mismo problema.
-- Solución: tabla polimórfica evidencia con entidad_tipo + entidad_id.
-- ----------------------------------------------------------------

CREATE TABLE evidencia (
  id           uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Referencia polimórfica
  entidad_tipo text NOT NULL,   -- 'preoperacional' | 'posoperacional' | 'tanqueo'
  entidad_id   uuid NOT NULL,

  -- Datos de la foto
  tipo         text NOT NULL,   -- 'odometro', 'novedad', 'factura', 'general', etc.
  descripcion  text,
  foto_url     text NOT NULL,

  -- Metadata específica por entidad_tipo (jsonb para no romper estructura)
  -- preoperacional: {validada: bool, resultado_validacion: text}
  -- posoperacional: {novedad_id: uuid}
  -- tanqueo:        {}
  metadata     jsonb DEFAULT '{}'::jsonb,

  created_at   timestamp with time zone DEFAULT now(),

  CONSTRAINT evidencia_entidad_tipo_check
    CHECK (entidad_tipo IN ('preoperacional', 'posoperacional', 'tanqueo'))
);

-- Índice para consultas por entidad (el caso de uso principal)
CREATE INDEX evidencia_entidad_idx ON evidencia (entidad_tipo, entidad_id);

COMMENT ON TABLE evidencia IS
  'Tabla unificada de evidencias fotográficas. '
  'Reemplaza fotos_evidencia, fotos_posoperacional y fotos_tanqueo.';
COMMENT ON COLUMN evidencia.metadata IS
  'Campos adicionales según entidad_tipo. '
  'preoperacional: {validada, resultado_validacion}. '
  'posoperacional: {novedad_id}. tanqueo: {}.';

-- BACKFILL desde fotos_evidencia (preoperacionales):
-- INSERT INTO evidencia (entidad_tipo, entidad_id, tipo, descripcion, foto_url, metadata, created_at)
-- SELECT
--   'preoperacional', preoperacional_id, tipo, descripcion, foto_url,
--   jsonb_build_object('validada', validada, 'resultado_validacion', resultado_validacion),
--   created_at
-- FROM fotos_evidencia;

-- BACKFILL desde fotos_posoperacional:
-- INSERT INTO evidencia (entidad_tipo, entidad_id, tipo, descripcion, foto_url, metadata, created_at)
-- SELECT
--   'posoperacional', posoperacional_id, tipo, descripcion, foto_url,
--   jsonb_build_object('novedad_id', novedad_id),
--   created_at
-- FROM fotos_posoperacional;

-- BACKFILL desde fotos_tanqueo:
-- INSERT INTO evidencia (entidad_tipo, entidad_id, tipo, descripcion, foto_url, metadata, created_at)
-- SELECT 'tanqueo', tanqueo_id, tipo, descripcion, foto_url, '{}'::jsonb, created_at
-- FROM fotos_tanqueo;

-- Verificar conteos antes de drop:
-- SELECT 'fotos_evidencia' AS origen, COUNT(*) FROM fotos_evidencia
-- UNION ALL SELECT 'fotos_posoperacional', COUNT(*) FROM fotos_posoperacional
-- UNION ALL SELECT 'fotos_tanqueo', COUNT(*) FROM fotos_tanqueo
-- UNION ALL SELECT 'evidencia (total)', COUNT(*) FROM evidencia;

-- DROP ejecutar solo después de validar backfill y actualizar código:
-- DROP TABLE fotos_evidencia, fotos_posoperacional, fotos_tanqueo;


-- ----------------------------------------------------------------
-- PASO 5: FKs EXPLÍCITAS EN TABLAS EXISTENTES
-- Problema: las relaciones existen en código pero no en BD.
-- Sin FKs, un bug puede insertar activo_id que no existe — sin error.
-- ----------------------------------------------------------------

-- sedes → empresas
ALTER TABLE sedes
  ADD CONSTRAINT sedes_empresa_id_fkey
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT;

-- activos → empresas, tipos_activo
ALTER TABLE activos
  ADD CONSTRAINT activos_empresa_id_fkey
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT;

ALTER TABLE activos
  ADD CONSTRAINT activos_tipo_activo_id_fkey
  FOREIGN KEY (tipo_activo_id) REFERENCES tipos_activo(id) ON DELETE RESTRICT;

-- plantillas → tipos_activo, empresas (nullable — templates globales)
ALTER TABLE plantillas_inspeccion
  ADD CONSTRAINT plantillas_tipo_activo_id_fkey
  FOREIGN KEY (tipo_activo_id) REFERENCES tipos_activo(id) ON DELETE RESTRICT;

-- plantilla_grupos → plantillas_inspeccion
ALTER TABLE plantilla_grupos
  ADD CONSTRAINT plantilla_grupos_plantilla_id_fkey
  FOREIGN KEY (plantilla_id) REFERENCES plantillas_inspeccion(id) ON DELETE CASCADE;

-- plantilla_items → plantilla_grupos
ALTER TABLE plantilla_items
  ADD CONSTRAINT plantilla_items_grupo_id_fkey
  FOREIGN KEY (grupo_id) REFERENCES plantilla_grupos(id) ON DELETE CASCADE;

-- historial_estado_activo → activos
ALTER TABLE historial_estado_activo
  ADD CONSTRAINT historial_activo_id_fkey
  FOREIGN KEY (activo_id) REFERENCES activos(id) ON DELETE RESTRICT;

-- preoperacionales → activos, conductores, plantillas
ALTER TABLE preoperacionales
  ADD CONSTRAINT preop_activo_id_fkey
  FOREIGN KEY (activo_id) REFERENCES activos(id) ON DELETE RESTRICT;

ALTER TABLE preoperacionales
  ADD CONSTRAINT preop_conductor_id_fkey
  FOREIGN KEY (conductor_id) REFERENCES conductores(id) ON DELETE RESTRICT;

ALTER TABLE preoperacionales
  ADD CONSTRAINT preop_plantilla_id_fkey
  FOREIGN KEY (plantilla_id) REFERENCES plantillas_inspeccion(id) ON DELETE RESTRICT;

-- posoperacionales → activos, conductores
ALTER TABLE posoperacionales
  ADD CONSTRAINT posop_activo_id_fkey
  FOREIGN KEY (activo_id) REFERENCES activos(id) ON DELETE RESTRICT;

ALTER TABLE posoperacionales
  ADD CONSTRAINT posop_conductor_id_fkey
  FOREIGN KEY (conductor_id) REFERENCES conductores(id) ON DELETE RESTRICT;

-- tanqueos → activos
ALTER TABLE tanqueos
  ADD CONSTRAINT tanqueos_activo_id_fkey
  FOREIGN KEY (activo_id) REFERENCES activos(id) ON DELETE RESTRICT;

-- autorizaciones_novedad → preoperacionales, activos
ALTER TABLE autorizaciones_novedad
  ADD CONSTRAINT autorizaciones_preop_id_fkey
  FOREIGN KEY (preoperacional_id) REFERENCES preoperacionales(id) ON DELETE RESTRICT;

ALTER TABLE autorizaciones_novedad
  ADD CONSTRAINT autorizaciones_activo_id_fkey
  FOREIGN KEY (activo_id) REFERENCES activos(id) ON DELETE RESTRICT;

-- novedades_posoperacional → posoperacionales
ALTER TABLE novedades_posoperacional
  ADD CONSTRAINT novedades_posop_id_fkey
  FOREIGN KEY (posoperacional_id) REFERENCES posoperacionales(id) ON DELETE CASCADE;

-- usuarios_panel → empresas
ALTER TABLE usuarios_panel
  ADD CONSTRAINT usuarios_panel_empresa_id_fkey
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT;

-- usuarios_roles → usuarios_panel, roles
ALTER TABLE usuarios_roles
  ADD CONSTRAINT usuarios_roles_usuario_id_fkey
  FOREIGN KEY (usuario_id) REFERENCES usuarios_panel(id) ON DELETE CASCADE;

ALTER TABLE usuarios_roles
  ADD CONSTRAINT usuarios_roles_rol_id_fkey
  FOREIGN KEY (rol_id) REFERENCES roles(id) ON DELETE RESTRICT;

-- permisos_rol → roles
ALTER TABLE permisos_rol
  ADD CONSTRAINT permisos_rol_rol_id_fkey
  FOREIGN KEY (rol_id) REFERENCES roles(id) ON DELETE CASCADE;

-- reglas_pico_placa → ciudades_pico_placa
ALTER TABLE reglas_pico_placa
  ADD CONSTRAINT reglas_ciudad_id_fkey
  FOREIGN KEY (ciudad_id) REFERENCES ciudades_pico_placa(id) ON DELETE CASCADE;


-- ----------------------------------------------------------------
-- PASO 6: CHECK CONSTRAINTS DE DOMINIO
-- Problema: valores de texto libre sin validación. Un bug puede
-- insertar estado='OPERATIVO' (mayúsculas) y romper filtros.
-- ----------------------------------------------------------------

ALTER TABLE activos
  ADD CONSTRAINT activos_estado_check
  CHECK (estado IN ('operativo', 'bloqueado', 'taller', 'retirado'));

ALTER TABLE preoperacionales
  ADD CONSTRAINT preop_estado_check
  CHECK (estado IN ('en_curso', 'completado', 'cancelado'));

ALTER TABLE tanqueos
  ADD CONSTRAINT tanqueos_tipo_check
  CHECK (tipo_tanqueo IN ('convenio', 'efectivo', 'tarjeta'));

ALTER TABLE tanqueos
  ADD CONSTRAINT tanqueos_estado_validacion_check
  CHECK (estado_validacion IN ('pendiente_revision', 'aprobado', 'rechazado'));

ALTER TABLE plantillas_inspeccion
  ADD CONSTRAINT plantillas_tipo_inspeccion_check
  CHECK (tipo_inspeccion IN ('preoperacional', 'posoperacional'));


-- ================================================================
-- TABLAS FUERA DE SCOPE (no tocar en esta migración)
-- ================================================================
-- permisos_trabajo  → Fase 3, no activa
-- turnos            → sin uso activo en código
-- ciudades_pico_placa / reglas_pico_placa → catálogo compartido, sin deuda
-- sesiones_activas  → caché efímero, solo se agregó PK en Paso 1
-- accesos_auditoria → estructura correcta, sin deuda activa
