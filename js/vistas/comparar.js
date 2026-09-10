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
    const datos = FP.dominio.comparar(mesA, mesB);

    cont.appendChild(selectores(disponibles, ctx));
    cont.appendChild(tarjetaIndicadores(datos));
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
          ui.campo({ etiqueta: 'Mes base', control: select(mesA, function (v) { mesA = v; }, 'Mes base') })
        ]),
        el('span', { class: 'texto-apagado', style: 'font-weight:700;padding-bottom:22px' }, 'VS'),
        el('div', { style: 'flex:1;min-width:170px' }, [
          ui.campo({ etiqueta: 'Mes a comparar', control: select(mesB, function (v) { mesB = v; }, 'Mes a comparar') })
        ]),
        el('button', {
          type: 'button', class: 'btn', style: 'margin-bottom:16px',
          onclick: function () { const t = mesA; mesA = mesB; mesB = t; ctx.refrescar(); }
        }, '⇄ Invertir')
      ])
    ]);
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
      el('td', null, marcaMeta(datos.cumplimiento.a, datos.cumplimiento.aOk)),
      el('td', null, marcaMeta(datos.cumplimiento.b, datos.cumplimiento.bOk)),
      el('td', null, el('span', { class: 'texto-apagado' }, '—'))
    ]));

    const ahorro = datos.indicadores.find(function (i) { return i.clave === 'ahorro'; });
    const veredicto = ahorro.delta > 0
      ? { texto: 'Ahorraste ' + FP.dinero.formato(ahorro.delta) + ' más en ' + U.periodoLegible(datos.b.periodo) + '.', sev: 'exito' }
      : (ahorro.delta < 0
        ? { texto: 'Ahorraste ' + FP.dinero.formato(Math.abs(ahorro.delta)) + ' menos en ' + U.periodoLegible(datos.b.periodo) + '.', sev: 'advertencia' }
        : { texto: 'Ahorraste exactamente lo mismo en los dos meses.', sev: 'neutro' });

    return el('section', { class: 'tarjeta mt-4' }, [
      ui.cabeceraSeccion('Indicadores', [ui.distintivo(veredicto.texto, veredicto.sev)]),
      el('div', { class: 'tabla-contenedor' }, [
        el('table', { class: 'tabla' }, [
          el('thead', null, [
            el('tr', null, [
              el('th', { scope: 'col' }, 'Indicador'),
              el('th', { scope: 'col', class: 'num' }, U.periodoLegible(datos.a.periodo)),
              el('th', { scope: 'col', class: 'num' }, U.periodoLegible(datos.b.periodo)),
              el('th', { scope: 'col', class: 'num' }, 'Cambio')
            ])
          ]),
          cuerpo
        ])
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

  /* -------------------------------------------------- Categorías ------ */

  function tarjetaCategorias(datos) {
    if (!datos.categorias.length) {
      return el('section', { class: 'tarjeta mt-4' }, [
        el('h2', { class: 'seccion__titulo' }, 'Gasto por categoría'),
        el('p', { class: 'texto-apagado mt-3' }, 'No hay gastos registrados en ninguno de los dos meses.')
      ]);
    }

    const cuerpo = el('tbody');
    datos.categorias.forEach(function (c) {
      const color = c.tendencia === 'mejor' ? 'var(--exito)'
        : (c.tendencia === 'peor' ? 'var(--error)' : 'var(--texto-2)');

      cuerpo.appendChild(el('tr', null, [
        el('th', { scope: 'row' }, [
          c.icono ? el('span', { 'aria-hidden': 'true' }, c.icono + ' ') : null, c.nombre
        ]),
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
      el('h2', { class: 'seccion__titulo', style: 'margin-bottom:12px' }, 'Gasto por categoría'),
      el('div', { class: 'tabla-contenedor' }, [
        el('table', { class: 'tabla' }, [
          el('thead', null, [
            el('tr', null, [
              el('th', { scope: 'col' }, 'Categoría'),
              el('th', { scope: 'col', class: 'num' }, U.periodoLegible(datos.a.periodo)),
              el('th', { scope: 'col', class: 'num' }, U.periodoLegible(datos.b.periodo)),
              el('th', { scope: 'col', class: 'num' }, 'Diferencia')
            ])
          ]),
          cuerpo
        ])
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
    subtitulo: function () { return '¿Estoy mejorando o empeorando?'; },
    render: render
  };
})();
