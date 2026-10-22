export interface LoginCredentials {
  correo: string;
  clave: string;
}

export interface LoginResponse {
  token: string;
  tipo: string;
  expiraEnSegundos: number;
}