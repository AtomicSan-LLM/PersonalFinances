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

  /** FR-004: los movimientos pertenecen al mes de su fecha (mes calendario, PA-02). */
  function movimientosDe(periodo) {
    return S().movimientos.filter(function (m) { return U.periodoDe(m.fecha) === periodo; });
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
    let lista = movimientosDe(periodo);

    if (f.tipo && f.tipo !== 'todos') {
      lista = lista.filter(function (m) { return m.tipo === f.tipo; });
    }
    if (f.categoriaId && f.categoriaId !== 'todas') {
      lista = lista.filter(function (m) { return m.categoriaId === f.categoriaId; });
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
  function resumen(periodo) {
    const movs = movimientosDe(periodo);
    let ingresos = 0, gastos = 0;
    movs.forEach(function (m) {
      if (m.tipo === 'ingreso') ingresos += m.monto; else gastos += m.monto;
    });

    const ahorroReal = ingresos - gastos;
    const pres = FP.store.presupuesto(periodo);
    const meta = Number(pres.metaAhorro) || 0;

    return {
      periodo: periodo,
      ingresos: ingresos,
      gastos: gastos,
      ahorroReal: ahorroReal,
      metaAhorro: meta,
      hayMeta: meta > 0,
      cumpleMeta: meta > 0 && ahorroReal >= meta,
      diferenciaMeta: ahorroReal - meta,
      porcentajeMeta: meta > 0 ? (ahorroReal / meta) * 100 : null,
      nMovimientos: movs.length,
      hayDatos: movs.length > 0 || meta > 0 || (pres.topes || []).length > 0
    };
  }

  /** FR-012 — Total por categoría en el mes. Devuelve un Map categoriaId → total. */
  function totalesPorCategoria(periodo, tipo) {
    const mapa = new Map();
    movimientosDe(periodo).forEach(function (m) {
      if (tipo && m.tipo !== tipo) return;
      const k = m.categoriaId || 'sin-categoria';
      mapa.set(k, (mapa.get(k) || 0) + m.monto);
    });
    return mapa;
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
      FP.store.categoriasDe('gasto').forEach(function (c) { ids.add(c.id); });
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
    movimientosDe(periodo).forEach(function (m) {
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
  function historico(n) {
    const periodos = periodosConDatos();
    const lista = (n ? periodos.slice(0, n) : periodos);
    return lista.map(function (p) {
      const r = resumen(p);
      const topes = estadoTopes(p);
      r.excedidas = topes.filter(function (t) { return t.estado === 'excedido'; }).length;
      r.cerca = topes.filter(function (t) { return t.estado === 'cerca'; }).length;
      r.conTope = topes.filter(function (t) { return t.tope !== null; }).length;
      return r;
    });
  }

  /** Serie cronológica ascendente de los últimos `n` meses (para gráficos). */
  function serieMensual(n) {
    const actual = U.periodoActual();
    const conDatos = periodosConDatos();
    const masAntiguo = conDatos.length ? conDatos[conDatos.length - 1] : actual;
    const disponibles = U.diffMeses(masAntiguo, actual) + 1;
    const cantidad = Math.max(1, Math.min(n || 12, Math.max(disponibles, 1)));

    const serie = [];
    for (let i = cantidad - 1; i >= 0; i--) {
      serie.push(resumen(U.sumarMeses(actual, -i)));
    }
    return serie;
  }

  /* ======================================================= comparar === */

  /** FR-027 / PA-11 — Comparación de dos meses. */
  function comparar(periodoA, periodoB) {
    const a = resumen(periodoA), b = resumen(periodoB);

    const indicadores = [
      { clave: 'ingresos', etiqueta: 'Ingresos', a: a.ingresos, b: b.ingresos, mejorEs: 'mas' },
      { clave: 'gastos', etiqueta: 'Gastos', a: a.gastos, b: b.gastos, mejorEs: 'menos' },
      { clave: 'ahorro', etiqueta: 'Ahorro real', a: a.ahorroReal, b: b.ahorroReal, mejorEs: 'mas' },
      { clave: 'meta', etiqueta: 'Meta de ahorro', a: a.metaAhorro, b: b.metaAhorro, mejorEs: 'neutro' }
    ].map(function (ind) {
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
    const totA = totalesPorCategoria(periodoA, 'gasto');
    const totB = totalesPorCategoria(periodoB, 'gasto');
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

    return { a: a, b: b, indicadores: indicadores, cumplimiento: cumplimiento, categorias: categorias };
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
    return errores;
  }

  function hayErrores(errores) { return Object.keys(errores).length > 0; }

  return {
    movimientosDe: movimientosDe, filtrarMovimientos: filtrarMovimientos, ordenarRecientes: ordenarRecientes,
    resumen: resumen, totalesPorCategoria: totalesPorCategoria,
    estadoTopes: estadoTopes, estadoDeTope: estadoDeTope, estadoDeCategoria: estadoDeCategoria,
    umbral: umbral, ETIQUETAS_ESTADO: ETIQUETAS_ESTADO, SEVERIDAD_ESTADO: SEVERIDAD_ESTADO,
    coherenciaPresupuesto: coherenciaPresupuesto,
    alertas: alertas, contarAlertas: contarAlertas,
    generarRecurrentes: generarRecurrentes, vigenteEn: vigenteEn,
    pendientesDeRevision: pendientesDeRevision, proximosRecurrentes: proximosRecurrentes,
    periodosConDatos: periodosConDatos, historico: historico, serieMensual: serieMensual,
    comparar: comparar,
    validarMovimiento: validarMovimiento, validarCategoria: validarCategoria,
    validarRecurrente: validarRecurrente, hayErrores: hayErrores
  };
})();
