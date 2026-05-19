export const MOJOS_PER_XCH = 1_000_000_000_000n;

export function toBigInt(v: bigint | number | string): bigint {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') {
    if (!Number.isInteger(v)) throw new Error(`expected integer, got ${v}`);
    return BigInt(v);
  }
  return BigInt(v);
}

export function mojoToXch(mojo: bigint | number | string): string {
  const v = toBigInt(mojo);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const whole = abs / MOJOS_PER_XCH;
  const frac = abs % MOJOS_PER_XCH;
  if (frac === 0n) return `${neg ? '-' : ''}${whole.toString()}`;
  let fracStr = frac.toString().padStart(12, '0').replace(/0+$/, '');
  if (fracStr === '') fracStr = '0';
  return `${neg ? '-' : ''}${whole.toString()}.${fracStr}`;
}

const EIB = 2n ** 60n;
const PIB = 2n ** 50n;
const TIB = 2n ** 40n;

function bigIntDivToDecimal(num: bigint, denom: bigint, decimals: number): string {
  if (denom === 0n) throw new Error('division by zero');
  const scale = 10n ** BigInt(decimals);
  const scaled = (num * scale) / denom;
  const whole = scaled / scale;
  const frac = scaled % scale;
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return fracStr === '' ? whole.toString() : `${whole.toString()}.${fracStr}`;
}

export interface NetspaceFormat {
  bytes: string;
  eib: string;
  pib: string;
  tib: string;
  human: string;
}

export function formatNetspace(bytes: bigint | number | string): NetspaceFormat {
  const v = toBigInt(bytes);
  const eib = bigIntDivToDecimal(v, EIB, 3);
  const pib = bigIntDivToDecimal(v, PIB, 3);
  const tib = bigIntDivToDecimal(v, TIB, 3);
  let human: string;
  if (v >= EIB) human = `${eib} EiB`;
  else if (v >= PIB) human = `${pib} PiB`;
  else human = `${tib} TiB`;
  return { bytes: v.toString(), eib, pib, tib, human };
}
