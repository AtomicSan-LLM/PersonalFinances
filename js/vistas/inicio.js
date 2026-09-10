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
    const r = FP.dominio.resumen(periodo);
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

    cont.appendChild(tarjetaResumen(r, periodo, ctx));

    const alertas = FP.dominio.alertas(periodo);
    cont.appendChild(seccionAlertas(alertas, periodo, ctx));

    const rejilla = el('div', { class: 'rejilla rejilla--panel mt-5' }, [
      seccionPresupuesto(periodo, ctx),
      el('div', { class: 'pila pila--4' }, [
        seccionRecientes(periodo, ctx),
        seccionPendientes(periodo, ctx)
      ])
    ]);
    cont.appendChild(rejilla);
  }

  /* ------------------------------------------------- Resumen del mes -- */

  function tarjetaResumen(r, periodo, ctx) {
    const nodos = [
      el('div', { class: 'resumen' }, [
        item('Ingresos', '↑', FP.dinero.formato(r.ingresos), 'ingreso',
          r.nMovimientos ? null : 'Sin movimientos aún'),
        item('Gastos', '↓', FP.dinero.formato(r.gastos), 'gasto', null),
        item('Ahorro real', '=', FP.dinero.formatoSaldo(r.ahorroReal), null, 'Ingresos − gastos')
      ])
    ];

    if (r.hayMeta) {
      const pct = U.clamp(r.porcentajeMeta, 0, 100);
      const severidad = r.cumpleMeta ? 'exito' : (r.ahorroReal < 0 ? 'error' : 'advertencia');

      nodos.push(el('div', { class: 'meta' }, [
        el('div', { class: 'meta__fila' }, [
          el('h3', null, 'Meta de ahorro'),
          el('span', { class: 'meta__cifra' }, FP.dinero.formato(r.metaAhorro))
        ]),
        ui.barraProgreso(pct, severidad,
          'Avance de la meta de ahorro: ' + U.formatoPorcentaje(r.porcentajeMeta, 0)),
        el('div', { class: 'meta__fila' }, [
          el('span', { class: 'texto-sm texto-apagado num' },
            'Cumplimiento: ' + FP.dinero.formatoSaldo(r.ahorroReal) + ' de ' + FP.dinero.formato(r.metaAhorro)),
          ui.distintivo(
            r.cumpleMeta ? 'Meta cumplida' : 'Meta pendiente',
            r.cumpleMeta ? 'exito' : 'advertencia',
            r.cumpleMeta ? '✓' : '⏳'
          )
        ]),
        el('p', { class: 'meta__mensaje', style: 'color:var(--' + severidad + ')' },
          r.cumpleMeta
            ? 'Vas ' + FP.dinero.formato(r.diferenciaMeta) + ' por encima de tu meta.'
            : 'Te faltan ' + FP.dinero.formato(Math.abs(r.diferenciaMeta)) + ' para cumplir la meta.')
      ]));
    } else {
      nodos.push(el('div', { class: 'meta fila fila--entre' }, [
        el('div', null, [
          el('h3', null, 'Sin meta de ahorro'),
          el('p', { class: 'texto-sm texto-apagado mt-3' },
            'Define cuánto quieres que te quede este mes para medir tu avance.')
        ]),
        el('button', {
          type: 'button', class: 'btn',
          onclick: function () { FP.formularios.metaAhorro({ periodo: periodo, alGuardar: ctx.refrescar }); }
        }, 'Definir meta')
      ]));
    }

    return el('section', { class: 'tarjeta', 'aria-label': 'Resumen de ' + U.periodoLegible(periodo) }, nodos);
  }

  function item(etiqueta, icono, cifra, variante, pie) {
    return el('div', { class: 'resumen__item' + (variante ? ' resumen__item--' + variante : '') }, [
      el('div', null, [
        el('span', { class: 'resumen__etiqueta' }, [
          el('span', { 'aria-hidden': 'true' }, icono), etiqueta
        ]),
        el('div', { class: 'resumen__cifra' }, cifra),
        pie ? el('div', { class: 'resumen__pie' }, pie) : null
      ])
    ]);
  }

  /* ------------------------------------------------------- Alertas ---- */

  function seccionAlertas(alertas, periodo, ctx) {
    const seccion = el('section', { class: 'seccion mt-5', 'aria-label': 'Avisos del mes' });

    if (!alertas.length) {
      seccion.appendChild(el('div', { class: 'alerta alerta--info' }, [
        el('span', { class: 'alerta__icono', 'aria-hidden': 'true' }, '✓'),
        el('div', { class: 'alerta__cuerpo' }, [
          el('div', { class: 'alerta__titulo' }, 'Todo bajo control'),
          el('p', { class: 'alerta__texto' }, 'No tienes avisos pendientes en ' + U.periodoLegible(periodo) + '.')
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

    return seccion;
  }

  /* ---------------------------------------------------- Presupuesto --- */

  function seccionPresupuesto(periodo, ctx) {
    const filas = FP.dominio.estadoTopes(periodo);
    const seccion = el('section', { class: 'seccion', 'aria-label': 'Presupuesto del mes' }, [
      ui.cabeceraSeccion('Presupuesto', [
        el('button', {
          type: 'button', class: 'btn btn--sm',
          onclick: function () { ctx.irA('presupuesto'); }
        }, 'Gestionar')
      ])
    ]);

    const tarjeta = el('div', { class: 'tarjeta' });

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
      filas.slice(0, 6).forEach(function (fila) {
        tarjeta.appendChild(ui.filaTope(fila, {
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

      if (filas.length > 6) {
        tarjeta.appendChild(el('p', { class: 'texto-sm texto-apagado mt-4' },
          'Y ' + (filas.length - 6) + ' categoría(s) más en la pantalla de Presupuesto.'));
      }
    }

    seccion.appendChild(tarjeta);
    return seccion;
  }

  /* --------------------------------------------- Movimientos recientes */

  function seccionRecientes(periodo, ctx) {
    const movs = FP.dominio.ordenarRecientes(FP.dominio.movimientosDe(periodo)).slice(0, 6);

    const seccion = el('section', { class: 'seccion', 'aria-label': 'Movimientos recientes' }, [
      ui.cabeceraSeccion('Movimientos recientes', [
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
        titulo: 'Aún no tienes movimientos este mes',
        texto: 'Registra tu primer ingreso o gasto para empezar a controlar tus finanzas.',
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
    subtitulo: function (ctx) {
      const r = FP.dominio.resumen(ctx.periodo);
      return r.nMovimientos
        ? r.nMovimientos + ' movimiento(s) en ' + U.periodoLegible(ctx.periodo)
        : 'Sin movimientos en ' + U.periodoLegible(ctx.periodo);
    },
    render: render
  };
})();
