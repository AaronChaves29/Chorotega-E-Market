import { transitionOrderState, type OrderState } from './order-state';
import { InvalidOrderTransitionException } from '../exceptions/order.exceptions';

describe('State del pedido', () => {
  it.each<[OrderState, OrderState]>([
    ['PENDIENTE', 'CONFIRMADO'],
    ['PENDIENTE', 'CANCELADO'],
    ['CONFIRMADO', 'PREPARANDO'],
    ['PREPARANDO', 'EN_CAMINO'],
    ['EN_CAMINO', 'ENTREGADO'],
  ])('permite %s -> %s', (from, to) => {
    expect(transitionOrderState(from, to)).toBe(to);
  });

  it.each<[string, OrderState]>([
    ['PENDIENTE', 'ENTREGADO'],
    ['PREPARANDO', 'CANCELADO'],
    ['EN_CAMINO', 'CANCELADO'],
    ['ENTREGADO', 'CONFIRMADO'],
    ['CANCELADO', 'CONFIRMADO'],
    ['DESCONOCIDO', 'CONFIRMADO'],
    ['toString', 'CONFIRMADO'],
    ['CONFIRMADO', 'CONFIRMADO'],
  ])('rechaza %s -> %s', (from, to) => {
    expect(() => transitionOrderState(from, to)).toThrow(
      InvalidOrderTransitionException,
    );
  });

  it('no autoriza cancelar un confirmado sin evaluación explícita del caso de uso', () => {
    expect(() => transitionOrderState('CONFIRMADO', 'CANCELADO')).toThrow(
      InvalidOrderTransitionException,
    );
    expect(() =>
      transitionOrderState('CONFIRMADO', 'CANCELADO', {
        confirmedCancellationAllowed: false,
      }),
    ).toThrow(InvalidOrderTransitionException);
    expect(
      transitionOrderState('CONFIRMADO', 'CANCELADO', {
        confirmedCancellationAllowed: true,
      }),
    ).toBe('CANCELADO');
  });
});
