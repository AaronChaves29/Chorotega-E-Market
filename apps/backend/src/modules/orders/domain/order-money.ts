import { InvalidOrderAmountException } from '../exceptions/order.exceptions';

const MAX_CENTS = 9_999_999_999n;

export function toCents(amount: string): bigint {
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(amount)) {
    throw new InvalidOrderAmountException();
  }
  const [whole, fraction = ''] = amount.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

export function fromCents(cents: bigint): string {
  if (cents < 0n || cents > MAX_CENTS) throw new InvalidOrderAmountException();
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`;
}

export function lineSubtotal(price: string, quantity: number): string {
  const cents = toCents(price);
  if (
    cents === 0n ||
    !Number.isInteger(quantity) ||
    quantity <= 0 ||
    quantity > 2_147_483_647
  ) {
    throw new InvalidOrderAmountException();
  }
  return fromCents(cents * BigInt(quantity));
}
