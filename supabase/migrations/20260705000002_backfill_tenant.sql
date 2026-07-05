-- ═══════════════════════════════════════════════════════════
-- 20260705000002_backfill_tenant.sql
-- PR 0 multi-tenant: backfill de sede_id/empresa_id previo al
-- scope obligatorio en data/ (tenantScope, commit bccba39).
--
-- REGLA: solo rellena NULLs desde fuentes NO ambiguas.
-- Idempotente — se puede correr varias veces.
-- Correr PASO 0 (diagnóstico) antes; si algo queda en "ambiguos",
-- resolver a mano antes de dar por cerrada la PR 0.
-- ═══════════════════════════════════════════════════════════

-- ─── PASO 0: DIAGNÓSTICO (solo SELECT — correr primero) ───

-- 0.1 Activos sin sede (quedarían INVISIBLES con el scope fail-closed)
select 'activos_sin_sede' as check_, count(*) from activos
where sede_id is null and activo = true;

-- 0.2 Conductores: estado de tenant
select 'conductores' as check_, count(*) as total,
       count(*) filter (where sede_id is null) as sin_sede,
       count(*) filter (where empresa_id is null) as sin_empresa
from conductores;

-- 0.3 Transaccionales: sede_id null o inconsistente con su activo
select 'tanqueos' as tabla,
       count(*) filter (where t.sede_id is null) as sede_null,
       count(*) filter (where t.sede_id is distinct from a.sede_id) as inconsistente
from tanqueos t left join activos a on a.id = t.activo_id
union all
select 'preoperacionales',
       count(*) filter (where p.sede_id is null),
       count(*) filter (where p.sede_id is distinct from a.sede_id)
from preoperacionales p left join activos a on a.id = p.activo_id
union all
select 'posoperacionales',
       count(*) filter (where p.sede_id is null),
       count(*) filter (where p.sede_id is distinct from a.sede_id)
from posoperacionales p left join activos a on a.id = p.activo_id
union all
select 'autorizaciones_novedad',
       count(*) filter (where x.sede_id is null),
       count(*) filter (where x.sede_id is distinct from a.sede_id)
from autorizaciones_novedad x left join activos a on a.id = x.activo_id;

-- 0.4 Empresas con más de una sede activa (si hay, los backfills
--     "sede única" de abajo NO las tocan — revisar a mano)
select e.id, e.nombre, count(s.id) as sedes_activas
from empresas e join sedes s on s.empresa_id = e.id and s.activa
group by e.id, e.nombre having count(s.id) > 1;

-- ─── PASO 1: BACKFILL (transaccional) ───

begin;

-- 1.1 activos.sede_id: única sede activa de SU empresa (no ambiguo)
update activos a
set sede_id = unica.id
from (
  select s.empresa_id, min(s.id::text)::uuid as id
  from sedes s where s.activa
  group by s.empresa_id having count(*) = 1
) unica
where a.sede_id is null and a.empresa_id = unica.empresa_id;

-- 1.2 conductores.empresa_id: derivado de su sede (no ambiguo)
update conductores c
set empresa_id = s.empresa_id
from sedes s
where c.empresa_id is null and c.sede_id = s.id;

-- 1.3 conductores.sede_id: solo si la plataforma entera tiene UNA
--     empresa con UNA sede activa (caso actual: Enerlight).
--     Con cliente #2 este update deja de aplicar solo — el guard
--     de "1 sola empresa" lo desactiva.
update conductores c
set sede_id = (select s.id from sedes s where s.activa),
    empresa_id = coalesce(c.empresa_id, (select s.empresa_id from sedes s where s.activa))
where c.sede_id is null
  and (select count(*) from sedes where activa) = 1;

-- 1.4 Transaccionales: sincronizar sede_id denormalizado con el activo
--     (higiene — el scope NO confía en estas columnas, va por join)
update tanqueos t set sede_id = a.sede_id
from activos a where t.activo_id = a.id and t.sede_id is distinct from a.sede_id;

update preoperacionales p set sede_id = a.sede_id
from activos a where p.activo_id = a.id and p.sede_id is distinct from a.sede_id;

update posoperacionales p set sede_id = a.sede_id
from activos a where p.activo_id = a.id and p.sede_id is distinct from a.sede_id;

update autorizaciones_novedad x set sede_id = a.sede_id
from activos a where x.activo_id = a.id and x.sede_id is distinct from a.sede_id;

-- ─── PASO 2: VERIFICACIÓN (dentro de la transacción) ───
-- Todo debe dar 0 salvo casos ambiguos documentados.

select 'POST activos_sin_sede' as check_, count(*) from activos
where sede_id is null and activo = true
union all
select 'POST conductores_sin_sede', count(*) from conductores where sede_id is null
union all
select 'POST conductores_sin_empresa', count(*) from conductores where empresa_id is null;

commit;

-- ─── PASO 3: FIX PUNTUAL (aplicado 2026-07-05) ───
-- Conductor inscrito por WhatsApp sin sede (insertarConductor no la
-- asigna — data/conductores.js:84). Sede derivada de su último preop.
update conductores c
set sede_id = sub.sede_id,
    empresa_id = sub.empresa_id
from (
  select a.sede_id, a.empresa_id
  from preoperacionales p
  join activos a on a.id = p.activo_id
  where p.conductor_id = 'ed41f465-92a2-4fc3-9b4c-744f30dd00fd'
  order by p.fecha desc, p.hora desc
  limit 1
) sub
where c.id = 'ed41f465-92a2-4fc3-9b4c-744f30dd00fd'
  and c.sede_id is null;

-- ─── PENDIENTE POST-BACKFILL — BLOQUEADO por fase 1.5 ───
-- NO aplicar NOT NULL todavía: insertarConductor (flujo de inscripción
-- WhatsApp, data/conductores.js:84) inserta sin sede_id/empresa_id y
-- rompería en producción. Orden: fase 1.5 (tenant en inscripción
-- WhatsApp) primero, luego:
--   alter table conductores alter column empresa_id set not null;
--   alter table conductores alter column sede_id set not null;
--   alter table activos alter column sede_id set not null;
-- y el UNIQUE (cedula, empresa_id) de la migración v2.
