# Landing pública de Chorotega E-Market

Referencia: [landing oficial en Figma](https://www.figma.com/design/Ogxj2qKjAbnS2jf94si9Os/Chorotega-E-Market?node-id=2023-51756).

## Alcance

`/` es una página informativa renderizada como componente de servidor. No lee
cookies, no necesita `API_URL` y no consulta tiendas, productos, categorías ni
inventario. El catálogo sigue siendo privado. No se modifican los registros,
los contratos REST, los permisos ni el backend.

Los estilos están aislados en un CSS Module. Los recursos originales y las
fuentes se alojan en `apps/frontend/public/landing/`; su procedencia se detalla
en el README de esa carpeta. Las fuentes usan nombres exclusivos de la landing
para conservar la tipografía de las pantallas existentes.

## Correspondencia visual

| Sección                    | Frame/capa Figma |
| -------------------------- | ---------------- |
| Navegación del mercado     | 2023:51757       |
| Presentación principal     | 2023:51771       |
| Propósito                  | 2023:51793       |
| Categorías informativas    | 2023:51798       |
| Tres formas de ser parte   | 2023:51856       |
| Beneficios por rol         | 2023:51878       |
| Nuestra tierra             | 2023:51918       |
| Funcionamiento del mercado | 2023:51928       |
| Invitación y pie de página | 2023:51945       |

Adaptaciones intencionales: los conteos ficticios de productos se sustituyen por
descripciones editoriales. Los textos no prometen chat, pagos integrados ni
flexibilidad laboral no demostrada. Las categorías no son filtros ni botones.
Los nombres de redes sociales en el footer son texto, pues no se proporcionaron
destinos oficiales. No se inventan URLs ni funcionalidades.

## Navegación y sesión

- Iniciar sesión y entrar/explorar el mercado llevan a `/login`.
- Unirse lleva a `/registro`; cada rol enlaza su formulario existente.
- Los enlaces internos utilizan anclas existentes de la misma landing.
- `/acceso` conserva el antiguo comportamiento de `/`: valida la identidad vigente
  y redirige a `/pedidos` para CLIENTE o `/cuenta` para los demás roles.
- Login y cambios de identidad detectados por `SessionBoundary` pasan por `/acceso`.
- `/api/auth/session` dirige una sesión válida directamente a su destino por rol;
  una sesión inválida limpia la cookie y lleva a login; una indisponibilidad conserva
  la cookie y muestra el estado de cuenta no disponible.

No se cambia el JWT ni la cookie HttpOnly. El acceso a la landing sigue siendo
público incluso si ya existe una cookie de sesión.

## Verificación local

Desde `apps/frontend`:

```bash
npm test
npm run lint
./node_modules/.bin/tsc --noEmit --incremental false
npm run build
node --test test/browser/landing.test.mjs
```

La nueva prueba de navegador utiliza Next.js compilado, Chrome y una API sintética
exclusivamente en loopback. Comprueba las nueve secciones, recursos locales,
ausencia de llamadas privadas y desbordamientos a 320, 390, 768, 1280 y 1440 px;
también navegación, login de cuatro roles, logout, recuperación y cambio de rol.
Guarda capturas y geometría en `chorotega-landing-evidence` dentro del directorio
temporal del sistema. No demuestra persistencia real en PostgreSQL.

La regresión existente `test/browser/account.test.mjs` utiliza NestJS y PostgreSQL
Testcontainers; requiere Docker y un build actual. Se conserva y se ajusta su
entrada por rol de `/` a `/acceso`. Las pruebas de registro permanecen intactas.

La referencia desktop tiene 1440 px; tablet y móvil son adaptaciones responsive,
no variantes móviles proporcionadas por Figma. El catálogo, tiendas, carrito,
gestión y rediseño de registros quedan fuera de este bloque.

## Resultados locales — 13 de noviembre de 2026

Verificación con Node.js 24.21.0:

| Comprobación                                         | Resultado                                                                  |
| ---------------------------------------------------- | -------------------------------------------------------------------------- |
| `npm test`                                           | 27/27; incluye las 24 pruebas existentes y tres nuevas                     |
| ESLint y TypeScript sin emisión ni incremental       | Aprobados                                                                  |
| Prettier sobre archivos nuevos y navegación afectada | Aprobado; los tests históricos conservan su formato fuera de los cambios   |
| `npm run build -- --webpack`                         | Aprobado; `/` estático y `/acceso` dinámico                                |
| Chrome con Next.js compilado y API sintética local   | 12 escenarios aprobados, 13 pruebas contando el contenedor padre           |
| Anchos 320, 390, 768, 1280 y 1440                    | Sin desbordamientos, con assets/fuentes cargados y sin peticiones privadas |
| `git diff --check`                                   | Sin errores                                                                |

El build habitual con Turbopack se intentó y falló al crear su proceso de CSS:
`binding to a port — Operation not permitted`. La compilación y el navegador se
verificaron con Webpack, alternativa soportada por Next.js, sin modificar scripts
ni configuración. Queda pendiente confirmar el build habitual en un entorno sin
esa restricción; no se presenta como aprobado.

Docker no estaba iniciado. No se ejecutó la regresión completa Chrome → NestJS →
PostgreSQL temporal ni se afirma haber verificado persistencia en esta ejecución.
Sí se ejecutaron las pruebas existentes con mocks de los tres registros, sesión
y los intermediarios privados. Los registros y el backend conservan su código.

La captura completa requirió cargar explícitamente las imágenes lazy en el test;
la aplicación conserva la carga diferida. La prueba local también usa `localhost`
de forma consistente: se comprobó que Next.js normaliza ese hostname en los
redirects absolutos del servidor local. No se alteró seguridad para conseguirlo.

Se revisaron visualmente las capturas contra Figma: composición, recursos,
colores, jerarquía tipográfica y posiciones de las nueve secciones. Hay diferencias
editoriales intencionales indicadas arriba y adaptación móvil; no se afirma una
comparación automática píxel a píxel ni se utilizaron capturas como assets.
