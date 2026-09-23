import type { Order } from '../../orders/entities/order.entity';
import { InvalidDeliveryAddressException } from '../exceptions/invalid-delivery-address.exception';
import { InvalidOrderStateException } from '../exceptions/invalid-order-state.exception';

// Specification con diagnóstico: AND conserva la primera regla incumplida.
export class Specification<T> {
  constructor(
    private readonly failureFor: (candidate: T) => Error | undefined,
  ) {}

  isSatisfiedBy(candidate: T): boolean {
    return this.failureFor(candidate) === undefined;
  }

  assertSatisfiedBy(candidate: T): void {
    const failure = this.failureFor(candidate);
    if (failure) throw failure;
  }

  and(other: Specification<T>): Specification<T> {
    return new Specification(
      (candidate) => this.failureFor(candidate) ?? other.failureFor(candidate),
    );
  }
}

type DeliveryOrder = Pick<Order, 'estado' | 'direccionEntrega'>;

const preparedOrder = new Specification<DeliveryOrder>((order) =>
  order.estado === 'PREPARANDO'
    ? undefined
    : new InvalidOrderStateException(order.estado),
);
const validDeliveryAddress = new Specification<DeliveryOrder>((order) =>
  order.direccionEntrega?.trim()
    ? undefined
    : new InvalidDeliveryAddressException(),
);

export const orderReadyForDelivery = preparedOrder.and(validDeliveryAddress);
