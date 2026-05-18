# CERO — Refactor Estructural v6 (Corte Limpio)

Este repositorio contiene el núcleo operativo de **CERO**, una plataforma SaaS para la gestión de operaciones de campo mediante WhatsApp e Inteligencia Artificial.

**Stack:** Node.js 20 CommonJS · Supabase PostgreSQL (São Paulo) · Railway · Twilio · Gemini 2.0 Flash
**Rama activa:** desarrollo
**Cliente activo:** Enerlight (negociación)

## Estado Actual: Fase 2 Completa ✅
Se ha completado la transición crítica desde una arquitectura rígida basada en vehículos hacia un sistema dinámico basado en **Activos y Plantillas**. El panel de administración web está operativo (gestión de flota, preoperacionales, posoperacionales, tanqueos, conductores, alertas, sedes, usuarios).

### Cambios Estructurales Principales
- **Base de Datos:** Eliminada la tabla `vehiculos`. Todo opera sobre `activos` (UUID).
- **Motor de Plantillas:** Las inspecciones (Preoperacional, Posoperacional, etc.) se cargan dinámicamente desde la tabla `plantillas_inspeccion`.
- **Arquitectura Modular:** 
  - `modulos/inspecciones/`: Motor unificado para cualquier tipo de activo.
  - `modulos/tanqueo/`: Flujo dinámico de combustible.
  - `modulos/inscripcion/`: Registro autónomo de conductores.
- **Frontend SPA:** Panel de administración refactorizado para consumir la nueva API de activos y gestionar plantillas dinámicas.

## Estructura de Carpetas (Resumen)
- `canales/`: Webhooks de entrada (WhatsApp/Twilio, Dashboard).
- `data/`: Capa de persistencia y consultas a Supabase.
- `modulos/`: Lógica de negocio segmentada por flujo.
- `public/`: Frontend moderno (Vanilla JS + CSS Custom Properties).
- `servicios/`: Servicios compartidos (AI Gemini, PDF, Storage, Sesiones).

## Documentación de Referencia
Para detalles técnicos profundos, consulte:
- [ARCHITECTURE.md](ARCHITECTURE.md): Mapa completo de archivos y dependencias.
- [docs/DECISION_LOG.md](docs/DECISION_LOG.md): Registro de decisiones arquitectónicas.
- `.cursor/rules-*.md`: Reglas de desarrollo por dominio (backend, frontend, WhatsApp) utilizadas por agentes Claude Code.

---
**CERO** — Gestión de Operaciones de Campo
