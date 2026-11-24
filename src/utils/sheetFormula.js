// A very small spreadsheet formula engine (no eval): numbers, cell references (A1), ranges (A1:B5),
// + - * / ( ) and the functions SUM, AVERAGE, MIN, MAX, COUNT. Anything it cannot read shows as #ERR.

const colIndex = (letters) => letters.toUpperCase().split('').reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
const num = (v) => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) && /^\s*-?[\d.,]+\s*%?\s*$/.test(String(v)) ? n : null; };

function tokenize(src) {
  const out = []; let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ') { i += 1; continue; }
    const rest = src.slice(i);
    let m;
    if ((m = rest.match(/^\d+(\.\d+)?/))) { out.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; } else if ((m = rest.match(/^[A-Za-z]+\d+:[A-Za-z]+\d+/))) { out.push({ t: 'range', v: m[0] }); i += m[0].length; } else if ((m = rest.match(/^[A-Za-z]+\d+/))) { out.push({ t: 'ref', v: m[0] }); i += m[0].length; } else if ((m = rest.match(/^[A-Za-z]+(?=\()/))) { out.push({ t: 'fn', v: m[0].toUpperCase() }); i += m[0].length; } else if ('+-*/(),'.includes(c)) { out.push({ t: c }); i += 1; } else throw new Error('bad');
  }
  return out;
}

/** Value of a formula string like "=SUM(A1:A5)*2". `get(r, c)` returns the (evaluated) value of a cell. */
export function evalFormula(formula, get) {
  const toks = tokenize(String(formula).slice(1));
  let p = 0;
  const peek = () => toks[p];
  const eat = (t) => { if (peek()?.t === t) { p += 1; return true; } return false; };
  const cell = (ref) => { const m = ref.match(/^([A-Za-z]+)(\d+)$/); return get(Number(m[2]) - 1, colIndex(m[1])); };
  const rangeVals = (rg) => {
    const [a, b] = rg.split(':'); const ma = a.match(/^([A-Za-z]+)(\d+)$/); const mb = b.match(/^([A-Za-z]+)(\d+)$/);
    const r1 = Math.min(+ma[2], +mb[2]) - 1; const r2 = Math.max(+ma[2], +mb[2]) - 1;
    const c1 = Math.min(colIndex(ma[1]), colIndex(mb[1])); const c2 = Math.max(colIndex(ma[1]), colIndex(mb[1]));
    const vals = [];
    for (let r = r1; r <= r2; r += 1) for (let c = c1; c <= c2; c += 1) vals.push(get(r, c));
    return vals;
  };
  const numeric = (v) => { const n = num(v); return n === null ? 0 : n; };
  function expr() { let v = term(); while (peek() && (peek().t === '+' || peek().t === '-')) { const op = toks[p].t; p += 1; const r = term(); v = op === '+' ? v + r : v - r; } return v; }
  function term() { let v = factor(); while (peek() && (peek().t === '*' || peek().t === '/')) { const op = toks[p].t; p += 1; const r = factor(); v = op === '*' ? v * r : v / r; } return v; }
  function factor() {
    const tk = toks[p];
    if (!tk) throw new Error('end');
    if (eat('-')) return -factor();
    if (tk.t === 'num') { p += 1; return tk.v; }
    if (tk.t === 'ref') { p += 1; return numeric(cell(tk.v)); }
    if (tk.t === '(') { p += 1; const v = expr(); if (!eat(')')) throw new Error('paren'); return v; }
    if (tk.t === 'fn') {
      p += 1; if (!eat('(')) throw new Error('fn');
      const nums = []; let count = 0;
      if (!eat(')')) {
        do {
          const a = peek();
          if (a?.t === 'range') { p += 1; rangeVals(a.v).forEach((x) => { const n = num(x); if (n !== null) { nums.push(n); count += 1; } }); } else { nums.push(expr()); count += 1; }
        } while (eat(','));
        if (!eat(')')) throw new Error('paren');
      }
      switch (tk.v) {
        case 'SUM': return nums.reduce((a, b) => a + b, 0);
        case 'AVERAGE': return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
        case 'MIN': return nums.length ? Math.min(...nums) : 0;
        case 'MAX': return nums.length ? Math.max(...nums) : 0;
        case 'COUNT': return count;
        default: throw new Error('fn');
      }
    }
    throw new Error('bad');
  }
  const out = expr();
  if (p < toks.length) throw new Error('extra');
  return out;
}

export const isFormula = (v) => typeof v === 'string' && v.length > 1 && v[0] === '=';

/** What a cell shows: formulas are worked out (with a guard against cells that refer to each other). */
export function displayValue(rows, r, c, depth = 0) {
  const raw = rows[r]?.[c] ?? '';
  if (!isFormula(raw)) return raw;
  if (depth > 20) return '#LOOP';
  try {
    const v = evalFormula(raw, (rr, cc) => displayValue(rows, rr, cc, depth + 1));
    if (!Number.isFinite(v)) return '#ERR';
    return String(Math.round(v * 1e8) / 1e8);
  } catch { return '#ERR'; }
}
