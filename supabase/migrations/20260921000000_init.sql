-- Village Angels walking group: walks, sign-ups and suggestions.
--
-- There are no user accounts. Each browser gets a random "device token" (kept in
-- an httpOnly cookie by the app) which is stored against sign-ups and votes so a
-- person can later remove their own name. The token column is never readable by
-- the public API role; all writes go through the security-definer functions below.

-- Walks ---------------------------------------------------------------------

create table public.angels_walks (
	id            uuid primary key default gen_random_uuid(),
	title         text not null,
	description   text,
	starts_at     timestamptz not null,
	meeting_point text not null,
	distance_km   numeric(5, 1),
	duration_mins integer,
	difficulty    text check (difficulty in ('easy', 'moderate', 'challenging')),
	max_people    integer check (max_people is null or max_people > 0),
	notes         text,
	cancelled     boolean not null default false,
	created_at    timestamptz not null default now()
);

create index angels_walks_starts_at_idx on public.angels_walks (starts_at);

-- Sign-ups ------------------------------------------------------------------

create table public.angels_signups (
	id           uuid primary key default gen_random_uuid(),
	walk_id      uuid not null references public.angels_walks (id) on delete cascade,
	name         text not null check (char_length(btrim(name)) between 1 and 60),
	device_token uuid not null,
	created_at   timestamptz not null default now(),
	unique (walk_id, device_token)
);

create index angels_signups_walk_id_idx on public.angels_signups (walk_id);

-- Suggestions ---------------------------------------------------------------

create table public.angels_suggestions (
	id           uuid primary key default gen_random_uuid(),
	title        text not null check (char_length(btrim(title)) between 1 and 120),
	details      text check (details is null or char_length(details) <= 1000),
	suggested_by text check (suggested_by is null or char_length(suggested_by) <= 60),
	device_token uuid not null,
	created_at   timestamptz not null default now()
);

create table public.angels_suggestion_votes (
	suggestion_id uuid not null references public.angels_suggestions (id) on delete cascade,
	device_token  uuid not null,
	created_at    timestamptz not null default now(),
	primary key (suggestion_id, device_token)
);

-- Access control ------------------------------------------------------------

alter table public.angels_walks            enable row level security;
alter table public.angels_signups          enable row level security;
alter table public.angels_suggestions      enable row level security;
alter table public.angels_suggestion_votes enable row level security;

-- Everyone may read walks. Walks are managed by the organiser in the Supabase
-- dashboard (which bypasses RLS), so there are no public write policies.
create policy "walks are public" on public.angels_walks for select using (true);

-- Everyone may read who's going, but only the non-sensitive columns.
create policy "signups are public" on public.angels_signups for select using (true);
revoke all on public.angels_signups from anon, authenticated;
grant select (id, walk_id, name, created_at) on public.angels_signups to anon, authenticated;

create policy "suggestions are public" on public.angels_suggestions for select using (true);
revoke all on public.angels_suggestions from anon, authenticated;
grant select (id, title, details, suggested_by, created_at) on public.angels_suggestions to anon, authenticated;

-- Votes are only readable as counts (who voted stays private).
create policy "votes are countable" on public.angels_suggestion_votes for select using (true);
revoke all on public.angels_suggestion_votes from anon, authenticated;
grant select (suggestion_id) on public.angels_suggestion_votes to anon, authenticated;

create view public.angels_suggestions_ranked
with (security_invoker = true) as
select
	s.id,
	s.title,
	s.details,
	s.suggested_by,
	s.created_at,
	count(v.suggestion_id)::int as votes
from public.angels_suggestions s
left join public.angels_suggestion_votes v on v.suggestion_id = s.id
group by s.id;

grant select on public.angels_suggestions_ranked to anon, authenticated;

-- Functions -----------------------------------------------------------------

create or replace function public.angels_join_walk(p_walk_id uuid, p_name text, p_device uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
	w public.angels_walks;
	going int;
	new_id uuid;
begin
	select * into w from public.angels_walks where id = p_walk_id for update;
	if not found then
		raise exception 'Walk not found' using errcode = 'P0002';
	end if;
	if w.cancelled then
		raise exception 'This walk has been cancelled' using errcode = 'P0001';
	end if;
	if w.starts_at < now() then
		raise exception 'This walk has already started' using errcode = 'P0001';
	end if;

	select count(*) into going from public.angels_signups where walk_id = p_walk_id;
	if w.max_people is not null and going >= w.max_people then
		raise exception 'Sorry, this walk is full' using errcode = 'P0001';
	end if;

	insert into public.angels_signups (walk_id, name, device_token)
	values (p_walk_id, btrim(p_name), p_device)
	on conflict (walk_id, device_token) do update set name = excluded.name
	returning id into new_id;

	return new_id;
end;
$$;

create or replace function public.angels_leave_walk(p_walk_id uuid, p_device uuid)
returns void
language sql
security definer
set search_path = public
as $$
	delete from public.angels_signups where walk_id = p_walk_id and device_token = p_device;
$$;

-- Which walks (and suggestions) has this device joined / voted for?
create or replace function public.angels_my_activity(p_device uuid)
returns table (kind text, ref_id uuid)
language sql
stable
security definer
set search_path = public
as $$
	select 'walk', walk_id from public.angels_signups where device_token = p_device
	union all
	select 'vote', suggestion_id from public.angels_suggestion_votes where device_token = p_device
	union all
	select 'suggestion', id from public.angels_suggestions where device_token = p_device;
$$;

create or replace function public.angels_add_suggestion(p_title text, p_details text, p_by text, p_device uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
	new_id uuid;
	recent int;
begin
	-- Light spam guard: at most 5 suggestions per device per day.
	select count(*) into recent from public.angels_suggestions
	where device_token = p_device and created_at > now() - interval '1 day';
	if recent >= 5 then
		raise exception 'That''s plenty of ideas for today - thank you!' using errcode = 'P0001';
	end if;

	insert into public.angels_suggestions (title, details, suggested_by, device_token)
	values (btrim(p_title), nullif(btrim(p_details), ''), nullif(btrim(p_by), ''), p_device)
	returning id into new_id;

	-- Suggesting something counts as a vote for it.
	insert into public.angels_suggestion_votes (suggestion_id, device_token) values (new_id, p_device);
	return new_id;
end;
$$;

create or replace function public.angels_toggle_vote(p_suggestion_id uuid, p_device uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
	delete from public.angels_suggestion_votes
	where suggestion_id = p_suggestion_id and device_token = p_device;
	if found then
		return false;
	end if;
	insert into public.angels_suggestion_votes (suggestion_id, device_token) values (p_suggestion_id, p_device);
	return true;
end;
$$;

create or replace function public.angels_delete_suggestion(p_suggestion_id uuid, p_device uuid)
returns void
language sql
security definer
set search_path = public
as $$
	delete from public.angels_suggestions where id = p_suggestion_id and device_token = p_device;
$$;

revoke execute on function
	public.angels_join_walk(uuid, text, uuid),
	public.angels_leave_walk(uuid, uuid),
	public.angels_my_activity(uuid),
	public.angels_add_suggestion(text, text, text, uuid),
	public.angels_toggle_vote(uuid, uuid),
	public.angels_delete_suggestion(uuid, uuid)
from public;

grant execute on function
	public.angels_join_walk(uuid, text, uuid),
	public.angels_leave_walk(uuid, uuid),
	public.angels_my_activity(uuid),
	public.angels_add_suggestion(text, text, text, uuid),
	public.angels_toggle_vote(uuid, uuid),
	public.angels_delete_suggestion(uuid, uuid)
to anon, authenticated;
