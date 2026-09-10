/* ==========================================================================
   S11 — Configuración
   Parámetros de las reglas que la especificación dejó abiertas y gestión de
   los datos (copia de seguridad, restauración y borrado).
   ========================================================================== */
window.FP = window.FP || {};
FP.vistas = FP.vistas || {};

FP.vistas.configuracion = (function () {
  'use strict';

  const U = FP.util;
  const el = U.el;
  const ui = FP.ui;

  const MONEDAS = [
    { codigo: 'COP', nombre: 'Peso colombiano', locale: 'es-CO', decimales: 0 },
    { codigo: 'MXN', nombre: 'Peso mexicano', locale: 'es-MX', decimales: 2 },
    { codigo: 'ARS', nombre: 'Peso argentino', locale: 'es-AR', decimales: 2 },
    { codigo: 'CLP', nombre: 'Peso chileno', locale: 'es-CL', decimales: 0 },
    { codigo: 'PEN', nombre: 'Sol peruano', locale: 'es-PE', decimales: 2 },
    { codigo: 'USD', nombre: 'Dólar estadounidense', locale: 'en-US', decimales: 2 },
    { codigo: 'EUR', nombre: 'Euro', locale: 'es-ES', decimales: 2 },
    { codigo: 'BRL', nombre: 'Real brasileño', locale: 'pt-BR', decimales: 2 }
  ];

  function render(cont, ctx) {
    const cfg = FP.store.state.config;

    cont.appendChild(el('div', { class: 'rejilla rejilla--2' }, [
      el('div', { class: 'pila pila--4' }, [
        tarjetaMoneda(cfg),
        tarjetaAvisos(cfg, ctx),
        tarjetaRegistro(cfg)
      ]),
      el('div', { class: 'pila pila--4' }, [
        tarjetaAtajos(ctx),
        tarjetaApariencia(cfg, ctx),
        tarjetaDatos(ctx),
        tarjetaAcerca()
      ])
    ]));
  }

  /* -------------------------------------------------------- Moneda ---- */

  function tarjetaMoneda(cfg) {
    const select = el('select', {
      onchange: function (e) {
        const m = MONEDAS.find(function (x) { return x.codigo === e.target.value; });
        if (!m) return;
        FP.store.actualizarConfig({ moneda: m.codigo, locale: m.locale, decimales: m.decimales });
        ui.toast('Moneda actualizada a ' + m.nombre + '.', { tipo: 'exito' });
      }
    }, MONEDAS.map(function (m) {
      return el('option', { value: m.codigo, selected: cfg.moneda === m.codigo }, m.nombre + ' (' + m.codigo + ')');
    }));

    return el('section', { class: 'tarjeta' }, [
      el('h2', { class: 'seccion__titulo', style: 'margin-bottom:16px' }, 'Moneda'),
      ui.campo({
        etiqueta: 'Moneda de todos los importes',
        control: select,
        ayuda: 'Ejemplo con esta configuración: ' + FP.dinero.formato(1234567) + '.'
      })
    ]);
  }

  /* -------------------------------------------------------- Avisos ---- */

  function tarjetaAvisos(cfg, ctx) {
    const umbral = el('input', {
      type: 'number', min: '1', max: '99', step: '1', value: cfg.umbralAviso,
      style: 'max-width:120px',
      onchange: function (e) {
        const v = U.clamp(Number(e.target.value) || 80, 1, 99);
        e.target.value = v;
        FP.store.actualizarConfig({ umbralAviso: v });
        ui.toast('Umbral de aviso: ' + v + '%.', { tipo: 'exito' });
      }
    });

    return el('section', { class: 'tarjeta' }, [
      el('h2', { class: 'seccion__titulo', style: 'margin-bottom:16px' }, 'Avisos'),
      ui.campo({
        etiqueta: 'Avisarme al llegar a este % del tope',
        control: umbral,
        ayuda: 'La superación del tope (más del 100 %) siempre genera aviso.'
      }),
      interruptor('Avisarme si la meta de ahorro está en riesgo', cfg.avisarMetaAhorro,
        'Aparece cuando el ahorro real va por debajo de la meta del mes.',
        function (v) { FP.store.actualizarConfig({ avisarMetaAhorro: v }); }),
      interruptor('Advertirme si el presupuesto no es alcanzable', cfg.avisarPresupuestoImposible,
        'Cuando la suma de topes más la meta de ahorro supera los ingresos previstos del mes.',
        function (v) { FP.store.actualizarConfig({ avisarPresupuestoImposible: v }); }),
      el('div', { class: 'mt-4' }, [
        el('button', {
          type: 'button', class: 'btn btn--sm',
          onclick: function () {
            FP.store.restaurarAvisos(null);
            ui.toast('Se restauraron todos los avisos descartados.', { tipo: 'exito' });
            ctx.refrescar();
          }
        }, 'Restaurar avisos descartados')
      ])
    ]);
  }

  /* ------------------------------------------------------- Registro --- */

  function tarjetaRegistro(cfg) {
    return el('section', { class: 'tarjeta' }, [
      el('h2', { class: 'seccion__titulo', style: 'margin-bottom:16px' }, 'Registro de movimientos'),
      interruptor('Exigir descripción', cfg.descripcionObligatoria,
        'Si lo activas, no podrás guardar un movimiento sin descripción. La categoría siempre es obligatoria.',
        function (v) { FP.store.actualizarConfig({ descripcionObligatoria: v }); }),
      interruptor('Permitir fechas futuras', cfg.permitirFechaFutura,
        'Útil para dejar registrado un pago programado. El movimiento cuenta en el mes de su fecha.',
        function (v) { FP.store.actualizarConfig({ permitirFechaFutura: v }); })
    ]);
  }

  /* ------------------------------------------------------- Atajos ----- */

  function tarjetaAtajos(ctx) {
    return el('section', { class: 'tarjeta' }, [
      el('h2', { class: 'seccion__titulo', style: 'margin-bottom:12px' }, 'Gestión'),
      el('div', { class: 'pila pila--2' }, [
        atajo('🏷️', 'Categorías', FP.store.state.categorias.length + ' definidas',
          function () { ctx.irA('categorias'); }),
        atajo('🔁', 'Movimientos recurrentes',
          FP.store.state.recurrentes.filter(function (r) { return r.activo; }).length + ' activos',
          function () { ctx.irA('recurrentes'); }),
        atajo('⚖️', 'Comparar meses', 'Ver evolución entre dos meses',
          function () { ctx.irA('comparar'); })
      ])
    ]);
  }

  function atajo(icono, titulo, detalle, alHacerClic) {
    return el('button', {
      type: 'button', class: 'btn btn--bloque',
      style: 'justify-content:flex-start;text-align:left;padding:12px 16px;min-height:56px',
      onclick: alHacerClic
    }, [
      el('span', { 'aria-hidden': 'true', style: 'font-size:1.3rem;margin-right:8px' }, icono),
      el('span', null, [
        el('span', { style: 'display:block' }, titulo),
        el('small', { class: 'texto-apagado', style: 'font-weight:400' }, detalle)
      ])
    ]);
  }

  /* ---------------------------------------------------- Apariencia ---- */

  function tarjetaApariencia(cfg, ctx) {
    const grupo = el('div', { class: 'grupo-segmentado', role: 'group', 'aria-label': 'Tema de la interfaz' });
    [['auto', 'Automático'], ['claro', 'Claro'], ['oscuro', 'Oscuro']].forEach(function (par) {
      grupo.appendChild(el('button', {
        type: 'button',
        'aria-pressed': String(cfg.tema === par[0]),
        onclick: function () { FP.app.aplicarTema(par[0]); ctx.refrescar(); }
      }, par[1]));
    });

    return el('section', { class: 'tarjeta' }, [
      el('h2', { class: 'seccion__titulo', style: 'margin-bottom:16px' }, 'Apariencia'),
      ui.campo({
        etiqueta: 'Tema', control: grupo,
        ayuda: '"Automático" sigue la configuración de tu sistema operativo.'
      })
    ]);
  }

  /* --------------------------------------------------------- Datos ---- */

  function tarjetaDatos(ctx) {
    const s = FP.store.state;
    const entrada = el('input', {
      type: 'file', accept: 'application/json,.json',
      style: 'display:none',
      onchange: function (e) { importar(e.target.files[0], ctx); e.target.value = ''; }
    });

    return el('section', { class: 'tarjeta' }, [
      el('h2', { class: 'seccion__titulo', style: 'margin-bottom:8px' }, 'Copia de seguridad'),
      el('p', { class: 'texto-sm texto-apagado', style: 'margin-bottom:16px' },
        s.movimientos.length + ' movimiento(s), ' + s.categorias.length + ' categoría(s), ' +
        s.recurrentes.length + ' recurrente(s) y ' + s.presupuestos.length + ' presupuesto(s) mensual(es).'),

      el('div', { class: 'pila pila--2' }, [
        el('button', {
          type: 'button', class: 'btn btn--bloque', onclick: exportar
        }, '⬇ Exportar mis datos (JSON)'),
        el('button', {
          type: 'button', class: 'btn btn--bloque', onclick: function () { entrada.click(); }
        }, '⬆ Importar una copia'),
        entrada,
        s.movimientos.length === 0 ? el('button', {
          type: 'button', class: 'btn btn--bloque',
          onclick: function () { cargarEjemplo(ctx); }
        }, '🧪 Cargar datos de ejemplo') : null,
        el('button', {
          type: 'button', class: 'btn btn--bloque btn--peligro',
          onclick: function () { borrar(ctx); }
        }, '🗑 Borrar todos mis datos')
      ]),

      el('p', { class: 'campo__ayuda mt-4' },
        'Exporta de vez en cuando: si borras los datos del navegador o cambias de equipo, ' +
        'la copia es la única forma de recuperar tu información.')
    ]);
  }

  function exportar() {
    try {
      const contenido = FP.store.exportarJSON();
      const blob = new Blob([contenido], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = el('a', {
        href: url,
        download: 'finanzas-personales-' + U.hoyISO() + '.json'
      });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      ui.toast('Copia exportada.', { tipo: 'exito' });
    } catch (e) {
      ui.toast('No se pudo exportar: ' + e.message, { tipo: 'error' });
    }
  }

  function importar(archivo, ctx) {
    if (!archivo) return;

    ui.confirmar({
      titulo: 'Importar "' + archivo.name + '"',
      mensaje: 'Se reemplazarán todos los datos actuales por los del archivo.',
      consecuencia: 'Tus movimientos, categorías, presupuestos y recurrentes actuales se perderán. ' +
        'Si no tienes una copia, expórtala antes.',
      etiquetaConfirmar: 'Importar y reemplazar'
    }).then(function (ok) {
      if (!ok) return;
      const lector = new FileReader();
      lector.onload = function () {
        try {
          FP.store.importarJSON(String(lector.result));
          FP.dominio.generarRecurrentes();
          ui.toast('Datos importados correctamente.', { tipo: 'exito' });
          ctx.refrescar();
        } catch (e) {
          ui.toast('No se pudo importar: ' + e.message, { tipo: 'error', duracion: 8000 });
        }
      };
      lector.onerror = function () {
        ui.toast('No se pudo leer el archivo.', { tipo: 'error' });
      };
      lector.readAsText(archivo);
    });
  }

  function borrar(ctx) {
    ui.confirmar({
      titulo: 'Borrar todos tus datos',
      mensaje: 'Se eliminarán todos los movimientos, presupuestos y recurrentes, y las categorías ' +
        'volverán a las iniciales.',
      consecuencia: 'Esta acción no se puede deshacer. Exporta una copia antes si quieres conservarla.',
      etiquetaConfirmar: 'Borrar todo'
    }).then(function (ok) {
      if (!ok) return;
      FP.store.borrarTodo();
      ui.toast('Todos los datos fueron borrados.', { tipo: 'exito' });
      ctx.irA('inicio');
    });
  }

  /* ------------------------------------------------ Datos de ejemplo -- */

  function cargarEjemplo(ctx) {
    const actual = U.periodoActual();

    function cat(nombre) {
      const c = FP.store.state.categorias.find(function (x) { return U.normalizar(x.nombre) === U.normalizar(nombre); });
      return c ? c.id : null;
    }

    const plantilla = [
      { d: 5, tipo: 'gasto', cat: 'Mercado', desc: 'Compra de la semana', base: 180000 },
      { d: 12, tipo: 'gasto', cat: 'Mercado', desc: 'Compra de la semana', base: 165000 },
      { d: 19, tipo: 'gasto', cat: 'Mercado', desc: 'Compra de la semana', base: 210000 },
      { d: 26, tipo: 'gasto', cat: 'Mercado', desc: 'Compra de la semana', base: 155000 },
      { d: 3, tipo: 'gasto', cat: 'Transporte', desc: 'Recarga de transporte', base: 90000 },
      { d: 17, tipo: 'gasto', cat: 'Transporte', desc: 'Taxi', base: 45000 },
      { d: 8, tipo: 'gasto', cat: 'Servicios', desc: 'Energía y agua', base: 165000 },
      { d: 10, tipo: 'gasto', cat: 'Servicios', desc: 'Internet', base: 95000 },
      { d: 14, tipo: 'gasto', cat: 'Entretenimiento', desc: 'Cine y salidas', base: 120000 },
      { d: 22, tipo: 'gasto', cat: 'Salud', desc: 'Farmacia', base: 70000 },
      { d: 28, tipo: 'ingreso', cat: 'Otros ingresos', desc: 'Trabajo independiente', base: 400000 }
    ];

    FP.store.aplicar(function (s) {
      for (let i = 2; i >= 0; i--) {
        const p = U.sumarMeses(actual, -i);
        const factor = 1 + (i * 0.06) - (Math.random() * 0.08);

        /* Salario y arriendo del mes */
        s.movimientos.push(nuevo(p, 30, 'ingreso', cat('Salario'), 'Salario mensual', 4500000));
        s.movimientos.push(nuevo(p, 1, 'gasto', cat('Vivienda'), 'Arriendo', 1000000));

        plantilla.forEach(function (m) {
          if (i === 0 && m.d > Number(U.hoyISO().slice(8, 10))) return; // no inventar el futuro
          s.movimientos.push(nuevo(p, m.d, m.tipo, cat(m.cat), m.desc, Math.round(m.base * factor / 1000) * 1000));
        });

        s.presupuestos = s.presupuestos.filter(function (x) { return x.periodo !== p; });
        s.presupuestos.push({
          periodo: p,
          metaAhorro: 1000000,
          topes: [
            { categoriaId: cat('Vivienda'), monto: 1000000 },
            { categoriaId: cat('Mercado'), monto: 600000 },
            { categoriaId: cat('Transporte'), monto: 200000 },
            { categoriaId: cat('Servicios'), monto: 300000 },
            { categoriaId: cat('Entretenimiento'), monto: 150000 }
          ].filter(function (t) { return t.categoriaId; })
        });
      }
    });

    ui.toast('Datos de ejemplo cargados: tres meses de movimientos y presupuesto.', { tipo: 'exito', duracion: 6000 });
    ctx.irA('inicio');
  }

  function nuevo(periodo, dia, tipo, categoriaId, descripcion, monto) {
    return {
      id: U.uid('mov'),
      fecha: U.fechaEnPeriodo(periodo, dia),
      monto: monto,
      tipo: tipo,
      descripcion: descripcion,
      categoriaId: categoriaId,
      recurrenteId: null,
      revisar: false,
      creadoEn: new Date().toISOString()
    };
  }

  /* --------------------------------------------------------- Acerca --- */

  function tarjetaAcerca() {
    const estado = FP.store.estadoAlmacenamiento();

    return el('section', { class: 'tarjeta' }, [
      el('h2', { class: 'seccion__titulo', style: 'margin-bottom:12px' }, 'Sobre tus datos'),
      el('p', { class: 'texto-sm' },
        'Toda tu información se guarda únicamente en este navegador y en este equipo. ' +
        'No se envía a ningún servidor ni se comparte con nadie.'),
      el('p', { class: 'texto-sm texto-apagado mt-3' },
        'La aplicación no pide contraseña: cualquiera con acceso a esta sesión del navegador ' +
        'puede ver tus finanzas. Si necesitas protegerlo, usa el bloqueo de tu equipo.'),
      !estado.ok ? el('div', { class: 'alerta alerta--error mt-4' }, [
        el('span', { class: 'alerta__icono', 'aria-hidden': 'true' }, '!'),
        el('div', { class: 'alerta__cuerpo' }, [
          el('div', { class: 'alerta__titulo' }, 'Problema de almacenamiento'),
          el('p', { class: 'alerta__texto' }, estado.mensaje +
            ' Exporta tus datos y abre la aplicación con un servidor local (ver README).')
        ])
      ]) : null,
      el('p', { class: 'campo__ayuda mt-4' },
        'Periodo: mes calendario · Umbral de aviso: ' + FP.dominio.umbral() + '% · ' +
        'Recurrentes: generación automática revisable.')
    ]);
  }

  /* ----------------------------------------------------- Interruptor -- */

  function interruptor(etiqueta, valor, ayuda, alCambiar) {
    return el('label', { class: 'check-linea' }, [
      el('input', {
        type: 'checkbox', checked: !!valor,
        onchange: function (e) {
          alCambiar(e.target.checked);
          ui.toast('Preferencia guardada.', { tipo: 'exito', duracion: 2000 });
        }
      }),
      el('span', { class: 'check-linea__texto' }, [
        etiqueta,
        ayuda ? el('small', null, ayuda) : null
      ])
    ]);
  }

  return {
    titulo: 'Configuración',
    icono: '⚙️',
    enNavegacion: false,
    ocultarSelectorMes: true,
    subtitulo: function () { return 'Preferencias y gestión de datos'; },
    render: render
  };
})();
