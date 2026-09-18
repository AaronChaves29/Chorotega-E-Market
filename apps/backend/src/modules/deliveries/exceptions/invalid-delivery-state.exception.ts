export class InvalidDeliveryStateException extends Error {
  constructor(estadoActual: string, estadoEsperado: string) {
    super(
      `La entrega se encuentra en estado ${estadoActual} y debe estar en estado ${estadoEsperado} para realizar esta operación.`,
    );
    this.name = 'InvalidDeliveryStateException';
  }
}
