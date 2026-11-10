// Prueba visual del Inicio rediseñado: dominio (pruebas.html), capturas por dispositivo y tema,
// errores de consola, desbordes horizontales y contraste de texto calculado en el navegador.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:8766/';
const DATOS = require('./config').DATOS;
const SALIDA = path.join(__dirname, 'capturas');
fs.mkdirSync(SALIDA, { recursive: true });

const CASOS = [
  { nombre: 'escritorio-claro', ancho: 1440, alto: 900, tema: 'claro' },
  { nombre: 'escritorio-oscuro', ancho: 1440, alto: 900, tema: 'oscuro' },
  { nombre: 'tablet-claro', ancho: 900, alto: 1100, tema: 'claro', tactil: true },
  { nombre: 'movil-claro', ancho: 390, alto: 844, tema: 'claro', tactil: true, escala: 3 },
  { nombre: 'movil-oscuro', ancho: 390, alto: 844, tema: 'oscuro', tactil: true, escala: 3 }
];

(async () => {
  const navegador = await puppeteer.launch({
    executablePath: require('./config').CHROME,
    headless: 'new'
  });
  let fallos = 0;

  // 1. Pruebas de dominio
  const p = await navegador.newPage();
  await p.goto(BASE + 'pruebas.html', { waitUntil: 'networkidle0' });
  await p.waitForFunction(() => !/Ejecutando/.test(document.getElementById('totales').textContent));
  const total = await p.$eval('#totales', n => n.textContent.trim());
  console.log('DOMINIO:', total);
  if (!/todas pasan/.test(total)) fallos++;
  await p.close();

  // 2. Inicio en cada dispositivo y tema
  for (const c of CASOS) {
    const pag = await navegador.newPage();
    const errores = [];
    pag.on('pageerror', e => errores.push(e.message));
    pag.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
    await pag.setViewport({ width: c.ancho, height: c.alto, deviceScaleFactor: c.escala || 1, isMobile: !!c.tactil, hasTouch: !!c.tactil });

    await pag.goto(BASE, { waitUntil: 'networkidle0' });
    await pag.evaluate((datos, tema) => {
      const d = JSON.parse(datos);
      d.config.tema = tema;
      localStorage.setItem('fp.finanzas.v1', JSON.stringify(d));
    }, DATOS, c.tema);
    await pag.reload({ waitUntil: 'networkidle0' });
    // Noviembre → septiembre (mes con los datos del export)
    for (let i = 0; i < 2; i++) {
      await pag.click('[data-mes="anterior"]');
      await new Promise(r => setTimeout(r, 150));
    }
    await pag.evaluate(() => document.fonts.ready);

    const info = await pag.evaluate(() => {
      function rgb(s) { const m = s.match(/[\d.]+/g); return m ? m.slice(0, 4).map(Number) : null; }
      function lum(c) { return c.slice(0, 3).map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0); }
      function fondo(n) {
        for (let e = n; e; e = e.parentElement) {
          const cs = getComputedStyle(e);
          if (cs.backgroundImage && cs.backgroundImage !== 'none') return null; // degradado: se verifica aparte
          const b = rgb(cs.backgroundColor);
          if (b && (b.length < 4 || b[3] === 1)) return b;
        }
        return [255, 255, 255];
      }
      const malos = [];
      document.querySelectorAll('#contenido *, .sidebar *, .cabecera *').forEach(n => {
        if (!n.childNodes.length || ![...n.childNodes].some(t => t.nodeType === 3 && t.textContent.trim())) return;
        const r = n.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const cs = getComputedStyle(n);
        if (cs.visibility === 'hidden' || n.closest('[aria-hidden="true"]')) return;
        const f = fondo(n); if (!f) return;
        const t = rgb(cs.color); if (!t) return;
        const a = lum(t), b = lum(f);
        const cr = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
        if (cr < 4.5) malos.push(cr.toFixed(2) + ' ' + n.className + ' «' + n.textContent.trim().slice(0, 30) + '»');
      });
      return {
        fuente: getComputedStyle(document.body).fontFamily.split(',')[0],
        fuenteCargada: document.fonts.check('16px "Plus Jakarta Sans"'),
        desborde: document.documentElement.scrollWidth - window.innerWidth,
        mes: document.getElementById('mes-etiqueta').textContent,
        saldo: (document.querySelector('.tarjeta-saldo__cifra') || {}).textContent,
        mosaicos: document.querySelectorAll('.mosaico').length,
        contraste: malos
      };
    });

    // Botones de la tarjeta principal llevan a Movimientos filtrado
    const anchoCaptura = await pag.screenshot({ path: path.join(SALIDA, c.nombre + '.png'), fullPage: true });
    void anchoCaptura;

    console.log('\n[' + c.nombre + '] mes=' + info.mes + ' saldo=' + info.saldo + ' mosaicos=' + info.mosaicos +
      ' fuente=' + info.fuente + ' cargada=' + info.fuenteCargada + ' desborde=' + info.desborde + 'px');
    if (errores.length) { fallos++; console.log('  ERRORES:', errores); }
    if (info.desborde > 0) { fallos++; console.log('  DESBORDE horizontal'); }
    if (!info.fuenteCargada) { fallos++; console.log('  FUENTE no cargada'); }
    if (info.contraste.length) { fallos++; console.log('  CONTRASTE < 4.5:', info.contraste.slice(0, 12)); }
    await pag.close();
  }

  // 3. Navegación desde la tarjeta principal
  const pag = await navegador.newPage();
  await pag.setViewport({ width: 1440, height: 900 });
  await pag.goto(BASE, { waitUntil: 'networkidle0' });
  await pag.evaluate(datos => localStorage.setItem('fp.finanzas.v1', datos), DATOS);
  await pag.reload({ waitUntil: 'networkidle0' });
  await pag.click('[data-mes="anterior"]'); await pag.click('[data-mes="anterior"]');
  await pag.click('.tarjeta-saldo__item');
  await new Promise(r => setTimeout(r, 200));
  const nav = await pag.evaluate(() => ({
    titulo: document.getElementById('titulo-pantalla').textContent,
    tipo: (document.querySelector('[data-tipo][aria-pressed="true"]') || {}).textContent
  }));
  console.log('\nNAVEGACIÓN «Ingresos» →', nav);
  if (nav.titulo !== 'Movimientos' || !/Ingreso/.test(nav.tipo || '')) fallos++;

  await navegador.close();
  console.log('\n' + (fallos ? 'FALLOS: ' + fallos : 'TODO OK'));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
