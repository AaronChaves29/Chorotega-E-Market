export type OrderReadScope =
  | { rol: 'ADMIN' }
  | { rol: 'CLIENTE'; idUsuario: number }
  | { rol: 'EMPRENDEDOR'; idUsuario: number };
