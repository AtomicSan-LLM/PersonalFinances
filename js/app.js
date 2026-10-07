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
    pintarNav(document.getElementById('nav-inferior'), NAV_PRINCIPAL);
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
      const activo = a.dataset.ruta === rutaActual;
      if (activo) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');

      const globo = a.querySelector('.nav-enlace__globo');
      if (globo) {
        globo.hidden = nAlertas === 0;
        globo.textContent = nAlertas > 9 ? '9+' : String(nAlertas);
        globo.setAttribute('aria-label', nAlertas + ' aviso(s) pendiente(s)');
      }
    });
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
    if (!vista.usaRangoDias) { mostrarErrorRango({}); return; }

    const max = maxDiasRango(vista);
    const inDesde = document.getElementById('input-dia-desde');
    const inHasta = document.getElementById('input-dia-hasta');
    inDesde.max = String(max);
    inHasta.max = String(max);
    inDesde.value = String(efectivo ? efectivo.desde : 1);
    inHasta.value = String(efectivo ? efectivo.hasta : max);
    caja.classList.toggle('selector-dias--activo', !!efectivo);
    caja.querySelector('[data-accion="mes-completo"]').hidden = !efectivo;
    mostrarErrorRango({});
  }

  function mostrarErrorRango(errores) {
    const aviso = document.getElementById('aviso-dias');
    const inDesde = document.getElementById('input-dia-desde');
    const inHasta = document.getElementById('input-dia-hasta');
    const mensajes = Object.keys(errores).map(function (k) { return errores[k]; });

    aviso.textContent = mensajes.join(' ');
    aviso.hidden = mensajes.length === 0;
    /* En móvil los campos están en un panel plegable: se abre para que se vea qué corregir. */
    if (mensajes.length) abrirFiltros(true);
    [['desde', inDesde], ['hasta', inHasta]].forEach(function (par) {
      if (errores[par[0]]) par[1].setAttribute('aria-invalid', 'true');
      else par[1].removeAttribute('aria-invalid');
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

  /* ------------------------------------------- botón flotante (FAB) ----- */

  let ultimoScroll = 0;

  function actualizarFab() {
    const fab = document.querySelector('.fab');
    if (!fab) return;
    const y = window.scrollY;
    if (y > ultimoScroll + 6 && y > 120) fab.classList.add('fab--oculto');
    else if (y < ultimoScroll - 6 || y <= 120) fab.classList.remove('fab--oculto');
    ultimoScroll = y;
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
      if (e.target.closest('.tabla-contenedor, svg, input, select, textarea, .menu, dialog')) return;
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

  function leerDia(texto) {
    return String(texto).trim() === '' ? NaN : Number(texto);
  }

  /** Aplica lo escrito en «Del día [ ] al [ ]»; si no es válido, avisa y no cambia nada. */
  function aplicarRangoDesdeCampos() {
    const vista = RUTAS[rutaActual]();
    if (!vista.usaRangoDias) return;
    const max = maxDiasRango(vista);
    const desde = leerDia(document.getElementById('input-dia-desde').value);
    const hasta = leerDia(document.getElementById('input-dia-hasta').value);

    const errores = FP.dominio.validarRango(desde, hasta, max);
    if (Object.keys(errores).length) { mostrarErrorRango(errores); return; }

    rango = (desde === 1 && hasta === max) ? null : { desde: desde, hasta: hasta };
    pintar();
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
      const input = document.getElementById('input-mes');
      if (input.value !== periodo) input.value = periodo;

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
    document.getElementById('input-mes').addEventListener('change', function (e) {
      cambiarPeriodo(e.target.value);
    });

    /* Selector de medio de pago */
    construirSelectorMedio();
    const inputMedio = document.getElementById('input-medio');
    if (inputMedio) inputMedio.addEventListener('change', function (e) { cambiarMedioPago(e.target.value); });

    /* Filtros plegables (móvil), botón flotante y deslizar para cambiar de mes */
    document.getElementById('btn-filtros').addEventListener('click', function () {
      abrirFiltros(!filtrosAbiertos);
    });
    window.addEventListener('scroll', actualizarFab, { passive: true });
    conectarDeslizarMes();

    /* Rango de días del mes */
    ['input-dia-desde', 'input-dia-hasta'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', aplicarRangoDesdeCampos);
    });
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
