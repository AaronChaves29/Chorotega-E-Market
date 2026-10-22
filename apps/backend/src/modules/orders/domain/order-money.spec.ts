import { fromCents, lineSubtotal, toCents } from './order-money';
import { InvalidOrderAmountException } from '../exceptions/order.exceptions';

describe('Importes de pedidos', () => {
  it('calcula sin errores de punto flotante y conserva dos decimales', () => {
    expect(fromCents(toCents('0.10') + toCents('0.20'))).toBe('0.30');
    expect(lineSubtotal('1250.15', 3)).toBe('3750.45');
    expect(fromCents(toCents('1.5'))).toBe('1.50');
    expect(fromCents(toCents('99999999.99'))).toBe('99999999.99');
    expect(fromCents(toCents('0'))).toBe('0.00');
  });

  it.each(['-1.00', '1.001', '100000000.00', 'NaN', '1e2', ''])(
    'rechaza importe inválido %s',
    (amount) => {
      expect(() => toCents(amount)).toThrow(InvalidOrderAmountException);
    },
  );

  it('rechaza desbordamiento, importes negativos y precio cero', () => {
    expect(() => fromCents(-1n)).toThrow(InvalidOrderAmountException);
    expect(() => lineSubtotal('99999999.99', 2)).toThrow(
      InvalidOrderAmountException,
    );
    expect(() => lineSubtotal('0.00', 1)).toThrow(InvalidOrderAmountException);
  });

  it.each([0, -1, 1.5, 2_147_483_648])(
    'rechaza cantidad incompatible con el esquema: %s',
    (quantity) => {
      expect(() => lineSubtotal('1.00', quantity)).toThrow(
        InvalidOrderAmountException,
      );
    },
  );
});
