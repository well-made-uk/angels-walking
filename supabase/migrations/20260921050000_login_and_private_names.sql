-- Walker log in / sign up, and hiding names from people who aren't logged in.
--
-- * Sign up: name + email (both required) creates an angels_walkers row.
-- * Log in: email only - we look the walker up and use their stored name.
-- * Every action requires an existing walker, and the name shown on walks and
--   suggestions is always the walker's name.
-- * Names are no longer readable by the anonymous API role; logged-in walkers
--   get them through angels_visible_names().

alter table public.angels_walkers alter column name set not null;
alter table public.angels_walkers drop constraint if exists angels_walkers_name_check;
alter table public.angels_walkers
	add constraint angels_walkers_name_check check (char_length(btrim(name)) between 1 and 60);

-- Names are private to logged-in walkers ------------------------------------

revoke select (name) on public.angels_signups from anon;
revoke select (suggested_by) on public.angels_suggestions from anon;

drop view public.angels_suggestions_ranked;
create view public.angels_suggestions_ranked
with (security_invoker = true) as
select
	s.id,
	s.title,
	s.details,
	s.created_at,
	count(v.suggestion_id)::int as votes,
	exists (
		select 1 from public.angels_walks w where w.suggestion_id = s.id and not w.cancelled
	) as promoted
from public.angels_suggestions s
left join public.angels_suggestion_votes v on v.suggestion_id = s.id
group by s.id;

grant select on public.angels_suggestions_ranked to anon, authenticated;

-- Walker functions ------------------------------------------------------------

drop function if exists public.angels_register_walker(text, text);
drop function if exists public.angels_touch_walker(text, text);

-- Log in: returns the walker's name, or null if we don't know this email.
create function public.angels_login_walker(p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
	e text := angels_norm_email(p_email);
	n text;
begin
	update angels_walkers set last_seen_at = now() where email = e returning name into n;
	return n;
end;
$$;

-- Sign up: name and email are both required. Signing up again with a known
-- email just logs in (keeping the existing name).
create function public.angels_signup_walker(p_email text, p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
	e text := angels_norm_email(p_email);
	n text := btrim(coalesce(p_name, ''));
begin
	if n = '' then
		raise exception 'Please tell us your name' using errcode = 'P0001';
	end if;
	if char_length(n) > 60 then
		raise exception 'That name is a bit long - 60 characters at most' using errcode = 'P0001';
	end if;
	insert into angels_walkers (email, name) values (e, n)
	on conflict (email) do update set last_seen_at = now()
	returning name into n;
	return n;
end;
$$;

-- For actions: the walker must already exist. Returns their email and name.
create function public.angels_require_walker(p_email text, out email text, out name text)
language plpgsql
security definer
set search_path = public
as $$
begin
	update angels_walkers w set last_seen_at = now()
	where w.email = angels_norm_email(p_email)
	returning w.email, w.name into email, name;
	if email is null then
		raise exception 'Please log in or sign up first' using errcode = 'P0001';
	end if;
end;
$$;

-- Names for a logged-in walker: who's going on current walks, who suggested
-- each idea, and who suggested each walk.
create function public.angels_visible_names(p_email text)
returns table (kind text, ref_id uuid, name text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
	if not exists (select 1 from angels_walkers where email = angels_norm_email(p_email)) then
		return;
	end if;
	return query
		select 'signup', s.id, s.name
		from angels_signups s
		join angels_walks w on w.id = s.walk_id
		where w.walk_date is null or w.starts_at > now() - interval '1 day'
		union all
		select 'suggestion', g.id, g.suggested_by from angels_suggestions g where g.suggested_by is not null
		union all
		select 'credit', w.id, g.suggested_by
		from angels_walks w join angels_suggestions g on g.id = w.suggestion_id
		where g.suggested_by is not null and (w.walk_date is null or w.starts_at > now() - interval '1 day');
end;
$$;

-- Actions use the walker's own name ------------------------------------------

drop function public.angels_join_walk(uuid, text, text);
create function public.angels_join_walk(p_walk_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
	me record := angels_require_walker(p_email);
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
	if w.walk_date is null then
		raise exception 'The date hasn''t been decided yet - vote for the days you can make' using errcode = 'P0001';
	end if;
	if w.starts_at < now() then
		raise exception 'This walk has already started' using errcode = 'P0001';
	end if;

	select count(*) into going from public.angels_signups where walk_id = p_walk_id and walker_email <> me.email;
	if w.max_people is not null and going >= w.max_people then
		raise exception 'Sorry, this walk is full' using errcode = 'P0001';
	end if;

	insert into public.angels_signups (walk_id, name, walker_email)
	values (p_walk_id, me.name, me.email)
	on conflict (walk_id, walker_email) do update set name = excluded.name
	returning id into new_id;

	return new_id;
end;
$$;

drop function public.angels_add_suggestion(text, text, text, text);
create function public.angels_add_suggestion(p_title text, p_details text, p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
	me record := angels_require_walker(p_email);
	new_id uuid;
	recent int;
begin
	-- Light spam guard: at most 5 suggestions per person per day.
	select count(*) into recent from public.angels_suggestions
	where walker_email = me.email and created_at > now() - interval '1 day';
	if recent >= 5 then
		raise exception 'That''s plenty of ideas for today - thank you!' using errcode = 'P0001';
	end if;

	insert into public.angels_suggestions (title, details, suggested_by, walker_email)
	values (btrim(p_title), nullif(btrim(p_details), ''), me.name, me.email)
	returning id into new_id;

	-- Suggesting something counts as a vote for it.
	insert into public.angels_suggestion_votes (suggestion_id, walker_email) values (new_id, me.email);
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
	e text := (angels_require_walker(p_email)).email;
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
	e text := (angels_require_walker(p_email)).email;
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
	public.angels_login_walker(text),
	public.angels_signup_walker(text, text),
	public.angels_require_walker(text),
	public.angels_visible_names(text),
	public.angels_join_walk(uuid, text),
	public.angels_add_suggestion(text, text, text)
from public, anon, authenticated;

grant execute on function
	public.angels_login_walker(text),
	public.angels_signup_walker(text, text),
	public.angels_visible_names(text),
	public.angels_join_walk(uuid, text),
	public.angels_add_suggestion(text, text, text)
to anon, authenticated;
