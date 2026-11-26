import {
  formatRational, parseRational, rationalAdd, rationalEqual, rationalMultiply,
  rationalSubtract, rationalDivide, RATIONAL_OPERATIONS
} from './rational.js';
import { CUADERNILLO_V3_QUANTITATIVE_FAMILIES } from './cuadernilloV3Contracts.js';

const INPUT_LIMITS = Object.freeze({ numerator: 10000n, denominator: 1000n });
const DERIVED_LIMITS = Object.freeze({ numerator: 1000000n, denominator: 100000n });

export class QuantitativeVerificationError extends Error {
  constructor(code, path, solverStage = 'input_validation') {
    super(code); this.name = 'QuantitativeVerificationError'; this.code = code;
    this.path = path; this.solverStage = solverStage;
  }
}

const fail = (code, path, stage) => { throw new QuantitativeVerificationError(code, path, stage); };
const abs = (value) => value < 0n ? -value : value;
const parsed = (value, path, derived = false) => {
  let result;
  try { result = parseRational(value); } catch (error) { fail(error.code || 'racional_invalido', path); }
  const limit = derived ? DERIVED_LIMITS : INPUT_LIMITS;
  if (abs(result.n) > limit.numerator || result.d > limit.denominator) fail('valor_fuera_limite', path, derived ? 'derived_limits' : 'input_limits');
  return result;
};
const product = (left, right) => `(${formatRational(left)} × ${formatRational(right)})`;
const isZero = (value) => value.n === 0n;
const isNegative = (value) => value.n < 0n;
const absoluteRational = (value) => Object.freeze({ n: abs(value.n), d: value.d });

function formatLinearTerms(terms) {
  const rendered = [];
  for (const { coefficient, variable } of terms) {
    if (isZero(coefficient)) continue;
    const magnitude = absoluteRational(coefficient);
    const coefficientText = magnitude.n === magnitude.d ? '' : formatRational(magnitude);
    const term = `${coefficientText}${variable}`;
    if (rendered.length === 0) rendered.push(`${isNegative(coefficient) ? '−' : ''}${term}`);
    else rendered.push(`${isNegative(coefficient) ? ' − ' : ' + '}${term}`);
  }
  return rendered.join('') || '0';
}

export function formatearExpresionLineal(coeficienteX, coeficienteY) {
  const x = typeof coeficienteX === 'string' ? parseRational(coeficienteX) : coeficienteX;
  const y = typeof coeficienteY === 'string' ? parseRational(coeficienteY) : coeficienteY;
  return formatLinearTerms([{ coefficient: x, variable: 'x' }, { coefficient: y, variable: 'y' }]);
}
const exactKeys = (value, keys, path) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('datos_cuantitativos_incompletos', path);
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail('propiedad_cuantitativa_no_permitida', `${path}.${key}`);
  for (const key of keys) if (!Object.hasOwn(value, key)) fail('datos_cuantitativos_incompletos', `${path}.${key}`);
};

function hydrateArithmetic(contract, path) {
  exactKeys(contract, ['familia_problema', 'datos', 'operaciones'], path);
  exactKeys(contract.datos, ['valor_inicial'], `${path}.datos`);
  const initial = parsed(contract?.datos?.valor_inicial, `${path}.datos.valor_inicial`);
  if (!Array.isArray(contract?.operaciones) || !contract.operaciones.length) fail('datos_cuantitativos_incompletos', `${path}.operaciones`);
  let current = initial;
  const operations = contract.operaciones.map((step, index) => {
    exactKeys(step, ['operacion', 'operando'], `${path}.operaciones[${index}]`);
    const operation = RATIONAL_OPERATIONS[step?.operacion];
    if (!operation) fail('operacion_no_permitida', `${path}.operaciones[${index}].operacion`);
    const operand = parsed(step?.operando, `${path}.operaciones[${index}].operando`);
    try { current = operation(current, operand); } catch (error) { fail(error.code || 'racional_invalido', `${path}.operaciones[${index}]`, 'solve'); }
    parsed(formatRational(current), `${path}.operaciones[${index}]`, true);
    return Object.freeze({ operacion: step.operacion, operando: formatRational(operand), resultado: formatRational(current) });
  });
  return {
    hydrated: Object.freeze({ familia_problema: contract.familia_problema, valor_inicial: formatRational(initial), operaciones: Object.freeze(operations), resultado: formatRational(current) }),
    visible: {
      enunciado: `Parte de ${formatRational(initial)} y ejecuta las operaciones en orden.`,
      pasos: [`Valor inicial: ${formatRational(initial)}.`, ...operations.map(({ operacion, operando, resultado }) => `${operacion}: usa ${operando} y obtiene ${resultado}.`)],
      resultado: formatRational(current),
      verificaciones: [`Resultado obtenido al completar ${operations.length} operaciones encadenadas.`],
      interpretacion: 'El resultado corresponde a aplicar la secuencia de operaciones en el orden indicado.'
    }
  };
}

function parseMatrix(matrix, path) {
  if (!Array.isArray(matrix) || matrix.length !== 2 || matrix.some((row) => !Array.isArray(row) || row.length !== 2)) fail('forma_matriz_invalida', path);
  return matrix.map((row, ri) => row.map((value, ci) => parsed(value, `${path}[${ri}][${ci}]`)));
}

function hydrateDeterminant(contract, path) {
  exactKeys(contract, ['familia_problema', 'datos'], path);
  exactKeys(contract.datos, ['matriz'], `${path}.datos`);
  const [[a, b], [c, d]] = parseMatrix(contract?.datos?.matriz, `${path}.datos.matriz`);
  const main = rationalMultiply(a, d);
  const secondary = rationalMultiply(b, c);
  const value = rationalSubtract(main, secondary);
  parsed(formatRational(value), `${path}.datos.matriz`, true);
  const matrix = [[a, b], [c, d]].map((row) => row.map(formatRational));
  return {
    hydrated: Object.freeze({ familia_problema: contract.familia_problema, matriz: Object.freeze(matrix.map(Object.freeze)), producto_diagonal_principal: formatRational(main), producto_diagonal_secundaria: formatRational(secondary), resultado: formatRational(value) }),
    visible: {
      enunciado: 'Calcula el determinante de la matriz indicada.',
      matrices: [{ titulo: 'Matriz', columnas: ['Columna 1', 'Columna 2'], filas: matrix }],
      pasos: [`Δ = ${product(a, d)} − ${product(b, c)}.`, `Δ = ${formatRational(main)} − ${formatRational(secondary)}.`, `Δ = ${formatRational(value)}.`],
      resultado: `Δ = ${formatRational(value)}`,
      verificaciones: [`Reaplica ad − bc: ${formatRational(main)} − ${formatRational(secondary)} = ${formatRational(value)}.`],
      interpretacion: 'El determinante resume una propiedad de la matriz calculada a partir de sus dos diagonales.'
    }
  };
}

function parseEquation(equation, index, path) {
  return {
    a: parsed(equation?.coeficiente_x, `${path}.datos.ecuaciones[${index}].coeficiente_x`),
    b: parsed(equation?.coeficiente_y, `${path}.datos.ecuaciones[${index}].coeficiente_y`),
    c: parsed(equation?.termino_independiente, `${path}.datos.ecuaciones[${index}].termino_independiente`)
  };
}
const equationText = ({ a, b, c }) => `${formatearExpresionLineal(a, b)} = ${formatRational(c)}`;

function substitutionText(equation, x, y) {
  const terms = [];
  if (!isZero(equation.a)) {
    const magnitude = absoluteRational(equation.a);
    const factor = magnitude.n === magnitude.d ? '' : `${formatRational(magnitude)} × `;
    terms.push({ negative: isNegative(equation.a), text: `${factor}${formatRational(x)}` });
  }
  if (!isZero(equation.b)) {
    const magnitude = absoluteRational(equation.b);
    const factor = magnitude.n === magnitude.d ? '' : `${formatRational(magnitude)} × `;
    terms.push({ negative: isNegative(equation.b), text: `${factor}${formatRational(y)}` });
  }
  return terms.map(({ negative, text }, index) => index === 0
    ? `${negative ? '−' : ''}${text}`
    : `${negative ? ' − ' : ' + '}${text}`).join('') || '0';
}

function hydrateSystem(contract, path) {
  exactKeys(contract, ['familia_problema', 'datos', 'metodo'], path);
  exactKeys(contract.datos, ['ecuaciones'], `${path}.datos`);
  const equations = contract?.datos?.ecuaciones;
  if (!Array.isArray(equations) || equations.length !== 2) fail('datos_cuantitativos_incompletos', `${path}.datos.ecuaciones`);
  if (contract?.metodo !== 'cramer') fail('metodo_no_permitido', `${path}.metodo`);
  equations.forEach((equation, index) => exactKeys(equation, ['coeficiente_x', 'coeficiente_y', 'termino_independiente'], `${path}.datos.ecuaciones[${index}]`));
  const values = equations.map((equation, index) => parseEquation(equation, index, path));
  const [first, second] = values;
  const delta = rationalSubtract(rationalMultiply(first.a, second.b), rationalMultiply(first.b, second.a));
  if (delta.n === 0n) fail('sistema_singular_no_soportado', `${path}.datos.ecuaciones`, 'solve');
  const deltaX = rationalSubtract(rationalMultiply(first.c, second.b), rationalMultiply(first.b, second.c));
  const deltaY = rationalSubtract(rationalMultiply(first.a, second.c), rationalMultiply(first.c, second.a));
  const x = rationalDivide(deltaX, delta);
  const y = rationalDivide(deltaY, delta);
  [delta, deltaX, deltaY, x, y].forEach((value) => parsed(formatRational(value), path, true));
  const checks = values.map((equation, index) => {
    const left = rationalAdd(rationalMultiply(equation.a, x), rationalMultiply(equation.b, y));
    if (!rationalEqual(left, equation.c)) fail('comprobacion_incorrecta', `${path}.datos.ecuaciones[${index}]`, 'verify');
    return Object.freeze({ ecuacion: index + 1, lado_izquierdo: formatRational(left), lado_derecho: formatRational(equation.c) });
  });
  const matrix = values.map(({ a, b, c }) => [formatRational(a), formatRational(b), formatRational(c)]);
  const matrixX = [[formatRational(first.c), formatRational(first.b)], [formatRational(second.c), formatRational(second.b)]];
  const matrixY = [[formatRational(first.a), formatRational(first.c)], [formatRational(second.a), formatRational(second.c)]];
  const checkTexts = checks.map(({ ecuacion, lado_derecho }, index) =>
    `Ecuación ${ecuacion}: ${equationText(values[index])} → ${substitutionText(values[index], x, y)} = ${lado_derecho}.`);
  return {
    hydrated: Object.freeze({
      familia_problema: contract.familia_problema, metodo: 'cramer',
      ecuaciones: Object.freeze(values.map(({ a, b, c }) => Object.freeze({ a: formatRational(a), b: formatRational(b), c: formatRational(c) }))),
      delta: formatRational(delta), delta_x: formatRational(deltaX), delta_y: formatRational(deltaY),
      solucion: Object.freeze({ x: formatRational(x), y: formatRational(y) }), comprobaciones: Object.freeze(checks)
    }),
    visible: {
      enunciado: `Resuelve el sistema ${equationText(first)}; ${equationText(second)}.`,
      matrices: [
        { titulo: 'Matriz de coeficientes y términos', columnas: ['x', 'y', 'Término independiente'], filas: matrix },
        { titulo: 'Matriz para Δx', columnas: ['Término independiente', 'y'], filas: matrixX },
        { titulo: 'Matriz para Δy', columnas: ['x', 'Término independiente'], filas: matrixY }
      ],
      pasos: [
        `Sistema: ${equationText(first)}; ${equationText(second)}.`,
        `Matriz de coeficientes: [[${formatRational(first.a)}, ${formatRational(first.b)}], [${formatRational(second.a)}, ${formatRational(second.b)}]].`,
        `Δ = ${product(first.a, second.b)} − ${product(first.b, second.a)} = ${formatRational(delta)}.`,
        `Matriz para Δx: [[${formatRational(first.c)}, ${formatRational(first.b)}], [${formatRational(second.c)}, ${formatRational(second.b)}]].`,
        `Δx = ${product(first.c, second.b)} − ${product(first.b, second.c)} = ${formatRational(deltaX)}.`,
        `Matriz para Δy: [[${formatRational(first.a)}, ${formatRational(first.c)}], [${formatRational(second.a)}, ${formatRational(second.c)}]].`,
        `Δy = ${product(first.a, second.c)} − ${product(first.c, second.a)} = ${formatRational(deltaY)}.`,
        `x = Δx/Δ = ${formatRational(deltaX)}/${formatRational(delta)} = ${formatRational(x)}.`,
        `y = Δy/Δ = ${formatRational(deltaY)}/${formatRational(delta)} = ${formatRational(y)}.`
      ],
      resultado: `x = ${formatRational(x)}, y = ${formatRational(y)}`,
      verificaciones: checkTexts,
      interpretacion: 'El sistema tiene una solución única porque el determinante de la matriz de coeficientes es distinto de cero.'
    }
  };
}

export function hidratarContratoCuantitativo(contract, allowedFamilies, path = 'contrato_cuantitativo') {
  const family = contract?.familia_problema;
  if (family === 'no_cuantitativo') {
    exactKeys(contract, ['familia_problema'], path);
    return Object.freeze({ ok: true, familia: family, contratoEntradaIA: contract, contratoHidratadoBackend: null, visible: null });
  }
  if (!CUADERNILLO_V3_QUANTITATIVE_FAMILIES.includes(family) || !allowedFamilies?.includes(family)) fail('familia_no_permitida', `${path}.familia_problema`);
  const result = family === 'aritmetica_racional' ? hydrateArithmetic(contract, path)
    : family === 'determinante_2x2' ? hydrateDeterminant(contract, path) : hydrateSystem(contract, path);
  return Object.freeze({ ok: true, familia: family, contratoEntradaIA: contract, contratoHidratadoBackend: result.hydrated, visible: Object.freeze(result.visible) });
}

export const verificarContratoCuantitativo = hidratarContratoCuantitativo;

export function evaluarContratoCuantitativo(contract, allowedFamilies, path = 'contrato_cuantitativo') {
  try { return hidratarContratoCuantitativo(contract, allowedFamilies, path); }
  catch (error) {
    if (!(error instanceof QuantitativeVerificationError)) throw error;
    return Object.freeze({ ok: false, familia: typeof contract?.familia_problema === 'string' ? contract.familia_problema : null, code: error.code, path: error.path, solverStage: error.solverStage });
  }
}
