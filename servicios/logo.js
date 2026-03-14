const path = require('path');

// Ahora solo exportamos la ruta física del archivo en el servidor
const LOGO_PATH = path.join(__dirname, '../assets/logo.png');

module.exports = { LOGO_PATH };
