import { ForbiddenException } from '@nestjs/common';

export class DeliveryAccessDeniedException extends ForbiddenException {
  constructor() {
    super('No tiene permiso para operar esta entrega.');
  }
}
