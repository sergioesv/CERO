# CERO — Release Checklist

> Documento de control. Completar en orden antes de piloto y antes de producción.
> No editar sin decisión explícita. Fuente de verdad: ARCHITECTURE.md + docs/canon/.

---

## 1. Estado del repo

- [ ] Rama `desarrollo` está limpia (sin commits sin revisar)
- [ ] No hay archivos `.env`, secrets ni credenciales en el repo
- [ ] `.env` está en `.gitignore`
- [ ] No hay `console.log` de debug con datos reales
- [ ] `ARCHITECTURE.md` refleja el estado actual del código
- [ ] No existen referencias a la tabla `vehiculos` en código nuevo
- [ ] No existen imports directos de Supabase fuera de `data/`, `servicios/storage.js` y `servicios/sesiones.js`
- [ ] ESLint pasa sin errores en CI (`frontend.yml`)
- [ ] Workflows `backend.yml`, `frontend.yml`, `security.yml` pasan en verde

---

## 2. GitHub y ramas

- [ ] La rama principal es `desarrollo` y está protegida
- [ ] No hay PRs abiertos bloqueantes sin revisar
- [ ] El deploy automático desde `desarrollo` a Railway está activo
- [ ] La URL de deploy de Railway responde (cero-production.up.railway.app)
- [ ] No hay commits directos a `desarrollo` que correspondan a módulos completos sin PR
- [ ] Los workflows de CI corren en cada PR antes de merge

---

## 3. Dependencias y seguridad

- [ ] `npm audit` sin vulnerabilidades críticas o altas sin resolver
- [ ] Todas las dependencias de `package.json` están en la versión declarada en ARCHITECTURE.md
- [ ] Helmet está activo en `index.js`
- [ ] `trust proxy = 1` configurado para Railway
- [ ] Rate limiting activo (`express-rate-limit`)
- [ ] bcrypt en todos los flujos de contraseña
- [ ] JWT con expiración de 8h
- [ ] Protección contra timing attack en login activa
- [ ] No hay `onclick` inline en HTML — usar `addEventListener` (CSP strict)
- [ ] No hay URLs de producción hardcodeadas en `public/`
- [ ] No hay tokens hardcodeados en frontend
- [ ] Todas las rutas del panel están detrás de `verificarPermiso`
- [ ] UUID validation en `cambiado_por` antes de insert en historial

---

## 4. Ambientes dev/staging/prod

- [ ] Existe un ambiente de staging separado de producción
- [ ] Las variables de entorno de staging no apuntan a la BD de producción
- [ ] El ambiente local tiene su propio proyecto Supabase (no comparte con prod)
- [ ] Las migrations se prueban en local o staging antes de ejecutar en prod
- [ ] Railway tiene las variables de entorno configuradas (no en código)
- [ ] La URL de producción responde con HTTPS
- [ ] No se ejecutan queries contra la BD de producción desde entorno de desarrollo

---

## 5. Supabase y base de datos

- [ ] Todas las migrations están en `supabase/migrations/` con formato `YYYYMMDDHHMMSS_descripcion.sql`
- [ ] La migration v26 (eliminación de `vehiculos`) está aplicada en producción
- [ ] No existe la tabla `vehiculos` en la BD de producción
- [ ] Las tablas core existen: `activos`, `conductores`, `preoperacionales`, `posoperacionales`, `tanqueos`, `historial_estado_activo`, `autorizaciones_novedad`, `fotos_evidencia`, `fotos_tanqueo`
- [ ] Las tablas de configuración existen: `plantillas_inspeccion`, `plantilla_grupos`, `plantilla_items`, `tipos_activo`
- [ ] Las tablas multi-tenant existen: `empresas`, `sedes`, `usuarios_panel`
- [ ] `updated_at` se actualiza explícitamente en cada `UPDATE`
- [ ] Campos JSONB (`documentos`, `datos`, `respuestas`) se actualizan con merge, no overwrite
- [ ] RLS está habilitado en Supabase (requerido antes del segundo cliente)
- [ ] Las políticas RLS fueron revisadas y documentadas
- [ ] Existe backup de la BD antes de cualquier migration a producción
- [ ] Hay plan de rollback escrito para cada migration pendiente
- [ ] Los datos de prueba con nombres reales fueron eliminados o anonimizados
- [ ] `soft delete` de `usuarios_panel` tiene comportamiento definido
- [ ] Existe plantilla de inspección para el tipo `grua` (WDH689)

---

## 6. Twilio WhatsApp

- [ ] Validación de firma Twilio (`firmaTwilioValida`) está activa en producción
- [ ] El webhook de Twilio apunta a la URL correcta de producción
- [ ] La cuenta Twilio está en modo producción (no sandbox)
- [ ] El número de WhatsApp de producción está aprobado por Meta/Twilio
- [ ] Los timeouts de sesión están configurados en `config/config.js`: 30 min general, 10 min tanqueo, 5 min ventana recuperable
- [ ] El flujo de sesión expirada funciona: ofrece continuar (1) o reiniciar (2)
- [ ] `LABEL_PASO` en `navegacion.js` está sincronizado con los `ESTADOS` de cada módulo
- [ ] El cron de alertas (6:00 AM) está activo y envía por WhatsApp
- [ ] No existen duplicados de `responderTwiml`, `escaparXml` o `firmaTwilioValida` fuera de `compartido/twiml.js`
- [ ] Race condition en sesiones WhatsApp (Fix 10) está resuelta antes de flotas grandes

---

## 7. Gemini AI

- [ ] La API key de Gemini está en variables de entorno, no en código
- [ ] Todo acceso a Gemini pasa por `servicios/ocr.js`
- [ ] No existen clientes de Gemini creados fuera de `config/config.js`
- [ ] El OCR de placas devuelve resultados correctos con fotos reales de prueba
- [ ] El OCR de odómetros devuelve resultados correctos con fotos reales de prueba
- [ ] El OCR de facturas de tanqueo (score/tier/fallback) funciona con fotos reales
- [ ] Las fotos de Twilio (CDN ~72h) no se asumen disponibles después del cierre de sesión
- [ ] El flujo de validación visual funciona cuando Gemini no puede leer la imagen

---

## 8. Storage y PDFs

- [ ] Supabase Storage tiene el bucket de evidencias configurado
- [ ] Supabase Storage tiene el bucket de PDFs configurado
- [ ] Todo acceso a Storage pasa por `servicios/storage.js`
- [ ] Los PDFs de preoperacional se generan y suben correctamente al cierre
- [ ] Los PDFs de posoperacional se generan y suben correctamente al cierre
- [ ] Las signed URLs se generan desde `servicios/storage.js`
- [ ] Las fotos de evidencia se suben al cierre del flujo, no durante
- [ ] `GeneradorPDFBase.js` y sus subclases cubren todos los casos de uso de PDF
- [ ] Los archivos legacy `servicios/pdf/base.js` y `servicios/pdf/preoperacional.js` / `posoperacional.js` están identificados para eliminación cuando no tengan consumidores

---

## 9. Flujos críticos a probar

### WhatsApp

- [ ] Inscripción de conductor nuevo: cédula → nombre → teléfono → confirmación
- [ ] Preoperacional completo: placa OCR → odómetro OCR → preguntas → novedad → cierre → PDF
- [ ] Posoperacional completo: placa → odómetro → fotos → cierre → PDF
- [ ] Tanqueo completo: placa → odómetro → foto factura → OCR → validación → cierre
- [ ] Flujo `0` (atrás) y `9` (menú) en cada módulo
- [ ] Recuperación de sesión expirada: esperar 30 min → enviar mensaje → elegir continuar (1)
- [ ] Sesión de inscripción no es recuperable (se reinicia)
- [ ] Preoperacional con novedad genera autorización pendiente en panel
- [ ] Ciclo completo mismo conductor mismo día: preop + posop + tanqueo verificados en panel

### Panel administrativo

- [ ] Login con credenciales válidas → JWT → panel carga
- [ ] Login con credenciales inválidas → error correcto
- [ ] JWT expirado → redirección a login
- [ ] Módulo Flota: lista activos, filtros, drawer de detalle, edición
- [ ] Módulo Preoperacionales: lista, filtros, drawer con autorización de novedad
- [ ] Módulo Posoperacionales: lista, filtros, drawer de detalle
- [ ] Módulo Tanqueos: lista, filtros, validación de estado
- [ ] Módulo Conductores: lista, filtros, drawer de detalle
- [ ] Módulo Alertas: documentos vencidos y autorizaciones pendientes
- [ ] Módulo Dashboard: 4 pestañas, Índice de Seguridad Operativa
- [ ] Módulo Usuarios: gestión de roles
- [ ] Módulo Sedes: gestión multi-sede
- [ ] Admin empresa B NO puede ver datos de empresa A (aislamiento multi-tenant)
- [ ] PDF de preoperacional es accesible desde el panel con signed URL

---

## 10. Criterios para piloto

Un piloto puede iniciarse cuando se cumplen **todos** los siguientes:

- [ ] Flujos WhatsApp completos (preop + posop + tanqueo) probados con conductor real
- [ ] Panel administrativo funciona sin errores para el operador piloto
- [ ] Los datos de demo/prueba con nombres reales fueron eliminados
- [ ] Existe plantilla de inspección para todos los tipos de activo del cliente piloto
- [ ] El número de WhatsApp del piloto está configurado en Twilio
- [ ] El equipo de piloto recibió instrucciones de uso
- [ ] Hay un canal de reporte de errores definido (WhatsApp, email u otro)
- [ ] Hay un responsable técnico disponible durante el piloto
- [ ] La BD de producción tiene backup antes del inicio del piloto
- [ ] El cron de alertas está activo y fue verificado
- [ ] El deploy en Railway está estable (sin reinicios en las últimas 24h)

---

## 11. Criterios para producción

La producción puede abrirse a múltiples clientes cuando se cumplen **todos** los siguientes:

- [ ] El piloto completó al menos 2 semanas sin errores críticos
- [ ] RLS está habilitado en Supabase con políticas revisadas
- [ ] Todas las queries del panel filtran por `empresa_id` o `sede_id` (auditoría multi-tenant completa)
- [ ] El dominio propio está configurado con HTTPS
- [ ] La firma de Twilio está validada en producción
- [ ] `npm audit` sin vulnerabilidades críticas o altas
- [ ] Existe proceso de onboarding documentado para nuevos clientes
- [ ] Existe proceso de offboarding documentado
- [ ] Existe proceso de backup y restore verificado
- [ ] Race condition de sesiones WhatsApp (Fix 10) está resuelta
- [ ] Los módulos de Fase 3 (`seguridad-campo/`) están aislados y no afectan los flujos activos
- [ ] Existe un contrato firmado con el primer cliente antes de abrir acceso
- [ ] El equipo tiene capacidad de soporte definida (SLA, canales, responsables)
- [ ] Los logs de producción están configurados y monitoreados
- [ ] Existe un plan de incidentes escrito

---

## 12. Bloqueadores absolutos

Estos ítems impiden piloto o producción bajo cualquier circunstancia:

- [ ] **[BLOQUEADOR PILOTO]** Datos de prueba con nombres/cédulas reales de personas no eliminados
- [ ] **[BLOQUEADOR PILOTO]** Plantilla de inspección faltante para algún tipo de activo del cliente piloto
- [ ] **[BLOQUEADOR PILOTO]** Firma Twilio deshabilitada (`firmaTwilioValida` retorna `true` siempre)
- [ ] **[BLOQUEADOR PILOTO]** Credenciales en código fuente (API keys, passwords, tokens)
- [ ] **[BLOQUEADOR PILOTO]** El ciclo preop + posop + tanqueo no funciona end-to-end con conductor real
- [ ] **[BLOQUEADOR PROD]** RLS no habilitado con segundo cliente activo
- [ ] **[BLOQUEADOR PROD]** Queries del panel sin filtro `empresa_id` — empresa B ve datos de empresa A
- [ ] **[BLOQUEADOR PROD]** Sin backup de BD antes de migration a producción
- [ ] **[BLOQUEADOR PROD]** Sin plan de rollback ante falla de migration
- [ ] **[BLOQUEADOR PROD]** Sin dominio propio configurado (contrato requiere URL profesional)
- [ ] **[BLOQUEADOR PROD]** Tabla `vehiculos` referenciada en código activo

---

*Versión: 1.0 — 2026-05-11*
*Basado en: ARCHITECTURE.md v26, CERO_CANON.md, CERO_DATABASE_CONTRACT.md, CERO_ARCHITECTURE_RULES.md*
*Actualizar ante cualquier cambio de stack, módulo o requisito de cliente.*
