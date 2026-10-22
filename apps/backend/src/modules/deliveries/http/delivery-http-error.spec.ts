import {
  BadRequestException,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InvalidAssignmentInputException } from '../exceptions/invalid-assignment-input.exception';
import { OrderNotFoundException } from '../exceptions/order-not-found.exception';
import { CourierNotFoundException } from '../exceptions/courier-not-found.exception';
import { NeighborhoodNotFoundException } from '../exceptions/neighborhood-not-found.exception';
import { DeliveryNotFoundException } from '../exceptions/delivery-not-found.exception';
import { InvalidOrderStateException } from '../exceptions/invalid-order-state.exception';
import { InvalidDeliveryStateException } from '../exceptions/invalid-delivery-state.exception';
import { ActiveDeliveryExistsException } from '../exceptions/active-delivery-exists.exception';
import { CourierNotAvailableException } from '../exceptions/courier-not-available.exception';
import { InactiveNeighborhoodException } from '../exceptions/inactive-neighborhood.exception';
import { InvalidDeliveryAddressException } from '../exceptions/invalid-delivery-address.exception';

import { HttpException } from '@nestjs/common';
import { DeliveryAccessDeniedException } from '../exceptions/delivery-access-denied.exception';
import { rethrowDeliveryHttpError } from './delivery-http-error';

describe('Adaptador HTTP de Deliveries', () => {
  it.each([
    [new InvalidAssignmentInputException(), BadRequestException, 400],
    [new OrderNotFoundException(1), NotFoundException, 404],
    [new CourierNotFoundException(1), NotFoundException, 404],
    [new NeighborhoodNotFoundException(1), NotFoundException, 404],
    [new DeliveryNotFoundException(1), NotFoundException, 404],
    [new InvalidOrderStateException('CONFIRMADO'), ConflictException, 409],
    [
      new InvalidDeliveryStateException('ASIGNADA', 'EN_CAMINO'),
      ConflictException,
      409,
    ],
    [new ActiveDeliveryExistsException(1), ConflictException, 409],
    [new CourierNotAvailableException('OCUPADO'), ConflictException, 409],
    [new InactiveNeighborhoodException(1), UnprocessableEntityException, 422],
    [new InvalidDeliveryAddressException(), UnprocessableEntityException, 422],
  ])('traduce %s al estado HTTP correspondiente', (error, expected, status) => {
    expect.assertions(4);
    try {
      rethrowDeliveryHttpError(error);
    } catch (httpError) {
      expect(httpError).toBeInstanceOf(expected);
      expect((httpError as HttpException).getStatus()).toBe(status);
      expect((httpError as Error).message).toBe(error.message);
      expect(error).not.toBeInstanceOf(HttpException);
    }
  });

  it('conserva la excepción de acceso denegado con 403', () => {
    const error = new DeliveryAccessDeniedException();
    expect(() => rethrowDeliveryHttpError(error)).toThrow(error);
    expect(error.getStatus()).toBe(403);
  });

  it('propaga un error desconocido para que el filtro global genere un 500 seguro', () => {
    const error = new Error('SQL interno');
    expect(() => rethrowDeliveryHttpError(error)).toThrow(error);
  });
});
