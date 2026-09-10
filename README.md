# Finanzas personales

Aplicación web para registrar ingresos y gastos, controlar un presupuesto mensual
y seguir una meta de ahorro. Implementa la especificación
`001-finanzas-personales` y su documento de diseño funcional y UX/UI.

Es de **un solo usuario** y **sin servidor**: los datos viven en tu navegador.

---

## Cómo abrirla

**Opción recomendada** — doble clic en **`iniciar.cmd`**.

Levanta un servidor local con Python y abre la aplicación en
`http://localhost:8765/`. Deja esa ventana negra abierta mientras la uses;
al cerrarla se detiene el servidor (tus datos no se pierden).

**Opción alternativa** — doble clic en `index.html`.

Funciona igual, pero algunos navegadores restringen el almacenamiento en archivos
locales. Si al recargar la página se te borran los datos, usa `iniciar.cmd`.

No necesita instalación, ni Node, ni conexión a internet. Solo un navegador
moderno (Chrome, Edge o Firefox).

### Si la descargaste desde GitHub

1. **Code → Download ZIP**, o `git clone` si tienes Git.
2. Si bajaste el ZIP, **descomprímelo** (clic derecho → Extraer todo). No lo
   ejecutes desde dentro del ZIP: Windows lo abre en una carpeta temporal y la
   aplicación no encontrará sus archivos.
3. Doble clic en `iniciar.cmd`.

Windows puede avisarte de que el archivo viene de internet: *Más información →
Ejecutar de todas formas*.

**Tus datos no viajan con el repositorio.** Los movimientos viven en el
navegador de cada equipo, no en los archivos. Para llevártelos, expórtalos desde
Configuración y guarda ese JSON **fuera** de esta carpeta: el `.gitignore` está
puesto para que no acabe subido por accidente.

---

## Qué hace

| Pantalla | Para qué sirve |
|---|---|
| **Inicio** | Responde «¿cómo voy este mes?»: ingresos, gastos, ahorro real, meta, avisos, presupuesto y últimos movimientos |
| **Movimientos** | Consultar, filtrar, buscar, editar y eliminar movimientos del mes |
| **Presupuesto** | Meta de ahorro y topes de gasto por categoría, con estado de cada uno |
| **Histórico** | Tabla mensual y gráficos de evolución de ingresos, gastos y ahorro |
| **Alertas** | Avisos de cercanía y superación de topes, accionables |
| **Recurrentes** | Movimientos que se repiten cada mes (salario, arriendo…) |
| **Categorías** | Crear, editar, desactivar y eliminar categorías |
| **Comparar** | Dos meses enfrentados, indicador por indicador y categoría por categoría |
| **Configuración** | Moneda, umbral de avisos, tema, copia de seguridad |

### Atajos de teclado

- **N** — registrar un movimiento
- **Alt + ←** / **Alt + →** — mes anterior / siguiente

---

## Decisiones sobre los puntos abiertos de la especificación

La especificación dejó 14 puntos sin resolver. Para poder construir la
aplicación tomé una decisión en cada uno, siguiendo las recomendaciones de la
sección 25 del documento de diseño. **Las que más te podrían interesar cambiar
están en la pantalla de Configuración.**

| Punto | Decisión aplicada | ¿Ajustable? |
|---|---|---|
| **PA-01** Moneda | Peso colombiano (COP), sin decimales | Sí, en Configuración (8 monedas) |
| **PA-02** Periodo | **Mes calendario** (del día 1 al último del mes) | No |
| **PA-03** Editar / eliminar | Permitido siempre, también en meses anteriores. Eliminar un movimiento ofrece **Deshacer** | No |
| **PA-04** Obligatoriedad | Categoría obligatoria; descripción opcional | La descripción, sí |
| **PA-05** Borrar categoría | Si tiene movimientos, topes o recurrentes, se exige **reasignar** a otra categoría o **desactivarla**. Nunca se borra dejando datos huérfanos | No |
| **PA-06** Categorías | Cada categoría es de ingreso **o** de gasto. No se admiten nombres repetidos dentro del mismo tipo (ignora mayúsculas y tildes) | No |
| **PA-07** Presupuesto | Se define **para cada mes**, con botón para copiar el de otro mes. Meta de ahorro como **monto**. Se permiten categorías sin tope, marcadas «Sin límite definido» | No |
| **PA-08** Avisos | Cercanía al **80 %**, superación por encima del 100 %. Un gasto que salta de 70 % a 110 % genera **solo** el aviso de superación | Sí, el umbral |
| **PA-09** Recurrentes | **Generación automática** al abrir la aplicación, hasta el mes actual (nunca meses futuros), y siempre editables. Si el día no existe en el mes (31 en febrero) se usa el **último día válido** | No |
| **PA-10** Cambios en recurrentes | Afectan solo a los meses aún no generados. Al eliminar la regla, eliges si conservar o borrar los movimientos ya creados | No |
| **PA-11** Histórico | Se conserva **indefinidamente**. La comparación enfrenta **dos meses** | No |
| **PA-12** Fechas futuras | Permitidas, marcadas visualmente. Un registro tardío cuenta en el mes de su fecha y recalcula sus avisos | Sí |
| **PA-13** Presupuesto imposible | **Se advierte** cuando topes + meta superan los ingresos previstos del mes | Sí |
| **PA-14** Protección de acceso | **No implementada** — ver abajo | — |

### Sobre PA-14 (protección de acceso)

No añadí contraseña ni PIN, y quiero ser explícito sobre por qué: en una
aplicación que corre entera en tu navegador, cualquier bloqueo se puede saltar
abriendo las herramientas de desarrollo, porque los datos están ahí en claro.
Habría dado **sensación** de seguridad sin darla de verdad.

Lo que sí protege tu información: el bloqueo de sesión de Windows y el perfil de
tu navegador. Los datos no salen nunca de este equipo.

Si necesitas protección real, dímelo: requiere cifrar los datos con una clave que
tú introduzcas (por ejemplo con la Web Crypto API), y es un trabajo aparte.

---

## Tus datos

Se guardan en el `localStorage` del navegador, en este equipo. **No se envían a
ningún servidor.**

Eso significa que se pierden si borras los datos de navegación, cambias de
navegador o de computador. Por eso:

> **Configuración → Copia de seguridad → Exportar mis datos (JSON)**

Guarda ese archivo de vez en cuando. Con **Importar una copia** lo restauras.

Si nunca has usado la aplicación, en Configuración hay un botón para **cargar
datos de ejemplo** (tres meses de movimientos y presupuesto) y explorarla sin
escribir nada.

---

## Estructura del proyecto

```
finanzas-personales/
├── index.html              Estructura de la aplicación
├── iniciar.cmd             Lanzador para Windows
├── pruebas.html            Pruebas de las reglas de negocio
├── css/
│   └── estilos.css         Sistema visual: tokens, componentes, responsive
└── js/
    ├── util.js             Fechas, periodos, formato de dinero
    ├── store.js            Estado, persistencia y operaciones sobre los datos
    ├── dominio.js          Reglas de negocio (sin tocar el DOM)
    ├── graficos.js         Gráficos en SVG, sin librerías
    ├── ui.js               Componentes reutilizables
    ├── formularios.js      Diálogos de alta y edición
    ├── app.js              Navegación, router y arranque
    └── vistas/             Una pantalla por archivo
        ├── inicio.js       ├── presupuesto.js  ├── historico.js
        ├── movimientos.js  ├── categorias.js   ├── comparar.js
        ├── alertas.js      ├── recurrentes.js  └── configuracion.js
```

Las capas están separadas como propone la sección 23 del diseño:
**interfaz → casos de uso → reglas de negocio → datos**. `dominio.js` no toca el
DOM y `store.js` no sabe nada de pantallas, así que las reglas se pueden probar
y cambiar sin tocar la interfaz.

No hay dependencias externas ni paso de compilación: lo que ves es lo que se
ejecuta.

---

## Pruebas

Abre **`pruebas.html`** en el navegador (o `http://localhost:8765/pruebas.html`
si usaste el lanzador).

Son 50 pruebas sobre las reglas de negocio: cálculo del ahorro real, estados de
tope, avisos, generación de recurrentes, reasignación de categorías,
comparación de meses, validaciones y copia de seguridad. Verás en verde las que
pasan y en rojo las que fallan.

Úsalas si cambias alguna regla: te dicen enseguida si rompiste algo.

---

## Accesibilidad

El objetivo es **WCAG 2.2 AA**:

- Ningún estado se comunica solo con color: siempre hay texto e icono
  («Tope superado», «Cerca del límite», «Dentro del límite»…).
- Navegación completa por teclado, con foco visible.
- Etiquetas asociadas a cada control y errores enlazados por `aria-describedby`.
- Objetivos de pulsación de al menos 24 × 24 px.
- Encabezados semánticos, tablas con `th`/`scope`, enlace para saltar al contenido.
- Respeta `prefers-reduced-motion` y el tema claro/oscuro del sistema.

---

## Alcance

Implementado: las seis historias de usuario de la especificación (HU-1 a HU-6)
y los requisitos FR-001 a FR-029.

Fuera de alcance, como indica la especificación: conexión con bancos,
importación de extractos, varios usuarios, deudas, inversiones, exportación de
reportes y proyecciones financieras.
