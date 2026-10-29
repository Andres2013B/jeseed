-- ==========================================================
-- JESSED · Actualización 4: retos de maestros, ceremonia editable y copa de secciones
-- Pega TODO este archivo en Supabase > SQL Editor > New query > Run.
-- Se puede volver a correr sin problema.
-- ==========================================================

-- ---------------------------------------------------------- Retos de maestros
create table if not exists public.campaigns (
  id bigint generated always as identity primary key,
  title text not null check (char_length(title) between 3 and 60),
  description text not null check (char_length(description) between 10 and 160),
  icon text not null default '📣' check (char_length(icon) <= 8),
  category text not null,
  points int not null default 15 check (points between 5 and 20),
  ends_at date not null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.campaigns enable row level security;
drop policy if exists "retos maestros: ver" on public.campaigns;
create policy "retos maestros: ver" on public.campaigns for select to authenticated, anon using (true);
drop policy if exists "retos maestros: crear" on public.campaigns;
create policy "retos maestros: crear" on public.campaigns for insert to authenticated with check (public.is_moderator());
drop policy if exists "retos maestros: quitar" on public.campaigns;
create policy "retos maestros: quitar" on public.campaigns for delete to authenticated using (public.is_moderator());

-- ---------------------------------------------------------- Ajustes (ceremonia)
create table if not exists public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.settings enable row level security;
drop policy if exists "ajustes: ver" on public.settings;
create policy "ajustes: ver" on public.settings for select to authenticated, anon using (true);
drop policy if exists "ajustes: crear" on public.settings;
create policy "ajustes: crear" on public.settings for insert to authenticated with check (public.is_moderator());
drop policy if exists "ajustes: cambiar" on public.settings;
create policy "ajustes: cambiar" on public.settings for update to authenticated using (public.is_moderator()) with check (public.is_moderator());

-- ---------------------------------------------------------- Copa de secciones (mes actual)
create or replace function public.section_ranking()
returns table (section text, points bigint, actions bigint)
language sql stable security definer set search_path = public as $$
  select p.section, sum(c.points)::bigint, count(*)::bigint
  from public.user_challenges c join public.profiles p on p.id = c.user_id
  where c.status = 'completed'
    and p.section in ('kinder', 'primaria', 'secundaria', 'prepa')
    and c.completed_at >= date_trunc('month', now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City'
  group by p.section;
$$;
grant execute on function public.section_ranking() to anon, authenticated;
