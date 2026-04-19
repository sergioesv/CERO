'use strict';

const config = require('../config/config');
const supabase = config.supabase;

async function inspect() {
  console.log('--- Tipos de Activo ---');
  const { data: tipos, error: errTipos } = await supabase.from('tipos_activo').select('*');
  if (errTipos) console.error('Error tipos:', errTipos);
  else console.table(tipos);

  console.log('\n--- Plantillas de Inspección ---');
  const { data: plantillas, error: errPlantillas } = await supabase.from('plantillas_inspeccion').select('*');
  if (errPlantillas) console.error('Error plantillas:', errPlantillas);
  else console.table(plantillas);

  console.log('\n--- Activos (primeros 5) ---');
  const { data: activos, error: errActivos } = await supabase.from('activos').select('id, placa, tipo_activo_id, empresa_id').limit(5);
  if (errActivos) console.error('Error activos:', errActivos);
  else console.table(activos);
}

inspect();
