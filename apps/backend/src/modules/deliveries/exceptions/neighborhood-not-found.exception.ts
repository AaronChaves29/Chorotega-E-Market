export class NeighborhoodNotFoundException extends Error {
  constructor(idBarrio: number) {
    super(`No se encontró el barrio con id ${idBarrio}.`);
    this.name = 'NeighborhoodNotFoundException';
  }
}
