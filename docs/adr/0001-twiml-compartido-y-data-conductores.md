# ADR 0001: TwiML compartido transversal y capa de datos para conductores

## Estado
Aceptado — 2026-05-13

## Contexto

La auditoría de `modulos/inscripcion/flujo.js` detectó dos violaciones arquitectónicas:

1. **Duplicación de TwiML** (líneas 24-39): Las funciones `responder()` y `escaparXml()` son copias locales de la implementación canónica que ya existe en `modulos/inspecciones/compartido/twiml.js`. Esto viola el No-Negociable §8 del canon (toda decisión arquitectónica debe quedar escrita) y las reglas §7 de `CERO_ARCHITECTURE_RULES.md` ("No duplicar `responderTwiml` ni `escaparXml`") y §8 #10 ("Duplicar `responderTwiml`, `escaparXml` o `firmaTwilioValida` en cualquier archivo fuera de `compartido/twiml.js`" es violación crítica).

2. **Query directa a Supabase en módulo** (líneas 67-71): La función `guardarConductor` llama a `config.supabase` directamente dentro de `modulos/inscripcion/flujo.js`. Esto viola el No-Negociable #4 del canon ("No se agregan nuevas queries directas a Supabase dentro de módulos de negocio") y las reglas §3 ("modulos/ — prohibido: Usar el cliente Supabase directamente"), §6 #5 ("No crear nuevas queries directas a Supabase dentro de modulos/") y §8 #1 y #12 de `CERO_ARCHITECTURE_RULES.md`.

---

## Decisión 1: TwiML transversal en `modulos/compartido/twiml.js`

- La carpeta `modulos/compartido/` es nueva; creada para utilitarios que cruzan dominios (la inscripción no es una inspección, por lo tanto no debe importar desde `modulos/inspecciones/compartido/`).
- `modulos/inspecciones/compartido/twiml.js` se convierte en re-export puro de `modulos/compartido/twiml.js` para no romper los 7 consumidores existentes:
  - `canales/whatsapp.js`
  - `modulos/tanqueo/flujo.js`
  - `modulos/tanqueo/validaciones.js`
  - `modulos/inspecciones/preoperacional/flujo.js`
  - `modulos/inspecciones/preoperacional/validaciones.js`
  - `modulos/inspecciones/posoperacional/flujo.js`
  - `modulos/inspecciones/posoperacional/validaciones.js`
  - `modulos/inspecciones/compartido/baseFlujo.js`
- Los consumidores existentes no se tocan. El re-export garantiza transparencia total.
- Consumidores nuevos (como `modulos/inscripcion/flujo.js`) importan directamente desde `modulos/compartido/twiml.js`.

---

## Decisión 2: Inserción de conductores en `data/conductores.js`

- `flujo.js` de inscripción no puede llamar a Supabase directamente. La lógica de persistencia debe moverse a una función en `data/conductores.js`, siguiendo el patrón de `data/inspecciones.js` y `data/tanqueos.js`.
- Usará `config.TABLES.conductores` (confirmado: existe en `config/config.js` línea 78).
- Esta decisión se **EJECUTA en el Sub-paso B**; en este ciclo solo queda documentada.

---

## Consecuencias

- **Sub-paso A (este ciclo):** no se esperan fallos de tests. Los 7 consumidores legacy continúan funcionando vía re-export sin ningún cambio en sus archivos. Los tests de `flujo.test.js` verifican efectos observables (estructura XML, Content-Type) que son idénticos entre la copia local y la versión canónica.
- **Sub-paso B (próximo ciclo):** los tests 4 y 5 fallarán porque el mock de `config` en `flujo.test.js` no incluye `TABLES.conductores`. La opción aprobada por el humano permite ampliar el mock agregando `conductores: 'conductores'` en `TABLES`, sin alterar asertos ni comportamiento esperado.
- No se modifican los tests en este ciclo.

---

## Rollback

```
git reset --hard 4eaaf5f
```
