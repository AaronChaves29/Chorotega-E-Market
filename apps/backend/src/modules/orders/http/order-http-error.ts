import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  BuyerUnavailableException,
  DuplicateOrderProductException,
  InsufficientOrderStockException,
  InvalidOrderAmountException,
  InvalidOrderInputException,
  InvalidOrderTransitionException,
  MixedOrderStoresException,
  OrderNeighborhoodUnavailableException,
  OrderProductInactiveException,
  OrderProductNotFoundException,
  OrderStoreUnavailableException,
} from '../exceptions/order.exceptions';

// Adaptación exclusiva de HTTP: el dominio conserva sus excepciones originales.
export function rethrowOrderHttpError(error: unknown): never {
  if (error instanceof InvalidOrderInputException)
    throw new BadRequestException(error.message);
  if (error instanceof OrderProductNotFoundException)
    throw new NotFoundException(error.message);
  if (
    error instanceof InsufficientOrderStockException ||
    error instanceof InvalidOrderTransitionException
  ) {
    throw new ConflictException(error.message);
  }
  if (
    error instanceof BuyerUnavailableException ||
    error instanceof DuplicateOrderProductException ||
    error instanceof InvalidOrderAmountException ||
    error instanceof MixedOrderStoresException ||
    error instanceof OrderNeighborhoodUnavailableException ||
    error instanceof OrderProductInactiveException ||
    error instanceof OrderStoreUnavailableException
  ) {
    throw new UnprocessableEntityException(error.message);
  }
  throw error;
}
