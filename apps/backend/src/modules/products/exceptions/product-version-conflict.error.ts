// Error de persistencia conocido; la capa de servicio lo traduce a HTTP 409.
export class ProductVersionConflictError extends Error {
  constructor() {
    super('La versión esperada del producto ya no está vigente.');
    this.name = 'ProductVersionConflictError';
  }
}
