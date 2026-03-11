const GRUPOS = [
  {
    id: 'motor_niveles',
    nombre: 'MOTOR Y NIVELES',
    items: [
      { nombre: 'Aceite motor', critico: true, sinValidacion: true },
      { nombre: 'Refrigerante', critico: true, sinValidacion: true },
      { nombre: 'Liquido frenos', critico: true, sinValidacion: true },
      { nombre: 'Fugas visibles', critico: true }
    ],
    abreviado: 'Aceite . Refrigerante . Liq.frenos . Fugas'
  },
  {
    id: 'electrico_luces',
    nombre: 'ELECTRICO Y LUCES',
    items: [
      { nombre: 'Luces delanteras/traseras', critico: true },
      { nombre: 'Stops y direccionales', critico: true },
      { nombre: 'Pito y alarma reversa', critico: true, sinFoto: true },
      { nombre: 'Tablero instrumentos', critico: false, sinFoto: true },
      { nombre: 'Baterias', critico: false }
    ],
    abreviado: 'Luces . Stops . Pito . Tablero . Baterias'
  },
  {
    id: 'frenos_direccion_llantas',
    nombre: 'FRENOS, DIRECCION Y LLANTAS',
    items: [
      { nombre: 'Freno de parqueo', critico: true },
      { nombre: 'Estado llantas', critico: true },
      { nombre: 'Pernos de ruedas', critico: true },
      { nombre: 'Llanta repuesto', critico: false }
    ],
    abreviado: 'Freno parqueo . Llantas . Pernos . Repuesto'
  },
  {
    id: 'cabina_equipo',
    nombre: 'CABINA Y EQUIPO',
    items: [
      { nombre: 'Cinturones seguridad', critico: true },
      { nombre: 'Retrovisores', critico: true },
      { nombre: 'Pedales', critico: true, sinFoto: true },
      { nombre: 'Vidrios y limpiabrisas', critico: false },
      { nombre: 'Aseo y elementos sueltos', critico: false, sinFoto: true },
      { nombre: 'Aire acondicionado', critico: false, sinFoto: true },
      { nombre: 'Equipo carretera', critico: true }
    ],
    abreviado: 'Cinturones . Retrovisores . Pedales . Vidrios . Aseo . Aire . Equipo carretera'
  }
];

const PASOS_INICIALES = {
  fotoPlaca: 'Envia una foto frontal del vehiculo donde la placa se vea completa y legible.',
  fotoOdometro: 'Envia una foto del odometro o tablero donde se vea claramente el kilometraje.'
};

module.exports = { GRUPOS, PASOS_INICIALES };
