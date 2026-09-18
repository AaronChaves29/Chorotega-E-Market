export class CourierNotFoundException extends Error {
  constructor(idRepartidor: number) {
    super(`No se encontró el repartidor con id ${idRepartidor}.`);
    this.name = 'CourierNotFoundException';
  }
}
