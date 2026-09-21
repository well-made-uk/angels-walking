-- A record of every walker, keyed by email. There's no walker login - this
-- just gives sign-ups, votes and suggestions a person to belong to, so we can
-- show stats later (e.g. who's been on the most walks) and so deleting a
-- walker removes everything of theirs.

create table public.angels_walkers (
	email        text primary key check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and email = lower(email)),
	name         text check (name is null or char_length(name) <= 60),
	created_at   timestamptz not null default now(),
	last_seen_at timestamptz not null default now()
);

alter table public.angels_walkers enable row level security;
revoke all on public.angels_walkers from anon, authenticated;
grant select, update, delete on public.angels_walkers to authenticated;
create policy "organisers see walkers" on public.angels_walkers
	for select to authenticated using (public.angels_is_organiser());
create policy "organisers edit walkers" on public.angels_walkers
	for update to authenticated using (public.angels_is_organiser()) with check (public.angels_is_organiser());
create policy "organisers delete walkers" on public.angels_walkers
	for delete to authenticated using (public.angels_is_organiser());

-- Anyone who has already used an email gets a walker record.
insert into public.angels_walkers (email, name, created_at)
select walker_email, (array_agg(name order by created_at desc))[1], min(created_at)
from (
	select walker_email, name, created_at from public.angels_signups
	union all select walker_email, suggested_by, created_at from public.angels_suggestions
	union all select walker_email, null, created_at from public.angels_suggestion_votes
	union all select walker_email, null, created_at from public.angels_date_votes
) x
where walker_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
group by walker_email
on conflict do nothing;

-- Older rows made before emails (random browser tokens) are left unlinked.
alter table public.angels_signups
	add constraint angels_signups_walker_fkey foreign key (walker_email)
	references public.angels_walkers (email) on update cascade on delete cascade not valid;
alter table public.angels_suggestions
	add constraint angels_suggestions_walker_fkey foreign key (walker_email)
	references public.angels_walkers (email) on update cascade on delete cascade not valid;
alter table public.angels_suggestion_votes
	add constraint angels_suggestion_votes_walker_fkey foreign key (walker_email)
	references public.angels_walkers (email) on update cascade on delete cascade not valid;
alter table public.angels_date_votes
	add constraint angels_date_votes_walker_fkey foreign key (walker_email)
	references public.angels_walkers (email) on update cascade on delete cascade not valid;

create index angels_signups_walker_idx on public.angels_signups (walker_email);
create index angels_suggestions_walker_idx on public.angels_suggestions (walker_email);
create index angels_suggestion_votes_walker_idx on public.angels_suggestion_votes (walker_email);
create index angels_date_votes_walker_idx on public.angels_date_votes (walker_email);

-- Create or refresh a walker and return their normalised email. A null name
-- keeps whatever name we already have.
create or replace function public.angels_touch_walker(p_email text, p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
	e text := angels_norm_email(p_email);
	n text := nullif(left(btrim(coalesce(p_name, '')), 60), '');
begin
	insert into angels_walkers (email, name) values (e, n)
	on conflict (email) do update
		set name = coalesce(excluded.name, angels_walkers.name),
			last_seen_at = now();
	return e;
end;
$$;

-- Called when someone confirms their details in the app.
create or replace function public.angels_register_walker(p_email text, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
	if nullif(btrim(coalesce(p_name, '')), '') is null then
		raise exception 'Please tell us your name' using errcode = 'P0001';
	end if;
	perform angels_touch_walker(p_email, p_name);
end;
$$;

-- Every function that records something now goes through angels_touch_walker.

create or replace function public.angels_join_walk(p_walk_id uuid, p_name text, p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
	w public.angels_walks;
	e text := angels_touch_walker(p_email, p_name);
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
	if w.walk_date is null then
		raise exception 'The date hasn''t been decided yet - vote for the days you can make' using errcode = 'P0001';
	end if;
	if w.starts_at < now() then
		raise exception 'This walk has already started' using errcode = 'P0001';
	end if;

	select count(*) into going from public.angels_signups where walk_id = p_walk_id and walker_email <> e;
	if w.max_people is not null and going >= w.max_people then
		raise exception 'Sorry, this walk is full' using errcode = 'P0001';
	end if;

	insert into public.angels_signups (walk_id, name, walker_email)
	values (p_walk_id, btrim(p_name), e)
	on conflict (walk_id, walker_email) do update set name = excluded.name
	returning id into new_id;

	return new_id;
end;
$$;

create or replace function public.angels_add_suggestion(p_title text, p_details text, p_by text, p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
	e text := angels_touch_walker(p_email, p_by);
	new_id uuid;
	recent int;
begin
	-- Light spam guard: at most 5 suggestions per person per day.
	select count(*) into recent from public.angels_suggestions
	where walker_email = e and created_at > now() - interval '1 day';
	if recent >= 5 then
		raise exception 'That''s plenty of ideas for today - thank you!' using errcode = 'P0001';
	end if;

	insert into public.angels_suggestions (title, details, suggested_by, walker_email)
	values (btrim(p_title), nullif(btrim(p_details), ''), nullif(btrim(p_by), ''), e)
	returning id into new_id;

	-- Suggesting something counts as a vote for it.
	insert into public.angels_suggestion_votes (suggestion_id, walker_email) values (new_id, e);
	return new_id;
end;
$$;

create or replace function public.angels_toggle_vote(p_suggestion_id uuid, p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
	e text := angels_touch_walker(p_email, null);
begin
	delete from public.angels_suggestion_votes
	where suggestion_id = p_suggestion_id and walker_email = e;
	if found then
		return false;
	end if;
	insert into public.angels_suggestion_votes (suggestion_id, walker_email) values (p_suggestion_id, e);
	return true;
end;
$$;

create or replace function public.angels_set_date_votes(p_walk_id uuid, p_dates date[], p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
	w public.angels_walks;
	e text := angels_touch_walker(p_email, null);
begin
	select * into w from public.angels_walks where id = p_walk_id;
	if not found then
		raise exception 'Walk not found' using errcode = 'P0002';
	end if;
	if w.cancelled or w.walk_date is not null or w.votes_close_at <= now() then
		raise exception 'Voting for this walk has closed' using errcode = 'P0001';
	end if;
	if exists (
		select 1 from unnest(coalesce(p_dates, '{}')) d
		where date_trunc('month', d)::date <> w.walk_month or extract(isodow from d) not in (6, 7)
	) then
		raise exception 'Please pick weekend days in %', to_char(w.walk_month, 'FMMonth') using errcode = 'P0001';
	end if;

	delete from public.angels_date_votes where walk_id = p_walk_id and walker_email = e;
	insert into public.angels_date_votes (walk_id, vote_date, walker_email)
	select distinct p_walk_id, d, e from unnest(coalesce(p_dates, '{}')) d;
end;
$$;

revoke execute on function
	public.angels_touch_walker(text, text),
	public.angels_register_walker(text, text)
from public, anon, authenticated;

grant execute on function public.angels_register_walker(text, text) to anon, authenticated;
