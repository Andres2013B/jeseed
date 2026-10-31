-- ==========================================================
-- MAAYAN JÉSED · Base de datos (en el mismo Supabase de JESSED)
-- Pega TODO este archivo en Supabase > SQL Editor > New query > Run.
-- Se puede volver a correr sin problema. Usa tablas con prefijo mj_
-- para no mezclarse con las de JESSED.
--
-- Roles: alumno, familia, maestro y coordinación (los correos de la
-- tabla public.moderators). Reglas principales:
--   · Un alumno solo puede enviar sus acciones "pendientes": nunca
--     aprobarse ni darse gotas.
--   · La familia confirma los retos de casa de su hijo; el maestro, los
--     del colegio de su salón. Solo coordinación aprueba y da gotas.
--   · Las familias solo ven a su hijo; los maestros, a su salón.
--   · Los maestros entran con una clave de un solo uso que da coordinación.
-- ==========================================================

create table if not exists public.moderators (email text primary key check (email = lower(email)));

create or replace function public.is_moderator() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.moderators where email = lower(auth.jwt() ->> 'email'));
$$;

-- ---------------------------------------------------------- Cuentas
create table if not exists public.mj_accounts (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('alumno', 'familia', 'maestro', 'admin')),
  name text not null check (char_length(name) between 1 and 60),
  email text not null,
  sec text check (sec in ('Kinder', 'Primaria', 'Secundaria', 'Prepa')),
  grp text check (char_length(grp) <= 20),
  child uuid references public.mj_accounts (id) on delete set null,
  status text not null default 'approved' check (status in ('approved', 'pending', 'rejected')),
  created_at timestamptz not null default now()
);
create unique index if not exists mj_one_teacher_per_group on public.mj_accounts (sec, grp)
  where role = 'maestro' and status = 'approved';
alter table public.mj_accounts enable row level security;

create or replace function public.mj_me() returns public.mj_accounts
language sql stable security definer set search_path = public as $$
  select * from public.mj_accounts where id = auth.uid();
$$;

create or replace function public.mj_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_moderator() or exists (select 1 from public.mj_accounts where id = auth.uid() and role = 'admin');
$$;

-- ¿Puedo ver los datos de este alumno? (yo, mi familia, mi maestro o coordinación)
create or replace function public.mj_can_see(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    sid = auth.uid()
    or public.mj_is_admin()
    or exists (select 1 from public.mj_accounts f where f.id = auth.uid() and f.role = 'familia' and f.child = sid)
    or exists (select 1 from public.mj_accounts t join public.mj_accounts s on s.id = sid
               where t.id = auth.uid() and t.role = 'maestro' and t.status = 'approved'
                 and s.role = 'alumno' and s.sec = t.sec and s.grp = t.grp)
  );
$$;

-- ¿Soy alumno o la familia de este alumno? (pueden cambiar sus ajustes)
create or replace function public.mj_is_self_or_family(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (sid = auth.uid()
    or exists (select 1 from public.mj_accounts f where f.id = auth.uid() and f.role = 'familia' and f.child = sid));
$$;

drop policy if exists "mj_accounts: leer" on public.mj_accounts;
create policy "mj_accounts: leer" on public.mj_accounts for select to authenticated
  using (id = auth.uid() or public.mj_is_admin() or public.mj_can_see(id));
drop policy if exists "mj_accounts: coordinación" on public.mj_accounts;
create policy "mj_accounts: coordinación" on public.mj_accounts for update to authenticated
  using (public.mj_is_admin()) with check (public.mj_is_admin());

-- ---------------------------------------------------------- Estado de cada alumno
-- (retos aceptados, "me motiva", visitas, meta, modo Kínder, permisos, avisos)
create table if not exists public.mj_studs (
  id uuid primary key references public.mj_accounts (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.mj_studs enable row level security;
drop policy if exists "mj_studs: leer" on public.mj_studs;
create policy "mj_studs: leer" on public.mj_studs for select to authenticated using (public.mj_can_see(id));
drop policy if exists "mj_studs: cambiar" on public.mj_studs;
create policy "mj_studs: cambiar" on public.mj_studs for update to authenticated
  using (public.mj_is_self_or_family(id)) with check (public.mj_is_self_or_family(id));

-- Directorio del colegio: nombres, sección y salón (sin correos)
create or replace function public.mj_directory()
returns table (id uuid, role text, name text, sec text, grp text, status text, consent_top boolean)
language sql stable security definer set search_path = public as $$
  select a.id, a.role, a.name, a.sec, a.grp, a.status,
         coalesce((s.data -> 'consent' ->> 'top')::boolean, true)
  from public.mj_accounts a left join public.mj_studs s on s.id = a.id
  where auth.uid() is not null and a.status = 'approved';
$$;

-- ---------------------------------------------------------- Acciones (lo que cuenta el alumno)
create table if not exists public.mj_subs (
  id text primary key check (char_length(id) <= 40),
  owner uuid not null references public.mj_accounts (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  pts int not null default 1 check (pts between 0 and 5),
  sec text,
  val jsonb,
  data jsonb not null default '{}'::jsonb,   -- título, relato, tema, reto, anónimo, comentario, fecha
  photo text,                                 -- foto reducida (solo mientras se revisa, o si se aprobó para mostrarse)
  show_photo boolean not null default false,
  at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mj_subs_owner on public.mj_subs (owner);
create index if not exists mj_subs_status on public.mj_subs (status);
alter table public.mj_subs enable row level security;

-- Las acciones aprobadas las ve toda la comunidad (Historias, Top 10, salones);
-- las demás, solo el alumno, su familia, su maestro y coordinación.
drop policy if exists "mj_subs: leer" on public.mj_subs;
create policy "mj_subs: leer" on public.mj_subs for select to authenticated
  using (status = 'approved' or public.mj_can_see(owner));
drop policy if exists "mj_subs: enviar" on public.mj_subs;
create policy "mj_subs: enviar" on public.mj_subs for insert to authenticated
  with check (owner = auth.uid() and exists (select 1 from public.mj_accounts where id = auth.uid() and role = 'alumno'));
drop policy if exists "mj_subs: cambiar" on public.mj_subs;
create policy "mj_subs: cambiar" on public.mj_subs for update to authenticated
  using (public.mj_can_see(owner)) with check (public.mj_can_see(owner));

create or replace function public.mj_subs_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.owner := auth.uid();
  new.status := 'pending';
  new.val := null;
  new.pts := least(greatest(coalesce(new.pts, 1), 1), 3);
  new.sec := (select sec from public.mj_accounts where id = auth.uid());
  new.data := new.data - 'comment';
  new.at := now();
  new.updated_at := now();
  if (select count(*) from public.mj_subs where owner = auth.uid() and at > now() - interval '1 day') >= 10 then
    raise exception 'Llegaste al límite de acciones por hoy. ¡Mañana puedes seguir!';
  end if;
  return new;
end $$;
drop trigger if exists mj_subs_before_insert on public.mj_subs;
create trigger mj_subs_before_insert before insert on public.mj_subs
  for each row execute function public.mj_subs_before_insert();

create or replace function public.mj_subs_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare me public.mj_accounts := public.mj_me();
begin
  if auth.uid() is null then return new; end if;              -- cambios desde el panel de Supabase
  new.id := old.id; new.owner := old.owner; new.sec := old.sec; new.updated_at := now();

  -- Coordinación: aprueba o regresa, ajusta gotas y comenta
  if public.mj_is_admin() then
    if new.status = 'approved' and not new.show_photo then new.photo := null; end if;
    if new.status = 'rejected' then new.photo := case when new.show_photo then new.photo end; end if;
    return new;
  end if;

  -- El alumno: solo puede volver a enviar una acción que le regresaron
  if old.owner = auth.uid() then
    if old.status <> 'rejected' or new.status <> 'pending' then
      raise exception 'Esta acción ya está en revisión o fue aprobada.';
    end if;
    new.pts := old.pts; new.val := null; new.at := now();
    new.data := (new.data - 'comment');
    return new;
  end if;

  -- Familia o maestro: solo confirman ("lo vi" / "no me consta")
  if me.role in ('familia', 'maestro') then
    if old.status <> 'pending' or old.val is not null then
      raise exception 'Esta acción ya fue confirmada.';
    end if;
    new.status := old.status; new.pts := old.pts; new.data := old.data; new.photo := old.photo;
    new.show_photo := old.show_photo; new.at := old.at;
    new.val := jsonb_build_object('by', me.role, 'ok', coalesce((new.val ->> 'ok')::boolean, false),
                                  'at', (extract(epoch from now()) * 1000)::bigint);
    return new;
  end if;

  raise exception 'Cambio no permitido.';
end $$;
drop trigger if exists mj_subs_before_update on public.mj_subs;
create trigger mj_subs_before_update before update on public.mj_subs
  for each row execute function public.mj_subs_before_update();

-- ---------------------------------------------------------- Servicio social (Prepa)
create table if not exists public.mj_hours (
  id text primary key check (char_length(id) <= 40),
  owner uuid not null references public.mj_accounts (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  data jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
alter table public.mj_hours enable row level security;
drop policy if exists "mj_hours: leer" on public.mj_hours;
create policy "mj_hours: leer" on public.mj_hours for select to authenticated using (public.mj_can_see(owner));
drop policy if exists "mj_hours: registrar" on public.mj_hours;
create policy "mj_hours: registrar" on public.mj_hours for insert to authenticated
  with check (owner = auth.uid() and status = 'pending'
              and exists (select 1 from public.mj_accounts where id = auth.uid() and role = 'alumno'));
drop policy if exists "mj_hours: confirmar" on public.mj_hours;
create policy "mj_hours: confirmar" on public.mj_hours for update to authenticated
  using (public.mj_is_admin()) with check (public.mj_is_admin());

-- ---------------------------------------------------------- Notificaciones (campana)
create table if not exists public.mj_notifs (
  id bigint generated always as identity primary key,
  owner uuid not null references public.mj_accounts (id) on delete cascade,
  t text not null check (char_length(t) <= 300),
  read boolean not null default false,
  at timestamptz not null default now()
);
create index if not exists mj_notifs_owner on public.mj_notifs (owner, at);
alter table public.mj_notifs enable row level security;
drop policy if exists "mj_notifs: leer" on public.mj_notifs;
create policy "mj_notifs: leer" on public.mj_notifs for select to authenticated using (public.mj_is_self_or_family(owner));
drop policy if exists "mj_notifs: enviar" on public.mj_notifs;
create policy "mj_notifs: enviar" on public.mj_notifs for insert to authenticated with check (public.mj_can_see(owner));
drop policy if exists "mj_notifs: leídas" on public.mj_notifs;
create policy "mj_notifs: leídas" on public.mj_notifs for update to authenticated
  using (public.mj_is_self_or_family(owner)) with check (public.mj_is_self_or_family(owner));

-- ---------------------------------------------------------- Avisos, propuestas, registro, destacados, retos nuevos
-- kind: aviso | proposal | log | remind | featured | custom
create table if not exists public.mj_items (
  kind text not null check (kind in ('aviso', 'proposal', 'log', 'remind', 'featured', 'custom')),
  id text not null check (char_length(id) <= 60),
  author uuid default auth.uid() references public.mj_accounts (id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (kind, id)
);
alter table public.mj_items enable row level security;
drop policy if exists "mj_items: leer" on public.mj_items;
create policy "mj_items: leer" on public.mj_items for select to authenticated using (
  kind in ('aviso', 'featured', 'custom')
  or public.mj_is_admin()
  or author = auth.uid()
  or (kind = 'proposal' and data ->> 'status' = 'approved'));
drop policy if exists "mj_items: crear" on public.mj_items;
create policy "mj_items: crear" on public.mj_items for insert to authenticated with check (
  author = auth.uid() and (
    public.mj_is_admin()
    or kind = 'log'
    or (kind = 'proposal' and (public.mj_me()).role in ('alumno', 'maestro') and coalesce(data ->> 'status', 'pending') = 'pending')
    or (kind in ('aviso', 'remind') and (public.mj_me()).role = 'maestro' and (public.mj_me()).status = 'approved'
        and (kind = 'remind' or (data ->> 'to' = (public.mj_me()).grp and data ->> 'sec' = (public.mj_me()).sec)))
  ));
drop policy if exists "mj_items: coordinación" on public.mj_items;
create policy "mj_items: coordinación" on public.mj_items for update to authenticated
  using (public.mj_is_admin()) with check (public.mj_is_admin());
drop policy if exists "mj_items: borrar" on public.mj_items;
create policy "mj_items: borrar" on public.mj_items for delete to authenticated using (public.mj_is_admin());

-- ---------------------------------------------------------- Claves de maestro
create table if not exists public.mj_invites (
  code text primary key,
  sec text not null,
  grp text not null,
  used uuid references public.mj_accounts (id) on delete set null,
  at timestamptz not null default now()
);
alter table public.mj_invites enable row level security;
drop policy if exists "mj_invites: coordinación" on public.mj_invites;
create policy "mj_invites: coordinación" on public.mj_invites for all to authenticated
  using (public.mj_is_admin()) with check (public.mj_is_admin());

-- ---------------------------------------------------------- Ajustes y catálogo de retos
create table if not exists public.mj_settings (
  key text primary key check (key in ('settings', 'cat')),
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.mj_settings enable row level security;
drop policy if exists "mj_settings: leer" on public.mj_settings;
create policy "mj_settings: leer" on public.mj_settings for select to anon, authenticated using (true);
drop policy if exists "mj_settings: coordinación" on public.mj_settings;
create policy "mj_settings: coordinación" on public.mj_settings for all to authenticated
  using (public.mj_is_admin()) with check (public.mj_is_admin());

-- ---------------------------------------------------------- Registro
-- Al crear la cuenta se guardan los datos del formulario; la cuenta del colegio
-- se arma la primera vez que la persona entra (ya con su correo confirmado).
create or replace function public.mj_finish_registration() returns public.mj_accounts
language plpgsql security definer set search_path = public as $$
declare
  u auth.users;
  m jsonb;
  r text;
  acc public.mj_accounts;
  inv public.mj_invites;
  kid public.mj_accounts;
begin
  select * into acc from public.mj_accounts where id = auth.uid();
  if found then return acc; end if;
  select * into u from auth.users where id = auth.uid();
  if not found then raise exception 'Primero entra con tu cuenta.'; end if;
  m := coalesce(u.raw_user_meta_data, '{}'::jsonb);
  r := coalesce(m ->> 'mj_role', '');

  if exists (select 1 from public.moderators where email = lower(u.email)) then
    insert into public.mj_accounts (id, role, name, email)
    values (u.id, 'admin', left(coalesce(nullif(m ->> 'mj_name', ''), 'Coordinación'), 60), lower(u.email))
    returning * into acc;
    return acc;
  end if;

  if r = 'alumno' then
    if coalesce(m ->> 'mj_sec', '') not in ('Kinder', 'Primaria', 'Secundaria', 'Prepa') then
      raise exception 'Elige tu sección.';
    end if;
    insert into public.mj_accounts (id, role, name, email, sec, grp)
    values (u.id, 'alumno', left(coalesce(nullif(m ->> 'mj_name', ''), split_part(u.email, '@', 1)), 60),
            lower(u.email), m ->> 'mj_sec', left(m ->> 'mj_grp', 20))
    returning * into acc;
    insert into public.mj_studs (id, data) values (u.id, '{}'::jsonb) on conflict do nothing;
    return acc;
  end if;

  if r = 'familia' then
    select * into kid from public.mj_accounts
      where role = 'alumno' and email = lower(coalesce(m ->> 'mj_kid', ''));
    if not found then
      raise exception 'No encontramos a ese alumno. Pídele que se registre primero con su correo.';
    end if;
    insert into public.mj_accounts (id, role, name, email, child)
    values (u.id, 'familia', left(coalesce(nullif(m ->> 'mj_name', ''), 'Familia'), 60), lower(u.email), kid.id)
    returning * into acc;
    return acc;
  end if;

  if r = 'maestro' then
    select * into inv from public.mj_invites
      where code = upper(regexp_replace(coalesce(m ->> 'mj_code', ''), '\s', '', 'g')) and used is null
      for update;
    if not found then raise exception 'Esa clave no es válida o ya se usó. Pídela a coordinación.'; end if;
    if exists (select 1 from public.mj_accounts where role = 'maestro' and status = 'approved'
               and sec = inv.sec and grp = inv.grp) then
      raise exception '% de % ya tiene maestro.', inv.grp, inv.sec;
    end if;
    insert into public.mj_accounts (id, role, name, email, sec, grp, status)
    values (u.id, 'maestro', left(coalesce(nullif(m ->> 'mj_name', ''), 'Maestro'), 60), lower(u.email),
            inv.sec, inv.grp, 'approved')
    returning * into acc;
    update public.mj_invites set used = u.id where code = inv.code;
    insert into public.mj_items (kind, id, author, data)
    values ('log', 'reg-' || u.id, u.id, jsonb_build_object(
      'title', 'Cuenta de maestro activada: ' || acc.name, 'status', 'approved',
      'comment', 'Clave ' || inv.code || ' · ' || inv.sec || ' ' || inv.grp, 'by', 'Registro',
      'at', (extract(epoch from now()) * 1000)::bigint));
    return acc;
  end if;

  raise exception 'No encontramos los datos de tu registro. Crea tu cuenta otra vez.';
end $$;
grant execute on function public.mj_finish_registration() to authenticated;

-- ¿Ese correo ya tiene cuenta de alumno? (para que la familia sepa si puede registrarse)
create or replace function public.mj_student_exists(mail text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.mj_accounts where role = 'alumno' and email = lower(trim(mail)));
$$;
grant execute on function public.mj_student_exists(text) to anon, authenticated;

-- Cifras públicas para la portada (sin datos personales)
create or replace function public.mj_public_stats()
returns table (sec text, pts bigint)
language sql stable security definer set search_path = public as $$
  select s.sec, sum(s.pts)::bigint from public.mj_subs s
  where s.status = 'approved'
    and s.at >= make_date(extract(year from now())::int - case when extract(month from now()) < 8 then 1 else 0 end, 8, 1)
  group by s.sec;
$$;
grant execute on function public.mj_public_stats() to anon, authenticated;

grant execute on function public.mj_directory() to authenticated;
grant execute on function public.mj_me() to authenticated;
grant execute on function public.mj_is_admin() to authenticated;
grant execute on function public.mj_can_see(uuid) to authenticated;
grant execute on function public.mj_is_self_or_family(uuid) to authenticated;

-- ¿La clave de maestro es válida? (para avisar antes de crear la cuenta)
create or replace function public.mj_check_code(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.mj_invites i
                 where i.code = upper(regexp_replace(coalesce(c, ''), '\s', '', 'g')) and i.used is null
                   and not exists (select 1 from public.mj_accounts a where a.role = 'maestro' and a.status = 'approved'
                                   and a.sec = i.sec and a.grp = i.grp));
$$;
grant execute on function public.mj_check_code(text) to anon, authenticated;

-- ---------------------------------------------------------- COORDINACIÓN
-- Los correos de public.moderators entran como coordinación. Ya están los de JESSED;
-- para agregar a alguien más:
-- insert into public.moderators (email) values ('nombre@olamiort.edu.mx') on conflict do nothing;

-- Cuántos "Me motiva" tiene cada historia
create or replace function public.mj_like_counts() returns table (id text, n bigint)
language sql stable security definer set search_path = public as $$
  select x, count(*) from public.mj_studs, jsonb_array_elements_text(coalesce(data -> 'likes', '[]'::jsonb)) as x
  where auth.uid() is not null and jsonb_typeof(coalesce(data -> 'likes', '[]'::jsonb)) = 'array'
  group by x;
$$;
grant execute on function public.mj_like_counts() to authenticated;
