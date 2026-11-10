/* ==========================================================================
   S01 — Inicio / Dashboard
   Objetivo: responder "¿cómo voy este mes?" sin navegar a otra pantalla.
   Jerarquía (sección 2.3): estado → alertas → presupuesto → movimientos.
   ========================================================================== */
window.FP = window.FP || {};
FP.vistas = FP.vistas || {};

FP.vistas.inicio = (function () {
  'use strict';

  const U = FP.util;
  const el = U.el;
  const ui = FP.ui;

  function render(cont, ctx) {
    const periodo = ctx.periodo;
    const r = FP.dominio.resumen(periodo, ctx.rango);
    const hayAlgoEnLaApp = FP.store.state.movimientos.length > 0;

    if (!hayAlgoEnLaApp) {
      cont.appendChild(el('div', { class: 'tarjeta' }, [
        ui.vacio({
          icono: '👋',
          titulo: 'Empecemos por tu primer movimiento',
          texto: 'Registra un ingreso o un gasto y verás aquí tus totales del mes, ' +
            'el avance de tu presupuesto y tu ahorro real.',
          accion: {
            etiqueta: '＋ Registrar movimiento',
            alHacerClic: function () { FP.formularios.movimiento({ periodo: periodo }); }
          }
        }),
        el('p', { class: 'texto-apagado texto-sm', style: 'text-align:center' }, [
          'También puedes ',
          el('button', {
            type: 'button', class: 'enlace',
            onclick: function () { ctx.irA('presupuesto'); }
          }, 'definir tu presupuesto'),
          ' o ',
          el('button', {
            type: 'button', class: 'enlace',
            onclick: function () { ctx.irA('configuracion'); }
          }, 'cargar datos de ejemplo'),
          ' para explorar la aplicación.'
        ])
      ]));
      return;
    }

    /* Con un rango parcial, ingresos, gastos y ahorro son de esos días; la meta,
       los topes y los avisos siguen siendo del mes completo. */
    if (r.parcial) {
      cont.appendChild(el('div', { class: 'aviso-medio', style: 'margin:0 0 var(--e-4)' },
        '📅 Mostrando ' + U.rangoLegible(periodo, r.rango) + '. ' +
        'La meta de ahorro, los topes y los avisos se calculan sobre el mes completo.'));
    }

    const alertas = FP.dominio.alertas(periodo);
    /* El resto de avisos activos que no son de este mes (ver dominio.alertasTodas):
       sin esto, "Todo bajo control" podía sonar a que no hay nada pendiente en
       ningún lado, cuando en realidad solo se evaluó el mes que se está viendo. */
    const enOtrosMeses = Math.max(0, FP.dominio.contarAlertasTodas() - alertas.length);

    /* Teléfono: una sola columna con su propio orden (saldo → gráfica → meta →
       presupuesto → últimos movimientos → avisos). La campana de la cabecera ya
       muestra cuántos avisos hay, por eso pueden ir al final. */
    if (FP.app.esMovil()) {
      cont.appendChild(el('div', { class: 'inicio-movil' }, [
        tarjetaSaldo(r, periodo, ctx, 'tarjeta-saldo--fila'),
        seccionGrafica(periodo, ctx),
        ui.tarjetaMeta(r, periodo, ctx.refrescar),
        seccionPresupuesto(periodo, ctx, true),
        seccionRecientes(periodo, ctx, 5),
        seccionPendientes(periodo, ctx),
        seccionAlertas(alertas, periodo, ctx, enOtrosMeses),
        ui.tarjetaMediosPago(periodo, { rango: ctx.rango })
      ]));
      return;
    }

    cont.appendChild(el('div', { class: 'rejilla rejilla--panel rejilla--estirar' }, [
      tarjetaSaldo(r, periodo, ctx),
      ui.tarjetaMeta(r, periodo, ctx.refrescar)
    ]));

    cont.appendChild(seccionAlertas(alertas, periodo, ctx, enOtrosMeses));

    const rejilla = el('div', { class: 'rejilla rejilla--panel mt-5' }, [
      el('div', { class: 'pila pila--4' }, [
        seccionPresupuesto(periodo, ctx),
        ui.tarjetaMediosPago(periodo, { rango: ctx.rango })
      ]),
      el('div', { class: 'pila pila--4' }, [
        seccionRecientes(periodo, ctx),
        seccionPendientes(periodo, ctx)
      ])
    ]);
    cont.appendChild(rejilla);
  }

  /* ------------------------------------------------- Resumen del mes -- */

  /** Tarjeta principal: ahorro real grande; ingresos y gastos llevan a sus movimientos. */
  function tarjetaSaldo(r, periodo, ctx, clase) {
    return ui.tarjetaSaldo({
      clase: clase,
      ariaLabel: 'Resumen de ' + U.periodoLegible(periodo),
      etiqueta: 'Ahorro real · ' + U.rangoLegible(periodo, r.rango),
      cifra: FP.dinero.formatoSaldo(r.ahorroReal),
      pie: !r.nMovimientos
        ? (r.parcial ? 'Sin movimientos en esos días' : 'Sin movimientos aún')
        : (r.parcial ? 'Ingresos − gastos de esos días' : 'Ingresos − gastos'),
      items: [
        { etiqueta: 'Ingresos', icono: '↑', monto: r.ingresos, accion: 'Ver movimientos',
          alHacerClic: function () { ctx.irA('movimientos', { tipo: 'ingreso' }); } },
        { etiqueta: 'Gastos', icono: '↓', monto: r.gastos, accion: 'Ver movimientos',
          alHacerClic: function () { ctx.irA('movimientos', { tipo: 'gasto' }); } }
      ]
    });
  }

  /* ---------------------------------- Gráfica de balance (solo móvil) -- */

  const MESES_GRAFICA = 6;

  /**
   * Ingresos y gastos de los últimos 6 meses, con el mes consultado resaltado.
   * Tocar un mes lo abre. Usa la misma serie probada del Histórico.
   */
  function seccionGrafica(periodo, ctx) {
    const fin = FP.dominio.finDeVentana(periodo, MESES_GRAFICA);
    const serie = FP.dominio.serieMensual(MESES_GRAFICA, ctx.rango, fin);
    const periodos = serie.map(function (s) { return s.periodo; });
    const ventana = serie.length === 1 ? 'Un mes con datos' : 'Últimos ' + serie.length + ' meses';

    return el('section', { class: 'tarjeta', 'aria-label': 'Ingresos y gastos por mes' }, [
      el('div', { class: 'seccion__cabecera' }, [
        el('div', null, [
          el('h2', { class: 'seccion__titulo' }, 'Ingresos y gastos'),
          el('p', { class: 'texto-sm texto-apagado' },
            ventana + (ctx.rango ? ' · ' + U.rangoLegible(periodo, ctx.rango, true) + ' de cada mes' : ''))
        ]),
        el('button', {
          type: 'button', class: 'btn btn--sm',
          onclick: function () { ctx.irA('historico'); }
        }, 'Histórico')
      ]),
      FP.graficos.columnas({
        /* Lienzo del ancho real de la tarjeta: así el texto de los ejes no se encoge. */
        ancho: Math.max(240, Math.min(window.innerWidth, 720) - 66), alto: 190,
        etiquetas: periodos.map(function (p) { return U.periodoLegible(p, true).split(' ')[0]; }),
        titulos: periodos.map(function (p) { return U.periodoLegible(p); }),
        series: [
          { nombre: 'Ingresos', color: 'var(--ingreso)', valores: serie.map(function (s) { return s.ingresos; }) },
          { nombre: 'Gastos', color: 'var(--gasto)', valores: serie.map(function (s) { return s.gastos; }) }
        ],
        resaltar: periodos.indexOf(periodo),
        alElegir: function (i) { ctx.cambiarPeriodo(periodos[i]); },
        descripcion: 'Ingresos y gastos por mes. Toca un mes para abrirlo.'
      })
    ]);
  }

  /* ------------------------------------------------------- Alertas ---- */

  function seccionAlertas(alertas, periodo, ctx, enOtrosMeses) {
    const seccion = el('section', { class: 'seccion mt-5', 'aria-label': 'Avisos del mes' });

    if (!alertas.length) {
      seccion.appendChild(el('div', { class: 'alerta alerta--info' }, [
        el('span', { class: 'alerta__icono', 'aria-hidden': 'true' }, '✓'),
        el('div', { class: 'alerta__cuerpo' }, [
          el('div', { class: 'alerta__titulo' }, 'Todo bajo control en ' + U.periodoLegible(periodo)),
          el('p', { class: 'alerta__texto' }, 'No tienes avisos pendientes en ' + U.periodoLegible(periodo) + '.'),
          enOtrosMeses ? el('button', {
            type: 'button', class: 'btn btn--sm mt-3',
            onclick: function () { ctx.irA('alertas'); }
          }, 'Pero tienes ' + enOtrosMeses + ' aviso(s) en otros meses. Ver') : null
        ])
      ]));
      return seccion;
    }

    const criticas = alertas.filter(function (a) { return a.severidad === 'error'; }).length;
    seccion.appendChild(ui.cabeceraSeccion(
      alertas.length === 1 ? '1 aviso requiere tu atención'
        : alertas.length + ' avisos requieren tu atención',
      [
        criticas ? ui.distintivo(criticas + ' crítico(s)', 'error', '!') : null,
        el('button', {
          type: 'button', class: 'btn btn--sm',
          onclick: function () { ctx.irA('alertas'); }
        }, 'Ver todos')
      ]
    ));

    alertas.slice(0, 3).forEach(function (a) {
      seccion.appendChild(ui.tarjetaAlerta(a, {
        etiquetaVer: a.condicion === 'presupuesto' ? 'Revisar presupuesto'
          : a.condicion === 'meta' ? 'Ver presupuesto' : 'Ver gastos',
        alVer: function () {
          if (a.condicion === 'excedido' || a.condicion === 'cerca') {
            ctx.irA('movimientos', { categoriaId: a.categoriaId, tipo: 'gasto' });
          } else {
            ctx.irA('presupuesto');
          }
        },
        alDescartar: function () {
          FP.store.descartarAviso(periodo, a.categoriaId, a.condicion);
          ui.toast('Aviso descartado.', {
            accion: {
              etiqueta: 'Deshacer',
              alHacerClic: function () { FP.store.restaurarAvisos(periodo); }
            }
          });
        }
      }));
    });

    if (alertas.length > 3) {
      seccion.appendChild(el('p', { class: 'texto-sm texto-apagado mt-3' },
        'Y ' + (alertas.length - 3) + ' aviso(s) más.'));
    }

    if (enOtrosMeses) {
      seccion.appendChild(el('p', { class: 'texto-sm texto-apagado mt-3' },
        'Además, ' + enOtrosMeses + ' aviso(s) en otros meses.'));
    }

    return seccion;
  }

  /* ---------------------------------------------------- Presupuesto --- */

  /** Con `carrusel` (móvil) los mosaicos van en una fila que se desliza con el dedo. */
  function seccionPresupuesto(periodo, ctx, carrusel) {
    const filas = FP.dominio.estadoTopes(periodo);
    const seccion = el('section', { class: 'seccion', 'aria-label': 'Presupuesto del mes' }, [
      ui.cabeceraSeccion('Presupuesto', [
        el('button', {
          type: 'button', class: 'btn btn--sm',
          onclick: function () { ctx.irA('presupuesto'); }
        }, 'Gestionar')
      ])
    ]);

    const tarjeta = el('div', { class: filas.length ? '' : 'tarjeta' });

    if (!filas.length) {
      tarjeta.appendChild(ui.vacio({
        icono: '🎯',
        titulo: 'Todavía no has definido tu presupuesto',
        texto: 'Define tus topes por categoría y tu meta de ahorro para empezar a medir tu avance.',
        accion: {
          etiqueta: 'Configurar presupuesto',
          alHacerClic: function () { ctx.irA('presupuesto'); }
        }
      }));
    } else {
      const mosaicos = el('div', carrusel
        ? { class: 'mosaicos mosaicos--carrusel', role: 'group', 'aria-label': 'Categorías del presupuesto. Desliza para ver más', tabindex: 0 }
        : { class: 'mosaicos' });
      tarjeta.appendChild(mosaicos);
      filas.slice(0, 6).forEach(function (fila) {
        mosaicos.appendChild(ui.mosaicoTope(fila, {
          acciones: function (f) {
            return ui.menuAcciones([
              {
                etiqueta: f.tope === null ? 'Definir tope' : 'Editar tope', icono: '🎯',
                alHacerClic: function () {
                  FP.formularios.tope({ periodo: periodo, categoriaId: f.categoriaId, alGuardar: ctx.refrescar });
                }
              },
              {
                etiqueta: 'Ver movimientos', icono: '📋',
                alHacerClic: function () { ctx.irA('movimientos', { categoriaId: f.categoriaId, tipo: 'gasto' }); }
              }
            ], 'Acciones de ' + f.categoria.nombre);
          }
        }));
      });

      if (filas.length > 6 && carrusel) {
        /* Último mosaico del carrusel: lleva al resto de categorías. */
        mosaicos.appendChild(el('button', {
          type: 'button', class: 'mosaico mosaico--mas',
          onclick: function () { ctx.irA('presupuesto'); }
        }, [
          el('span', { class: 'mosaico__pct num' }, '+' + (filas.length - 6)),
          el('span', { class: 'mosaico__nombre' }, 'categorías más'),
          el('span', { class: 'mosaico__enlace' }, 'Ver todas ›')
        ]));
      } else if (filas.length > 6) {
        tarjeta.appendChild(el('p', { class: 'texto-sm texto-apagado mt-4' },
          'Y ' + (filas.length - 6) + ' categoría(s) más en la pantalla de Presupuesto.'));
      }
    }

    seccion.appendChild(tarjeta);
    return seccion;
  }

  /* --------------------------------------------- Movimientos recientes */

  function seccionRecientes(periodo, ctx, cuantos) {
    const movs = FP.dominio.ordenarRecientes(FP.dominio.movimientosDe(periodo, ctx.rango)).slice(0, cuantos || 6);

    const seccion = el('section', { class: 'seccion', 'aria-label': 'Movimientos recientes' }, [
      ui.cabeceraSeccion(cuantos ? 'Últimos movimientos' : 'Movimientos recientes', [
        el('button', {
          type: 'button', class: 'btn btn--sm',
          onclick: function () { ctx.irA('movimientos'); }
        }, 'Ver todos')
      ])
    ]);

    const tarjeta = el('div', { class: 'tarjeta' });

    if (!movs.length) {
      tarjeta.appendChild(ui.vacio({
        icono: '🧾',
        titulo: ctx.rango ? 'No hay movimientos en esos días' : 'Aún no tienes movimientos este mes',
        texto: ctx.rango
          ? 'Prueba con otro rango de días o vuelve a «Mes completo».'
          : 'Registra tu primer ingreso o gasto para empezar a controlar tus finanzas.',
        accion: {
          etiqueta: '＋ Registrar movimiento',
          alHacerClic: function () { FP.formularios.movimiento({ periodo: periodo, alGuardar: ctx.refrescar }); }
        }
      }));
    } else {
      movs.forEach(function (m) {
        tarjeta.appendChild(ui.filaMovimiento(m, {
          alEditar: function (mov) { FP.formularios.movimiento({ movimiento: mov, alGuardar: ctx.refrescar }); },
          alEliminar: function (mov) { FP.acciones.eliminarMovimiento(mov, ctx.refrescar); },
          alRevisar: function (mov) { FP.acciones.marcarRevisado(mov); }
        }));
      });
    }

    seccion.appendChild(tarjeta);
    return seccion;
  }

  /* ------------------------------------------ Recurrentes por revisar - */

  function seccionPendientes(periodo, ctx) {
    const pendientes = FP.dominio.pendientesDeRevision(periodo);
    if (!pendientes.length) return null;

    const tarjeta = el('div', { class: 'tarjeta' }, [
      el('h2', { class: 'seccion__titulo' }, 'Movimientos por revisar'),
      el('p', { class: 'texto-sm texto-apagado mt-3' },
        'Estos movimientos los generó un recurrente de monto variable. ' +
        'Ajusta la cifra real si es distinta.')
    ]);

    pendientes.forEach(function (m) {
      tarjeta.appendChild(ui.filaMovimiento(m, {
        alEditar: function (mov) { FP.formularios.movimiento({ movimiento: mov, alGuardar: ctx.refrescar }); },
        alRevisar: function (mov) { FP.acciones.marcarRevisado(mov); },
        alEliminar: function (mov) { FP.acciones.eliminarMovimiento(mov, ctx.refrescar); }
      }));
    });

    return el('section', { class: 'seccion', 'aria-label': 'Movimientos por revisar' }, [tarjeta]);
  }

  return {
    titulo: 'Inicio',
    icono: '🏠',
    enNavegacion: true,
    usaRangoDias: true,
    subtitulo: function (ctx) {
      const r = FP.dominio.resumen(ctx.periodo, ctx.rango);
      const donde = U.rangoLegible(ctx.periodo, r.rango);
      return r.nMovimientos
        ? r.nMovimientos + ' movimiento(s) ' + (r.parcial ? donde : 'en ' + donde)
        : 'Sin movimientos ' + (r.parcial ? donde : 'en ' + donde);
    },
    render: render
  };
})();
