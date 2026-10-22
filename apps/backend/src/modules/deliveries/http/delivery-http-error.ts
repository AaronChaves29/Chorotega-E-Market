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

export function rethrowDeliveryHttpError(error: unknown): never {
  if (error instanceof InvalidAssignmentInputException)
    throw new BadRequestException(error.message);
  if (
    error instanceof OrderNotFoundException ||
    error instanceof CourierNotFoundException ||
    error instanceof NeighborhoodNotFoundException ||
    error instanceof DeliveryNotFoundException
  )
    throw new NotFoundException(error.message);
  if (
    error instanceof InvalidOrderStateException ||
    error instanceof InvalidDeliveryStateException ||
    error instanceof ActiveDeliveryExistsException ||
    error instanceof CourierNotAvailableException
  )
    throw new ConflictException(error.message);
  if (
    error instanceof InactiveNeighborhoodException ||
    error instanceof InvalidDeliveryAddressException
  )
    throw new UnprocessableEntityException(error.message);
  throw error;
}
