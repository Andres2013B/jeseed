# JESSED · Colegio Olami ORT

Página de buenas acciones (Jesed) para alumnos del Colegio Olami ORT.

- Se entra con cualquier correo (para limitarlo a la escuela, pon el dominio en `SCHOOL_DOMAIN` de `js/config.js`).
- Los retos se envían a verificación y un moderador los aprueba antes de sumar puntos.
- Datos en Supabase (`js/config.js`). Las reglas de seguridad están en `supabase/schema.sql`.

## Funciones
- Secciones (Kinder, Primaria, Secundaria, Prepa) y filtro en Comunidad.
- Publicar sin nombre, comentarios, guardar publicaciones.
- Meta semanal, avisos (🔔), menú "Más" (compartir y enviar opinión).
- Galería "Jesed en acción": la llenan los moderadores desde Moderación.

## Base de datos (Supabase → SQL Editor, en orden)
1. `supabase/schema.sql`
2. `supabase/02-comunidad.sql`

## Publicar
Settings → Pages → Source: *Deploy from a branch* → Branch: `main` / `(root)` → Save.

## Cambios comunes
- Retos y categorías: `js/data.js` (arreglo `ACTIONS`).
- Moderadores: en Supabase → SQL Editor:
  `insert into public.moderators (email) values ('nombre@olamiort.edu.mx');`
