import { ProductStateSpecification } from './product-state.specification';

export class ActiveProductSpecification extends ProductStateSpecification {
  constructor() {
    super('ACTIVO');
  }
}
