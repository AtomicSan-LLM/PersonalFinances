/* ==========================================================================
   S09 — Comparar meses
   Responde: "¿estoy mejorando o empeorando?" (PA-11: dos meses a la vez).
   ========================================================================== */
window.FP = window.FP || {};
FP.vistas = FP.vistas || {};

FP.vistas.comparar = (function () {
  'use strict';

  const U = FP.util;
  const el = U.el;
  const ui = FP.ui;

  let mesA = null;
  let mesB = null;

  function inicializar(ctx) {
    const disponibles = FP.dominio.periodosConDatos();
    if (!mesB || disponibles.indexOf(mesB) < 0) mesB = ctx.periodo;
    if (!mesA || disponibles.indexOf(mesA) < 0 || mesA === mesB) {
      const previo = U.sumarMeses(mesB, -1);
      mesA = disponibles.indexOf(previo) >= 0 ? previo
        : (disponibles.find(function (p) { return p !== mesB; }) || previo);
    }
  }

  function render(cont, ctx) {
    const disponibles = FP.dominio.periodosConDatos();

    if (disponibles.length < 2) {
      cont.appendChild(el('div', { class: 'tarjeta' }, [
        ui.vacio({
          icono: '⚖️',
          titulo: 'Necesitas al menos dos meses con información',
          texto: 'Cuando tengas movimientos en dos meses distintos podrás compararlos aquí ' +
            'y ver si tus finanzas mejoran.',
          accion: {
            etiqueta: 'Ir a movimientos',
            alHacerClic: function () { ctx.irA('movimientos'); }
          }
        })
      ]));
      return;
    }

    inicializar(ctx);
    const datos = FP.dominio.comparar(mesA, mesB, ctx.medioPago, ctx.rango);

    cont.appendChild(selectores(disponibles, ctx));
    if (ctx.rango) {
      cont.appendChild(el('div', { class: 'aviso-medio' },
        '📅 Comparando ' + U.rangoLegible(mesA, ctx.rango, true) + ' de cada uno de los dos meses. ' +
        'La meta de ahorro y su cumplimiento son del mes completo.'));
    }
    if (datos.medio !== 'todos') {
      const m = FP.medios.info(datos.medio);
      cont.appendChild(el('div', { class: 'aviso-medio' },
        m.icono + ' Filtrando los gastos por medio de pago: ' + m.etiqueta +
        '. Ingresos, ahorro real y meta siguen considerando todos los medios de pago.'));
    }
    cont.appendChild(tarjetaResultado(datos));
    cont.appendChild(tarjetaIndicadores(datos));
    cont.appendChild(tarjetaMedios(datos));
    cont.appendChild(tarjetaCategorias(datos));
  }

  function selectores(disponibles, ctx) {
    function select(valor, alCambiar, etiqueta) {
      return el('select', {
        'aria-label': etiqueta,
        onchange: function (e) { alCambiar(e.target.value); ctx.refrescar(); }
      }, disponibles.map(function (p) {
        return el('option', { value: p, selected: p === valor }, U.periodoLegible(p));
      }));
    }

    return el('div', { class: 'tarjeta' }, [
      el('div', { class: 'fila', style: 'gap:16px;align-items:flex-end' }, [
        el('div', { style: 'flex:1;min-width:170px' }, [
          ui.campo({
            etiqueta: 'Mes base', control: select(mesA, function (v) {
              mesA = v;
              /* Si coincide con el otro selector, ese salta al mes disponible
                 más cercano: comparar un mes consigo mismo no tiene sentido. */
              if (mesA === mesB) mesB = U.elegirDistinto(mesB, mesA, disponibles);
            }, 'Mes base')
          })
        ]),
        el('span', { class: 'texto-apagado', style: 'font-weight:700;padding-bottom:22px' }, 'VS'),
        el('div', { style: 'flex:1;min-width:170px' }, [
          ui.campo({
            etiqueta: 'Mes a comparar', control: select(mesB, function (v) {
              mesB = v;
              if (mesB === mesA) mesA = U.elegirDistinto(mesA, mesB, disponibles);
            }, 'Mes a comparar')
          })
        ]),
        el('button', {
          type: 'button', class: 'btn', style: 'margin-bottom:16px',
          onclick: function () { const t = mesA; mesA = mesB; mesB = t; ctx.refrescar(); }
        }, '⇄ Invertir')
      ])
    ]);
  }

  /* --------------------------------------------------- Resultado ------ */

  function conSigno(n) { return (n > 0 ? '+' : '') + FP.dinero.formatoSaldo(n); }

  /** Diferencia de ahorro (mes a comparar − mes base) con las de ingresos y gastos. */
  function tarjetaResultado(datos) {
    const ind = function (clave) { return datos.indicadores.find(function (i) { return i.clave === clave; }); };
    const ahorro = ind('ahorro');
    const veredicto = ahorro.delta > 0
      ? 'Ahorraste ' + FP.dinero.formato(ahorro.delta) + ' más en ' + U.periodoLegible(datos.b.periodo) + '.'
      : (ahorro.delta < 0
        ? 'Ahorraste ' + FP.dinero.formato(Math.abs(ahorro.delta)) + ' menos en ' + U.periodoLegible(datos.b.periodo) + '.'
        : 'Ahorraste exactamente lo mismo en los dos meses.');

    return ui.tarjetaSaldo({
      compacta: true,
      ariaLabel: 'Resultado de la comparación',
      etiqueta: 'Cambio en el ahorro · ' + U.periodoLegible(datos.b.periodo, true) + ' vs ' + U.periodoLegible(datos.a.periodo, true),
      cifra: conSigno(ahorro.delta),
      pie: veredicto,
      items: [
        { etiqueta: 'Cambio en ingresos', icono: '↑', cifra: conSigno(ind('ingresos').delta) },
        { etiqueta: 'Cambio en gastos', icono: '↓', cifra: conSigno(ind('gastos').delta) }
      ]
    });
  }

  /* ------------------------------------------------- Indicadores ------ */

  function tarjetaIndicadores(datos) {
    const cuerpo = el('tbody');

    datos.indicadores.forEach(function (ind) {
      cuerpo.appendChild(el('tr', null, [
        el('th', { scope: 'row' }, ind.etiqueta),
        el('td', { class: 'num nowrap' }, FP.dinero.formatoSaldo(ind.a)),
        el('td', { class: 'num nowrap', style: 'font-weight:650' }, FP.dinero.formatoSaldo(ind.b)),
        el('td', { class: 'num nowrap' }, cambio(ind))
      ]));
    });

    cuerpo.appendChild(el('tr', null, [
      el('th', { scope: 'row' }, datos.cumplimiento.etiqueta),
      el('td', { class: 'num' }, marcaMeta(datos.cumplimiento.a, datos.cumplimiento.aOk)),
      el('td', { class: 'num' }, marcaMeta(datos.cumplimiento.b, datos.cumplimiento.bOk)),
      el('td', { class: 'num' }, el('span', { class: 'texto-apagado' }, '—'))
    ]));

    return el('section', { class: 'tarjeta mt-4' }, [
      ui.cabeceraSeccion('Indicadores'),
      el('div', { class: 'tabla-contenedor' }, [
        ui.apilarTabla(el('table', { class: 'tabla' }, [
          el('thead', null, [
            el('tr', null, [
              el('th', { scope: 'col' }, 'Indicador'),
              el('th', { scope: 'col', class: 'num' }, U.periodoLegible(datos.a.periodo)),
              el('th', { scope: 'col', class: 'num' }, U.periodoLegible(datos.b.periodo)),
              el('th', { scope: 'col', class: 'num' }, 'Cambio')
            ])
          ]),
          cuerpo
        ]))
      ])
    ]);
  }

  function cambio(ind) {
    if (ind.delta === 0) return el('span', { class: 'texto-apagado' }, 'Sin cambio');

    const flecha = ind.delta > 0 ? '↑' : '↓';
    const color = ind.tendencia === 'mejor' ? 'var(--exito)'
      : (ind.tendencia === 'peor' ? 'var(--error)' : 'var(--texto-2)');
    const pct = ind.variacion === null ? null : U.formatoPorcentaje(ind.variacion, 1);

    return el('span', { style: 'color:' + color + ';font-weight:650' }, [
      el('span', { 'aria-hidden': 'true' }, flecha + ' '),
      pct ? pct : FP.dinero.formatoSaldo(ind.delta),
      el('span', { class: 'visualmente-oculto' },
        ind.tendencia === 'mejor' ? ' (mejora)' : (ind.tendencia === 'peor' ? ' (empeora)' : ''))
    ]);
  }

  function marcaMeta(texto, ok) {
    if (texto === '—') return el('span', { class: 'texto-apagado' }, 'Sin meta');
    return ui.distintivo(texto, ok ? 'exito' : 'error', ok ? '✓' : '✕');
  }

  /* ------------------------------------------- Medios de pago --------- */

  /** Gasto por medio de pago de ambos meses; el total coincide con "Gastos". */
  function tarjetaMedios(datos) {
    const filas = datos.medios.filter(function (f) { return f.a || f.b; });
    if (!filas.length) return el('div');

    const cuerpo = el('tbody');
    filas.forEach(function (f) {
      cuerpo.appendChild(el('tr', null, [
        el('th', { scope: 'row' }, [el('span', { 'aria-hidden': 'true' }, f.icono + ' '), f.etiqueta]),
        el('td', { class: 'num nowrap' }, FP.dinero.formato(f.a)),
        el('td', { class: 'num nowrap' }, FP.dinero.formato(f.b)),
        el('td', { class: 'num nowrap' }, cambio(f))
      ]));
    });

    const delta = datos.b.gastos - datos.a.gastos;
    const totalInd = {
      delta: delta, variacion: U.variacion(datos.a.gastos, datos.b.gastos),
      tendencia: delta === 0 ? 'igual' : (delta < 0 ? 'mejor' : 'peor')
    };
    cuerpo.appendChild(el('tr', null, [
      el('th', { scope: 'row', style: 'font-weight:800' }, 'Total gastos'),
      el('td', { class: 'num nowrap', style: 'font-weight:700' }, FP.dinero.formato(datos.a.gastos)),
      el('td', { class: 'num nowrap', style: 'font-weight:700' }, FP.dinero.formato(datos.b.gastos)),
      el('td', { class: 'num nowrap' }, cambio(totalInd))
    ]));

    return el('section', { class: 'tarjeta mt-4' }, [
      el('h2', { class: 'seccion__titulo', style: 'margin-bottom:12px' }, 'Gastos por medio de pago'),
      el('div', { class: 'tabla-contenedor' }, [
        ui.apilarTabla(el('table', { class: 'tabla' }, [
          el('thead', null, [
            el('tr', null, [
              el('th', { scope: 'col' }, 'Medio de pago'),
              el('th', { scope: 'col', class: 'num' }, U.periodoLegible(datos.a.periodo)),
              el('th', { scope: 'col', class: 'num' }, U.periodoLegible(datos.b.periodo)),
              el('th', { scope: 'col', class: 'num' }, 'Cambio')
            ])
          ]),
          cuerpo
        ]))
      ]),
      el('p', { class: 'campo__ayuda mt-3' },
        'Los medios suman el total de gastos de cada mes (incluye "Sin especificar").')
    ]);
  }

  /* -------------------------------------------------- Categorías ------ */

  function tarjetaCategorias(datos) {
    const sufijo = datos.medio !== 'todos' ? ' · ' + FP.medios.info(datos.medio).etiqueta : '';
    if (!datos.categorias.length) {
      return el('section', { class: 'tarjeta mt-4' }, [
        el('h2', { class: 'seccion__titulo' }, 'Gasto por categoría' + sufijo),
        el('p', { class: 'texto-apagado mt-3' }, 'No hay gastos registrados en ninguno de los dos meses.')
      ]);
    }

    const cuerpo = el('tbody');
    datos.categorias.forEach(function (c) {
      const color = c.tendencia === 'mejor' ? 'var(--exito)'
        : (c.tendencia === 'peor' ? 'var(--error)' : 'var(--texto-2)');

      cuerpo.appendChild(el('tr', null, [
        el('th', { scope: 'row' }, el('span', { class: 'tabla__categoria' }, [
          el('span', { class: 'movimiento__marca movimiento__marca--gasto', 'aria-hidden': 'true' }, c.icono || '📦'),
          c.nombre
        ])),
        el('td', { class: 'num nowrap' }, FP.dinero.formato(c.a)),
        el('td', { class: 'num nowrap' }, FP.dinero.formato(c.b)),
        el('td', { class: 'num nowrap', style: 'color:' + color + ';font-weight:650' }, [
          el('span', { 'aria-hidden': 'true' }, c.delta === 0 ? '=' : (c.delta > 0 ? '↑' : '↓')),
          ' ' + (c.delta === 0 ? 'Igual' : FP.dinero.formato(Math.abs(c.delta))),
          el('span', { class: 'visualmente-oculto' },
            c.delta > 0 ? ' más de gasto' : (c.delta < 0 ? ' menos de gasto' : ''))
        ])
      ]));
    });

    return el('section', { class: 'tarjeta mt-4' }, [
      el('h2', { class: 'seccion__titulo', style: 'margin-bottom:12px' }, 'Gasto por categoría' + sufijo),
      el('div', { class: 'tabla-contenedor' }, [
        ui.apilarTabla(el('table', { class: 'tabla' }, [
          el('thead', null, [
            el('tr', null, [
              el('th', { scope: 'col' }, 'Categoría'),
              el('th', { scope: 'col', class: 'num' }, U.periodoLegible(datos.a.periodo)),
              el('th', { scope: 'col', class: 'num' }, U.periodoLegible(datos.b.periodo)),
              el('th', { scope: 'col', class: 'num' }, 'Diferencia')
            ])
          ]),
          cuerpo
        ]))
      ]),
      el('p', { class: 'campo__ayuda mt-3' },
        'Se ordenan por el tamaño del cambio, para que veas primero dónde se movió más tu dinero.')
    ]);
  }

  return {
    titulo: 'Comparar',
    icono: '⚖️',
    enNavegacion: false,
    ocultarSelectorMes: true,
    usaFiltroMedio: true,
    usaRangoDias: true,
    rangoPorMes: true,
    subtitulo: function () { return '¿Estoy mejorando o empeorando?'; },
    render: render
  };
})();
