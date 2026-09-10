/* ==========================================================================
   S07 — Movimientos recurrentes
   Regla adoptada (PA-09): se generan automáticamente hasta el mes actual y
   quedan disponibles para revisar y editar. Si el día no existe en el mes,
   se usa el último día válido.
   ========================================================================== */
window.FP = window.FP || {};
FP.vistas = FP.vistas || {};

FP.vistas.recurrentes = (function () {
  'use strict';

  const U = FP.util;
  const el = U.el;
  const ui = FP.ui;

  function render(cont, ctx) {
    const recs = FP.store.state.recurrentes;

    cont.appendChild(el('div', { class: 'fila fila--entre', style: 'margin-bottom:16px' }, [
      el('p', { class: 'texto-sm texto-apagado', style: 'max-width:60ch' },
        'Los movimientos recurrentes se generan solos cada mes y cuentan igual que los que registras a mano: ' +
        'suman en los totales, en su categoría, en el presupuesto y en los avisos.'),
      el('button', {
        type: 'button', class: 'btn btn--primario',
        onclick: function () { FP.formularios.recurrente({ alGuardar: ctx.refrescar }); }
      }, '＋ Nuevo recurrente')
    ]));

    /* Pendientes de revisión (recurrentes de monto variable) */
    const pendientes = FP.dominio.pendientesDeRevision();
    if (pendientes.length) {
      const tarjeta = el('section', { class: 'tarjeta' }, [
        el('div', { class: 'fila fila--entre' }, [
          el('h2', { class: 'seccion__titulo' }, 'Movimientos por revisar'),
          ui.distintivo(pendientes.length + ' pendiente(s)', 'advertencia', '👁')
        ]),
        el('p', { class: 'texto-sm texto-apagado mt-3' },
          'Se generaron con el monto de referencia. Ajusta la cifra real si cambió.')
      ]);

      FP.dominio.ordenarRecientes(pendientes).forEach(function (m) {
        tarjeta.appendChild(ui.filaMovimiento(m, {
          mostrarAnio: true,
          alEditar: function (mov) { FP.formularios.movimiento({ movimiento: mov, alGuardar: ctx.refrescar }); },
          alRevisar: function (mov) { FP.acciones.marcarRevisado(mov); },
          alEliminar: function (mov) { FP.acciones.eliminarMovimiento(mov, ctx.refrescar); }
        }));
      });

      cont.appendChild(tarjeta);
    }

    if (!recs.length) {
      cont.appendChild(el('div', { class: 'tarjeta' }, [
        ui.vacio({
          icono: '🔁',
          titulo: 'No tienes movimientos recurrentes',
          texto: 'Define los que se repiten cada mes —salario, arriendo, suscripciones— y no tendrás ' +
            'que registrarlos otra vez.',
          accion: {
            etiqueta: '＋ Crear mi primer recurrente',
            alHacerClic: function () { FP.formularios.recurrente({ alGuardar: ctx.refrescar }); }
          }
        })
      ]));
      return;
    }

    const activos = recs.filter(function (r) { return r.activo; });
    const inactivos = recs.filter(function (r) { return !r.activo; });

    if (activos.length) cont.appendChild(grupo('Activos', activos, ctx));
    if (inactivos.length) cont.appendChild(grupo('Finalizados o pausados', inactivos, ctx));
  }

  function grupo(titulo, lista, ctx) {
    const tarjeta = el('section', { class: 'tarjeta mt-4' }, [
      el('h2', { class: 'seccion__titulo', style: 'margin-bottom:8px' }, titulo)
    ]);
    U.ordenarPor(lista, function (r) { return r.diaMes; })
      .forEach(function (r) { tarjeta.appendChild(fila(r, ctx)); });
    return tarjeta;
  }

  function fila(rec, ctx) {
    const cat = FP.store.categoria(rec.categoriaId);
    const actual = U.periodoActual();
    const vigente = FP.dominio.vigenteEn(rec, actual);
    const generados = FP.store.state.movimientos.filter(function (m) { return m.recurrenteId === rec.id; }).length;

    const meta = [
      el('span', null, rec.tipo === 'ingreso' ? 'Ingreso' : 'Gasto'),
      el('span', { 'aria-hidden': 'true' }, '·'),
      el('span', { class: 'num' }, FP.dinero.formato(rec.monto)),
      el('span', { 'aria-hidden': 'true' }, '·'),
      el('span', null, 'día ' + rec.diaMes),
      el('span', { 'aria-hidden': 'true' }, '·'),
      el('span', null, cat ? cat.nombre : 'Sin categoría')
    ];

    if (rec.montoVariable) meta.push(ui.distintivo('Monto variable', 'info', '≈'));
    if (rec.diaMes > 28) meta.push(ui.distintivo('Ajusta a fin de mes', 'neutro', '📅'));

    const vigencia = 'Desde ' + U.periodoLegible(rec.desde, true) +
      (rec.hasta ? ' hasta ' + U.periodoLegible(rec.hasta, true) : ' · sin fecha final');

    return el('div', { class: 'movimiento' }, [
      el('span', {
        class: 'movimiento__marca movimiento__marca--' + rec.tipo,
        'aria-hidden': 'true',
        style: rec.activo ? '' : 'opacity:.5'
      }, cat && cat.icono ? cat.icono : '🔁'),

      el('div', { class: 'movimiento__cuerpo' }, [
        el('div', { class: 'movimiento__titulo', style: rec.activo ? '' : 'opacity:.6' }, rec.descripcion),
        el('div', { class: 'movimiento__meta' }, meta),
        el('div', { class: 'movimiento__meta' }, [
          el('span', null, vigencia),
          el('span', { 'aria-hidden': 'true' }, '·'),
          el('span', null, generados + ' movimiento(s) generado(s)')
        ])
      ]),

      el('div', { class: 'fila', style: 'gap:8px' }, [
        ui.distintivo(
          !rec.activo ? 'Pausado' : (vigente ? 'Activo' : 'Fuera de vigencia'),
          !rec.activo ? 'neutro' : (vigente ? 'exito' : 'neutro'),
          !rec.activo ? '⏸' : (vigente ? '✓' : '—')
        ),
        ui.menuAcciones([
          {
            etiqueta: 'Editar', icono: '✏️',
            alHacerClic: function () { FP.formularios.recurrente({ recurrente: rec, alGuardar: ctx.refrescar }); }
          },
          {
            etiqueta: rec.activo ? 'Pausar' : 'Reactivar', icono: rec.activo ? '⏸' : '▶',
            alHacerClic: function () {
              FP.store.actualizarRecurrente(rec.id, { activo: !rec.activo });
              if (!rec.activo) FP.dominio.generarRecurrentes();
              ui.toast(rec.activo
                ? 'Recurrente pausado. No se generarán más movimientos.'
                : 'Recurrente reactivado.', { tipo: 'exito' });
            }
          },
          generados ? {
            etiqueta: 'Ver movimientos generados', icono: '📋',
            alHacerClic: function () { ctx.irA('movimientos', { categoriaId: rec.categoriaId, tipo: rec.tipo }); }
          } : null,
          {
            etiqueta: 'Eliminar', icono: '🗑', peligro: true,
            alHacerClic: function () { eliminar(rec, generados, ctx); }
          }
        ], 'Acciones de ' + rec.descripcion)
      ])
    ]);
  }

  /* PA-10 — Al eliminar la regla, el usuario decide qué pasa con lo ya generado. */
  function eliminar(rec, generados, ctx) {
    if (!generados) {
      ui.confirmar({
        titulo: 'Eliminar "' + rec.descripcion + '"',
        mensaje: 'Se eliminará esta regla recurrente. No ha generado ningún movimiento todavía.',
        etiquetaConfirmar: 'Eliminar'
      }).then(function (ok) {
        if (!ok) return;
        FP.store.eliminarRecurrente(rec.id, false);
        ui.toast('Movimiento recurrente eliminado.', { tipo: 'exito' });
        if (ctx.refrescar) ctx.refrescar();
      });
      return;
    }

    ui.dialogo({
      titulo: 'Eliminar "' + rec.descripcion + '"',
      contenido: [
        el('p', null, 'Esta regla ya generó ' + generados + ' movimiento(s) en tu histórico. ' +
          '¿Qué quieres hacer con ellos?'),
        el('div', { class: 'alerta alerta--info mt-4' }, [
          el('span', { class: 'alerta__icono', 'aria-hidden': 'true' }, 'ℹ'),
          el('div', { class: 'alerta__cuerpo' }, [
            el('p', { class: 'alerta__texto', style: 'margin-top:0' },
              'Si conservas los movimientos, tus meses anteriores siguen cuadrando. ' +
              'Si los borras, cambiarán los totales de esos meses.')
          ])
        ])
      ],
      acciones: [
        { etiqueta: 'Cancelar', alHacerClic: function (cerrar) { cerrar(); } },
        {
          etiqueta: 'Eliminar todo',
          clase: 'btn--peligro',
          alHacerClic: function (cerrar) {
            cerrar();
            ui.confirmar({
              titulo: '¿Eliminar también los ' + generados + ' movimientos?',
              mensaje: 'Los totales de los meses afectados cambiarán.',
              consecuencia: 'Esta acción no se puede deshacer.',
              etiquetaConfirmar: 'Sí, eliminar todo'
            }).then(function (ok) {
              if (!ok) return;
              FP.store.eliminarRecurrente(rec.id, true);
              ui.toast('Recurrente y sus movimientos eliminados.', { tipo: 'exito' });
              if (ctx.refrescar) ctx.refrescar();
            });
          }
        },
        {
          etiqueta: 'Conservar movimientos',
          clase: 'btn--primario',
          alHacerClic: function (cerrar) {
            FP.store.eliminarRecurrente(rec.id, false);
            ui.toast('Recurrente eliminado. Los movimientos ya generados se conservan.', { tipo: 'exito' });
            cerrar();
            if (ctx.refrescar) ctx.refrescar();
          }
        }
      ]
    });
  }

  return {
    titulo: 'Recurrentes',
    icono: '🔁',
    enNavegacion: false,
    subtitulo: function () {
      const n = FP.store.state.recurrentes.filter(function (r) { return r.activo; }).length;
      return n ? n + ' recurrente(s) activo(s)' : 'Sin movimientos recurrentes';
    },
    render: render
  };
})();
