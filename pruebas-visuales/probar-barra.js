// Ronda móvil 1: barra de pestañas (Inicio · Movimientos · ＋ · Presupuesto · Más) y cabecera compacta.
// Uso: node probar-barra.js   (servidor en http://localhost:8766/)
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:8766/';
const DATOS = require('./config').DATOS;
const DATOS_AVISOS = require('./config').datosConAvisos();
const SALIDA = path.join(__dirname, 'capturas');
fs.mkdirSync(SALIDA, { recursive: true });

const espera = ms => new Promise(r => setTimeout(r, ms));
let fallos = 0;
function comprobar(ok, texto, detalle) {
  if (!ok) fallos++;
  console.log((ok ? '  ok    ' : '  FALLO ') + texto + (detalle !== undefined && !ok ? ' → ' + JSON.stringify(detalle) : ''));
}

async function abrir(navegador, ancho, alto, tema, datos, movil) {
  const pag = await navegador.newPage();
  const errores = [];
  pag.on('pageerror', e => errores.push(e.message));
  pag.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
  await pag.setViewport({ width: ancho, height: alto, deviceScaleFactor: movil ? 2 : 1, isMobile: movil, hasTouch: movil });
  await pag.goto(BASE, { waitUntil: 'networkidle0' });
  await pag.evaluate((d, t) => { const x = JSON.parse(d); x.config.tema = t; localStorage.setItem('fp.finanzas.v1', JSON.stringify(x)); }, datos, tema);
  await pag.reload({ waitUntil: 'networkidle0' });
  await pag.evaluate(() => document.fonts.ready);
  pag.errores = errores;
  return pag;
}

(async () => {
  const navegador = await puppeteer.launch({ executablePath: require('./config').CHROME, headless: 'new' });

  // ---- 1. Móvil: varios anchos y los dos temas -------------------------------------------
  const MOVILES = [
    { nombre: 'iphone-se', ancho: 320, alto: 568 },
    { nombre: 'galaxy', ancho: 360, alto: 780 },
    { nombre: 'iphone-15-pro', ancho: 393, alto: 852 },
    { nombre: 'iphone-pro-max', ancho: 430, alto: 932 },
    { nombre: 'movil-ancho', ancho: 720, alto: 900 }
  ];
  for (const d of MOVILES) for (const tema of ['claro', 'oscuro']) {
    console.log('\n[' + d.nombre + ' ' + d.ancho + ' px · ' + tema + ']');
    const pag = await abrir(navegador, d.ancho, d.alto, tema, DATOS, true);

    // Mes actual: sin chip «Mes actual»
    const hoyOculto = await pag.$eval('#btn-hoy', n => n.hidden);
    comprobar(hoyOculto, 'en el mes actual no aparece «Mes actual»');

    await pag.click('[data-mes="anterior"]'); await pag.click('[data-mes="anterior"]');
    await espera(150);

    const barra = await pag.evaluate((ANCHO) => {
      function rgb(s) { const m = s.match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : null; }
      function lum(c) { return c.map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0); }
      function cr(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
      const nav = document.querySelector('.nav-inferior');
      const fondo = rgb(getComputedStyle(nav).backgroundColor);
      const items = [...nav.querySelectorAll('.nav-enlace, .nav-registrar')];
      const cajas = items.map(n => { const r = n.getBoundingClientRect(); return { n: n.getAttribute('aria-label') || n.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height), izq: r.left, der: r.right }; });
      const textos = [...nav.querySelectorAll('.nav-enlace__texto')].map(t => ({
        t: t.textContent, recortado: t.scrollWidth > t.clientWidth + 1, px: parseFloat(getComputedStyle(t).fontSize),
        cr: cr(rgb(getComputedStyle(t).color), fondo)
      }));
      const chip = document.getElementById('btn-hoy');
      const aviso = document.getElementById('aviso-mes');
      const titulo = document.getElementById('titulo-pantalla');
      const cab = document.querySelector('.cabecera').getBoundingClientRect();
      const cont = document.getElementById('contenido').getBoundingClientRect();
      const tr = titulo.getBoundingClientRect(), cr2 = chip.getBoundingClientRect();
      const filtros = document.getElementById('btn-filtros').getBoundingClientRect();
      const campana = document.getElementById('campana').getBoundingClientRect();
      return {
        visible: getComputedStyle(nav).display !== 'none',
        cajas, textos,
        activos: [...nav.querySelectorAll('[aria-current]')].map(n => n.dataset.ruta || n.id),
        desborde: document.documentElement.scrollWidth - ANCHO,
        mesRecortado: (function () { const b = document.getElementById('btn-mes'); return b.scrollWidth > b.clientWidth + 1; })(),
        chipVisible: !chip.hidden && cr2.width > 0,
        chipTactil: Math.round(cr2.height) + 8,
        avisoVisible: getComputedStyle(aviso).display !== 'none',
        tituloRecortado: titulo.scrollWidth > titulo.clientWidth + 1,
        tituloChocaChip: tr.right > cr2.left + 1,
        altoCabecera: Math.round(cont.top - cab.top),
        filtros: { w: Math.round(filtros.width), h: Math.round(filtros.height) },
        campana: { w: Math.round(campana.width), h: Math.round(campana.height) },
        subVisible: getComputedStyle(document.getElementById('subtitulo-pantalla')).display !== 'none'
      };
    }, d.ancho);

    comprobar(barra.visible && barra.cajas.length === 5, 'barra visible con 5 elementos', barra.cajas.map(c => c.n));
    comprobar(barra.cajas.every(c => c.w >= 44 && c.h >= 44), 'zonas táctiles ≥ 44 × 44 px', barra.cajas);
    comprobar(barra.cajas.every((c, i) => i === 0 || c.izq >= barra.cajas[i - 1].der - 1), 'las pestañas no se solapan');
    comprobar(barra.textos.every(t => !t.recortado), 'ninguna etiqueta recortada', barra.textos);
    comprobar(barra.textos.every(t => t.cr >= 4.5), 'contraste de etiquetas ≥ 4.5', barra.textos.map(t => t.t + ' ' + t.cr.toFixed(2)));
    comprobar(barra.activos.join() === 'inicio', 'solo «Inicio» está activa', barra.activos);
    comprobar(barra.desborde <= 0, 'sin desborde horizontal', barra.desborde);
    comprobar(!barra.mesRecortado, 'el nombre del mes cabe entre las flechas');
    comprobar(barra.chipVisible && !barra.avisoVisible, 'otro mes: chip «Mes actual» visible y franja oculta');
    comprobar(barra.chipTactil >= 44, 'chip «Mes actual» con zona táctil ≥ 44 px', barra.chipTactil);
    comprobar(!barra.tituloRecortado && !barra.tituloChocaChip, 'el título cabe junto al chip');
    comprobar(barra.filtros.w >= 44 && barra.filtros.h >= 44 && barra.campana.w >= 44 && barra.campana.h >= 44, 'filtros y campana ≥ 44 px', [barra.filtros, barra.campana]);
    comprobar(barra.altoCabecera <= 124, 'cabecera ≤ 124 px (antes ~195)', barra.altoCabecera);
    comprobar(!barra.subVisible, 'subtítulo oculto en móvil');
    await pag.screenshot({ path: path.join(SALIDA, 'barra-' + d.nombre + '-' + tema + '.png') });

    // Títulos de todas las pantallas caben
    const titulos = [];
    for (const r of ['movimientos', 'presupuesto', 'historico', 'alertas', 'recurrentes', 'categorias', 'comparar', 'configuracion']) {
      await pag.evaluate(x => { location.hash = '#/' + x; }, r);
      await espera(120);
      const t = await pag.evaluate((A) => {
        const n = document.getElementById('titulo-pantalla');
        return { rec: n.scrollWidth > n.clientWidth + 1, des: document.documentElement.scrollWidth - A };
      }, d.ancho);
      if (t.rec || t.des > 0) titulos.push(r + JSON.stringify(t));
    }
    comprobar(!titulos.length, 'títulos completos y sin desborde en las 9 pantallas', titulos);

    // El final del contenido queda por encima de la barra
    await pag.evaluate(() => { location.hash = '#/movimientos'; });
    await espera(200);
    const tapado = await pag.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      const ult = document.getElementById('contenido').lastElementChild.getBoundingClientRect();
      const reg = document.querySelector('.nav-registrar').getBoundingClientRect();
      return { finContenido: Math.round(ult.bottom), topeBoton: Math.round(reg.top) };
    });
    comprobar(tapado.finContenido <= tapado.topeBoton, 'la barra y el «＋» no tapan el final del contenido', tapado);
    await pag.evaluate(() => window.scrollTo(0, 0));

    // «＋» abre el formulario de movimiento
    await pag.click('.nav-registrar');
    await espera(250);
    const dlg = await pag.evaluate(() => { const d = document.querySelector('dialog[open]'); return d ? d.querySelector('.dialogo__titulo').textContent : null; });
    comprobar(!!dlg && /movimiento/i.test(dlg), '«＋» abre el formulario de movimiento', dlg);
    await pag.keyboard.press('Escape');
    await espera(150);

    // «Más» abre la hoja y navega
    await pag.click('#btn-mas');
    await espera(300);
    const mas = await pag.evaluate(() => {
      const d = document.querySelector('dialog[open]');
      if (!d) return null;
      const items = [...d.querySelectorAll('.lista-mas__item')];
      return { titulo: d.querySelector('.dialogo__titulo').textContent, items: items.map(i => i.querySelector('.lista-mas__texto').textContent), altos: items.map(i => Math.round(i.getBoundingClientRect().height)) };
    });
    comprobar(mas && mas.items.length === 6 && mas.altos.every(h => h >= 44), 'hoja «Más» con 6 destinos táctiles', mas);
    if (d.ancho === 393) await pag.screenshot({ path: path.join(SALIDA, 'barra-mas-' + tema + '.png') });
    await pag.click('.lista-mas__item[href="#/historico"]');
    await espera(300);
    const tras = await pag.evaluate(() => ({
      titulo: document.getElementById('titulo-pantalla').textContent,
      dialogo: !!document.querySelector('dialog[open]'),
      activos: [...document.querySelectorAll('.nav-inferior [aria-current]')].map(n => n.dataset.ruta || n.id)
    }));
    comprobar(tras.titulo === 'Histórico' && !tras.dialogo && tras.activos.join() === 'btn-mas', '«Más → Histórico» navega, cierra la hoja y marca «Más»', tras);

    // Pestañas y campana
    await pag.click('.nav-inferior [data-ruta="presupuesto"]');
    await espera(200);
    const t1 = await pag.$eval('#titulo-pantalla', n => n.textContent);
    await pag.click('#campana');
    await espera(200);
    const t2 = await pag.$eval('#titulo-pantalla', n => n.textContent);
    comprobar(t1 === 'Presupuesto' && t2 === 'Alertas', 'pestaña «Presupuesto» y campana navegan', [t1, t2]);

    // «Mes actual» vuelve al mes de hoy
    await pag.click('.nav-inferior [data-ruta="inicio"]');
    await espera(150);
    await pag.click('#btn-hoy');
    await espera(200);
    const fin = await pag.evaluate(() => ({ oculto: document.getElementById('btn-hoy').hidden, otro: document.getElementById('selector-mes').classList.contains('selector-mes--otro') }));
    comprobar(fin.oculto && !fin.otro, '«Mes actual» vuelve al mes de hoy y desaparece', fin);

    comprobar(!pag.errores.length, 'sin errores de consola', pag.errores);
    await pag.close();
  }

  // ---- 2. Globo de avisos en «Más» y en la campana ----------------------------------------
  console.log('\n[avisos]');
  {
    const pag = await abrir(navegador, 393, 852, 'claro', DATOS_AVISOS, true);
    const g = await pag.evaluate(() => ({
      mas: (function () { const n = document.querySelector('#btn-mas .nav-enlace__globo'); return n.hidden ? null : n.textContent; })(),
      campana: (function () { const n = document.getElementById('campana-globo'); return n.hidden ? null : n.textContent; })(),
      total: FP.dominio.contarAlertasTodas()
    }));
    comprobar(g.total > 0 && g.mas === g.campana && g.mas !== null, 'con avisos: globo en «Más» y en la campana', g);
    await pag.screenshot({ path: path.join(SALIDA, 'barra-avisos.png') });
    await pag.close();
  }

  // ---- 3. Tablet y escritorio: nada cambia ----------------------------------------------
  for (const d of [{ nombre: 'tablet', ancho: 900, alto: 1100 }, { nombre: 'escritorio', ancho: 1440, alto: 900 }]) {
    console.log('\n[' + d.nombre + ' ' + d.ancho + ' px]');
    const pag = await abrir(navegador, d.ancho, d.alto, 'claro', DATOS, false);
    await pag.click('[data-mes="anterior"]');
    await espera(150);
    const e = await pag.evaluate(() => ({
      barra: getComputedStyle(document.querySelector('.nav-inferior')).display,
      movil: getComputedStyle(document.querySelector('.cabecera__movil')).display,
      aviso: getComputedStyle(document.getElementById('aviso-mes')).display,
      sidebar: getComputedStyle(document.getElementById('sidebar')).display,
      registrar: getComputedStyle(document.querySelector('.btn--registrar')).display,
      sub: getComputedStyle(document.getElementById('subtitulo-pantalla')).display
    }));
    comprobar(e.barra === 'none' && e.movil === 'none', 'sin barra de pestañas ni acciones móviles', e);
    comprobar(e.aviso !== 'none' && e.sidebar !== 'none' && e.registrar !== 'none' && e.sub !== 'none', 'franja de aviso, menú lateral, «Registrar» y subtítulo siguen visibles', e);
    comprobar(!pag.errores.length, 'sin errores de consola', pag.errores);
    await pag.close();
  }

  await navegador.close();
  console.log('\n' + (fallos ? 'FALLOS: ' + fallos : 'TODO OK'));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
