# CERO — Rules Backend (simple)

Guia corta para backend. Para detalle completo, revisar `ARCHITECTURE.md`.

## Alcance
- Aplica a `rutas/`, `data/`, `servicios/`, `middlewares/`, `canales/`.

## Reglas
- Mantener CommonJS (`require` / `module.exports`).
- Reutilizar funciones en `data/` y `servicios/` antes de duplicar logica.
- No hardcodear secretos ni credenciales.
- Rutas protegidas con `verificarToken` + `verificarPermiso` cuando aplique.
- No exponer errores sensibles al cliente.
- No cambiar schema de BD desde codigo sin instruccion explicita.
- `cambiado_por` en historial: UUID valido o `null`.

## Entrega
- Validacion minima (lint/test rapido).
- Commit + push a `desarrollo` para fixes.
# Cursor Rules — Backend
# Cargar cuando la tarea involucra: rutas API, data/, middlewares/, servicios/, config/, index.js
# Instrucción: "Contexto adicional: leer .cursor/rules-backend.md"

---

## Contexto de arquitectura backend

El backend es Express + CommonJS. Punto de entrada: `index.js`.
Las rutas API están definidas directamente en `index.js` o en `rutas/`.
Acceso a Supabase siempre desde `data/` — nunca consultar Supabase desde rutas directamente.
Configuración centralizada en `config/config.js` — nunca leer `process.env` fuera de ese archivo.

---

## Patrones obligatorios

### Rutas API
- Siempre `verificarToken` + `verificarPermiso(modulo, accion)` en rutas protegidas
- Respuesta de error siempre: `{ ok: false, error: 'mensaje' }` con status explícito
- Respuesta exitosa siempre: `{ ok: true, data: ... }` o `{ ok: true, mensaje: ... }`
- Nunca exponer stack traces al cliente — solo en `console.error` del servidor
- El middleware global de errores está al final de `index.js` — no agregar otros

### Funciones en data/
- Una función por operación de base de datos
- Nombre descriptivo: `obtenerVehiculos`, `crearConductor`, `registrarCambioEstado`
- Siempre retornar el resultado de Supabase, nunca lanzar excepciones sin capturar
- Si la operación falla, retornar `{ ok: false, error: mensaje }` o lanzar el error para que la ruta lo capture

### Supabase
- Cliente siempre desde `config/config.js`: `const { supabase } = require('../config/config')`
- Nombres de tablas desde `config.TABLES` cuando existan, no hardcodeados
- Usar `.maybeSingle()` cuando el resultado puede ser null — nunca `.single()` en consultas opcionales
- Signed URLs de Storage: regenerar en cada query, nunca guardar como permanentes

### Autenticación
- JWT verificado en `middlewares/auth.js` — no duplicar lógica
- `req.usuario` contiene el payload del token después de `verificarToken`
- `superadmin_plataforma` tiene bypass automático en `verificarPermiso`
- Expiración: 8 horas — no cambiar sin decisión documentada

---

## Seguridad — no negociable

- Nunca loggear tokens, passwords, ni `req.body` completo en producción
- Validar campos obligatorios antes de insertar en Supabase
- Sanitizar entradas: `.trim()`, `.toUpperCase()` donde corresponda
- Validar firma Twilio en webhook (`X-Twilio-Signature`) solo en producción
- `JWT_SECRET` sin valor por defecto — falla en arranque si no está definido

---

## CommonJS — reglas estrictas

- `require()` siempre, nunca `import`
- `module.exports` siempre, nunca `export default`
- `var` es aceptable en archivos que ya lo usan — no refactorizar a `const/let` sin instrucción
- En archivos nuevos: `const` por defecto, `let` solo si el valor cambia

---

## Lo que no hacer

- No consultar Supabase desde `canales/`, `modulos/` ni `middlewares/` directamente
- No agregar rutas en archivos distintos a `index.js` o `rutas/` sin instrucción
- No instalar dependencias sin justificación documentada
- No mezclar `async/await` con `.then()` en el mismo bloque
- No dejar `console.log()` de depuración — solo `console.error()` para errores reales
