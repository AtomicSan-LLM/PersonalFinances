/* ==========================================================================
   S06 — Categorías
   Crear, editar, desactivar y eliminar categorías (PA-05 y PA-06).
   ========================================================================== */
window.FP = window.FP || {};
FP.vistas = FP.vistas || {};

FP.vistas.categorias = (function () {
  'use strict';

  const U = FP.util;
  const el = U.el;
  const ui = FP.ui;

  function render(cont, ctx) {
    cont.appendChild(el('div', { class: 'fila fila--entre', style: 'margin-bottom:16px' }, [
      el('p', { class: 'texto-sm texto-apagado' },
        'Cada categoría pertenece a ingresos o a gastos. Los topes de presupuesto solo aplican a las de gasto.'),
      el('button', {
        type: 'button', class: 'btn btn--primario',
        onclick: function () { FP.formularios.categoria({ alGuardar: ctx.refrescar }); }
      }, '＋ Nueva categoría')
    ]));

    cont.appendChild(el('div', { class: 'rejilla rejilla--2' }, [
      grupo('gasto', 'Gastos', '💸', ctx),
      grupo('ingreso', 'Ingresos', '💰', ctx)
    ]));
  }

  function grupo(tipo, titulo, icono, ctx) {
    const cats = FP.store.categoriasDe(tipo, true);
    const tarjeta = el('section', { class: 'tarjeta', 'aria-label': 'Categorías de ' + titulo }, [
      el('div', { class: 'fila fila--entre', style: 'margin-bottom:8px' }, [
        el('h2', { class: 'seccion__titulo' }, [
          el('span', { 'aria-hidden': 'true' }, icono + ' '), titulo
        ]),
        el('span', { class: 'texto-sm texto-apagado' }, cats.length + ' categoría(s)')
      ])
    ]);

    if (!cats.length) {
      tarjeta.appendChild(ui.vacio({
        icono: icono,
        titulo: 'No tienes categorías de ' + titulo.toLowerCase(),
        texto: 'Créalas para poder clasificar tus movimientos.',
        accion: {
          etiqueta: '＋ Crear categoría',
          alHacerClic: function () { FP.formularios.categoria({ tipoInicial: tipo, alGuardar: ctx.refrescar }); }
        }
      }));
      return tarjeta;
    }

    const lista = el('ul');
    cats.forEach(function (cat) { lista.appendChild(fila(cat, ctx)); });
    tarjeta.appendChild(lista);
    return tarjeta;
  }

  function fila(cat, ctx) {
    const uso = FP.store.usoDeCategoria(cat.id);
    const inactiva = cat.activa === false;

    const detalles = [];
    detalles.push(uso.movimientos + ' movimiento(s)');
    if (uso.topes) detalles.push(uso.topes + ' tope(s)');
    if (uso.recurrentes) detalles.push(uso.recurrentes + ' recurrente(s)');

    return el('li', { class: 'movimiento' }, [
      el('span', {
        class: 'movimiento__marca movimiento__marca--' + cat.tipo,
        'aria-hidden': 'true',
        style: inactiva ? 'opacity:.5' : ''
      }, cat.icono || '📦'),

      el('div', { class: 'movimiento__cuerpo' }, [
        el('div', { class: 'movimiento__titulo', style: inactiva ? 'opacity:.6' : '' }, cat.nombre),
        el('div', { class: 'movimiento__meta' }, [
          el('span', null, detalles.join(' · ')),
          inactiva ? ui.distintivo('Desactivada', 'neutro', '⏸') : null
        ])
      ]),

      ui.menuAcciones([
        {
          etiqueta: 'Editar', icono: '✏️',
          alHacerClic: function () { FP.formularios.categoria({ categoria: cat, alGuardar: ctx.refrescar }); }
        },
        {
          etiqueta: inactiva ? 'Reactivar' : 'Desactivar', icono: inactiva ? '▶' : '⏸',
          alHacerClic: function () {
            FP.store.actualizarCategoria(cat.id, { activa: inactiva });
            ui.toast(inactiva ? 'Categoría reactivada.' : 'Categoría desactivada. No aparecerá al registrar movimientos.',
              { tipo: 'exito' });
          }
        },
        uso.movimientos ? {
          etiqueta: 'Ver movimientos', icono: '📋',
          alHacerClic: function () { ctx.irA('movimientos', { categoriaId: cat.id }); }
        } : null,
        {
          etiqueta: 'Eliminar', icono: '🗑', peligro: true,
          alHacerClic: function () { FP.formularios.eliminarCategoria(cat, ctx.refrescar); }
        }
      ], 'Acciones de ' + cat.nombre)
    ]);
  }

  return {
    titulo: 'Categorías',
    icono: '🏷️',
    enNavegacion: false,
    subtitulo: function () {
      return FP.store.state.categorias.length + ' categorías definidas';
    },
    render: render
  };
})();
