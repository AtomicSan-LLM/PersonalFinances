// Servidor de prueba SIN caché: sirve la carpeta del repo y obliga al navegador a pedir
// siempre la última versión de cada archivo (evita ver JS viejo con CSS nuevo al recargar).
// Uso: node servidor.js [puerto]      (por defecto http://localhost:8766/)
const http = require('http');
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const PUERTO = Number(process.argv[2]) || 8766;
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8'
};

http.createServer((req, res) => {
  let ruta;
  try { ruta = decodeURIComponent(req.url.split('?')[0]); } catch (e) { res.writeHead(400); res.end(); return; }
  let archivo = path.join(RAIZ, ruta);
  if (archivo !== RAIZ && !archivo.startsWith(RAIZ + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.stat(archivo, (err, st) => {
    if (!err && st.isDirectory()) archivo = path.join(archivo, 'index.html');
    fs.readFile(archivo, (err2, datos) => {
      if (err2) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('No encontrado'); return; }
      res.writeHead(200, {
        'Content-Type': TIPOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      res.end(datos);
    });
  });
}).listen(PUERTO, '127.0.0.1', () => console.log('Sirviendo ' + RAIZ + ' en http://localhost:' + PUERTO + '/ (sin caché)'));
