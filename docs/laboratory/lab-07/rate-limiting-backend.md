# Laboratorio 7: límites de autenticación y registro

Bloque 3, implementación local del 29 de octubre de 2026 en
`feat/lab-07-security-concurrency`, sobre el commit del Bloque 2
`46d4e3c95ca02545703a0730d0c223affb3da65e`. No se aplicaron cambios en producción.

## Identificación de clientes y decisión

El backend no configura `trust proxy` ni dispone de una lista verificada de
proxies confiables. Express conserva su valor predeterminado `false`: `req.ip`
corresponde al extremo de la conexión, no necesariamente al navegador. Las
pruebas HTTP comprueban este valor real de la aplicación.

[Render explica](https://render.com/articles/how-render-handles-ddos-attacks)
que sus solicitudes atraviesan Cloudflare y balanceadores, y que la aplicación
observa la dirección de un proxy por defecto. Esa documentación no demuestra la
cadena exacta ni el tratamiento de encabezados en este despliegue. No se
consultaron servicios productivos ni se modificó su infraestructura para probarlo.

Además, el login del frontend pasa por `apps/frontend/app/api/auth/login/route.ts`:
Next.js realiza la solicitud al backend desde el servidor. No corresponde
identificar automáticamente ese extremo como la IP real del usuario.

Según la [documentación de Express](https://expressjs.com/en/guide/behind-proxies/),
confiar en encabezados reenviados requiere conocer y configurar la cadena de
proxies. No se habilita `trust proxy: true`, no se elige una posición de
`X-Forwarded-For` por suposición ni se confía en `X-Real-IP`, `Forwarded`,
`CF-Connecting-IP` o `True-Client-IP` recibidos del cliente.

La protección implementada es un **presupuesto por operación y por instancia de
la aplicación, compartido entre todos los clientes**. No es un límite por IP
real, cuenta, correo o sesión. Cambiar cualquiera de esos datos no crea otro
presupuesto. Es una protección conservadora para acotar trabajo de credenciales
y registro mientras no exista una identificación de clientes verificable.

## Límites y configuración

| Operación        | Ruta POST               | Máximo predeterminado por ventana | Variable                     |
| ---------------- | ----------------------- | --------------------------------: | ---------------------------- |
| Login REST       | `/api/v1/auth/login`    |                                60 | `AUTH_LOGIN_MAX_REQUESTS`    |
| Login MVC        | `/admin/login`          |                                20 | `ADMIN_LOGIN_MAX_REQUESTS`   |
| Registro público | `/api/v1/auth/register` |                                10 | `AUTH_REGISTER_MAX_REQUESTS` |

La ventana predeterminada es de **60 000 ms** y se configura mediante
`AUTH_RATE_LIMIT_WINDOW_MS`. `.env.example` documenta esos valores, que no son
secretos. Los valores se leen al crear los proveedores de NestJS, antes de abrir
HTTP; no se actualizan dinámicamente.

Todos deben ser enteros positivos: los máximos admitidos son 1 000 000 solicitudes
y 86 400 000 ms de ventana. Valores vacíos, cero, negativos, fracciones o formatos
inválidos provocan un error de configuración que solo identifica la variable,
sin imprimir su valor. No hay un modo de desactivación por `NODE_ENV`.

Los tres presupuestos son independientes. Agotar login REST no impide usar el
login MVC o el registro. Alternar ambos logins puede consumir sus dos
presupuestos; no se afirma un único límite agregado de autenticación.

## Funcionamiento y respuestas

`AuthRateLimitModule` registra la política, un reloj monotónico de Node.js y
`AuthRateLimitService`. Un `Map` mantiene como máximo tres entradas, definidas por
metadatos internos de las rutas. No guarda direcciones IP, correos, contraseñas,
tokens ni cookies, y no necesita tareas periódicas de limpieza.

Cada ventana es fija y comienza con la primera solicitud de su operación. La
comprobación y la reserva son síncronas, antes del trabajo asíncrono de
autenticación. Las solicitudes rechazadas no incrementan el contador ni prolongan
el vencimiento. Al terminar la ventana, la siguiente solicitud inicia un nuevo
presupuesto. No se modifica ni bloquea ningún registro de usuario.

`AuthRateLimitGuard` se aplica exclusivamente a los tres POST. Se cuentan éxitos
y errores que alcanzan el guard, incluidos fallos posteriores de DTO,
credenciales o CSRF. El parser HTTP y CORS se ejecutan antes; las solicitudes que
estos rechazan no consumen presupuesto ni alcanzan el trabajo de credenciales.
Este mecanismo no pretende filtrar todo el tráfico o reemplazar protección de
red.

Al exceder el máximo:

- Se devuelve **HTTP 429** y `Retry-After` con segundos enteros positivos,
  redondeados hacia arriba hasta el fin de la ventana.
- REST conserva RFC 9457 Problem Details con el mensaje genérico
  `Demasiadas solicitudes. Inténtelo más tarde.`.
- MVC devuelve una vista HTML segura con el mismo estado y mensaje, sin borrar
  una sesión válida ni mostrar datos ingresados.
- La respuesta no depende de si la cuenta existe, de su estado ni de su rol. El
  guard se ejecuta antes de consultar credenciales.

La configuración CORS expone `Retry-After` además de `Location`, sin cambiar
orígenes, métodos autorizados ni credenciales. OpenAPI documenta 429 y su
encabezado para login y registro.

## Sesiones, CSRF y contratos existentes

Dentro del presupuesto se conservan los códigos y DTOs de login y registro,
incluidos los errores genéricos de credenciales del Bloque 2. No cambia la firma,
duración ni comprobación de permisos actuales del JWT.
El 409 preexistente del registro por correo repetido también se conserva; la
respuesta 429 no añade información sobre cuentas.

En MVC el orden de guards es limitador y después CSRF. Un formulario sin CSRF o
con CSRF ajeno sigue rechazado; cambiar de cookie o crear una sesión anónima no
reinicia el presupuesto. Un login correcto conserva la rotación de sesión/CSRF y
Post/Redirect/Get con 303. Las cookies cifradas, HttpOnly, SameSite y Secure en
producción permanecen intactas. GET login, los listados administrativos y logout
no consumen estos presupuestos; conservan sus propias protecciones.

El proxy de login de Next.js propaga el estado 429 pero actualmente no copia
`Retry-After` a su respuesta. No se modificó el frontend: propagar ese encabezado
hasta el navegador requiere coordinación aparte. El backend sí lo entrega tanto
en REST como en MVC.

## Almacenamiento, alcance y riesgos

El almacenamiento es exclusivamente en memoria por instancia de NestJS. Un
reinicio pierde los contadores y cada proceso, worker o réplica dispone de su
propio presupuesto. No hay Redis, persistencia PostgreSQL ni protección
distribuida; una aplicación con varias réplicas puede admitir más solicitudes en
conjunto.

Al compartir presupuesto, un atacante puede agotarlo y afectar temporalmente a
clientes legítimos. Una actividad sostenida puede agotar ventanas sucesivas.
La ventana fija también admite ráfagas alrededor de sus límites. Esta solución
acota trabajo por operación, pero no sustituye controles por cliente verificado,
protección de infraestructura o mitigación distribuida. Antes de implementar
límites por IP habría que verificar la cadena Render/Cloudflare/Vercel, la
limpieza de encabezados y qué rutas de acceso existen realmente.

## Pruebas locales

Se utiliza Node.js 22.22.0. No se añadieron dependencias ni se modificaron
CI/CD, despliegue, observabilidad, Chrome, entidades o migraciones.

Las pruebas del límite usan una ventana de 2500 ms, presupuestos pequeños y un
reloj inyectado que se avanza explícitamente: no dependen de esperas reales ni de
alterar temporizadores de sesiones o PostgreSQL. Las solicitudes HTTP pasan por
NestJS y sus guards reales, con Supertest y PostgreSQL Testcontainers.

Las suites de regresión preexistentes crean cientos de logins como fixtures. En
su soporte de pruebas se configuran presupuestos de 10 000 por operación para no
confundir ese volumen de preparación con un ataque. El guard no se desactiva.
Las pruebas específicas sustituyen explícitamente esa política por límites
pequeños. Cada aplicación mantiene su propio almacén y las pruebas del límite
avanzan la ventana entre casos, evitando contaminación por contadores globales.

Resultados finales:

- Unitarias seleccionadas de límites, MVC y configuración HTTP: 76/76.
- Nuevos casos HTTP de rate limiting: 13/13.
- Unitarias completas: 501/501 en 39 suites; veinte casos nuevos.
- Integración completa final: 620/620 en 23 suites, aproximadamente 103 segundos.
- Chrome: nueve escenarios MVC aprobados; Node cuenta diez pruebas incluyendo el
  contenedor padre. El incidente `Browser.getVersion` no se reprodujo en esta
  ejecución; no se considera resuelto por este resultado.
- Artefacto compilado: 8/8.
- ESLint, TypeScript completo sin emisión ni incremental y build: aprobados.
- Cobertura existente de negocio: statements 97.50 %, branches 84.63 %, functions
  92.00 % y lines 97.74 %, sin modificar umbrales ni exclusiones. No es una
  medición específica del nuevo limitador.

La primera integración terminó con 618/620: dos comprobaciones OpenAPI mantenían
listas de estados anteriores sin 429. Se actualizaron exclusivamente las listas
de login y registro, conservando la comparación exacta de estados para las 36
operaciones. La integración completa posterior aprobó los 620 casos. No se
cambiaron expectativas de permisos, CSRF ni credenciales para conseguirlo.

Comandos desde `apps/backend`, con Node.js 22.22.0 en PATH:

```sh
npm run lint
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm run build
npm run test:cov -- --runInBand
npm run test:integration
npm run test:browser
npm run test:deployment
```

Las pruebas cubren máximo exacto, 429, `Retry-After`, redondeo y recuperación,
independencia de rutas, estado por instancia, reservas concurrentes, login válido
e inválido, registro sin escrituras al exceder el presupuesto, ausencia de
enumeración adicional, encabezados IP falsificados, sesiones y CSRF MVC, así como
la documentación OpenAPI de los nuevos errores.

El incidente previo `Chrome no respondió a Browser.getVersion` corresponde al
arranque del navegador antes del login MVC. Si reaparece se registrará por
separado, sin atribuirlo a este bloque sin evidencia. No se cambiaron sus
timeouts, argumentos de lanzamiento ni el workflow.
