import { InvalidDeliveryAddressException } from '../exceptions/invalid-delivery-address.exception';
import { InvalidOrderStateException } from '../exceptions/invalid-order-state.exception';
import { orderReadyForDelivery } from './delivery-assignment.specification';

describe('Specification: pedido elegible para entrega', () => {
  it('exige conjuntamente preparación y dirección', () => {
    const candidate = {
      estado: 'PREPARANDO',
      direccionEntrega: 'Nicoya centro',
    };
    expect(orderReadyForDelivery.isSatisfiedBy(candidate)).toBe(true);
    expect(() =>
      orderReadyForDelivery.assertSatisfiedBy(candidate),
    ).not.toThrow();
  });

  it('conserva el diagnóstico de estado antes de evaluar la dirección', () => {
    const candidate = { estado: 'CONFIRMADO', direccionEntrega: ' ' };
    expect(orderReadyForDelivery.isSatisfiedBy(candidate)).toBe(false);
    expect(() => orderReadyForDelivery.assertSatisfiedBy(candidate)).toThrow(
      InvalidOrderStateException,
    );
  });

  it('rechaza una dirección vacía aunque el pedido esté preparado', () => {
    const candidate = { estado: 'PREPARANDO', direccionEntrega: ' ' };
    expect(orderReadyForDelivery.isSatisfiedBy(candidate)).toBe(false);
    expect(() => orderReadyForDelivery.assertSatisfiedBy(candidate)).toThrow(
      InvalidDeliveryAddressException,
    );
  });
});
