# Laboratorio 7: cuentas activas y permisos vigentes

Bloque 2, comprobaciones locales del 29 de octubre de 2026, en
`feat/lab-07-security-concurrency`. La base es el commit del Bloque 1
`c0025c4673e70f8f9466cb3fa08f729d64a44a91`. Los cambios de este bloque están sin
commit y no se verificaron ni aplicaron en producción.

## Identidad persistente

La autenticación actual utiliza la entidad `User`, almacenada en `usuario`.
NestJS comprueba el hash bcrypt y emite el JWT. No hay una entidad local de
autenticación adicional cuya clave deba equipararse con la del usuario.

| Campo                              | Uso actual                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| `usuario.id_usuario` / `idUsuario` | Clave primaria entera y referencia persistente incluida en el JWT.                     |
| `usuario.auth_id` / `authId`       | UUID distinto de la clave primaria; no identifica al usuario en estos JWT.             |
| `sub` del JWT                      | Correo incluido al emitir el token; no se utiliza como clave de búsqueda de la cuenta. |
| `rol` del JWT                      | Dato histórico emitido al autenticar; ya no determina los permisos del backend.        |

`CurrentIdentityService` valida primero la firma y la expiración del JWT mediante
el `JwtService` existente. Rechaza identidades mal formadas antes de consultar
PostgreSQL. Después busca `idUsuario` mediante
`UsersRepository.findAuthenticationById()`, con una proyección limitada a
`idUsuario`, `correo`, `rol` y `estado`, sin seleccionar hashes, UUID de
autenticación ni relaciones.

Si la cuenta no existe o no está `ACTIVO`, la autenticación falla. Para una cuenta
válida construye el actor con los datos vigentes, incluido su rol. `RolesGuard`
conserva sus reglas y decoradores: ahora recibe ese actor actualizado. Las reglas
de propiedad de catálogo, pedidos y entregas permanecen en sus servicios y
consultas existentes.

## Inicio de sesión

REST y MVC utilizan la misma comprobación privada de credenciales en
`AuthService`. Se exige contraseña correcta y estado `ACTIVO` antes de emitir un
JWT. Cuenta inexistente, contraseña incorrecta, cuenta sin contraseña o cuenta
inactiva reciben el mensaje genérico `Credenciales inválidas.` sin identificar el
estado de la cuenta.

`login()` conserva el contrato REST: `token`, `tipo: Bearer` y
`expiraEnSegundos: 3600`. `loginAdmin()` es un método interno usado por el
controlador MVC, no un endpoint adicional. Exige también ADMIN antes de emitir
credenciales. Ambos métodos comparten la comprobación de contraseña y la emisión
del JWT. El registro público conserva su comportamiento y el rol CLIENTE.

El login MVC consulta credenciales una sola vez; no vuelve a consultar la cuenta
mediante el token recién emitido. Rota la sesión y el CSRF al autenticar como
antes.

## Solicitudes autenticadas

REST delega desde `JwtAuthGuard` y MVC desde `AdminSessionService.actor()` al mismo
`CurrentIdentityService`. Se realiza una lectura de identidad por solicitud
protegida, no una lectura por elemento listado. No se mantiene una caché de roles
entre solicitudes. `RolesGuard` no efectúa otra consulta.

Se conservan el cifrado AES-GCM de la sesión, las cookies HttpOnly, Secure en
producción, SameSite Strict, la ruta `/admin`, la expiración y la protección CSRF.
Una sesión ADMIN vigente se conserva al visitar `/admin/login`, después de
comprobar nuevamente su cuenta.

| Situación                                                 | REST protegido                                           | MVC                                                                                 |
| --------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| JWT válido y cuenta activa con rol permitido              | Acceso normal.                                           | ADMIN conserva acceso y PRG.                                                        |
| Cuenta inactiva al iniciar sesión                         | 401 genérico.                                            | Formulario con 401 genérico, sin sesión autenticada nueva.                          |
| Token inválido o vencido                                  | 401, sin consulta de identidad.                          | Se rechaza la sesión según el flujo existente.                                      |
| Cuenta desactivada o eliminada después de emitir el token | 401.                                                     | Las rutas protegidas redirigen con 303 a login mediante el filtro MVC existente.    |
| Cuenta activa que perdió ADMIN                            | 403 en operaciones exclusivas de ADMIN.                  | 403 en lecturas y escrituras administrativas; GET login ofrece un formulario nuevo. |
| Cuenta activa cuyo rol cambió                             | Se aplica el rol persistido, también ante una promoción. | Solo ADMIN vigente accede al catálogo administrativo.                               |
| Error inesperado al consultar la cuenta                   | 500 seguro, sin error SQL ni trazas.                     | 500 con vista segura.                                                               |

Los errores de persistencia no se convierten en falsos 401. El servicio limita la
traducción de errores criptográficos al paso de verificación del JWT y deja los
errores inesperados al filtro existente.

## Pruebas y compatibilidad

Las verificaciones usan Node.js 22.22.0. No se cambiaron dependencias, entidades,
migraciones, configuración de despliegue, CI/CD ni observabilidad.

- Unitarias completas: 481/481 en 38 suites, con 23 casos nuevos.
- Cobertura existente: statements 97.50 %, branches 84.63 %, functions 92.00 % y
  lines 97.74 %. No se modificaron umbrales ni exclusiones; estos porcentajes
  corresponden a la selección de negocio existente, no a una medición específica
  de Auth.
- HTTP de identidad, registro y seguridad: 46/46, incluidas las 25 nuevas pruebas
  de identidad vigente con PostgreSQL temporal, migraciones reales y guards sin
  desactivar.
- TypeScript completo con `--noEmit --incremental false`: aprobado. El mock
  preexistente de `save` en `auth.service.spec.ts` ahora devuelve `Promise<User>`
  mediante `Promise.resolve`; no se cambió producción para resolver ese error.
- ESLint y build: aprobados.
- Integración completa: 607/607 en 22 suites, aproximadamente 93 segundos. Incluye
  88 casos de seguridad del catálogo, 69 HTTP de pedidos, 57 de entregas y las
  regresiones de registro, usuarios, MVC y OpenAPI de las 36 operaciones REST.
- Chrome con perfil aislado y PostgreSQL temporal: nueve escenarios aprobados;
  Node cuenta diez pruebas incluyendo su contenedor padre.
- Artefacto compilado: 8/8.

La nueva suite verifica cuentas activas, inactivas y eliminadas, respuestas
genéricas, firma y expiración, los cuatro roles, cambios de rol con el mismo JWT,
revocación ADMIN en REST y MVC, ausencia de escrituras tras el rechazo y una sola
consulta de identidad sin columnas sensibles. Las pruebas existentes conservan
la cobertura de registro, cookies, sesiones, CSRF y propiedad de recursos.

Se ajustaron dos comprobaciones HTTP de pedidos por la nueva política:

- El comprador inactivo recibe 401 antes de alcanzar el servicio de negocio. La
  validación del comprador dentro del proceso transaccional y sus pruebas
  unitarias permanecen intactas.
- La prueba de N+1 exige exactamente una consulta de identidad y conserva el
  máximo anterior de tres consultas de negocio, tanto con páginas pequeñas como
  grandes. No se aumentó el límite de consultas de pedidos.

Durante la primera selección HTTP, una prueba existente de catálogo recibió 401
en el login de preparación que esperaba 201. Se conserva como observación: su
causa no está demostrada y no se modificó esa prueba para ocultarlo. La ejecución
completa posterior aprobó todos los casos, pero eso no demuestra que la causa
esté corregida. La primera
versión de dos aserciones nuevas también suponía comillas dobles en HTML; se
corrigieron para aceptar las comillas válidas de las plantillas existentes.

## Límites del bloque

La vigencia se comprueba al autorizar cada solicitud. No cancela operaciones que
ya superaron esa comprobación si el estado o rol cambia mientras se ejecutan.
La base debe estar disponible para autorizar solicitudes protegidas.

No se introduce revocación individual de tokens, refresh tokens ni una lista de
sesiones en el servidor. Un token sin vencer puede volver a utilizarse si la
cuenta se reactiva, siempre con el rol vigente. El frontend puede conservar el
rol histórico en su JWT para presentación, pero el backend ya no lo utiliza para
autorizar. No se modificó el frontend ni se añadieron mecanismos del siguiente
bloque.
