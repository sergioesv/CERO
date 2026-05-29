# CERO — Reglas de Arquitectura

> Documento de control. No editar sin decisión explícita registrada en docs/adr/.
> Fuente de verdad para estructura de capas, dependencias permitidas y criterios de refactor.

---

## 1. Capas permitidas de CERO

CERO tiene siete capas. Cada una tiene una responsabilidad única y límites estrictos.

| Capa | Carpeta | Rol |
|---|---|---|
| **Rutas** | `rutas/` | HTTP — recibir, validar entrada, delegar, responder |
| **Datos** | `data/` | Queries a Supabase — única capa que habla con la BD |
| **Módulos** | `modulos/` | Lógica de negocio — flujos WhatsApp, alertas, inscripción |
| **Servicios** | `servicios/` | Servicios externos — PDF, OCR, Storage, sesiones |
| **Canales** | `canales/` | Enrutadores de entrada — WhatsApp webhook, Dashboard |
| **Middlewares** | `middlewares/` | Auth — verificarToken, verificarPermiso |
| **Frontend** | `public/` | SPA Vanilla JS — nunca lógica de negocio aquí |

`config/config.js` es transversal: todas las capas pueden leerlo. No es una capa en sí misma.

---

## 2. Qué puede hacer cada capa

### `rutas/`
- Recibir requests HTTP.
- Extraer parámetros de `req.params`, `req.query`, `req.body`.
- Llamar funciones de `data/` para leer o escribir.
- Llamar servicios de `servicios/` cuando la ruta lo requiere directamente.
- Responder con `res.json()` o `res.status().json()`.
- Aplicar middlewares de `middlewares/`.

### `data/`
- Ejecutar queries contra Supabase (select, insert, update).
- Encapsular la lógica de acceso a datos: filtros, joins, ordenamiento.
- Devolver datos limpios — sin lógica de negocio, sin formato de respuesta HTTP.
- Usar el cliente Supabase de `config/config.js`.

### `modulos/`
- Contener toda la lógica de negocio de los flujos WhatsApp.
- Extender `FlujoBase` para nuevos flujos de inspección.
- Llamar funciones de `data/` para leer o persistir datos.
- Llamar `servicios/` para OCR, PDF, Storage, sesiones.
- Exportar funciones puras de validación y mensajes.

### `servicios/`
- Integrar APIs externas: Gemini (OCR), Twilio, PDFKit, Supabase Storage.
- Manejar sesiones WhatsApp en memoria + persistencia.
- Generar PDFs con los generadores de `servicios/pdf/`.
- Subir y obtener signed URLs de Supabase Storage.

### `canales/`
- Recibir el webhook de Twilio y enrutar a los módulos correctos.
- Manejar la recuperación de sesiones expiradas.
- Interactuar con el dashboard operativo.
- No contener lógica de negocio — solo enrutamiento y coordinación.

### `middlewares/`
- Verificar JWT y adjuntar `req.usuario`.
- Verificar permisos por rol antes de delegar a la ruta.
- No contener lógica de negocio ni queries directas.

### `public/`
- Renderizar la SPA: HTML, CSS, JS sin frameworks.
- Dividir cada módulo en cuatro objetos: `API`, `Logic`, `Render`, `Module`.
- Consumir la API REST de `rutas/` con fetch + JWT.
- Escapar todo HTML con `Utils.escaparHTML` antes de insertar en el DOM.

---

## 3. Qué NO puede hacer cada capa

### `rutas/` — prohibido
- Contener lógica de negocio: cálculos, reglas, transformaciones complejas.
- Llamar directamente al cliente Supabase (salvo excepción documentada en `rutas/activos.js`).
- Mezclar responsabilidades de múltiples módulos en una sola ruta.

### `data/` — prohibido
- Contener lógica de negocio (validaciones de dominio, reglas de flujo).
- Formatear respuestas HTTP (`res.json`, códigos de estado).
- Llamar servicios externos (Twilio, Gemini, Storage).
- Importar nada de `modulos/`.

### `modulos/` — prohibido
- Usar el cliente Supabase directamente — siempre a través de `data/`.
- Importar de `rutas/`.
- Responder requests HTTP (`res`, `req`).
- Mezclar lógica de diferentes módulos dentro de un mismo archivo.
- Un `flujo.js` manejar estados que corresponden a otro módulo.

### `servicios/` — prohibido
- Contener lógica de negocio de dominio.
- Conocer los estados internos de los módulos.
- Importar de `modulos/` (la dependencia es en sentido contrario).

### `canales/` — prohibido
- Contener lógica de negocio.
- Hacer queries directas a Supabase.
- Duplicar validaciones que ya existen en módulos.

### `middlewares/` — prohibido
- Hacer queries a Supabase fuera de verificación de token/permiso.
- Contener lógica de negocio.

### `public/` — prohibido
- Contener secretos, tokens hardcodeados, o URLs de producción.
- Hacer lógica de negocio que deba ejecutarse en servidor.
- Insertar HTML sin escapar (`innerHTML` con datos externos sin `escaparHTML`).
- Leer campos JSONB anidados directamente: usar `row.soat_vencimiento`, NO `row.documentos?.soat_vencimiento`.

---

## 4. Carpetas que son legacy temporal

Estas carpetas existen pero están en proceso de estabilización o eliminación planificada.

| Carpeta / Archivo | Estado | Razón |
|---|---|---|
| `modulos/seguridad-campo/` | Fase 3 — no implementada | Los flujos ATS, revisión de equipos y riesgos locativos son placeholders. No contienen lógica real. No conectar. |
| `data/ats.js`, `data/revisionesEquipos.js`, `data/riesgosLocativos.js` | Fase 3 — vacíos o incompletos | Corresponden a módulos de Fase 3 no activos. |
| `rutas/activos.js` (uso directo de Supabase) | Excepción documentada — temporal | Usa Supabase directamente para CRUD simple hasta que `data/activos.js` cubra todos los casos. Es la única excepción aceptada hoy. |
| `servicios/pdf/base.js` y `servicios/pdf/preoperacional.js` / `posoperacional.js` | Duplicación en migración | Coexisten con `GeneradorPDFBase.js` y sus subclases. Eliminar los archivos planos cuando los generadores de clase cubran todos los casos. |

**Regla:** el código legacy puede existir, pero debe quedar aislado. No se crea nueva lógica de negocio sobre él.

---

## 5. Reglas para imports

### Dirección permitida de dependencias

```
public/          →  (API REST solamente, no imports directos)
rutas/           →  data/, servicios/, middlewares/, config/
canales/         →  modulos/, servicios/, config/
modulos/         →  data/, servicios/, config/
servicios/       →  config/
data/            →  config/
middlewares/     →  data/, config/
```

### Prohibido

- `data/` importando de `modulos/` o `rutas/`.
- `servicios/` importando de `modulos/` o `rutas/`.
- `modulos/` importando de `rutas/` o `canales/`.
- Cualquier capa importando directamente el cliente Supabase fuera de `data/` y `servicios/storage.js`.
- Imports circulares entre módulos del mismo nivel.

### Regla de módulos WhatsApp

Dentro de `modulos/inspecciones/<modulo>/`:
- `flujo.js` puede importar `estado.js`, `mensajes.js`, `validaciones.js`, `cierre.js` del mismo módulo.
- `flujo.js` extiende `FlujoBase` de `modulos/inspecciones/compartido/baseFlujo.js`.
- `cierre.js` importa de `data/`, `servicios/`, y puede importar `mensajes.js` del mismo módulo.
- Ningún archivo de un módulo importa de otro módulo de inspección (ej. preoperacional no importa de posoperacional).

---

## 6. Reglas para Supabase

### Quién puede usar el cliente Supabase

| Archivo | ¿Puede usar Supabase? | Nota |
|---|---|---|
| `data/*.js` | Sí | Propósito principal |
| `servicios/sesiones.js` | Sí | Persistencia de emergencia de sesiones |
| `servicios/storage.js` | Sí | Storage de evidencias y PDFs |
| `config/config.js` | Sí | Crea e inicializa el cliente |
| `rutas/activos.js` | Sí — excepción temporal | Documentado en ARCHITECTURE.md |
| Todo lo demás | No | Viola la arquitectura |

### Reglas de escritura en BD

1. Toda query nueva va en `data/`. Nunca inline en rutas o módulos.
2. Los campos JSONB (`documentos`, `datos`, `respuestas`) siempre se actualizan con merge: `campo || '{...}'`. Nunca overwrite completo.
3. `historial_estado_activo.cambiado_por` debe ser UUID válido o `NULL`. Nunca un string.
4. Todo cambio de estado de un activo pasa por `registrarCambioEstado` en `data/activos.js`.
5. No crear nuevas queries directas a Supabase dentro de `modulos/`.
6. No agregar nueva lógica de negocio dentro de `data/`.
7. Toda query en rutas del panel filtra por `empresa_id` o `sede_id` de `req.usuario`.

### Reglas de schema

1. Todo cambio de schema requiere migration en `supabase/migrations/`.
2. La tabla `vehiculos` fue eliminada en v26. No existe, no se recrea, no se referencia.
3. No agregar `deleted_at` a ninguna tabla sin decisión en docs/adr/.
4. No usar strings como FK — siempre UUID.

---

## 7. Reglas para Twilio, Gemini, PDF y Storage

### Twilio

- El único punto de entrada de Twilio es `canales/whatsapp.js`.
- La validación de firma Twilio (`firmaTwilioValida`) vive exclusivamente en `modulos/inspecciones/compartido/twiml.js`.
- No duplicar `responderTwiml` ni `escaparXml` — usar los de `compartido/twiml.js`.
- Las respuestas TwiML se construyen solo en los flujos de módulos — nunca en `data/` ni en `rutas/`.

### Gemini (OCR)

- Todo acceso a la API de Gemini pasa por `servicios/ocr.js`.
- No crear nuevos clientes de Gemini fuera de `config/config.js`.
- OCR de placas y odómetros usa el factory de `modulos/inspecciones/compartido/iniciadorFlujo.js` — no reimplementar.
- Las fotos de Twilio son URLs temporales de CDN (~72h). No asumir disponibilidad después del cierre de sesión.

### PDF

- Los generadores de PDF viven en `servicios/pdf/`.
- El motor compartido es `servicios/pdf/GeneradorPDFBase.js` — no duplicar lógica aquí.
- Para nuevos tipos de PDF, extender `GeneradorPDFBase`, no modificarlo.
- El cierre de cada flujo (`cierre.js`) es responsable de generar y subir el PDF.

### Storage

- Todo acceso a Supabase Storage pasa por `servicios/storage.js`.
- No llamar al cliente de Storage directamente desde módulos o rutas.
- Las fotos de evidencia se suben al cierre del flujo, no durante el flujo.
- Las URLs firmadas (signed URLs) se generan desde `servicios/storage.js`.

---

## 8. Qué se considera violación arquitectónica

Una violación arquitectónica es cualquier cambio que rompe los contratos de capa definidos en este documento. Las siguientes acciones son violaciones, independientemente del resultado funcional:

### Violaciones críticas

1. **Query directa a Supabase fuera de `data/`** (salvo excepción documentada).
2. **Lógica de negocio en `data/`** — reglas de dominio, validaciones complejas, decisiones de flujo.
3. **Módulo importando de otro módulo de inspección** (preoperacional ↔ posoperacional ↔ tanqueo).
4. **`data/` importando de `modulos/` o `rutas/`** — inversión de dependencias.
5. **Modificar `FlujoBase` para acomodar un caso específico de un módulo hijo** — FlujoBase es abierto/cerrado.
6. **Insertar un estado en `historial_estado_activo` directamente** sin usar `registrarCambioEstado`.
7. **Referenciar la tabla `vehiculos`** en cualquier código nuevo.
8. **Sobrescribir un campo JSONB completo** en lugar de hacer merge.
9. **Responder TwiML desde `data/` o desde una ruta HTTP directamente**.
10. **Duplicar `responderTwiml`, `escaparXml` o `firmaTwilioValida`** en cualquier archivo fuera de `compartido/twiml.js`.

### Violaciones de proceso

11. **Cambio de schema sin migration versionada** en `supabase/migrations/`.
12. **Nueva dependencia directa de Supabase en `modulos/`**.
13. **Decisión arquitectónica importante no escrita** en `docs/canon/` o `docs/adr/`.
14. **Reescritura completa de un módulo sin plan incremental aprobado**.

### Señales de alerta

No son violaciones por sí solas, pero deben revisarse antes de continuar:

- Un archivo en `data/` supera 200 líneas sin separación clara por entidad.
- Un `flujo.js` maneja más de 15 estados sin delegación a subestados.
- Una función en `rutas/` supera 40 líneas — señal de lógica de negocio no delegada.
- `cierre.js` de un módulo importa de `data/` de otro módulo directamente.

---

## 9. Criterios para aceptar un refactor

Un refactor es aceptable si cumple **todos** los siguientes criterios:

### Criterios de alcance

1. **Tiene objetivo claro y único** — no es "limpiar" o "mejorar" en general.
2. **Es incremental** — no reescribe un módulo completo en un solo paso.
3. **No cambia comportamiento observable** — los tests existentes siguen pasando, los flujos WhatsApp siguen funcionando igual para el usuario.

### Criterios de proceso

4. **Fue propuesto explícitamente antes de ejecutarse** — objetivo, archivos afectados, pruebas, riesgo y rollback descritos.
5. **Fue aprobado por un humano** antes de tocar código productivo.
6. **Tiene pruebas** que cubren el comportamiento del código refactorizado — antes o después del refactor, nunca sin ellas.

### Criterios técnicos

7. **Mueve responsabilidades hacia las capas correctas** — no las mezcla.
8. **Reduce duplicación real**, no crea abstracciones prematuras.
9. **No introduce nuevas dependencias** sin justificación documentada.
10. **Respeta el orden de migración del canon**: tests → interfaces → adapters → fachadas legacy → casos de uso → dominio puro.

### Lo que convierte un refactor en inaceptable

- Reescribe un módulo completo en un paso sin plan incremental.
- Cambia la interfaz pública de `data/` sin actualizar todos los consumidores en el mismo commit.
- Introduce una abstracción nueva que ningún consumidor actual necesita.
- Elimina código legacy que aún tiene consumidores activos.
- Modifica `FlujoBase` para un caso específico de un módulo hijo.

---

*Última actualización: 2026-05-11 — basado en CERO_CANON.md, CERO_DATABASE_CONTRACT.md y ARCHITECTURE.md v26.*
*Actualizar este documento ante cualquier decisión arquitectónica que modifique capas, contratos o dependencias.*
