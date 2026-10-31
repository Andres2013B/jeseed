-- ==========================================================
-- JESSED · Actualización 2: secciones, anónimo, comentarios, opiniones y galería
-- Pega TODO este archivo en Supabase > SQL Editor > New query > Run.
-- Se puede volver a correr sin problema.
-- ==========================================================

-- ---------------------------------------------------------- Sección de cada persona
alter table public.profiles add column if not exists section text
  check (section is null or section in ('kinder', 'primaria', 'secundaria', 'prepa', 'staff'));

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare sec text := new.raw_user_meta_data ->> 'section';
begin
  insert into public.profiles (id, display_name, is_admin, section)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)), 40),
    exists (select 1 from public.moderators where email = lower(new.email)),
    case when sec in ('kinder', 'primaria', 'secundaria', 'prepa', 'staff') then sec end
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Cada quien puede cambiar SOLO su sección (no su nombre ni si es moderador)
drop policy if exists "profiles: editar mi seccion" on public.profiles;
create policy "profiles: editar mi seccion" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.profile_before_update() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null then
    new.is_admin := old.is_admin;
    new.display_name := old.display_name;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
drop trigger if exists profile_before_update on public.profiles;
create trigger profile_before_update before update on public.profiles
  for each row execute function public.profile_before_update();

-- ---------------------------------------------------------- Publicaciones: sección y anónimo
alter table public.posts add column if not exists section text;
alter table public.posts add column if not exists anonymous boolean not null default false;

create or replace function public.post_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.status := 'pending';
  new.created_at := now();
  new.anonymous := coalesce(new.anonymous, false);
  select case when new.anonymous then 'Anónimo' else display_name end, section
    into new.author_name, new.section
    from public.profiles where id = auth.uid();
  if (select count(*) from public.posts where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Llegaste al límite de publicaciones por hora. ¡Intenta más tarde!';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------- Comentarios
create table if not exists public.post_comments (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name text not null,
  content text not null check (char_length(content) between 2 and 280),
  created_at timestamptz not null default now()
);
create index if not exists post_comments_post on public.post_comments (post_id, created_at);
alter table public.post_comments enable row level security;

drop policy if exists "comentarios: leer" on public.post_comments;
create policy "comentarios: leer" on public.post_comments for select to authenticated, anon
  using (exists (select 1 from public.posts p where p.id = post_id and p.status = 'approved') or public.is_moderator());
drop policy if exists "comentarios: escribir" on public.post_comments;
create policy "comentarios: escribir" on public.post_comments for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id and p.status = 'approved'));
drop policy if exists "comentarios: borrar" on public.post_comments;
create policy "comentarios: borrar" on public.post_comments for delete to authenticated
  using (user_id = auth.uid() or public.is_moderator());

create or replace function public.comment_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.created_at := now();
  select display_name into new.author_name from public.profiles where id = auth.uid();
  if (select count(*) from public.post_comments where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Llegaste al límite de comentarios por hora. ¡Intenta más tarde!';
  end if;
  return new;
end $$;
drop trigger if exists comment_before_insert on public.post_comments;
create trigger comment_before_insert before insert on public.post_comments
  for each row execute function public.comment_before_insert();

-- ---------------------------------------------------------- Opiniones (solo las leen los moderadores)
create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  author_name text not null default 'Visitante',
  content text not null check (char_length(content) between 5 and 500),
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;
drop policy if exists "opiniones: enviar" on public.feedback;
create policy "opiniones: enviar" on public.feedback for insert to authenticated, anon
  with check (user_id is not distinct from auth.uid());
drop policy if exists "opiniones: leer" on public.feedback;
create policy "opiniones: leer" on public.feedback for select to authenticated using (public.is_moderator());

create or replace function public.feedback_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.created_at := now();
  new.author_name := coalesce((select display_name from public.profiles where id = auth.uid()), 'Visitante');
  return new;
end $$;
drop trigger if exists feedback_before_insert on public.feedback;
create trigger feedback_before_insert before insert on public.feedback
  for each row execute function public.feedback_before_insert();

-- ---------------------------------------------------------- Galería "Jesed en acción"
create table if not exists public.gallery (
  id bigint generated always as identity primary key,
  path text not null,
  title text not null check (char_length(title) between 2 and 40),
  caption text not null default '' check (char_length(caption) <= 90),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.gallery enable row level security;
drop policy if exists "galeria: ver" on public.gallery;
create policy "galeria: ver" on public.gallery for select to authenticated, anon using (true);
drop policy if exists "galeria: agregar" on public.gallery;
create policy "galeria: agregar" on public.gallery for insert to authenticated with check (public.is_moderator());
drop policy if exists "galeria: quitar" on public.gallery;
create policy "galeria: quitar" on public.gallery for delete to authenticated using (public.is_moderator());

-- Las fotos de la galería son públicas (las elige un moderador)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('galeria', 'galeria', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "galeria: subir" on storage.objects;
create policy "galeria: subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'galeria' and public.is_moderator());
drop policy if exists "galeria: borrar archivo" on storage.objects;
create policy "galeria: borrar archivo" on storage.objects for delete to authenticated
  using (bucket_id = 'galeria' and public.is_moderator());
