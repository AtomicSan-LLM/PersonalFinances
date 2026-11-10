// Ronda móvil, paso 2: Inicio en el teléfono (saldo en fila, gráfica de 6 meses, meta compacta,
// carrusel de presupuesto, últimos movimientos, avisos al final).
// Uso: node probar-inicio-movil.js   (servidor en http://localhost:8766/)
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:8766/';
const DATOS = require('./config').DATOS;
const SALIDA = path.join(__dirname, 'capturas');
fs.mkdirSync(SALIDA, { recursive: true });

const espera = ms => new Promise(r => setTimeout(r, ms));
let fallos = 0;
function comprobar(ok, texto, detalle) {
  if (!ok) fallos++;
  console.log((ok ? '  ok    ' : '  FALLO ') + texto + (detalle !== undefined && !ok ? ' → ' + JSON.stringify(detalle) : ''));
}

async function abrir(navegador, ancho, alto, tema, movil) {
  const pag = await navegador.newPage();
  const errores = [];
  pag.on('pageerror', e => errores.push(e.message));
  pag.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
  await pag.setViewport({ width: ancho, height: alto, deviceScaleFactor: movil ? 2 : 1, isMobile: movil, hasTouch: movil });
  await pag.goto(BASE, { waitUntil: 'networkidle0' });
  await pag.evaluate((d, t) => { const x = JSON.parse(d); x.config.tema = t; localStorage.setItem('fp.finanzas.v1', JSON.stringify(x)); }, DATOS, tema);
  await pag.reload({ waitUntil: 'networkidle0' });
  await pag.evaluate(() => document.fonts.ready);
  await pag.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
  pag.errores = errores;
  return pag;
}

// Contraste de todo el texto visible del contenido (igual que probar-pantallas.js).
function contrasteMalo() {
  function rgb(s) { const m = s.match(/[\d.]+/g); return m ? m.slice(0, 4).map(Number) : null; }
  function lum(c) { return c.slice(0, 3).map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0); }
  function fondo(n) {
    for (let e = n; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      const b = rgb(cs.backgroundColor);
      if (b && (b.length < 4 || b[3] === 1)) return b;
    }
    return [255, 255, 255];
  }
  const malos = [];
  document.querySelectorAll('#contenido *').forEach(n => {
    if (n instanceof SVGElement) return;
    if (![...n.childNodes].some(t => t.nodeType === 3 && t.textContent.trim())) return;
    const r = n.getBoundingClientRect();
    if (!r.width || !r.height) return;
    if (getComputedStyle(n).visibility === 'hidden' || n.closest('[aria-hidden="true"]')) return;
    const f = fondo(n); if (!f) return;
    const t = rgb(getComputedStyle(n).color); if (!t) return;
    const a = lum(t), b = lum(f);
    const cr = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    if (cr < 4.5) malos.push(cr.toFixed(2) + ' ' + n.className + ' «' + n.textContent.trim().slice(0, 30) + '»');
  });
  return malos;
}

(async () => {
  const navegador = await puppeteer.launch({ executablePath: require('./config').CHROME, headless: 'new' });

  const MOVILES = [
    { nombre: 'iphone-se', ancho: 320, alto: 568 },
    { nombre: 'galaxy', ancho: 360, alto: 780 },
    { nombre: 'iphone-15-pro', ancho: 393, alto: 852 },
    { nombre: 'iphone-pro-max', ancho: 430, alto: 932 }
  ];

  for (const d of MOVILES) for (const tema of ['claro', 'oscuro']) {
    console.log('\n[' + d.nombre + ' ' + d.ancho + ' px · ' + tema + ']');
    const pag = await abrir(navegador, d.ancho, d.alto, tema, true);
    await pag.click('[data-mes="anterior"]'); await pag.click('[data-mes="anterior"]');   // septiembre
    await espera(200);

    const info = await pag.evaluate((ANCHO) => {
      const raiz = document.querySelector('.inicio-movil');
      if (!raiz) return null;
      const hijos = [...raiz.children];
      const orden = hijos.map(h => h.classList.contains('tarjeta-saldo') ? 'saldo' : (h.getAttribute('aria-label') || h.className));
      const items = [...document.querySelectorAll('.tarjeta-saldo__item')].map(i => i.getBoundingClientRect());
      const montos = [...document.querySelectorAll('.tarjeta-saldo__monto, .tarjeta-saldo__cifra')].map(m => ({ t: m.textContent, rec: m.scrollWidth > m.clientWidth + 1 }));
      const svg = document.querySelector('.inicio-movil .grafico svg');
      const sr = svg.getBoundingClientRect();
      const ejes = [...svg.querySelectorAll('.eje-texto')];
      const textoPx = Math.min.apply(null, ejes.map(t => parseFloat(getComputedStyle(t).fontSize) * sr.width / svg.viewBox.baseVal.width));
      const meta = document.querySelector('.meta--vacia');
      const car = document.querySelector('.mosaicos--carrusel');
      const mos = [...car.querySelectorAll('.mosaico')];
      return {
        orden,
        separaciones: hijos.slice(1).map((h, i) => Math.round(h.getBoundingClientRect().top - hijos[i].getBoundingClientRect().bottom)),
        itemsEnFila: items.length === 2 && Math.abs(items[0].top - items[1].top) < 1 && items[1].left > items[0].right,
        itemAlto: Math.round(items[0].height),
        montos,
        barras: svg.querySelectorAll('rect[style]').length,
        zonas: svg.querySelectorAll('.grafico__zona').length,
        activo: (svg.querySelector('.eje-texto--activo') || {}).textContent,
        textoPx: Math.round(textoPx * 10) / 10,
        zonaAncho: Math.round(svg.querySelector('.grafico__zona').getBoundingClientRect().width),
        leyenda: [...document.querySelectorAll('.inicio-movil .grafico__clave')].map(c => c.textContent),
        metaAlto: meta ? Math.round(meta.closest('.tarjeta').getBoundingClientRect().height) : null,
        metaBoton: meta ? meta.querySelector('.btn').innerText.trim() : null,
        metaBotonAlto: meta ? Math.round(meta.querySelector('.btn').getBoundingClientRect().height) : null,
        carrusel: { sw: car.scrollWidth, cw: car.clientWidth, izq: Math.round(car.getBoundingClientRect().left), der: Math.round(car.getBoundingClientRect().right), n: mos.length, mas: !!car.querySelector('.mosaico--mas') },
        mosRecortes: mos.map(m => [...m.querySelectorAll('.mosaico__pct')].some(p => p.scrollWidth > p.clientWidth + 1)).filter(Boolean).length,
        recientes: document.querySelectorAll('[aria-label="Movimientos recientes"] .movimiento').length,
        desborde: document.documentElement.scrollWidth - ANCHO
      };
    }, d.ancho);

    comprobar(!!info, 'Inicio usa el diseño de teléfono');
    if (!info) { await pag.close(); continue; }
    const esperado = ['saldo', 'Ingresos y gastos por mes', 'Meta de ahorro de Septiembre 2026', 'Presupuesto del mes', 'Movimientos recientes'];
    comprobar(esperado.every((e, i) => info.orden[i] === e), 'orden: saldo → gráfica → meta → presupuesto → movimientos', info.orden);
    comprobar(info.orden.indexOf('Avisos del mes') > info.orden.indexOf('Movimientos recientes'), 'los avisos van después de los movimientos', info.orden);
    comprobar(info.separaciones.every(s => s === 24), 'separación uniforme de 24 px entre secciones', info.separaciones);
    comprobar(d.ancho < 360 ? !info.itemsEnFila : info.itemsEnFila, d.ancho < 360 ? 'Ingresos y Gastos apilados (pantalla < 360 px)' : 'Ingresos y Gastos lado a lado');
    comprobar(info.itemAlto >= 44, 'botones de Ingresos/Gastos ≥ 44 px de alto', info.itemAlto);
    comprobar(info.montos.every(m => !m.rec), 'ninguna cifra del saldo recortada', info.montos);
    // El export empieza en septiembre: la ventana (hasta noviembre, hoy) tiene 3 meses, no 6.
    comprobar(info.zonas === 3 && info.barras === info.zonas * 2, 'gráfica: 3 meses con datos × 2 barras, cada mes tocable', [info.barras, info.zonas]);
    comprobar(info.activo === 'Sep', 'el mes consultado (Sep) está resaltado', info.activo);
    comprobar(info.textoPx >= 10.5, 'texto de los ejes a tamaño real (≥ 10,5 px)', info.textoPx);
    comprobar(info.zonaAncho >= 44 || d.ancho < 360, 'zona tocable de cada mes ≥ 44 px (salvo < 360 px)', info.zonaAncho);
    comprobar(info.leyenda.join() === 'Ingresos,Gastos', 'leyenda Ingresos / Gastos', info.leyenda);
    comprobar(info.metaAlto !== null && info.metaAlto <= 110, 'meta sin definir en una fila baja (≤ 110 px; antes ~235)', info.metaAlto);
    comprobar(info.metaBoton === 'Definir' && info.metaBotonAlto >= 44, 'botón «Definir» táctil', [info.metaBoton, info.metaBotonAlto]);
    comprobar(info.carrusel.sw > info.carrusel.cw && info.carrusel.izq === 0 && info.carrusel.der === d.ancho, 'carrusel de presupuesto de borde a borde y deslizable', info.carrusel);
    comprobar(info.mosRecortes === 0, 'ninguna cifra de mosaico recortada', info.mosRecortes);
    comprobar(info.recientes === 5, '5 últimos movimientos', info.recientes);
    comprobar(info.desborde <= 0, 'sin desborde horizontal de la página', info.desborde);

    const malos = await pag.evaluate(contrasteMalo);
    comprobar(!malos.length, 'contraste de texto ≥ 4.5', malos.slice(0, 8));

    await pag.screenshot({ path: path.join(SALIDA, 'inicio-movil-' + d.nombre + '-' + tema + '.png'), fullPage: true });

    // Tocar otro mes de la gráfica lo abre y lo resalta
    const zonas = await pag.$$('.inicio-movil .grafico__zona');
    await zonas[2].click();
    await espera(250);
    const trasToque = await pag.evaluate(() => ({
      mes: document.getElementById('mes-etiqueta').textContent,
      activo: (document.querySelector('.inicio-movil .eje-texto--activo') || {}).textContent
    }));
    comprobar(/Noviembre/.test(trasToque.mes) && trasToque.activo === 'Nov', 'tocar «Nov» en la gráfica abre noviembre y lo resalta', trasToque);
    const zonas2 = await pag.$$('.inicio-movil .grafico__zona');
    await zonas2[0].click();   // de vuelta a septiembre
    await espera(250);

    // «⋮» de un mosaico abre una hoja inferior, no un menú recortado
    await pag.evaluate(() => document.querySelector('.mosaicos--carrusel .btn-icono').click());
    await espera(300);
    const hoja = await pag.evaluate(() => {
      const dlg = document.querySelector('dialog[open]');
      if (!dlg) return null;
      const bs = [...dlg.querySelectorAll('.lista-acciones__item')];
      return { titulo: dlg.querySelector('.dialogo__titulo').textContent, acciones: bs.map(b => b.textContent.replace(/^\W+/, '')), altos: bs.map(b => Math.round(b.getBoundingClientRect().height)), menuViejo: !!document.querySelector('.menu') };
    });
    comprobar(hoja && hoja.acciones.length === 2 && hoja.altos.every(h => h >= 44) && !hoja.menuViejo, '«⋮» abre hoja inferior con 2 acciones táctiles', hoja);
    await pag.click('dialog[open] .lista-acciones__item');
    await espera(300);
    const tope = await pag.evaluate(() => { const ds = document.querySelectorAll('dialog[open]'); return { n: ds.length, titulo: ds.length ? ds[ds.length - 1].querySelector('.dialogo__titulo').textContent : null }; });
    comprobar(tope.n === 1 && /tope/i.test(tope.titulo || ''), 'la primera acción abre el formulario de tope', tope);
    await pag.keyboard.press('Escape');
    await espera(200);

    // «Definir» abre el formulario de meta; con meta definida aparece la tarjeta completa
    await pag.evaluate(() => document.querySelector('.meta--vacia .btn').click());
    await espera(300);
    const dlgMeta = await pag.evaluate(() => { const x = document.querySelector('dialog[open]'); return x ? x.querySelector('.dialogo__titulo').textContent : null; });
    comprobar(/meta/i.test(dlgMeta || ''), '«Definir» abre el formulario de meta de ahorro', dlgMeta);
    await pag.keyboard.press('Escape');
    await espera(200);
    await pag.evaluate(() => { FP.store.definirMetaAhorro('2026-09', 1000000); });
    await espera(250);
    const conMeta = await pag.evaluate((ANCHO) => ({
      vacia: !!document.querySelector('.meta--vacia'),
      pct: (document.querySelector('.meta__pct') || {}).textContent,
      barra: !!document.querySelector('.inicio-movil .meta .barra'),
      desborde: document.documentElement.scrollWidth - ANCHO
    }), d.ancho);
    comprobar(!conMeta.vacia && !!conMeta.pct && conMeta.barra && conMeta.desborde <= 0, 'con meta definida: tarjeta completa con porcentaje y barra', conMeta);
    if (d.ancho === 393) await pag.screenshot({ path: path.join(SALIDA, 'inicio-movil-con-meta-' + tema + '.png'), fullPage: true });

    // Cifras de 8 dígitos: no se recortan en la tarjeta de saldo
    await pag.evaluate(() => {
      const cats = FP.store.state.categorias;
      const ing = cats.find(c => c.tipo === 'ingreso'), gas = cats.find(c => c.tipo === 'gasto');
      FP.store.crearMovimiento({ fecha: '2026-09-10', monto: 98765432, tipo: 'ingreso', categoriaId: ing.id, descripcion: 'Prueba' });
      FP.store.crearMovimiento({ fecha: '2026-09-11', monto: 87654321, tipo: 'gasto', categoriaId: gas.id, descripcion: 'Prueba' });
    });
    await espera(250);
    const grandes = await pag.evaluate((ANCHO) => ({
      montos: [...document.querySelectorAll('.tarjeta-saldo__monto, .tarjeta-saldo__cifra')].map(m => ({ t: m.textContent, rec: m.scrollWidth > m.clientWidth + 1 })),
      desborde: document.documentElement.scrollWidth - ANCHO
    }), d.ancho);
    comprobar(grandes.montos.every(m => !m.rec) && grandes.desborde <= 0, 'cifras de 8 dígitos sin recortar ni desbordar', grandes);

    // «Ver todos» lleva a Movimientos
    await pag.evaluate(() => [...document.querySelectorAll('[aria-label="Movimientos recientes"] .btn')].find(b => /Ver todos/.test(b.textContent)).click());
    await espera(250);
    const t = await pag.$eval('#titulo-pantalla', n => n.textContent);
    comprobar(t === 'Movimientos', '«Ver todos» lleva a Movimientos', t);

    comprobar(!pag.errores.length, 'sin errores de consola', pag.errores);
    await pag.close();
  }

  // ---- Tablet y escritorio: Inicio no cambia ----------------------------------------------
  for (const d of [{ nombre: 'tablet', ancho: 900, alto: 1100 }, { nombre: 'escritorio', ancho: 1440, alto: 900 }]) {
    console.log('\n[' + d.nombre + ' ' + d.ancho + ' px]');
    const pag = await abrir(navegador, d.ancho, d.alto, 'claro', false);
    await pag.click('[data-mes="anterior"]'); await pag.click('[data-mes="anterior"]');
    await espera(200);
    const e = await pag.evaluate(() => ({
      movil: !!document.querySelector('.inicio-movil'),
      graficos: document.querySelectorAll('#contenido .grafico svg').length,
      boton: document.querySelector('.meta--vacia .btn').innerText.trim(),
      textoLargo: /Tu ahorro real actual es/.test(document.querySelector('.meta--vacia').innerText),
      carrusel: !!document.querySelector('.mosaicos--carrusel'),
      recientes: document.querySelectorAll('[aria-label="Movimientos recientes"] .movimiento').length
    }));
    comprobar(!e.movil && e.graficos === 0 && !e.carrusel, 'sin diseño de teléfono, sin gráfica y sin carrusel', e);
    comprobar(e.boton === 'Definir meta' && e.textoLargo && e.recientes === 6, 'meta con texto completo y 6 movimientos recientes, como antes', e);
    await pag.evaluate(() => document.querySelector('.mosaicos .btn-icono').click());
    await espera(200);
    const menu = await pag.evaluate(() => ({ menu: !!document.querySelector('.menu'), hoja: !!document.querySelector('dialog[open]') }));
    comprobar(menu.menu && !menu.hoja, '«⋮» sigue siendo un menú desplegable', menu);
    comprobar(!pag.errores.length, 'sin errores de consola', pag.errores);
    await pag.close();
  }

  await navegador.close();
  console.log('\n' + (fallos ? 'FALLOS: ' + fallos : 'TODO OK'));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
