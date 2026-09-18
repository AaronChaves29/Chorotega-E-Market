export class OrderNotFoundException extends Error {
  constructor(idPedido: number) {
    super(`No se encontró el pedido con id ${idPedido}.`);
    this.name = 'OrderNotFoundException';
  }
}
