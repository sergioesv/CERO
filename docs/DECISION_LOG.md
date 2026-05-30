# CERO — Decision Log

Decisiones arquitectónicas y operativas relevantes. Actualizar en el mismo commit del cambio.

Formato: | Fecha | Decisión | Razón | Violación cerrada |

---

| Fecha | Decisión | Razón | Violación cerrada |
|---|---|---|---|
| 2026-05-29 | Mover SQL de rutas/plantillas.js a data/plantillas.js (CRUD completo de plantillas/grupos/items) | rutas/ no debe contener queries Supabase | — |
| 2026-05-29 | Mover SQL de rutas/preoperacionales.js a data/inspecciones.js (listarPreoperacionales, obtenerPreoperacionalDetalle) | rutas/ no debe contener queries Supabase | — |
| 2026-05-29 | Mover query evidencia de rutas/tanqueos.js a data/tanqueos.obtenerFotoEvidencia | rutas/ no debe contener queries Supabase | — |
| 2026-05-29 | rutas/ completamente limpia de SQL directo — unica excepcion documentada: rutas/activos.js | Arquitectura SRP completada en capa rutas/ | — |
| 2026-05-29 | Crear data/usuarios.js con todas las queries de usuarios/auth — rutas/auth.js y rutas/usuarios.js ya sin SQL directo | rutas/ no debe contener queries Supabase | — |
| 2026-05-29 | Eliminar SQL directo de rutas/alertas.js — delega a data/alertas.js (obtenerVencimientosActivos/Licencias) | rutas/ no debe contener queries Supabase | — |
| 2026-05-29 | Agregar listarRoles() a data/permisos.js — rutas/roles.js ya no tiene SQL directo | rutas/ no debe contener queries Supabase | — |
| 2026-05-29 | Mover queries de rutas/conductores.js a data/conductores.js | rutas/ no debe contener SQL — viola SRP. data/conductores.js existia vacio. | — |
| 2026-05-29 | Mover /api/dashboard/resumen de index.js a rutas/dashboard.js + data/dashboard.js | index.js es punto de entrada, no debe contener logica ni SQL | — |
| 2026-05-29 | Marcar data/ats.js, riesgosLocativos.js, revisionesEquipos.js como DEPRECADOS | Archivos de 3 lineas sin funciones — las constantes ya existen en config.TABLES. Eliminar con git rm | — |
| 2026-05-29 | Extraer interpretadorNovedades.js de servicios/ocr.js — romper ciclo circular ocr <-> validacionVisual | servicios/ no puede importar de modulos/ (V-01). Logica de dominio de inspecciones no pertenece en capa de servicios (V-02). Nuevo modulo: modulos/inspecciones/compartido/interpretadorNovedades.js | V-01, V-02 |
| 18/05/2026 | Decision Log separado de ARCHITECTURE.md | ARCHITECTURE.md tiene sección auto-generada por GitHub Actions — mezclarla con edición manual causaba conflictos git predecibles | — |
| 16/05/2026 | Zona 2 del dashboard consume /api/dashboard/general + /api/dashboard/activos en paralelo. Card "Documentación" muestra documentos_por_vencer como proxy de "vencidos" | Endpoint no expone inspecciones.total, novedades.criticas, documentacion.vencidos. Revisar cuando data/dashboard.js exponga esos campos | — |
| 19/04/2026 | Recuperación de sesión expirada — timeout 30 min + ventana recuperable 5 min, tanqueo 10 min | UX: sesiones se borraban silenciosamente. Ahora se ofrece continuar/reiniciar. Inscripción no recuperable (pocos pasos). | — |
| 19/04/2026 | v26 — tabla vehiculos eliminada, todo sobre activos con activo_id UUID | Modelo genérico para vehículos, grúas, motos, equipos estáticos | — |
| 19/04/2026 | Plantillas dinámicas — plantillas_inspeccion + grupos + items | Agregar tipo inspección = insertar filas en BD, cero código nuevo | — |
| 19/04/2026 | plantillas.cargar() retorna default en lugar de throw | Posop no requiere plantilla — el throw bloqueaba el flujo | — |
| 19/04/2026 | PUT /api/activos acepta UUID o placa como parámetro | Frontend envía UUID, ruta esperaba placa | — |
| 19/04/2026 | cambiado_por valida UUID antes de insert en historial | Strings 'panel'/'sistema' causaban error de tipo en PostgreSQL | — |
| 18/04/2026 | Refactor flujos WhatsApp a clases FlujoBase + herencia | Eliminar código duplicado masivo (~50% reducción) | — |
| 18/04/2026 | Centralizar TwiML en compartido/twiml.js | responderTwiml y escaparXml estaban copiados en 4 archivos | — |
| 17/04/2026 | Rebranding a dialk — eliminar EDEMSA del código | Riesgo legal — EDEMSA no es cliente firmado | — |
| 10/04/2026 | ARCHITECTURE.md como fuente de verdad del estado del proyecto | Reemplaza archivos de sesión de diseño dispersos | — |

## Schema v2 — Gaps corregidos (2026-05-18)

### Gap 1: Multi-tenant incompleto en conductores
**Problema:** `conductores` solo tenía `sede_id`. Para saber a qué empresa pertenece
un conductor había que hacer JOIN a `sedes`. Con múltiples clientes esto es una
bomba de datos cruzados — un bug de filtro expone conductores de otra empresa.
**Solución:** Agregar `empresa_id uuid NOT NULL` con FK a `empresas`.
**Backfill:** Derivar `empresa_id` desde `sedes` vía `sede_id` existente.

---

### Gap 2: Conductor en tanqueos referenciado por texto libre
**Problema:** `tanqueos.telefono_reporta` y `nombre_reportado` son strings sueltos,
no FKs. Si el conductor cambia de teléfono, los registros históricos quedan con
dato viejo. No hay integridad referencial.
**Solución:** Agregar `conductor_id_v2 uuid` con FK a `conductores`.
`telefono_reporta` y `nombre_reportado` se conservan como audit trail histórico,
marcados como deprecados con COMMENT.
**Backfill:** Match por `telefono_reporta = conductores.telefono` dentro de misma sede.
Registros sin match requieren revisión manual.

---

### Gap 3: Datos OCR mezclados en tanqueos (~45 columnas)
**Problema:** `tanqueos` mezcla datos operacionales (qué se tanqueó, cuánto, dónde)
con datos de validación antifraude OCR (Gemini). Son dos responsabilidades distintas.
El resultado es una tabla de ~45 columnas, difícil de mantener y costosa de consultar.
**Solución:** Extraer columnas OCR a tabla `tanqueos_ocr` con relación 1:1.
La operación de tanqueo queda limpia. El pipeline OCR escribe en su propia tabla.
**Backfill:** INSERT INTO tanqueos_ocr SELECT desde columnas OCR de tanqueos existentes.

---

### Gap 4: Tres tablas de fotos con estructura idéntica
**Problema:** `fotos_evidencia`, `fotos_posoperacional` y `fotos_tanqueo` tienen
exactamente las mismas columnas. Cualquier cambio en la estructura de fotos
(agregar metadatos, campo de compresión, etc.) requiere migrar tres tablas.
**Solución:** Tabla polimórfica `evidencia` con `entidad_tipo` + `entidad_id`.
Campos específicos por tipo van en `metadata jsonb` para no romper la estructura base.
**Backfill:** INSERT desde cada tabla original con su `entidad_tipo` correspondiente.
Las tablas originales se mantienen hasta validar backfill y actualizar código.

---

### Gap 5: Sin PK en sesiones_activas
**Problema:** `telefono` es la clave natural de sesiones pero no estaba declarado
como PRIMARY KEY. Un INSERT duplicado no genera error en PostgreSQL, inserta segunda
fila y corrompe el estado de sesión silenciosamente.
**Solución:** `ALTER TABLE sesiones_activas ADD PRIMARY KEY (telefono)`.

---

### Gap 6: Sin UNIQUE en campos críticos
**Problema:** `empresas.nit`, `usuarios_panel.email`, `conductores(cedula, empresa_id)`,
`activos(placa, empresa_id)` y `tipos_activo.codigo` no tenían constraint UNIQUE.
Un bug o race condition puede duplicar registros sin error.
**Solución:** UNIQUE constraints explícitos en cada campo.
Nota: placa única por empresa, no global — dos empresas pueden tener placas iguales
en sus registros internos.

---

### Gap 7: Sin FKs explícitas en BD
**Problema:** Todas las relaciones existían solo en el código Node.js. Sin FKs en BD,
un bug puede insertar `activo_id` inexistente en `preoperacionales` sin error. La BD
no garantiza integridad por sí sola.
**Solución:** FKs explícitas con ON DELETE definido en todas las relaciones.
ON DELETE RESTRICT en la mayoría (no borrar padre si tiene hijos).
ON DELETE CASCADE en relaciones de composición (plantilla_items, novedades_posoperacional).

---

### Gap 8: Sin CHECK constraints de dominio
**Problema:** Valores de estado son texto libre. Un bug puede insertar 'OPERATIVO'
(mayúsculas) y romper todos los filtros que buscan 'operativo'.
**Solución:** CHECK constraints en activos.estado, preoperacionales.estado,
tanqueos.tipo_tanqueo, tanqueos.estado_validacion, plantillas_inspeccion.tipo_inspeccion.

---

### Decisión: sede_id en registros operacionales
**Pregunta:** ¿Eliminar sede_id redundante de preoperacionales/posoperacionales/tanqueos
dado que activos ya tiene sede_id?
**Decisión:** MANTENER como snapshot histórico.
**Razón:** Si un activo cambia de sede, los registros históricos deben reflejar
la sede en el momento del registro, no la sede actual. Eliminar sede_id y resolver
via JOIN a activos.sede_id devolvería la sede actual, no la histórica.
**Regla de uso:** sede_id en registros operacionales es dato histórico, no se usa
para filtros en tiempo real. Para filtrar "activos de esta sede", usar activos.sede_id.

---

### Tablas fuera de scope en v2
- `permisos_trabajo`: Fase 3, no activa.
- `turnos`: sin uso activo en código actual.
- `ciudades_pico_placa` / `reglas_pico_placa`: catálogo compartido sin deuda.
- `accesos_auditoria`: estructura correcta, sin deuda activa.
