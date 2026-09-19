export class InactiveNeighborhoodException extends Error {
  constructor(idBarrio: number) {
    super(
      `El barrio con id ${idBarrio} no se encuentra habilitado para realizar entregas.`,
    );
    this.name = 'InactiveNeighborhoodException';
  }
}
