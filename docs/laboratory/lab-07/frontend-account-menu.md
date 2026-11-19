# Registro, perfil y menú de cuenta

El registro existente crea únicamente CLIENTE en PostgreSQL. Se conserva el
contrato de registro/login y la cookie HttpOnly `chorotega_session`. No hay
cambios de esquema, migraciones, seeds ni infraestructura.

## Perfil y navegación

`GET /api/v1/auth/me` usa `JwtAuthGuard` y recupera el usuario activo desde
PostgreSQL por la PK autenticada. Reutiliza `UserResponseDto` y `UserMapper`, con
una proyección que no selecciona `claveHash` ni `authId`. No acepta un ID de
usuario del cliente. Login y registro conservan sus límites por operación;
consultar el perfil no consume esas cuotas.

Next.js consulta mediante el cliente servidor existente con `cache: no-store`.
Solo nombre, apellido, correo, rol e identificador llegan a los componentes
cliente. `/api/auth/me` permite revalidar al volver al historial/pestaña y cada
30 segundos mientras está visible. Un 401 elimina la cookie desde un Route
Handler; un timeout o un fallo del servidor oculta el contenido protegido y
ofrece reintento, conservando la sesión. `/api/auth/session` revalida antes de
limpiar una cookie inválida y redirigir al login.

CLIENTE entra a `/pedidos`; los demás roles, a `/cuenta`. La creación de pedidos
queda reservada a CLIENTE también en la navegación; el backend conserva su
autorización independiente. El menú y el encabezado se comparten entre las
pantallas autenticadas. Login/logout hacen navegación completa para descartar
el caché de navegación de la cuenta anterior.

ADMIN tiene acceso al `/admin/login` del origen de `API_URL`, sin el prefijo
REST. Ese panel conserva su cookie y login independientes; cerrar la sesión del
frontend no cierra la sesión administrativa. EMPRENDEDOR y REPARTIDOR no reciben
enlaces a pantallas de gestión que no existen.

`/emprendedores` es informativa: muestra beneficios y explica que no hay trámite
de incorporación disponible. No envía solicitudes ni cambia roles.

## Verificación local

Con las dependencias existentes instaladas:

```text
cd apps/backend
npm run lint
npm run build
npm test -- --runInBand
node node_modules/jest/bin/jest.js --config ./test/jest-integration.json --maxWorkers=2 --testPathPatterns=test/integration/http/

cd ../frontend
npm run lint
npm test
npm run build
npm run test:browser
```

En PowerShell con scripts restringidos se utiliza `npm.cmd`. Las pruebas HTTP
y de navegador crean y eliminan su propia base PostgreSQL con Testcontainers;
requieren Docker Linux activo. No usan la base de `.env`. El runner de navegador
requiere también las dependencias del backend y Chrome/Chromium instalado
(`CHROME_BIN` permite indicar la ruta). Inicia Next.js local con `API_URL` que
apunta exclusivamente al backend temporal, y cierra sus procesos al terminar.

Las pruebas de navegador comprueban registro, login, identidad real, menú con
teclado/Escape/clic fuera, seis anchos (320, 375, 390, 600, 768 y 1280), zoom,
compra y stock persistidos, paginación de pedidos, error de perfil, logout,
cambio de usuario, historial, roles y cookies inválidas/vencidas.

## Dependencia de producción

El frontend requiere una versión del backend que incluya `/api/v1/auth/me`.
La publicación deberá coordinarse después de revisar el cambio. Esta tarea no
despliega, no activa automatismos ni modifica Vercel Authentication. La limitación
de verificación remota posterior al despliegue continúa siendo independiente.

La comprobación local en Chrome no sustituye la revisión con lector de pantalla,
dispositivos físicos y el entorno publicado protegido por Vercel.
