import { HttpException } from '@nestjs/common';
import { rethrowOrderHttpError } from './order-http-error';
import * as errors from '../exceptions/order.exceptions';

describe('Adaptación HTTP de errores de compra', () => {
  it.each([
    [new errors.InvalidOrderInputException(), 400],
    [new errors.OrderProductNotFoundException(1), 404],
    [new errors.InsufficientOrderStockException(1), 409],
    [
      new errors.InvalidOrderTransitionException('CONFIRMADO', 'PENDIENTE'),
      409,
    ],
    [new errors.BuyerUnavailableException(), 422],
    [new errors.OrderNeighborhoodUnavailableException(), 422],
    [new errors.OrderStoreUnavailableException(), 422],
    [new errors.OrderProductInactiveException(1), 422],
    [new errors.DuplicateOrderProductException(1), 422],
    [new errors.MixedOrderStoresException(), 422],
    [new errors.InvalidOrderAmountException(), 422],
  ] as const)(
    'traduce %s a %s conservando su mensaje seguro',
    (error, status) => {
      try {
        rethrowOrderHttpError(error);
      } catch (httpError) {
        expect(httpError).toBeInstanceOf(HttpException);
        expect((httpError as HttpException).getStatus()).toBe(status);
        expect((httpError as HttpException).message).toBe(error.message);
      }
    },
  );
  it('no clasifica errores desconocidos como errores de cliente', () => {
    const error = new Error('detalle interno de persistencia');
    expect(() => rethrowOrderHttpError(error)).toThrow(error);
  });
});
