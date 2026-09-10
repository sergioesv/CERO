'use strict';

/**
 * tests/helpers/seedDemo.js
 *
 * Dataset mínimo viable para que un preoperacional corra de punta a punta.
 * Es, literalmente, la lista de lo que tiene que existir en Supabase para
 * que la demo funcione. Si algo de aquí falta en producción, el flujo se cae.
 */

var EMPRESA_ID = 'emp-0001';
var SEDE_ID = 'sede-0001';
var TIPO_ACTIVO_ID = 'tipo-vehiculo';
var PLANTILLA_ID = 'plantilla-preop-vehiculo';
var ACTIVO_ID = 'activo-0001';

var PLACA_DEMO = 'IDL354';
var TELEFONO_DEMO = 'whatsapp:+573001112233';

function construirSeed(overrides) {
  var o = overrides || {};

  var seed = {
    empresas: [
      { id: EMPRESA_ID, nombre: 'Enerlight S.A.S.', nit: '900123456-1' }
    ],

    sedes: [
      { id: SEDE_ID, empresa_id: EMPRESA_ID, nombre: 'Sede Popayán', activa: true }
    ],

    tipos_activo: [
      { id: TIPO_ACTIVO_ID, codigo: 'VEHICULO', nombre: 'Vehículo' }
    ],

    activos: [
      {
        id: ACTIVO_ID,
        placa: PLACA_DEMO,
        nombre: 'Compactador 01',
        tipo_activo_id: TIPO_ACTIVO_ID,
        empresa_id: EMPRESA_ID,
        sede_id: SEDE_ID,
        activo: true,
        bloqueado: false,
        motivo_bloqueo: null,
        kilometraje: 125000,
        estado: 'disponible',
        datos: { marca: 'Chevrolet', modelo: 'NPR', tipo_vehiculo: 'Compactador', anio: 2019 },
        documentos: { soat_vencimiento: '2027-01-15', tecnomecanica_vencimiento: '2027-03-20' }
      }
    ],

    conductores: [
      {
        id: 'cond-0001',
        nombre: 'Juan Pérez',
        cedula: '10203040',
        telefono: '+573001112233',
        licencia_categoria: 'C2',
        licencia_vencimiento: '2027-06-30',
        cargo: 'Conductor',
        sede_id: SEDE_ID,
        empresa_id: EMPRESA_ID,
        activo: true
      }
    ],

    plantillas_inspeccion: [
      {
        id: PLANTILLA_ID,
        nombre: 'Preoperacional Vehículo',
        tipo_activo_id: TIPO_ACTIVO_ID,
        tipo_inspeccion: 'preoperacional',
        empresa_id: o.plantillaGlobal ? null : EMPRESA_ID,
        activa: true,
        config: { medicion: 'km' }
      }
    ],

    plantilla_grupos: [
      { id: 'grupo-1', plantilla_id: PLANTILLA_ID, nombre: 'MOTOR Y NIVELES', abreviado: 'Aceite, refrigerante, fugas', orden: 1, solo_panel: false },
      { id: 'grupo-2', plantilla_id: PLANTILLA_ID, nombre: 'FRENOS Y DIRECCION', abreviado: 'Freno de servicio, parqueo, dirección', orden: 2, solo_panel: false },
      { id: 'grupo-3', plantilla_id: PLANTILLA_ID, nombre: 'LUCES', abreviado: 'Altas, bajas, direccionales, stop', orden: 3, solo_panel: false }
    ],

    plantilla_items: [
      { id: 'item-1', grupo_id: 'grupo-1', nombre: 'Nivel de aceite', orden: 1, critico: false, sin_foto: false, sin_validacion: false, nunca_bloquea: false, sub_pregunta: null },
      { id: 'item-2', grupo_id: 'grupo-1', nombre: 'Nivel de refrigerante', orden: 2, critico: false, sin_foto: false, sin_validacion: false, nunca_bloquea: false, sub_pregunta: null },

      {
        id: 'item-3', grupo_id: 'grupo-2', nombre: 'Freno de servicio', orden: 1,
        critico: true, sin_foto: false, sin_validacion: false, nunca_bloquea: false,
        sub_pregunta: {
          mensaje: '¿Cómo está el freno de servicio?',
          opciones: [
            { num: 1, texto: 'Responde pero con recorrido largo', severidad: 'alerta', estado: 'Recorrido largo' },
            { num: 2, texto: 'No frena / se va al fondo', severidad: 'bloqueo', estado: 'No frena' }
          ]
        }
      },
      { id: 'item-4', grupo_id: 'grupo-2', nombre: 'Freno de parqueo', orden: 2, critico: true, sin_foto: false, sin_validacion: false, nunca_bloquea: false, sub_pregunta: null },

      { id: 'item-5', grupo_id: 'grupo-3', nombre: 'Luces bajas', orden: 1, critico: true, sin_foto: false, sin_validacion: false, nunca_bloquea: false, sub_pregunta: null },
      { id: 'item-6', grupo_id: 'grupo-3', nombre: 'Direccionales', orden: 2, critico: false, sin_foto: true, sin_validacion: false, nunca_bloquea: false, sub_pregunta: null }
    ],

    preoperacionales: [],
    posoperacionales: [],
    tanqueos: [],
    evidencia: [],
    alertas: [],
    autorizaciones_novedad: [],
    historial_estado_activo: [],
    sesiones_activas: [],
    usuarios_panel: [],
    usuarios_roles: [],
    roles: [],
    permisos_rol: []
  };

  if (o.sinPlantilla) seed.plantillas_inspeccion = [];
  if (o.todosGruposSoloPanel) {
    seed.plantilla_grupos.forEach(function (g) { g.solo_panel = true; });
  }
  if (o.conductorSinSede) {
    seed.conductores[0].sede_id = null;
    seed.conductores[0].empresa_id = null;
  }

  return seed;
}

module.exports = {
  construirSeed: construirSeed,
  EMPRESA_ID: EMPRESA_ID,
  SEDE_ID: SEDE_ID,
  TIPO_ACTIVO_ID: TIPO_ACTIVO_ID,
  PLANTILLA_ID: PLANTILLA_ID,
  ACTIVO_ID: ACTIVO_ID,
  PLACA_DEMO: PLACA_DEMO,
  TELEFONO_DEMO: TELEFONO_DEMO
};
