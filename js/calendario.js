/* ==========================================================================
   calendario.js — Selector de mes y selector de rango de días
   Parte 1 (lógica pura, sin DOM): cuadrícula del mes, selección de rango y
   atajos. Tiene pruebas en pruebas.html.
   Parte 2 (componentes): abrirMes() y abrirRango(), que usan FP.ui.dialogo
   (ventana flotante junto al botón en escritorio, hoja inferior en móvil).
   La semana empieza en lunes.
   ========================================================================== */
window.FP = window.FP || {};

FP.calendario = (function () {
  'use strict';

  const U = FP.util;
  const el = U.el;

  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
    'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const SEMANA_LARGO = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

  /* ======================================================= lógica pura == */

  /** Primera letra en mayúscula: "Septiembre de 2026". */
  function capitalizar(t) { return t.charAt(0).toUpperCase() + t.slice(1); }

  /** "septiembre de 2026" */
  function etiquetaMes(periodo) {
    const p = U.partesPeriodo(periodo);
    return p ? MESES[p.mes - 1] + ' de ' + p.anio : '—';
  }

  /** ["2026-01", …, "2026-12"] */
  function mesesDelAnio(anio) {
    const lista = [];
    for (let m = 1; m <= 12; m++) lista.push(anio + '-' + U.dos(m));
    return lista;
  }

  /** Celdas vacías antes del día 1 con la semana empezando en lunes (lunes = 0). */
  function desfaseDe(periodo) {
    const p = U.partesPeriodo(periodo);
    return (new Date(p.anio, p.mes - 1, 1).getDay() + 6) % 7;
  }

  function armar(dias, desfase) {
    const celdas = [];
    for (let i = 0; i < desfase; i++) celdas.push(null);
    for (let d = 1; d <= dias; d++) celdas.push(d);
    while (celdas.length % 7 !== 0) celdas.push(null);
    const semanas = [];
    for (let i = 0; i < celdas.length; i += 7) semanas.push(celdas.slice(i, i + 7));
    return { semanas: semanas, dias: dias, desfase: desfase };
  }

  /** Cuadrícula de un mes real, alineada con los días de la semana. */
  function cuadricula(periodo) { return armar(U.diasEnMes(periodo), desfaseDe(periodo)); }

  /** Cuadrícula genérica de días 1…n, sin días de la semana (Histórico y Comparar). */
  function cuadriculaDias(n) { return armar(n || 31, 0); }

  /**
   * Máquina de selección. estado = { desde, hasta, ancla }.
   * 1.er toque: marca el inicio (queda esperando el final). 2.º toque: cierra el
   * rango (ordenado; el mismo día dos veces es un solo día). 3.º: empieza de nuevo.
   */
  function seleccionar(estado, dia) {
    if (estado.ancla === null || estado.ancla === undefined) return { desde: dia, hasta: dia, ancla: dia };
    return { desde: Math.min(estado.ancla, dia), hasta: Math.max(estado.ancla, dia), ancla: null };
  }

  /** Rango a pintar: con un inicio pendiente, sigue al cursor (vista previa). */
  function vista(estado, sobre) {
    if (estado.ancla !== null && estado.ancla !== undefined && sobre !== null && sobre !== undefined) {
      return { desde: Math.min(estado.ancla, sobre), hasta: Math.max(estado.ancla, sobre) };
    }
    return { desde: estado.desde, hasta: estado.hasta };
  }

  /** Rangos de uso frecuente para un mes de `max` días. */
  function atajos(max) {
    return [
      { id: 'mes', etiqueta: 'Mes completo', desde: 1, hasta: max },
      { id: 'q1', etiqueta: 'Primera quincena', desde: 1, hasta: Math.min(15, max) },
      { id: 'q2', etiqueta: 'Segunda quincena', desde: 16, hasta: max }
    ];
  }

  /** "Mes completo" · "Día 4" · "Del 1 al 15" */
  function etiquetaRango(rango) {
    if (!rango) return 'Mes completo';
    if (rango.desde === rango.hasta) return 'Día ' + rango.desde;
    return 'Del ' + rango.desde + ' al ' + rango.hasta;
  }

  /* ======================================================= componentes == */

  /** Selector de mes: cuadrícula de 12 meses con flechas de año. */
  function abrirMes(op) {
    const ui = FP.ui;
    const hoy = U.periodoActual();
    let anio = U.partesPeriodo(op.periodo).anio;
    const cont = el('div', { class: 'cal' });
    let d = null;

    function pintar(enfocar) {
      U.vaciar(cont);
      cont.appendChild(el('div', { class: 'cal__nav' }, [
        el('button', {
          type: 'button', class: 'btn-icono', 'aria-label': 'Año anterior', dataset: { nav: 'prev' },
          onclick: function () { anio--; pintar('prev'); }
        }, '‹'),
        el('strong', { class: 'cal__titulo', 'aria-live': 'polite' }, String(anio)),
        el('button', {
          type: 'button', class: 'btn-icono', 'aria-label': 'Año siguiente', dataset: { nav: 'next' },
          onclick: function () { anio++; pintar('next'); }
        }, '›')
      ]));

      const rejilla = el('div', { class: 'cal__meses', role: 'group', 'aria-label': 'Meses de ' + anio });
      mesesDelAnio(anio).forEach(function (p, i) {
        const sel = p === op.periodo;
        const esHoy = p === hoy;
        rejilla.appendChild(el('button', {
          type: 'button',
          class: 'cal__mes' + (sel ? ' cal__mes--sel' : '') + (esHoy ? ' cal__mes--hoy' : ''),
          'aria-pressed': String(sel),
          'aria-label': etiquetaMes(p) + (esHoy ? ' (mes actual)' : ''),
          dataset: { periodo: p },
          onclick: function () { d.cerrar(); op.alElegir(p); }
        }, MESES_CORTOS[i]));
      });
      cont.appendChild(rejilla);

      cont.appendChild(el('div', { class: 'cal__pie' }, [
        el('button', {
          type: 'button', class: 'btn btn--sm btn--fantasma',
          onclick: function () { d.cerrar(); op.alElegir(hoy); }
        }, 'Ir al mes actual')
      ]));

      if (enfocar) {
        const b = cont.querySelector('[data-nav="' + enfocar + '"]');
        if (b) b.focus();
      }
    }

    d = ui.dialogo({
      titulo: 'Elegir mes', clase: 'dialogo--calendario', ancla: op.ancla,
      contenido: [cont], acciones: []
    });
    pintar();
    setTimeout(function () {
      const sel = cont.querySelector('.cal__mes--sel') || cont.querySelector('.cal__mes');
      if (sel) sel.focus();
    }, 60);
    return d;
  }

  /**
   * Selector de rango de días.
   * op = { periodo, modo: 'mes' | 'dias', max, rango, ancla, alAplicar(desde, hasta) }
   * modo 'mes': cuadrícula real del mes (con días de la semana).
   * modo 'dias': días 1…31 genéricos (el rango se aplica a cada mes).
   */
  function abrirRango(op) {
    const ui = FP.ui;
    const max = op.max;
    const modoMes = op.modo !== 'dias';
    const geom = modoMes ? cuadricula(op.periodo) : cuadriculaDias(max);
    const hoyDia = (modoMes && op.periodo === U.periodoActual()) ? Number(U.hoyISO().slice(8, 10)) : null;

    let est = {
      desde: op.rango ? Math.min(op.rango.desde, max) : 1,
      hasta: op.rango ? Math.min(op.rango.hasta, max) : max,
      ancla: null
    };
    let sobre = null;
    let foco = est.desde;
    const botones = {};

    const cont = el('div', { class: 'cal' });
    const estadoTxt = el('p', { class: 'cal__estado', role: 'status', 'aria-live': 'polite' });
    const errorTxt = el('p', { class: 'campo__error', role: 'alert', hidden: true });
    const inDesde = el('input', {
      type: 'number', min: '1', max: String(max), step: '1', inputmode: 'numeric', name: 'cal-desde',
      oninput: desdeCampos
    });
    const inHasta = el('input', {
      type: 'number', min: '1', max: String(max), step: '1', inputmode: 'numeric', name: 'cal-hasta',
      oninput: desdeCampos
    });

    function nombreDia(dia) {
      if (!modoMes) return 'Día ' + dia;
      const dow = (geom.desfase + dia - 1) % 7;
      return SEMANA_LARGO[dow] + ' ' + dia + ' de ' + etiquetaMes(op.periodo);
    }

    function marcar() {
      const v = vista(est, sobre);
      Object.keys(botones).forEach(function (k) {
        const n = Number(k);
        const b = botones[k];
        const dentro = n >= v.desde && n <= v.hasta;
        b.classList.toggle('cal__dia--rango', dentro);
        b.classList.toggle('cal__dia--inicio', n === v.desde);
        b.classList.toggle('cal__dia--fin', n === v.hasta);
        b.setAttribute('aria-pressed', String(dentro));
      });
      const n = v.hasta - v.desde + 1;
      estadoTxt.textContent = (v.desde === v.hasta ? 'Día ' + v.desde : 'Del ' + v.desde + ' al ' + v.hasta + ' · ' + n + ' días') +
        (est.ancla !== null ? ' — elige el día final' : '');
    }

    function aCampos() { inDesde.value = String(est.desde); inHasta.value = String(est.hasta); }

    function limpiarError() {
      errorTxt.hidden = true; errorTxt.textContent = '';
      inDesde.removeAttribute('aria-invalid'); inHasta.removeAttribute('aria-invalid');
    }

    function desdeCampos() {
      limpiarError();
      const a = Number(inDesde.value), b = Number(inHasta.value);
      if (inDesde.value !== '' && inHasta.value !== '' &&
          Object.keys(FP.dominio.validarRango(a, b, max)).length === 0) {
        est = { desde: a, hasta: b, ancla: null };
        sobre = null;
        marcar();
      }
    }

    function toque(dia) {
      limpiarError();
      est = seleccionar(est, dia);
      sobre = null;
      foco = dia;
      aCampos();
      marcar();
    }

    function mover(dia) {
      foco = dia;
      Object.keys(botones).forEach(function (k) { botones[k].tabIndex = Number(k) === dia ? 0 : -1; });
      botones[dia].focus();
      if (est.ancla !== null) { sobre = dia; marcar(); }
    }

    function teclado(e) {
      const pasos = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
      let nuevo = null;
      if (e.key in pasos) nuevo = foco + pasos[e.key];
      else if (e.key === 'Home') nuevo = 1;
      else if (e.key === 'End') nuevo = max;
      if (nuevo === null) return;
      e.preventDefault();
      mover(U.clamp(nuevo, 1, max));
    }

    /* --- cuadrícula --- */
    const rejilla = el('div', {
      class: 'cal__dias', role: 'group',
      'aria-label': modoMes ? etiquetaMes(op.periodo) : 'Días del mes, del 1 al ' + max,
      onkeydown: teclado,
      onmouseleave: function () { if (sobre !== null) { sobre = null; marcar(); } }
    });
    geom.semanas.forEach(function (sem) {
      sem.forEach(function (dia) {
        if (dia === null) { rejilla.appendChild(el('span', { class: 'cal__vacio', 'aria-hidden': 'true' })); return; }
        const b = el('button', {
          type: 'button',
          class: 'cal__dia' + (dia === hoyDia ? ' cal__dia--hoy' : ''),
          tabindex: dia === foco ? '0' : '-1',
          'aria-label': nombreDia(dia) + (dia === hoyDia ? ' (hoy)' : ''),
          dataset: { dia: String(dia) },
          onclick: function () { toque(dia); },
          onmouseenter: function () { if (est.ancla !== null) { sobre = dia; marcar(); } }
        }, String(dia));
        botones[dia] = b;
        rejilla.appendChild(b);
      });
    });

    /* --- armado --- */
    cont.appendChild(el('div', { class: 'cal__nav' }, [
      el('strong', { class: 'cal__titulo' }, modoMes ? capitalizar(etiquetaMes(op.periodo)) : 'Días de cada mes')
    ]));
    cont.appendChild(estadoTxt);
    if (modoMes) {
      cont.appendChild(el('div', { class: 'cal__semana', 'aria-hidden': 'true' },
        SEMANA.map(function (s) { return el('span', null, s); })));
    }
    cont.appendChild(rejilla);

    cont.appendChild(el('div', { class: 'cal__atajos', role: 'group', 'aria-label': 'Atajos' },
      atajos(max).map(function (a) {
        return el('button', {
          type: 'button', class: 'cal__atajo',
          onclick: function () {
            limpiarError();
            est = { desde: a.desde, hasta: a.hasta, ancla: null };
            sobre = null; foco = a.desde; aCampos(); marcar();
          }
        }, a.etiqueta);
      })));

    cont.appendChild(el('div', { class: 'cal__campos' }, [
      el('label', null, ['Del día', inDesde]),
      el('label', null, ['al día', inHasta])
    ]));
    cont.appendChild(errorTxt);
    if (!modoMes) {
      cont.appendChild(el('p', { class: 'campo__ayuda' },
        'Este rango se aplica a cada mes que se muestra. Si un mes es más corto, llega hasta su último día.'));
    }

    function aplicar(cerrar) {
      const desde = inDesde.value === '' ? NaN : Number(inDesde.value);
      const hasta = inHasta.value === '' ? NaN : Number(inHasta.value);
      const errores = FP.dominio.validarRango(desde, hasta, max);
      const mensajes = Object.keys(errores).map(function (k) { return errores[k]; });
      if (mensajes.length) {
        errorTxt.textContent = mensajes.join(' ');
        errorTxt.hidden = false;
        if (errores.desde) inDesde.setAttribute('aria-invalid', 'true');
        if (errores.hasta) inHasta.setAttribute('aria-invalid', 'true');
        return;
      }
      cerrar();
      op.alAplicar(desde, hasta);
    }

    const d = ui.dialogo({
      titulo: 'Elegir días', clase: 'dialogo--calendario', ancla: op.ancla,
      descripcion: modoMes ? etiquetaMes(op.periodo) : 'Del 1 al ' + max + ' de cada mes',
      contenido: [cont],
      acciones: [
        { etiqueta: 'Cancelar', alHacerClic: function (cerrar) { cerrar(); } },
        { etiqueta: 'Aplicar', clase: 'btn--primario', alHacerClic: aplicar }
      ]
    });

    aCampos();
    marcar();
    setTimeout(function () { if (botones[foco]) botones[foco].focus(); }, 60);
    return d;
  }

  return {
    etiquetaMes: etiquetaMes, capitalizar: capitalizar, mesesDelAnio: mesesDelAnio, cuadricula: cuadricula,
    cuadriculaDias: cuadriculaDias, seleccionar: seleccionar, vista: vista,
    atajos: atajos, etiquetaRango: etiquetaRango,
    abrirMes: abrirMes, abrirRango: abrirRango
  };
})();
