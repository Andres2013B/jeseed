# JESSED · Colegio Olami ORT

Página de buenas acciones (Jesed) para alumnos del Colegio Olami ORT.

- Se entra con cualquier correo (para limitarlo a la escuela, pon el dominio en `SCHOOL_DOMAIN` de `js/config.js`).
- Los retos se envían a verificación y un moderador los aprueba antes de sumar puntos.
- Datos en Supabase (`js/config.js`). Las reglas de seguridad están en `supabase/schema.sql`.

## Publicar
Settings → Pages → Source: *Deploy from a branch* → Branch: `main` / `(root)` → Save.

## Cambios comunes
- Retos y categorías: `js/data.js` (arreglo `ACTIONS`).
- Moderadores: en Supabase → SQL Editor:
  `insert into public.moderators (email) values ('nombre@olamiort.edu.mx');`
