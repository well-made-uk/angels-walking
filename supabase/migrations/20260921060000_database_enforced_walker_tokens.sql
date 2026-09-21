-- Enforce the walker checks inside the database, not just in the app.
--
-- The publishable API key is public (and other apps in this project may ship
-- it to browsers), so anyone can call the public angels_* functions directly.
-- From now on:
--   * Log in / sign up need the answer to the human-check question, and only
--     then return a walker token (an HMAC of the email, made with a secret
--     kept in a schema the API can't reach).
--   * Every other walker function needs that token.
-- So knowing someone's email - or having the API key - isn't enough.

-- Private settings, invisible to the API --------------------------------------

create schema if not exists angels_private;
revoke all on schema angels_private from public, anon, authenticated;

create table angels_private.settings (
	key   text primary key,
	value text not null
);
revoke all on angels_private.settings from public, anon, authenticated;

insert into angels_private.settings (key, value) values
	-- Answer to "Which city do we volunteer in?" (compared lower-cased).
	('check_answer', 'manchester'),
	-- Signs walker tokens. Changing it logs every walker out.
	('token_secret', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;

create function angels_private.setting(p_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $$ select value from angels_private.settings where key = p_key $$;

create function angels_private.check_answer(p_answer text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if lower(regexp_replace(btrim(coalesce(p_answer, '')), '\s+', ' ', 'g'))
		is distinct from angels_private.setting('check_answer') then
		raise exception 'That''s not the answer we were expecting - please try again.' using errcode = 'P0001';
	end if;
end;
$$;

create function angels_private.token_for(p_email text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
	select encode(extensions.hmac(lower(btrim(p_email)), angels_private.setting('token_secret'), 'sha256'), 'hex')
$$;

-- The walker behind an email + token, or an error. Also records last seen.
create function angels_private.require_walker(p_email text, p_token text, out email text, out name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
	e text := public.angels_norm_email(p_email);
begin
	if p_token is null or p_token is distinct from angels_private.token_for(e) then
		raise exception 'Please log in or sign up first' using errcode = 'P0001';
	end if;
	update public.angels_walkers w set last_seen_at = now()
	where w.email = e
	returning w.email, w.name into email, name;
	if email is null then
		raise exception 'Please log in or sign up first' using errcode = 'P0001';
	end if;
end;
$$;

revoke all on all functions in schema angels_private from public, anon, authenticated;

-- Replace the public walker functions ------------------------------------------

drop function public.angels_login_walker(text);
drop function public.angels_signup_walker(text, text);
drop function public.angels_require_walker(text);
drop function public.angels_visible_names(text);
drop function public.angels_my_activity(text);
drop function public.angels_join_walk(uuid, text);
drop function public.angels_leave_walk(uuid, text);
drop function public.angels_add_suggestion(text, text, text);
drop function public.angels_toggle_vote(uuid, text);
drop function public.angels_delete_suggestion(uuid, text);
drop function public.angels_set_date_votes(uuid, date[], text);

-- Log in: needs the check answer. Returns name + token for a known walker,
-- or nulls for an email we don't know (so the app can offer sign up).
create function public.angels_login_walker(p_email text, p_answer text)
returns table (name text, token text)
language plpgsql
security definer
set search_path = public
as $$
declare
	e text := angels_norm_email(p_email);
	n text;
begin
	perform angels_private.check_answer(p_answer);
	update angels_walkers w set last_seen_at = now() where w.email = e returning w.name into n;
	return query select n, case when n is null then null else angels_private.token_for(e) end;
end;
$$;

-- Sign up: name, email and the check answer are all required. Signing up with
-- an email we already know just logs in (keeping the existing name).
create function public.angels_signup_walker(p_email text, p_name text, p_answer text)
returns table (name text, token text)
language plpgsql
security definer
set search_path = public
as $$
declare
	e text := angels_norm_email(p_email);
	n text := btrim(coalesce(p_name, ''));
begin
	perform angels_private.check_answer(p_answer);
	if n = '' then
		raise exception 'Please tell us your name' using errcode = 'P0001';
	end if;
	if char_length(n) > 60 then
		raise exception 'That name is a bit long - 60 characters at most' using errcode = 'P0001';
	end if;
	insert into angels_walkers as w (email, name) values (e, n)
	on conflict (email) do update set last_seen_at = now()
	returning w.name into n;
	return query select n, angels_private.token_for(e);
end;
$$;

-- "Who am I?" for a returning browser: their current name, or null if the
-- token is wrong or the walker has been removed.
create function public.angels_whoami(p_email text, p_token text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
	return (angels_private.require_walker(p_email, p_token)).name;
exception when sqlstate 'P0001' then
	return null;
end;
$$;

create function public.angels_my_activity(p_email text, p_token text)
returns table (kind text, ref_id uuid, vote_date date)
language plpgsql
security definer
set search_path = public
as $$
declare
	e text := (angels_private.require_walker(p_email, p_token)).email;
begin
	return query
		select 'walk', s.walk_id, null::date from angels_signups s where s.walker_email = e
		union all
		select 'vote', v.suggestion_id, null from angels_suggestion_votes v where v.walker_email = e
		union all
		select 'suggestion', g.id, null from angels_suggestions g where g.walker_email = e
		union all
		select 'date', d.walk_id, d.vote_date from angels_date_votes d where d.walker_email = e;
end;
$$;

create function public.angels_visible_names(p_email text, p_token text)
returns table (kind text, ref_id uuid, name text)
language plpgsql
security definer
set search_path = public
as $$
begin
	perform angels_private.require_walker(p_email, p_token);
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

create function public.angels_join_walk(p_walk_id uuid, p_email text, p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
	me record := angels_private.require_walker(p_email, p_token);
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

create function public.angels_leave_walk(p_walk_id uuid, p_email text, p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
	e text := (angels_private.require_walker(p_email, p_token)).email;
begin
	delete from public.angels_signups where walk_id = p_walk_id and walker_email = e;
end;
$$;

create function public.angels_add_suggestion(p_title text, p_details text, p_email text, p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
	me record := angels_private.require_walker(p_email, p_token);
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

create function public.angels_toggle_vote(p_suggestion_id uuid, p_email text, p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
	e text := (angels_private.require_walker(p_email, p_token)).email;
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

create function public.angels_delete_suggestion(p_suggestion_id uuid, p_email text, p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
	e text := (angels_private.require_walker(p_email, p_token)).email;
begin
	delete from public.angels_suggestions where id = p_suggestion_id and walker_email = e;
end;
$$;

create function public.angels_set_date_votes(p_walk_id uuid, p_dates date[], p_email text, p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
	w public.angels_walks;
	e text := (angels_private.require_walker(p_email, p_token)).email;
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
	public.angels_login_walker(text, text),
	public.angels_signup_walker(text, text, text),
	public.angels_whoami(text, text),
	public.angels_my_activity(text, text),
	public.angels_visible_names(text, text),
	public.angels_join_walk(uuid, text, text),
	public.angels_leave_walk(uuid, text, text),
	public.angels_add_suggestion(text, text, text, text),
	public.angels_toggle_vote(uuid, text, text),
	public.angels_delete_suggestion(uuid, text, text),
	public.angels_set_date_votes(uuid, date[], text, text)
from public;

grant execute on function
	public.angels_login_walker(text, text),
	public.angels_signup_walker(text, text, text),
	public.angels_whoami(text, text),
	public.angels_my_activity(text, text),
	public.angels_visible_names(text, text),
	public.angels_join_walk(uuid, text, text),
	public.angels_leave_walk(uuid, text, text),
	public.angels_add_suggestion(text, text, text, text),
	public.angels_toggle_vote(uuid, text, text),
	public.angels_delete_suggestion(uuid, text, text),
	public.angels_set_date_votes(uuid, date[], text, text)
to anon, authenticated;
