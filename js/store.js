/* ==========================================================================
   store.js — Estado, persistencia y operaciones sobre los datos
   Los datos viven en el navegador (localStorage). No se envía nada a ningún
   servidor. La copia de seguridad se hace exportando/importando un JSON.
   ========================================================================== */
window.FP = window.FP || {};

FP.store = (function () {
  'use strict';

  const U = FP.util;
  const CLAVE = 'fp.finanzas.v1';
  const VERSION = 1;

  const suscriptores = [];
  let almacenamientoOk = true;
  let ultimoError = null;

  /* ------------------------------------------------------- estado base -- */

  function configPorDefecto() {
    return {
      // PA-01 — Moneda
      moneda: 'COP',
      locale: 'es-CO',
      decimales: 0,
      // PA-08 — Umbral de aviso de cercanía al tope
      umbralAviso: 80,
      avisarMetaAhorro: true,
      // PA-13 — Advertir cuando el presupuesto no es alcanzable
      avisarPresupuestoImposible: true,
      // PA-04 — Obligatoriedad de la descripción (la categoría siempre es obligatoria)
      descripcionObligatoria: false,
      // PA-12 — Movimientos con fecha futura
      permitirFechaFutura: true,
      tema: 'auto'
    };
  }

  function estadoVacio() {
    return {
      version: VERSION,
      creadoEn: new Date().toISOString(),
      config: configPorDefecto(),
      categorias: [],
      movimientos: [],
      recurrentes: [],
      presupuestos: [],
      /* Registro de generaciones ya realizadas: "recurrenteId|YYYY-MM" → true.
         Evita que un movimiento recurrente que el usuario borró a propósito
         vuelva a generarse en el siguiente arranque. */
      generados: {},
      /* Avisos descartados: "YYYY-MM|categoriaId|condicion" → true */
      avisosDescartados: {}
    };
  }

  const CATEGORIAS_INICIALES = [
    { nombre: 'Vivienda', tipo: 'gasto', icono: '🏠' },
    { nombre: 'Mercado', tipo: 'gasto', icono: '🛒' },
    { nombre: 'Transporte', tipo: 'gasto', icono: '🚌' },
    { nombre: 'Servicios', tipo: 'gasto', icono: '💡' },
    { nombre: 'Salud', tipo: 'gasto', icono: '🩺' },
    { nombre: 'Entretenimiento', tipo: 'gasto', icono: '🎬' },
    { nombre: 'Otros gastos', tipo: 'gasto', icono: '📦' },
    { nombre: 'Salario', tipo: 'ingreso', icono: '💼' },
    { nombre: 'Otros ingresos', tipo: 'ingreso', icono: '💵' }
  ];

  let state = estadoVacio();

  /* ------------------------------------------------------ persistencia -- */

  function cargar() {
    let crudo = null;
    try {
      crudo = window.localStorage.getItem(CLAVE);
    } catch (e) {
      almacenamientoOk = false;
      ultimoError = 'El navegador no permite guardar datos en este contexto.';
    }

    if (!crudo) {
      state = estadoVacio();
      sembrarCategorias();
      guardar();
      return state;
    }

    try {
      const datos = JSON.parse(crudo);
      state = migrar(datos);
    } catch (e) {
      almacenamientoOk = false;
      ultimoError = 'Los datos guardados no se pudieron leer.';
      state = estadoVacio();
      sembrarCategorias();
    }
    return state;
  }

  /** Punto único para futuras migraciones de esquema. */
  function migrar(datos) {
    const base = estadoVacio();
    const s = Object.assign(base, datos || {});
    s.version = VERSION;
    s.config = Object.assign(configPorDefecto(), datos && datos.config);
    s.categorias = Array.isArray(s.categorias) ? s.categorias : [];
    s.movimientos = Array.isArray(s.movimientos) ? s.movimientos : [];
    s.recurrentes = Array.isArray(s.recurrentes) ? s.recurrentes : [];
    s.presupuestos = Array.isArray(s.presupuestos) ? s.presupuestos : [];
    s.generados = (s.generados && typeof s.generados === 'object') ? s.generados : {};
    s.avisosDescartados = (s.avisosDescartados && typeof s.avisosDescartados === 'object') ? s.avisosDescartados : {};
    return s;
  }

  function guardar() {
    try {
      window.localStorage.setItem(CLAVE, JSON.stringify(state));
      almacenamientoOk = true;
      ultimoError = null;
      return true;
    } catch (e) {
      almacenamientoOk = false;
      ultimoError = (e && e.name === 'QuotaExceededError')
        ? 'No queda espacio de almacenamiento en el navegador.'
        : 'No se pudieron guardar los cambios en este navegador.';
      return false;
    }
  }

  function sembrarCategorias() {
    state.categorias = CATEGORIAS_INICIALES.map(function (c, i) {
      return { id: U.uid('cat'), nombre: c.nombre, tipo: c.tipo, icono: c.icono, activa: true, orden: i };
    });
  }

  /* ---------------------------------------------------- notificaciones -- */

  function suscribir(fn) {
    suscriptores.push(fn);
    return function () {
      const i = suscriptores.indexOf(fn);
      if (i >= 0) suscriptores.splice(i, 1);
    };
  }

  function notificar() {
    suscriptores.forEach(function (fn) {
      try { fn(state); } catch (e) { console.error('Error en suscriptor:', e); }
    });
  }

  /** Aplica un cambio, persiste y avisa a la interfaz. */
  function aplicar(mutador) {
    const resultado = mutador(state);
    guardar();
    notificar();
    return resultado;
  }

  /* ------------------------------------------------------ movimientos -- */

  function crearMovimiento(datos) {
    return aplicar(function (s) {
      const mov = {
        id: U.uid('mov'),
        fecha: datos.fecha,
        monto: Math.abs(Number(datos.monto) || 0),
        tipo: datos.tipo === 'ingreso' ? 'ingreso' : 'gasto',
        descripcion: (datos.descripcion || '').trim(),
        categoriaId: datos.categoriaId || null,
        recurrenteId: datos.recurrenteId || null,
        revisar: !!datos.revisar,
        creadoEn: new Date().toISOString()
      };
      s.movimientos.push(mov);
      return mov;
    });
  }

  function actualizarMovimiento(id, cambios) {
    return aplicar(function (s) {
      const mov = s.movimientos.find(function (m) { return m.id === id; });
      if (!mov) return null;
      if (cambios.fecha !== undefined) mov.fecha = cambios.fecha;
      if (cambios.monto !== undefined) mov.monto = Math.abs(Number(cambios.monto) || 0);
      if (cambios.tipo !== undefined) mov.tipo = cambios.tipo === 'ingreso' ? 'ingreso' : 'gasto';
      if (cambios.descripcion !== undefined) mov.descripcion = (cambios.descripcion || '').trim();
      if (cambios.categoriaId !== undefined) mov.categoriaId = cambios.categoriaId;
      if (cambios.revisar !== undefined) mov.revisar = !!cambios.revisar;
      mov.modificadoEn = new Date().toISOString();
      return mov;
    });
  }

  /** Elimina y devuelve una función para deshacer. */
  function eliminarMovimiento(id) {
    let copia = null, posicion = -1;
    aplicar(function (s) {
      posicion = s.movimientos.findIndex(function (m) { return m.id === id; });
      if (posicion < 0) return;
      copia = JSON.parse(JSON.stringify(s.movimientos[posicion]));
      s.movimientos.splice(posicion, 1);
    });
    if (!copia) return null;
    return function deshacer() {
      aplicar(function (s) {
        const yaExiste = s.movimientos.some(function (m) { return m.id === copia.id; });
        if (!yaExiste) s.movimientos.splice(Math.min(posicion, s.movimientos.length), 0, copia);
      });
    };
  }

  function movimiento(id) {
    return state.movimientos.find(function (m) { return m.id === id; }) || null;
  }

  /* -------------------------------------------------------- categorías -- */

  function categoria(id) {
    return state.categorias.find(function (c) { return c.id === id; }) || null;
  }

  function categoriasDe(tipo, incluirInactivas) {
    return state.categorias
      .filter(function (c) {
        if (tipo && c.tipo !== tipo) return false;
        if (!incluirInactivas && c.activa === false) return false;
        return true;
      })
      .sort(function (a, b) { return (a.orden || 0) - (b.orden || 0) || a.nombre.localeCompare(b.nombre, 'es'); });
  }

  /** PA-06: no se permiten nombres repetidos dentro del mismo tipo. */
  function nombreCategoriaRepetido(nombre, tipo, exceptoId) {
    const n = U.normalizar(nombre);
    return state.categorias.some(function (c) {
      return c.id !== exceptoId && c.tipo === tipo && U.normalizar(c.nombre) === n;
    });
  }

  function crearCategoria(datos) {
    return aplicar(function (s) {
      const cat = {
        id: U.uid('cat'),
        nombre: (datos.nombre || '').trim(),
        tipo: datos.tipo === 'ingreso' ? 'ingreso' : 'gasto',
        icono: datos.icono || (datos.tipo === 'ingreso' ? '💵' : '📦'),
        activa: true,
        orden: s.categorias.length
      };
      s.categorias.push(cat);
      return cat;
    });
  }

  function actualizarCategoria(id, cambios) {
    return aplicar(function (s) {
      const cat = s.categorias.find(function (c) { return c.id === id; });
      if (!cat) return null;
      if (cambios.nombre !== undefined) cat.nombre = (cambios.nombre || '').trim();
      if (cambios.icono !== undefined) cat.icono = cambios.icono;
      if (cambios.activa !== undefined) cat.activa = !!cambios.activa;
      // El tipo no se cambia si ya tiene movimientos: alteraría el histórico.
      if (cambios.tipo !== undefined && !usoDeCategoria(id).movimientos) {
        cat.tipo = cambios.tipo === 'ingreso' ? 'ingreso' : 'gasto';
      }
      return cat;
    });
  }

  /** Cuántos movimientos, topes y recurrentes dependen de una categoría (PA-05). */
  function usoDeCategoria(id) {
    const movimientos = state.movimientos.filter(function (m) { return m.categoriaId === id; }).length;
    const recurrentes = state.recurrentes.filter(function (r) { return r.categoriaId === id; }).length;
    let topes = 0;
    state.presupuestos.forEach(function (p) {
      topes += (p.topes || []).filter(function (t) { return t.categoriaId === id; }).length;
    });
    return { movimientos: movimientos, recurrentes: recurrentes, topes: topes };
  }

  /**
   * PA-05 — Elimina una categoría.
   * Si `destinoId` viene informado, primero reasigna movimientos, recurrentes y
   * topes a esa categoría. Sin destino, solo elimina si no tiene dependencias.
   */
  function eliminarCategoria(id, destinoId) {
    return aplicar(function (s) {
      if (destinoId) {
        s.movimientos.forEach(function (m) { if (m.categoriaId === id) m.categoriaId = destinoId; });
        s.recurrentes.forEach(function (r) { if (r.categoriaId === id) r.categoriaId = destinoId; });
        s.presupuestos.forEach(function (p) {
          const topes = p.topes || [];
          const destino = topes.find(function (t) { return t.categoriaId === destinoId; });
          const origen = topes.find(function (t) { return t.categoriaId === id; });
          if (origen) {
            if (destino) destino.monto += origen.monto;   // se fusionan los topes
            else origen.categoriaId = destinoId;
          }
        });
      }
      s.categorias = s.categorias.filter(function (c) { return c.id !== id; });
      return true;
    });
  }

  /* ------------------------------------------------------ presupuestos -- */

  /** Devuelve el presupuesto del periodo (creándolo en memoria si no existe). */
  function presupuesto(periodo) {
    const p = state.presupuestos.find(function (x) { return x.periodo === periodo; });
    return p || { periodo: periodo, metaAhorro: 0, topes: [] };
  }

  function presupuestoEditable(s, periodo) {
    let p = s.presupuestos.find(function (x) { return x.periodo === periodo; });
    if (!p) {
      p = { periodo: periodo, metaAhorro: 0, topes: [] };
      s.presupuestos.push(p);
    }
    if (!Array.isArray(p.topes)) p.topes = [];
    return p;
  }

  function definirMetaAhorro(periodo, monto) {
    return aplicar(function (s) {
      const p = presupuestoEditable(s, periodo);
      p.metaAhorro = Math.max(0, Number(monto) || 0);
      return p;
    });
  }

  function definirTope(periodo, categoriaId, monto) {
    return aplicar(function (s) {
      const p = presupuestoEditable(s, periodo);
      const existente = p.topes.find(function (t) { return t.categoriaId === categoriaId; });
      const valor = Math.max(0, Number(monto) || 0);
      if (existente) existente.monto = valor;
      else p.topes.push({ categoriaId: categoriaId, monto: valor });
      return p;
    });
  }

  function eliminarTope(periodo, categoriaId) {
    return aplicar(function (s) {
      const p = presupuestoEditable(s, periodo);
      p.topes = p.topes.filter(function (t) { return t.categoriaId !== categoriaId; });
      return p;
    });
  }

  /** PA-07 — Copiar el presupuesto de otro mes (por defecto, el anterior). */
  function copiarPresupuesto(periodoOrigen, periodoDestino) {
    return aplicar(function (s) {
      const origen = s.presupuestos.find(function (x) { return x.periodo === periodoOrigen; });
      if (!origen) return false;
      const destino = presupuestoEditable(s, periodoDestino);
      destino.metaAhorro = origen.metaAhorro || 0;
      destino.topes = (origen.topes || []).map(function (t) {
        return { categoriaId: t.categoriaId, monto: t.monto };
      });
      return true;
    });
  }

  /** Periodos anteriores a `periodo` que tienen presupuesto definido, del más reciente al más antiguo. */
  function periodosConPresupuesto(antesDe) {
    return state.presupuestos
      .filter(function (p) {
        if (antesDe && p.periodo >= antesDe) return false;
        return (p.metaAhorro > 0) || (p.topes || []).length > 0;
      })
      .map(function (p) { return p.periodo; })
      .sort()
      .reverse();
  }

  /* ------------------------------------------------------- recurrentes -- */

  function recurrente(id) {
    return state.recurrentes.find(function (r) { return r.id === id; }) || null;
  }

  function crearRecurrente(datos) {
    return aplicar(function (s) {
      const rec = {
        id: U.uid('rec'),
        tipo: datos.tipo === 'ingreso' ? 'ingreso' : 'gasto',
        monto: Math.abs(Number(datos.monto) || 0),
        descripcion: (datos.descripcion || '').trim(),
        categoriaId: datos.categoriaId || null,
        diaMes: U.clamp(Number(datos.diaMes) || 1, 1, 31),
        desde: datos.desde || U.periodoActual(),
        hasta: datos.hasta || null,
        montoVariable: !!datos.montoVariable,
        activo: datos.activo === undefined ? true : !!datos.activo,
        creadoEn: new Date().toISOString()
      };
      s.recurrentes.push(rec);
      return rec;
    });
  }

  /**
   * PA-10 — Los cambios en un recurrente afectan solo los meses futuros:
   * los movimientos ya generados no se modifican ni se vuelven a generar.
   */
  function actualizarRecurrente(id, cambios) {
    return aplicar(function (s) {
      const rec = s.recurrentes.find(function (r) { return r.id === id; });
      if (!rec) return null;
      ['tipo', 'descripcion', 'categoriaId', 'desde', 'hasta', 'montoVariable', 'activo'].forEach(function (k) {
        if (cambios[k] !== undefined) rec[k] = cambios[k];
      });
      if (cambios.monto !== undefined) rec.monto = Math.abs(Number(cambios.monto) || 0);
      if (cambios.diaMes !== undefined) rec.diaMes = U.clamp(Number(cambios.diaMes) || 1, 1, 31);
      rec.modificadoEn = new Date().toISOString();
      return rec;
    });
  }

  function eliminarRecurrente(id, borrarGenerados) {
    return aplicar(function (s) {
      s.recurrentes = s.recurrentes.filter(function (r) { return r.id !== id; });
      if (borrarGenerados) {
        s.movimientos = s.movimientos.filter(function (m) { return m.recurrenteId !== id; });
      } else {
        // Los movimientos ya generados se conservan, pero pierden el vínculo activo.
        s.movimientos.forEach(function (m) {
          if (m.recurrenteId === id) { m.recurrenteOrigen = id; m.recurrenteId = null; m.revisar = false; }
        });
      }
      Object.keys(s.generados).forEach(function (k) {
        if (k.indexOf(id + '|') === 0) delete s.generados[k];
      });
      return true;
    });
  }

  function marcarGenerado(recurrenteId, periodo) {
    state.generados[recurrenteId + '|' + periodo] = true;
  }

  function yaGenerado(recurrenteId, periodo) {
    return !!state.generados[recurrenteId + '|' + periodo];
  }

  /* ----------------------------------------------------------- avisos -- */

  function claveAviso(periodo, categoriaId, condicion) {
    return periodo + '|' + categoriaId + '|' + condicion;
  }

  function descartarAviso(periodo, categoriaId, condicion) {
    aplicar(function (s) { s.avisosDescartados[claveAviso(periodo, categoriaId, condicion)] = true; });
  }

  function avisoDescartado(periodo, categoriaId, condicion) {
    return !!state.avisosDescartados[claveAviso(periodo, categoriaId, condicion)];
  }

  function restaurarAvisos(periodo) {
    aplicar(function (s) {
      Object.keys(s.avisosDescartados).forEach(function (k) {
        if (!periodo || k.indexOf(periodo + '|') === 0) delete s.avisosDescartados[k];
      });
    });
  }

  /* ------------------------------------------------------ configuración -- */

  function actualizarConfig(cambios) {
    return aplicar(function (s) {
      Object.assign(s.config, cambios);
      FP.dinero.limpiarCache();
      return s.config;
    });
  }

  /* --------------------------------------------------- copias de datos -- */

  function exportarJSON() {
    return JSON.stringify(state, null, 2);
  }

  function importarJSON(texto) {
    const datos = JSON.parse(texto);
    if (!datos || typeof datos !== 'object' || !Array.isArray(datos.movimientos)) {
      throw new Error('El archivo no tiene el formato esperado de una copia de seguridad.');
    }
    return aplicar(function () {
      state = migrar(datos);
      FP.dinero.limpiarCache();
      return state;
    });
  }

  function borrarTodo() {
    return aplicar(function () {
      const tema = state.config.tema;
      state = estadoVacio();
      state.config.tema = tema;
      sembrarCategorias();
      return state;
    });
  }

  /* ------------------------------------------------------------ estado -- */

  function estadoAlmacenamiento() {
    return { ok: almacenamientoOk, mensaje: ultimoError };
  }

  return {
    get state() { return state; },
    CLAVE: CLAVE,

    cargar: cargar, guardar: guardar, suscribir: suscribir, aplicar: aplicar, notificar: notificar,
    estadoAlmacenamiento: estadoAlmacenamiento,

    crearMovimiento: crearMovimiento, actualizarMovimiento: actualizarMovimiento,
    eliminarMovimiento: eliminarMovimiento, movimiento: movimiento,

    categoria: categoria, categoriasDe: categoriasDe, crearCategoria: crearCategoria,
    actualizarCategoria: actualizarCategoria, eliminarCategoria: eliminarCategoria,
    usoDeCategoria: usoDeCategoria, nombreCategoriaRepetido: nombreCategoriaRepetido,

    presupuesto: presupuesto, definirMetaAhorro: definirMetaAhorro, definirTope: definirTope,
    eliminarTope: eliminarTope, copiarPresupuesto: copiarPresupuesto,
    periodosConPresupuesto: periodosConPresupuesto,

    recurrente: recurrente, crearRecurrente: crearRecurrente,
    actualizarRecurrente: actualizarRecurrente, eliminarRecurrente: eliminarRecurrente,
    marcarGenerado: marcarGenerado, yaGenerado: yaGenerado,

    descartarAviso: descartarAviso, avisoDescartado: avisoDescartado, restaurarAvisos: restaurarAvisos,

    actualizarConfig: actualizarConfig,
    exportarJSON: exportarJSON, importarJSON: importarJSON, borrarTodo: borrarTodo
  };
})();
