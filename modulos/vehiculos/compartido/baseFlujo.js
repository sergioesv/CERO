function crearFlujoPlaceholder(nombreModulo) {
  function registrar() {
    throw new Error('Modulo ' + nombreModulo + ' pendiente. Base modular lista para desarrollarlo en esta rama.');
  }

  function describir() {
    return {
      nombre: nombreModulo,
      estado: 'pendiente',
      contrato: {
        registrar: 'Funcion para registrar rutas o canal del modulo',
        validarEntrada: 'Funcion opcional para normalizar mensajes o payloads',
        persistir: 'Integracion futura con data/* y servicios/*'
      }
    };
  }

  return {
    registrar,
    describir
  };
}

module.exports = {
  crearFlujoPlaceholder
};
