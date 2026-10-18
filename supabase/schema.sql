-- Marvel Snap Tracker: tables and ingest function (Supabase project "Ultimate Hunt").
-- All objects use the snap_ prefix so they stay separate from the Overwatch tables.

create table if not exists public.snap_matches (
  id             uuid primary key default gen_random_uuid(),
  game_id        text unique,                 -- Marvel Snap game id (null for manual entries)
  played_at      timestamptz not null default now(),
  source         text not null default 'pc' check (source in ('pc','manual')),
  mode           text,                         -- Ranked, Conquest, ChampionArena, Friendly ...
  event          text,                         -- e.g. ChampionArena_Oct26
  deck_name      text,
  deck_cards     text[] not null default '{}',
  result         text not null check (result in ('win','loss','tie')),
  cubes          integer not null default 0,   -- signed: +4 / -2 ...
  snapped_me     boolean,
  snapped_opp    boolean,
  retreated      text check (retreated in ('me','opp')),
  turns          integer,
  my_rank        integer,
  opponent_name  text,
  opponent_cards text[] not null default '{}',
  opp_archetype  text,                          -- set manually; otherwise detected on the website
  cards_drawn    text[] not null default '{}',
  cards_played   text[] not null default '{}',
  locations      jsonb not null default '[]',  -- [{id, my_power, opp_power, winner: me|opp|null}]
  energy_spent   integer,
  notes          text,
  created_at     timestamptz not null default now()
);

create index if not exists snap_matches_played_at_idx on public.snap_matches (played_at desc);

alter table public.snap_matches enable row level security;

drop policy if exists snap_matches_select on public.snap_matches;
drop policy if exists snap_matches_insert on public.snap_matches;
drop policy if exists snap_matches_update on public.snap_matches;
drop policy if exists snap_matches_delete on public.snap_matches;
create policy snap_matches_select on public.snap_matches for select to anon, authenticated using (true);
create policy snap_matches_insert on public.snap_matches for insert to anon, authenticated with check (true);
create policy snap_matches_update on public.snap_matches for update to anon, authenticated using (true) with check (true);
create policy snap_matches_delete on public.snap_matches for delete to anon, authenticated using (true);

-- Takes the whole GameState.json written by the game and stores one match.
create or replace function public.snap_ingest(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  g        jsonb := payload #> '{RemoteGame,GameState}';
  crm      jsonb := g -> 'ClientResultMessage';
  item     jsonb;
  my_acc   text;
  p0       jsonb; p1 jsonb; p jsonb;
  me       jsonb; opp jsonb;
  me_ent   text; opp_ent text; p0_ent text;
  win_ent  text;
  v_result text;
  v_cubes  int;
  v_retreat text;
  v_opp_cards text[];
  v_locs   jsonb := '[]'::jsonb;
  loc      jsonb;
  my_pow   int; opp_pow int; loc_win text;
  v_game   text;
  v_id     uuid;
  ids      jsonb;
begin
  if g is null or crm is null or jsonb_typeof(crm) <> 'object' then
    return jsonb_build_object('status','no_result');
  end if;

  v_game := crm ->> 'GameId';
  if v_game is null then
    return jsonb_build_object('status','no_game_id');
  end if;
  if exists (select 1 from snap_matches where game_id = v_game) then
    return jsonb_build_object('status','duplicate','game_id',v_game);
  end if;

  item   := crm -> 'GameResultAccountItems' -> 0;
  my_acc := item ->> 'AccountId';

  -- every object that carries a $id, so $ref links can be resolved
  select jsonb_object_agg(o ->> '$id', o) into ids
    from jsonb_path_query(payload, 'strict $.**') as o
    where jsonb_typeof(o) = 'object' and o ? '$id';

  p0 := g -> '_players' -> 0;
  p1 := g -> '_players' -> 1;
  if p0 ? '$ref' then p0 := ids -> (p0 ->> '$ref'); end if;
  if p1 ? '$ref' then p1 := ids -> (p1 ->> '$ref'); end if;
  p0_ent := p0 ->> 'EntityId';

  if p0 #>> '{PlayerInfo,AccountId}' = my_acc then me := p0; opp := p1; else me := p1; opp := p0; end if;
  me_ent  := me ->> 'EntityId';
  opp_ent := opp ->> 'EntityId';

  win_ent := g -> 'Winner' ->> 'EntityId';
  if win_ent is null and g -> 'Winner' ? '$ref' then
    win_ent := ids -> (g -> 'Winner' ->> '$ref') ->> 'EntityId';
  end if;

  v_result := case
    when win_ent = me_ent then 'win'
    when win_ent = opp_ent then 'loss'
    when (item ->> 'IsWinner')::boolean then 'win'
    else 'tie' end;

  v_cubes := coalesce((item ->> 'FinalCubeValue')::int, (crm ->> 'FinalCubeValue')::int, 0);
  v_cubes := case v_result when 'win' then abs(v_cubes) when 'loss' then -abs(v_cubes) else 0 end;

  if coalesce((crm ->> 'TurnsTaken')::int, 0) < coalesce((crm ->> 'TotalTurns')::int, 0) then
    v_retreat := case v_result when 'loss' then 'me' when 'win' then 'opp' end;
  end if;

  -- revealed opponent cards: every card object owned by the opponent that shows its CardDefId
  select coalesce(array_agg(distinct c ->> 'CardDefId'), '{}') into v_opp_cards
  from jsonb_each(ids) as e(k, c)
  where c ->> '$type' like 'CubeGame.Card,%'
    and c ->> 'CardDefId' is not null
    and coalesce(c -> 'Owner' ->> 'EntityId', ids -> (c -> 'Owner' ->> '$ref') ->> 'EntityId') = opp_ent;

  for loc in select value from jsonb_array_elements(g -> '_locations') loop
    if loc ? '$ref' then loc := ids -> (loc ->> '$ref'); end if;
    if me_ent = p0_ent then
      my_pow := (loc ->> 'CurPlayer1Power')::int; opp_pow := (loc ->> 'CurPlayer2Power')::int;
    else
      my_pow := (loc ->> 'CurPlayer2Power')::int; opp_pow := (loc ->> 'CurPlayer1Power')::int;
    end if;
    loc_win := case loc ->> 'WinnerEntityId' when me_ent then 'me' when opp_ent then 'opp' end;
    v_locs := v_locs || jsonb_build_array(jsonb_build_object(
      'id', loc ->> 'LocationDefId', 'my_power', my_pow, 'opp_power', opp_pow, 'winner', loc_win));
  end loop;

  insert into snap_matches (game_id, source, mode, event, deck_name, deck_cards, result, cubes,
    snapped_me, snapped_opp, retreated, turns, my_rank, opponent_name, opponent_cards,
    cards_drawn, cards_played, locations, energy_spent)
  values (
    v_game, 'pc',
    coalesce(crm ->> 'LeagueDefId', g ->> 'LeagueDefId'),
    coalesce(crm ->> 'LimitedEventDefId', g ->> 'LimitedEventDefId'),
    item #>> '{Deck,Name}',
    coalesce((select array_agg(c ->> 'CardDefId') from jsonb_array_elements(item #> '{Deck,Cards}') c), '{}'),
    v_result, v_cubes,
    coalesce((crm ->> 'IsStakesRaisedByPlayer')::boolean, false),
    coalesce((item ->> 'StakesRaisedByOpponent')::boolean, false),
    v_retreat,
    (crm ->> 'TurnsTaken')::int,
    (me #>> '{ProgressionData,Rank}')::int,
    opp #>> '{PlayerInfo,Name}',
    v_opp_cards,
    coalesce((select array_agg(x) from jsonb_array_elements_text(item -> 'CardDefIdsDrawn') x), '{}'),
    coalesce((select array_agg(x) from jsonb_array_elements_text(item -> 'CardDefIdsPlayed') x), '{}'),
    v_locs,
    (item ->> 'EnergySpent')::int)
  on conflict (game_id) do nothing
  returning id into v_id;

  return jsonb_build_object('status', case when v_id is null then 'duplicate' else 'inserted' end,
                            'game_id', v_game, 'result', v_result, 'cubes', v_cubes,
                            'deck', item #>> '{Deck,Name}');
end;
$$;

grant execute on function public.snap_ingest(jsonb) to anon, authenticated;
