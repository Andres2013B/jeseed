-- ==========================================================
-- JESSED · Base de datos (Supabase)
-- Pega TODO este archivo en Supabase > SQL Editor > New query > Run.
-- Se puede volver a correr sin problema.
--
-- Reglas que protege la base de datos (aunque alguien modifique la página):
--   · Solo se pueden crear cuentas con correo @olamiort.edu.mx
--   · Solo los correos de la tabla "moderators" son moderadores
--   · Nadie se puede dar puntos solo: toda acción queda "en verificación"
--     hasta que un moderador la aprueba, y nadie aprueba sus propias acciones
--   · 15 minutos mínimo entre aceptar un reto y enviarlo, máximo 5 acciones
--     por día y una descripción de al menos 20 caracteres
-- ==========================================================

-- ---------------------------------------------------------- Moderadores
create table if not exists public.moderators (
  email text primary key check (email = lower(email))
);
alter table public.moderators enable row level security;
-- (sin políticas: nadie la lee ni la cambia desde la página; se edita aquí en Supabase)

create or replace function public.is_moderator() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.moderators where email = lower(auth.jwt() ->> 'email'));
$$;

-- ---------------------------------------------------------- Perfiles
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "profiles: leer" on public.profiles;
create policy "profiles: leer" on public.profiles for select to authenticated using (true);

-- Solo correos de la escuela + crear el perfil al registrarse
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if lower(new.email) not like '%@olamiort.edu.mx' then
    raise exception 'Solo puedes entrar con tu correo de la escuela (@olamiort.edu.mx).';
  end if;
  insert into public.profiles (id, display_name, is_admin)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)), 40),
    exists (select 1 from public.moderators where email = lower(new.email))
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.check_school_email() returns trigger
language plpgsql as $$
begin
  if lower(new.email) not like '%@olamiort.edu.mx' then
    raise exception 'Solo puedes entrar con tu correo de la escuela (@olamiort.edu.mx).';
  end if;
  return new;
end $$;

drop trigger if exists check_school_email on auth.users;
create trigger check_school_email before insert or update of email on auth.users
  for each row execute function public.check_school_email();

-- Mantener is_admin al día cuando se agregan o quitan moderadores
create or replace function public.sync_moderators() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles p set is_admin = exists (
    select 1 from public.moderators m join auth.users u on lower(u.email) = m.email where u.id = p.id
  );
  return null;
end $$;

drop trigger if exists sync_moderators on public.moderators;
create trigger sync_moderators after insert or update or delete on public.moderators
  for each statement execute function public.sync_moderators();

-- ---------------------------------------------------------- Retos de cada alumno
create table if not exists public.user_challenges (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  action_id text not null,
  category text not null,
  title text not null check (char_length(title) between 1 and 120),
  points int not null default 0,
  is_daily boolean not null default false,
  status text not null default 'accepted' check (status in ('accepted', 'review', 'completed', 'rejected')),
  evidence text check (evidence is null or char_length(evidence) <= 280),
  accepted_at timestamptz not null default now(),
  completed_at timestamptz,
  verified_at timestamptz,
  verified_by uuid references auth.users (id)
);
create unique index if not exists user_challenges_one_active
  on public.user_challenges (user_id, action_id) where status = 'accepted' and action_id <> 'custom';
create index if not exists user_challenges_review on public.user_challenges (status, completed_at);

alter table public.user_challenges enable row level security;
drop policy if exists "retos: leer" on public.user_challenges;
create policy "retos: leer" on public.user_challenges for select to authenticated
  using (user_id = auth.uid() or public.is_moderator());
drop policy if exists "retos: crear" on public.user_challenges;
create policy "retos: crear" on public.user_challenges for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists "retos: actualizar" on public.user_challenges;
create policy "retos: actualizar" on public.user_challenges for update to authenticated
  using (user_id = auth.uid() or public.is_moderator());
drop policy if exists "retos: quitar" on public.user_challenges;
create policy "retos: quitar" on public.user_challenges for delete to authenticated
  using (user_id = auth.uid() and status = 'accepted');

-- Al aceptar un reto: siempre empieza "en curso", sin puntos regalados
create or replace function public.challenge_before_insert() returns trigger
language plpgsql as $$
begin
  new.user_id := auth.uid();
  new.status := 'accepted';
  new.accepted_at := now();
  new.completed_at := null;
  new.verified_at := null;
  new.verified_by := null;
  new.is_daily := false;
  new.evidence := null;
  new.points := case when new.action_id = 'custom' then 10 else least(greatest(new.points, 0), 20) end;
  return new;
end $$;

drop trigger if exists challenge_before_insert on public.user_challenges;
create trigger challenge_before_insert before insert on public.user_challenges
  for each row execute function public.challenge_before_insert();

-- Cambios de estado permitidos
create or replace function public.challenge_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  next_status text := new.status;
  sent_today int;
  is_daily boolean := coalesce(new.is_daily, false);
  evidence text := trim(coalesce(new.evidence, ''));
begin
  -- 0) Cambios hechos directo desde el panel de Supabase (no desde la página)
  if auth.uid() is null then
    return new;
  end if;

  -- 1) Moderador revisando la acción de OTRA persona: solo puede aprobar o rechazar
  if public.is_moderator() and old.user_id <> auth.uid() then
    if old.status <> 'review' or next_status not in ('completed', 'rejected') then
      raise exception 'Esta acción ya fue revisada.';
    end if;
    new := old;                       -- todo lo demás se queda como estaba
    new.status := next_status;
    new.verified_at := now();
    new.verified_by := auth.uid();
    return new;
  end if;

  -- 2) El alumno enviando SU reto a verificación
  if old.user_id = auth.uid() then
    if old.status <> 'accepted' or next_status <> 'review' then
      raise exception 'Este reto ya fue enviado.';
    end if;
    if old.action_id <> 'custom' and now() - old.accepted_at < interval '15 minutes' then
      raise exception 'Las buenas acciones toman tiempo. Espera 15 minutos después de aceptar el reto.';
    end if;
    if char_length(evidence) < 20 then
      raise exception 'Cuéntanos un poco más (mínimo 20 caracteres).';
    end if;
    select count(*) into sent_today from public.user_challenges
      where user_id = old.user_id and status in ('review', 'completed')
        and completed_at >= date_trunc('day', now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City';
    if sent_today >= 5 then
      raise exception 'Ya enviaste 5 acciones hoy. ¡Mañana puedes seguir sumando!';
    end if;
    new := old;                       -- solo se aceptan estos cambios
    new.status := 'review';
    new.evidence := evidence;
    new.completed_at := now();
    new.is_daily := is_daily and old.action_id <> 'custom';
    new.points := case when old.action_id = 'custom' then 10
                       else old.points + case when new.is_daily then 10 else 0 end end;
    return new;
  end if;

  raise exception 'Cambio no permitido.';
end $$;

drop trigger if exists challenge_before_update on public.user_challenges;
create trigger challenge_before_update before update on public.user_challenges
  for each row execute function public.challenge_before_update();

-- ---------------------------------------------------------- Comunidad
create table if not exists public.posts (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name text not null,
  content text not null check (char_length(content) between 5 and 280),
  category text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);
alter table public.posts enable row level security;
drop policy if exists "posts: leer" on public.posts;
create policy "posts: leer" on public.posts for select to authenticated, anon
  using (status = 'approved' or user_id = auth.uid() or public.is_moderator());
drop policy if exists "posts: crear" on public.posts;
create policy "posts: crear" on public.posts for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "posts: moderar" on public.posts;
create policy "posts: moderar" on public.posts for update to authenticated using (public.is_moderator());
drop policy if exists "posts: borrar" on public.posts;
create policy "posts: borrar" on public.posts for delete to authenticated
  using (user_id = auth.uid() or public.is_moderator());

create or replace function public.post_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.status := 'pending';
  new.created_at := now();
  select display_name into new.author_name from public.profiles where id = auth.uid();
  if (select count(*) from public.posts where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Llegaste al límite de publicaciones por hora. ¡Intenta más tarde!';
  end if;
  return new;
end $$;
drop trigger if exists post_before_insert on public.posts;
create trigger post_before_insert before insert on public.posts
  for each row execute function public.post_before_insert();

create table if not exists public.post_likes (
  post_id bigint not null references public.posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (post_id, user_id)
);
alter table public.post_likes enable row level security;
drop policy if exists "likes: leer" on public.post_likes;
create policy "likes: leer" on public.post_likes for select to authenticated, anon using (true);
drop policy if exists "likes: dar" on public.post_likes;
create policy "likes: dar" on public.post_likes for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "likes: quitar" on public.post_likes;
create policy "likes: quitar" on public.post_likes for delete to authenticated using (user_id = auth.uid());

create table if not exists public.post_reports (
  post_id bigint not null references public.posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.post_reports enable row level security;
drop policy if exists "reportes: leer" on public.post_reports;
create policy "reportes: leer" on public.post_reports for select to authenticated
  using (user_id = auth.uid() or public.is_moderator());
drop policy if exists "reportes: crear" on public.post_reports;
create policy "reportes: crear" on public.post_reports for insert to authenticated with check (user_id = auth.uid());

-- 3 reportes → la publicación se oculta hasta que la revise un moderador
create or replace function public.post_reported() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.post_reports where post_id = new.post_id) >= 3 then
    update public.posts set status = 'pending' where id = new.post_id;
  end if;
  return new;
end $$;
drop trigger if exists post_reported on public.post_reports;
create trigger post_reported after insert on public.post_reports
  for each row execute function public.post_reported();

-- ---------------------------------------------------------- Destacados y estadísticas
create or replace function public.get_leaderboard()
returns table (display_name text, points bigint, actions bigint)
language sql stable security definer set search_path = public as $$
  select p.display_name, sum(c.points)::bigint, count(*)::bigint
  from public.user_challenges c join public.profiles p on p.id = c.user_id
  where c.status = 'completed' and c.completed_at > now() - interval '7 days'
  group by p.display_name
  order by 2 desc
  limit 10;
$$;

create or replace function public.community_stats()
returns table (total_actions bigint, total_members bigint)
language sql stable security definer set search_path = public as $$
  select (select count(*) from public.user_challenges where status = 'completed'),
         (select count(*) from public.profiles);
$$;

grant execute on function public.get_leaderboard() to anon, authenticated;
grant execute on function public.community_stats() to anon, authenticated;

-- ---------------------------------------------------------- MODERADORES (edita esta lista)
-- Escribe aquí los correos de los maestros que van a revisar, en minúsculas.
-- Para agregar o quitar uno después, cambia la lista y vuelve a correr solo estas líneas.
insert into public.moderators (email) values
  ('maestro1@olamiort.edu.mx')
on conflict do nothing;
