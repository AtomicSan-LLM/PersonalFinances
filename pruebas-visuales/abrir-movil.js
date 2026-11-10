// Abre la app en una ventana de Chrome con vista de iPhone 15 Pro (393 × 852) y tus datos
// del export, para revisarla a mano. Usa un perfil temporal: no toca los datos de tu navegador.
// Uso: node abrir-movil.js [pantalla] [claro|oscuro]     (servidor en http://localhost:8766/)
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const [pantalla = 'inicio', tema = 'oscuro'] = process.argv.slice(2);
const DATOS = require('./config').DATOS;
(async () => {
  const b = await puppeteer.launch({
    executablePath: require('./config').CHROME,
    headless: false, defaultViewport: null,
    args: ['--window-size=409,945', '--window-position=80,20']
  });
  const p = (await b.pages())[0];
  await p.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.goto('http://localhost:8766/', { waitUntil: 'networkidle0' });
  await p.evaluate((d, t) => { const x = JSON.parse(d); x.config.tema = t; localStorage.setItem('fp.finanzas.v1', JSON.stringify(x)); }, DATOS, tema);
  await p.reload({ waitUntil: 'networkidle0' });
  // Noviembre → septiembre (mes con los datos del export)
  await p.click('[data-mes="anterior"]'); await p.click('[data-mes="anterior"]');
  await p.evaluate(s => { location.hash = '#/' + s; }, pantalla);
  b.on('disconnected', () => process.exit(0));   // se cierra al cerrar la ventana
})();
