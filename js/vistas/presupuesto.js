/* ==========================================================================
   S05 — Presupuesto
   Definir y revisar el plan del mes: meta de ahorro y topes por categoría.
   ========================================================================== */
window.FP = window.FP || {};
FP.vistas = FP.vistas || {};

FP.vistas.presupuesto = (function () {
  'use strict';

  const U = FP.util;
  const el = U.el;
  const ui = FP.ui;

  function render(cont, ctx) {
    const periodo = ctx.periodo;
    const r = FP.dominio.resumen(periodo);
    const coherencia = FP.dominio.coherenciaPresupuesto(periodo);
    const filas = FP.dominio.estadoTopes(periodo, { incluirTodas: true });
    const conTope = filas.filter(function (f) { return f.tope !== null; });

    /* PA-13 — Advertencia de presupuesto imposible. */
    if (coherencia.imposible && FP.store.state.config.avisarPresupuestoImposible) {
      cont.appendChild(el('div', { class: 'alerta alerta--advertencia' }, [
        el('span', { class: 'alerta__icono', 'aria-hidden': 'true' }, '⚠'),
        el('div', { class: 'alerta__cuerpo' }, [
          el('div', { class: 'alerta__titulo' }, 'Tu presupuesto puede no ser alcanzable'),
          el('p', { class: 'alerta__texto' },
            'La suma de tus topes (' + FP.dinero.formato(coherencia.sumaTopes) + ') y tu meta de ahorro (' +
            FP.dinero.formato(coherencia.metaAhorro) + ') supera los ingresos previstos de este mes en ' +
            FP.dinero.formato(coherencia.exceso) + '.'),
          el('p', { class: 'alerta__cifras' },
            'Ingresos previstos: ' + FP.dinero.formato(coherencia.ingresosPrevistos) +
            (coherencia.ingresosRecurrentes
              ? ' (incluye ' + FP.dinero.formato(coherencia.ingresosRecurrentes) + ' de recurrentes aún no generados)'
              : ''))
        ])
      ]));
    }

    cont.appendChild(tarjetaMeta(r, periodo, ctx));

    /* --------------------------------------------------- Topes ------- */
    const seccion = el('section', { class: 'seccion mt-5' }, [
      ui.cabeceraSeccion('Topes de gasto', [
        conTope.length
          ? el('button', {
            type: 'button', class: 'btn btn--sm',
            onclick: function () { copiarDeOtroMes(periodo, ctx); }
          }, 'Copiar de otro mes')
          : null,
        el('button', {
          type: 'button', class: 'btn btn--primario btn--sm',
          onclick: function () { FP.formularios.tope({ periodo: periodo, alGuardar: ctx.refrescar }); }
        }, '＋ Definir tope')
      ])
    ]);

    const tarjeta = el('div', { class: 'tarjeta' });

    if (!conTope.length) {
      const anteriores = FP.store.periodosConPresupuesto(periodo);
      tarjeta.appendChild(ui.vacio({
        icono: '🎯',
        titulo: 'Todavía no has definido topes para ' + U.periodoLegible(periodo),
        texto: 'Un tope es el máximo que planeas gastar en una categoría durante el mes. ' +
          'Te avisaremos cuando llegues al ' + FP.dominio.umbral() + '% y cuando lo superes.',
        accion: {
          etiqueta: '＋ Definir mi primer tope',
          alHacerClic: function () { FP.formularios.tope({ periodo: periodo, alGuardar: ctx.refrescar }); }
        }
      }));

      if (anteriores.length) {
        tarjeta.appendChild(el('p', { class: 'texto-sm texto-apagado', style: 'text-align:center' }, [
          'O bien, ',
          el('button', {
            type: 'button', class: 'enlace',
            onclick: function () { copiar(anteriores[0], periodo, ctx); }
          }, 'copiar el presupuesto de ' + U.periodoLegible(anteriores[0])),
          '.'
        ]));
      }
    } else if (FP.app.esMovil()) {
      filas.forEach(function (f) { tarjeta.appendChild(filaTope(f, periodo, ctx)); });
    } else {
      tarjeta.appendChild(tabla(filas, periodo, ctx));
    }

    seccion.appendChild(tarjeta);
    cont.appendChild(seccion);

    /* Resumen del plan */
    if (conTope.length) {
      cont.appendChild(el('div', { class: 'tarjeta' }, [
        el('h2', { class: 'seccion__titulo' }, 'Cómo queda tu plan'),
        el('div', { class: 'tabla-contenedor mt-3' }, [
          el('table', { class: 'tabla' }, [
            el('tbody', null, [
              linea('Ingresos previstos del mes', FP.dinero.formato(coherencia.ingresosPrevistos)),
              linea('Suma de topes de gasto', '-' + FP.dinero.formato(coherencia.sumaTopes)),
              linea('Meta de ahorro', '-' + FP.dinero.formato(coherencia.metaAhorro)),
              linea(
                coherencia.exceso > 0 ? 'Faltante' : 'Margen sin asignar',
                FP.dinero.formatoSaldo(-coherencia.exceso),
                true,
                coherencia.exceso > 0 ? 'error' : 'exito'
              )
            ])
          ])
        ]),
        el('p', { class: 'campo__ayuda mt-3' },
          'Los ingresos previstos son los ya registrados en el mes más los recurrentes de ingreso vigentes que ' +
          'todavía no se han generado.')
      ]));
    }
  }

  function linea(etiqueta, valor, destacar, color) {
    return el('tr', null, [
      el('th', { scope: 'row', style: destacar ? 'font-weight:700;color:var(--texto)' : '' }, etiqueta),
      el('td', {
        class: 'num nowrap',
        style: 'font-weight:' + (destacar ? '700' : '600') + (color ? ';color:var(--' + color + ')' : '')
      }, valor)
    ]);
  }

  /* ------------------------------------------------- Meta de ahorro --- */

  function tarjetaMeta(r, periodo, ctx) {
    const nodos = [
      el('div', { class: 'fila fila--entre' }, [
        el('h2', { class: 'seccion__titulo' }, 'Meta de ahorro'),
        el('button', {
          type: 'button', class: 'btn btn--sm',
          onclick: function () { FP.formularios.metaAhorro({ periodo: periodo, alGuardar: ctx.refrescar }); }
        }, r.hayMeta ? 'Editar meta' : 'Definir meta')
      ])
    ];

    if (!r.hayMeta) {
      nodos.push(el('p', { class: 'texto-apagado mt-4' },
        'No has fijado una meta para ' + U.periodoLegible(periodo) + '. ' +
        'Tu ahorro real actual es ' + FP.dinero.formatoSaldo(r.ahorroReal) + '.'));
    } else {
      const severidad = r.cumpleMeta ? 'exito' : (r.ahorroReal < 0 ? 'error' : 'advertencia');
      nodos.push(
        el('div', { class: 'rejilla rejilla--3 mt-4' }, [
          dato('Meta', FP.dinero.formato(r.metaAhorro)),
          dato('Ahorro real', FP.dinero.formatoSaldo(r.ahorroReal)),
          dato(r.cumpleMeta ? 'Por encima' : 'Faltan', FP.dinero.formato(Math.abs(r.diferenciaMeta)))
        ]),
        ui.barraProgreso(U.clamp(r.porcentajeMeta, 0, 100), severidad,
          'Avance de la meta: ' + U.formatoPorcentaje(r.porcentajeMeta, 0)),
        el('div', { class: 'fila fila--entre mt-3' }, [
          el('span', { class: 'texto-sm texto-apagado' },
            r.cumpleMeta
              ? 'Ya cumpliste tu meta de este mes.'
              : 'Necesitas ' + FP.dinero.formato(Math.abs(r.diferenciaMeta)) + ' más de ahorro (o menos gasto).'),
          ui.distintivo(r.cumpleMeta ? 'Meta cumplida' : 'Meta pendiente',
            r.cumpleMeta ? 'exito' : 'advertencia', r.cumpleMeta ? '✓' : '⏳')
        ])
      );
    }

    return el('section', { class: 'tarjeta' }, nodos);
  }

  function dato(etiqueta, valor) {
    return el('div', null, [
      el('div', { class: 'resumen__etiqueta' }, etiqueta),
      el('div', { class: 'num', style: 'font-size:1.35rem;font-weight:700;margin-top:4px' }, valor)
    ]);
  }

  /* --------------------------------------------------- Tabla topes ---- */

  function tabla(filas, periodo, ctx) {
    const cuerpo = el('tbody');

    filas.forEach(function (f) {
      const sinTope = f.tope === null;
      cuerpo.appendChild(el('tr', null, [
        el('th', { scope: 'row', style: 'font-weight:600' }, [
          f.categoria.icono ? el('span', { 'aria-hidden': 'true' }, f.categoria.icono + ' ') : null,
          f.categoria.nombre
        ]),
        el('td', { class: 'num nowrap' }, sinTope
          ? el('span', { class: 'texto-apagado' }, '—')
          : FP.dinero.formato(f.tope)),
        el('td', { class: 'num nowrap' }, FP.dinero.formato(f.gastado)),
        el('td', {
          class: 'num nowrap',
          style: f.estado === 'excedido' ? 'color:var(--error);font-weight:700' : ''
        }, sinTope
          ? el('span', { class: 'texto-apagado' }, '—')
          : FP.dinero.formatoSaldo(f.disponible)),
        el('td', { style: 'min-width:150px' }, [
          ui.distintivoEstado(f.estado, f.etiquetaEstado),
          sinTope ? null : el('div', { style: 'margin-top:6px' }, [
            ui.barraProgreso(f.porcentaje, FP.dominio.SEVERIDAD_ESTADO[f.estado],
              f.categoria.nombre + ': ' + U.formatoPorcentaje(f.porcentaje, 0) + ' del tope')
          ])
        ]),
        el('td', { style: 'width:44px' }, acciones(f, periodo, ctx))
      ]));
    });

    return el('div', { class: 'tabla-contenedor' }, [
      el('table', { class: 'tabla' }, [
        el('thead', null, [
          el('tr', null, [
            el('th', { scope: 'col' }, 'Categoría'),
            el('th', { scope: 'col', class: 'num' }, 'Tope'),
            el('th', { scope: 'col', class: 'num' }, 'Gastado'),
            el('th', { scope: 'col', class: 'num' }, 'Disponible'),
            el('th', { scope: 'col' }, 'Estado'),
            el('th', { scope: 'col' }, el('span', { class: 'visualmente-oculto' }, 'Acciones'))
          ])
        ]),
        cuerpo
      ])
    ]);
  }

  function filaTope(f, periodo, ctx) {
    return ui.filaTope(f, { acciones: function (fila) { return acciones(fila, periodo, ctx); } });
  }

  function acciones(f, periodo, ctx) {
    return ui.menuAcciones([
      {
        etiqueta: f.tope === null ? 'Definir tope' : 'Editar tope', icono: '🎯',
        alHacerClic: function () {
          FP.formularios.tope({ periodo: periodo, categoriaId: f.categoriaId, alGuardar: ctx.refrescar });
        }
      },
      f.tope !== null ? {
        etiqueta: 'Quitar tope', icono: '✖', peligro: true,
        alHacerClic: function () {
          ui.confirmar({
            titulo: 'Quitar el tope de "' + f.categoria.nombre + '"',
            mensaje: 'La categoría dejará de tener límite en ' + U.periodoLegible(periodo) +
              ' y no generará avisos.',
            detalle: 'Los movimientos ya registrados no se modifican.',
            etiquetaConfirmar: 'Quitar tope'
          }).then(function (ok) {
            if (!ok) return;
            FP.store.eliminarTope(periodo, f.categoriaId);
            ui.toast('Tope eliminado.', { tipo: 'exito' });
          });
        }
      } : null,
      {
        etiqueta: 'Ver movimientos', icono: '📋',
        alHacerClic: function () { ctx.irA('movimientos', { categoriaId: f.categoriaId, tipo: 'gasto' }); }
      }
    ], 'Acciones de ' + f.categoria.nombre);
  }

  /* ----------------------------------------------------- Copiar mes --- */

  function copiar(origen, destino, ctx) {
    FP.store.copiarPresupuesto(origen, destino);
    ui.toast('Presupuesto copiado desde ' + U.periodoLegible(origen) + '.', { tipo: 'exito' });
    if (ctx.refrescar) ctx.refrescar();
  }

  function copiarDeOtroMes(periodo, ctx) {
    const disponibles = FP.store.periodosConPresupuesto().filter(function (p) { return p !== periodo; });
    if (!disponibles.length) {
      ui.toast('No hay otro mes con presupuesto definido.', { tipo: 'advertencia' });
      return;
    }

    let elegido = disponibles[0];
    const select = el('select', {
      onchange: function (e) { elegido = e.target.value; }
    }, disponibles.map(function (p) {
      return el('option', { value: p }, U.periodoLegible(p));
    }));

    ui.dialogo({
      titulo: 'Copiar presupuesto',
      descripcion: 'Se reemplazarán los topes y la meta de ' + U.periodoLegible(periodo) + '.',
      contenido: [
        ui.campo({
          etiqueta: 'Copiar desde', control: select,
          ayuda: 'Los topes y la meta de ahorro del mes elegido se copiarán tal cual.'
        })
      ],
      acciones: [
        { etiqueta: 'Cancelar', alHacerClic: function (cerrar) { cerrar(); } },
        {
          etiqueta: 'Copiar', clase: 'btn--primario',
          alHacerClic: function (cerrar) { copiar(elegido, periodo, ctx); cerrar(); }
        }
      ]
    });
  }

  return {
    titulo: 'Presupuesto',
    icono: '🎯',
    enNavegacion: true,
    subtitulo: function (ctx) {
      const n = FP.dominio.estadoTopes(ctx.periodo).filter(function (f) { return f.tope !== null; }).length;
      return n ? n + ' categoría(s) con tope en ' + U.periodoLegible(ctx.periodo)
        : 'Sin topes definidos en ' + U.periodoLegible(ctx.periodo);
    },
    render: render
  };
})();
