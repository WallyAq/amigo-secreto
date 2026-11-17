create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.secret_draws (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists public.draw_participants (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null references public.secret_draws(id) on delete cascade,
  giver_name text not null,
  recipient_name text not null,
  code_hash bytea not null unique,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.secret_event_state (
  event_id smallint primary key default 1 check (event_id = 1),
  participants text[] not null default '{}',
  draw_id uuid unique references public.secret_draws(id)
);

insert into public.secret_event_state (event_id)
values (1)
on conflict (event_id) do nothing;

create index if not exists draw_participants_draw_id_idx
  on public.draw_participants (draw_id);

alter table public.secret_draws enable row level security;
alter table public.draw_participants enable row level security;
alter table public.secret_event_state enable row level security;

grant usage on schema public to anon, authenticated;
revoke all on table public.secret_draws from public, anon, authenticated;
revoke all on table public.draw_participants from public, anon, authenticated;
revoke all on table public.secret_event_state from public, anon, authenticated;

create or replace function public.create_secret_draw(p_names text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_names text[];
  v_recipients text[];
  v_draw_id uuid;
  v_code text;
  v_code_hash bytea;
  v_codes jsonb := '[]'::jsonb;
  v_index integer;
begin
  if p_names is null or cardinality(p_names) < 2 then
    raise exception 'At least two participants are required';
  end if;

  select array_agg(btrim(submitted.name) order by submitted.ordinal)
    into v_names
    from unnest(p_names) with ordinality as submitted(name, ordinal);

  if cardinality(v_names) <> cardinality(p_names)
     or exists (
       select 1
         from unnest(v_names) as submitted(name)
        where submitted.name = ''
           or char_length(submitted.name) > 60
     ) then
    raise exception 'Participant names must contain 1 to 60 characters';
  end if;

  if exists (
    select lower(submitted.name)
      from unnest(v_names) as submitted(name)
     group by lower(submitted.name)
    having count(*) > 1
  ) then
    raise exception 'Participant names must be unique';
  end if;

  loop
    select array_agg(candidate.name order by extensions.gen_random_bytes(16))
      into v_recipients
      from unnest(v_names) as candidate(name);

    exit when not exists (
      select 1
        from generate_subscripts(v_names, 1) as s(i)
       where v_names[s.i] = v_recipients[s.i]
    );
  end loop;

  insert into public.secret_draws default values
    returning id into v_draw_id;

  for v_index in 1..cardinality(v_names) loop
    loop
      v_code := upper(encode(extensions.gen_random_bytes(8), 'hex'));
      v_code_hash := extensions.digest(v_code, 'sha256');
      exit when not exists (
        select 1
          from public.draw_participants
         where code_hash = v_code_hash
      );
    end loop;

    insert into public.draw_participants (
      draw_id,
      giver_name,
      recipient_name,
      code_hash
    ) values (
      v_draw_id,
      v_names[v_index],
      v_recipients[v_index],
      v_code_hash
    );

    v_codes := v_codes || jsonb_build_array(
      jsonb_build_object('name', v_names[v_index], 'code', v_code)
    );
  end loop;

  return jsonb_build_object('draw_id', v_draw_id, 'codes', v_codes);
end;
$$;

create or replace function public.reveal_secret_draw(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code_hash bytea;
  v_recipient_name text;
begin
  if p_code is null or upper(btrim(p_code)) !~ '^[0-9A-F]{16}$' then
    return jsonb_build_object('status', 'invalid');
  end if;

  v_code_hash := extensions.digest(upper(btrim(p_code)), 'sha256');

  update public.draw_participants
     set used_at = clock_timestamp()
   where code_hash = v_code_hash
     and used_at is null
  returning recipient_name into v_recipient_name;

  if found then
    return jsonb_build_object(
      'status', 'ok',
      'recipient', v_recipient_name
    );
  end if;

  if exists (
    select 1
      from public.draw_participants
     where code_hash = v_code_hash
  ) then
    return jsonb_build_object('status', 'used');
  end if;

  return jsonb_build_object('status', 'invalid');
end;
$$;

revoke all on function public.create_secret_draw(text[]) from public;
revoke all on function public.reveal_secret_draw(text) from public;
grant execute on function public.create_secret_draw(text[]) to anon, authenticated;
grant execute on function public.reveal_secret_draw(text) to anon, authenticated;

create or replace function public.get_secret_event_state()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'participants', to_jsonb(event_state.participants),
    'draw_complete', event_state.draw_id is not null
  )
    from public.secret_event_state as event_state
   where event_state.event_id = 1;
$$;

create or replace function public.add_secret_participant(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(p_name);
  v_names text[];
  v_draw_id uuid;
begin
  if v_name is null or char_length(v_name) not between 1 and 60 then
    raise exception 'Participant name must contain 1 to 60 characters';
  end if;

  select event_state.participants, event_state.draw_id
    into v_names, v_draw_id
    from public.secret_event_state as event_state
   where event_state.event_id = 1
   for update;

  if v_draw_id is not null then
    raise exception 'The secret draw has already been completed';
  end if;

  if exists (
    select 1
      from unnest(v_names) as existing(name)
     where lower(existing.name) = lower(v_name)
  ) then
    raise exception 'This participant is already on the list';
  end if;

  if cardinality(v_names) >= 100 then
    raise exception 'The participant list is limited to 100 names';
  end if;

  v_names := array_append(v_names, v_name);

  update public.secret_event_state
     set participants = v_names
   where event_id = 1;

  return jsonb_build_object(
    'participants', to_jsonb(v_names),
    'draw_complete', false
  );
end;
$$;

create or replace function public.remove_secret_participant(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(p_name);
  v_removed_name text;
  v_names text[];
  v_draw_id uuid;
begin
  if v_name is null then
    raise exception 'Participant name is required';
  end if;

  select event_state.participants, event_state.draw_id
    into v_names, v_draw_id
    from public.secret_event_state as event_state
   where event_state.event_id = 1
   for update;

  if v_draw_id is not null then
    raise exception 'The secret draw has already been completed';
  end if;

  select existing.name
    into v_removed_name
    from unnest(v_names) as existing(name)
   where lower(existing.name) = lower(v_name)
   limit 1;

  if v_removed_name is null then
    raise exception 'This participant is not on the list';
  end if;

  v_names := array_remove(v_names, v_removed_name);

  update public.secret_event_state
     set participants = v_names
   where event_id = 1;

  return jsonb_build_object(
    'participants', to_jsonb(v_names),
    'draw_complete', false
  );
end;
$$;

create or replace function public.create_shared_secret_draw()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_names text[];
  v_recipients text[];
  v_draw_id uuid;
  v_code text;
  v_code_hash bytea;
  v_codes jsonb := '[]'::jsonb;
  v_index integer;
begin
  select event_state.participants, event_state.draw_id
    into v_names, v_draw_id
    from public.secret_event_state as event_state
   where event_state.event_id = 1
   for update;

  if v_draw_id is not null then
    raise exception 'The secret draw has already been completed';
  end if;

  if cardinality(v_names) < 2 then
    raise exception 'At least two participants are required';
  end if;

  loop
    select array_agg(candidate.name order by extensions.gen_random_bytes(16))
      into v_recipients
      from unnest(v_names) as candidate(name);

    exit when not exists (
      select 1
        from generate_subscripts(v_names, 1) as s(i)
       where v_names[s.i] = v_recipients[s.i]
    );
  end loop;

  insert into public.secret_draws default values
    returning id into v_draw_id;

  for v_index in 1..cardinality(v_names) loop
    loop
      v_code := upper(encode(extensions.gen_random_bytes(8), 'hex'));
      v_code_hash := extensions.digest(v_code, 'sha256');
      exit when not exists (
        select 1
          from public.draw_participants
         where code_hash = v_code_hash
      );
    end loop;

    insert into public.draw_participants (
      draw_id,
      giver_name,
      recipient_name,
      code_hash
    ) values (
      v_draw_id,
      v_names[v_index],
      v_recipients[v_index],
      v_code_hash
    );

    v_codes := v_codes || jsonb_build_array(
      jsonb_build_object('name', v_names[v_index], 'code', v_code)
    );
  end loop;

  update public.secret_event_state
     set draw_id = v_draw_id
   where event_id = 1;

  return jsonb_build_object('draw_id', v_draw_id, 'codes', v_codes);
end;
$$;

revoke all on function public.create_secret_draw(text[]) from public, anon, authenticated;
revoke all on function public.get_secret_event_state() from public;
revoke all on function public.add_secret_participant(text) from public;
revoke all on function public.remove_secret_participant(text) from public;
revoke all on function public.create_shared_secret_draw() from public;
grant execute on function public.get_secret_event_state() to anon, authenticated;
grant execute on function public.add_secret_participant(text) to anon, authenticated;
grant execute on function public.remove_secret_participant(text) to anon, authenticated;
grant execute on function public.create_shared_secret_draw() to anon, authenticated;

notify pgrst, 'reload schema';
