import { InvalidOrderTransitionException } from '../exceptions/order.exceptions';

export type OrderState =
  | 'PENDIENTE'
  | 'CONFIRMADO'
  | 'PREPARANDO'
  | 'EN_CAMINO'
  | 'ENTREGADO'
  | 'CANCELADO';

const transitions: Record<OrderState, readonly OrderState[]> = {
  PENDIENTE: ['CONFIRMADO', 'CANCELADO'],
  CONFIRMADO: ['PREPARANDO', 'CANCELADO'],
  PREPARANDO: ['EN_CAMINO'],
  EN_CAMINO: ['ENTREGADO'],
  ENTREGADO: [],
  CANCELADO: [],
};

export function transitionOrderState(
  current: string,
  target: OrderState,
  options: { confirmedCancellationAllowed?: boolean } = {},
): OrderState {
  if (
    !Object.hasOwn(transitions, current) ||
    !transitions[current as OrderState].includes(target)
  ) {
    throw new InvalidOrderTransitionException(current, target);
  }
  // Un futuro caso de cancelación debe evaluar su regla; nunca se autoriza por defecto.
  if (
    current === 'CONFIRMADO' &&
    target === 'CANCELADO' &&
    options.confirmedCancellationAllowed !== true
  ) {
    throw new InvalidOrderTransitionException(current, target);
  }
  return target;
}
