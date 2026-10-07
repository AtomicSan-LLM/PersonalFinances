/* ==========================================================================
   matematicas.js — Fórmulas de matemáticas financieras
   Fuente: Vidarte, J. J. (2015). Matemáticas financieras con calculadora y
   Excel. Universidad de San Buenaventura, Cali. Cap. 3–5.
   Todas las funciones son puras (sin DOM ni almacenamiento) y asumen pagos al
   FINAL de cada periodo (anualidad vencida). La tasa `i` es la tasa efectiva
   del MISMO periodo que `n` (si n son meses, i es mensual): libro, p. 73.
   Entradas inválidas devuelven NaN; quien llama decide cómo avisar.
   ========================================================================== */
window.FP = window.FP || {};

FP.matematicas = (function () {
  'use strict';

  function entradaValida(i, n) {
    return typeof i === 'number' && isFinite(i) && i > -1 &&
      typeof n === 'number' && isFinite(n) && n >= 1 && Math.floor(n) === n;
  }

  /**
   * Valor futuro de una anualidad vencida (libro, p. 73):
   *   F = A × [(1 + i)^n − 1] / i        (con i = 0: F = A × n)
   */
  function valorFuturoAnualidad(cuota, i, n) {
    if (!entradaValida(i, n) || !isFinite(cuota)) return NaN;
    if (i === 0) return cuota * n;
    return cuota * (Math.pow(1 + i, n) - 1) / i;
  }

  /**
   * Valor presente de una anualidad vencida (libro, p. 72):
   *   P = A × [1 − (1 + i)^−n] / i       (con i = 0: P = A × n)
   */
  function valorPresenteAnualidad(cuota, i, n) {
    if (!entradaValida(i, n) || !isFinite(cuota)) return NaN;
    if (i === 0) return cuota * n;
    return cuota * (1 - Math.pow(1 + i, -n)) / i;
  }

  /**
   * Cuota periódica que hay que ahorrar para alcanzar una meta (libro, p. 80,
   * despejando A de la fórmula de valor futuro):
   *   A = F × i / [(1 + i)^n − 1]        (con i = 0: A = F / n)
   */
  function cuotaParaMeta(meta, i, n) {
    if (!entradaValida(i, n) || !isFinite(meta)) return NaN;
    if (i === 0) return meta / n;
    return meta * i / (Math.pow(1 + i, n) - 1);
  }

  /**
   * Tasa equivalente (libro, p. 81): (1 + i₂) = (1 + i₁)^factor.
   * Ej.: de mensual a anual, factor = 12; de anual a mensual, factor = 1/12.
   */
  function tasaEquivalente(i, factor) {
    if (typeof i !== 'number' || !isFinite(i) || i <= -1 ||
        typeof factor !== 'number' || !isFinite(factor) || factor <= 0) return NaN;
    return Math.pow(1 + i, factor) - 1;
  }

  /** Tasa efectiva de un periodo (p. ej. mensual) equivalente a una efectiva anual. */
  function tasaPeriodicaDesdeEA(ea, periodosPorAnio) {
    return tasaEquivalente(ea, 1 / periodosPorAnio);
  }

  return {
    valorFuturoAnualidad: valorFuturoAnualidad,
    valorPresenteAnualidad: valorPresenteAnualidad,
    cuotaParaMeta: cuotaParaMeta,
    tasaEquivalente: tasaEquivalente,
    tasaPeriodicaDesdeEA: tasaPeriodicaDesdeEA
  };
})();
