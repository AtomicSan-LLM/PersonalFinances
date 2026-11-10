// Ronda móvil, paso 3: Movimientos en el teléfono (resumen, chips de filtro, búsqueda con lupa,
// lista agrupada por día con subtotal, fila-botón y hoja de detalle).
// Uso: node probar-movimientos-movil.js   (servidor en http://localhost:8766/)
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
  await pag.goto(BASE + '#/movimientos', { waitUntil: 'networkidle0' });
  await pag.reload({ waitUntil: 'networkidle0' });
  await pag.evaluate(() => document.fonts.ready);
  await pag.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
  pag.errores = errores;
  return pag;
}

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
  document.querySelectorAll('#contenido *, dialog[open] *').forEach(n => {
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

const filas = pag => pag.evaluate(() => [...document.querySelectorAll('.dias .movimiento')].map(f => ({
  tipo: f.querySelector('.movimiento__monto').className.includes('ingreso') ? 'ingreso' : 'gasto',
  titulo: f.querySelector('.movimiento__titulo').textContent,
  sub: f.querySelector('.movimiento__sub').textContent
})));

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
      const periodo = '2026-09';
      const movs = FP.dominio.filtrarMovimientos(periodo, {});
      const grupos = FP.dominio.agruparPorDia(movs);
      const dias = [...document.querySelectorAll('.dias .dia')];
      const chips = [...document.querySelectorAll('.chips .chip')];
      const fs = [...document.querySelectorAll('.dias .movimiento')];
      return {
        tarjetaFiltros: !!document.querySelector('.tarjeta.filtros'),
        resumen: !!document.querySelector('.tarjeta-saldo'),
        chips: chips.map(c => (c.getAttribute('aria-label') || c.textContent).trim()),
        chipsAlto: chips.map(c => Math.round(c.getBoundingClientRect().height)),
        chipsZona: chips.map(c => Math.round(parseFloat(getComputedStyle(c, '::after').height))),
        chipsUnaFila: new Set(chips.map(c => Math.round(c.getBoundingClientRect().top))).size === 1,
        nDias: dias.length, nGrupos: grupos.length,
        nFilas: fs.length, nMovs: movs.length,
        titulos: dias.map(x => x.querySelector('.dia__titulo').textContent),
        subtotales: dias.map(x => (x.querySelector('.dia__subtotal') || {}).textContent || ''),
        esperados: grupos.map(g => g.gastos ? FP.dinero.formatoConSigno(g.gastos, 'gasto') : (g.ingresos ? FP.dinero.formatoConSigno(g.ingresos, 'ingreso') : '')),
        sumaDias: grupos.reduce((a, g) => a + g.gastos, 0), gastosMes: FP.dominio.resumen(periodo).gastos,
        conMenu: document.querySelectorAll('.dias .btn-icono').length,
        botones: fs.every(f => f.tagName === 'BUTTON'),
        altoMin: Math.min.apply(null, fs.map(f => Math.round(f.getBoundingClientRect().height))),
        subDosLineas: fs.filter(f => f.querySelector('.movimiento__sub').getBoundingClientRect().height > 22).length,
        conFecha: fs.filter(f => /\d{1,2} (ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)/.test(f.querySelector('.movimiento__sub').textContent)).length,
        montosRecortados: fs.filter(f => { const m = f.querySelector('.movimiento__monto'); return m.scrollWidth > m.clientWidth + 1 || m.getBoundingClientRect().right > ANCHO; }).length,
        solapes: fs.filter(f => f.querySelector('.movimiento__cuerpo').getBoundingClientRect().right > f.querySelector('.movimiento__monto').getBoundingClientRect().left + 1).length,
        desborde: document.documentElement.scrollWidth - ANCHO
      };
    }, d.ancho);

    comprobar(!info.tarjetaFiltros && info.resumen, 'sin tarjeta de filtros; el resumen sigue arriba', info);
    comprobar(info.chips.length === 5 && /Buscar/.test(info.chips[0]) && /Todos/.test(info.chips[1]) && /Ingresos/.test(info.chips[2]) && /Gastos/.test(info.chips[3]) && /categor/i.test(info.chips[4]), 'chips: lupa · Todos · Ingresos · Gastos · Categoría', info.chips);
    comprobar(info.chipsUnaFila && info.chipsZona.every(z => z >= 44), 'chips en una fila con zona táctil ≥ 44 px', [info.chipsAlto, info.chipsZona]);
    comprobar(info.nDias === info.nGrupos && info.nDias > 1 && info.nFilas === info.nMovs, 'un bloque por día con todos los movimientos (' + info.nDias + ' días, ' + info.nFilas + ' movimientos)', info);
    comprobar(JSON.stringify(info.subtotales) === JSON.stringify(info.esperados), 'subtotal de cada día = gasto del día (o ingreso si no hubo gasto)', [info.subtotales, info.esperados]);
    comprobar(info.sumaDias === info.gastosMes, 'los días suman el gasto del mes', [info.sumaDias, info.gastosMes]);
    comprobar(info.botones && info.conMenu === 0 && info.altoMin >= 44, 'filas: botón completo, sin «⋮», alto ≥ 44 px', info);
    comprobar(info.subDosLineas === 0 && info.conFecha === 0, 'línea secundaria en una sola línea y sin repetir la fecha', info);
    comprobar(info.montosRecortados === 0 && info.solapes === 0, 'montos completos, sin pisarse con el título', info);
    comprobar(info.desborde <= 0, 'sin desborde horizontal', info.desborde);

    const malos = await pag.evaluate(contrasteMalo);
    comprobar(malos.length === 0, 'contraste AA', malos.slice(0, 5));
    await pag.screenshot({ path: path.join(SALIDA, 'movimientos-movil-' + d.nombre + '-' + tema + '.png'), fullPage: false });

    // Chip «Gastos»
    await pag.click('.chip[data-chip="gasto"]'); await espera(120);
    let fs1 = await filas(pag);
    let est = await pag.evaluate(() => ({
      chip: document.querySelector('.chip[data-chip="gasto"]').getAttribute('aria-pressed'),
      tarjeta: [...document.querySelectorAll('.tarjeta-saldo__item')].map(i => i.getAttribute('aria-pressed')),
      limpiar: !!document.querySelector('.chip--limpiar'),
      foco: document.activeElement && document.activeElement.dataset.chip
    }));
    comprobar(fs1.length > 0 && fs1.every(f => f.tipo === 'gasto') && est.chip === 'true' && est.limpiar, 'chip «Gastos»: solo gastos, chip marcado y aparece «Limpiar»', est);
    comprobar(est.tarjeta[1] === 'true' && est.foco === 'gasto', 'la tarjeta resumen refleja el filtro y el foco no se pierde', est);

    // Tarjeta resumen «Ingresos» filtra igual
    await pag.evaluate(() => document.querySelector('.tarjeta-saldo__item').click()); await espera(120);
    fs1 = await filas(pag);
    comprobar(fs1.length > 0 && fs1.every(f => f.tipo === 'ingreso'), 'tocar «Ingresos» en el resumen filtra ingresos', fs1.length);
    await pag.click('.chip--limpiar'); await espera(200);
    fs1 = await filas(pag);
    comprobar(fs1.length === info.nMovs && !(await pag.$('.chip--limpiar')), '«Limpiar» devuelve todos los movimientos', fs1.length);

    // Categoría: hoja inferior
    await pag.click('.chip[data-chip="categoria"]'); await espera(350);
    const hoja = await pag.evaluate(() => {
      const dlg = document.querySelector('dialog[open]'); if (!dlg) return null;
      const bs = [...dlg.querySelectorAll('.lista-acciones__item')];
      return { titulo: dlg.querySelector('.dialogo__titulo').textContent, n: bs.length, altos: Math.min.apply(null, bs.map(b => b.getBoundingClientRect().height)), marcada: dlg.querySelector('[aria-pressed="true"]').textContent, grupos: [...dlg.querySelectorAll('.lista-acciones__grupo')].map(g => g.textContent) };
    });
    comprobar(hoja && hoja.titulo === 'Categoría' && hoja.n > 3 && hoja.altos >= 44 && /Todas/.test(hoja.marcada) && hoja.grupos.length === 2, 'chip «Categoría» abre una hoja con las categorías por tipo', hoja);
    const malosHoja = await pag.evaluate(contrasteMalo);
    comprobar(malosHoja.length === 0, 'contraste AA en la hoja de categorías', malosHoja.slice(0, 5));
    const elegida = await pag.evaluate(() => {
      const usadas = new Set(FP.dominio.filtrarMovimientos('2026-09', {}).map(m => m.categoriaId));
      const cat = FP.store.state.categorias.find(c => usadas.has(c.id));
      const b = [...document.querySelectorAll('dialog[open] .lista-acciones__item')].find(x => x.querySelector('.lista-acciones__texto').textContent === cat.nombre);
      b.click();
      return { nombre: cat.nombre, n: FP.dominio.filtrarMovimientos('2026-09', { categoriaId: cat.id }).length };
    });
    await espera(300);
    fs1 = await filas(pag);
    const chipCat = await pag.evaluate(() => { const c = document.querySelector('.chip[data-chip="categoria"]'); return { t: c.textContent, p: c.getAttribute('aria-pressed'), abierta: !!document.querySelector('dialog[open]') }; });
    comprobar(!chipCat.abierta && chipCat.p === 'true' && chipCat.t.includes(elegida.nombre) && fs1.length === elegida.n, 'elegir categoría: el chip muestra «' + elegida.nombre + '» y la lista se filtra', [chipCat, fs1.length, elegida]);
    const desb2 = await pag.evaluate(A => document.documentElement.scrollWidth - A, d.ancho);
    comprobar(desb2 <= 0, 'sin desborde con categoría y «Limpiar» visibles', desb2);
    await pag.click('.chip--limpiar'); await espera(200);

    // Lupa: buscar
    await pag.click('.chip[data-chip="buscar"]'); await espera(120);
    const visible = await pag.evaluate(() => !document.querySelector('.buscar-movil').hidden && document.activeElement.type === 'search');
    comprobar(visible, 'la lupa despliega el campo de búsqueda y le da el foco');
    const palabra = await pag.evaluate(() => { const m = FP.dominio.filtrarMovimientos('2026-09', {}).find(x => x.descripcion && x.descripcion.length > 3); return m ? m.descripcion.slice(0, 4) : 'merc'; });
    await pag.type('.buscar-movil input', palabra); await espera(450);
    const busq = await pag.evaluate((q) => ({
      filas: document.querySelectorAll('.dias .movimiento').length,
      esperadas: FP.dominio.filtrarMovimientos('2026-09', { texto: q }).length,
      foco: document.activeElement.type === 'search', valor: document.activeElement.value
    }), palabra);
    comprobar(busq.filas === busq.esperadas && busq.filas > 0 && busq.foco && busq.valor === palabra, 'buscar «' + palabra + '» filtra sin perder el foco al escribir', busq);
    await pag.type('.buscar-movil input', 'zzzqqq'); await espera(450);
    const vacio = await pag.evaluate(() => ({ t: (document.querySelector('.dias .vacio, .dias .tarjeta') || {}).textContent || '', filas: document.querySelectorAll('.dias .movimiento').length }));
    comprobar(vacio.filas === 0 && /Ningún movimiento coincide/.test(vacio.t), 'sin resultados: estado vacío con «Limpiar filtros»', vacio);
    await pag.click('.chip--limpiar'); await espera(250);
    const trasLimpiar = await pag.evaluate(() => ({ oculto: document.querySelector('.buscar-movil').hidden, valor: document.querySelector('.buscar-movil input').value, filas: document.querySelectorAll('.dias .movimiento').length }));
    comprobar(trasLimpiar.oculto && trasLimpiar.valor === '' && trasLimpiar.filas === info.nMovs, '«Limpiar» cierra la búsqueda y restaura la lista', trasLimpiar);

    // Tocar una fila: hoja de detalle
    await pag.click('.dias .movimiento'); await espera(350);
    const det = await pag.evaluate(() => {
      const dlg = document.querySelector('dialog[open]'); if (!dlg) return null;
      const bs = [...dlg.querySelectorAll('.dialogo__pie .btn')];
      return {
        monto: dlg.querySelector('.detalle__monto').textContent,
        datos: [...dlg.querySelectorAll('.detalle__fila dt')].map(x => x.textContent),
        botones: bs.map(b => b.textContent), altos: bs.map(b => Math.round(b.getBoundingClientRect().height)),
        cabe: dlg.getBoundingClientRect().bottom <= innerHeight + 1 && dlg.getBoundingClientRect().top >= 0
      };
    });
    comprobar(det && /\d/.test(det.monto) && ['Tipo', 'Categoría', 'Fecha'].every(x => det.datos.includes(x)) && det.botones.join() === 'Eliminar,Editar' && det.altos.every(h => h >= 44) && det.cabe, 'tocar una fila abre el detalle con Eliminar y Editar', det);
    const malosDet = await pag.evaluate(contrasteMalo);
    comprobar(malosDet.length === 0, 'contraste AA en el detalle', malosDet.slice(0, 5));
    if (d.ancho === 393) await pag.screenshot({ path: path.join(SALIDA, 'movimientos-movil-detalle-' + tema + '.png') });
    await pag.evaluate(() => [...document.querySelectorAll('dialog[open] .dialogo__pie .btn')].find(b => b.textContent === 'Editar').click());
    await espera(350);
    const form = await pag.evaluate(() => { const ds = document.querySelectorAll('dialog[open]'); return { n: ds.length, titulo: ds.length ? ds[0].querySelector('.dialogo__titulo').textContent : '' }; });
    comprobar(form.n === 1 && /movimiento/i.test(form.titulo), '«Editar» cierra el detalle y abre el formulario', form);
    await pag.evaluate(() => document.querySelector('dialog[open] [aria-label="Cerrar"]').click());
    await espera(150);

    // Inicio usa la misma fila-botón (con fecha, en una línea)
    await pag.evaluate(() => { location.hash = '#/'; }); await espera(300);
    const ini = await pag.evaluate(() => {
      const fs = [...document.querySelectorAll('[aria-label="Movimientos recientes"] .movimiento')];
      return { n: fs.length, botones: fs.every(f => f.tagName === 'BUTTON'), dosLineas: fs.filter(f => f.querySelector('.movimiento__sub').getBoundingClientRect().height > 22).length, conFecha: fs.filter(f => /\d (sep|oct|nov)/.test(f.querySelector('.movimiento__sub').textContent)).length };
    });
    comprobar(ini.n === 5 && ini.botones && ini.dosLineas === 0 && ini.conFecha === 5, 'Inicio: las 5 filas son botones con la fecha en una sola línea', ini);

    comprobar(pag.errores.length === 0, 'sin errores de consola', pag.errores);
    await pag.close();
  }

  // Tablet y escritorio: no cambian
  for (const c of [{ nombre: 'tablet', ancho: 820, alto: 1180, movil: true }, { nombre: 'escritorio', ancho: 1280, alto: 800, movil: false }]) {
    console.log('\n[' + c.nombre + ' ' + c.ancho + ' px]');
    const pag = await abrir(navegador, c.ancho, c.alto, 'claro', c.movil);
    await pag.click('[data-mes="anterior"]'); await pag.click('[data-mes="anterior"]');
    await espera(200);
    const e = await pag.evaluate(() => ({
      filtros: !!document.querySelector('.tarjeta.filtros'), chips: !!document.querySelector('.chips'), dias: !!document.querySelector('.dias'),
      tabla: !!document.querySelector('.tabla'), filasMenu: document.querySelectorAll('.movimiento .btn-icono').length, filas: document.querySelectorAll('.movimiento').length,
      botones: document.querySelectorAll('.movimiento--boton').length
    }));
    comprobar(e.filtros && !e.chips && !e.dias && e.botones === 0, 'tarjeta de filtros de siempre, sin chips ni lista por día', e);
    comprobar(c.movil ? (e.filas > 0 && e.filasMenu === e.filas) : e.tabla, c.movil ? 'filas con «⋮» como antes' : 'tabla como antes', e);
    comprobar(pag.errores.length === 0, 'sin errores de consola', pag.errores);
    await pag.close();
  }

  await navegador.close();
  console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nTODO OK');
  process.exit(fallos ? 1 : 0);
})();
