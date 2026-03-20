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
  fotoPlaca: 'Envia una foto frontal donde la placa ocupe buena parte de la imagen. Acercate un poco, con buena luz y sin reflejos.',
  fotoOdometro: 'Envia una foto de frente al display del odometro. Acercate al tablero para que el numero quede centrado y legible.'
};

function escaparXml(valor) {
  return String(valor == null ? '' : valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function responderTwiml(res, mensaje) {
  var twiml = '<?xml version="1.0" encoding="UTF-8"?>';
  twiml += '<Response>';
  twiml += '<Message>' + escaparXml(mensaje) + '</Message>';
  twiml += '</Response>';
  res.type('text/xml');
  res.send(twiml);
}

function formatGrupoMsg(grupo, prefijo) {
  var msg = prefijo ? (prefijo + '\n\n') : '';
  msg += '*' + grupo.nombre + '*\n';
  msg += grupo.abreviado + '\n';
  msg += '───────────────\n';
  msg += '1️⃣ Todo OK\n';
  msg += '2️⃣ Novedad\n\n';
  msg += '0️⃣ _Atrás_  •  9️⃣ _Menú principal_';
  return msg;
}

function sinAcentos(texto) {
  return String(texto == null ? '' : texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizarPlaca(placa) {
  return sinAcentos(placa).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizarEstado(estado) {
  if (typeof estado === 'number') return estado;
  return sinAcentos(estado).toLowerCase().replace(/\s+/g, ' ').trim();
}

function clasificarEstado(estado) {
  if (typeof estado === 'number') {
    if (estado === 1) return 'ok';
    if (estado === 2) return 'advertencia';
    if (estado === 3) return 'critico';
    if (estado === 4) return 'na';
    return 'critico';
  }

  var est = normalizarEstado(estado);
  if (!est || est === 'ok' || est === 'funciona' || est === 'completo' || est === 'sin fugas' || est === 'normal' || est === 'bueno' || est === 'buena') {
    return 'ok';
  }

  if (est === 'n/a' || est === 'na' || est === 'no aplica' || est === 'no aplica.') {
    return 'na';
  }

  if (
    est === 'bajo' ||
    est === 'desgastada' ||
    est === 'desgastado' ||
    est === 'intermitente' ||
    est === 'incompleto' ||
    est === 'danado' ||
    est === 'dañado' ||
    est === 'dano' ||
    est === 'daño' ||
    est === 'duro o flojo' ||
    est === 'sin presion' ||
    est === 'sin presión' ||
    est === 'poca presion' ||
    est === 'flojo' ||
    est === 'baja'
  ) {
    return 'advertencia';
  }

  return 'critico';
}

function generarResumen(sesion) {
  var resumen = '───────────────\n';
  resumen += '*RESUMEN ' + (sesion.placa || '') + '*\n';
  resumen += '───────────────\n';
  var hayNovedades = false;

  for (var g = 0; g < GRUPOS.length; g++) {
    var grupo = GRUPOS[g];
    var respuesta = sesion.respuestas[grupo.id];
    if (!respuesta || !Array.isArray(respuesta.items)) continue;

    for (var m = 0; m < respuesta.items.length; m++) {
      var item = respuesta.items[m];
      var clasificacion = clasificarEstado(item.estado);

      if (clasificacion === 'advertencia' || clasificacion === 'critico') {
        hayNovedades = true;
        resumen += '⚠️ *' + item.nombre + '* - ' + (item.estado || 'Con novedad');
        if (item.nota) resumen += '\n    _' + item.nota + '_';
        resumen += '\n';
      }

      if (clasificacion === 'na') {
        hayNovedades = true;
        resumen += '○ ' + item.nombre + ' - N/A\n';
      }
    }
  }

  if (!hayNovedades) {
    resumen += '✅ Todo en buen estado';
  }

  return resumen;
}

function esCritico(grupoId, itemNombre) {
  for (var g = 0; g < GRUPOS.length; g++) {
    if (GRUPOS[g].id === grupoId) {
      for (var i = 0; i < GRUPOS[g].items.length; i++) {
        if (GRUPOS[g].items[i].nombre === itemNombre) {
          return !!GRUPOS[g].items[i].critico;
        }
      }
    }
  }
  return false;
}

function construirMapaItems() {
  var mapa = {};
  for (var g = 0; g < GRUPOS.length; g++) {
    for (var i = 0; i < GRUPOS[g].items.length; i++) {
      mapa[GRUPOS[g].items[i].nombre] = GRUPOS[g].items[i];
    }
  }
  return mapa;
}

function obtenerNovedadesFotografiables(novedades) {
  var mapaItems = construirMapaItems();
  return (novedades || []).filter(function(novedad) {
    var definicion = mapaItems[novedad.item];
    return !definicion || !definicion.sinFoto;
  });
}

function ocultarTelefono(telefono) {
  var limpio = String(telefono || '').replace('whatsapp:', '');
  if (limpio.length <= 4) return limpio;
  return limpio.slice(0, 3) + '***' + limpio.slice(-2);
}


module.exports = {
  GRUPOS,
  PASOS_INICIALES,
  responderTwiml,
  generarResumen,
  esCritico,
  formatGrupoMsg,
  escaparXml,
  normalizarPlaca,
  normalizarEstado,
  clasificarEstado,
  obtenerNovedadesFotografiables,
  ocultarTelefono
};
