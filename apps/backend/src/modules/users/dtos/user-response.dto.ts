export class UserResponseDto {
  idUsuario!: number;
  nombre!: string;
  apellido!: string;
  correo!: string;
  telefono!: string | null;
  rol!: string;
  estado!: string;
  fechaCreacion!: Date;
}
