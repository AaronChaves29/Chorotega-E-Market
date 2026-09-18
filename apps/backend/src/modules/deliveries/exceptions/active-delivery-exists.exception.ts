export class ActiveDeliveryExistsException extends Error {
  constructor(idPedido: number) {
    super(`El pedido ${idPedido} ya tiene una entrega activa.`);
    this.name = 'ActiveDeliveryExistsException';
  }
}
