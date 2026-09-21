-- Identify walkers by email instead of a random per-browser token.
--
-- There are still no walker accounts: people give their name and email once
-- (the app keeps them in the browser), and that email is what ties sign-ups,
-- votes and suggestions to a person. Emails are never readable through the
-- public API; organisers see them via angels_walk_attendees().

-- Columns -------------------------------------------------------------------

alter table public.angels_signups rename column device_token to walker_email;
alter table public.angels_signups alter column walker_email type text using walker_email::text;

alter table public.angels_suggestions rename column device_token to walker_email;
alter table public.angels_suggestions alter column walker_email type text using walker_email::text;

alter table public.angels_suggestion_votes rename column device_token to walker_email;
alter table public.angels_suggestion_votes alter column walker_email type text using walker_email::text;

alter table public.angels_date_votes rename column device_token to walker_email;
alter table public.angels_date_votes alter column walker_email type text using walker_email::text;

-- Older rows hold the old random tokens, so only check new ones.
alter table public.angels_signups
	add constraint angels_signups_email_format check (walker_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') not valid;
alter table public.angels_suggestions
	add constraint angels_suggestions_email_format check (walker_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') not valid;

create or replace function public.angels_norm_email(p_email text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
	e text := lower(btrim(coalesce(p_email, '')));
begin
	if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(e) > 254 then
		raise exception 'Please enter a valid email address' using errcode = 'P0001';
	end if;
	return e;
end;
$$;

-- Functions: drop the token-based versions ---------------------------------

drop function public.angels_join_walk(uuid, text, uuid);
drop function public.angels_leave_walk(uuid, uuid);
drop function public.angels_my_activity(uuid);
drop function public.angels_add_suggestion(text, text, text, uuid);
drop function public.angels_toggle_vote(uuid, uuid);
drop function public.angels_delete_suggestion(uuid, uuid);
drop function public.angels_set_date_votes(uuid, date[], uuid);
drop function public.angels_my_date_votes(uuid);

-- ...and recreate them keyed on email --------------------------------------

create function public.angels_join_walk(p_walk_id uuid, p_name text, p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
	w public.angels_walks;
	e text := angels_norm_email(p_email);
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

create function public.angels_leave_walk(p_walk_id uuid, p_email text)
returns void
language sql
security definer
set search_path = public
as $$
	delete from public.angels_signups
	where walk_id = p_walk_id and walker_email = angels_norm_email(p_email);
$$;

-- Which walks has this person joined, which ideas have they hearted or
-- suggested, and which days have they voted for?
create function public.angels_my_activity(p_email text)
returns table (kind text, ref_id uuid, vote_date date)
language sql
stable
security definer
set search_path = public
as $$
	with me as (select angels_norm_email(p_email) as e)
	select 'walk', walk_id, null::date from public.angels_signups, me where walker_email = me.e
	union all
	select 'vote', suggestion_id, null from public.angels_suggestion_votes, me where walker_email = me.e
	union all
	select 'suggestion', id, null from public.angels_suggestions, me where walker_email = me.e
	union all
	select 'date', walk_id, vote_date from public.angels_date_votes, me where walker_email = me.e;
$$;

create function public.angels_add_suggestion(p_title text, p_details text, p_by text, p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
	e text := angels_norm_email(p_email);
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

create function public.angels_toggle_vote(p_suggestion_id uuid, p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
	e text := angels_norm_email(p_email);
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

create function public.angels_delete_suggestion(p_suggestion_id uuid, p_email text)
returns void
language sql
security definer
set search_path = public
as $$
	delete from public.angels_suggestions
	where id = p_suggestion_id and walker_email = angels_norm_email(p_email);
$$;

create function public.angels_set_date_votes(p_walk_id uuid, p_dates date[], p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
	w public.angels_walks;
	e text := angels_norm_email(p_email);
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

-- Vote tallies count distinct people, which now means distinct emails.
create or replace function public.angels_date_tallies()
returns table (walk_id uuid, vote_date date, votes int, voters int)
language sql
stable
security definer
set search_path = public
as $$
	select
		v.walk_id,
		v.vote_date,
		count(*)::int,
		(select count(distinct x.walker_email) from angels_date_votes x where x.walk_id = v.walk_id)::int
	from angels_date_votes v
	join angels_walks w on w.id = v.walk_id and w.walk_date is null
	group by v.walk_id, v.vote_date;
$$;

-- Organisers only: who's coming, with emails, so they can get in touch.
create function public.angels_walk_attendees(p_walk_id uuid)
returns table (id uuid, name text, email text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
	if not angels_is_organiser() then
		raise exception 'Organisers only' using errcode = 'P0001';
	end if;
	return query
		select s.id, s.name, s.walker_email, s.created_at
		from angels_signups s
		where s.walk_id = p_walk_id
		order by s.created_at;
end;
$$;

revoke execute on function
	public.angels_norm_email(text),
	public.angels_join_walk(uuid, text, text),
	public.angels_leave_walk(uuid, text),
	public.angels_my_activity(text),
	public.angels_add_suggestion(text, text, text, text),
	public.angels_toggle_vote(uuid, text),
	public.angels_delete_suggestion(uuid, text),
	public.angels_set_date_votes(uuid, date[], text),
	public.angels_walk_attendees(uuid)
from public, anon, authenticated;

grant execute on function
	public.angels_join_walk(uuid, text, text),
	public.angels_leave_walk(uuid, text),
	public.angels_my_activity(text),
	public.angels_add_suggestion(text, text, text, text),
	public.angels_toggle_vote(uuid, text),
	public.angels_delete_suggestion(uuid, text),
	public.angels_set_date_votes(uuid, date[], text)
to anon, authenticated;

grant execute on function public.angels_walk_attendees(uuid) to authenticated;
