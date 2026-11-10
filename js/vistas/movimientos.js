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

    if (FP.app.esMovil()) { renderMovil(cont, periodo, ctx); return; }

    const lista = el('div');
    const barra = barraFiltros(periodo, ctx, function () { pintar(lista, periodo, ctx, elegirTipo); });

    /* Los botones de la tarjeta resumen usan el mismo filtro de tipo que la barra:
       tocar el ya elegido vuelve a «Todos». */
    function elegirTipo(tipo) {
      const destino = filtros.tipo === tipo ? 'todos' : tipo;
      barra.querySelector('[data-tipo="' + destino + '"]').click();
    }

    cont.appendChild(barra);
    cont.appendChild(lista);
    pintar(lista, periodo, ctx, elegirTipo);
  }

  /* ------------------------------------------------------- Filtros ---- */

  function barraFiltros(periodo, ctx, alCambiar) {
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
      onclick: function () { limpiarFiltros(ctx); }
    }, 'Limpiar filtros');

    return el('div', { class: 'tarjeta filtros' }, [
      ui.campo({ etiqueta: 'Tipo', control: grupo }),
      ui.campo({ etiqueta: 'Categoría', control: selCat }),
      el('div', { class: 'filtros__buscar' }, [
        ui.campo({ etiqueta: 'Buscar', control: buscar })
      ]),
      hayFiltro(ctx) ? limpiar : null
    ]);
  }

  function hayFiltro(ctx) {
    return filtros.tipo !== 'todos' || filtros.categoriaId !== 'todas' || !!filtros.texto ||
      ctx.medioPago !== 'todos';
  }

  function limpiarFiltros(ctx) {
    filtros.tipo = 'todos'; filtros.categoriaId = 'todas'; filtros.texto = '';
    buscarAbierto = false;
    if (ctx.medioPago !== 'todos') ctx.cambiarMedioPago('todos'); else FP.app.refrescar();
  }

  /* ------------------------------------------------------ Teléfono ---- */

  /* La búsqueda se despliega con la lupa; se recuerda mientras dure la sesión. */
  let buscarAbierto = false;

  const ICONO_LUPA = '<svg class="icono-linea" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>';

  /**
   * Teléfono: resumen → fila de chips (tipo, categoría, lupa) → lista agrupada por
   * día. El campo de búsqueda no se repinta para que no pierda el foco al escribir.
   */
  function renderMovil(cont, periodo, ctx) {
    const zonaResumen = el('div');
    const zonaChips = el('div');
    const zonaLista = el('div', { class: 'dias' });

    const buscar = el('input', {
      type: 'search', value: filtros.texto, 'aria-label': 'Buscar movimientos',
      placeholder: 'Buscar por descripción o categoría…',
      oninput: U.debounce(function (e) { filtros.texto = e.target.value; repintar(); }, 250)
    });
    const cajaBuscar = el('div', { class: 'buscar-movil' }, [buscar]);
    if (filtros.texto) buscarAbierto = true;
    cajaBuscar.hidden = !buscarAbierto;

    function elegirTipo(tipo) {
      filtros.tipo = filtros.tipo === tipo ? 'todos' : tipo;
      repintar();
    }

    function chip(clave, contenido, atributos, alPulsar) {
      return el('button', Object.assign({
        type: 'button', class: 'chip', dataset: { chip: clave }, onclick: alPulsar
      }, atributos), contenido);
    }

    function pintarChips() {
      const anterior = zonaChips.firstChild;
      const desplazado = anterior ? anterior.scrollLeft : 0;
      const conFoco = document.activeElement && zonaChips.contains(document.activeElement)
        ? document.activeElement.dataset.chip : null;
      const cat = filtros.categoriaId !== 'todas' ? FP.store.categoria(filtros.categoriaId) : null;

      const lupa = chip('buscar', null, {
        class: 'chip chip--icono', 'aria-label': 'Buscar', 'aria-expanded': String(buscarAbierto),
        'aria-pressed': String(!!filtros.texto)
      }, function () {
        buscarAbierto = !buscarAbierto;
        cajaBuscar.hidden = !buscarAbierto;
        if (buscarAbierto) buscar.focus();
        else if (filtros.texto) { filtros.texto = ''; buscar.value = ''; }
        repintar();
      });
      lupa.innerHTML = ICONO_LUPA;

      /* La lupa va primero para que siempre quede a la vista; el resto se desliza. */
      const fila = el('div', { class: 'chips', role: 'group', 'aria-label': 'Filtros' },
        [lupa].concat([['todos', 'Todos'], ['ingreso', 'Ingresos'], ['gasto', 'Gastos']].map(function (par) {
          return chip(par[0], par[1], {
            dataset: { chip: par[0], tipo: par[0] }, 'aria-pressed': String(filtros.tipo === par[0])
          }, function () { filtros.tipo = par[0]; repintar(); });
        })).concat([
          chip('categoria', [
            cat ? (cat.icono ? cat.icono + ' ' : '') + cat.nombre : 'Categoría',
            el('span', { class: 'chip__flecha', 'aria-hidden': 'true' }, '▾')
          ], {
            'aria-pressed': String(!!cat), 'aria-haspopup': 'dialog',
            'aria-label': cat ? 'Categoría: ' + cat.nombre + '. Cambiar' : 'Filtrar por categoría'
          }, elegirCategoria),
          hayFiltro(ctx) ? chip('limpiar', '✕ Limpiar', { class: 'chip chip--limpiar' },
            function () { limpiarFiltros(ctx); }) : null
        ]));

      U.vaciar(zonaChips);
      zonaChips.appendChild(fila);
      fila.scrollLeft = desplazado;
      if (conFoco) {
        const b = fila.querySelector('[data-chip="' + conFoco + '"]') || fila.querySelector('.chip');
        if (b) b.focus({ preventScroll: true });
      }
    }

    /* Hoja inferior con las categorías; la elegida queda marcada. */
    function elegirCategoria() {
      let hoja = null;
      function opcion(id, icono, nombre) {
        const elegida = filtros.categoriaId === id;
        return el('button', {
          type: 'button', class: 'lista-acciones__item', 'aria-pressed': String(elegida),
          onclick: function () { filtros.categoriaId = id; hoja.cerrar(); repintar(); }
        }, [
          el('span', { class: 'lista-acciones__icono', 'aria-hidden': 'true' }, icono || '•'),
          el('span', { class: 'lista-acciones__texto' }, nombre),
          elegida ? el('span', { class: 'lista-acciones__marca', 'aria-hidden': 'true' }, '✓') : null
        ]);
      }
      const nodos = [opcion('todas', '🗂', 'Todas las categorías')];
      [['gasto', 'Gastos'], ['ingreso', 'Ingresos']].forEach(function (par) {
        const cats = FP.store.state.categorias
          .filter(function (c) { return c.tipo === par[0]; })
          .sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); });
        if (!cats.length) return;
        nodos.push(el('h3', { class: 'lista-acciones__grupo' }, par[1]));
        cats.forEach(function (c) { nodos.push(opcion(c.id, c.icono, c.nombre)); });
      });
      hoja = ui.dialogo({
        titulo: 'Categoría', clase: 'dialogo--acciones',
        contenido: el('div', { class: 'lista-acciones' }, nodos)
      });
    }

    function pintarLista(movs) {
      U.vaciar(zonaLista);
      if (!movs.length) {
        zonaLista.appendChild(el('div', { class: 'tarjeta' }, [estadoVacio(periodo, ctx)]));
        return;
      }
      FP.dominio.agruparPorDia(movs).forEach(function (g) {
        /* Subtotal: lo gastado ese día; si no hubo gastos, lo que entró. */
        const subtotal = g.gastos ? FP.dinero.formatoConSigno(g.gastos, 'gasto')
          : (g.ingresos ? FP.dinero.formatoConSigno(g.ingresos, 'ingreso') : '');
        const nombre = U.diaRelativo(g.fecha);
        const tarjeta = el('div', { class: 'tarjeta dia__tarjeta' });
        g.movimientos.forEach(function (m) { tarjeta.appendChild(fila(m, ctx, true)); });
        zonaLista.appendChild(el('section', { class: 'dia', 'aria-label': nombre }, [
          el('div', { class: 'dia__cabecera' }, [
            el('h2', { class: 'dia__titulo' }, nombre),
            subtotal ? el('span', {
              class: 'dia__subtotal',
              'aria-label': (g.gastos ? 'Gastado: ' : 'Ingresos: ') + subtotal
            }, subtotal) : null
          ]),
          tarjeta
        ]));
      });
    }

    function repintar() {
      const movs = movimientosFiltrados(periodo, ctx);
      U.vaciar(zonaResumen);
      pintarResumen(zonaResumen, movs, periodo, ctx, elegirTipo);
      pintarChips();
      pintarLista(movs);
    }

    U.agregar(cont, [zonaResumen, zonaChips, cajaBuscar, zonaLista]);
    repintar();
  }

  /* --------------------------------------------------------- Lista ---- */

  function movimientosFiltrados(periodo, ctx) {
    return FP.dominio.filtrarMovimientos(periodo,
      Object.assign({}, filtros, { medioPago: ctx.medioPago || 'todos', rango: ctx.rango }));
  }

  function pintar(cont, periodo, ctx, elegirTipo) {
    U.vaciar(cont);
    const movs = movimientosFiltrados(periodo, ctx);
    pintarResumen(cont, movs, periodo, ctx, elegirTipo);

    const tarjeta = el('div', { class: 'tarjeta mt-4' });

    if (!movs.length) {
      tarjeta.appendChild(estadoVacio(periodo, ctx));
    } else if (FP.app.usaTarjetas()) {
      movs.forEach(function (m) { tarjeta.appendChild(fila(m, ctx)); });
    } else {
      tarjeta.appendChild(tabla(movs, ctx));
    }

    cont.appendChild(tarjeta);
  }

  /** Avisos de rango/medio de pago y tarjeta resumen de lo que se está viendo. */
  function pintarResumen(cont, movs, periodo, ctx, elegirTipo) {
    const medio = ctx.medioPago || 'todos';

    if (ctx.rango) {
      cont.appendChild(el('div', { class: 'aviso-medio' },
        '📅 Mostrando solo los movimientos ' + U.rangoLegible(periodo, ctx.rango) + '.'));
    }

    if (medio !== 'todos') {
      cont.appendChild(el('div', { class: 'aviso-medio' },
        FP.medios.info(medio).icono + ' Mostrando solo gastos con medio de pago: ' + FP.medios.info(medio).etiqueta +
        '. Los ingresos no tienen medio de pago, por eso no aparecen.'));
    }

    const ingresos = U.suma(movs.filter(function (m) { return m.tipo === 'ingreso'; }), function (m) { return m.monto; });
    /* Las transferencias (p. ej. pago de tarjeta) se listan, pero no suman al gasto. */
    const gastos = U.suma(movs.filter(function (m) { return m.tipo === 'gasto' && !FP.dominio.esTransferencia(m); }),
      function (m) { return m.monto; });
    const nTransferencias = movs.filter(function (m) { return FP.dominio.esTransferencia(m); }).length;

    const cuenta = movs.length === 0 ? 'Ningún movimiento coincide'
      : movs.length + ' movimiento' + (movs.length === 1 ? '' : 's') +
        (nTransferencias ? ' (' + nTransferencias + ' sin contar como gasto)' : '');

    cont.appendChild(medio !== 'todos'
      ? ui.tarjetaSaldo({
        compacta: true,
        etiqueta: 'Gastos con ' + FP.medios.info(medio).etiqueta + ' · ' + U.rangoLegible(periodo, ctx.rango),
        cifra: '-' + FP.dinero.formato(gastos),
        pie: cuenta
      })
      : ui.tarjetaSaldo({
        compacta: true,
        etiqueta: 'Saldo · ' + U.rangoLegible(periodo, ctx.rango),
        cifra: FP.dinero.formatoSaldo(ingresos - gastos),
        pie: cuenta,
        items: [
          { etiqueta: 'Ingresos', icono: '↑', monto: ingresos, presionado: filtros.tipo === 'ingreso',
            accion: 'Mostrar solo ingresos', alHacerClic: function () { elegirTipo('ingreso'); } },
          { etiqueta: 'Gastos', icono: '↓', monto: gastos, presionado: filtros.tipo === 'gasto',
            accion: 'Mostrar solo gastos', alHacerClic: function () { elegirTipo('gasto'); } }
        ]
      }));
  }

  function estadoVacio(periodo, ctx) {
      const hayEnElMes = FP.dominio.movimientosDe(periodo).length > 0;
      return ui.vacio({
        icono: hayEnElMes ? '🔍' : '🧾',
        titulo: hayEnElMes
          ? 'Ningún movimiento coincide con los filtros'
          : 'Aún no tienes movimientos en ' + U.periodoLegible(periodo),
        texto: hayEnElMes
          ? 'Prueba a quitar algún filtro, a cambiar el texto de búsqueda' +
            (ctx.rango ? ' o a ampliar el rango de días.' : '.')
          : 'Registra tu primer ingreso o gasto para empezar a controlar tus finanzas.',
        accion: hayEnElMes ? {
          etiqueta: 'Limpiar filtros',
          alHacerClic: function () { limpiarFiltros(ctx); }
        } : {
          etiqueta: '＋ Registrar movimiento',
          alHacerClic: function () { FP.formularios.movimiento({ periodo: periodo, alGuardar: ctx.refrescar }); }
        }
      });
  }

  function fila(m, ctx, sinFecha) {
    return ui.filaMovimiento(m, {
      sinFecha: sinFecha,
      alEditar: function (mov) { FP.formularios.movimiento({ movimiento: mov, alGuardar: ctx.refrescar }); },
      alEliminar: function (mov) { FP.acciones.eliminarMovimiento(mov, ctx.refrescar); },
      alRevisar: function (mov) { FP.acciones.marcarRevisado(mov); }
    });
  }

  /* --------------------------------------------------------- Tabla ---- */

  /** Gastos: el medio elegido o "Sin especificar". Ingresos: no aplica. */
  function celdaMedio(m) {
    if (m.tipo !== 'gasto') return el('span', { class: 'texto-apagado', title: 'Los ingresos no tienen medio de pago' }, '—');
    const clave = FP.medios.de(m);
    if (clave === FP.medios.SIN_ESPECIFICAR.clave) return el('span', { class: 'texto-apagado texto-sm' }, 'Sin especificar');
    return ui.distintivoMedio(clave);
  }

  function tabla(movs, ctx) {
    const cuerpo = el('tbody');

    movs.forEach(function (m) {
      const cat = FP.store.categoria(m.categoriaId);
      const esIngreso = m.tipo === 'ingreso';
      const esFutura = m.fecha > U.hoyISO();

      cuerpo.appendChild(el('tr', null, [
        el('td', { class: 'nowrap' }, U.fechaCorta(m.fecha)),
        el('td', null, ui.distintivo(esIngreso ? 'Ingreso' : 'Gasto', esIngreso ? 'ingreso' : 'gasto',
          esIngreso ? '↑' : '↓')),
        el('td', { class: 'nowrap' }, el('span', { class: 'tabla__categoria' }, [
          el('span', { class: 'movimiento__marca movimiento__marca--' + m.tipo, 'aria-hidden': 'true' },
            cat && cat.icono ? cat.icono : (esIngreso ? '↑' : '↓')),
          cat ? cat.nombre : 'Sin categoría'
        ])),
        el('td', { class: 'nowrap' }, celdaMedio(m)),
        el('td', null, [
          el('div', null, m.descripcion || el('span', { class: 'texto-apagado' }, '—')),
          (m.recurrenteId || m.recurrenteOrigen || m.revisar || esFutura || FP.dominio.esTransferencia(m))
            ? el('div', { class: 'fila', style: 'gap:6px;margin-top:4px;flex-wrap:wrap' }, [
              FP.dominio.esTransferencia(m) ? ui.distintivo('No cuenta como gasto', 'neutro', '↔') : null,
              (m.recurrenteId || m.recurrenteOrigen) ? ui.distintivo('Generado por recurrente', 'info', '🔁') : null,
              m.revisar ? ui.distintivo('Por revisar', 'advertencia', '👁') : null,
              esFutura ? ui.distintivo('Fecha futura', 'neutro', '📅') : null
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
            el('th', { scope: 'col' }, 'Medio de pago'),
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
    usaFiltroMedio: true,
    usaRangoDias: true,
    filtros: filtros,
    subtitulo: function (ctx) {
      return 'Ingresos y gastos ' + (ctx.rango ? '' : 'de ') + U.rangoLegible(ctx.periodo, ctx.rango);
    },
    render: render
  };
})();
