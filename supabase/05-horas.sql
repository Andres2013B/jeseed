-- ==========================================================
-- JESSED · Actualización 5: horas de servicio social
-- Pega TODO este archivo en Supabase > SQL Editor > New query > Run.
-- Se puede volver a correr sin problema.
--
-- Las horas y la fecha de cada acción las pone el moderador al aprobarla
-- (de 0 a 12 horas; la fecha no puede ser futura ni de hace más de un año).
-- Los alumnos no pueden cambiarlas.
-- ==========================================================

alter table public.user_challenges add column if not exists hours numeric(4,1) not null default 0
  check (hours between 0 and 12);
alter table public.user_challenges add column if not exists activity_date date;

create or replace function public.challenge_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  next_status text := new.status;
  sent_today int;
  is_daily boolean := coalesce(new.is_daily, false);
  evidence text := trim(coalesce(new.evidence, ''));
  photo text := new.photo_path;
  hrs numeric := new.hours;
  act_date date := new.activity_date;
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
    if next_status = 'completed' then
      -- Horas y fecha las pone el moderador
      new.hours := round(least(greatest(coalesce(hrs, 0), 0), 12) * 2) / 2;
      new.activity_date := case
        when act_date between current_date - 365 and current_date then act_date
        else (old.completed_at at time zone 'America/Mexico_City')::date end;
    end if;
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
    new.photo_path := case when photo like auth.uid()::text || '/%' then photo end;
    new.completed_at := now();
    new.is_daily := is_daily and old.action_id <> 'custom';
    new.points := case when old.action_id = 'custom' then 10
                       else old.points + case when new.is_daily then 10 else 0 end end;
    return new;
  end if;

  raise exception 'Cambio no permitido.';
end $$;
