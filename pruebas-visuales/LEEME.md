# Pruebas visuales de la app de finanzas

Pruebas automáticas de la interfaz con Chrome (puppeteer-core): contraste, desbordes, recortes, navegación y las pantallas móviles. Las pruebas de fórmulas y dominio están en `../pruebas.html`.

## Preparar (una vez)
    npm install            # instala puppeteer-core; usa el Chrome instalado en el sistema

## Usar
1. Servidor de prueba, desde esta carpeta:
       node servidor.js
   Sirve la carpeta del repo en http://localhost:8766/ sin caché. No usar `python -m http.server`: deja que el navegador mezcle JS viejo con CSS nuevo al recargar.
2. Desde esta carpeta:
   - `node probar-pantallas.js`: 9 pantallas × 5 casos (móvil/tablet/escritorio, claro/oscuro), contraste, desborde, fuente, navegación.
   - `node recortes.js`: cifras recortadas en móvil (360/390 px).
   - `node captura.js <pantalla> <ancho> <claro|oscuro> [alto]`: captura de una pantalla.
   - `node contraste.js`: contraste WCAG de los tokens.
   - `node probar-barra.js`: ronda móvil 1 — barra de pestañas, hoja «Más», cabecera compacta (320–720 px, claro/oscuro) y que tablet/escritorio no cambian.
   - `node probar-inicio-movil.js`: ronda móvil 2 — Inicio en teléfono (saldo en fila, gráfica, meta compacta, carrusel, hoja de acciones «⋮») en 320–430 px y que tablet/escritorio no cambian.
   - `node probar-movimientos-movil.js`: ronda móvil 3 — Movimientos en teléfono (chips de filtro, hoja de categorías, lupa, lista por día con subtotal, fila-botón y hoja de detalle) en 320–430 px y que tablet/escritorio no cambian.
   - `node probar-monto.js`: campo «Monto» — separadores de miles al escribir, solo números, cursor estable, pegado y guardado (escritorio y teléfono).
   - `node abrir-movil.js [pantalla] [claro|oscuro]`: abre una ventana de Chrome con vista de iPhone 15 Pro y los datos del export, para revisar a mano (perfil temporal).

Datos: las pruebas cargan tu export de la app (septiembre de 2026). Por privacidad NO está en el repositorio: se busca el archivo `finanzas-personales-2026-10-06.json` en la carpeta que contiene al repo o en la ruta que indiques con la variable de entorno `FP_DATOS`. `FP_CHROME` cambia la ruta de Chrome. Las capturas se guardan en `capturas/`, que tampoco se sube.
