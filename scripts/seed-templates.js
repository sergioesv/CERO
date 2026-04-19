'use strict';

const config = require('../config/config');
const supabase = config.supabase;

async function seed() {
  console.log('🚀 Iniciando seed de plantillas...');

  // 1. Obtener o crear tipo de activo 'vehiculo_liviano'
  let { data: tipo, error: errTipo } = await supabase
    .from('tipos_activo')
    .select('id')
    .eq('codigo', 'vehiculo_liviano')
    .maybeSingle();

  if (errTipo) {
    console.error('❌ Error buscando tipo_activo:', errTipo);
    return;
  }

  let tipoId;
  if (!tipo) {
    console.log('ℹ️ Creando tipo de activo "vehiculo_liviano"...');
    const { data: nuevoTipo, error: errCrearTipo } = await supabase
      .from('tipos_activo')
      .insert([{ 
        codigo: 'vehiculo_liviano', 
        nombre: 'Vehículo Liviano', 
        categoria: 'flota', 
        activo: true, 
        frecuencia_inspeccion: 'diaria' 
      }])
      .select()
      .single();
    
    if (errCrearTipo) {
      console.error('❌ Error creando tipo_activo:', errCrearTipo);
      return;
    }
    tipoId = nuevoTipo.id;
  } else {
    tipoId = tipo.id;
  }

  console.log('✅ Tipo de activo:', tipoId);

  // 2. Crear plantilla global para este tipo
  const { data: plantilla, error: errPlantilla } = await supabase
    .from('plantillas_inspeccion')
    .upsert([{
      tipo_activo_id: tipoId,
      tipo_inspeccion: 'preoperacional',
      nombre: 'Inspección Preoperacional Estándar',
      activa: true,
      config: { medicion: 'km', requiere_foto_placa: true, requiere_foto_medicion: true }
    }], { onConflict: 'tipo_activo_id, tipo_inspeccion, empresa_id', ignoreDuplicates: false })
    .select()
    .single();

  if (errPlantilla) {
    console.error('❌ Error creando plantilla:', errPlantilla);
    return;
  }

  console.log('✅ Plantilla creada:', plantilla.id);

  // 3. Crear grupos e ítems
  const grupos = [
    {
      nombre: 'MOTOR Y NIVELES',
      abreviado: 'Aceite . Refrigerante . Fugas',
      orden: 1,
      items: [
        { nombre: 'Aceite motor', critico: true },
        { nombre: 'Nivel de refrigerante', critico: true },
        { nombre: 'Fugas visibles', critico: true },
        { nombre: 'Batería y bornes', critico: false }
      ]
    },
    {
      nombre: 'LUCES Y ELÉCTRICO',
      abreviado: 'Farolas . Cocuyos . Direccionales',
      orden: 2,
      items: [
        { nombre: 'Luces principales', critico: true },
        { nombre: 'Direccionales y parqueo', critico: true },
        { nombre: 'Luces de freno', critico: true },
        { nombre: 'Pito / Alarma reversa', critico: true }
      ]
    },
    {
      nombre: 'FRENOS Y LLANTAS',
      abreviado: 'Presión . Desgaste . Frenado',
      orden: 3,
      items: [
        { nombre: 'Estado de llantas', critico: true },
        { nombre: 'Presión de aire', critico: false },
        { nombre: 'Freno de pedal', critico: true },
        { nombre: 'Freno de mano', critico: true }
      ]
    },
    {
      nombre: 'SEGURIDAD Y CABINA',
      abreviado: 'Cinturones . Espejos . Vidrios',
      orden: 4,
      items: [
        { nombre: 'Cinturones de seguridad', critico: true },
        { nombre: 'Espejos retrovisores', critico: true },
        { nombre: 'Limpiabrisas', critico: false },
        { nombre: 'Extintor y Botiquín', critico: true }
      ]
    }
  ];

  for (const g of grupos) {
    const { data: grupo, error: errG } = await supabase
      .from('plantilla_grupos')
      .insert([{
        plantilla_id: plantilla.id,
        nombre: g.nombre,
        abreviado: g.abreviado,
        orden: g.orden
      }])
      .select()
      .single();

    if (errG) {
      console.error(`❌ Error creando grupo ${g.nombre}:`, errG);
      continue;
    }

    const itemsParaInsertar = g.items.map((it, idx) => ({
      grupo_id: grupo.id,
      nombre: it.nombre,
      critico: it.critico,
      orden: idx + 1
    }));

    const { error: errI } = await supabase
      .from('plantilla_items')
      .insert(itemsParaInsertar);

    if (errI) {
      console.error(`❌ Error creando ítems para ${g.nombre}:`, errI);
    } else {
      console.log(`✅ Grupo ${g.nombre} con ${g.items.length} ítems creado.`);
    }
  }

  console.log('\n✨ Seed completado con éxito.');
}

seed();
