# CERO — Decision Log

Decisiones arquitectónicas y operativas relevantes. Actualizar en el mismo commit del cambio.

Formato: | Fecha | Decisión | Razón | Violación cerrada |

---

| Fecha | Decisión | Razón | Violación cerrada |
|---|---|---|---|
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
