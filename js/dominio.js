/* ==========================================================================
   dominio.js — Reglas de negocio
   Corresponde a la sección 21 del documento de diseño y a los requisitos
   FR-004, FR-005, FR-012, FR-016 a FR-020, FR-023, FR-026 y FR-027.
   Ninguna función de este archivo toca el DOM.
   ========================================================================== */
window.FP = window.FP || {};

FP.dominio = (function () {
  'use strict';

  const U = FP.util;
  const S = function () { return FP.store.state; };

  /* ================================================== consultas base == */

  /* --------------------------------------------- rango de días del mes -- */

  /* Un rango es {desde, hasta}: días del mes, ambos inclusivos. `null` (o sin
     rango) es el mes completo. Un `hasta` mayor que los días del mes simplemente
     llega hasta el último día, así el mismo rango sirve para meses de 28 a 31 días. */

  /** Día del mes (1–31) de una fecha "AAAA-MM-DD". */
  function diaDe(fecha) { return Number(String(fecha).slice(8, 10)); }

  function enRango(mov, rango) {
    if (!rango) return true;
    const d = diaDe(mov.fecha);
    return d >= rango.desde && d <= rango.hasta;
  }

  /** ¿El rango deja fuera algún día de ese mes? */
  function rangoEsParcial(periodo, rango) {
    if (!rango) return false;
    return rango.desde > 1 || rango.hasta < U.diasEnMes(periodo);
  }

  /**
   * Valida un rango contra los días máximos disponibles. Devuelve {campo: mensaje};
   * vacío si es válido.
   */
  function validarRango(desde, hasta, maxDias) {
    const errores = {};
    const entero = function (n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; };
    if (!entero(desde)) errores.desde = 'Escribe el día inicial (un número entero).';
    else if (desde < 1 || desde > maxDias) errores.desde = 'El día inicial debe estar entre 1 y ' + maxDias + '.';
    if (!entero(hasta)) errores.hasta = 'Escribe el día final (un número entero).';
    else if (hasta < 1 || hasta > maxDias) errores.hasta = 'El día final debe estar entre 1 y ' + maxDias + '.';
    if (!errores.desde && !errores.hasta && desde > hasta) {
      errores.desde = 'El día inicial no puede ser mayor que el día final.';
    }
    return errores;
  }

  /** FR-004: los movimientos pertenecen al mes de su fecha (mes calendario, PA-02). */
  function movimientosDe(periodo, rango) {
    return S().movimientos.filter(function (m) {
      return U.periodoDe(m.fecha) === periodo && enRango(m, rango);
    });
  }

  /**
   * ¿Es un gasto de una categoría marcada como transferencia (p. ej. el pago de
   * la tarjeta de crédito)? Ese dinero ya se contó como gasto al hacer la compra,
   * así que no vuelve a entrar en los totales, topes ni avisos.
   */
  function esTransferencia(m) {
    if (!m || m.tipo !== 'gasto') return false;
    const cat = FP.store.categoria(m.categoriaId);
    return !!(cat && cat.esTransferencia);
  }

  /** Movimientos del mes que entran en los totales: todos menos las transferencias. */
  function movimientosContables(periodo, rango) {
    return movimientosDe(periodo, rango).filter(function (m) { return !esTransferencia(m); });
  }

  /** Ordena por fecha descendente y, a igualdad de fecha, por registro más reciente. */
  function ordenarRecientes(lista) {
    return lista.slice().sort(function (a, b) {
      if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1;
      return String(b.creadoEn || '').localeCompare(String(a.creadoEn || ''));
    });
  }

  /** Aplica los filtros de la pantalla de movimientos. */
  function filtrarMovimientos(periodo, filtros) {
    const f = filtros || {};
    let lista = movimientosDe(periodo, f.rango);

    if (f.tipo && f.tipo !== 'todos') {
      lista = lista.filter(function (m) { return m.tipo === f.tipo; });
    }
    if (f.categoriaId && f.categoriaId !== 'todas') {
      lista = lista.filter(function (m) { return m.categoriaId === f.categoriaId; });
    }
    /* Medio de pago: solo los gastos lo tienen, así que filtrar por un medio
       deja fuera los ingresos. */
    if (f.medioPago && f.medioPago !== 'todos') {
      lista = lista.filter(function (m) { return FP.medios.de(m) === f.medioPago; });
    }
    if (f.texto) {
      const q = U.normalizar(f.texto);
      lista = lista.filter(function (m) {
        const cat = FP.store.categoria(m.categoriaId);
        return U.normalizar(m.descripcion).indexOf(q) >= 0 ||
          (cat && U.normalizar(cat.nombre).indexOf(q) >= 0);
      });
    }
    return ordenarRecientes(lista);
  }

  /* ================================================== resumen del mes == */

  /**
   * FR-005 / FR-017 — Totales del mes y estado de la meta de ahorro.
   * Ahorro real = ingresos − gastos (S-04).
   */
  /** Ingresos, gastos y gastos por medio de una lista de movimientos (sin las transferencias). */
  function totalesDe(lista) {
    let ingresos = 0, gastos = 0;
    const gastosPorMedio = {};
    FP.medios.todos().forEach(function (x) { gastosPorMedio[x.clave] = 0; });
    lista.forEach(function (m) {
      if (esTransferencia(m)) return;
      if (m.tipo === 'ingreso') ingresos += m.monto;
      else { gastos += m.monto; gastosPorMedio[FP.medios.de(m)] += m.monto; }
    });
    return { ingresos: ingresos, gastos: gastos, gastosPorMedio: gastosPorMedio };
  }

  /**
   * Con `rango`, ingresos, gastos, ahorro real y medios son solo de esos días.
   * La meta de ahorro es del mes completo, así que su cumplimiento se mide con
   * `ahorroMes` (el ahorro de todo el mes) y no cambia con el rango.
   */
  function resumen(periodo, rango) {
    const parcial = rangoEsParcial(periodo, rango);
    const todos = movimientosDe(periodo, parcial ? rango : null);
    const t = totalesDe(todos);

    const ahorroReal = t.ingresos - t.gastos;
    let ahorroMes = ahorroReal;
    let hayMovimientosEnElMes = todos.length > 0;
    if (parcial) {
      const mes = movimientosDe(periodo);
      const tm = totalesDe(mes);
      ahorroMes = tm.ingresos - tm.gastos;
      hayMovimientosEnElMes = mes.length > 0;
    }

    const pres = FP.store.presupuesto(periodo);
    const meta = Number(pres.metaAhorro) || 0;

    return {
      periodo: periodo,
      parcial: parcial,
      rango: parcial ? { desde: rango.desde, hasta: rango.hasta } : null,
      ingresos: t.ingresos,
      gastos: t.gastos,
      gastosPorMedio: t.gastosPorMedio,
      ahorroReal: ahorroReal,
      ahorroMes: ahorroMes,
      metaAhorro: meta,
      hayMeta: meta > 0,
      cumpleMeta: meta > 0 && ahorroMes >= meta,
      diferenciaMeta: ahorroMes - meta,
      porcentajeMeta: meta > 0 ? (ahorroMes / meta) * 100 : null,
      nMovimientos: todos.length,
      hayDatos: hayMovimientosEnElMes || meta > 0 || (pres.topes || []).length > 0
    };
  }

  /** FR-012 — Total por categoría en el mes. Devuelve un Map categoriaId → total. */
  function totalesPorCategoria(periodo, tipo, medio, rango) {
    const mapa = new Map();
    movimientosContables(periodo, rango).forEach(function (m) {
      if (tipo && m.tipo !== tipo) return;
      if (medio && medio !== 'todos' && FP.medios.de(m) !== medio) return;
      const k = m.categoriaId || 'sin-categoria';
      mapa.set(k, (mapa.get(k) || 0) + m.monto);
    });
    return mapa;
  }

  /** Gasto del mes según el medio elegido ('todos' = el total de gastos). */
  function gastosSegunMedio(resumenMes, medio) {
    if (!medio || medio === 'todos') return resumenMes.gastos;
    return resumenMes.gastosPorMedio[medio] || 0;
  }

  /**
   * Gasto del mes repartido por medio de pago. La suma de `total` de todas
   * las filas es SIEMPRE igual al total de gastos del mes (incluye
   * "Sin especificar"), de modo que nunca se contradice con el resumen.
   */
  function desgloseMedioPago(periodo, rango) {
    const r = resumen(periodo, rango);
    return FP.medios.todos().map(function (x) {
      const total = r.gastosPorMedio[x.clave] || 0;
      return {
        clave: x.clave, etiqueta: x.etiqueta, icono: x.icono,
        total: total,
        porcentaje: r.gastos > 0 ? (total / r.gastos) * 100 : 0
      };
    });
  }

  /* ==================================================== presupuesto === */

  /**
   * PA-08 — Estado de una categoría frente a su tope.
   * 'sin-tope' | 'ok' | 'cerca' | 'excedido'
   */
  function estadoDeTope(gastado, tope) {
    if (!tope || tope <= 0) return 'sin-tope';
    const pct = (gastado / tope) * 100;
    if (pct > 100) return 'excedido';
    if (pct >= umbral()) return 'cerca';
    return 'ok';
  }

  function umbral() {
    const u = Number(S().config.umbralAviso);
    return isFinite(u) && u > 0 && u <= 100 ? u : 80;
  }

  const ETIQUETAS_ESTADO = {
    'excedido': 'Tope superado',
    'cerca': 'Cerca del límite',
    'ok': 'Dentro del límite',
    'sin-tope': 'Sin límite definido'
  };

  const SEVERIDAD_ESTADO = {
    'excedido': 'error',
    'cerca': 'advertencia',
    'ok': 'exito',
    'sin-tope': 'neutro'
  };

  /**
   * FR-016 — Para cada categoría de gasto: tope, gastado, disponible y estado.
   * Incluye categorías sin tope que sí tienen gasto (PA-07: se permiten, pero
   * se destacan como "Sin límite definido").
   */
  function estadoTopes(periodo, opciones) {
    const op = opciones || {};
    const pres = FP.store.presupuesto(periodo);
    const totales = totalesPorCategoria(periodo, 'gasto');
    const topesPorCat = new Map();
    (pres.topes || []).forEach(function (t) { topesPorCat.set(t.categoriaId, Number(t.monto) || 0); });

    const ids = new Set();
    topesPorCat.forEach(function (_v, k) { ids.add(k); });
    totales.forEach(function (_v, k) { ids.add(k); });
    if (op.incluirTodas) {
      FP.store.categoriasDe('gasto').forEach(function (c) { if (!c.esTransferencia) ids.add(c.id); });
    }

    const filas = [];
    ids.forEach(function (id) {
      const cat = FP.store.categoria(id);
      if (!cat && id !== 'sin-categoria') return;
      const tope = topesPorCat.has(id) ? topesPorCat.get(id) : null;
      const gastado = totales.get(id) || 0;
      const estado = estadoDeTope(gastado, tope);
      const porcentaje = tope && tope > 0 ? (gastado / tope) * 100 : null;
      /* Gastar exactamente el tope no es superarlo, pero tampoco es "estar
         cerca": no queda disponible. Se le da su propia etiqueta. */
      const agotado = estado === 'cerca' && porcentaje >= 100;

      filas.push({
        categoriaId: id,
        categoria: cat || { id: 'sin-categoria', nombre: 'Sin categoría', icono: '❔', tipo: 'gasto' },
        tope: tope,
        gastado: gastado,
        disponible: tope !== null ? tope - gastado : null,
        porcentaje: porcentaje,
        estado: estado,
        agotado: agotado,
        etiquetaEstado: agotado ? 'Tope agotado' : ETIQUETAS_ESTADO[estado],
        severidad: SEVERIDAD_ESTADO[estado]
      });
    });

    /* Orden del diseño: excedidas → cerca → mayor % consumido → resto. */
    const peso = { 'excedido': 0, 'cerca': 1, 'ok': 2, 'sin-tope': 3 };
    return filas.sort(function (a, b) {
      if (peso[a.estado] !== peso[b.estado]) return peso[a.estado] - peso[b.estado];
      const pa = a.porcentaje === null ? -1 : a.porcentaje;
      const pb = b.porcentaje === null ? -1 : b.porcentaje;
      if (pa !== pb) return pb - pa;
      if (a.gastado !== b.gastado) return b.gastado - a.gastado;
      return a.categoria.nombre.localeCompare(b.categoria.nombre, 'es');
    });
  }

  /** Estado puntual de una categoría (se usa para detectar cruces de umbral). */
  function estadoDeCategoria(periodo, categoriaId) {
    const pres = FP.store.presupuesto(periodo);
    const t = (pres.topes || []).find(function (x) { return x.categoriaId === categoriaId; });
    const tope = t ? Number(t.monto) || 0 : null;
    let gastado = 0;
    movimientosContables(periodo).forEach(function (m) {
      if (m.tipo === 'gasto' && m.categoriaId === categoriaId) gastado += m.monto;
    });
    return { tope: tope, gastado: gastado, estado: estadoDeTope(gastado, tope) };
  }

  /**
   * PA-13 / C-01 — ¿El presupuesto es alcanzable?
   * Ingresos previstos = ingresos ya registrados en el mes
   *                    + recurrentes de ingreso vigentes aún no generados.
   */
  function coherenciaPresupuesto(periodo) {
    const pres = FP.store.presupuesto(periodo);
    const sumaTopes = U.suma(pres.topes || [], function (t) { return t.monto; });
    const meta = Number(pres.metaAhorro) || 0;

    let ingresos = 0;
    movimientosDe(periodo).forEach(function (m) { if (m.tipo === 'ingreso') ingresos += m.monto; });

    let previstosExtra = 0;
    S().recurrentes.forEach(function (r) {
      if (r.tipo !== 'ingreso' || !vigenteEn(r, periodo)) return;
      if (FP.store.yaGenerado(r.id, periodo)) return;
      previstosExtra += r.monto;
    });

    const ingresosPrevistos = ingresos + previstosExtra;
    const comprometido = sumaTopes + meta;
    const imposible = ingresosPrevistos > 0 && comprometido > ingresosPrevistos;

    return {
      sumaTopes: sumaTopes,
      metaAhorro: meta,
      comprometido: comprometido,
      ingresosPrevistos: ingresosPrevistos,
      ingresosRegistrados: ingresos,
      ingresosRecurrentes: previstosExtra,
      exceso: comprometido - ingresosPrevistos,
      imposible: imposible,
      evaluable: ingresosPrevistos > 0 && comprometido > 0
    };
  }

  /* ========================================================= avisos === */

  /**
   * FR-018 a FR-021 — Avisos del mes.
   * Se derivan siempre del estado actual, de modo que un gasto que pasa
   * directamente de 75 % a 110 % produce únicamente el aviso de superación
   * (PA-08, caso borde de la especificación).
   */
  function alertas(periodo, opciones) {
    const op = opciones || {};
    const cfg = S().config;
    const lista = [];

    estadoTopes(periodo).forEach(function (fila) {
      if (fila.estado !== 'excedido' && fila.estado !== 'cerca') return;
      const excedido = fila.estado === 'excedido';
      lista.push({
        id: periodo + '|' + fila.categoriaId + '|' + fila.estado,
        condicion: fila.estado,
        periodo: periodo,
        categoriaId: fila.categoriaId,
        categoria: fila.categoria,
        severidad: excedido ? 'error' : 'advertencia',
        titulo: fila.categoria.nombre,
        etiqueta: fila.etiquetaEstado,
        mensaje: excedido
          ? 'Has superado el tope en ' + FP.dinero.formato(Math.abs(fila.disponible)) + '.'
          : (fila.agotado
            ? 'Has agotado el tope: ya no te queda disponible este mes.'
            : 'Has utilizado el ' + U.formatoPorcentaje(fila.porcentaje, 0) + ' del tope.'),
        cifras: [
          ['Gastado', FP.dinero.formato(fila.gastado)],
          ['Tope', FP.dinero.formato(fila.tope)],
          [excedido ? 'Excedente' : 'Disponible', FP.dinero.formato(Math.abs(fila.disponible))]
        ],
        descartado: FP.store.avisoDescartado(periodo, fila.categoriaId, fila.estado)
      });
    });

    /* FR-021 / PA-08 — Aviso sobre la meta de ahorro. */
    if (cfg.avisarMetaAhorro) {
      const r = resumen(periodo);
      if (r.hayMeta && r.ahorroReal < r.metaAhorro) {
        const mesPasado = periodo < U.periodoActual();
        lista.push({
          id: periodo + '|meta|riesgo',
          condicion: 'meta',
          periodo: periodo,
          categoriaId: 'meta',
          severidad: mesPasado ? 'error' : 'advertencia',
          titulo: 'Meta de ahorro',
          mensaje: mesPasado
            ? 'Este mes cerró ' + FP.dinero.formato(Math.abs(r.diferenciaMeta)) + ' por debajo de la meta.'
            : 'Te faltan ' + FP.dinero.formato(Math.abs(r.diferenciaMeta)) + ' para alcanzar la meta.',
          cifras: [
            ['Ahorro real', FP.dinero.formatoSaldo(r.ahorroReal)],
            ['Meta', FP.dinero.formato(r.metaAhorro)]
          ],
          descartado: FP.store.avisoDescartado(periodo, 'meta', 'riesgo')
        });
      }
    }

    /* PA-13 — Presupuesto que no se puede cumplir. */
    if (cfg.avisarPresupuestoImposible) {
      const c = coherenciaPresupuesto(periodo);
      if (c.imposible) {
        lista.push({
          id: periodo + '|presupuesto|imposible',
          condicion: 'presupuesto',
          periodo: periodo,
          categoriaId: 'presupuesto',
          severidad: 'advertencia',
          titulo: 'Tu presupuesto puede no ser alcanzable',
          mensaje: 'La suma de tus topes y tu meta de ahorro supera los ingresos previstos de este mes en ' +
            FP.dinero.formato(c.exceso) + '.',
          cifras: [
            ['Topes + meta', FP.dinero.formato(c.comprometido)],
            ['Ingresos previstos', FP.dinero.formato(c.ingresosPrevistos)]
          ],
          descartado: FP.store.avisoDescartado(periodo, 'presupuesto', 'imposible')
        });
      }
    }

    const orden = { error: 0, advertencia: 1, info: 2 };
    const ordenada = lista.sort(function (a, b) { return orden[a.severidad] - orden[b.severidad]; });
    return op.incluirDescartados ? ordenada : ordenada.filter(function (a) { return !a.descartado; });
  }

  function contarAlertas(periodo) { return alertas(periodo).length; }

  /**
   * Avisos de TODOS los periodos con datos, no solo el que se está viendo.
   * Corrige un vacío frente a SC-003 y al caso borde de registro tardío
   * (PA-12): sin esto, superar un tope en un mes que no es el
   * seleccionado no generaba ningún aviso visible en ningún lado.
   * Cada aviso ya trae su propio `periodo`, así que se puede identificar
   * a qué mes pertenece aunque la lista mezcle varios.
   */
  function alertasTodas(opciones) {
    const op = opciones || {};
    const lista = [];
    periodosConDatos().forEach(function (p) {
      lista.push.apply(lista, alertas(p, { incluirDescartados: op.incluirDescartados }));
    });

    const orden = { error: 0, advertencia: 1, info: 2 };
    return lista.sort(function (a, b) {
      if (orden[a.severidad] !== orden[b.severidad]) return orden[a.severidad] - orden[b.severidad];
      if (a.periodo !== b.periodo) return a.periodo < b.periodo ? 1 : -1; // más reciente primero
      return 0;
    });
  }

  function contarAlertasTodas() { return alertasTodas().length; }

  /* ==================================================== recurrentes === */

  function vigenteEn(rec, periodo) {
    if (!rec.activo) return false;
    if (rec.desde && periodo < rec.desde) return false;
    if (rec.hasta && periodo > rec.hasta) return false;
    return true;
  }

  /**
   * FR-023 / PA-09 — Genera los movimientos de los recurrentes vigentes.
   * Regla adoptada: generación automática hasta el mes actual (nunca meses
   * futuros), con posibilidad de revisar y editar el movimiento generado.
   * Si el día no existe en el mes, se usa el último día válido.
   * No se regenera lo que el usuario ya borró (registro `generados`).
   */
  function generarRecurrentes() {
    const actual = U.periodoActual();
    const generados = [];

    FP.store.aplicar(function (s) {
      s.recurrentes.forEach(function (rec) {
        if (!rec.activo) return;

        let p = rec.desde || actual;
        // Salvaguarda: como máximo 60 meses hacia atrás.
        if (U.diffMeses(p, actual) > 60) p = U.sumarMeses(actual, -60);

        const fin = rec.hasta && rec.hasta < actual ? rec.hasta : actual;

        let guardia = 0;
        while (p <= fin && guardia++ < 200) {
          const clave = rec.id + '|' + p;
          if (!s.generados[clave]) {
            const mov = {
              id: U.uid('mov'),
              fecha: U.fechaEnPeriodo(p, rec.diaMes),
              monto: Math.abs(Number(rec.monto) || 0),
              tipo: rec.tipo,
              descripcion: rec.descripcion,
              categoriaId: rec.categoriaId,
              medioPago: FP.medios.normalizar(rec.tipo, rec.medioPago),
              recurrenteId: rec.id,
              revisar: !!rec.montoVariable,
              creadoEn: new Date().toISOString()
            };
            s.movimientos.push(mov);
            s.generados[clave] = true;
            generados.push(mov);
          }
          p = U.sumarMeses(p, 1);
        }
      });
    });

    return generados;
  }

  /** Movimientos generados que el usuario aún no ha revisado (recurrentes de monto variable). */
  function pendientesDeRevision(periodo) {
    return S().movimientos.filter(function (m) {
      if (!m.revisar) return false;
      return !periodo || U.periodoDe(m.fecha) === periodo;
    });
  }

  function proximosRecurrentes(periodo) {
    return S().recurrentes
      .filter(function (r) { return vigenteEn(r, periodo); })
      .sort(function (a, b) { return a.diaMes - b.diaMes; });
  }

  /* ====================================================== histórico === */

  /** Periodos que tienen movimientos o presupuesto, del más reciente al más antiguo. */
  function periodosConDatos() {
    const set = new Set();
    S().movimientos.forEach(function (m) { set.add(U.periodoDe(m.fecha)); });
    S().presupuestos.forEach(function (p) {
      if ((p.metaAhorro > 0) || (p.topes || []).length > 0) set.add(p.periodo);
    });
    set.add(U.periodoActual());
    return Array.from(set).filter(Boolean).sort().reverse();
  }

  /** FR-026 — Resumen de los últimos `n` meses con datos (más reciente primero). */
  function historico(n, rango) {
    const periodos = periodosConDatos();
    const lista = (n ? periodos.slice(0, n) : periodos);
    return lista.map(function (p) {
      const r = resumen(p, rango);
      const topes = estadoTopes(p);
      r.excedidas = topes.filter(function (t) { return t.estado === 'excedido'; }).length;
      r.cerca = topes.filter(function (t) { return t.estado === 'cerca'; }).length;
      r.conTope = topes.filter(function (t) { return t.tope !== null; }).length;
      return r;
    });
  }

  /** Serie cronológica ascendente de los últimos `n` meses (para gráficos). */
  function serieMensual(n, rango) {
    const actual = U.periodoActual();
    const conDatos = periodosConDatos();
    const masAntiguo = conDatos.length ? conDatos[conDatos.length - 1] : actual;
    const disponibles = U.diffMeses(masAntiguo, actual) + 1;
    const cantidad = Math.max(1, Math.min(n || 12, Math.max(disponibles, 1)));

    const serie = [];
    for (let i = cantidad - 1; i >= 0; i--) {
      serie.push(resumen(U.sumarMeses(actual, -i), rango));
    }
    return serie;
  }

  /* ======================================================= comparar === */

  /** FR-027 / PA-11 — Comparación de dos meses. */
  function comparar(periodoA, periodoB, medio, rango) {
    const a = resumen(periodoA, rango), b = resumen(periodoB, rango);
    const filtrando = !!medio && medio !== 'todos';

    /* Ingresos, ahorro real y meta SIEMPRE usan todos los gastos: así no se
       contradicen con el resto de la aplicación. Con filtro activo se añade
       una fila de gastos acotada al medio elegido. */
    const base = [
      { clave: 'ingresos', etiqueta: 'Ingresos', a: a.ingresos, b: b.ingresos, mejorEs: 'mas' },
      { clave: 'gastos', etiqueta: 'Gastos', a: a.gastos, b: b.gastos, mejorEs: 'menos' }
    ];
    if (filtrando) {
      base.push({
        clave: 'gastosMedio', etiqueta: 'Gastos · ' + FP.medios.info(medio).etiqueta,
        a: gastosSegunMedio(a, medio), b: gastosSegunMedio(b, medio), mejorEs: 'menos'
      });
    }
    base.push(
      { clave: 'ahorro', etiqueta: 'Ahorro real', a: a.ahorroReal, b: b.ahorroReal, mejorEs: 'mas' },
      { clave: 'meta', etiqueta: 'Meta de ahorro', a: a.metaAhorro, b: b.metaAhorro, mejorEs: 'neutro' }
    );

    const indicadores = base.map(function (ind) {
      ind.variacion = U.variacion(ind.a, ind.b);
      ind.delta = ind.b - ind.a;
      if (ind.mejorEs === 'neutro' || ind.delta === 0) ind.tendencia = 'igual';
      else if (ind.mejorEs === 'mas') ind.tendencia = ind.delta > 0 ? 'mejor' : 'peor';
      else ind.tendencia = ind.delta < 0 ? 'mejor' : 'peor';
      return ind;
    });

    const cumplimiento = {
      etiqueta: 'Meta cumplida',
      a: a.hayMeta ? (a.cumpleMeta ? 'Sí' : 'No') : '—',
      b: b.hayMeta ? (b.cumpleMeta ? 'Sí' : 'No') : '—',
      aOk: a.hayMeta && a.cumpleMeta,
      bOk: b.hayMeta && b.cumpleMeta
    };

    /* Comparación por categoría de gasto. */
    const totA = totalesPorCategoria(periodoA, 'gasto', medio, rango);
    const totB = totalesPorCategoria(periodoB, 'gasto', medio, rango);
    const ids = new Set();
    totA.forEach(function (_v, k) { ids.add(k); });
    totB.forEach(function (_v, k) { ids.add(k); });

    const categorias = [];
    ids.forEach(function (id) {
      const cat = FP.store.categoria(id);
      const va = totA.get(id) || 0, vb = totB.get(id) || 0;
      categorias.push({
        categoriaId: id,
        nombre: cat ? cat.nombre : 'Sin categoría',
        icono: cat ? cat.icono : '❔',
        a: va, b: vb,
        delta: vb - va,
        variacion: U.variacion(va, vb),
        tendencia: vb === va ? 'igual' : (vb < va ? 'mejor' : 'peor')
      });
    });
    categorias.sort(function (x, y) { return Math.abs(y.delta) - Math.abs(x.delta); });

    /* Gasto por medio de pago, siempre completo (suma = gastos de cada mes). */
    const medios = FP.medios.todos().map(function (x) {
      const va = a.gastosPorMedio[x.clave] || 0, vb = b.gastosPorMedio[x.clave] || 0;
      return {
        clave: x.clave, etiqueta: x.etiqueta, icono: x.icono,
        a: va, b: vb, delta: vb - va, variacion: U.variacion(va, vb),
        tendencia: vb === va ? 'igual' : (vb < va ? 'mejor' : 'peor')
      };
    });

    return {
      a: a, b: b, medio: filtrando ? medio : 'todos',
      indicadores: indicadores, cumplimiento: cumplimiento, categorias: categorias, medios: medios
    };
  }

  /* ======================================================= validación == */

  /**
   * FR-003 — Valida un movimiento antes de registrarlo.
   * Devuelve un objeto {campo: mensaje}; vacío si es válido.
   */
  function validarMovimiento(datos) {
    const errores = {};
    const cfg = S().config;

    if (!datos.tipo || (datos.tipo !== 'ingreso' && datos.tipo !== 'gasto')) {
      errores.tipo = 'Indica si es un ingreso o un gasto.';
    }

    const monto = Number(datos.monto);
    if (datos.monto === '' || datos.monto === null || datos.monto === undefined || !isFinite(monto)) {
      errores.monto = 'Ingresa el monto del movimiento.';
    } else if (monto <= 0) {
      errores.monto = 'Ingresa un monto mayor que cero.';
    } else if (monto > 1e15) {
      errores.monto = 'El monto es demasiado grande.';
    }

    if (!datos.fecha) {
      errores.fecha = 'Selecciona la fecha del movimiento.';
    } else if (!U.esFechaValida(datos.fecha)) {
      errores.fecha = 'La fecha no es válida.';
    } else if (!cfg.permitirFechaFutura && datos.fecha > U.hoyISO()) {
      errores.fecha = 'No se permiten movimientos con fecha futura.';
    }

    if (!datos.categoriaId) {
      errores.categoriaId = 'Selecciona una categoría.';
    } else {
      const cat = FP.store.categoria(datos.categoriaId);
      if (!cat) errores.categoriaId = 'La categoría seleccionada ya no existe.';
      else if (cat.tipo !== datos.tipo) errores.categoriaId = 'Esa categoría es de ' + cat.tipo + '.';
    }

    if (cfg.descripcionObligatoria && !(datos.descripcion || '').trim()) {
      errores.descripcion = 'Escribe una descripción.';
    }

    /* El medio de pago es opcional y solo aplica a gastos. */
    if (datos.tipo === 'gasto' && datos.medioPago && !FP.medios.esValido(datos.medioPago)) {
      errores.medioPago = 'Elige débito, crédito o efectivo.';
    }

    return errores;
  }

  function validarCategoria(datos, exceptoId) {
    const errores = {};
    const nombre = (datos.nombre || '').trim();
    if (!nombre) errores.nombre = 'Escribe el nombre de la categoría.';
    else if (nombre.length > 40) errores.nombre = 'El nombre no puede superar 40 caracteres.';
    else if (FP.store.nombreCategoriaRepetido(nombre, datos.tipo, exceptoId)) {
      errores.nombre = 'Ya tienes una categoría de ' + datos.tipo + ' con ese nombre.';
    }
    if (datos.tipo !== 'ingreso' && datos.tipo !== 'gasto') {
      errores.tipo = 'Indica si la categoría es de ingreso o de gasto.';
    }
    return errores;
  }

  function validarRecurrente(datos) {
    const errores = {};
    const monto = Number(datos.monto);
    if (!isFinite(monto) || monto <= 0) errores.monto = 'Ingresa un monto mayor que cero.';
    if (!(datos.descripcion || '').trim()) errores.descripcion = 'Escribe una descripción (por ejemplo, "Arriendo").';
    if (!datos.categoriaId) errores.categoriaId = 'Selecciona una categoría.';
    const dia = Number(datos.diaMes);
    if (!isFinite(dia) || dia < 1 || dia > 31) errores.diaMes = 'El día debe estar entre 1 y 31.';
    if (!/^\d{4}-\d{2}$/.test(datos.desde || '')) errores.desde = 'Indica desde qué mes aplica.';
    if (datos.hasta && !/^\d{4}-\d{2}$/.test(datos.hasta)) errores.hasta = 'El mes final no es válido.';
    if (datos.hasta && datos.desde && datos.hasta < datos.desde) {
      errores.hasta = 'El mes final no puede ser anterior al inicial.';
    }
    if (datos.tipo === 'gasto' && datos.medioPago && !FP.medios.esValido(datos.medioPago)) {
      errores.medioPago = 'Elige débito, crédito o efectivo.';
    }
    return errores;
  }

  function hayErrores(errores) { return Object.keys(errores).length > 0; }

  return {
    movimientosDe: movimientosDe, filtrarMovimientos: filtrarMovimientos, ordenarRecientes: ordenarRecientes,
    esTransferencia: esTransferencia, movimientosContables: movimientosContables,
    validarRango: validarRango, rangoEsParcial: rangoEsParcial, diaDe: diaDe,
    resumen: resumen, totalesPorCategoria: totalesPorCategoria,
    desgloseMedioPago: desgloseMedioPago, gastosSegunMedio: gastosSegunMedio,
    estadoTopes: estadoTopes, estadoDeTope: estadoDeTope, estadoDeCategoria: estadoDeCategoria,
    umbral: umbral, ETIQUETAS_ESTADO: ETIQUETAS_ESTADO, SEVERIDAD_ESTADO: SEVERIDAD_ESTADO,
    coherenciaPresupuesto: coherenciaPresupuesto,
    alertas: alertas, contarAlertas: contarAlertas,
    alertasTodas: alertasTodas, contarAlertasTodas: contarAlertasTodas,
    generarRecurrentes: generarRecurrentes, vigenteEn: vigenteEn,
    pendientesDeRevision: pendientesDeRevision, proximosRecurrentes: proximosRecurrentes,
    periodosConDatos: periodosConDatos, historico: historico, serieMensual: serieMensual,
    comparar: comparar,
    validarMovimiento: validarMovimiento, validarCategoria: validarCategoria,
    validarRecurrente: validarRecurrente, hayErrores: hayErrores
  };
})();
