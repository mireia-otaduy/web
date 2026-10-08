#!/usr/bin/env node
/**
 * Servidor local de vista previa.
 *
 * Sirve /public aplicando las MISMAS cabeceras que Firebase Hosting (firebase.json),
 * incluida la política de seguridad de contenido (CSP). Así, cualquier recurso
 * bloqueado en producción también se bloquea aquí y se detecta antes de publicar.
 *
 * Uso:  node tools/serve.mjs [puerto]          (por defecto 5000)
 *       node tools/serve.mjs --watch [puerto]  (recompila al cambiar algo en /src)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const args = process.argv.slice(2);
const watch = args.includes('--watch');
const port = Number(args.find((arg) => /^\d+$/.test(arg)) ?? 5000);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

/** Convierte un patrón de glob de Firebase ("**", "*", "@(a|b)") en expresión regular. */
function globToRegExp(pattern) {
  const source = pattern
    .replace(/[.+^${}[\]\\]/g, '\\$&')
    .replace(/@\(([^)]*)\)/g, '($1)')
    .replace(/\*\*\/?/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*');
  return new RegExp(`^${source}$`);
}

function loadHeaderRules() {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8'));
  return config.hosting.headers.map((rule) => ({ regex: globToRegExp(rule.source), headers: rule.headers }));
}

function build() {
  const result = spawnSync(process.execPath, [path.join(ROOT, 'tools/build.mjs')], { stdio: 'inherit' });
  return result.status === 0;
}

function resolveFile(urlPath) {
  let relative = decodeURIComponent(urlPath.split('?')[0]);
  if (relative.endsWith('/')) relative += 'index.html';
  const file = path.normalize(path.join(PUBLIC, relative));
  if (!file.startsWith(PUBLIC)) return null;
  return file;
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://localhost:${port}`);
  let status = 200;
  let file = resolveFile(url.pathname);

  // /en → /en/ (como Firebase Hosting)
  if (file && fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    response.writeHead(301, { Location: `${url.pathname}/` });
    response.end();
    return;
  }
  if (!file || !fs.existsSync(file)) {
    status = 404;
    file = path.join(PUBLIC, '404.html');
  }

  const headers = { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' };
  for (const rule of loadHeaderRules()) {
    if (rule.regex.test(url.pathname)) {
      for (const { key, value } of rule.headers) {
        // En local no hay HTTPS: se omite la orden de "subir" las peticiones a https
        headers[key] = key === 'Content-Security-Policy' ? value.replace('; upgrade-insecure-requests', '') : value;
      }
    }
  }

  // Como Firebase Hosting, se comprime el texto cuando el navegador lo admite
  const compressible = /^(text\/|application\/(json|xml|manifest)|image\/svg)/.test(headers['Content-Type']);
  if (compressible && /\bgzip\b/.test(request.headers['accept-encoding'] ?? '')) {
    headers['Content-Encoding'] = 'gzip';
    headers.Vary = 'Accept-Encoding';
    response.writeHead(status, headers);
    fs.createReadStream(file).pipe(zlib.createGzip()).pipe(response);
    return;
  }

  response.writeHead(status, headers);
  fs.createReadStream(file).pipe(response);
});

if (!fs.existsSync(PUBLIC)) build();

server.listen(port, () => console.log(`Vista previa en http://localhost:${port}  (Ctrl+C para salir)`));

if (watch) {
  let timer = 0;
  fs.watch(path.join(ROOT, 'src'), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => build(), 150);
  });
  console.log('Modo --watch: se recompila al guardar cambios en /src');
}
