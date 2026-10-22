export class DeliveryNotFoundException extends Error {
  constructor(idEntrega: number) {
    super(`No se encontró la entrega con id ${idEntrega}.`);
    this.name = 'DeliveryNotFoundException';
  }
}
