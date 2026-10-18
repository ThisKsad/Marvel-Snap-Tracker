-- PIN-Schutz für den Marvel Snap Tracker.
-- Danach gibt es keinen direkten Tabellenzugriff mehr über den öffentlichen Schlüssel.
-- Alles läuft über Funktionen, die zuerst den PIN prüfen.
-- Nach 10 falschen Versuchen innerhalb von 10 Minuten ist alles für 10 Minuten gesperrt.

-- 1) Direkten Zugriff auf die Spieletabelle sperren (RLS bleibt an, ohne Policies = kein Zugriff)
drop policy if exists snap_matches_select on public.snap_matches;
drop policy if exists snap_matches_insert on public.snap_matches;
drop policy if exists snap_matches_update on public.snap_matches;
drop policy if exists snap_matches_delete on public.snap_matches;

-- 2) PIN (gesalzen und gehasht) und Fehlversuche
create table if not exists public.snap_settings (
  id        int primary key default 1 check (id = 1),
  pin_salt  text not null,
  pin_hash  text not null,
  updated_at timestamptz not null default now()
);
alter table public.snap_settings enable row level security;

create table if not exists public.snap_auth_log (
  at timestamptz not null default now(),
  ok boolean not null
);
alter table public.snap_auth_log enable row level security;

create or replace function public.snap_hash(salt text, pin text)
returns text language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(salt || ':' || pin, 'UTF8')), 'hex');
$$;
revoke execute on function public.snap_hash(text, text) from public, anon, authenticated;

-- Liefert 'ok', 'no_pin', 'wrong_pin' oder 'locked'
create or replace function public.snap_check(pin text)
returns text language plpgsql security definer set search_path = public as $$
declare s snap_settings;
begin
  delete from snap_auth_log where at < now() - interval '1 day';
  if (select count(*) from snap_auth_log where not ok and at > now() - interval '10 minutes') >= 10 then
    return 'locked';
  end if;
  select * into s from snap_settings where id = 1;
  if not found then return 'no_pin'; end if;
  if pin is null or snap_hash(s.pin_salt, pin) <> s.pin_hash then
    insert into snap_auth_log (ok) values (false);
    return 'wrong_pin';
  end if;
  return 'ok';
end $$;
revoke execute on function public.snap_check(text) from public, anon, authenticated;

-- 3) Bisherige Import-Funktion wird intern; nach außen nur noch mit PIN
do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'snap_ingest' and pg_get_function_identity_arguments(p.oid) = 'payload jsonb') then
    alter function public.snap_ingest(jsonb) rename to snap_ingest_core;
  end if;
end $$;
revoke execute on function public.snap_ingest_core(jsonb) from public, anon, authenticated;

create or replace function public.snap_ingest(payload jsonb, pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare st text := snap_check(pin);
begin
  if st <> 'ok' then return jsonb_build_object('status', st); end if;
  return snap_ingest_core(payload);
end $$;

-- 4) Funktionen für die Website
create or replace function public.snap_setup_pin(new_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare salt text := md5(random()::text || clock_timestamp()::text);
begin
  if exists (select 1 from snap_settings) then return jsonb_build_object('status', 'exists'); end if;
  if new_pin is null or length(new_pin) < 4 then return jsonb_build_object('status', 'too_short'); end if;
  insert into snap_settings (id, pin_salt, pin_hash) values (1, salt, snap_hash(salt, new_pin));
  return jsonb_build_object('status', 'ok');
end $$;

create or replace function public.snap_change_pin(pin text, new_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare st text := snap_check(pin); salt text := md5(random()::text || clock_timestamp()::text);
begin
  if st <> 'ok' then return jsonb_build_object('status', st); end if;
  if new_pin is null or length(new_pin) < 4 then return jsonb_build_object('status', 'too_short'); end if;
  update snap_settings set pin_salt = salt, pin_hash = snap_hash(salt, new_pin), updated_at = now() where id = 1;
  return jsonb_build_object('status', 'ok');
end $$;

create or replace function public.snap_list(pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare st text := snap_check(pin);
begin
  if st <> 'ok' then return jsonb_build_object('status', st); end if;
  return jsonb_build_object('status', 'ok', 'rows',
    coalesce((select jsonb_agg(to_jsonb(m) order by m.played_at desc) from snap_matches m), '[]'::jsonb));
end $$;

-- Neues Spiel (ohne id) oder Änderung (mit id). Nur die Felder aus dem Formular.
create or replace function public.snap_save(pin text, rec jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare st text := snap_check(pin); v_id uuid;
begin
  if st <> 'ok' then return jsonb_build_object('status', st); end if;
  if rec ? 'id' and rec ->> 'id' is not null then
    update snap_matches set
      result        = rec ->> 'result',
      cubes         = coalesce((rec ->> 'cubes')::int, 0),
      deck_name     = rec ->> 'deck_name',
      mode          = rec ->> 'mode',
      opp_archetype = rec ->> 'opp_archetype',
      opponent_name = rec ->> 'opponent_name',
      retreated     = rec ->> 'retreated',
      played_at     = coalesce((rec ->> 'played_at')::timestamptz, played_at),
      snapped_me    = (rec ->> 'snapped_me')::boolean,
      notes         = rec ->> 'notes'
    where id = (rec ->> 'id')::uuid
    returning id into v_id;
  else
    insert into snap_matches (source, result, cubes, deck_name, mode, opp_archetype, opponent_name,
                              retreated, played_at, snapped_me, notes)
    values ('manual', rec ->> 'result', coalesce((rec ->> 'cubes')::int, 0), rec ->> 'deck_name', rec ->> 'mode',
            rec ->> 'opp_archetype', rec ->> 'opponent_name', rec ->> 'retreated',
            coalesce((rec ->> 'played_at')::timestamptz, now()), (rec ->> 'snapped_me')::boolean, rec ->> 'notes')
    returning id into v_id;
  end if;
  return jsonb_build_object('status', case when v_id is null then 'not_found' else 'ok' end, 'id', v_id);
end $$;

create or replace function public.snap_delete(pin text, match_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare st text := snap_check(pin);
begin
  if st <> 'ok' then return jsonb_build_object('status', st); end if;
  delete from snap_matches where id = match_id;
  return jsonb_build_object('status', 'ok');
end $$;

-- Die Website fragt beim Start, ob schon ein PIN festgelegt ist
create or replace function public.snap_has_pin()
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from snap_settings);
$$;

grant execute on function public.snap_ingest(jsonb, text), public.snap_setup_pin(text), public.snap_change_pin(text, text),
  public.snap_list(text), public.snap_save(text, jsonb), public.snap_delete(text, uuid), public.snap_has_pin()
  to anon, authenticated;
