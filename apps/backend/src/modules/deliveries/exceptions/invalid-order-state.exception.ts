export class InvalidOrderStateException extends Error {
  constructor(estado: string) {
    super(
      `El pedido no puede ser asignado a una entrega mientras se encuentre en estado ${estado}.`,
    );
    this.name = 'InvalidOrderStateException';
  }
}
