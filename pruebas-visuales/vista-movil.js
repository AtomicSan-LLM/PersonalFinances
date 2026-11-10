const puppeteer = require('puppeteer-core');
const fs = require('fs');
const DATOS = require('./config').DATOS;
(async () => {
  const b = await puppeteer.launch({ executablePath: require('./config').CHROME, headless: 'new' });
  for (const [pantalla, tema] of [['movimientos', 'claro'], ['historico', 'oscuro']]) {
    const p = await b.newPage();
    await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await p.goto('http://localhost:8766/', { waitUntil: 'networkidle0' });
    await p.evaluate((d, t) => { const x = JSON.parse(d); x.config.tema = t; localStorage.setItem('fp.finanzas.v1', JSON.stringify(x)); }, DATOS, tema);
    await p.reload({ waitUntil: 'networkidle0' });
    await p.click('[data-mes="anterior"]'); await p.click('[data-mes="anterior"]');
    await p.evaluate(s => { location.hash = '#/' + s; }, pantalla);
    await new Promise(r => setTimeout(r, 400));
    await p.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
    await p.screenshot({ path: 'capturas/vista-' + pantalla + '-movil.png', clip: { x: 0, y: 0, width: 390, height: 1200 }, captureBeyondViewport: true });
    await p.close();
  }
  await b.close();
})();
