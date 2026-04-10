#!/usr/bin/env node
/**
 * Genera las secciones automáticas de ARCHITECTURE.md
 * Corre en GitHub Actions en cada push a desarrollo
 */

const fs = require('fs');
const path = require('path');

// --- Genera árbol de carpetas ignorando rutas no relevantes ---
const IGNORAR = new Set([
  'node_modules', '.git', '.cursor', 'coverage',
  '.env', '.env.local', 'dist', 'build', '__pycache__'
]);

function generarArbol(dir, prefijo = '', esRaiz = true) {
  let resultado = '';
  let entradas;

  try {
    entradas = fs.readdirSync(dir)
      .filter(e => !IGNORAR.has(e) && !e.startsWith('.'))
      .sort((a, b) => {
        // carpetas primero
        const aDir = fs.statSync(path.join(dir, a)).isDirectory();
        const bDir = fs.statSync(path.join(dir, b)).isDirectory();
        if (aDir && !bDir) return -1;
        if (!aDir && bDir) return 1;
        return a.localeCompare(b);
      });
  } catch {
    return resultado;
  }

  entradas.forEach((entrada, i) => {
    const rutaCompleta = path.join(dir, entrada);
    const esUltimo = i === entradas.length - 1;
    const conector = esUltimo ? '└── ' : '├── ';
    const esCarpeta = fs.statSync(rutaCompleta).isDirectory();
    const icono = esCarpeta ? '' : '';

    resultado += `${prefijo}${conector}${entrada}\n`;

    if (esCarpeta) {
      const nuevoPrefijo = prefijo + (esUltimo ? '    ' : '│   ');
      resultado += generarArbol(rutaCompleta, nuevoPrefijo, false);
    }
  });

  return resultado;
}

// --- Lee dependencias del package.json ---
function leerDependencias() {
  try {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const deps = Object.entries(pkg.dependencies || {})
      .map(([name, version]) => `| \`${name}\` | ${version} |`)
      .join('\n');
    const devDeps = Object.entries(pkg.devDependencies || {})
      .map(([name, version]) => `| \`${name}\` | ${version} |`)
      .join('\n');
    return { deps, devDeps };
  } catch {
    return { deps: '_no encontrado_', devDeps: '_no encontrado_' };
  }
}

// --- Construye el bloque auto-generado ---
function construirBloqueAuto() {
  const fecha = new Date().toISOString().split('T')[0];
  const arbol = generarArbol('.');
  const { deps, devDeps } = leerDependencias();

  return `<!-- AUTO-GENERATED START — no editar manualmente -->
<!-- Última actualización: ${fecha} -->

## Folder structure

\`\`\`
${arbol.trimEnd()}
\`\`\`

## Dependencies

| Package | Version |
|---|---|
${deps || '_ninguna_'}

### Dev dependencies

| Package | Version |
|---|---|
${devDeps || '_ninguna_'}

<!-- AUTO-GENERATED END -->`;
}

// --- Reemplaza el bloque en ARCHITECTURE.md ---
function actualizarArchitecture() {
  const archivo = 'ARCHITECTURE.md';

  if (!fs.existsSync(archivo)) {
    console.error(`❌ ${archivo} no encontrado en la raíz del repo`);
    process.exit(1);
  }

  let contenido = fs.readFileSync(archivo, 'utf8');
  const inicio = '<!-- AUTO-GENERATED START — no editar manualmente -->';
  const fin = '<!-- AUTO-GENERATED END -->';

  const bloqueNuevo = construirBloqueAuto();

  if (contenido.includes(inicio) && contenido.includes(fin)) {
    // reemplaza el bloque existente
    const regex = new RegExp(`${inicio}[\\s\\S]*?${fin}`, 'g');
    contenido = contenido.replace(regex, bloqueNuevo);
  } else {
    // agrega al final si no existe todavía
    contenido = contenido.trimEnd() + '\n\n' + bloqueNuevo + '\n';
  }

  fs.writeFileSync(archivo, contenido, 'utf8');
  console.log(`✅ ARCHITECTURE.md actualizado — ${new Date().toISOString()}`);
}

actualizarArchitecture();
