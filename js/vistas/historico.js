/* ==========================================================================
   S08 — Histórico
   Evolución mensual: tabla resumen y las visualizaciones recomendadas en la
   sección 11 del diseño (columnas ingresos/gastos, línea de ahorro vs meta y
   barras horizontales por categoría).
   ========================================================================== */
window.FP = window.FP || {};
FP.vistas = FP.vistas || {};

FP.vistas.historico = (function () {
  'use strict';

  const U = FP.util;
  const el = U.el;
  const ui = FP.ui;

  const COLORES = {
    ingreso: 'var(--ingreso)',
    gasto: 'var(--gasto)',
    ahorro: 'var(--primario)',
    meta: 'var(--neutro)'
  };

  let mesesMostrados = 12;

  function render(cont, ctx) {
    const filas = FP.dominio.historico();
    const conMovimientos = filas.filter(function (f) { return f.nMovimientos > 0; });

    if (!conMovimientos.length) {
      cont.appendChild(el('div', { class: 'tarjeta' }, [
        ui.vacio({
          icono: '📈',
          titulo: 'Todavía no hay histórico',
          texto: 'Cuando tengas movimientos registrados verás aquí la evolución de tus ingresos, ' +
            'gastos y ahorro mes a mes.',
          accion: {
            etiqueta: '＋ Registrar movimiento',
            alHacerClic: function () { FP.formularios.movimiento({ periodo: ctx.periodo, alGuardar: ctx.refrescar }); }
          }
        })
      ]));
      return;
    }

    cont.appendChild(tablaResumen(filas, ctx));

    const serie = FP.dominio.serieMensual(mesesMostrados);
    const etiquetas = serie.map(function (r) { return U.periodoLegible(r.periodo, true); });

    cont.appendChild(el('section', { class: 'tarjeta mt-4' }, [
      ui.cabeceraSeccion('Ingresos y gastos', [selectorRango(ctx)]),
      FP.graficos.columnas({
        etiquetas: etiquetas,
        series: [
          { nombre: 'Ingresos', color: COLORES.ingreso, valores: serie.map(function (r) { return r.ingresos; }) },
          { nombre: 'Gastos', color: COLORES.gasto, valores: serie.map(function (r) { return r.gastos; }) }
        ],
        descripcion: 'Ingresos y gastos de los últimos ' + serie.length + ' meses'
      })
    ]));

    cont.appendChild(el('section', { class: 'tarjeta mt-4' }, [
      el('h2', { class: 'seccion__titulo', style: 'margin-bottom:12px' }, 'Evolución del ahorro'),
      FP.graficos.lineas({
        etiquetas: etiquetas,
        series: [
          { nombre: 'Ahorro real', color: COLORES.ahorro, valores: serie.map(function (r) { return r.ahorroReal; }) },
          {
            nombre: 'Meta de ahorro', color: COLORES.meta, discontinua: true,
            valores: serie.map(function (r) { return r.metaAhorro; })
          }
        ],
        descripcion: 'Ahorro real frente a la meta en los últimos ' + serie.length + ' meses'
      })
    ]));

    cont.appendChild(gastoPorCategoria(ctx));
  }

  function selectorRango(ctx) {
    const select = el('select', {
      style: 'width:auto;min-width:150px',
      'aria-label': 'Meses a mostrar',
      onchange: function (e) { mesesMostrados = Number(e.target.value); ctx.refrescar(); }
    }, [6, 12, 24].map(function (n) {
      return el('option', { value: n, selected: mesesMostrados === n }, 'Últimos ' + n + ' meses');
    }));
    return select;
  }

  /* ------------------------------------------------ Tabla de resumen -- */

  function tablaResumen(filas, ctx) {
    const cuerpo = el('tbody');

    filas.forEach(function (r) {
      const esActual = r.periodo === U.periodoActual();
      const estado = !r.hayMeta ? null : (r.cumpleMeta
        ? ui.distintivo('Meta cumplida', 'exito', '✓')
        : ui.distintivo('No cumplida', 'error', '✕'));

      cuerpo.appendChild(el('tr', null, [
        el('th', { scope: 'row' }, [
          el('button', {
            type: 'button', class: 'enlace', style: 'text-decoration:none;font-weight:650',
            onclick: function () { ctx.cambiarPeriodo(r.periodo); ctx.irA('inicio'); }
          }, U.periodoLegible(r.periodo)),
          esActual ? el('span', { class: 'texto-sm texto-apagado' }, ' (en curso)') : null
        ]),
        el('td', { class: 'num nowrap monto--ingreso' }, FP.dinero.formato(r.ingresos)),
        el('td', { class: 'num nowrap monto--gasto' }, FP.dinero.formato(r.gastos)),
        el('td', {
          class: 'num nowrap',
          style: 'font-weight:700' + (r.ahorroReal < 0 ? ';color:var(--error)' : '')
        }, FP.dinero.formatoSaldo(r.ahorroReal)),
        el('td', { class: 'num nowrap' }, r.hayMeta
          ? FP.dinero.formato(r.metaAhorro)
          : el('span', { class: 'texto-apagado' }, '—')),
        el('td', null, estado || el('span', { class: 'texto-apagado texto-sm' }, 'Sin meta')),
        el('td', null, r.excedidas
          ? ui.distintivo(r.excedidas + ' excedida(s)', 'error', '!')
          : (r.cerca
            ? ui.distintivo(r.cerca + ' cerca del límite', 'advertencia', '⚠')
            : (r.conTope
              ? ui.distintivo('Topes respetados', 'exito', '✓')
              : el('span', { class: 'texto-apagado texto-sm' }, 'Sin topes'))))
      ]));
    });

    return el('section', { class: 'tarjeta' }, [
      ui.cabeceraSeccion('Resumen mensual', [
        el('button', {
          type: 'button', class: 'btn btn--sm',
          onclick: function () { ctx.irA('comparar'); }
        }, 'Comparar meses')
      ]),
      el('div', { class: 'tabla-contenedor' }, [
        el('table', { class: 'tabla' }, [
          el('thead', null, [
            el('tr', null, [
              el('th', { scope: 'col' }, 'Mes'),
              el('th', { scope: 'col', class: 'num' }, 'Ingresos'),
              el('th', { scope: 'col', class: 'num' }, 'Gastos'),
              el('th', { scope: 'col', class: 'num' }, 'Ahorro'),
              el('th', { scope: 'col', class: 'num' }, 'Meta'),
              el('th', { scope: 'col' }, 'Cumplimiento'),
              el('th', { scope: 'col' }, 'Topes')
            ])
          ]),
          cuerpo
        ])
      ])
    ]);
  }

  /* -------------------------------------------- Gasto por categoría --- */

  function gastoPorCategoria(ctx) {
    const periodo = ctx.periodo;
    const totales = FP.dominio.totalesPorCategoria(periodo, 'gasto');
    const anterior = FP.dominio.totalesPorCategoria(U.sumarMeses(periodo, -1), 'gasto');

    const items = [];
    totales.forEach(function (valor, id) {
      const cat = FP.store.categoria(id);
      const previo = anterior.get(id) || 0;
      const delta = valor - previo;
      items.push({
        nombre: cat ? cat.nombre : 'Sin categoría',
        icono: cat ? cat.icono : '❔',
        valor: valor,
        color: 'var(--gasto)',
        secundario: previo
          ? (delta === 0 ? 'Igual que el mes anterior'
            : (delta < 0 ? '↓ ' + FP.dinero.formato(Math.abs(delta)) + ' menos que el mes anterior'
              : '↑ ' + FP.dinero.formato(delta) + ' más que el mes anterior'))
          : 'Sin gasto el mes anterior'
      });
    });

    items.sort(function (a, b) { return b.valor - a.valor; });

    return el('section', { class: 'tarjeta mt-4' }, [
      el('h2', { class: 'seccion__titulo', style: 'margin-bottom:4px' }, 'Gasto por categoría'),
      el('p', { class: 'texto-sm texto-apagado', style: 'margin-bottom:16px' },
        U.periodoLegible(periodo) + ', comparado con el mes anterior.'),
      FP.graficos.barrasHorizontales({ items: items })
    ]);
  }

  return {
    titulo: 'Histórico',
    icono: '📈',
    enNavegacion: true,
    subtitulo: function () {
      const n = FP.dominio.historico().filter(function (r) { return r.nMovimientos > 0; }).length;
      return n ? n + ' mes(es) con información registrada' : 'Sin meses registrados todavía';
    },
    render: render
  };
})();
