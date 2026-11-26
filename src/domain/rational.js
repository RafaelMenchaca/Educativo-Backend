function gcd(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y) [x, y] = [y, x % y];
  return x || 1n;
}

function rational(numerator, denominator = 1n) {
  if (denominator === 0n) throw Object.assign(new Error('denominador_cero'), { code: 'denominador_cero' });
  const sign = denominator < 0n ? -1n : 1n;
  const divisor = gcd(numerator, denominator);
  return Object.freeze({ n: numerator * sign / divisor, d: denominator * sign / divisor });
}

export function parseRational(value) {
  if (typeof value !== 'string') throw Object.assign(new Error('racional_invalido'), { code: 'racional_invalido' });
  const text = value.trim();
  if (/^-?\d+\/-?\d+$/.test(text)) {
    const [n, d] = text.split('/').map(BigInt);
    return rational(n, d);
  }
  if (/^-?\d+$/.test(text)) return rational(BigInt(text));
  if (/^-?\d+\.\d+$/.test(text)) {
    const negative = text.startsWith('-');
    const unsigned = negative ? text.slice(1) : text;
    const [whole, decimal] = unsigned.split('.');
    const denominator = 10n ** BigInt(decimal.length);
    const numerator = BigInt(whole) * denominator + BigInt(decimal);
    return rational(negative ? -numerator : numerator, denominator);
  }
  throw Object.assign(new Error('racional_invalido'), { code: 'racional_invalido' });
}

export function formatRational(value) {
  return value.d === 1n ? String(value.n) : `${value.n}/${value.d}`;
}

export const rationalAdd = (a, b) => rational(a.n * b.d + b.n * a.d, a.d * b.d);
export const rationalSubtract = (a, b) => rational(a.n * b.d - b.n * a.d, a.d * b.d);
export const rationalMultiply = (a, b) => rational(a.n * b.n, a.d * b.d);
export function rationalDivide(a, b) {
  if (b.n === 0n) throw Object.assign(new Error('denominador_cero'), { code: 'denominador_cero' });
  return rational(a.n * b.d, a.d * b.n);
}
export const rationalEqual = (a, b) => a.n === b.n && a.d === b.d;

export const RATIONAL_OPERATIONS = Object.freeze({
  suma: rationalAdd,
  resta: rationalSubtract,
  multiplicacion: rationalMultiply,
  division: rationalDivide
});
