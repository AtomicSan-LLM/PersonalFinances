// Configuración compartida de las pruebas visuales.
// Los datos personales NO viven en el repo: se leen del export que guardas fuera de él.
//   FP_DATOS  ruta al export JSON de la app (por defecto, junto a la carpeta del repo)
//   FP_CHROME ruta al ejecutable de Chrome
//   FP_BASE   dirección del servidor de prueba
const fs = require('fs');
const path = require('path');

const RUTA_DATOS = process.env.FP_DATOS ||
  path.resolve(__dirname, '..', '..', 'finanzas-personales-2026-10-06.json');

if (!fs.existsSync(RUTA_DATOS)) {
  console.error('No encuentro el export de datos en:\n  ' + RUTA_DATOS +
    '\nExporta una copia desde Configuración y guárdala ahí, o indica otra ruta con la variable FP_DATOS.');
  process.exit(2);
}

const DATOS = fs.readFileSync(RUTA_DATOS, 'utf8');

/** Copia del export con una meta y topes de septiembre de 2026, para que aparezcan avisos. */
function datosConAvisos() {
  const x = JSON.parse(DATOS);
  x.presupuestos = [{
    periodo: '2026-09', metaAhorro: 3000000,
    topes: [
      { categoriaId: 'cat_mtw0q40o_1qrijb', monto: 800000 },
      { categoriaId: 'cat_mtw0q40o_0lvy5k', monto: 1000000 },
      { categoriaId: 'cat_mtw7c2bm_v2czku', monto: 250000 }
    ]
  }];
  return JSON.stringify(x);
}

module.exports = {
  BASE: process.env.FP_BASE || 'http://localhost:8766/',
  CHROME: process.env.FP_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  DATOS: DATOS,
  datosConAvisos: datosConAvisos
};
