import { isExactDecimal } from './money.js';

/**
 * Voucher points display - vouchers carry Points, not pesos. Values arrive
 * from the API as exact-decimal STRINGS (same wire shape as money); only the
 * presentation differs: thousands-grouped with a `Points` unit and no
 * currency symbol. Trailing `.00` is dropped (`5000.00` → `5,000 Points`)
 * while genuine fractions are kept (`150.50` → `150.50 Points`).
 */
const grouping = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function formatPoints(value: string): string {
  if (!isExactDecimal(value)) {
    throw new Error(`formatPoints: expected exact-decimal string, got "${value}"`);
  }
  const [head = '0', frac = ''] = value.split('.');
  const grouped = grouping.format(BigInt(head));
  const trimmedFrac = frac.replace(/0+$/, '');
  const number = trimmedFrac ? `${grouped}.${trimmedFrac}` : grouped;
  const singular = BigInt(head) === 1n && trimmedFrac === '';
  return `${number} Point${singular ? '' : 's'}`;
}
