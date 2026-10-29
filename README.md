# JESSED · Colegio Olami ORT

Página de buenas acciones (Jesed) para alumnos del Colegio Olami ORT.

- Solo se entra con correo de la escuela (`@olamiort.edu.mx`).
- Los retos se envían a verificación y un moderador los aprueba antes de sumar puntos.
- Datos en Supabase (`js/config.js`). Las reglas de seguridad están en `supabase/schema.sql`.

## Publicar
Settings → Pages → Source: *Deploy from a branch* → Branch: `main` / `(root)` → Save.

## Cambios comunes
- Retos y categorías: `js/data.js` (arreglo `ACTIONS`).
- Moderadores: en Supabase → SQL Editor:
  `insert into public.moderators (email) values ('nombre@olamiort.edu.mx');`
