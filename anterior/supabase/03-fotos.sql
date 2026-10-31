-- ==========================================================
-- JESSED · Actualización 3: fotos en publicaciones y galería de la comunidad
-- Pega TODO este archivo en Supabase > SQL Editor > New query > Run.
-- Se puede volver a correr sin problema.
--
-- Las fotos son privadas mientras la publicación está en revisión.
-- Cuando un moderador la aprueba, cualquiera puede verla (en la publicación y en la galería).
-- ==========================================================

alter table public.posts add column if not exists photo_path text;

create or replace function public.post_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.status := 'pending';
  new.created_at := now();
  new.anonymous := coalesce(new.anonymous, false);
  -- Solo se acepta una foto que esté en la carpeta de quien publica
  new.photo_path := case when new.photo_path like auth.uid()::text || '/%' then new.photo_path end;
  select case when new.anonymous then 'Anónimo' else display_name end, section
    into new.author_name, new.section
    from public.profiles where id = auth.uid();
  if (select count(*) from public.posts where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Llegaste al límite de publicaciones por hora. ¡Intenta más tarde!';
  end if;
  return new;
end $$;

-- ¿Esta foto pertenece a una publicación aprobada?
create or replace function public.is_approved_post_photo(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.posts where photo_path = p and status = 'approved');
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('publicaciones', 'publicaciones', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "publicaciones: subir" on storage.objects;
create policy "publicaciones: subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'publicaciones' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "publicaciones: ver" on storage.objects;
create policy "publicaciones: ver" on storage.objects for select to authenticated, anon
  using (
    bucket_id = 'publicaciones' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_moderator()
      or public.is_approved_post_photo(name)
    )
  );
