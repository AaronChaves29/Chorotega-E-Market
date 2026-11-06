# Registro de emprendedores y negocio

`POST /api/v1/auth/register/entrepreneur` es publico y comparte el limitador
de la operacion `register` con el registro de clientes. No cambia el contrato
de `POST /auth/register`, que sigue creando solo CLIENTE.

## Entrada

```json
{
  "nombre": "Ana",
  "apellido": "Personal",
  "correo": "ana@example.test",
  "clave": "una contraseña de prueba",
  "telefono": "+506 8888-8888",
  "tienda": {
    "nombre": "Artesanias de Nicoya",
    "direccion": "Direccion del negocio",
    "descripcion": "Ceramica local",
    "horario": "Lunes a viernes"
  }
}
```

Nombre y apellido personales (100 caracteres), correo (150), clave (8 caracteres
como minimo y 72 bytes como maximo), nombre del negocio (150) y direccion (255)
son obligatorios. El correo se normaliza a minusculas y sin espacios exteriores.

Telefono es opcional, hasta 20 caracteres y entre 8 y 15 digitos; admite prefijo
`+`, espacios, parentesis y guiones. Es el contacto de la cuenta y de la tienda.
Descripcion (500) y horario (150) son opcionales. No se inventan valores para
datos ausentes: se guardan como null cuando no se proporcionan.

Se rechazan propiedades desconocidas, tanto en la cuenta como dentro de tienda.
No se aceptan rol, estado, idUsuario, authId ni idEmprendedor.

## Transaccion y respuesta

El hashing bcrypt (coste 10) se realiza antes de abrir la transaccion. Dentro
de una unica transaccion PostgreSQL se consultan duplicados y se guardan usuario
EMPRENDEDOR/ACTIVO y tienda ACTIVA, usando los repositorios existentes ligados al
mismo EntityManager. El propietario se obtiene exclusivamente del usuario recien
insertado. Un fallo de cualquiera de las escrituras revierte ambas.

La unicidad del correo tambien protege registros concurrentes. Su error SQL se
traduce a 409 mediante el mismo adaptador que utiliza el registro de clientes.

201 devuelve `{ "usuario": UserResponseDto, "tienda": StoreResponseDto }`, sin
clave, hash, authId ni token. 400 corresponde a validacion, 409 a correo duplicado,
429 al limite de registros y 500 a fallo interno con Problem Details sanitizado.
Despues del registro es necesario iniciar sesion.

## Frontend y Figma

`/registro` habilita Emprendedor y conduce a `/registro/emprendedor`. El formulario
usa `/api/auth/register/entrepreneur`, que reutiliza el cliente HTTP del servidor
y no devuelve los objetos de PostgreSQL ni genera cookies de sesion.

Se conserva la estructura verde/crema de dos paneles y se usan emblema y fotografia
locales descargados del nodo Figma `2023:52729`. Se agregan nombre y apellido
personales y direccion porque el modelo existente los exige. El horario es opcional.

Logo del negocio y redes sociales no tienen soporte en el modelo ni almacenamiento
de imagenes. Se muestran como pendientes, sin campos de captura o cargas simuladas.
No se agregan migraciones, almacenamiento externo, dashboards ni notificaciones.

## Verificacion segura

Las pruebas HTTP usan exclusivamente PostgreSQL efimero creado por Testcontainers;
no cargan .env ni el datasource CLI. Incluyen el fallo de un trigger de prueba
AFTER INSERT de tienda para comprobar rollback real y ausencia de usuarios huerfanos.
El trigger y el contenedor se eliminan al finalizar.

La prueba de navegador integra Chrome, Next.js, NestJS y PostgreSQL temporal:
registro de cliente y emprendedor, validaciones, duplicados, login, perfil,
logout, recursos locales y ausencia de desbordamiento a 320, 390, 768 y 1280 px.
La captura de referencia se guarda en el directorio temporal, antes de llenar datos.

No ejecutar la coleccion HTTP de ejemplo contra bases remotas para probar registros.
Para revision manual usar un entorno aislado con cuentas de prueba: seleccionar
Emprendedor, completar datos reales de prueba, registrar, iniciar sesion y consultar
`/auth/me` y `/stores?idEmprendedor=<idUsuario>` con el JWT valido desde servidor.
