export class InvalidDeliveryAddressException extends Error {
  constructor() {
    super('El pedido debe tener una dirección de entrega válida.');
    this.name = 'InvalidDeliveryAddressException';
  }
}
