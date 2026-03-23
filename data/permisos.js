const { supabase } = require('../config/config');

const SYSTEM_MODULES = [
  'vehiculos',
  'preoperacional',
  'posoperacional',
  'tanqueos',
  'alertas',
  'conductores',
  'sedes',
  'usuarios'
];

const SYSTEM_ACTIONS = ['ver', 'crear', 'editar', 'autorizar'];

const ROLE_MATRIX = {
  superadmin_plataforma: {
    modulos: SYSTEM_MODULES,
    acciones: SYSTEM_ACTIONS
  },
  superadmin_emp: {
    modulos: ['vehiculos', 'preoperacional', 'posoperacional', 'tanqueos', 'alertas', 'conductores', 'sedes', 'usuarios'],
    acciones: ['ver', 'crear', 'editar']
  },
  administrador: {
    modulos: ['vehiculos', 'preoperacional', 'posoperacional', 'tanqueos', 'alertas', 'conductores'],
    acciones: ['ver', 'crear', 'editar']
  },
  supervisor: {
    modulos: ['vehiculos', 'preoperacional', 'posoperacional', 'tanqueos', 'alertas'],
    acciones: ['ver', 'autorizar']
  }
};

function construirPermisosBase(rolesData) {
  const filas = [];

  rolesData.forEach((rol) => {
    const config = ROLE_MATRIX[rol.nombre];
    if (!config) return;

    config.modulos.forEach((modulo) => {
      config.acciones.forEach((accion) => {
        filas.push({
          rol_id: rol.id,
          modulo,
          accion,
          permitido: true
        });
      });
    });
  });

  return filas;
}

async function seedPermisosBase() {
  const rolesSistema = Object.keys(ROLE_MATRIX);
  const { data: rolesData, error: rolesError } = await supabase
    .from('roles')
    .select('id, nombre')
    .in('nombre', rolesSistema);

  if (rolesError) throw rolesError;

  const filas = construirPermisosBase(rolesData || []);
  if (filas.length === 0) {
    console.warn('No se encontraron roles para sembrar permisos base.');
    return;
  }

  const { error: insertError } = await supabase
    .from('permisos_rol')
    .upsert(filas, {
      onConflict: 'rol_id,modulo,accion',
      ignoreDuplicates: true
    });

  if (insertError) throw insertError;

  console.log(`Seed permisos_rol aplicado (${filas.length} permisos base)`);
}

module.exports = {
  seedPermisosBase,
  ROLE_MATRIX,
  SYSTEM_ACTIONS,
  SYSTEM_MODULES
};
