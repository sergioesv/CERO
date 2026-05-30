# Cursor Rules — Frontend Panel
# Cargar cuando la tarea involucra: public/, módulos del panel, componentes, CSS, login.html, index.html
# Instrucción: "Contexto adicional: leer .cursor/rules-frontend.md"

---

## Contexto de arquitectura frontend

El panel es HTML + CSS + JS vanilla. Sin frameworks. Servido por Express como archivos estáticos.
Tres páginas: `/` (landing.html) · `/login` (login.html) · `/panel` (index.html)
El panel es una SPA mínima — el router carga módulos en `<main id="main">` sin recargar la página.

---

## Patrón de módulo — obligatorio

Cada módulo del panel exporta un objeto global con esta estructura exacta:

```js
const NombreModulo = {
  render()       // Monta el HTML en el contenedor principal
  cargarDatos()  // Fetch desde la API y pobla la vista
  renderStats()  // Actualiza las stat cards
  renderTabla()  // Renderiza la tabla reutilizable
};
```

El router llama `render()` al navegar. `render()` llama `cargarDatos()` internamente.
Nunca hacer fetch directamente en `render()` — delegarlo a `cargarDatos()`.

---

## Componentes reutilizables — usar siempre, nunca duplicar

| Componente | Archivo | Uso |
|---|---|---|
| Table | `/components/table.js` | Tablas con ordenamiento y paginación |
| Badge | `/components/badge.js` | Estados: operativo, bloqueado, taller |
| Card | `/components/card.js` | Stat cards del panel |
| Modal | `/components/modal.js` | Detalle e inspecciones — drawer lateral |
| Toast | `/components/toast.js` | Notificaciones de éxito y error |
| Sidebar | `/components/sidebar.js` | Menú lateral — no modificar directamente |

---

## CSS — reglas estrictas

- Colores siempre desde variables CSS definidas en `variables.css` — nunca hardcodeados
- Temas claro/oscuro via `data-theme` en `<body>` — no usar media queries para temas
- No agregar `<style>` inline en módulos JS — los estilos van en `components.css` o `layout.css`
- No usar Tailwind en el panel — solo en `landing.html` que ya lo tiene

Variables de color principales:
```css
var(--color-primary)       /* Verde CERO #50f0bb */
var(--color-bg)            /* Fondo principal */
var(--color-surface)       /* Superficie de cards */
var(--color-border)        /* Bordes */
var(--color-text)          /* Texto principal */
var(--color-text-muted)    /* Texto secundario */
```

---

## API desde el frontend

- Cliente API centralizado en `public/js/api.js` — usar siempre, nunca `fetch` directo
- Token JWT en `sessionStorage` con clave `cero_token`
- Si la API retorna 401 → redirigir a `/login` con transición animada
- Usar `CeroTransitions.ir(url)` para navegación entre páginas — nunca `window.location` directo

---

## Transiciones entre páginas

- Script: `public/js/transitions.js` — cargado en las tres páginas
- Fade-out 150ms al salir, fade-in 250ms al entrar
- Para navegación programática: `CeroTransitions.ir('/ruta')`
- Los `<a href>` internos se interceptan automáticamente

---

## UX del panel — reglas de diseño

- Sidebar con filtro por rol — el superadmin ve todo, otros ven solo su módulo
- Módulos no implementados visibles solo para `superadmin_plataforma` con etiqueta "pronto"
- Drawer lateral para detalle de inspecciones — no modales a pantalla completa
- Estados de vehículos: `operativo` (verde) · `bloqueado` (rojo) · `taller` (amarillo) · `retirado` (gris)
- Retirados ocultos por defecto en listados

---

## Lo que no hacer

- No instalar React, Vue, ni ningún framework sin instrucción explícita
- No usar `localStorage` — solo `sessionStorage` para el token
- No duplicar estilos que ya existen en `components.css`
- No hacer fetch sin pasar el token JWT en el header
- No modificar `sidebar.js` ni `router.js` sin instrucción — son infraestructura compartida
- No agregar scripts CDN adicionales en `index.html` sin justificación
