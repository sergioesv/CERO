# CERO — Reglas Cursor (simple)

Estas reglas son cortas a proposito. Para detalles tecnicos, arquitectura, decisiones y patrones, revisar `ARCHITECTURE.md`.

## Base
- Usar stack actual. No cambiar tecnologia sin razon tecnica documentada.
- Priorizar fixes directos y cambios pequenos en `desarrollo`.
- Si una instruccion del chat contradice estas reglas, manda la instruccion del chat para esa tarea.

## Codigo
- Node.js en CommonJS (`require` / `module.exports`).
- Reutilizar utilidades existentes antes de crear logica nueva.
- No hardcodear credenciales ni secretos.
- Mantener cambios acotados al archivo/modulo solicitado.

## Backend y seguridad
- Rutas protegidas con `verificarToken` y `verificarPermiso` cuando aplique.
- No exponer errores sensibles al cliente.
- No tocar esquema de BD desde codigo salvo instruccion explicita.
- `historial_estado_activo.cambiado_por`: solo UUID valido o `null`.

## Frontend
- API de activos en campos planos (`marca`, `soat_vencimiento`, `tecnomecanica_vencimiento`).
- En panel, comparaciones de estado robustas a mayusculas/minusculas.
- Evitar duplicacion de componentes o utilidades del panel.

## WhatsApp
- Mantener patron de `FlujoBase` y estados por modulo.
- `0` atras, `9` menu principal.
- Si hay manejo custom de odometro, interceptar antes de `procesarEstadoCompartido`.

## Entrega
- Incluir verificacion minima (lint/test rapido si aplica).
- Para cambios de codigo: commit, push y confirmar deploy en Railway.
