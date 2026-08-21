# ADR-001: Selección del Stack Tecnológico

| **Estado** |   Aceptado  |
|------------|-------------|
| **Fecha**  | 05/08/2026  |

---

# Contexto

Para el desarrollo del proyecto fue necesario definir las tecnologías que se utilizarán tanto en el **frontend** como en el **backend**.

Aunque la guía del laboratorio propone un stack tecnológico específico, el equipo solicitó autorización al profesor para utilizar un stack diferente debido a la experiencia previa de ambos integrantes con estas herramientas. La solicitud fue aprobada.

Esta decisión permite aprovechar el conocimiento del equipo, reducir la curva de aprendizaje y enfocar los esfuerzos en el desarrollo de las funcionalidades del sistema.

---

# Decisión

Se utilizará el siguiente stack tecnológico durante todo el desarrollo del proyecto.

| Componente | Tecnología |
|------------|------------|
| **Frontend** | Next.js |
| **Backend** | NestJS |
| **Base de datos** | PostgreSQL (Supabase) |
| **ORM** | TypeORM |
| **Autenticación** | Supabase Auth con Google OAuth 2.0 |
| **Seguridad** | JSON Web Tokens (JWT) |
| **Estilos** | Tailwind CSS |

---

# Alternativas consideradas

Se analizaron las siguientes alternativas:

1. Utilizar el stack tecnológico propuesto en la guía del laboratorio.
2. Utilizar un stack alternativo compuesto por:
   - Next.js
   - NestJS
   - PostgreSQL (Supabase)
   - TypeORM
   - Tailwind CSS
   - JSON Web Tokens (JWT)

Se seleccionó la segunda alternativa porque el equipo ya posee experiencia utilizando estas tecnologías, lo que permitirá un desarrollo más eficiente sin afectar el cumplimiento de los objetivos del curso.

---

# Justificación

## Next.js

Se utilizará para desarrollar la interfaz de usuario debido a que facilita la construcción de aplicaciones modernas mediante componentes reutilizables y una estructura organizada.

## NestJS

Se utilizará para desarrollar el backend porque proporciona una arquitectura modular, escalable y fácil de mantener.

## PostgreSQL

Será la base de datos principal del sistema por su estabilidad, confiabilidad y soporte para aplicaciones empresariales.

## Supabase

Se utilizará para administrar PostgreSQL y gestionar el proceso de autenticación de usuarios mediante Google OAuth.

## TypeORM

Permitirá mapear las entidades del sistema a la base de datos, simplificando las operaciones CRUD y el acceso a la información.

## Tailwind CSS

Se empleará para construir una interfaz moderna, consistente y adaptable mediante clases utilitarias.

## JSON Web Tokens (JWT)

Se utilizarán para gestionar la autenticación y autorización de los usuarios una vez hayan iniciado sesión.

---

# Consecuencias

## Positivas

- El equipo trabajará con tecnologías que ya domina.
- Se reducirá significativamente el tiempo de aprendizaje.
- El desarrollo será más ágil.
- El stack seleccionado cumple con todos los requerimientos técnicos del proyecto.
- Las tecnologías elegidas cuentan con una amplia comunidad y documentación.

## Negativas

- Algunos ejemplos proporcionados durante el curso deberán adaptarse al stack seleccionado.
- Será necesario mantener documentación propia cuando existan diferencias con la guía oficial.

---

# Impacto

Esta decisión define la arquitectura tecnológica que se utilizará durante todo el proyecto, incluyendo el desarrollo del frontend, backend, acceso a la base de datos, autenticación, seguridad y estilos de la aplicación.

Las futuras decisiones técnicas deberán ser compatibles con este stack.

---

# Conclusión

El equipo decidió utilizar **Next.js**, **NestJS**, **PostgreSQL (Supabase)**, **TypeORM**, **Tailwind CSS** y **JWT** debido a que son tecnologías conocidas por ambos integrantes, fueron aprobadas por el profesor y permiten desarrollar el proyecto cumpliendo con los objetivos académicos y los requerimientos funcionales establecidos.

---