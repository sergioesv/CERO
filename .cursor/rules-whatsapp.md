# CERO — Rules WhatsApp (simple)

Guia corta para flujos WhatsApp. Para detalle completo, revisar `ARCHITECTURE.md`.

## Alcance
- Aplica a `modulos/inspecciones/`, `modulos/tanqueo/`, `modulos/inscripcion/`, `servicios/sesiones.js`.

## Reglas
- Respetar patron de `FlujoBase` + estados por modulo.
- Mantener `0` = atras y `9` = menu principal.
- Reutilizar helpers compartidos (`twiml`, `navegacion`, `kilometraje`, `iniciadorFlujo`).
- Si hay manejo custom de `ODOMETRO_CONFIRMACION`, interceptar antes de `procesarEstadoCompartido`.
- En `onExitoPlaca`, preservar datos necesarios de sesion al reiniciar (ej. `vehiculo`, `conductor`).
- No duplicar logica de cierre/mensajes/validaciones entre modulos.

## Entrega
- Probar flujo minimo impactado.
- Commit + push a `desarrollo` para fixes.
# Cursor Rules — WhatsApp Flows
# Cargar cuando la tarea involucra: modulos/, canales/whatsapp.js, servicios/sesiones.js
# Instrucción: "Contexto adicional: leer .cursor/rules-whatsapp.md"

---

## Contexto de arquitectura WhatsApp

El canal de entrada es `canales/whatsapp.js` — webhook POST `/webhook` de Twilio.
Las sesiones se mantienen en `servicios/sesiones.js` — Map en memoria + persistencia en Supabase.
Cada flujo es una máquina de estados estricta. El estado vive en la sesión del conductor.

---

## Estructura obligatoria de cada módulo

```
modulos/<categoria>/<modulo>/  # Ej: modulos/inspecciones/preoperacional/
├── flujo.js         # Máquina de estados — función principal manejar<Modulo>()
├── estado.js        # Constantes de estado exportadas como objeto ESTADOS
├── mensajes.js      # Plantillas de texto WhatsApp — nunca inline en flujo.js
├── validaciones.js  # Validación de entrada del conductor
└── cierre.js        # Lógica de cierre: guardar en Supabase, generar PDF, notificar
```

Nunca mezclar responsabilidades entre archivos.
Si la función no cabe en su archivo correspondiente, el diseño está mal.

---

## Sesiones — reglas estrictas

```js
// Siempre desde servicios/sesiones.js
const { obtenerSesion, eliminarSesion, guardarCambios, bloquear, desbloquear } = require('../../../servicios/sesiones');

// Patrón obligatorio en cada handler
var sesion = await obtenerSesion(telefono);
// ... modificar sesion ...
guardarCambios(); // no await — es async en background
```

- Nunca acceder al Map de sesiones directamente — solo via las funciones exportadas
- `bloquear(telefono)` antes de procesar, `desbloquear(telefono)` al finalizar
- `eliminarSesion(telefono)` solo al completar o cancelar el flujo
- `guardarCambios()` después de cada modificación de estado

---

## Navegación universal — inamovible

| Entrada del conductor | Acción |
|---|---|
| `9` / `MENU` / `INICIO` / `CANCELAR` | Menú principal — eliminar sesión |
| `0` / `ATRAS` | Retroceder un paso en el flujo activo |
| Cualquier número | Selección de opción |

Nunca pedir texto libre cuando se puede resolver con número.
El conductor puede tener una mano ocupada — máximo un dígito por respuesta.

---

## Mensajes WhatsApp — reglas de formato

- Máximo 160 caracteres por mensaje cuando sea posible
- Emojis solo para estado: ✅ éxito · ❌ error · ⚠️ alerta · 📸 foto requerida
- Negritas con `*texto*` (formato WhatsApp, no Markdown)
- Nunca HTML en mensajes WhatsApp
- Las plantillas van en `mensajes.js` — nunca strings largos inline en `flujo.js`

```js
// Correcto
const msg = require('./mensajes');
return responderTwiml(res, msg.solicitarFotoOdometro());

// Incorrecto
return responderTwiml(res, '📸 Por favor envíe una foto del odómetro del vehículo para continuar con la inspección');
```

---

## PDF y cierre de flujo

- PDF generado en `cierre.js` usando `servicios/pdf/<modulo>.js`
- Motor base compartido en `servicios/pdf/base.js` — nunca duplicar lógica aquí
- PDF subido a Supabase Storage via `servicios/storage.js`
- Signed URL regenerada en cada query — nunca guardar como permanente
- Notificaciones al supervisor via `twilioClient.messages.create()` desde `config/config.js`

---

## Sistema de autorizaciones (preoperacional)

- Novedades clasificadas como: `INFORMATIVO` / `ALERTA` / `BLOQUEO`
- Solo `BLOQUEO` requiere autorización del supervisor
- Supervisor responde: `AUTORIZAR <placa>` / `TALLER <placa>` / `RESTRINGIR <placa>`
- Justificación mínima 10 caracteres para `AUTORIZAR`
- Tabla: `autorizaciones_novedad` en Supabase
- Lógica de autorización en `canales/whatsapp.js` — intercepta antes del enrutamiento normal

---

## Gemini OCR — usar solo cuando agrega valor

```js
const ocr = require('../../../servicios/ocr');

// Usar para: lectura de placas, odómetros, documentos
// No usar para: validaciones que se pueden hacer con regex o lógica directa
```

- Cada llamada a Gemini tiene costo — no invocar para respuestas predecibles
- Si el conductor ya escribió el texto, no pedir foto para confirmar lo mismo
- Timeout implícito: si Gemini falla, pedir al conductor que escriba el valor manualmente

---

## Lo que no hacer

- No agregar estados nuevos sin actualizar `estado.js`
- No poner strings de mensajes en `flujo.js` — van en `mensajes.js`
- No hacer consultas a Supabase desde `flujo.js` — van en `data/`
- No modificar `canales/whatsapp.js` para lógica de un solo módulo
- No usar `async/await` sin `try/catch` en handlers de WhatsApp — un error no capturado cuelga la sesión del conductor
- No crear un módulo nuevo sin los 5 archivos obligatorios
