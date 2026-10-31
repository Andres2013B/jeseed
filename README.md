# Maayan Jésed · Colegio Olami ORT

Página de buenas acciones del Colegio Olami ORT: los alumnos eligen retos, los cuentan,
su familia o su maestro confirman y coordinación los autoriza. Cada acción aprobada es
una gota que llena el manantial del colegio.

Publicada en: https://andres2013b.github.io/jeseed/

Creada por Andrés Braverman y Nathan Jaschkowitz.

## Roles
- **Alumno**: se registra con su correo del colegio, elige sección y salón.
- **Familia**: se registra con su correo y el correo del colegio de su hijo o hija.
- **Maestro**: se registra con una clave de un solo uso que genera coordinación (Personas).
- **Coordinación**: los correos de la tabla `public.moderators` en Supabase.

## Base de datos
Supabase (el mismo proyecto de JESSED). En SQL Editor corre `supabase/maayan-jesed.sql`
(se puede correr varias veces). Las reglas de seguridad están en ese archivo.

## Versión anterior
La página JESSED anterior sigue en `anterior/` (https://andres2013b.github.io/jeseed/anterior/).
