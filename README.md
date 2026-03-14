# CERO Modular - Tercera entrega

Esta tercera entrega toma la segunda base modular y deja el modulo de `vehiculos/preoperacional` mas preparado para evolucionar sin seguir creciendo en un solo archivo.

## Cambios principales
- `modulos/vehiculos/preoperacional/flujo.js` queda mas delgado y enfocado en la orquestacion del canal.
- Se extraen helpers a archivos separados:
  - `preoperacional/estado.js`
  - `preoperacional/mensajes.js`
  - `preoperacional/cierre.js`
- Se crea `modulos/vehiculos/compartido/baseFlujo.js` como contrato base para modulos futuros.
- `vehiculos/posoperacional` y `vehiculos/tanqueo` ya no quedan como throws aislados; ahora comparten una base de placeholder coherente para crecer en esta rama.
- Se corrige un error funcional del flujo preoperacional (`respLimpocr`), dejandolo estable para seguir iterando.

## Nueva distribucion del preoperacional
- `flujo.js`: webhook, ruteo del estado conversacional y coordinacion general.
- `estado.js`: reseteo de sesion, limpieza de grupos, control de fotos pendientes y helpers de retorno.
- `mensajes.js`: textos de UX del flujo, confirmaciones y mensajes finales.
- `cierre.js`: construccion, guardado y cierre del preoperacional firmado.
- `validaciones.js`: catalogo de bloques, reglas de resumen y funciones compartidas de validacion textual.

## Ventajas para la nueva rama
1. cambios del flujo ya no obligan a tocar al mismo tiempo cierre, mensajes y estado;
2. `posoperacional` y `tanqueo` ya pueden copiar una base comun en vez de arrancar desde cero;
3. el webhook de WhatsApp queda listo para que luego se conecte otro canal sin duplicar demasiada logica;
4. las futuras alertas y el dashboard pueden apoyarse en el cierre y en data sin ensuciar el flujo conversacional.

## Siguiente trabajo sugerido
1. mover reglas de placa y kilometraje a un helper compartido de vehiculos;
2. crear `data/conductores.js` para separar la carga de conductor de `data/vehiculos.js`;
3. convertir alertas en persistencia real + cola de notificacion;
4. levantar el primer modulo real despues de preoperacional: `tanqueo` o `posoperacional`.
