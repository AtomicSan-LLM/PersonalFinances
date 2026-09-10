/* ==========================================================================
   graficos.js — Visualizaciones en SVG, sin dependencias externas
   Sección 11 del diseño: evolución de ingresos/gastos, evolución del ahorro
   y comparación de gasto por categoría en barras horizontales.
   ========================================================================== */
window.FP = window.FP || {};

FP.graficos = (function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const U = FP.util;

  function svg(etiqueta, attrs) {
    const n = document.createElementNS(NS, etiqueta);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        n.setAttribute(k, v);
      });
    }
    return n;
  }

  /** Formato abreviado para ejes: 4.500.000 → "4,5 M". */
  function compacto(n) {
    const v = Math.abs(Number(n) || 0);
    const signo = n < 0 ? '-' : '';
    if (v >= 1e9) return signo + recorta(v / 1e9) + ' MM';
    if (v >= 1e6) return signo + recorta(v / 1e6) + ' M';
    if (v >= 1e3) return signo + recorta(v / 1e3) + ' k';
    return signo + String(Math.round(v));
  }

  function recorta(n) {
    const r = Math.round(n * 10) / 10;
    return String(r).replace('.', ',');
  }

  /** Escalón "bonito" para la rejilla del eje Y. */
  function escala(max) {
    if (max <= 0) return { max: 1, paso: 1 };
    const magnitud = Math.pow(10, Math.floor(Math.log10(max)));
    const normalizado = max / magnitud;
    let paso;
    if (normalizado <= 1) paso = 0.25 * magnitud;
    else if (normalizado <= 2) paso = 0.5 * magnitud;
    else if (normalizado <= 5) paso = magnitud;
    else paso = 2 * magnitud;
    return { max: Math.ceil(max / paso) * paso, paso: paso };
  }

  function envoltura(nodoSvg, leyenda, etiquetaAccesible) {
    const cont = U.el('div', { class: 'grafico' });
    nodoSvg.setAttribute('role', 'img');
    if (etiquetaAccesible) nodoSvg.setAttribute('aria-label', etiquetaAccesible);
    cont.appendChild(nodoSvg);
    if (leyenda && leyenda.length) {
      const l = U.el('div', { class: 'grafico__leyenda' });
      leyenda.forEach(function (item) {
        l.appendChild(U.el('span', { class: 'grafico__clave' }, [
          U.el('span', { class: 'grafico__muestra', style: 'background:' + item.color }),
          item.nombre
        ]));
      });
      cont.appendChild(l);
    }
    return cont;
  }

  function sinDatos(mensaje) {
    return U.el('p', { class: 'texto-apagado texto-sm', style: 'padding:24px 0;text-align:center' },
      mensaje || 'Todavía no hay datos suficientes para este gráfico.');
  }

  /* ------------------------------------------------ columnas agrupadas -- */

  /**
   * opciones = { etiquetas:[], series:[{nombre, color, valores:[]}], alto }
   */
  function columnas(opciones) {
    const etiquetas = opciones.etiquetas || [];
    const series = opciones.series || [];
    if (!etiquetas.length || !series.length) return sinDatos();

    const W = 720, H = opciones.alto || 260;
    const m = { top: 12, right: 8, bottom: 30, left: 52 };
    const ancho = W - m.left - m.right;
    const alto = H - m.top - m.bottom;

    let maximo = 0;
    series.forEach(function (s) {
      s.valores.forEach(function (v) { maximo = Math.max(maximo, Number(v) || 0); });
    });
    const esc = escala(maximo);
    const y = function (v) { return m.top + alto - (v / esc.max) * alto; };

    const nodo = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'xMidYMid meet' });

    /* Rejilla y eje Y */
    for (let v = 0; v <= esc.max + 1e-6; v += esc.paso) {
      const yy = y(v);
      nodo.appendChild(svg('line', { x1: m.left, y1: yy, x2: W - m.right, y2: yy, class: 'rejilla-linea' }));
      const t = svg('text', { x: m.left - 8, y: yy + 4, 'text-anchor': 'end', class: 'eje-texto' });
      t.textContent = compacto(v);
      nodo.appendChild(t);
    }

    const banda = ancho / etiquetas.length;
    const anchoGrupo = Math.min(banda * 0.68, 64);
    const anchoBarra = anchoGrupo / series.length;

    etiquetas.forEach(function (etq, i) {
      const centro = m.left + banda * i + banda / 2;

      series.forEach(function (s, j) {
        const valor = Number(s.valores[i]) || 0;
        const altura = Math.max(esc.max > 0 ? (valor / esc.max) * alto : 0, valor > 0 ? 2 : 0);
        const x = centro - anchoGrupo / 2 + anchoBarra * j;
        const barra = svg('rect', {
          x: x, y: m.top + alto - altura,
          width: Math.max(anchoBarra - 2, 1), height: altura,
          rx: 3, style: 'fill:' + s.color
        });
        const titulo = svg('title');
        titulo.textContent = etq + ' · ' + s.nombre + ': ' + FP.dinero.formato(valor);
        barra.appendChild(titulo);
        nodo.appendChild(barra);
      });

      const t = svg('text', { x: centro, y: H - 10, 'text-anchor': 'middle', class: 'eje-texto' });
      t.textContent = etq;
      nodo.appendChild(t);
    });

    nodo.appendChild(svg('line', {
      x1: m.left, y1: m.top + alto, x2: W - m.right, y2: m.top + alto, class: 'rejilla-linea'
    }));

    return envoltura(nodo, series.map(function (s) { return { nombre: s.nombre, color: s.color }; }),
      opciones.descripcion || 'Gráfico de columnas');
  }

  /* --------------------------------------------------------- líneas ---- */

  /**
   * opciones = { etiquetas:[], series:[{nombre, color, valores:[], discontinua}], alto }
   * Admite valores negativos (el ahorro real puede serlo).
   */
  function lineas(opciones) {
    const etiquetas = opciones.etiquetas || [];
    const series = opciones.series || [];
    if (etiquetas.length < 2 || !series.length) {
      return sinDatos('Necesitas al menos dos meses con información para ver la evolución.');
    }

    const W = 720, H = opciones.alto || 260;
    const m = { top: 12, right: 12, bottom: 30, left: 56 };
    const ancho = W - m.left - m.right;
    const alto = H - m.top - m.bottom;

    let maximo = 0, minimo = 0;
    series.forEach(function (s) {
      s.valores.forEach(function (v) {
        const n = Number(v) || 0;
        maximo = Math.max(maximo, n);
        minimo = Math.min(minimo, n);
      });
    });
    const escPos = escala(maximo);
    const escNeg = minimo < 0 ? escala(Math.abs(minimo)) : { max: 0, paso: escPos.paso };
    const techo = escPos.max;
    const piso = -escNeg.max;
    const rango = (techo - piso) || 1;
    const paso = Math.max(escPos.paso, escNeg.paso || escPos.paso);

    const y = function (v) { return m.top + alto - ((v - piso) / rango) * alto; };
    const x = function (i) { return m.left + (etiquetas.length === 1 ? ancho / 2 : (ancho / (etiquetas.length - 1)) * i); };

    const nodo = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'xMidYMid meet' });

    for (let v = piso; v <= techo + 1e-6; v += paso) {
      const yy = y(v);
      nodo.appendChild(svg('line', {
        x1: m.left, y1: yy, x2: W - m.right, y2: yy,
        class: 'rejilla-linea', 'stroke-width': Math.abs(v) < 1e-6 ? 1.5 : 1
      }));
      const t = svg('text', { x: m.left - 8, y: yy + 4, 'text-anchor': 'end', class: 'eje-texto' });
      t.textContent = compacto(v);
      nodo.appendChild(t);
    }

    series.forEach(function (s) {
      const puntos = s.valores.map(function (v, i) { return x(i) + ',' + y(Number(v) || 0); }).join(' ');
      nodo.appendChild(svg('polyline', {
        points: puntos, fill: 'none',
        style: 'stroke:' + s.color,
        'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
        'stroke-dasharray': s.discontinua ? '6 5' : null
      }));

      s.valores.forEach(function (v, i) {
        const punto = svg('circle', {
          cx: x(i), cy: y(Number(v) || 0), r: 3.5,
          style: 'fill:' + s.color + ';stroke:var(--superficie);stroke-width:1.5'
        });
        const titulo = svg('title');
        titulo.textContent = etiquetas[i] + ' · ' + s.nombre + ': ' + FP.dinero.formatoSaldo(Number(v) || 0);
        punto.appendChild(titulo);
        nodo.appendChild(punto);
      });
    });

    /* Se muestran como máximo 8 etiquetas en el eje X para que no se solapen. */
    const salto = Math.ceil(etiquetas.length / 8);
    etiquetas.forEach(function (etq, i) {
      if (i % salto !== 0 && i !== etiquetas.length - 1) return;
      const t = svg('text', { x: x(i), y: H - 10, 'text-anchor': 'middle', class: 'eje-texto' });
      t.textContent = etq;
      nodo.appendChild(t);
    });

    return envoltura(nodo, series.map(function (s) { return { nombre: s.nombre, color: s.color }; }),
      opciones.descripcion || 'Gráfico de líneas');
  }

  /* --------------------------------------------- barras horizontales --- */

  /**
   * opciones = { items:[{nombre, valor, color, secundario}], maximo }
   * Se prefiere sobre un gráfico de torta cuando hay muchas categorías.
   */
  function barrasHorizontales(opciones) {
    const items = (opciones.items || []).filter(function (i) { return (Number(i.valor) || 0) > 0; });
    if (!items.length) return sinDatos('No hay gastos registrados para comparar.');

    const maximo = opciones.maximo || Math.max.apply(null, items.map(function (i) { return Number(i.valor) || 0; }));
    const cont = U.el('div', { class: 'grafico pila pila--3' });

    items.forEach(function (item) {
      const valor = Number(item.valor) || 0;
      const pct = maximo > 0 ? (valor / maximo) * 100 : 0;
      cont.appendChild(U.el('div', null, [
        U.el('div', { class: 'fila fila--entre', style: 'gap:12px' }, [
          U.el('span', { class: 'texto-sm', style: 'font-weight:600' },
            (item.icono ? item.icono + ' ' : '') + item.nombre),
          U.el('span', { class: 'texto-sm num nowrap' }, FP.dinero.formato(valor))
        ]),
        U.el('div', { class: 'barra', style: 'margin-bottom:0' }, [
          U.el('div', {
            class: 'barra__relleno',
            style: 'width:' + U.clamp(pct, 0, 100) + '%;background:' + (item.color || 'var(--primario)')
          })
        ]),
        item.secundario ? U.el('div', { class: 'texto-sm texto-apagado' }, item.secundario) : null
      ]));
    });

    return cont;
  }

  return {
    columnas: columnas,
    lineas: lineas,
    barrasHorizontales: barrasHorizontales,
    compacto: compacto,
    sinDatos: sinDatos
  };
})();
