# Laboratorio 7: dependencias del backend

Comprobación local: 28 de octubre de 2026. Rama
`feat/lab-07-security-concurrency`, creada desde `develop` en
`5f17d781c592f83112555d631e8c16b6b15b232d`.

Este bloque actualiza dependencias transitivas del backend. No cambia contratos
REST, autenticación, guards, reglas de negocio, entidades, migraciones, CI/CD,
observabilidad ni configuración de los servicios desplegados. Las correcciones
están locales y todavía no están publicadas en producción.

## Auditoría antes y después

Se consultó el registro público de npm con el lockfile del backend. Los números
representan paquetes señalados por npm, incluyendo avisos propagados a sus
dependientes; no son cantidades de CVE independientes ni pruebas de explotación.

| Alcance                | Momento | Críticas | Altas | Moderadas | Bajas | Total |
| ---------------------- | ------- | -------: | ----: | --------: | ----: | ----: |
| Todas las dependencias | Antes   |        1 |     8 |         2 |     8 |    19 |
| Todas las dependencias | Después |        0 |     0 |         0 |     8 |     8 |
| Solo producción        | Antes   |        1 |     3 |         3 |     0 |     7 |
| Solo producción        | Después |        0 |     0 |         0 |     0 |     0 |

Comandos de comprobación desde `apps/backend`, con Node.js `22.22.0` y npm
`11.20.0`:

```sh
npm audit --json --ignore-scripts --package-lock-only --registry=https://registry.npmjs.org
npm audit --omit=dev --json --ignore-scripts --package-lock-only --registry=https://registry.npmjs.org
```

El primer comando termina con código 1 por los avisos bajos pendientes. El segundo
termina con código 0. El resultado depende de los avisos publicados al consultar;
cero avisos de producción no equivale a una garantía de ausencia de vulnerabilidades.

También se ejecutaron `npm audit --json` y `npm audit --omit=dev --json` sobre la
instalación real, sin `--package-lock-only`: devolvieron los mismos conteos y
códigos de salida. `npm ls --all --json` terminó con código 0 y sin problemas en el
árbol instalado.

## Actualizaciones aplicadas

| Paquete                                      | Versión anterior       | Versión nueva           | Motivo                                                                                |
| -------------------------------------------- | ---------------------- | ----------------------- | ------------------------------------------------------------------------------------- |
| `body-parser`                                | 2.3.0                  | 2.4.0                   | DoS al procesar determinados cuerpos comprimidos.                                     |
| `proxy-addr`                                 | 2.0.7                  | 2.0.8                   | Suplantación de IP con determinadas subredes de proxies confiables.                   |
| `multer`                                     | 2.2.0                  | 2.5.0                   | Avisos de DoS, limpieza de cargas abortadas y procesamiento de formularios multipart. |
| `qs`                                         | 6.15.3                 | 6.17.1                  | Avisos de excepciones y consumo de recursos en procesamiento de consultas.            |
| `js-yaml`, dependiente de Swagger            | 5.3.0                  | 5.4.1                   | Consumo de CPU mediante claves de combinación YAML.                                   |
| `js-yaml`, desarrollo                        | 3.15.1 / 4.3.1         | 3.15.2 / 4.3.2          | Correcciones publicadas para las ramas utilizadas por las herramientas.               |
| `@grpc/grpc-js`                              | 1.14.4                 | 1.14.6                  | Validación de certificados e información de errores.                                  |
| `undici`                                     | 8.10.2                 | 8.12.3                  | Avisos de TLS, redirecciones, integridad y disponibilidad.                            |
| `brace-expansion`                            | 1.1.18 / 2.1.4 / 5.0.9 | 1.1.21 / 2.1.7 / 5.0.12 | Recursión y expansión de patrones con consumo excesivo de recursos.                   |
| `fast-uri`                                   | 3.1.5                  | 3.1.9                   | Normalización e interpretación de URI.                                                |
| `content-type`, dependiente de `body-parser` | 2.0.0                  | 2.1.0                   | Dependencia requerida por el parser corregido.                                        |

Se actualizaron 19 entradas versionadas del lockfile. Multer dejó de requerir
`concat-stream` y su dependencia `typedarray`, que desaparecen del árbol. npm
también recalculó las marcas de dependencias que ahora solo son de desarrollo.

Se mantienen NestJS `11.1.28`, Swagger `11.4.7`, Jest `30.4.2` y TypeORM `1.1.0`.
No se incorporaron nuevos paquetes directos ni cambios de versión mayor.

### Overrides acotados

Los rangos existentes permiten las actualizaciones seleccionadas, salvo dos
dependencias fijadas a una versión exacta por sus consumidores. En
[`package.json`](../../../apps/backend/package.json) se declaran:

```json
{
  "overrides": {
    "@nestjs/platform-express": {
      "multer": "2.5.0"
    },
    "@nestjs/swagger": {
      "js-yaml": "5.4.1"
    }
  }
}
```

Ambos overrides conservan la versión mayor de la dependencia y están limitados a
su consumidor. Evitan actualizar Swagger a 12 o todo el framework para resolver
estos avisos. Deben revisarse al actualizar los consumidores: retirarlos cuando
estos declaren versiones corregidas y las comprobaciones sigan aprobadas.

Las demás actualizaciones se aplicaron con:

```sh
npm update body-parser proxy-addr qs @grpc/grpc-js undici brace-expansion fast-uri js-yaml --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org
```

No se utilizó `npm audit fix --force`.

## Aviso pendiente: deepmerge

`deepmerge@4.3.1` continúa señalado por
[GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4), relacionado
con contaminación de prototipos en objetos combinados. Al consultar el registro,
la versión más reciente publicada era 4.3.1 y no existía un parche disponible.

Los ocho paquetes señalados son `deepmerge`, `fork-ts-checker-webpack-plugin`,
`@nestjs/cli`, `jest-config`, `@jest/core`, `jest-cli`, `jest` y `ts-jest`. Las rutas
afectadas corresponden a herramientas de desarrollo; la auditoría con
`--omit=dev` no las incluye. No se demostró explotación mediante solicitudes del
backend, pero el aviso permanece pendiente, no resuelto.

No se aplican las degradaciones mayores sugeridas por `npm audit` a Nest CLI 7,
Jest 25 o ts-jest 25: cambiarían herramientas y compatibilidad del proyecto sin
proporcionar un parche del paquete utilizado. La resolución requiere un parche
del mantenedor o una decisión aparte sobre sustitución o actualización de sus
consumidores. No se deshabilitaron avisos ni se alteraron niveles de auditoría.

## Verificación local

- Instalación limpia del lockfile con `npm ci --ignore-scripts --engine-strict`:
  aprobada con Node.js 22.22.0.
- ESLint completo y build NestJS: aprobados.
- Prettier de `package.json` y `package-lock.json`: aprobado.
- Unitarias con cobertura: 458/458, 37 suites. Statements 97.50 %, branches
  84.63 %, functions 92.00 % y lines 97.74 %, con la configuración existente.
- Artefacto compilado: 8/8.
- Chrome con PostgreSQL temporal: nueve escenarios MVC aprobados; Node informa
  diez pruebas al incluir el contenedor padre de esos escenarios.
- Integración completa, segunda ejecución: 582/582, 21 suites, aproximadamente 89
  segundos. Incluye login y registro, JWT, roles, propiedad, endpoints REST,
  Swagger/OpenAPI y vistas MVC con PostgreSQL temporal. No se ejecutó por separado
  `test:e2e`; sus archivos HTTP forman parte de esta integración completa.
- Artefacto con dependencias exclusivamente de producción: 8/8, tras una
  instalación aislada con `npm ci --omit=dev --ignore-scripts --engine-strict`.

La primera ejecución unitaria dentro del sandbox no pudo abrir puertos locales
(`listen EPERM`). La repetición con acceso a puertos locales aprobó las 458
pruebas sin cambiar código ni expectativas.

### Fallos no reproducidos en la repetición de integración

La primera integración completa terminó con 579/582 pruebas aprobadas en 21
suites, aproximadamente 277 segundos. Registró:

- `catalog-write-security.integration-spec.ts`: `socket hang up` en
  «POST producto en tienda ajena devuelve 404».
- `admin-mvc.integration-spec.ts`: timeout de 180 segundos en
  «relación inexistente de stores no persiste registros parciales».
- `admin-mvc.integration-spec.ts`: `read ECONNRESET` en
  «sin CSRF o con CSRF ajeno no escribe products».

Las mismas suites con el código y lockfile originales aprobaron 88/88 y 16/16
casos respectivamente en la copia temporal. Ese contraste no se presenta como
una integración original completa aprobada: dos comprobaciones OpenAPI fallaron
porque inicialmente faltaba copiar `api.http` a ese entorno temporal.

La segunda integración completa con las dependencias actualizadas aprobó 582/582
sin modificar las pruebas ni sus tiempos de espera. Los fallos iniciales no se
reprodujeron; su causa sigue sin demostrarse. No se consideran corregidos ni se
atribuyen a las actualizaciones o al código previo sin evidencia adicional.

### Error de TypeScript preexistente

`tsc --noEmit --incremental false` termina con código 2 por TS2345 en
`src/auth/auth.service.spec.ts:60`. El mock de `save`, declarado con retorno
`Promise<User>`, implementa una devolución síncrona de `User`.

El mismo comando, con Node.js 22.22.0, reproduce exactamente el error en una copia
temporal del HEAD y lockfile originales, instalada por separado. Es anterior a
estas actualizaciones. No se modificaron Auth, sus pruebas ni la configuración
TypeScript para ocultarlo. El build excluye los archivos `*.spec.ts`, por eso
puede aprobar mientras la comprobación completa de tipos falla. Esta discrepancia
requiere revisión independiente antes de declarar todas las validaciones verdes.

## Referencias de los avisos

- [body-parser: cuerpos comprimidos](https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828).
- [proxy-addr: configuración de confianza IPv6](https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h).
- [Multer: callback de filtro después del cierre de una solicitud](https://github.com/expressjs/multer/security/advisories/GHSA-q7qp-rjg7-q26m).
- [js-yaml 5: claves de combinación vacías](https://github.com/nodeca/js-yaml/security/advisories/GHSA-r3ph-w7gj-g6xm).
- [js-yaml 3/4: consumo de CPU](https://github.com/advisories/GHSA-2883-xcg3-v3hh).
- [gRPC: certificados](https://github.com/advisories/GHSA-m9gg-hp2v-232j).
- [Undici: opciones TLS](https://github.com/advisories/GHSA-2m5v-pch6-74hx).
- [brace-expansion: expansión cuadrática](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr).
- [fast-uri: normalización de URI](https://github.com/advisories/GHSA-w74x-v6f9-j3xg).
- [qs: excepción en stringify](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw).
