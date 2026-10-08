/**
 * Utilidades de medios: lectura de dimensiones de imagen (JPEG y PNG) y construcción
 * del sprite SVG. Se leen las cabeceras directamente para no depender de librerías.
 */
import fs from 'node:fs';
import path from 'node:path';
import { BuildError } from './engine.mjs';

/** Devuelve { width, height } de un archivo JPEG o PNG. */
export function imageSize(file) {
  const buf = fs.readFileSync(file);

  // PNG: firma de 8 bytes + chunk IHDR (ancho y alto en los bytes 16-23).
  if (buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  // JPEG: se recorren los segmentos hasta encontrar un marcador SOF.
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset < buf.length) {
      if (buf[offset] !== 0xff) throw new BuildError(`JPEG dañado: ${file}`);
      const marker = buf[offset + 1];
      const length = buf.readUInt16BE(offset + 2);
      const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
      if (isSof) return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
      offset += 2 + length;
    }
  }

  throw new BuildError(`Formato de imagen no soportado: ${file}`);
}

/**
 * Lee todos los iconos de src/icons y devuelve { nombre: contenidoInterior }.
 * El archivo aliases.json permite dar nombres de uso ("tech-1") a iconos existentes ("layers").
 */
export function loadIcons(dir) {
  const icons = {};
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.svg')) continue;
    const svg = fs.readFileSync(path.join(dir, file), 'utf8');
    const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    icons[file.replace(/\.svg$/, '')] = inner.replace(/\s+/g, ' ').trim();
  }
  const aliasFile = path.join(dir, 'aliases.json');
  if (fs.existsSync(aliasFile)) {
    for (const [alias, target] of Object.entries(JSON.parse(fs.readFileSync(aliasFile, 'utf8')))) {
      if (!icons[target]) throw new BuildError(`aliases.json: el icono "${target}" no existe (alias ${alias})`);
      icons[alias] = icons[target];
    }
  }
  return icons;
}

/** Construye el sprite con solo los iconos usados en una página. */
export function buildSprite(icons, used) {
  if (used.size === 0) return '';
  const symbols = [...used]
    .sort()
    .map((name) => `<symbol id="i-${name}" viewBox="0 0 24 24">${icons[name]}</symbol>`)
    .join('');
  return `<svg class="sprite" width="0" height="0" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">${symbols}</svg>`;
}
