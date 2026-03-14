// modulos/vehiculos/posoperacional/validaciones.js
// Catálogo de validaciones para inspección posoperacional

const ITEMS_POSOPERACIONAL = [
  {
    id: 'estado_carroceria',
    nombre: 'Estado de carrocería',
    descripcion: 'Golpes, rayones, abolladuras nuevas',
    critico: true,
    requiereFoto: true,
    estados: ['Sin novedad', 'Golpe leve', 'Daño significativo']
  },
  {
    id: 'luces_funcionamiento',
    nombre: 'Luces y señalización',
    descripcion: 'Todas las luces funcionando correctamente',
    critico: true,
    requiereFoto: false,
    estados: ['Funcionan', 'Una averiada', 'Varias averiadas']
  },
  {
    id: 'llantas_desgaste',
    nombre: 'Estado de llantas',
    descripcion: 'Desgaste, pinchazos, presión',
    critico: true,
    requiereFoto: true,
    estados: ['Buen estado', 'Desgaste notable', 'Requiere cambio']
  },
  {
    id: 'limpieza_interior',
    nombre: 'Limpieza interior',
    descripcion: 'Cabina limpia y ordenada',
    critico: false,
    requiereFoto: false,
    estados: ['Limpio', 'Sucio', 'Muy sucio']
  },
  {
    id: 'herramientas_equipos',
    nombre: 'Herramientas y equipos',
    descripcion: 'Todo el equipo completo y en su lugar',
    critico: true,
    requiereFoto: false,
    estados: ['Completo', 'Falta algo', 'Varios faltantes']
  }
];

const NIVELES_COMBUSTIBLE = [
  { valor: 'VACIO', emoji: '🔴', texto: 'Vacío (reserva)' },
  { valor: '1/4', emoji: '🟡', texto: '1/4 de tanque' },
  { valor: '1/2', emoji: '🟢', texto: '1/2 tanque' },
  { valor: '3/4', emoji: '🟢', texto: '3/4 de tanque' },
  { valor: 'LLENO', emoji: '🟢', texto: 'Tanque lleno' }
];

function validarKilometraje(kmFinal, kmInicial) {
  const diferencia = kmFinal - kmInicial;
  
  if (diferencia < 0) {
    return {
      valido: false,
      error: 'El kilometraje final no puede ser menor al inicial'
    };
  }
  
  if (diferencia > 500) {
    return {
      valido: false,
      error: 'Recorrido muy alto para una jornada (>500 km). Verifica el dato.'
    };
  }
  
  if (diferencia === 0) {
    return {
      valido: true,
      advertencia: 'El vehículo no registró movimiento hoy'
    };
  }
  
  return {
    valido: true,
    kmRecorridos: diferencia
  };
}

function calcularHorasTrabajadas(horaInicio, horaFin) {
  const diff = new Date(horaFin) - new Date(horaInicio);
  const horas = diff / (1000 * 60 * 60);
  return Math.round(horas * 10) / 10; // Redondear a 1 decimal
}

function generarResumenPosoperacional(datos) {
  const novedadesCriticas = datos.novedades.filter(n => n.critico);
  const hayNovedades = datos.novedades.length > 0;
  
  let estado = 'OK';
  if (novedadesCriticas.length > 0) {
    estado = 'REQUIERE_ATENCION';
  } else if (hayNovedades) {
    estado = 'CON_NOVEDADES';
  }
  
  return {
    estado,
    totalNovedades: datos.novedades.length,
    novedadesCriticas: novedadesCriticas.length,
    kmRecorridos: datos.kilometrajeFinal - datos.kilometrajeInicial,
    combustibleRestante: datos.combustibleRestante
  };
}

module.exports = {
  ITEMS_POSOPERACIONAL,
  NIVELES_COMBUSTIBLE,
  validarKilometraje,
  calcularHorasTrabajadas,
  generarResumenPosoperacional
};
