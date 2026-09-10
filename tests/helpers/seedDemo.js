'use strict';

/**
 * tests/helpers/seedDemo.js
 *
 * Dataset mínimo viable para que un preoperacional corra de punta a punta.
 * Es, literalmente, la lista de lo que tiene que existir en Supabase para
 * que la demo funcione. Si algo de aquí falta en producción, el flujo se cae.
 */

var EMPRESA_ID = '11111111-1111-4111-8111-111111111111';
var SEDE_ID = '22222222-2222-4222-8222-222222222222';
var TIPO_ACTIVO_ID = '33333333-3333-4333-8333-333333333333';
var PLANTILLA_ID = '44444444-4444-4444-8444-444444444444';
var ACTIVO_ID = '55555555-5555-4555-8555-555555555555';

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
        id: '66666666-6666-4666-8666-666666666666',
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
      { id: 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa', plantilla_id: PLANTILLA_ID, nombre: 'MOTOR Y NIVELES', abreviado: 'Aceite, refrigerante, fugas', orden: 1, solo_panel: false },
      { id: 'aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaaa', plantilla_id: PLANTILLA_ID, nombre: 'FRENOS Y DIRECCION', abreviado: 'Freno de servicio, parqueo, dirección', orden: 2, solo_panel: false },
      { id: 'aaaaaaa3-aaaa-4aaa-8aaa-aaaaaaaaaaaa', plantilla_id: PLANTILLA_ID, nombre: 'LUCES', abreviado: 'Altas, bajas, direccionales, stop', orden: 3, solo_panel: false }
    ],

    plantilla_items: [
      { id: 'bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbbb', grupo_id: 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa', nombre: 'Nivel de aceite', orden: 1, critico: false, sin_foto: false, sin_validacion: false, nunca_bloquea: false, sub_pregunta: null },
      { id: 'bbbbbbb2-bbbb-4bbb-8bbb-bbbbbbbbbbbb', grupo_id: 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa', nombre: 'Nivel de refrigerante', orden: 2, critico: false, sin_foto: false, sin_validacion: false, nunca_bloquea: false, sub_pregunta: null },

      {
        id: 'bbbbbbb3-bbbb-4bbb-8bbb-bbbbbbbbbbbb', grupo_id: 'aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaaa', nombre: 'Freno de servicio', orden: 1,
        critico: true, sin_foto: false, sin_validacion: false, nunca_bloquea: false,
        sub_pregunta: {
          mensaje: '¿Cómo está el freno de servicio?',
          opciones: [
            { num: 1, texto: 'Responde pero con recorrido largo', severidad: 'alerta', estado: 'Recorrido largo' },
            { num: 2, texto: 'No frena / se va al fondo', severidad: 'bloqueo', estado: 'No frena' }
          ]
        }
      },
      { id: 'bbbbbbb4-bbbb-4bbb-8bbb-bbbbbbbbbbbb', grupo_id: 'aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaaa', nombre: 'Freno de parqueo', orden: 2, critico: true, sin_foto: false, sin_validacion: false, nunca_bloquea: false, sub_pregunta: null },

      { id: 'bbbbbbb5-bbbb-4bbb-8bbb-bbbbbbbbbbbb', grupo_id: 'aaaaaaa3-aaaa-4aaa-8aaa-aaaaaaaaaaaa', nombre: 'Luces bajas', orden: 1, critico: true, sin_foto: false, sin_validacion: false, nunca_bloquea: false, sub_pregunta: null },
      { id: 'bbbbbbb6-bbbb-4bbb-8bbb-bbbbbbbbbbbb', grupo_id: 'aaaaaaa3-aaaa-4aaa-8aaa-aaaaaaaaaaaa', nombre: 'Direccionales', orden: 2, critico: false, sin_foto: true, sin_validacion: false, nunca_bloquea: false, sub_pregunta: null }
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
