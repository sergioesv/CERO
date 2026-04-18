// servicios/passwords.js
// Generacion y validacion de contrasenas temporales para usuarios del panel
// Se usa al crear usuario y al resetear password desde admin

const crypto = require('crypto');

// Caracteres seguros (sin ambigüedades: sin 0/O/o, 1/l/I)
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/**
 * Genera una contrasena temporal criptograficamente segura.
 * @param {number} longitud - Longitud (default 12)
 * @returns {string} Password aleatorio
 */
function generarPasswordTemporal(longitud = 12) {
  if (longitud < 8) longitud = 8;
  let password = '';
  const maxIndex = CHARS.length;
  const bytes = crypto.randomBytes(longitud);
  for (let i = 0; i < longitud; i++) {
    password += CHARS[bytes[i] % maxIndex];
  }
  return password;
}

/**
 * Valida que una contrasena cumpla los requisitos minimos.
 * @param {string} password
 * @returns {{ valido: boolean, error?: string }}
 */
function validarPassword(password) {
  if (!password || typeof password !== 'string') {
    return { valido: false, error: 'Contrasena requerida' };
  }
  if (password.length < 8) {
    return { valido: false, error: 'La contrasena debe tener al menos 8 caracteres' };
  }
  if (password.length > 100) {
    return { valido: false, error: 'La contrasena es demasiado larga' };
  }
  return { valido: true };
}

module.exports = {
  generarPasswordTemporal,
  validarPassword
};
