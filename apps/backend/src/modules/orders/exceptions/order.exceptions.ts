export class OrderBusinessException extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidOrderInputException extends OrderBusinessException {
  constructor() {
    super('Los datos del pedido no son válidos.');
  }
}
export class DuplicateOrderProductException extends OrderBusinessException {
  constructor(id: number) {
    super(`El producto ${id} aparece más de una vez.`);
  }
}
export class BuyerUnavailableException extends OrderBusinessException {
  constructor() {
    super('El comprador no existe o está inactivo.');
  }
}
export class OrderNeighborhoodUnavailableException extends OrderBusinessException {
  constructor() {
    super('El barrio no existe o está inactivo.');
  }
}
export class OrderProductNotFoundException extends OrderBusinessException {
  constructor(id: number) {
    super(`El producto ${id} no existe.`);
  }
}
export class OrderProductInactiveException extends OrderBusinessException {
  constructor(id: number) {
    super(`El producto ${id} no está activo.`);
  }
}
export class OrderStoreUnavailableException extends OrderBusinessException {
  constructor() {
    super('La tienda no existe o está inactiva.');
  }
}
export class MixedOrderStoresException extends OrderBusinessException {
  constructor() {
    super('Todos los productos del pedido deben pertenecer a una sola tienda.');
  }
}
export class InsufficientOrderStockException extends OrderBusinessException {
  constructor(id: number) {
    super(`Inventario insuficiente para el producto ${id}.`);
  }
}
export class InvalidOrderAmountException extends OrderBusinessException {
  constructor() {
    super('El importe no es válido para numeric(10,2).');
  }
}
export class InvalidOrderTransitionException extends OrderBusinessException {
  constructor(from: string, to: string) {
    super(`Transición de pedido no permitida: ${from} -> ${to}.`);
  }
}
