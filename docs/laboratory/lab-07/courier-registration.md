# Registro de repartidores

`POST /api/v1/auth/register/courier` es público y comparte el limitador de
registros con clientes y emprendedores. No acepta un rol, estado, disponibilidad,
identificador de usuario ni identificador de repartidor enviados por el cliente.

## Contrato

```json
{
  "nombre": "Luis",
  "apellido": "Persona",
  "correo": "repartidor@example.test",
  "clave": "una-clave-de-prueba-local",
  "telefono": "+506 8888-8888",
  "medioTransporte": "Bicicleta"
}
```

Nombre y apellido son personales, obligatorios y de hasta 100 caracteres.
El correo se normaliza y admite hasta 150 caracteres. La contraseña requiere
al menos 8 caracteres y un máximo de 72 bytes UTF-8. Teléfono es opcional o nulo;
si se proporciona, admite de 8 a 15 dígitos, hasta 20 caracteres e incluye
prefijo `+`, espacios, paréntesis y guiones. Se reutilizan las validaciones de
contacto del registro de emprendedores.

`medioTransporte` es texto obligatorio, sin espacios vacíos y con máximo de
50 caracteres después de recortar extremos, acorde al esquema existente.
La interfaz ofrece bicicleta, motocicleta, automóvil y a pie. No se crean
columnas ni enumeraciones nuevas. Placa y descripciones del vehículo están
pendientes y no se capturan ni se simulan.

La respuesta **201** contiene `{ usuario: UserResponseDto, repartidor:
CourierResponseDto }`. No incluye hash, contraseña, authId ni JWT. El registro
no inicia sesión. **400** indica validación o campos desconocidos; **409**, correo
existente, incluyendo solicitudes concurrentes; **429**, límite de registro;
**500**, error interno con respuesta Problem Details sin detalles de persistencia.

## Persistencia y permisos

Se calcula bcrypt con coste 10 antes de abrir la transacción. Los repositorios
de usuario y repartidor usan el mismo EntityManager transaccional. El servidor
asigna `REPARTIDOR`, `ACTIVO`, un authId nuevo y el idUsuario recién creado al
perfil. Si falla el perfil se revierten ambas inserciones. La restricción única
de correo resuelve carreras y la restricción `repartidor_id_usuario_key`
conserva la relación uno a uno.

La disponibilidad inicial es `DISPONIBLE`, el valor predeterminado existente
que requiere la asignación administrativa. Esto permite asignaciones una vez
registrado; no implica un nuevo sistema de aceptación ni un control de conexión.
Las reglas actuales de asignación y de propiedad de entregas permanecen intactas.
El registro no concede acceso al listado general de repartidores, reservado a ADMIN.

## Frontend y comprobación segura

`/registro` enlaza a `/registro/repartidor`. El intermediario
`POST /api/auth/register/courier` valida la misma forma de datos y utiliza el
cliente HTTP existente sin autenticación. Devuelve solo un mensaje controlado;
no refleja errores internos ni crea cookies. Después del registro se navega
al login existente, que conserva la cookie HttpOnly, `/cuenta` y cierre de sesión.

Para comprobar el recorrido sin afectar bases persistentes:

1. Compilar el frontend (`npm.cmd run build` desde `apps/frontend`).
2. Ejecutar `node --test test/browser/account.test.mjs` desde `apps/frontend`.
   El soporte inicia NestJS y Next.js locales, PostgreSQL de Testcontainers y
   Chrome temporal; verifica registros de los tres roles, validaciones,
   transporte, persistencia, login, perfil, logout y tamaños móviles/escritorio.
3. Para una revisión interactiva, usar una instancia local configurada por el
   equipo con PostgreSQL desechable. Confirmar su destino antes de registrar.
   Visitar `/registro`, elegir Repartidor, completar datos ficticios, registrar,
   iniciar sesión y comprobar nombre, correo y rol en `/cuenta`; cerrar sesión.
   No utilizar el entorno conectado a Supabase para esta prueba.

La referencia oficial de Figma es el nodo `2023:53226` del archivo
`Ogxj2qKjAbnS2jf94si9Os`. Se reutilizan panel verde, fondo crema, emblema y
fotografía locales, pestañas de acceso y título. Se separan nombre y apellido
reales, y se sustituye la captura de campos no persistibles por transporte y un
aviso explícito. La adaptación estética final queda fuera de esta implementación.
