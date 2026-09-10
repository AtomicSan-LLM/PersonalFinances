/* ==========================================================================
   formularios.js — Diálogos de alta y edición
   S03 Nuevo movimiento · S04 Editar movimiento · S05 Topes y meta ·
   S06 Categorías · S07 Recurrentes
   ========================================================================== */
window.FP = window.FP || {};

FP.formularios = (function () {
  'use strict';

  const U = FP.util;
  const el = U.el;
  const ui = FP.ui;

  /* ---------------------------------------------------------------------
     Flujo B del diseño: tras guardar un gasto se comprueba si alguna
     categoría cruzó el umbral de aviso o superó su tope, y se avisa.
     --------------------------------------------------------------------- */

  function capturar(claves) {
    return claves.map(function (k) {
      return {
        periodo: k.periodo,
        categoriaId: k.categoriaId,
        estado: FP.dominio.estadoDeCategoria(k.periodo, k.categoriaId).estado
      };
    });
  }

  function avisarCambios(antes) {
    antes.forEach(function (previo) {
      const ahora = FP.dominio.estadoDeCategoria(previo.periodo, previo.categoriaId);
      if (ahora.estado === previo.estado) return;
      const cat = FP.store.categoria(previo.categoriaId);
      if (!cat) return;

      if (ahora.estado === 'excedido') {
        ui.toast('Superaste el tope de ' + cat.nombre + ' en ' +
          FP.dinero.formato(ahora.gastado - ahora.tope) + '.', { tipo: 'error', duracion: 7000 });
      } else if (ahora.estado === 'cerca') {
        ui.toast('Vas en el ' + U.formatoPorcentaje((ahora.gastado / ahora.tope) * 100, 0) +
          ' del tope de ' + cat.nombre + '.', { tipo: 'advertencia', duracion: 7000 });
      }
    });
  }

  /* =====================================================================
     S03 / S04 — Movimiento
     ===================================================================== */

  function movimiento(opciones) {
    const op = opciones || {};
    const original = op.movimiento || null;
    const editando = !!original;
    const cfg = FP.store.state.config;

    /* Fecha por defecto: hoy si se está en el mes actual; si el usuario está
       consultando otro mes, el día 1 de ese mes (para no registrar fuera de
       lo que está viendo). */
    function fechaInicial() {
      if (original) return original.fecha;
      const actual = U.periodoActual();
      if (!op.periodo || op.periodo === actual) return U.hoyISO();
      return op.periodo + '-01';
    }

    const datos = {
      tipo: original ? original.tipo : (op.tipoInicial || 'gasto'),
      monto: original ? original.monto : '',
      fecha: fechaInicial(),
      categoriaId: original ? original.categoriaId : '',
      descripcion: original ? original.descripcion : ''
    };
    let errores = {};

    const d = ui.dialogo({
      titulo: editando ? 'Editar movimiento' : 'Nuevo movimiento',
      descripcion: editando ? null : '¿Qué quieres registrar?',
      contenido: [],
      acciones: [
        { etiqueta: 'Cancelar', alHacerClic: function (cerrar) { cerrar(); } },
        {
          etiqueta: editando ? 'Guardar cambios' : 'Guardar',
          clase: 'btn--primario',
          alHacerClic: function (cerrar) { guardar(cerrar); }
        }
      ]
    });

    let selCategoria = null;

    function pintar() {
      U.vaciar(d.cuerpo);

      /* Tipo */
      const grupoTipo = ui.selectorTipo(datos.tipo, function (t) {
        datos.tipo = t;
        datos.categoriaId = '';
        if (selCategoria) selCategoria.repintar(t, '');
      });
      d.cuerpo.appendChild(ui.campo({
        etiqueta: 'Tipo de movimiento',
        control: grupoTipo,
        error: errores.tipo
      }));

      /* Monto */
      const monto = ui.campoMonto({
        valor: datos.monto,
        alEscribir: function (n) { datos.monto = isFinite(n) ? n : ''; },
        alCambiar: function (n) { datos.monto = isFinite(n) ? n : ''; }
      });
      d.cuerpo.appendChild(ui.campo({
        etiqueta: 'Monto',
        control: monto,
        error: errores.monto
      }));

      /* Fecha y categoría */
      const fecha = el('input', {
        type: 'date', value: datos.fecha, name: 'fecha',
        max: cfg.permitirFechaFutura ? null : U.hoyISO(),
        onchange: function (e) { datos.fecha = e.target.value; }
      });

      selCategoria = ui.selectorCategoria({
        tipo: datos.tipo,
        valor: datos.categoriaId,
        permitirCrear: true,
        tipoActual: function () { return datos.tipo; },
        alCambiar: function (v) { datos.categoriaId = v; },
        alCrear: function (listo) {
          categoria({
            tipoInicial: datos.tipo,
            alGuardar: function (nueva) {
              datos.categoriaId = nueva.id;
              listo(nueva.id);
            }
          });
        }
      });

      const fila = el('div', { class: 'fila-campos' }, [
        ui.campo({ etiqueta: 'Fecha', control: fecha, error: errores.fecha }),
        ui.campo({ etiqueta: 'Categoría', control: selCategoria, error: errores.categoriaId })
      ]);
      d.cuerpo.appendChild(fila);

      /* Descripción */
      const desc = el('input', {
        type: 'text', value: datos.descripcion, name: 'descripcion',
        maxlength: '120', autocomplete: 'off',
        placeholder: datos.tipo === 'ingreso' ? 'Pago mensual' : 'Compra del mercado',
        oninput: function (e) { datos.descripcion = e.target.value; }
      });
      d.cuerpo.appendChild(ui.campo({
        etiqueta: 'Descripción',
        opcional: !cfg.descripcionObligatoria,
        control: desc,
        error: errores.descripcion
      }));

      /* Avisos contextuales */
      if (datos.fecha && datos.fecha > U.hoyISO()) {
        d.cuerpo.appendChild(el('p', { class: 'campo__ayuda' },
          'Este movimiento quedará registrado en ' + U.periodoLegible(U.periodoDe(datos.fecha)) + ', con fecha futura.'));
      }
      if (original && original.recurrenteId) {
        d.cuerpo.appendChild(el('p', { class: 'campo__ayuda mt-3' },
          'Este movimiento lo generó un recurrente. Editarlo aquí no cambia la regla recurrente.'));
      }
    }

    function guardar(cerrar) {
      errores = FP.dominio.validarMovimiento(datos);
      if (FP.dominio.hayErrores(errores)) {
        pintar();
        const primerError = d.cuerpo.querySelector('[aria-invalid="true"]');
        if (primerError) primerError.focus();
        ui.anunciar('El formulario tiene errores. Revisa los campos marcados.');
        return;
      }

      /* Categorías afectadas antes del cambio (para los avisos). */
      const claves = [];
      if (datos.tipo === 'gasto') {
        claves.push({ periodo: U.periodoDe(datos.fecha), categoriaId: datos.categoriaId });
      }
      if (original && original.tipo === 'gasto') {
        claves.push({ periodo: U.periodoDe(original.fecha), categoriaId: original.categoriaId });
      }
      const antes = capturar(claves);

      if (editando) {
        FP.store.actualizarMovimiento(original.id, {
          tipo: datos.tipo, monto: datos.monto, fecha: datos.fecha,
          categoriaId: datos.categoriaId, descripcion: datos.descripcion,
          revisar: false
        });
        ui.toast('Movimiento actualizado.', { tipo: 'exito' });
      } else {
        FP.store.crearMovimiento(datos);
        ui.toast('Movimiento registrado.', { tipo: 'exito' });
      }

      avisarCambios(antes);
      cerrar();
      if (op.alGuardar) op.alGuardar(datos);
    }

    pintar();
    return d;
  }

  /* =====================================================================
     S06 — Categoría
     ===================================================================== */

  function categoria(opciones) {
    const op = opciones || {};
    const original = op.categoria || null;
    const editando = !!original;
    const uso = editando ? FP.store.usoDeCategoria(original.id) : { movimientos: 0, topes: 0, recurrentes: 0 };

    const datos = {
      nombre: original ? original.nombre : '',
      tipo: original ? original.tipo : (op.tipoInicial || 'gasto'),
      icono: original ? original.icono : ''
    };
    let errores = {};

    const ICONOS = ['🏠', '🛒', '🚌', '💡', '🩺', '🎬', '👕', '📚', '🍽', '✈️', '🐾', '🎁',
      '💼', '💵', '📈', '🏦', '📦', '❔'];

    const d = ui.dialogo({
      titulo: editando ? 'Editar categoría' : 'Nueva categoría',
      contenido: [],
      acciones: [
        { etiqueta: 'Cancelar', alHacerClic: function (cerrar) { cerrar(); } },
        {
          etiqueta: editando ? 'Guardar' : 'Crear',
          clase: 'btn--primario',
          alHacerClic: function (cerrar) { guardar(cerrar); }
        }
      ]
    });

    function pintar() {
      U.vaciar(d.cuerpo);

      const nombre = el('input', {
        type: 'text', value: datos.nombre, maxlength: '40', autocomplete: 'off',
        placeholder: 'Mercado',
        oninput: function (e) { datos.nombre = e.target.value; }
      });
      d.cuerpo.appendChild(ui.campo({ etiqueta: 'Nombre', control: nombre, error: errores.nombre }));

      /* PA-06: la categoría es exclusiva de ingresos o de gastos. */
      const bloqueado = editando && uso.movimientos > 0;
      const lista = el('div', { class: 'radio-lista' }, [
        opcionTipo('ingreso', 'Ingreso', 'Dinero que recibes', bloqueado),
        opcionTipo('gasto', 'Gasto', 'Dinero que sale', bloqueado)
      ]);
      d.cuerpo.appendChild(ui.campo({
        etiqueta: 'Tipo',
        control: lista,
        error: errores.tipo,
        ayuda: bloqueado
          ? 'No se puede cambiar el tipo porque la categoría ya tiene ' + uso.movimientos + ' movimiento(s).'
          : 'Los topes de gasto solo aplican a categorías de gasto.'
      }));

      const iconos = el('div', { class: 'fila', style: 'gap:6px' });
      ICONOS.forEach(function (ic) {
        iconos.appendChild(el('button', {
          type: 'button',
          class: 'btn btn--sm' + (datos.icono === ic ? ' btn--primario' : ''),
          style: 'min-width:38px;font-size:1.05rem',
          'aria-pressed': String(datos.icono === ic),
          'aria-label': 'Icono ' + ic,
          onclick: function () { datos.icono = ic; pintar(); }
        }, ic));
      });
      d.cuerpo.appendChild(ui.campo({ etiqueta: 'Icono', opcional: true, control: iconos }));
    }

    function opcionTipo(valor, etiqueta, ayuda, bloqueado) {
      const id = 'tipo-cat-' + valor;
      return el('label', { class: 'radio-opcion', for: id }, [
        el('input', {
          type: 'radio', name: 'tipo-categoria', id: id, value: valor,
          checked: datos.tipo === valor, disabled: bloqueado,
          onchange: function () { datos.tipo = valor; }
        }),
        el('span', null, [
          el('strong', null, etiqueta),
          el('span', { class: 'texto-apagado texto-sm' }, ' — ' + ayuda)
        ])
      ]);
    }

    function guardar(cerrar) {
      errores = FP.dominio.validarCategoria(datos, original ? original.id : null);
      if (FP.dominio.hayErrores(errores)) { pintar(); return; }

      let cat;
      if (editando) {
        cat = FP.store.actualizarCategoria(original.id, datos);
        ui.toast('Categoría actualizada.', { tipo: 'exito' });
      } else {
        cat = FP.store.crearCategoria(datos);
        ui.toast('Categoría creada.', { tipo: 'exito' });
      }
      cerrar();
      if (op.alGuardar) op.alGuardar(cat);
    }

    pintar();
    return d;
  }

  /**
   * PA-05 — Eliminar una categoría.
   * Con dependencias, se exige reasignar a otra categoría del mismo tipo
   * (o desactivarla) antes de poder borrarla.
   */
  function eliminarCategoria(cat, alTerminar) {
    const uso = FP.store.usoDeCategoria(cat.id);
    const tieneDependencias = uso.movimientos > 0 || uso.topes > 0 || uso.recurrentes > 0;

    if (!tieneDependencias) {
      ui.confirmar({
        titulo: 'Eliminar "' + cat.nombre + '"',
        mensaje: 'Se eliminará esta categoría de forma permanente.',
        detalle: 'No tiene movimientos, topes ni recurrentes asociados.',
        etiquetaConfirmar: 'Eliminar categoría'
      }).then(function (ok) {
        if (!ok) return;
        FP.store.eliminarCategoria(cat.id);
        ui.toast('Categoría eliminada.', { tipo: 'exito' });
        if (alTerminar) alTerminar();
      });
      return;
    }

    const candidatas = FP.store.categoriasDe(cat.tipo, true).filter(function (c) { return c.id !== cat.id; });
    let destino = candidatas.length ? candidatas[0].id : '';

    const partes = [];
    if (uso.movimientos) partes.push(uso.movimientos + ' movimiento(s)');
    if (uso.topes) partes.push(uso.topes + ' tope(s) de presupuesto');
    if (uso.recurrentes) partes.push(uso.recurrentes + ' movimiento(s) recurrente(s)');

    const select = el('select', {
      onchange: function (e) { destino = e.target.value; }
    }, candidatas.map(function (c) {
      return el('option', { value: c.id }, (c.icono ? c.icono + '  ' : '') + c.nombre);
    }));

    const d = ui.dialogo({
      titulo: 'No puedes eliminar "' + cat.nombre + '" directamente',
      contenido: [
        el('p', null, 'Esta categoría tiene ' + partes.join(', ') + ' asociados. ' +
          'Si la eliminas sin resolverlos, tu histórico dejaría de cuadrar.'),
        el('p', { class: 'mt-3' }, el('strong', null, 'Opciones:')),
        candidatas.length
          ? ui.campo({
            etiqueta: 'Reasignar todo a esta categoría y luego eliminar',
            control: select,
            ayuda: 'Los movimientos y topes pasarán a la categoría elegida. Los topes se suman si ambas tenían uno en el mismo mes.'
          })
          : el('p', { class: 'campo__ayuda' },
            'No tienes otra categoría de ' + cat.tipo + ' a la que reasignar. Crea una primero o desactiva esta.'),
        el('div', { class: 'alerta alerta--info mt-3' }, [
          el('span', { class: 'alerta__icono', 'aria-hidden': 'true' }, 'ℹ'),
          el('div', { class: 'alerta__cuerpo' }, [
            el('p', { class: 'alerta__texto', style: 'margin-top:0' },
              'Si solo quieres dejar de usarla, desactívala: deja de aparecer al registrar, ' +
              'pero conserva el histórico intacto.')
          ])
        ])
      ],
      acciones: [
        { etiqueta: 'Cancelar', alHacerClic: function (cerrar) { cerrar(); } },
        {
          etiqueta: cat.activa === false ? 'Reactivar' : 'Desactivar',
          alHacerClic: function (cerrar) {
            FP.store.actualizarCategoria(cat.id, { activa: cat.activa === false });
            ui.toast(cat.activa === false ? 'Categoría reactivada.' : 'Categoría desactivada.', { tipo: 'exito' });
            cerrar();
            if (alTerminar) alTerminar();
          }
        },
        candidatas.length ? {
          etiqueta: 'Reasignar y eliminar',
          clase: 'btn--peligro',
          alHacerClic: function (cerrar) {
            const nombreDestino = (FP.store.categoria(destino) || {}).nombre;
            cerrar();
            ui.confirmar({
              titulo: 'Confirmar reasignación',
              mensaje: 'Todo lo de "' + cat.nombre + '" pasará a "' + nombreDestino +
                '" y luego se eliminará "' + cat.nombre + '".',
              consecuencia: 'Esta acción no se puede deshacer.',
              etiquetaConfirmar: 'Reasignar y eliminar'
            }).then(function (ok) {
              if (!ok) return;
              FP.store.eliminarCategoria(cat.id, destino);
              ui.toast('Categoría eliminada y movimientos reasignados a ' + nombreDestino + '.', { tipo: 'exito' });
              if (alTerminar) alTerminar();
            });
          }
        } : null
      ].filter(Boolean)
    });

    return d;
  }

  /* =====================================================================
     S05 — Tope de categoría y meta de ahorro
     ===================================================================== */

  function tope(opciones) {
    const op = opciones || {};
    const periodo = op.periodo;
    const pres = FP.store.presupuesto(periodo);
    const existente = op.categoriaId
      ? (pres.topes || []).find(function (t) { return t.categoriaId === op.categoriaId; })
      : null;

    const datos = {
      categoriaId: op.categoriaId || '',
      monto: existente ? existente.monto : ''
    };
    let errores = {};

    const d = ui.dialogo({
      titulo: existente ? 'Editar tope' : 'Definir tope de gasto',
      descripcion: U.periodoLegible(periodo),
      contenido: [],
      acciones: [
        { etiqueta: 'Cancelar', alHacerClic: function (cerrar) { cerrar(); } },
        { etiqueta: 'Guardar', clase: 'btn--primario', alHacerClic: function (cerrar) { guardar(cerrar); } }
      ]
    });

    function pintar() {
      U.vaciar(d.cuerpo);

      if (op.categoriaId) {
        const cat = FP.store.categoria(op.categoriaId);
        d.cuerpo.appendChild(el('p', { class: 'mt-3', style: 'font-weight:600;margin-bottom:16px' },
          (cat && cat.icono ? cat.icono + ' ' : '') + (cat ? cat.nombre : '')));
      } else {
        const conTope = new Set((pres.topes || []).map(function (t) { return t.categoriaId; }));
        const disponibles = FP.store.categoriasDe('gasto').filter(function (c) { return !conTope.has(c.id); });

        if (!disponibles.length) {
          d.cuerpo.appendChild(el('p', { class: 'campo__ayuda' },
            'Todas tus categorías de gasto ya tienen un tope este mes.'));
        } else {
          const select = el('select', {
            onchange: function (e) { datos.categoriaId = e.target.value; }
          }, [el('option', { value: '' }, 'Seleccionar categoría')].concat(
            disponibles.map(function (c) {
              return el('option', { value: c.id }, (c.icono ? c.icono + '  ' : '') + c.nombre);
            })
          ));
          d.cuerpo.appendChild(ui.campo({ etiqueta: 'Categoría', control: select, error: errores.categoriaId }));
        }
      }

      const monto = ui.campoMonto({
        valor: datos.monto,
        alEscribir: function (n) { datos.monto = isFinite(n) ? n : ''; },
        alCambiar: function (n) { datos.monto = isFinite(n) ? n : ''; }
      });
      d.cuerpo.appendChild(ui.campo({
        etiqueta: 'Tope mensual',
        control: monto,
        error: errores.monto,
        ayuda: 'Máximo que planeas gastar en esta categoría durante ' + U.periodoLegible(periodo) + '.'
      }));

      /* Gasto ya registrado en la categoría elegida. */
      if (datos.categoriaId) {
        const est = FP.dominio.estadoDeCategoria(periodo, datos.categoriaId);
        if (est.gastado > 0) {
          d.cuerpo.appendChild(el('p', { class: 'campo__ayuda' },
            'Ya llevas ' + FP.dinero.formato(est.gastado) + ' gastados en esta categoría este mes.'));
        }
      }
    }

    function guardar(cerrar) {
      errores = {};
      if (!datos.categoriaId) errores.categoriaId = 'Selecciona una categoría.';
      const monto = Number(datos.monto);
      if (!isFinite(monto) || monto <= 0) errores.monto = 'Ingresa un monto mayor que cero.';
      if (FP.dominio.hayErrores(errores)) { pintar(); return; }

      const antes = capturar([{ periodo: periodo, categoriaId: datos.categoriaId }]);
      FP.store.definirTope(periodo, datos.categoriaId, monto);
      ui.toast('Tope guardado.', { tipo: 'exito' });
      avisarCambios(antes);
      cerrar();
      if (op.alGuardar) op.alGuardar();
    }

    pintar();
    return d;
  }

  function metaAhorro(opciones) {
    const op = opciones || {};
    const periodo = op.periodo;
    const pres = FP.store.presupuesto(periodo);
    const r = FP.dominio.resumen(periodo);
    let monto = pres.metaAhorro || '';
    let error = '';

    const d = ui.dialogo({
      titulo: 'Meta de ahorro',
      descripcion: U.periodoLegible(periodo),
      contenido: [],
      acciones: [
        { etiqueta: 'Cancelar', alHacerClic: function (cerrar) { cerrar(); } },
        { etiqueta: 'Guardar', clase: 'btn--primario', alHacerClic: function (cerrar) { guardar(cerrar); } }
      ]
    });

    function pintar() {
      U.vaciar(d.cuerpo);
      const campo = ui.campoMonto({
        valor: monto,
        alEscribir: function (n) { monto = isFinite(n) ? n : ''; },
        alCambiar: function (n) { monto = isFinite(n) ? n : ''; }
      });
      d.cuerpo.appendChild(ui.campo({
        etiqueta: 'Cuánto quieres que te quede este mes',
        control: campo,
        error: error,
        ayuda: 'El ahorro real de este mes va en ' + FP.dinero.formatoSaldo(r.ahorroReal) +
          ' (ingresos − gastos). Deja el valor en cero para no fijar meta.'
      }));
    }

    function guardar(cerrar) {
      const n = Number(monto);
      if (monto !== '' && (!isFinite(n) || n < 0)) {
        error = 'Ingresa un monto válido.'; pintar(); return;
      }
      FP.store.definirMetaAhorro(periodo, monto === '' ? 0 : n);
      ui.toast('Meta de ahorro guardada.', { tipo: 'exito' });
      cerrar();
      if (op.alGuardar) op.alGuardar();
    }

    pintar();
    return d;
  }

  /* =====================================================================
     S07 — Movimiento recurrente
     ===================================================================== */

  function recurrente(opciones) {
    const op = opciones || {};
    const original = op.recurrente || null;
    const editando = !!original;

    const datos = {
      tipo: original ? original.tipo : 'gasto',
      monto: original ? original.monto : '',
      descripcion: original ? original.descripcion : '',
      categoriaId: original ? original.categoriaId : '',
      diaMes: original ? original.diaMes : 1,
      desde: original ? original.desde : U.periodoActual(),
      hasta: original ? (original.hasta || '') : '',
      montoVariable: original ? !!original.montoVariable : false,
      sinFin: original ? !original.hasta : true
    };
    let errores = {};
    let selCategoria = null;

    const d = ui.dialogo({
      titulo: editando ? 'Editar movimiento recurrente' : 'Nuevo movimiento recurrente',
      contenido: [],
      acciones: [
        { etiqueta: 'Cancelar', alHacerClic: function (cerrar) { cerrar(); } },
        { etiqueta: 'Guardar', clase: 'btn--primario', alHacerClic: function (cerrar) { guardar(cerrar); } }
      ]
    });

    function pintar() {
      U.vaciar(d.cuerpo);

      const grupoTipo = ui.selectorTipo(datos.tipo, function (t) {
        datos.tipo = t;
        datos.categoriaId = '';
        if (selCategoria) selCategoria.repintar(t, '');
      });
      d.cuerpo.appendChild(ui.campo({ etiqueta: 'Tipo', control: grupoTipo }));

      const monto = ui.campoMonto({
        valor: datos.monto,
        alEscribir: function (n) { datos.monto = isFinite(n) ? n : ''; },
        alCambiar: function (n) { datos.monto = isFinite(n) ? n : ''; }
      });
      d.cuerpo.appendChild(ui.campo({ etiqueta: 'Monto', control: monto, error: errores.monto }));

      const desc = el('input', {
        type: 'text', value: datos.descripcion, maxlength: '120', autocomplete: 'off',
        placeholder: datos.tipo === 'ingreso' ? 'Salario' : 'Arriendo',
        oninput: function (e) { datos.descripcion = e.target.value; }
      });
      d.cuerpo.appendChild(ui.campo({ etiqueta: 'Descripción', control: desc, error: errores.descripcion }));

      selCategoria = ui.selectorCategoria({
        tipo: datos.tipo,
        valor: datos.categoriaId,
        alCambiar: function (v) { datos.categoriaId = v; }
      });

      const dia = el('select', {
        onchange: function (e) { datos.diaMes = Number(e.target.value); }
      });
      for (let i = 1; i <= 31; i++) {
        dia.appendChild(el('option', { value: i, selected: Number(datos.diaMes) === i }, String(i)));
      }

      d.cuerpo.appendChild(el('div', { class: 'fila-campos' }, [
        ui.campo({ etiqueta: 'Categoría', control: selCategoria, error: errores.categoriaId }),
        ui.campo({
          etiqueta: 'Día del mes', control: dia, error: errores.diaMes,
          ayuda: Number(datos.diaMes) > 28 ? 'En los meses más cortos se usará el último día.' : null
        })
      ]));

      const desde = el('input', {
        type: 'month', value: datos.desde,
        onchange: function (e) { datos.desde = e.target.value; }
      });
      const hasta = el('input', {
        type: 'month', value: datos.hasta, disabled: datos.sinFin,
        onchange: function (e) { datos.hasta = e.target.value; }
      });

      d.cuerpo.appendChild(el('div', { class: 'fila-campos' }, [
        ui.campo({ etiqueta: 'Desde', control: desde, error: errores.desde }),
        ui.campo({ etiqueta: 'Hasta', control: hasta, error: errores.hasta })
      ]));

      d.cuerpo.appendChild(el('label', { class: 'check-linea' }, [
        el('input', {
          type: 'checkbox', checked: datos.sinFin,
          onchange: function (e) { datos.sinFin = e.target.checked; if (e.target.checked) datos.hasta = ''; pintar(); }
        }),
        el('span', { class: 'check-linea__texto' }, 'Sin fecha final')
      ]));

      d.cuerpo.appendChild(el('label', { class: 'check-linea' }, [
        el('input', {
          type: 'checkbox', checked: datos.montoVariable,
          onchange: function (e) { datos.montoVariable = e.target.checked; }
        }),
        el('span', { class: 'check-linea__texto' }, [
          'El monto cambia cada mes',
          el('small', null, 'El movimiento se generará igual con el monto indicado, pero quedará marcado ' +
            'como "Por revisar" para que ajustes la cifra real (por ejemplo, servicios públicos).')
        ])
      ]));

      if (editando) {
        d.cuerpo.appendChild(el('p', { class: 'campo__ayuda mt-3' },
          'Los cambios aplican a los meses que aún no se han generado. Los movimientos ya creados no se modifican.'));
      }
    }

    function guardar(cerrar) {
      const payload = {
        tipo: datos.tipo, monto: datos.monto, descripcion: datos.descripcion,
        categoriaId: datos.categoriaId, diaMes: datos.diaMes,
        desde: datos.desde, hasta: datos.sinFin ? null : (datos.hasta || null),
        montoVariable: datos.montoVariable
      };
      errores = FP.dominio.validarRecurrente(payload);
      if (FP.dominio.hayErrores(errores)) { pintar(); return; }

      if (editando) {
        FP.store.actualizarRecurrente(original.id, payload);
        ui.toast('Movimiento recurrente actualizado.', { tipo: 'exito' });
      } else {
        FP.store.crearRecurrente(payload);
        ui.toast('Movimiento recurrente creado.', { tipo: 'exito' });
      }

      /* Genera de inmediato los meses vigentes que falten. */
      const nuevos = FP.dominio.generarRecurrentes();
      if (nuevos.length) {
        ui.toast('Se ' + (nuevos.length === 1 ? 'generó 1 movimiento' : 'generaron ' + nuevos.length + ' movimientos') +
          ' a partir de tus recurrentes.', { tipo: 'exito' });
      }

      cerrar();
      if (op.alGuardar) op.alGuardar();
    }

    pintar();
    return d;
  }

  return {
    movimiento: movimiento,
    categoria: categoria,
    eliminarCategoria: eliminarCategoria,
    tope: tope,
    metaAhorro: metaAhorro,
    recurrente: recurrente,
    capturar: capturar,
    avisarCambios: avisarCambios
  };
})();
