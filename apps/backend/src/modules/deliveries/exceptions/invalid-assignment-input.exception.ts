export class InvalidAssignmentInputException extends Error {
  constructor() {
    super('Los datos de asignación de entrega no son válidos.');
    this.name = 'InvalidAssignmentInputException';
  }
}
