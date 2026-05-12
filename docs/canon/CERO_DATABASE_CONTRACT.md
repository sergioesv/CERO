# CERO — Contrato de Base de Datos

> Documento de control. No editar sin decisión explícita registrada en docs/adr/.
> Fuente de verdad para todo lo que toca la base de datos.

---

## 1. Tablas core

Estas tablas son el núcleo operativo de CERO. Sin ellas el sistema no funciona.

| Tabla | Rol |
|---|---|
| `activos` | Todos los activos de flota — vehículos, grúas, motos, equipos estáticos |
| `conductores` | Conductores registrados — nombre, cédula, teléfono, licencia |
| `preoperacionales` | Inspecciones de inicio de turno — activo_id, respuestas JSONB, km |
| `posoperacionales` | Inspecciones de cierre de turno — activo_id, km final |
| `tanqueos` | Registros de combustible — activo_id, validación OCR, rendimiento |
| `historial_estado_activo` | Línea de tiempo de estados de cada activo |
| `fotos_evidencia` | Fotos de preoperacionales vinculadas a un preoperacional_id |
| `fotos_tanqueo` | Fotos de tanqueos vinculadas a un tanqueo_id |
| `autorizaciones_novedad` | Autorizaciones de supervisores sobre novedades en preoperacionales |

### Tablas de configuración dinámica

| Tabla | Rol |
|---|---|
| `plantillas_inspeccion` | Plantillas de inspección por tipo de activo |
| `plantilla_grupos` | Grupos de preguntas dentro de una plantilla |
| `plantilla_items` | Preguntas individuales con subpreguntas opcionales |
| `tipos_activo` | Catálogo de tipos: vehiculo_liviano, grua, moto, maquina_estatica |

### Tablas de multi-tenancy y acceso

| Tabla | Rol |
|---|---|
| `empresas` | Empresas cliente — nivel de aislamiento más alto |
| `sedes` | Sedes dentro de una empresa |
| `usuarios_panel` | Usuarios del panel administrativo con rol y sede |
| `alertas` | Alertas de vencimiento de documentos y licencias |

### Tablas de soporte

| Tabla | Rol |
|---|---|
| `sesiones_activas` | Sesiones WhatsApp en curso — persistencia de emergencia |
| `dashboard_snapshots` | Cache de métricas del panel ejecutivo |

### Tabla eliminada — prohibido recrear

`vehiculos` fue eliminada en la migración v26 (19/04/2026). Todo opera sobre `activos`.
No existe, no debe existir, y ningún código nuevo debe referenciarla.

---

## 2. Reglas que deben cumplir las tablas

### Regla 1 — toda tabla core tiene `id`, `created_at`, `updated_at`

```sql
id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY
created_at  timestamptz DEFAULT now() NOT NULL
updated_at  timestamptz DEFAULT now() NOT NULL
```

`updated_at` debe actualizarse explícitamente en cada `UPDATE`. No se actualiza sola sin trigger.

### Regla 2 — las claves foráneas siempre referencian UUIDs

Toda relación entre tablas usa `uuid` como clave. Nunca se usa placa, cédula u otro
string de negocio como FK. La placa es un campo de búsqueda, no una clave.

```sql
activo_id    uuid REFERENCES activos(id)
conductor_id uuid REFERENCES conductores(id)
```

### Regla 3 — los campos JSONB solo se usan para datos variables o extensibles

`activos.documentos` y `activos.datos` son JSONB porque sus campos varían por tipo de activo.
`preoperacionales.respuestas` es JSONB porque las preguntas son dinámicas (plantilla).

Regla de escritura: **siempre merge, nunca overwrite**.

```sql
-- Correcto
UPDATE activos SET documentos = documentos || '{"soat_vencimiento": "2026-12-01"}' WHERE id = $1;

-- Prohibido
UPDATE activos SET documentos = '{"soat_vencimiento": "2026-12-01"}' WHERE id = $1;
```

### Regla 4 — los campos de estado usan valores de enumeración estables

`activos.estado` usa: `OK`, `NOVEDAD`, `FUERA_DE_SERVICIO`.
`tanqueos.estado_validacion` usa: `pendiente_revision`, `auto_validado`, `revisado`, `validado`.

Si se necesita un nuevo valor, se documenta aquí antes de insertarlo.

### Regla 5 — `historial_estado_activo.cambiado_por` es UUID o NULL

Nunca un string como `'panel'` o `'sistema'`. El código valida con UUID_REGEX antes
de insertar. Si el origen no es un usuario identificado, el campo va a `NULL`.

### Regla 6 — las tablas de multi-tenancy filtran por `empresa_id` o `sede_id`

Toda query en rutas del panel debe filtrar por `empresa_id` o `sede_id` obtenidos
de `req.usuario`. La excepción es `superadmin_plataforma`, que ve todo.

---

## 3. Convenciones de UUID, timestamps y soft delete

### UUID

- Tipo: `uuid`, generado con `gen_random_uuid()` en PostgreSQL.
- Todo `id` de tabla es UUID.
- Toda FK es UUID.
- Antes de insertar un UUID en `cambiado_por` u otro campo FK opcional, validar con:
  `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`
- Si no pasa la validación, insertar `NULL`.

### Timestamps

- Tipo: `timestamptz` (con zona horaria). Nunca `timestamp` sin zona.
- Valor por defecto: `now()` o `DEFAULT now()`.
- Zona operativa de Colombia: UTC-5. El código ajusta a UTC-5 para cálculos de "hoy".
- Formato para queries JS: `new Date().toISOString()` — siempre UTC, siempre string ISO 8601.
- `created_at` nunca se modifica tras la inserción.
- `updated_at` se actualiza en cada `UPDATE` explícitamente desde el código de aplicación.

### Soft delete

CERO no usa soft delete global. Las reglas por tabla son:

| Tabla | Patrón |
|---|---|
| `conductores` | Campo `activo boolean` — `false` equivale a inactivo. No se elimina. |
| `activos` | Campo `estado` — `FUERA_DE_SERVICIO` equivale a inactivo. No se elimina. |
| Inspecciones / tanqueos | Registros históricos. Nunca se eliminan. Solo se anulan si hay proceso explícito. |
| `usuarios_panel` | Sin soft delete definido aún — pendiente antes de piloto. |

**No agregar** un campo `deleted_at` a ninguna tabla sin decisión registrada en docs/adr/.

---

## 4. Prohibido hacer manualmente en base de datos

Las siguientes acciones están prohibidas directamente en el cliente de Supabase,
en psql, o en cualquier herramienta de administración:

1. **`DROP TABLE`** en cualquier tabla core o de configuración.
2. **`DROP COLUMN`** sin migration que lo respalde.
3. **`ALTER TABLE ... ADD COLUMN`** sin migration — el schema debe reflejar el estado real.
4. **`UPDATE` o `DELETE` masivos** sin respaldo previo documentado.
5. **Sobrescribir campos JSONB** (documentos, datos, respuestas) con un objeto parcial
   que destruya campos existentes.
6. **Insertar strings en campos UUID** (placa, 'panel', 'sistema', etc.).
7. **Cambiar el estado de un activo directamente** sin pasar por `registrarCambioEstado` —
   porque rompe el historial.
8. **Ejecutar queries contra la base de producción** desde entorno de desarrollo.
9. **Crear o eliminar políticas RLS** sin revisión y sin documentarlo.
10. **Truncar tablas de historial** (`historial_estado_activo`, `fotos_evidencia`,
    `fotos_tanqueo`) — son trazabilidad legal.

---

## 5. Qué debe existir antes de tocar producción

Antes de ejecutar cualquier migración o cambio en la base de datos de producción:

### Checklist obligatorio

- [ ] La migración existe como archivo `.sql` versionado en `supabase/migrations/`.
- [ ] La migración fue probada en un ambiente local o staging sin errores.
- [ ] Se verificó que la migración es reversible o se documentó por qué no lo es.
- [ ] Si agrega columnas NOT NULL, la migración incluye un valor DEFAULT o backfill.
- [ ] Si elimina columnas, el código que las referencia fue actualizado y desplegado antes.
- [ ] Si cambia el tipo de un campo, se probó la compatibilidad con datos existentes.
- [ ] Se tiene respaldo (backup) de la base de datos antes de ejecutar.
- [ ] Hay un plan de rollback escrito antes de empezar.
- [ ] Existe un ambiente fuera de producción donde la migración ya corrió correctamente.
- [ ] El responsable técnico aprobó la migración explícitamente.

### Estado actual

RLS no está habilitado. Debe activarse antes del segundo cliente.
Ver checklist completo en ARCHITECTURE.md — sección "Security — before production".

---

## 6. Qué significa que una migration sea aceptable

Una migración es aceptable si cumple **todos** los siguientes criterios:

### Criterios técnicos

1. **Existe como archivo versionado** en `supabase/migrations/` con nombre `YYYYMMDDHHMMSS_descripcion.sql`.
2. **Es idempotente o segura de re-ejecutar** — usa `IF NOT EXISTS`, `IF EXISTS`, o transacción con rollback limpio.
3. **No destruye datos** — si elimina columnas o tablas, los datos fueron migrados o respaldados.
4. **No rompe el código en producción actual** — si es un cambio breaking, el código se actualiza primero.
5. **No asume estado previo no garantizado** — si depende de datos existentes, los verifica antes de actuar.

### Criterios de proceso

6. **Fue revisada por al menos una persona** antes de ejecutarse en producción.
7. **Tiene descripción clara** de qué cambia y por qué en el nombre del archivo o comentario inicial.
8. **Fue probada en local** con datos representativos, no solo con schema vacío.
9. **Tiene rollback documentado** — ya sea un script de reversa o la justificación de por qué no aplica.

### Criterios de negocio

10. **Respeta el canon** — no introduce dependencias directas de Supabase en módulos de negocio,
    no crea lógica de negocio en el schema (triggers complejos sin revisión), no rompe el aislamiento
    multi-tenant.
11. **Está asociada a un objetivo claro** — no se migra "por si acaso". Cada cambio tiene un motivo
    documentado en el commit o en docs/adr/.

### Lo que convierte una migration en inaceptable

- Elimina tablas o columnas que aún consume el código en producción.
- Sobrescribe campos JSONB con valores parciales.
- Rompe el historial de auditoría (historial_estado_activo, fotos_evidencia, fotos_tanqueo).

---

*Última actualización: 2026-05-11 — basado en schema v26 y código fuente actual.*
*Actualizar este documento ante cualquier cambio estructural de base de datos.*
