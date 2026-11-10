/* ==========================================================================
   app.js — AppShell, navegación y arranque
   ========================================================================== */
window.FP = window.FP || {};

/* ==========================================================================
   Acciones compartidas entre pantallas
   ========================================================================== */
FP.acciones = (function () {
  'use strict';

  const U = FP.util;

  /**
   * Sección 18 del diseño: no se piden confirmaciones innecesarias para
   * acciones reversibles. Eliminar un movimiento se puede deshacer, así que
   * se ejecuta directamente y se ofrece "Deshacer".
   */
  function eliminarMovimiento(mov, alTerminar) {
    const claves = mov.tipo === 'gasto'
      ? [{ periodo: U.periodoDe(mov.fecha), categoriaId: mov.categoriaId }]
      : [];
    const antes = FP.formularios.capturar(claves);

    const deshacer = FP.store.eliminarMovimiento(mov.id);
    if (!deshacer) return;

    FP.formularios.avisarCambios(antes);

    FP.ui.toast('Movimiento eliminado: ' + (mov.descripcion || FP.dinero.formato(mov.monto)) + '.', {
      accion: {
        etiqueta: 'Deshacer',
        alHacerClic: function () {
          deshacer();
          FP.ui.toast('Movimiento restaurado.', { tipo: 'exito' });
        }
      },
      duracion: 9000
    });

    if (alTerminar) alTerminar();
  }

  function marcarRevisado(mov) {
    FP.store.actualizarMovimiento(mov.id, { revisar: false });
    FP.ui.toast('Movimiento marcado como revisado.', { tipo: 'exito' });
  }

  return { eliminarMovimiento: eliminarMovimiento, marcarRevisado: marcarRevisado };
})();


/* ==========================================================================
   Aplicación
   ========================================================================== */
FP.app = (function () {
  'use strict';

  const U = FP.util;
  const el = U.el;

  const RUTAS = {
    inicio: function () { return FP.vistas.inicio; },
    movimientos: function () { return FP.vistas.movimientos; },
    presupuesto: function () { return FP.vistas.presupuesto; },
    historico: function () { return FP.vistas.historico; },
    alertas: function () { return FP.vistas.alertas; },
    recurrentes: function () { return FP.vistas.recurrentes; },
    categorias: function () { return FP.vistas.categorias; },
    comparar: function () { return FP.vistas.comparar; },
    configuracion: function () { return FP.vistas.configuracion; }
  };

  const NAV_PRINCIPAL = ['inicio', 'movimientos', 'presupuesto', 'historico'];
  const NAV_SECUNDARIA = ['alertas', 'recurrentes', 'categorias', 'comparar', 'configuracion'];

  const mqMovil = window.matchMedia('(max-width: 720px)');
  /* Hasta 900 px (iPad en vertical, teléfonos grandes en horizontal) las listas largas se
     muestran como tarjetas: la tabla de Movimientos mide más de 800 px y no cabe. */
  const mqTarjetas = window.matchMedia('(max-width: 900px)');
  const mqOscuro = window.matchMedia('(prefers-color-scheme: dark)');

  let rutaActual = 'inicio';
  let periodo = U.periodoActual();
  /* Filtro de medio de pago compartido: 'todos' | 'debito' | 'credito' | 'efectivo' | 'sin-especificar'.
     Se recuerda al cambiar de pantalla (no entre sesiones) y solo actúa donde la
     vista declara `usaFiltroMedio` (Movimientos, Histórico y Comparar). */
  let medioPago = 'todos';
  /* Rango de días del mes: null = mes completo, o {desde, hasta}. Como el medio de
     pago, se recuerda al cambiar de pantalla y solo actúa donde la vista declara
     `usaRangoDias` (Inicio, Movimientos, Histórico y Comparar). */
  let rango = null;
  let paramsPendientes = null;
  let renderizando = false;

  /* ------------------------------------------------------- arranque --- */

  function iniciar() {
    FP.store.cargar();
    sincronizarTema();

    /* PA-09: al abrir la aplicación se generan los recurrentes pendientes. */
    const generados = FP.dominio.generarRecurrentes();

    construirNavegacion();
    conectarEventos();

    FP.store.suscribir(function () { pintar(); });
    window.addEventListener('hashchange', function () { leerHash(); pintar(); });

    if (mqMovil.addEventListener) mqMovil.addEventListener('change', pintar);
    else if (mqMovil.addListener) mqMovil.addListener(pintar);
    if (mqTarjetas.addEventListener) mqTarjetas.addEventListener('change', pintar);
    else if (mqTarjetas.addListener) mqTarjetas.addListener(pintar);
    if (mqOscuro.addEventListener) mqOscuro.addEventListener('change', sincronizarTema);
    else if (mqOscuro.addListener) mqOscuro.addListener(sincronizarTema);

    leerHash();
    pintar();

    if (generados.length) {
      FP.ui.toast('Se ' + (generados.length === 1
        ? 'generó 1 movimiento recurrente'
        : 'generaron ' + generados.length + ' movimientos recurrentes') + ' de este mes y anteriores.',
        { duracion: 6000 });
    }

    const estado = FP.store.estadoAlmacenamiento();
    if (!estado.ok) {
      FP.ui.toast(estado.mensaje + ' Revisa Configuración → Sobre tus datos.',
        { tipo: 'error', duracion: 12000 });
    }
  }

  /* ------------------------------------------------------ navegación -- */

  function construirNavegacion() {
    pintarNav(document.getElementById('nav-principal'), NAV_PRINCIPAL.concat(['separador'], NAV_SECUNDARIA));
    pintarBarraInferior(document.getElementById('nav-inferior'));
  }

  /* ----------------------------------------- barra de pestañas (móvil) -- */

  /* Íconos de línea (24 × 24, trazo con el color del texto). Son constantes de este
     archivo, nunca datos del usuario. */
  const ICONOS = {
    inicio: '<path d="M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z"/>',
    movimientos: '<path d="M7.5 20V5m0 0L4 8.5M7.5 5 11 8.5M16.5 4v15m0 0L20 15.5M16.5 19 13 15.5"/>',
    presupuesto: '<path d="M11 4a8.5 8.5 0 1 0 9 9h-9z"/><path d="M14.5 3.2a8.5 8.5 0 0 1 6.3 6.3h-6.3z"/>',
    historico: '<path d="M4 20h16M6 15.5l4-4.5 3.5 3L19 7.5"/>',
    alertas: '<path d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"/>',
    recurrentes: '<path d="M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4"/>',
    categorias: '<path d="M3.5 12V4.5a1 1 0 0 1 1-1H12l8.5 8.5-8.5 8.5z"/><circle cx="8" cy="8" r="1.3"/>',
    comparar: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
    /* Engranaje (trazo de Feather Icons, licencia MIT), reducido para igualar el peso del resto. */
    configuracion: '<g transform="translate(1.8 1.8) scale(.85)"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></g>',
    mas: '<circle cx="5" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.7" fill="currentColor" stroke="none"/>',
    registrar: '<path d="M12 5v14M5 12h14"/>',
    flecha: '<path d="M9 5l7 7-7 7"/>'
  };

  function iconoLinea(nombre, clase) {
    return el('span', {
      class: clase || 'nav-enlace__icono',
      'aria-hidden': 'true',
      html: '<svg class="icono-linea" viewBox="0 0 24 24">' + ICONOS[nombre] + '</svg>'
    });
  }

  /* Nombres cortos: en una pestaña de 70 px no cabe «Movimientos» a un tamaño legible. */
  const ETIQUETA_CORTA = { movimientos: 'Movim.', presupuesto: 'Presup.' };

  /* Lo que no cabe en la barra vive en la hoja «Más». */
  const NAV_MAS = ['historico', 'alertas', 'recurrentes', 'categorias', 'comparar', 'configuracion'];

  /**
   * Barra de pestañas: Inicio · Movimientos · ＋ · Presupuesto · Más. El «＋» central
   * registra un movimiento (antes era un botón flotante que tapaba el contenido).
   */
  function pintarBarraInferior(contenedor) {
    if (!contenedor) return;
    U.vaciar(contenedor);

    function pestana(clave) {
      const vista = RUTAS[clave]();
      return el('li', null, el('a', {
        class: 'nav-enlace', href: '#/' + clave, dataset: { ruta: clave },
        'aria-label': vista.titulo
      }, [
        iconoLinea(clave),
        el('span', { class: 'nav-enlace__texto', 'aria-hidden': 'true' }, ETIQUETA_CORTA[clave] || vista.titulo)
      ]));
    }

    contenedor.appendChild(pestana('inicio'));
    contenedor.appendChild(pestana('movimientos'));

    contenedor.appendChild(el('li', { class: 'nav-inferior__centro' }, el('button', {
      type: 'button', class: 'nav-registrar',
      dataset: { accion: 'nuevo-movimiento' },
      'aria-label': 'Registrar movimiento'
    }, iconoLinea('registrar', 'nav-registrar__icono'))));

    contenedor.appendChild(pestana('presupuesto'));

    contenedor.appendChild(el('li', null, el('button', {
      type: 'button', class: 'nav-enlace nav-enlace--mas', id: 'btn-mas',
      'aria-haspopup': 'dialog',
      onclick: abrirMas
    }, [
      iconoLinea('mas'),
      el('span', { class: 'nav-enlace__texto' }, 'Más'),
      el('span', { class: 'nav-enlace__globo', hidden: true })
    ])));
  }

  /** Hoja inferior con el resto de pantallas. */
  function abrirMas() {
    const nAlertas = FP.dominio.contarAlertasTodas();
    let hoja = null;

    const lista = el('ul', { class: 'lista-mas' }, NAV_MAS.map(function (clave) {
      const vista = RUTAS[clave]();
      const actual = clave === rutaActual;
      return el('li', null, el('a', {
        class: 'lista-mas__item', href: '#/' + clave,
        'aria-current': actual ? 'page' : null,
        onclick: function () { hoja.cerrar(); }
      }, [
        iconoLinea(clave, 'lista-mas__icono'),
        el('span', { class: 'lista-mas__texto' }, vista.titulo),
        clave === 'alertas' && nAlertas
          ? el('span', { class: 'nav-enlace__globo', 'aria-label': nAlertas + ' aviso(s) pendiente(s)' },
              nAlertas > 9 ? '9+' : String(nAlertas))
          : null,
        iconoLinea('flecha', 'lista-mas__flecha')
      ]));
    }));

    hoja = FP.ui.dialogo({ titulo: 'Más', clase: 'dialogo--mas', contenido: lista });
  }

  function pintarNav(contenedor, rutas) {
    if (!contenedor) return;
    U.vaciar(contenedor);

    rutas.forEach(function (clave) {
      if (clave === 'separador') {
        contenedor.appendChild(el('li', {
          role: 'presentation',
          style: 'height:1px;background:var(--borde);margin:12px 8px'
        }));
        return;
      }

      const vista = RUTAS[clave]();
      const enlace = el('a', {
        class: 'nav-enlace',
        href: '#/' + clave,
        dataset: { ruta: clave }
      }, [
        el('span', { class: 'nav-enlace__icono', 'aria-hidden': 'true' }, vista.icono),
        el('span', null, vista.titulo)
      ]);

      if (clave === 'alertas') enlace.appendChild(el('span', { class: 'nav-enlace__globo', hidden: true }));
      contenedor.appendChild(el('li', null, enlace));
    });
  }

  function actualizarNav() {
    /* Global: un aviso en un mes distinto al que se está viendo debe
       encender igual la campana (ver dominio.alertasTodas). */
    const nAlertas = FP.dominio.contarAlertasTodas();

    U.$$('.nav-enlace').forEach(function (a) {
      /* «Más» se marca cuando la pantalla abierta es una de las de su hoja. */
      const activo = a.id === 'btn-mas'
        ? NAV_MAS.indexOf(rutaActual) >= 0
        : a.dataset.ruta === rutaActual;
      if (activo) a.setAttribute('aria-current', a.id === 'btn-mas' ? 'true' : 'page');
      else a.removeAttribute('aria-current');

      const globo = a.querySelector('.nav-enlace__globo');
      if (globo) {
        globo.hidden = nAlertas === 0;
        globo.textContent = nAlertas > 9 ? '9+' : String(nAlertas);
        globo.setAttribute('aria-label', nAlertas + ' aviso(s) pendiente(s)');
      }
    });

    /* Campana de la cabecera (móvil) */
    const campana = document.getElementById('campana');
    if (campana) {
      const globo = document.getElementById('campana-globo');
      globo.hidden = nAlertas === 0;
      globo.textContent = nAlertas > 9 ? '9+' : String(nAlertas);
      campana.setAttribute('aria-label', 'Avisos' + (nAlertas ? ': ' + nAlertas + ' pendiente(s)' : ''));
      if (rutaActual === 'alertas') campana.setAttribute('aria-current', 'page');
      else campana.removeAttribute('aria-current');
    }
  }

  /* ----------------------------------------------------------- hash --- */

  function leerHash() {
    const bruto = (window.location.hash || '').replace(/^#\/?/, '');
    const clave = bruto.split('?')[0] || 'inicio';
    rutaActual = RUTAS[clave] ? clave : 'inicio';
  }

  function irA(ruta, params) {
    paramsPendientes = params || null;
    const destino = '#/' + ruta;

    if (destino === window.location.hash) { pintar(); return; }

    try { window.location.hash = destino; } catch (e) { /* entorno sin hash */ }

    /* Si el contenedor no permite cambiar el hash, se navega igualmente. */
    if (window.location.hash !== destino) {
      rutaActual = RUTAS[ruta] ? ruta : 'inicio';
      pintar();
    }
  }

  function cambiarPeriodo(nuevo) {
    if (!/^\d{4}-\d{2}$/.test(nuevo)) return;
    periodo = nuevo;
    pintar();
  }

  function cambiarMedioPago(nuevo) {
    const validos = ['todos'].concat(FP.medios.todos().map(function (m) { return m.clave; }));
    if (validos.indexOf(nuevo) < 0) return;
    medioPago = nuevo;
    pintar();
  }

  function construirSelectorMedio() {
    const sel = document.getElementById('input-medio');
    if (!sel) return;
    U.vaciar(sel);
    sel.appendChild(el('option', { value: 'todos' }, 'Todos los gastos'));
    FP.medios.todos().forEach(function (m) {
      sel.appendChild(el('option', { value: m.clave }, m.icono + ' ' + m.etiqueta));
    });
  }

  function refrescar() { pintar(); }

  /* ------------------------------------------------ rango de días ------ */

  /** Días máximos del selector: los del mes consultado, o 31 si la vista muestra varios meses. */
  function maxDiasRango(vista) {
    return vista.rangoPorMes ? 31 : U.diasEnMes(periodo);
  }

  /**
   * El rango que realmente aplica en esta vista: se recorta a los días del mes
   * (el rango 1–31 en febrero es 1–28) y devuelve null si equivale al mes completo.
   */
  function rangoEfectivo(vista) {
    if (!vista.usaRangoDias || !rango) return null;
    const max = maxDiasRango(vista);
    const desde = Math.min(rango.desde, max);
    const hasta = Math.min(rango.hasta, max);
    return (desde === 1 && hasta === max) ? null : { desde: desde, hasta: hasta };
  }

  function sincronizarSelectorDias(vista, efectivo) {
    const caja = document.getElementById('selector-dias');
    if (!caja) return;
    caja.hidden = !vista.usaRangoDias;
    if (!vista.usaRangoDias) return;

    document.getElementById('rango-etiqueta').textContent = FP.calendario.etiquetaRango(efectivo);
    document.getElementById('btn-rango').setAttribute('aria-label',
      'Rango de días: ' + FP.calendario.etiquetaRango(efectivo).toLowerCase() + '. Cambiar');
    caja.classList.toggle('selector-dias--activo', !!efectivo);
    caja.querySelector('[data-accion="mes-completo"]').hidden = !efectivo;
  }

  /** Abre el calendario para elegir el rango de días de esta pantalla. */
  function abrirRango() {
    const vista = RUTAS[rutaActual]();
    if (!vista.usaRangoDias) return;
    FP.calendario.abrirRango({
      periodo: periodo,
      modo: vista.rangoPorMes ? 'dias' : 'mes',
      max: maxDiasRango(vista),
      rango: rangoEfectivo(vista),
      ancla: document.getElementById('btn-rango'),
      alAplicar: aplicarRango
    });
  }

  /** Aplica el rango elegido (1 hasta el máximo equivale al mes completo). */
  function aplicarRango(desde, hasta) {
    const vista = RUTAS[rutaActual]();
    const max = maxDiasRango(vista);
    rango = (desde === 1 && hasta === max) ? null : { desde: desde, hasta: hasta };
    pintar();
  }

  function abrirMes() {
    FP.calendario.abrirMes({
      periodo: periodo,
      ancla: document.getElementById('btn-mes'),
      alElegir: cambiarPeriodo
    });
  }

  /* ------------------------------------- filtros plegables (móvil) ------ */

  let filtrosAbiertos = false;

  function abrirFiltros(abrir) {
    filtrosAbiertos = !!abrir;
    const panel = document.getElementById('cabecera-filtros');
    const boton = document.getElementById('btn-filtros');
    if (panel) panel.classList.toggle('abierto', filtrosAbiertos);
    if (boton) boton.setAttribute('aria-expanded', String(filtrosAbiertos));
  }

  /**
   * En móvil medio de pago y rango de días viven en un panel plegable. El botón
   * «Filtros» solo aparece si la pantalla usa alguno y muestra cuántos están activos.
   */
  function sincronizarFiltros(vista, rangoVista) {
    const boton = document.getElementById('btn-filtros');
    if (!boton) return;
    const usa = !!(vista.usaFiltroMedio || vista.usaRangoDias);
    boton.hidden = !usa;
    document.querySelector('.cabecera').classList.toggle('cabecera--filtros', usa);

    const activos = (vista.usaFiltroMedio && medioPago !== 'todos' ? 1 : 0) + (rangoVista ? 1 : 0);
    const n = document.getElementById('filtros-n');
    n.hidden = activos === 0;
    n.textContent = String(activos);
    boton.setAttribute('aria-label', 'Filtros' + (activos ? ', ' + activos + ' activo(s)' : ''));

    abrirFiltros(usa && filtrosAbiertos);
  }

  /* ---------------------------------- deslizar para cambiar de mes ------ */

  /**
   * Deslizar el dedo a la derecha/izquierda sobre el contenido va al mes
   * anterior/siguiente. Solo en móvil, solo donde se ve el selector de mes y
   * con umbrales para no confundirlo con un scroll o con una tabla que se desplaza.
   */
  function conectarDeslizarMes() {
    const zona = document.getElementById('contenido');
    let inicio = null;

    zona.addEventListener('touchstart', function (e) {
      inicio = null;
      if (!mqMovil.matches || e.touches.length !== 1) return;
      if (e.target.closest('.tabla-contenedor, .mosaicos--carrusel, svg, input, select, textarea, .menu, dialog')) return;
      const vista = RUTAS[rutaActual]();
      if (vista.ocultarSelectorMes) return;
      inicio = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
    }, { passive: true });

    zona.addEventListener('touchend', function (e) {
      if (!inicio) return;
      const dx = e.changedTouches[0].clientX - inicio.x;
      const dy = e.changedTouches[0].clientY - inicio.y;
      const dt = Date.now() - inicio.t;
      inicio = null;
      if (Math.abs(dx) < 90 || Math.abs(dy) > 50 || Math.abs(dx) < Math.abs(dy) * 2 || dt > 600) return;
      cambiarPeriodo(U.sumarMeses(periodo, dx > 0 ? -1 : 1));
      FP.ui.anunciar('Mes: ' + U.periodoLegible(periodo));
    }, { passive: true });
  }

  function usarMesCompleto() {
    rango = null;
    pintar();
  }

  /* --------------------------------------------------------- pintar --- */

  function pintar() {
    if (renderizando) return;
    renderizando = true;

    try {
      const vista = RUTAS[rutaActual]();
      const contenido = document.getElementById('contenido');
      const rangoVista = rangoEfectivo(vista);
      const ctx = {
        periodo: periodo,
        rango: rangoVista,
        params: paramsPendientes,
        irA: irA,
        refrescar: refrescar,
        cambiarPeriodo: cambiarPeriodo,
        medioPago: medioPago,
        cambiarMedioPago: cambiarMedioPago
      };
      paramsPendientes = null;

      /* Cabecera */
      document.getElementById('titulo-pantalla').textContent = vista.titulo;
      document.getElementById('subtitulo-pantalla').textContent =
        vista.subtitulo ? vista.subtitulo(ctx) : '';
      document.title = vista.titulo + ' · Finanzas personales';

      /* Selector de mes */
      const selector = document.getElementById('selector-mes');
      selector.hidden = !!vista.ocultarSelectorMes;
      const mesLargo = FP.calendario.capitalizar(FP.calendario.etiquetaMes(periodo));
      document.getElementById('mes-etiqueta').textContent = mesLargo;
      /* «Sep 2026» para teléfonos muy angostos; el lector de pantalla recibe el nombre completo. */
      document.getElementById('mes-etiqueta-corta').textContent = mesLargo.slice(0, 3) + ' ' + periodo.slice(0, 4);
      document.getElementById('btn-mes').setAttribute('aria-label', mesLargo + '. Cambiar de mes');

      /* Rango de días: solo donde la vista lo usa */
      sincronizarSelectorDias(vista, rangoVista);

      /* Filtro de medio de pago: solo donde la vista lo usa */
      const selectorMedio = document.getElementById('selector-medio');
      if (selectorMedio) {
        selectorMedio.hidden = !vista.usaFiltroMedio;
        const inputMedio = document.getElementById('input-medio');
        if (inputMedio.value !== medioPago) inputMedio.value = medioPago;
        selectorMedio.classList.toggle('selector-medio--activo', medioPago !== 'todos');
      }

      /* Botón «Filtros» (móvil): contador y estado del panel */
      sincronizarFiltros(vista, rangoVista);

      /* Aviso de mes distinto al actual */
      const aviso = document.getElementById('aviso-mes');
      const esActual = periodo === U.periodoActual();
      aviso.hidden = esActual || !!vista.ocultarSelectorMes;
      if (!aviso.hidden) {
        document.getElementById('aviso-mes-texto').textContent =
          'Estás consultando ' + U.periodoLegible(periodo) + ', no el mes actual.';
      }
      /* En móvil la franja se sustituye por el botón «Mes actual» y el selector resaltado. */
      const hoy = document.getElementById('btn-hoy');
      hoy.hidden = aviso.hidden;
      hoy.setAttribute('aria-label',
        'Estás consultando ' + U.periodoLegible(periodo) + '. Ir al mes actual');
      selector.classList.toggle('selector-mes--otro', !aviso.hidden);

      actualizarNav();

      U.vaciar(contenido);
      vista.render(contenido, ctx);
    } catch (e) {
      console.error(e);
      const contenido = document.getElementById('contenido');
      U.vaciar(contenido);
      contenido.appendChild(el('div', { class: 'tarjeta' }, [
        el('h2', { class: 'seccion__titulo' }, 'Algo salió mal al mostrar esta pantalla'),
        el('p', { class: 'texto-sm texto-apagado mt-3' }, String(e && e.message ? e.message : e)),
        el('div', { class: 'mt-4' }, [
          el('button', {
            type: 'button', class: 'btn btn--primario',
            onclick: function () { irA('inicio'); }
          }, 'Volver al inicio')
        ])
      ]));
    } finally {
      renderizando = false;
    }
  }

  /* -------------------------------------------------------- eventos --- */

  function conectarEventos() {
    /* Selector de mes */
    document.getElementById('btn-mes').addEventListener('click', abrirMes);
    document.getElementById('btn-rango').addEventListener('click', abrirRango);

    /* Selector de medio de pago */
    construirSelectorMedio();
    const inputMedio = document.getElementById('input-medio');
    if (inputMedio) inputMedio.addEventListener('change', function (e) { cambiarMedioPago(e.target.value); });

    /* Filtros plegables (móvil) y deslizar para cambiar de mes */
    document.getElementById('btn-filtros').addEventListener('click', function () {
      abrirFiltros(!filtrosAbiertos);
    });
    conectarDeslizarMes();

    /* Rango de días del mes */
    U.$$('[data-accion="mes-completo"]').forEach(function (b) {
      b.addEventListener('click', usarMesCompleto);
    });

    U.$$('[data-mes]').forEach(function (b) {
      b.addEventListener('click', function () {
        cambiarPeriodo(U.sumarMeses(periodo, b.dataset.mes === 'anterior' ? -1 : 1));
      });
    });

    U.$$('[data-accion="ir-mes-actual"]').forEach(function (b) {
      b.addEventListener('click', function () { cambiarPeriodo(U.periodoActual()); });
    });

    U.$$('[data-accion="nuevo-movimiento"]').forEach(function (b) {
      b.addEventListener('click', function () {
        FP.formularios.movimiento({ periodo: periodo, alGuardar: refrescar });
      });
    });

    U.$$('[data-accion="cambiar-tema"]').forEach(function (b) {
      b.addEventListener('click', function () {
        const actual = document.documentElement.getAttribute('data-tema');
        aplicarTema(actual === 'oscuro' ? 'claro' : 'oscuro');
      });
    });

    /* Sombra de la cabecera al hacer scroll */
    window.addEventListener('scroll', function () {
      const c = document.querySelector('.cabecera');
      if (c) c.classList.toggle('cabecera--fija', window.scrollY > 8);
    }, { passive: true });

    /* Atajos de teclado */
    document.addEventListener('keydown', function (e) {
      const enCampo = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || e.target.isContentEditable;
      const hayDialogo = !!document.querySelector('dialog[open]');
      if (enCampo || hayDialogo || e.ctrlKey || e.metaKey) return;

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        FP.formularios.movimiento({ periodo: periodo, alGuardar: refrescar });
      } else if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        cambiarPeriodo(U.sumarMeses(periodo, -1));
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        cambiarPeriodo(U.sumarMeses(periodo, 1));
      }
    });
  }

  /* ----------------------------------------------------------- tema --- */

  function aplicarTema(tema) {
    FP.store.actualizarConfig({ tema: tema });
    sincronizarTema();
  }

  function sincronizarTema() {
    const preferencia = (FP.store.state.config && FP.store.state.config.tema) || 'auto';

    /* En "automático" manda el sistema operativo. Si la página está embebida
       en un contenedor que impone su propio tema (atributo data-theme), se
       respeta ese, que es lo que el usuario eligió allí. */
    const temaHost = document.documentElement.getAttribute('data-theme');
    const oscuro = preferencia === 'oscuro' ||
      (preferencia === 'auto' && (temaHost ? temaHost === 'dark' : mqOscuro.matches));

    document.documentElement.setAttribute('data-tema', oscuro ? 'oscuro' : 'claro');
    document.documentElement.style.colorScheme = oscuro ? 'dark' : 'light';

    U.$$('[data-tema-etiqueta]').forEach(function (n) {
      n.textContent = oscuro ? 'Tema claro' : 'Tema oscuro';
    });
    U.$$('[data-accion="cambiar-tema"]').forEach(function (b) {
      b.setAttribute('aria-label', oscuro ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
    });
  }

  /* ---------------------------------------------------------- varios -- */

  function esMovil() { return mqMovil.matches; }
  function usaTarjetas() { return mqTarjetas.matches; }
  function periodoActivo() { return periodo; }

  return {
    iniciar: iniciar,
    irA: irA,
    refrescar: refrescar,
    cambiarPeriodo: cambiarPeriodo,
    periodoActivo: periodoActivo,
    medioActivo: function () { return medioPago; },
    cambiarMedioPago: cambiarMedioPago,
    aplicarTema: aplicarTema,
    esMovil: esMovil,
    usaTarjetas: usaTarjetas
  };
})();

document.addEventListener('DOMContentLoaded', function () { FP.app.iniciar(); });
