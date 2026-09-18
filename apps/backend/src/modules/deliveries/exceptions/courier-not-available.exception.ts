export class CourierNotAvailableException extends Error {
  constructor(estado: string) {
    super(
      `El repartidor no se encuentra disponible para recibir una entrega. Estado actual: ${estado}.`,
    );
    this.name = 'CourierNotAvailableException';
  }
}
