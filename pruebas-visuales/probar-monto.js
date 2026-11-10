// Campo «Monto»: al escribir se ponen los separadores de miles y solo se aceptan números.
// Uso: node probar-monto.js   (servidor en http://localhost:8766/)
const puppeteer = require('puppeteer-core');
const { BASE, CHROME, DATOS } = require('./config');

const espera = ms => new Promise(r => setTimeout(r, ms));
let fallos = 0;
function comprobar(ok, texto, detalle) {
  if (!ok) fallos++;
  console.log((ok ? '  ok    ' : '  FALLO ') + texto + (detalle !== undefined && !ok ? ' → ' + JSON.stringify(detalle) : ''));
}

const CAMPO = 'dialog[open] input[name="monto"]';
const estado = pag => pag.$eval(CAMPO, i => ({ v: i.value, c: i.selectionStart }));

(async () => {
  const navegador = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });

  for (const c of [{ nombre: 'escritorio', ancho: 1280, alto: 800, movil: false }, { nombre: 'iphone-15-pro', ancho: 393, alto: 852, movil: true }]) {
    console.log('\n[' + c.nombre + ' ' + c.ancho + ' px]');
    const pag = await navegador.newPage();
    const errores = [];
    pag.on('pageerror', e => errores.push(e.message));
    await pag.setViewport({ width: c.ancho, height: c.alto, deviceScaleFactor: 1, isMobile: c.movil, hasTouch: c.movil });
    await pag.goto(BASE, { waitUntil: 'networkidle0' });
    await pag.evaluate(d => localStorage.setItem('fp.finanzas.v1', d), DATOS);
    await pag.reload({ waitUntil: 'networkidle0' });

    await pag.evaluate(() => [...document.querySelectorAll('[data-accion="nuevo-movimiento"]')].find(b => b.offsetParent).click());
    await pag.waitForSelector(CAMPO); await espera(150);
    await pag.focus(CAMPO);

    // Dígito a dígito
    const pasos = [];
    for (const d of '1250000') { await pag.keyboard.type(d); pasos.push((await estado(pag)).v); }
    comprobar(pasos.join(' ') === '1 12 125 1.250 12.500 125.000 1.250.000', 'los puntos aparecen mientras se escribe 1250000', pasos);
    let e = await estado(pag);
    comprobar(e.c === e.v.length, 'el cursor queda al final', e);

    // Nada que no sea número
    await pag.keyboard.type('abc-+*/$%&#.,; eE');
    e = await estado(pag);
    comprobar(e.v === '1.250.000', 'letras, signos y símbolos no se escriben', e);
    const modo = await pag.$eval(CAMPO, i => i.getAttribute('inputmode'));
    comprobar(modo === 'numeric', 'teclado numérico en el teléfono (inputmode="numeric")', modo);

    // Editar en medio: el cursor no salta al final
    for (let i = 0; i < 4; i++) await pag.keyboard.press('ArrowLeft');   // 1.250|.000
    await pag.keyboard.type('9');
    e = await estado(pag);
    comprobar(e.v === '12.509.000' && e.v.slice(0, e.c) === '12.509', 'insertar un dígito en medio reagrupa y conserva el cursor', e);
    await pag.keyboard.press('Backspace');
    e = await estado(pag);
    comprobar(e.v === '1.250.000' && e.v.slice(0, e.c) === '1.250', 'borrar en medio reagrupa y conserva el cursor', e);

    // Pegar texto sucio
    await pag.$eval(CAMPO, i => { i.value = ''; i.focus(); });
    await pag.evaluate(sel => {
      const i = document.querySelector(sel);
      i.setRangeText('COP $ 3.456.789 aprox', 0, i.value.length, 'end');
      i.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));
    }, CAMPO);
    e = await estado(pag);
    comprobar(e.v === '3.456.789', 'pegar «COP $ 3.456.789 aprox» deja solo el número', e);

    // Borrar todo y ceros a la izquierda
    await pag.$eval(CAMPO, i => { i.select(); });
    await pag.keyboard.press('Backspace');
    await pag.keyboard.type('0075');
    e = await estado(pag);
    comprobar(e.v === '75', 'ceros a la izquierda se descartan', e);

    // Guardar: el valor que llega al almacén es el número
    await pag.$eval(CAMPO, i => { i.select(); });
    await pag.keyboard.type('4321987');
    const antes = await pag.evaluate(() => FP.store.state.movimientos.length);
    await pag.evaluate(() => {
      const d = document.querySelector('dialog[open]');
      const sel = d.querySelector('select[name="categoriaId"]');
      if (sel && !sel.value) { sel.value = [...sel.options].find(o => o.value).value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await pag.evaluate(() => [...document.querySelectorAll('dialog[open] .dialogo__pie .btn')].find(b => /guardar|registrar/i.test(b.textContent)).click());
    await espera(400);
    const guardado = await pag.evaluate(n => { const ms = FP.store.state.movimientos; return { n: ms.length - n, monto: ms.length ? ms.slice().sort((a, b) => String(b.creadoEn).localeCompare(String(a.creadoEn)))[0].monto : null, abierto: !!document.querySelector('dialog[open]'), error: (document.querySelector('dialog[open] .campo__error') || {}).textContent }; }, antes);
    comprobar(guardado.n === 1 && guardado.monto === 4321987, 'se guarda 4.321.987 como el número 4321987', guardado);

    comprobar(errores.length === 0, 'sin errores de consola', errores);
    await pag.close();
  }

  await navegador.close();
  console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nTODO OK');
  process.exit(fallos ? 1 : 0);
})();
