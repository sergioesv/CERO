const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/**'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.node,
        ...globals.browser
      },
    },
    rules: {
      // ASCII art / tablas en comentarios (p. ej. canales/whatsapp.js)
      'no-irregular-whitespace': 'off',
      // Base de código existente: avisos hasta poder corregir con calma
      'no-unused-vars': 'warn',
      'no-redeclare': 'warn',
      'no-useless-assignment': 'warn',
      'no-useless-escape': 'warn',
      'no-empty': 'warn',
      'no-prototype-builtins': 'warn',
      'preserve-caught-error': 'warn',
    },
  },
  {
    files: ['public/**/*.js'],
    rules: {
      // Carga vía <script>: símbolos globales entre archivos (sin módulos)
      'no-undef': 'off',
    },
  },
];
