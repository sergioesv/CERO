# CERO — Handoff SOLID (sesión en curso)

> Documento generado automáticamente. Leer antes de continuar trabajo de refactor.
> Último commit relevante: `7360dc2` (rama `desarrollo`)

---

## Estado de violaciones activas

| ID | Archivo | Prioridad | Estado |
|----|---------|-----------|--------|
| V-01 | `servicios/ocr.js` línea 3 | ALTA | ⏳ En progreso |
| V-02 | `servicios/ocr.js` líneas 228-404 | ALTA | ⏳ En progreso |
| V-04 | `servicios/ocr.js` aliasPorItem vs BD | MEDIA | Pendiente |
| V-05 | `ocr.js` línea 354 fallback BLOQUEO | MEDIA | Pendiente |
| V-07 | `ocr.js` vs `preoperacional/estado.js` | BAJA | Pendiente |

---

## Cambios aplicados en esta sesión (ya commiteados)

1. `auto-merge-claude.yml` — CI antes de merge (lint+tests+audit+secrets)
2. `backend.yml` — agrega `npm test`
3. `.cursor/rules-*.md` — elimina versiones simples duplicadas
4. Agentes `.claude` — modelo actualizado a `claude-sonnet-4-6`
5. `settings.json` — permisos consolidados
6. `CERO_CANON.md` — estado real actualizado
7. `cero-orchestrator.md` — paso 9 reforzado con ID de violación
8. `.gitattributes` — normaliza LF, elimina ruido CRLF

---

## Trabajo pendiente: V-01 y V-02

### El problema
`servicios/ocr.js` tiene un ciclo de dependencia circular:
- `ocr.js` línea 3 → importa `modulos/inspecciones/compartido/validacionVisual.js`
- `validacionVisual.js` → importa `servicios/ocr.js`

Además, `ocr.js` contiene lógica de dominio de inspecciones (funciones 228-404)
que pertenece en `modulos/`, no en `servicios/`.

### La solución
Crear `modulos/inspecciones/compartido/interpretadorNovedades.js` con:
- `aliasPorItem(nombre)` (líneas 228-260 de ocr.js)
- `puntuarItem(...)` (261-285)
- `encontrarMejorItem(...)` (286-305)
- `detectarEstado(...)` (306-356)
- `separarSegmentos(...)` (357-364)
- `interpretarNovedadPorReglas(...)` (365-405)
- `limpiarItemsInterpretados(...)` (406-425)
- constantes `STOPWORDS` (compartidas)

`ocr.js` queda solo con: Gemini API, OCR de placas/odómetro/facturas, descarga de imágenes.
`validacionVisual.js` importa `interpretadorNovedades.js` en lugar de `ocr.js`.
`ocr.js` importa `interpretadorNovedades.js` para `interpretarNovedad()`.

### Commit esperado
```
refactor(ocr): extraer interpretadorNovedades — cierra V-01 y V-02
```

---

## Trabajo pendiente: capa data/ incompleta

Estas rutas tienen SQL directo y deben delegarlo a `data/`:

| Ruta | Estado | data/ existente |
|------|--------|-----------------|
| `rutas/conductores.js` | SQL directo | `data/conductores.js` existe (50L vacío) |
| `rutas/activos.js` | SQL directo (excepción documentada) | `data/activos.js` existe |
| `index.js` endpoint `/api/dashboard/resumen` | SQL en entry point | mover a `rutas/dashboard.js` |

---

## Cómo hacer commits sin que el humano use la terminal

**El flujo correcto:**
1. Claude edita archivos con `Edit`/`Write` directamente en `C:\Users\Prueba\Documents\Proyectos\CERO`
2. Al final de cada bloque de trabajo, proveer UN SOLO comando de commit para que el humano lo ejecute
3. El humano solo ejecuta: `git add [archivos] && git commit -m "mensaje" && git push`
4. Nunca pedir más de un comando por sesión de trabajo

---

## Orden de trabajo recomendado (por impacto/riesgo)

1. **V-01/V-02** — `interpretadorNovedades.js` (mayor riesgo técnico activo)
2. **`data/conductores.js`** — mover SQL desde `rutas/conductores.js`
3. **`index.js`** — mover endpoint `/api/dashboard/resumen` a `rutas/dashboard.js`
4. **PDF duplicación** — elegir `GeneradorPDF*` (clase) y marcar `base.js`/`preoperacional.js` como deprecated
5. **Tests** — `tanqueos`, `ocr/interpretadorNovedades`, `conductores`
