// Uso: node captura.js <pantalla> <ancho> <tema> [alto]
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const [pantalla, ancho, tema, alto] = process.argv.slice(2);
const DATOS = require('./config').DATOS;
(async () => {
  const b = await puppeteer.launch({ executablePath: require('./config').CHROME, headless: 'new' });
  const p = await b.newPage();
  const movil = Number(ancho) <= 720;
  await p.setViewport({ width: Number(ancho), height: 900, deviceScaleFactor: movil ? 2 : 1, isMobile: movil, hasTouch: movil });
  await p.goto('http://localhost:8766/', { waitUntil: 'networkidle0' });
  await p.evaluate((d, t) => { const x = JSON.parse(d); x.config.tema = t; localStorage.setItem('fp.finanzas.v1', JSON.stringify(x)); }, DATOS, tema);
  await p.reload({ waitUntil: 'networkidle0' });
  await p.click('[data-mes="anterior"]'); await p.click('[data-mes="anterior"]');
  await p.evaluate(s => { location.hash = '#/' + s; }, pantalla);
  await new Promise(r => setTimeout(r, 400));
  await p.evaluate(() => { document.querySelectorAll('.toast').forEach(t => t.remove()); document.activeElement && document.activeElement.blur(); });
  const h = alto ? Number(alto) : await p.evaluate(() => document.documentElement.scrollHeight);
  const salida = 'capturas/' + (process.env.SUFIJO || '') + pantalla + '-' + ancho + '-' + tema + '.png';
  await p.screenshot({ path: salida, clip: { x: 0, y: 0, width: Number(ancho), height: h }, captureBeyondViewport: true });
  console.log(salida);
  await b.close();
})();
