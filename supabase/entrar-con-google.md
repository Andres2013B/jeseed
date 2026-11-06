# Entrar con Google

La página ya tiene el botón **«Entrar con Google»**. Aparece solo en cuanto Google se enciende en Supabase; mientras tanto no se muestra.

Lo hace un adulto con una cuenta de Google (Google Cloud pide ser mayor de edad).

## 1. Supabase: a dónde regresa la gente después de entrar

Supabase → **Authentication → URL Configuration**

- **Site URL:** `https://andres2013b.github.io/jeseed/`
- **Redirect URLs:** agrega `https://andres2013b.github.io/jeseed/`

## 2. Google Cloud

1. Entra a **console.cloud.google.com** y crea un proyecto llamado `Maayan Jésed`.
2. Ve a **APIs & Services → OAuth consent screen** (o «Google Auth Platform»):
   - Tipo **External**, nombre `Maayan Jésed` y un correo de soporte.
   - Permisos: `openid`, `email`, `profile`.
   - Publica la app (**In production**). Si no, solo pueden entrar los «usuarios de prueba».
3. Ve a **Credentials → Create credentials → OAuth client ID**:
   - Tipo **Web application**.
   - Authorized JavaScript origins: `https://andres2013b.github.io`
   - Authorized redirect URIs: `https://tcnewagyrlyllxkaazgu.supabase.co/auth/v1/callback`
4. Copia el **Client ID** y el **Client secret**.

## 3. Supabase: encender Google

Supabase → **Authentication → Sign In / Providers → Google**: Enable, pega el Client ID y el Client secret, y guarda.

## Cómo funciona para cada persona

- **Primera vez:** entra con Google y la página le pide **«Termina tu registro»**
  (rol, sección y grupo, o el correo de su hijo si es familia, o la clave si es maestro).
  Después ya entra directo, sin contraseña.
- **Ya tenía cuenta con contraseña y el mismo correo:** Supabase une las dos y conserva sus gotas y retos.
- **Coordinación** (correos en la tabla `moderators`): entra directo como coordinación.
- La contraseña de siempre sigue funcionando para quien la prefiera.

El «Client secret» nunca va en la página ni en GitHub: solo se pega en Supabase.
