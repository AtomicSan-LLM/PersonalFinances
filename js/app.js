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
  const mqOscuro = window.matchMedia('(prefers-color-scheme: dark)');

  let rutaActual = 'inicio';
  let periodo = U.periodoActual();
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
    const nAlertas = FP.dominio.contarAlertas(periodo);

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

  function refrescar() { pintar(); }

  /* --------------------------------------------------------- pintar --- */

  function pintar() {
    if (renderizando) return;
    renderizando = true;

    try {
      const vista = RUTAS[rutaActual]();
      const contenido = document.getElementById('contenido');
      const ctx = {
        periodo: periodo,
        params: paramsPendientes,
        irA: irA,
        refrescar: refrescar,
        cambiarPeriodo: cambiarPeriodo
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
  function periodoActivo() { return periodo; }

  return {
    iniciar: iniciar,
    irA: irA,
    refrescar: refrescar,
    cambiarPeriodo: cambiarPeriodo,
    periodoActivo: periodoActivo,
    aplicarTema: aplicarTema,
    esMovil: esMovil
  };
})();

document.addEventListener('DOMContentLoaded', function () { FP.app.iniciar(); });
