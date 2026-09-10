/* ==========================================================================
   ui.js — Componentes reutilizables (sección 16 del diseño)
   Todos los estados se comunican con color + texto, nunca solo con color.
   ========================================================================== */
window.FP = window.FP || {};

FP.ui = (function () {
  'use strict';

  const U = FP.util;
  const el = U.el;

  /* ========================================================= diálogos == */

  /**
   * Abre un diálogo modal. Se crea un <dialog> por llamada para que puedan
   * apilarse (por ejemplo, una confirmación sobre un formulario abierto).
   *
   * opciones = { titulo, descripcion, contenido, acciones:[], ancho, alCerrar }
   * Cada acción: { etiqueta, clase, alHacerClic(cerrar), autoFoco, tipo }
   */
  function dialogo(opciones) {
    const op = opciones || {};
    const idTitulo = U.uid('dlg');

    const d = el('dialog', {
      class: 'dialogo' + (op.ancho ? ' dialogo--ancho' : ''),
      'aria-labelledby': idTitulo
    });

    const cuerpo = el('div', { class: 'dialogo__cuerpo' });
    U.agregar(cuerpo, op.contenido);

    const pie = el('div', { class: 'dialogo__pie' });

    function cerrar(valor) {
      d.dataset.valor = valor === undefined ? '' : String(valor);
      if (d.open) d.close();
    }

    (op.acciones || []).forEach(function (a) {
      const b = el('button', {
        type: a.tipo || 'button',
        class: 'btn ' + (a.clase || ''),
        onclick: function (ev) {
          if (a.alHacerClic) a.alHacerClic(cerrar, ev);
          else cerrar();
        }
      }, a.etiqueta);
      if (a.autoFoco) b.dataset.autofoco = '1';
      pie.appendChild(b);
    });

    U.agregar(d, [
      el('div', { class: 'dialogo__cabecera' }, [
        el('div', null, [
          el('h2', { class: 'dialogo__titulo', id: idTitulo }, op.titulo || ''),
          op.descripcion ? el('p', { class: 'dialogo__descripcion' }, op.descripcion) : null
        ]),
        el('button', {
          type: 'button', class: 'btn-icono', 'aria-label': 'Cerrar',
          onclick: function () { cerrar(); }
        }, '✕')
      ]),
      cuerpo,
      (op.acciones || []).length ? pie : null
    ]);

    d.addEventListener('close', function () {
      if (op.alCerrar) op.alCerrar(d.dataset.valor);
      d.remove();
    });

    /* Cerrar al pulsar fuera del contenido. */
    d.addEventListener('click', function (ev) {
      if (ev.target === d) cerrar();
    });

    document.body.appendChild(d);
    d.showModal();

    /* Foco inicial: primer campo del formulario o botón marcado. */
    setTimeout(function () {
      const auto = d.querySelector('[data-autofoco]');
      const primero = d.querySelector('.dialogo__cuerpo input:not([type=hidden]):not([disabled]), ' +
        '.dialogo__cuerpo select, .dialogo__cuerpo textarea, .dialogo__cuerpo button');
      const objetivo = (primero || auto);
      if (objetivo) { try { objetivo.focus(); } catch (e) { /* sin foco */ } }
    }, 30);

    return { elemento: d, cerrar: cerrar, cuerpo: cuerpo };
  }

  /**
   * Confirmación para acciones destructivas (sección 18 del diseño):
   * qué se eliminará, qué consecuencias tiene y qué debe hacer el usuario.
   */
  function confirmar(opciones) {
    const op = opciones || {};
    return new Promise(function (resolver) {
      let respondido = false;
      const d = dialogo({
        titulo: op.titulo || '¿Confirmas la acción?',
        contenido: [
          el('p', null, op.mensaje || ''),
          op.detalle ? el('p', { class: 'texto-apagado texto-sm mt-3' }, op.detalle) : null,
          op.consecuencia ? el('div', { class: 'alerta alerta--advertencia mt-4' }, [
            el('span', { class: 'alerta__icono', 'aria-hidden': 'true' }, '⚠'),
            el('div', { class: 'alerta__cuerpo' }, [
              el('p', { class: 'alerta__texto', style: 'margin-top:0' }, op.consecuencia)
            ])
          ]) : null
        ],
        acciones: [
          {
            etiqueta: op.etiquetaCancelar || 'Cancelar',
            alHacerClic: function (cerrar) { respondido = true; resolver(false); cerrar(); }
          },
          {
            etiqueta: op.etiquetaConfirmar || 'Eliminar',
            clase: op.peligro === false ? 'btn--primario' : 'btn--peligro',
            autoFoco: true,
            alHacerClic: function (cerrar) { respondido = true; resolver(true); cerrar(); }
          }
        ],
        alCerrar: function () { if (!respondido) resolver(false); }
      });
      /* El botón de confirmar recibe el foco, no el de cancelar. */
      setTimeout(function () {
        const b = d.elemento.querySelector('[data-autofoco]');
        if (b) b.focus();
      }, 40);
    });
  }

  /* =========================================================== toasts == */

  function toast(texto, opciones) {
    const op = opciones || {};
    const cont = document.getElementById('toasts');
    if (!cont) return;

    const t = el('div', { class: 'toast' + (op.tipo ? ' toast--' + op.tipo : '') }, [
      el('span', { class: 'toast__texto' }, texto)
    ]);

    let temporizador = null;
    function quitar() {
      clearTimeout(temporizador);
      if (t.parentNode) t.parentNode.removeChild(t);
    }

    if (op.accion) {
      t.appendChild(el('button', {
        type: 'button', class: 'btn btn--sm',
        onclick: function () { op.accion.alHacerClic(); quitar(); }
      }, op.accion.etiqueta));
    }
    t.appendChild(el('button', {
      type: 'button', class: 'btn-icono', 'aria-label': 'Cerrar aviso', onclick: quitar
    }, '✕'));

    cont.appendChild(t);
    temporizador = setTimeout(quitar, op.duracion || (op.accion ? 8000 : 4000));
    return quitar;
  }

  /** Mensaje solo para lectores de pantalla. */
  function anunciar(texto) {
    const n = document.getElementById('anuncios');
    if (!n) return;
    n.textContent = '';
    setTimeout(function () { n.textContent = texto; }, 60);
  }

  /* ======================================================= elementos === */

  function distintivo(texto, severidad, icono) {
    return el('span', { class: 'distintivo distintivo--' + (severidad || 'neutro') }, [
      icono ? el('span', { 'aria-hidden': 'true' }, icono) : null,
      texto
    ]);
  }

  const ICONO_ESTADO = { 'excedido': '!', 'cerca': '⚠', 'ok': '✓', 'sin-tope': '–' };

  /** `etiqueta` permite matizar el estado (por ejemplo, "Tope agotado" al 100 %). */
  function distintivoEstado(estado, etiqueta) {
    return distintivo(
      etiqueta || FP.dominio.ETIQUETAS_ESTADO[estado] || estado,
      FP.dominio.SEVERIDAD_ESTADO[estado] || 'neutro',
      ICONO_ESTADO[estado]
    );
  }

  /** Barra de progreso accesible. `pct` puede superar 100 (tope excedido). */
  function barraProgreso(pct, severidad, etiqueta) {
    const valor = isFinite(pct) ? pct : 0;
    return el('div', {
      class: 'barra',
      role: 'progressbar',
      'aria-valuenow': Math.round(U.clamp(valor, 0, 100)),
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-label': etiqueta || 'Progreso'
    }, [
      el('div', {
        class: 'barra__relleno barra__relleno--' + (severidad || 'neutro'),
        style: 'width:' + U.clamp(valor, 0, 100) + '%'
      })
    ]);
  }

  function vacio(opciones) {
    const op = opciones || {};
    return el('div', { class: 'vacio' }, [
      op.icono ? el('div', { class: 'vacio__icono', 'aria-hidden': 'true' }, op.icono) : null,
      el('p', { class: 'vacio__titulo' }, op.titulo || ''),
      op.texto ? el('p', { class: 'vacio__texto' }, op.texto) : null,
      op.accion ? el('div', { class: 'vacio__accion' }, [
        el('button', {
          type: 'button', class: 'btn btn--primario', onclick: op.accion.alHacerClic
        }, op.accion.etiqueta)
      ]) : null
    ]);
  }

  function esqueleto(lineas) {
    const cont = el('div');
    for (let i = 0; i < (lineas || 3); i++) {
      cont.appendChild(el('div', { class: 'esqueleto', style: 'width:' + (100 - i * 12) + '%' }));
    }
    return cont;
  }

  function cabeceraSeccion(titulo, acciones) {
    return el('div', { class: 'seccion__cabecera' }, [
      el('h2', { class: 'seccion__titulo' }, titulo),
      acciones ? el('div', { class: 'fila' }, acciones) : null
    ]);
  }

  /** Menú contextual "⋮" con cierre por clic fuera y Escape. */
  function menuAcciones(items, etiqueta) {
    const envoltura = el('div', { class: 'menu-envoltura' });
    const boton = el('button', {
      type: 'button', class: 'btn-icono',
      'aria-haspopup': 'true', 'aria-expanded': 'false',
      'aria-label': etiqueta || 'Más acciones'
    }, '⋮');

    let menu = null;

    function cerrar() {
      if (!menu) return;
      menu.remove();
      menu = null;
      boton.setAttribute('aria-expanded', 'false');
      document.removeEventListener('click', fuera, true);
      document.removeEventListener('keydown', teclado, true);
    }

    function fuera(ev) { if (!envoltura.contains(ev.target)) cerrar(); }
    function teclado(ev) { if (ev.key === 'Escape') { cerrar(); boton.focus(); } }

    function abrir() {
      menu = el('div', { class: 'menu', role: 'menu' });
      items.filter(Boolean).forEach(function (item) {
        menu.appendChild(el('button', {
          type: 'button', role: 'menuitem',
          class: item.peligro ? 'peligro' : '',
          onclick: function () { cerrar(); item.alHacerClic(); }
        }, [
          item.icono ? el('span', { 'aria-hidden': 'true' }, item.icono) : null,
          item.etiqueta
        ]));
      });
      envoltura.appendChild(menu);
      boton.setAttribute('aria-expanded', 'true');
      const primero = menu.querySelector('button');
      if (primero) primero.focus();
      setTimeout(function () {
        document.addEventListener('click', fuera, true);
        document.addEventListener('keydown', teclado, true);
      }, 0);
    }

    boton.addEventListener('click', function () { if (menu) cerrar(); else abrir(); });
    envoltura.appendChild(boton);
    return envoltura;
  }

  /* ================================================== filas de datos === */

  /** Fila de movimiento (lista compacta del dashboard y tarjetas en móvil). */
  function filaMovimiento(mov, opciones) {
    const op = opciones || {};
    const cat = FP.store.categoria(mov.categoriaId);
    const esIngreso = mov.tipo === 'ingreso';

    const meta = [
      el('span', null, esIngreso ? 'Ingreso' : 'Gasto'),
      el('span', { 'aria-hidden': 'true' }, '·'),
      el('span', null, cat ? cat.nombre : 'Sin categoría'),
      el('span', { 'aria-hidden': 'true' }, '·'),
      el('span', null, U.fechaCorta(mov.fecha, op.mostrarAnio))
    ];

    if (mov.recurrenteId || mov.recurrenteOrigen) {
      meta.push(distintivo('Generado por recurrente', 'info', '🔁'));
    }
    if (mov.revisar) {
      meta.push(distintivo('Por revisar', 'advertencia', '👁'));
    }
    if (mov.fecha > U.hoyISO()) {
      meta.push(distintivo('Fecha futura', 'neutro', '📅'));
    }

    return el('div', { class: 'movimiento' }, [
      el('span', {
        class: 'movimiento__marca movimiento__marca--' + mov.tipo,
        'aria-hidden': 'true'
      }, cat && cat.icono ? cat.icono : (esIngreso ? '↑' : '↓')),

      el('div', { class: 'movimiento__cuerpo' }, [
        el('div', { class: 'movimiento__titulo' },
          mov.descripcion || (cat ? cat.nombre : (esIngreso ? 'Ingreso' : 'Gasto'))),
        el('div', { class: 'movimiento__meta' }, meta)
      ]),

      el('span', { class: 'movimiento__monto monto--' + mov.tipo },
        FP.dinero.formatoConSigno(mov.monto, mov.tipo)),

      (op.alEditar || op.alEliminar) ? menuAcciones([
        op.alEditar ? { etiqueta: 'Editar', icono: '✏️', alHacerClic: function () { op.alEditar(mov); } } : null,
        (op.alRevisar && mov.revisar)
          ? { etiqueta: 'Marcar como revisado', icono: '✓', alHacerClic: function () { op.alRevisar(mov); } }
          : null,
        op.alEliminar
          ? { etiqueta: 'Eliminar', icono: '🗑', peligro: true, alHacerClic: function () { op.alEliminar(mov); } }
          : null
      ], 'Acciones del movimiento: ' + (mov.descripcion || 'movimiento')) : null
    ]);
  }

  /** Fila de categoría del presupuesto: tope, gastado, disponible y estado. */
  function filaTope(fila, opciones) {
    const op = opciones || {};
    const sinTope = fila.tope === null;
    const excedido = fila.estado === 'excedido';

    const cifras = sinTope
      ? FP.dinero.formato(fila.gastado) + ' gastado'
      : FP.dinero.formato(fila.gastado) + ' de ' + FP.dinero.formato(fila.tope);

    return el('div', { class: 'tope' }, [
      el('div', { class: 'tope__cabecera' }, [
        el('div', null, [
          el('div', { class: 'tope__nombre' }, [
            fila.categoria.icono ? el('span', { 'aria-hidden': 'true' }, fila.categoria.icono + ' ') : null,
            fila.categoria.nombre
          ]),
          el('div', { class: 'tope__cifras' }, cifras)
        ]),
        el('div', { class: 'fila', style: 'gap:8px' }, [
          !sinTope ? el('span', { class: 'texto-sm num', style: 'font-weight:700' },
            U.formatoPorcentaje(fila.porcentaje, 0)) : null,
          op.acciones ? op.acciones(fila) : null
        ])
      ]),

      sinTope
        ? null
        : barraProgreso(fila.porcentaje, FP.dominio.SEVERIDAD_ESTADO[fila.estado],
          fila.categoria.nombre + ': ' + U.formatoPorcentaje(fila.porcentaje, 0) + ' del tope'),

      el('div', { class: 'tope__pie' }, [
        el('span', {
          class: 'tope__disponible',
          style: excedido ? 'color:var(--error)' : (sinTope ? 'color:var(--texto-3)' : '')
        }, sinTope
          ? 'Sin tope definido para este mes'
          : (excedido
            ? 'Excedido: ' + FP.dinero.formato(Math.abs(fila.disponible))
            : 'Disponible: ' + FP.dinero.formato(fila.disponible))),
        distintivoEstado(fila.estado, fila.etiquetaEstado)
      ])
    ]);
  }

  /** Tarjeta de aviso accionable (sección 13 del diseño). */
  function tarjetaAlerta(alerta, opciones) {
    const op = opciones || {};
    const icono = alerta.severidad === 'error' ? '!' : '⚠';

    return el('div', { class: 'alerta alerta--' + alerta.severidad }, [
      el('span', { class: 'alerta__icono', 'aria-hidden': 'true' }, icono),
      el('div', { class: 'alerta__cuerpo' }, [
        el('div', { class: 'alerta__titulo' }, [
          alerta.titulo,
          distintivo(
            alerta.etiqueta || (alerta.condicion === 'meta' ? 'Meta en riesgo' : 'Revisar presupuesto'),
            alerta.severidad === 'error' ? 'error' : 'advertencia'
          )
        ]),
        el('p', { class: 'alerta__texto' }, alerta.mensaje),
        alerta.cifras && alerta.cifras.length
          ? el('div', { class: 'alerta__cifras' }, alerta.cifras.map(function (c, i) {
            return el('span', null, (i > 0 ? '  ·  ' : '') + c[0] + ': ' + c[1]);
          }))
          : null,
        (op.alVer || op.alDescartar) ? el('div', { class: 'alerta__acciones' }, [
          op.alVer ? el('button', {
            type: 'button', class: 'btn btn--sm',
            onclick: function () { op.alVer(alerta); }
          }, op.etiquetaVer || 'Ver detalle') : null,
          op.alDescartar ? el('button', {
            type: 'button', class: 'btn btn--sm btn--fantasma',
            onclick: function () { op.alDescartar(alerta); }
          }, 'Descartar') : null
        ]) : null
      ])
    ]);
  }

  /* ================================================ campos de formulario */

  /**
   * campo({ etiqueta, ayuda, error, control, id })
   *
   * Enlaza etiqueta, ayuda y error con el control real. Si el control es un
   * contenedor (campo de dinero, grupo de botones, lista de radios), se usa
   * `control.input` cuando existe y, si no, se etiqueta el grupo con
   * aria-labelledby, porque <label for> solo funciona sobre controles nativos.
   */
  function campo(opciones) {
    const op = opciones || {};
    const control = op.control;
    const real = (control && control.input) ? control.input : control;
    const etiquetable = !!real && /^(INPUT|SELECT|TEXTAREA)$/.test(real.tagName);

    const id = op.id || (real && real.id) || U.uid('campo');
    if (real && !real.id) real.id = id;

    const describe = [];
    const nodos = [];

    if (op.etiqueta) {
      const contenido = [
        op.etiqueta,
        op.opcional ? el('span', { class: 'texto-apagado', style: 'font-weight:400' }, ' (opcional)') : null
      ];

      if (etiquetable) {
        nodos.push(el('label', { class: 'campo__etiqueta', for: id }, contenido));
      } else {
        const idEtiqueta = id + '-etiqueta';
        nodos.push(el('span', { class: 'campo__etiqueta', id: idEtiqueta }, contenido));
        if (control) control.setAttribute('aria-labelledby', idEtiqueta);
      }
    }
    nodos.push(control);

    if (op.ayuda) {
      const idAyuda = id + '-ayuda';
      describe.push(idAyuda);
      nodos.push(el('p', { class: 'campo__ayuda', id: idAyuda }, op.ayuda));
    }
    if (op.error) {
      const idError = id + '-error';
      describe.push(idError);
      nodos.push(el('p', { class: 'campo__error', id: idError }, op.error));
      if (real) real.setAttribute('aria-invalid', 'true');
    }
    if (real && describe.length) real.setAttribute('aria-describedby', describe.join(' '));

    return el('div', { class: 'campo' }, nodos);
  }

  /** Campo de dinero con símbolo y formateo al salir del campo. */
  function campoMonto(opciones) {
    const op = opciones || {};
    const input = el('input', {
      type: 'text',
      inputmode: 'decimal',
      autocomplete: 'off',
      value: (op.valor !== undefined && op.valor !== null && op.valor !== '') ? FP.dinero.paraCampo(op.valor) : '',
      placeholder: op.placeholder || '0',
      name: op.nombre || 'monto'
    });

    input.addEventListener('blur', function () {
      const n = FP.dinero.leer(input.value);
      input.value = isFinite(n) ? FP.dinero.paraCampo(n) : '';
      if (op.alCambiar) op.alCambiar(isFinite(n) ? n : NaN);
    });
    input.addEventListener('input', function () {
      if (op.alEscribir) op.alEscribir(FP.dinero.leer(input.value));
    });

    const envoltura = el('div', { class: 'campo-monto' }, [
      el('span', { class: 'campo-monto__simbolo', 'aria-hidden': 'true' }, FP.dinero.simbolo()),
      input
    ]);
    envoltura.input = input;
    return envoltura;
  }

  /** Desplegable de categorías filtrado por tipo, con opción de crear una nueva. */
  function selectorCategoria(opciones) {
    const op = opciones || {};
    const select = el('select', { name: op.nombre || 'categoriaId' });

    function pintar(tipo, seleccionado) {
      U.vaciar(select);
      select.appendChild(el('option', { value: '' }, 'Seleccionar categoría'));
      const cats = FP.store.categoriasDe(tipo);
      cats.forEach(function (c) {
        select.appendChild(el('option', {
          value: c.id,
          selected: c.id === seleccionado
        }, (c.icono ? c.icono + '  ' : '') + c.nombre));
      });
      if (op.permitirCrear) {
        select.appendChild(el('option', { value: '__nueva__' }, '＋ Crear categoría…'));
      }
      /* Si la categoría seleccionada ya no aplica al tipo, se limpia. */
      if (seleccionado && !cats.some(function (c) { return c.id === seleccionado; })) select.value = '';
    }

    pintar(op.tipo, op.valor);

    select.addEventListener('change', function () {
      if (select.value === '__nueva__') {
        select.value = op.valor || '';
        if (op.alCrear) op.alCrear(function (nuevaId) {
          pintar(op.tipoActual ? op.tipoActual() : op.tipo, nuevaId);
          select.value = nuevaId;
          if (op.alCambiar) op.alCambiar(nuevaId);
        });
      } else if (op.alCambiar) {
        op.alCambiar(select.value);
      }
    });

    select.repintar = pintar;
    return select;
  }

  /** Selector segmentado Ingreso / Gasto. */
  function selectorTipo(valor, alCambiar) {
    const grupo = el('div', { class: 'grupo-segmentado', role: 'group', 'aria-label': 'Tipo de movimiento' });
    let actual = valor;

    [['ingreso', 'Ingreso'], ['gasto', 'Gasto']].forEach(function (par) {
      const b = el('button', {
        type: 'button',
        dataset: { tipo: par[0] },
        'aria-pressed': String(actual === par[0]),
        onclick: function () {
          actual = par[0];
          U.$$('button', grupo).forEach(function (x) {
            x.setAttribute('aria-pressed', String(x.dataset.tipo === actual));
          });
          if (alCambiar) alCambiar(actual);
        }
      }, par[1]);
      grupo.appendChild(b);
    });

    grupo.valor = function () { return actual; };
    return grupo;
  }

  return {
    dialogo: dialogo, confirmar: confirmar, toast: toast, anunciar: anunciar,
    distintivo: distintivo, distintivoEstado: distintivoEstado, barraProgreso: barraProgreso,
    vacio: vacio, esqueleto: esqueleto, cabeceraSeccion: cabeceraSeccion, menuAcciones: menuAcciones,
    filaMovimiento: filaMovimiento, filaTope: filaTope, tarjetaAlerta: tarjetaAlerta,
    campo: campo, campoMonto: campoMonto, selectorCategoria: selectorCategoria, selectorTipo: selectorTipo
  };
})();
