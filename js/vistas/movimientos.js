/* ==========================================================================
   S02 — Movimientos
   Consultar, filtrar, editar y eliminar los movimientos del mes.
   En escritorio se usa tabla; en móvil, tarjetas compactas.
   ========================================================================== */
window.FP = window.FP || {};
FP.vistas = FP.vistas || {};

FP.vistas.movimientos = (function () {
  'use strict';

  const U = FP.util;
  const el = U.el;
  const ui = FP.ui;

  /* Los filtros se conservan mientras dure la sesión de navegación. */
  const filtros = { tipo: 'todos', categoriaId: 'todas', texto: '' };

  function render(cont, ctx) {
    const periodo = ctx.periodo;

    /* Parámetros de navegación (por ejemplo, al venir de un aviso). */
    if (ctx.params && ctx.params.categoriaId) filtros.categoriaId = ctx.params.categoriaId;
    if (ctx.params && ctx.params.tipo) filtros.tipo = ctx.params.tipo;

    /* Si la categoría filtrada ya no existe, se vuelve a "todas". */
    if (filtros.categoriaId !== 'todas' && !FP.store.categoria(filtros.categoriaId)) {
      filtros.categoriaId = 'todas';
    }

    const lista = el('div');

    cont.appendChild(barraFiltros(periodo, function () { pintar(lista, periodo, ctx); }));
    cont.appendChild(lista);
    pintar(lista, periodo, ctx);
  }

  /* ------------------------------------------------------- Filtros ---- */

  function barraFiltros(periodo, alCambiar) {
    const grupo = el('div', { class: 'grupo-segmentado', role: 'group', 'aria-label': 'Filtrar por tipo' });
    [['todos', 'Todos'], ['ingreso', 'Ingresos'], ['gasto', 'Gastos']].forEach(function (par) {
      grupo.appendChild(el('button', {
        type: 'button',
        dataset: { tipo: par[0] },
        'aria-pressed': String(filtros.tipo === par[0]),
        onclick: function () {
          filtros.tipo = par[0];
          U.$$('button', grupo).forEach(function (b) {
            b.setAttribute('aria-pressed', String(b.dataset.tipo === filtros.tipo));
          });
          alCambiar();
        }
      }, par[1]));
    });

    const selCat = el('select', {
      onchange: function (e) { filtros.categoriaId = e.target.value; alCambiar(); }
    }, [el('option', { value: 'todas' }, 'Todas las categorías')].concat(
      FP.store.state.categorias
        .slice()
        .sort(function (a, b) { return a.tipo.localeCompare(b.tipo) || a.nombre.localeCompare(b.nombre, 'es'); })
        .map(function (c) {
          return el('option', {
            value: c.id, selected: filtros.categoriaId === c.id
          }, (c.icono ? c.icono + '  ' : '') + c.nombre + ' · ' + (c.tipo === 'ingreso' ? 'Ingreso' : 'Gasto'));
        })
    ));

    const buscar = el('input', {
      type: 'search', value: filtros.texto,
      placeholder: 'Buscar por descripción o categoría…',
      oninput: U.debounce(function (e) { filtros.texto = e.target.value; alCambiar(); }, 250)
    });

    const limpiar = el('button', {
      type: 'button', class: 'btn',
      onclick: function () {
        filtros.tipo = 'todos'; filtros.categoriaId = 'todas'; filtros.texto = '';
        FP.app.refrescar();
      }
    }, 'Limpiar filtros');

    const hayFiltro = filtros.tipo !== 'todos' || filtros.categoriaId !== 'todas' || filtros.texto;

    return el('div', { class: 'filtros' }, [
      ui.campo({ etiqueta: 'Tipo', control: grupo }),
      ui.campo({ etiqueta: 'Categoría', control: selCat }),
      el('div', { class: 'filtros__buscar' }, [
        ui.campo({ etiqueta: 'Buscar', control: buscar })
      ]),
      hayFiltro ? limpiar : null
    ]);
  }

  /* --------------------------------------------------------- Lista ---- */

  function pintar(cont, periodo, ctx) {
    U.vaciar(cont);
    const movs = FP.dominio.filtrarMovimientos(periodo, filtros);

    const ingresos = U.suma(movs.filter(function (m) { return m.tipo === 'ingreso'; }), function (m) { return m.monto; });
    const gastos = U.suma(movs.filter(function (m) { return m.tipo === 'gasto'; }), function (m) { return m.monto; });

    cont.appendChild(el('div', { class: 'fila fila--entre mt-3', style: 'margin-bottom:12px' }, [
      el('p', { class: 'texto-sm texto-apagado' },
        movs.length === 0 ? 'Ningún movimiento coincide'
          : movs.length + ' movimiento' + (movs.length === 1 ? '' : 's')),
      el('p', { class: 'texto-sm num' }, [
        el('span', { class: 'monto--ingreso', style: 'font-weight:700' }, '+' + FP.dinero.formato(ingresos)),
        el('span', { class: 'texto-apagado' }, '   ·   '),
        el('span', { class: 'monto--gasto', style: 'font-weight:700' }, '-' + FP.dinero.formato(gastos)),
        el('span', { class: 'texto-apagado' }, '   ·   '),
        el('span', { style: 'font-weight:700' }, FP.dinero.formatoSaldo(ingresos - gastos))
      ])
    ]));

    const tarjeta = el('div', { class: 'tarjeta' });

    if (!movs.length) {
      const hayEnElMes = FP.dominio.movimientosDe(periodo).length > 0;
      tarjeta.appendChild(ui.vacio({
        icono: hayEnElMes ? '🔍' : '🧾',
        titulo: hayEnElMes
          ? 'Ningún movimiento coincide con los filtros'
          : 'Aún no tienes movimientos en ' + U.periodoLegible(periodo),
        texto: hayEnElMes
          ? 'Prueba a quitar algún filtro o a cambiar el texto de búsqueda.'
          : 'Registra tu primer ingreso o gasto para empezar a controlar tus finanzas.',
        accion: hayEnElMes ? {
          etiqueta: 'Limpiar filtros',
          alHacerClic: function () {
            filtros.tipo = 'todos'; filtros.categoriaId = 'todas'; filtros.texto = '';
            FP.app.refrescar();
          }
        } : {
          etiqueta: '＋ Registrar movimiento',
          alHacerClic: function () { FP.formularios.movimiento({ periodo: periodo, alGuardar: ctx.refrescar }); }
        }
      }));
    } else if (FP.app.esMovil()) {
      movs.forEach(function (m) { tarjeta.appendChild(fila(m, ctx)); });
    } else {
      tarjeta.appendChild(tabla(movs, ctx));
    }

    cont.appendChild(tarjeta);
  }

  function fila(m, ctx) {
    return ui.filaMovimiento(m, {
      alEditar: function (mov) { FP.formularios.movimiento({ movimiento: mov, alGuardar: ctx.refrescar }); },
      alEliminar: function (mov) { FP.acciones.eliminarMovimiento(mov, ctx.refrescar); },
      alRevisar: function (mov) { FP.acciones.marcarRevisado(mov); }
    });
  }

  /* --------------------------------------------------------- Tabla ---- */

  function tabla(movs, ctx) {
    const cuerpo = el('tbody');

    movs.forEach(function (m) {
      const cat = FP.store.categoria(m.categoriaId);
      const esIngreso = m.tipo === 'ingreso';

      cuerpo.appendChild(el('tr', null, [
        el('td', { class: 'nowrap' }, U.fechaCorta(m.fecha)),
        el('td', null, ui.distintivo(esIngreso ? 'Ingreso' : 'Gasto', esIngreso ? 'ingreso' : 'gasto',
          esIngreso ? '↑' : '↓')),
        el('td', { class: 'nowrap' }, [
          cat && cat.icono ? el('span', { 'aria-hidden': 'true' }, cat.icono + ' ') : null,
          cat ? cat.nombre : 'Sin categoría'
        ]),
        el('td', null, [
          el('div', null, m.descripcion || el('span', { class: 'texto-apagado' }, '—')),
          (m.recurrenteId || m.recurrenteOrigen || m.revisar)
            ? el('div', { class: 'fila', style: 'gap:6px;margin-top:4px' }, [
              (m.recurrenteId || m.recurrenteOrigen) ? ui.distintivo('Generado por recurrente', 'info', '🔁') : null,
              m.revisar ? ui.distintivo('Por revisar', 'advertencia', '👁') : null
            ])
            : null
        ]),
        el('td', { class: 'num nowrap monto--' + m.tipo, style: 'font-weight:700' },
          FP.dinero.formatoConSigno(m.monto, m.tipo)),
        el('td', { style: 'width:44px' }, ui.menuAcciones([
          {
            etiqueta: 'Editar', icono: '✏️',
            alHacerClic: function () { FP.formularios.movimiento({ movimiento: m, alGuardar: ctx.refrescar }); }
          },
          m.revisar ? {
            etiqueta: 'Marcar como revisado', icono: '✓',
            alHacerClic: function () { FP.acciones.marcarRevisado(m); }
          } : null,
          {
            etiqueta: 'Eliminar', icono: '🗑', peligro: true,
            alHacerClic: function () { FP.acciones.eliminarMovimiento(m, ctx.refrescar); }
          }
        ], 'Acciones del movimiento ' + (m.descripcion || U.fechaCorta(m.fecha))))
      ]));
    });

    return el('div', { class: 'tabla-contenedor' }, [
      el('table', { class: 'tabla' }, [
        el('thead', null, [
          el('tr', null, [
            el('th', { scope: 'col' }, 'Fecha'),
            el('th', { scope: 'col' }, 'Tipo'),
            el('th', { scope: 'col' }, 'Categoría'),
            el('th', { scope: 'col' }, 'Descripción'),
            el('th', { scope: 'col', class: 'num' }, 'Monto'),
            el('th', { scope: 'col' }, el('span', { class: 'visualmente-oculto' }, 'Acciones'))
          ])
        ]),
        cuerpo
      ])
    ]);
  }

  return {
    titulo: 'Movimientos',
    icono: '📋',
    enNavegacion: true,
    filtros: filtros,
    subtitulo: function (ctx) {
      return 'Ingresos y gastos de ' + U.periodoLegible(ctx.periodo);
    },
    render: render
  };
})();
