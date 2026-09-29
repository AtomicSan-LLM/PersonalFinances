/* ==========================================================================
   S10 — Alertas
   Los avisos deben ser accionables: explican qué ocurre y qué puede hacerse.
   Es una vista GLOBAL: reúne avisos de todos los meses con datos, no solo
   del mes seleccionado en el selector de arriba (ver dominio.alertasTodas).
   Sin esto, superar un tope en un mes distinto al que se está viendo no
   generaba ningún aviso visible en ningún lado de la aplicación.
   ========================================================================== */
window.FP = window.FP || {};
FP.vistas = FP.vistas || {};

FP.vistas.alertas = (function () {
  'use strict';

  const U = FP.util;
  const el = U.el;
  const ui = FP.ui;

  function irAlAviso(ctx, a, ruta, params) {
    if (a.periodo !== ctx.periodo) ctx.cambiarPeriodo(a.periodo);
    ctx.irA(ruta, params);
  }

  function render(cont, ctx) {
    const todas = FP.dominio.alertasTodas({ incluirDescartados: true });
    const activas = todas.filter(function (a) { return !a.descartado; });
    const descartadas = todas.filter(function (a) { return a.descartado; });

    cont.appendChild(el('div', { class: 'tarjeta' }, [
      el('div', { class: 'fila fila--entre' }, [
        el('div', null, [
          el('h2', { class: 'seccion__titulo' }, 'Avisos de todos tus meses'),
          el('p', { class: 'texto-sm texto-apagado mt-3' },
            'Se avisa al llegar al ' + FP.dominio.umbral() + '% de un tope y al superarlo, en cualquier mes con ' +
            'movimientos registrados (incluye meses anteriores si registraste algo tarde). ' +
            'Si un gasto pasa del umbral directamente a la superación, solo verás el aviso de superación.')
        ]),
        el('button', {
          type: 'button', class: 'btn btn--sm',
          onclick: function () { ctx.irA('configuracion'); }
        }, 'Ajustar umbral')
      ])
    ]));

    if (!activas.length) {
      cont.appendChild(el('div', { class: 'tarjeta mt-4' }, [
        ui.vacio({
          icono: '✅',
          titulo: 'Todo bajo control',
          texto: 'No tienes avisos pendientes en ningún mes con movimientos registrados. ' +
            'Los avisos aparecen cuando una categoría se acerca a su tope o lo supera.'
        })
      ]));
    } else {
      const seccion = el('section', { class: 'seccion mt-4' }, [
        ui.cabeceraSeccion(activas.length + ' aviso(s) activo(s)')
      ]);

      activas.forEach(function (a) {
        seccion.appendChild(ui.tarjetaAlerta(a, {
          mostrarPeriodo: true,
          etiquetaVer: a.condicion === 'excedido' || a.condicion === 'cerca' ? 'Ver gastos' : 'Ver presupuesto',
          alVer: function () {
            if (a.condicion === 'excedido' || a.condicion === 'cerca') {
              irAlAviso(ctx, a, 'movimientos', { categoriaId: a.categoriaId, tipo: 'gasto' });
            } else {
              irAlAviso(ctx, a, 'presupuesto');
            }
          },
          alDescartar: function () {
            FP.store.descartarAviso(a.periodo, a.categoriaId, a.condicion);
            ui.toast('Aviso descartado. Volverá a aparecer si la situación cambia.', {
              accion: {
                etiqueta: 'Deshacer',
                alHacerClic: function () { FP.store.restaurarAvisos(a.periodo); }
              }
            });
          }
        }));
      });

      cont.appendChild(seccion);
    }

    if (descartadas.length) {
      const seccion = el('section', { class: 'seccion mt-5' }, [
        ui.cabeceraSeccion('Descartados (' + descartadas.length + ')', [
          el('button', {
            type: 'button', class: 'btn btn--sm',
            onclick: function () {
              FP.store.restaurarAvisos();
              ui.toast('Avisos restaurados.', { tipo: 'exito' });
            }
          }, 'Restaurar todos')
        ])
      ]);

      const tarjeta = el('div', { class: 'tarjeta' });
      descartadas.forEach(function (a) {
        tarjeta.appendChild(el('div', { class: 'movimiento' }, [
          el('span', { class: 'movimiento__marca movimiento__marca--gasto', 'aria-hidden': 'true', style: 'opacity:.5' },
            a.severidad === 'error' ? '!' : '⚠'),
          el('div', { class: 'movimiento__cuerpo' }, [
            el('div', { class: 'movimiento__titulo' }, a.titulo + ' · ' + U.periodoLegible(a.periodo, true)),
            el('div', { class: 'movimiento__meta' }, a.mensaje)
          ])
        ]));
      });
      seccion.appendChild(tarjeta);
      cont.appendChild(seccion);
    }
  }

  return {
    titulo: 'Alertas',
    icono: '🔔',
    enNavegacion: false,
    ocultarSelectorMes: true,
    subtitulo: function () {
      const n = FP.dominio.contarAlertasTodas();
      return n ? n + ' aviso(s) activo(s) en total' : 'Sin avisos pendientes';
    },
    render: render
  };
})();
