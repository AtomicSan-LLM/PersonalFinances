/* ==========================================================================
   util.js — Utilidades transversales (DOM, fechas, periodos, dinero)
   ========================================================================== */
window.FP = window.FP || {};

FP.util = (function () {
  'use strict';

  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  /* Marcas diacríticas combinantes (para comparar textos sin tildes). */
  const RE_TILDES = new RegExp('[\\u0300-\\u036f]', 'g');

  /* ---------------------------------------------------------------- DOM -- */

  function $(sel, raiz) { return (raiz || document).querySelector(sel); }
  function $$(sel, raiz) { return Array.prototype.slice.call((raiz || document).querySelectorAll(sel)); }

  /**
   * Crea un elemento.
   * el('div', {class:'x', onclick:fn, dataset:{a:1}}, [hijos|texto])
   */
  function el(etiqueta, props, hijos) {
    const nodo = document.createElement(etiqueta);
    if (props) {
      Object.keys(props).forEach(function (k) {
        const v = props[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') nodo.className = v;
        else if (k === 'html') nodo.innerHTML = v;
        else if (k === 'text') nodo.textContent = v;
        else if (k === 'dataset') Object.keys(v).forEach(function (d) { nodo.dataset[d] = v[d]; });
        else if (k.indexOf('on') === 0 && typeof v === 'function') nodo.addEventListener(k.slice(2), v);
        else if (v === true) nodo.setAttribute(k, '');
        else nodo.setAttribute(k, v);
      });
    }
    agregar(nodo, hijos);
    return nodo;
  }

  function agregar(padre, hijos) {
    if (hijos === null || hijos === undefined || hijos === false) return padre;
    if (Array.isArray(hijos)) {
      hijos.forEach(function (h) { agregar(padre, h); });
    } else if (hijos instanceof Node) {
      padre.appendChild(hijos);
    } else {
      padre.appendChild(document.createTextNode(String(hijos)));
    }
    return padre;
  }

  function vaciar(nodo) { while (nodo && nodo.firstChild) nodo.removeChild(nodo.firstChild); return nodo; }

  function escapar(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function debounce(fn, ms) {
    let t;
    return function () {
      const args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms || 200);
    };
  }

  /* --------------------------------------------------------------- ids --- */

  function uid(prefijo) {
    return (prefijo || 'id') + '_' +
      Date.now().toString(36) + '_' +
      Math.random().toString(36).slice(2, 8);
  }

  /* ------------------------------------------------------------ fechas --- */

  /** Fecha de hoy en formato YYYY-MM-DD, en hora local (no UTC). */
  function hoyISO() {
    const d = new Date();
    return d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate());
  }

  function dos(n) { return (n < 10 ? '0' : '') + n; }

  /** Periodo (YYYY-MM) de una fecha ISO. Regla PA-02: mes calendario. */
  function periodoDe(fechaISO) { return String(fechaISO || '').slice(0, 7); }

  function periodoActual() { return periodoDe(hoyISO()); }

  /** 'Septiembre 2026' */
  function periodoLegible(periodo, corto) {
    const p = partesPeriodo(periodo);
    if (!p) return '—';
    const nombre = MESES[p.mes - 1] || '';
    const texto = corto ? nombre.slice(0, 3) : nombre;
    return texto.charAt(0).toUpperCase() + texto.slice(1) + ' ' + p.anio;
  }

  function partesPeriodo(periodo) {
    const m = /^(\d{4})-(\d{2})$/.exec(String(periodo || ''));
    if (!m) return null;
    return { anio: Number(m[1]), mes: Number(m[2]) };
  }

  /** Suma (o resta) meses a un periodo YYYY-MM. */
  function sumarMeses(periodo, n) {
    const p = partesPeriodo(periodo);
    if (!p) return periodo;
    const total = p.anio * 12 + (p.mes - 1) + n;
    const anio = Math.floor(total / 12);
    const mes = (total % 12 + 12) % 12 + 1;
    return anio + '-' + dos(mes);
  }

  /** Diferencia en meses entre dos periodos (b - a). */
  function diffMeses(a, b) {
    const pa = partesPeriodo(a), pb = partesPeriodo(b);
    if (!pa || !pb) return 0;
    return (pb.anio * 12 + pb.mes) - (pa.anio * 12 + pa.mes);
  }

  function diasEnMes(periodo) {
    const p = partesPeriodo(periodo);
    if (!p) return 30;
    return new Date(p.anio, p.mes, 0).getDate();
  }

  /**
   * Construye la fecha de un recurrente dentro de un periodo.
   * Regla PA-09: si el día no existe en el mes, se usa el último día válido.
   */
  function fechaEnPeriodo(periodo, diaMes) {
    const max = diasEnMes(periodo);
    const dia = Math.min(Math.max(Number(diaMes) || 1, 1), max);
    return periodo + '-' + dos(dia);
  }

  /** '10 sep' o '10 sep 2025' si el año es distinto al del periodo mostrado. */
  function fechaCorta(fechaISO, incluirAnio) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fechaISO || ''));
    if (!m) return String(fechaISO || '');
    const dia = Number(m[3]);
    const mes = (MESES[Number(m[2]) - 1] || '').slice(0, 3);
    return dia + ' ' + mes + (incluirAnio ? ' ' + m[1] : '');
  }

  function fechaLarga(fechaISO) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fechaISO || ''));
    if (!m) return String(fechaISO || '');
    return Number(m[3]) + ' de ' + MESES[Number(m[2]) - 1] + ' de ' + m[1];
  }

  function esFechaValida(fechaISO) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fechaISO || ''));
    if (!m) return false;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.getFullYear() === Number(m[1]) &&
      d.getMonth() === Number(m[2]) - 1 &&
      d.getDate() === Number(m[3]);
  }

  /* ------------------------------------------------------------- varios -- */

  function clamp(n, min, max) { return Math.min(Math.max(n, min), max); }

  function redondear(n, decimales) {
    const f = Math.pow(10, decimales || 0);
    return Math.round((Number(n) + Number.EPSILON) * f) / f;
  }

  /** Compara textos ignorando mayúsculas y tildes (para buscar y detectar duplicados). */
  function normalizar(s) {
    return String(s === null || s === undefined ? '' : s)
      .trim().toLowerCase()
      .normalize('NFD').replace(RE_TILDES, '');
  }

  function ordenarPor(lista, obtener, desc) {
    return lista.slice().sort(function (a, b) {
      const va = obtener(a), vb = obtener(b);
      if (va < vb) return desc ? 1 : -1;
      if (va > vb) return desc ? -1 : 1;
      return 0;
    });
  }

  function agrupar(lista, clave) {
    const mapa = new Map();
    lista.forEach(function (item) {
      const k = clave(item);
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k).push(item);
    });
    return mapa;
  }

  function suma(lista, obtener) {
    return lista.reduce(function (acc, x) { return acc + (Number(obtener ? obtener(x) : x) || 0); }, 0);
  }

  /** Variación porcentual de a → b. Devuelve null cuando no es calculable. */
  function variacion(a, b) {
    if (!a) return (b ? null : 0);
    return ((b - a) / Math.abs(a)) * 100;
  }

  function formatoPorcentaje(n, decimales) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    const d = decimales === undefined ? 1 : decimales;
    return n.toFixed(d).replace('.', ',') + '%';
  }

  return {
    MESES: MESES,
    $: $, $$: $$, el: el, agregar: agregar, vaciar: vaciar, escapar: escapar, debounce: debounce,
    uid: uid,
    hoyISO: hoyISO, dos: dos,
    periodoDe: periodoDe, periodoActual: periodoActual, periodoLegible: periodoLegible,
    partesPeriodo: partesPeriodo, sumarMeses: sumarMeses, diffMeses: diffMeses,
    diasEnMes: diasEnMes, fechaEnPeriodo: fechaEnPeriodo,
    fechaCorta: fechaCorta, fechaLarga: fechaLarga, esFechaValida: esFechaValida,
    clamp: clamp, redondear: redondear, normalizar: normalizar,
    ordenarPor: ordenarPor, agrupar: agrupar, suma: suma,
    variacion: variacion, formatoPorcentaje: formatoPorcentaje
  };
})();

/* ==========================================================================
   Dinero — formateo y lectura de importes (PA-01: moneda configurable)
   ========================================================================== */
FP.dinero = (function () {
  'use strict';

  function cfg() {
    return (FP.store && FP.store.state && FP.store.state.config) ||
      { moneda: 'COP', locale: 'es-CO', decimales: 0 };
  }

  let cacheClave = '';
  let cacheFmt = null;

  function formateador() {
    const c = cfg();
    const clave = c.locale + '|' + c.moneda + '|' + c.decimales;
    if (clave !== cacheClave || !cacheFmt) {
      cacheClave = clave;
      try {
        cacheFmt = new Intl.NumberFormat(c.locale, {
          style: 'currency',
          currency: c.moneda,
          minimumFractionDigits: c.decimales,
          maximumFractionDigits: c.decimales
        });
      } catch (e) {
        cacheFmt = new Intl.NumberFormat('es-CO', {
          style: 'currency', currency: 'COP',
          minimumFractionDigits: 0, maximumFractionDigits: 0
        });
      }
    }
    return cacheFmt;
  }

  function limpiarCache() { cacheClave = ''; cacheFmt = null; }

  /** $1.250.000 */
  function formato(n) {
    const v = Number(n) || 0;
    return formateador().format(v);
  }

  /** +$4.500.000 / -$180.000 según el tipo de movimiento. */
  function formatoConSigno(n, tipo) {
    const v = Math.abs(Number(n) || 0);
    const signo = tipo === 'ingreso' ? '+' : '-';
    return signo + formato(v);
  }

  /** Como formato(), pero conservando el signo del número (para saldos). */
  function formatoSaldo(n) {
    const v = Number(n) || 0;
    return (v < 0 ? '-' : '') + formato(Math.abs(v));
  }

  function simbolo() {
    try {
      const partes = formateador().formatToParts(0);
      const s = partes.find(function (p) { return p.type === 'currency'; });
      return s ? s.value : '$';
    } catch (e) { return '$'; }
  }

  /** Solo el número, sin símbolo — para precargar campos de edición. */
  function paraCampo(n) {
    const c = cfg();
    const v = Number(n);
    if (!isFinite(v)) return '';
    try {
      return new Intl.NumberFormat(c.locale, {
        minimumFractionDigits: c.decimales, maximumFractionDigits: c.decimales
      }).format(v);
    } catch (e) { return String(v); }
  }

  /**
   * Lee lo que el usuario escribió y devuelve un número.
   * Acepta "1.250.000", "1250000", "1 250 000", "$1.250.000", "1250,50".
   * Devuelve NaN si no hay ningún dígito.
   */
  function leer(texto) {
    let s = String(texto === null || texto === undefined ? '' : texto).trim();
    if (!s) return NaN;
    const negativo = /^\s*-/.test(s);
    s = s.replace(/[^\d.,]/g, '');
    if (!s) return NaN;

    const decimalesPermitidos = cfg().decimales > 0;
    const ultimo = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));

    let entero = s, decimal = '';
    if (ultimo >= 0) {
      const cola = s.slice(ultimo + 1);
      // Se interpreta como decimal solo si quedan 1 o 2 dígitos y la moneda usa decimales.
      if (decimalesPermitidos && cola.length > 0 && cola.length <= 2 && /^\d+$/.test(cola)) {
        entero = s.slice(0, ultimo);
        decimal = cola;
      }
    }
    entero = entero.replace(/[.,]/g, '');
    if (!entero && !decimal) return NaN;

    const n = Number((entero || '0') + (decimal ? '.' + decimal : ''));
    if (!isFinite(n)) return NaN;
    return negativo ? -n : n;
  }

  return {
    formato: formato,
    formatoConSigno: formatoConSigno,
    formatoSaldo: formatoSaldo,
    paraCampo: paraCampo,
    simbolo: simbolo,
    leer: leer,
    limpiarCache: limpiarCache
  };
})();
