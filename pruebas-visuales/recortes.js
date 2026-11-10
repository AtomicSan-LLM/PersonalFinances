// Revisa en 360 y 390 px que ninguna cifra de las tarjetas moradas quede recortada.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const DATOS = require('./config').DATOS;
(async () => {
  const b = await puppeteer.launch({ executablePath: require('./config').CHROME, headless: 'new' });
  let mal = 0;
  for (const ancho of [360, 390]) for (const pantalla of ['inicio', 'movimientos', 'historico', 'presupuesto', 'recurrentes', 'comparar']) {
    const p = await b.newPage();
    await p.setViewport({ width: ancho, height: 800, isMobile: true, hasTouch: true });
    await p.goto('http://localhost:8766/', { waitUntil: 'networkidle0' });
    await p.evaluate(d => localStorage.setItem('fp.finanzas.v1', d), DATOS);
    await p.reload({ waitUntil: 'networkidle0' });
    await p.click('[data-mes="anterior"]'); await p.click('[data-mes="anterior"]');
    await p.evaluate(s => { location.hash = '#/' + s; }, pantalla);
    await new Promise(r => setTimeout(r, 300));
    const cortes = await p.evaluate(() => [...document.querySelectorAll('.tarjeta-saldo__monto, .tarjeta-saldo__cifra')]
      .filter(n => n.scrollWidth > n.clientWidth + 1 || n.getBoundingClientRect().right > n.closest('.tarjeta-saldo').getBoundingClientRect().right)
      .map(n => n.textContent));
    if (cortes.length) { mal++; console.log(ancho, pantalla, 'RECORTADO:', cortes); }
    await p.close();
  }
  await b.close();
  console.log(mal ? 'HAY RECORTES' : 'Sin recortes en 360 y 390 px');
})();
