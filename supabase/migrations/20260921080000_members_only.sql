-- Members only: walk details are only for logged-in walkers.
--
-- * Sign up needs the group passphrase (shared privately with volunteers);
--   log in still uses the "Which city do we volunteer in?" answer.
-- * Walks, sign-ups, suggestions and votes are no longer readable through the
--   public API. Walkers get them from angels_walker_feed(), which needs their
--   walker token; organisers read the tables directly.
-- * Route images move to a private bucket. Organiser pages create long-lived
--   signed links (stored in route_image_url), which only reach walkers via
--   the feed.

-- Sign-up passphrase ------------------------------------------------------------

-- The real passphrase is never committed (this repo is public). Set it in the
-- Supabase SQL editor - lowercase, letters and numbers only:
--   update angels_private.settings set value = 'yourpassphrase' where key = 'signup_passphrase';
insert into angels_private.settings (key, value)
values ('signup_passphrase', 'change-me-in-the-sql-editor')
on conflict (key) do nothing;

-- Compared ignoring case, spaces and punctuation.
create function angels_private.check_passphrase(p_passphrase text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if lower(regexp_replace(coalesce(p_passphrase, ''), '[^[:alnum:]]', '', 'g'))
		is distinct from angels_private.setting('signup_passphrase') then
		raise exception 'That passphrase isn''t right - ask the organiser or check the volunteer group chat.' using errcode = 'P0001';
	end if;
end;
$$;
revoke all on function angels_private.check_passphrase(text) from public, anon, authenticated;

drop function public.angels_signup_walker(text, text, text);
create function public.angels_signup_walker(p_email text, p_name text, p_passphrase text)
returns table (name text, token text)
language plpgsql
security definer
set search_path = public
as $$
declare
	e text := angels_norm_email(p_email);
	n text := btrim(coalesce(p_name, ''));
begin
	perform angels_private.check_passphrase(p_passphrase);
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
revoke execute on function public.angels_signup_walker(text, text, text) from public;
grant execute on function public.angels_signup_walker(text, text, text) to anon, authenticated;

-- Route images: private bucket + signed links ----------------------------------

update storage.buckets set public = false where id = 'angels-routes';

-- Organisers need to read objects to create signed links.
create policy "angels organisers read route images" on storage.objects
	for select to authenticated
	using (bucket_id = 'angels-routes' and public.angels_is_organiser());

alter table public.angels_walks
	add column route_image_url text,
	add column route_image_url_expires timestamptz;

-- Tables: organisers only ---------------------------------------------------------

drop policy "walks are public" on public.angels_walks;
create policy "organisers read walks" on public.angels_walks
	for select to authenticated using (public.angels_is_organiser());
revoke all on public.angels_walks from anon;

drop policy "signups are public" on public.angels_signups;
create policy "organisers read signups" on public.angels_signups
	for select to authenticated using (public.angels_is_organiser());
revoke all on public.angels_signups from anon;

drop policy "suggestions are public" on public.angels_suggestions;
create policy "organisers read suggestions" on public.angels_suggestions
	for select to authenticated using (public.angels_is_organiser());
revoke all on public.angels_suggestions from anon;

drop policy "votes are countable" on public.angels_suggestion_votes;
create policy "organisers count votes" on public.angels_suggestion_votes
	for select to authenticated using (public.angels_is_organiser());
revoke all on public.angels_suggestion_votes from anon;

revoke all on public.angels_suggestions_ranked from anon;

-- Vote tallies: organisers only (walkers get theirs in the feed).
create or replace function public.angels_date_tallies()
returns table (walk_id uuid, vote_date date, votes int, voters int)
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
		select
			v.walk_id,
			v.vote_date,
			count(*)::int,
			(select count(distinct x.walker_email) from angels_date_votes x where x.walk_id = v.walk_id)::int
		from angels_date_votes v
		join angels_walks w on w.id = v.walk_id and w.walk_date is null
		group by v.walk_id, v.vote_date;
end;
$$;
revoke execute on function public.angels_date_tallies() from public, anon;
grant execute on function public.angels_date_tallies() to authenticated;

-- Names now come with the feed.
drop function public.angels_visible_names(text, text);

-- The walker feed -------------------------------------------------------------------

-- Everything a logged-in walker sees: the next couple of walks (with who's
-- going, date-vote tallies and who suggested them) and the open suggestions.
create function public.angels_walker_feed(p_email text, p_token text, p_max_walks int default 2)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
	walks jsonb;
	ideas jsonb;
begin
	perform angels_private.require_walker(p_email, p_token);
	-- Lock in any votes that have closed before showing anything.
	perform angels_lock_due_walks();

	select coalesce(jsonb_agg(x.walk order by x.sort_key), '[]'::jsonb) into walks
	from (
		select
			coalesce(w.starts_at, w.walk_month::timestamptz) as sort_key,
			jsonb_build_object(
				'id', w.id,
				'title', w.title,
				'description', w.description,
				'starts_at', w.starts_at,
				'walk_date', w.walk_date,
				'walk_month', w.walk_month,
				'start_time', w.start_time,
				'votes_close_at', w.votes_close_at,
				'meeting_point', w.meeting_point,
				'distance_km', w.distance_km,
				'duration_mins', w.duration_mins,
				'difficulty', w.difficulty,
				'max_people', w.max_people,
				'notes', w.notes,
				'cancelled', w.cancelled,
				'route_image_url', case when w.route_image_url_expires > now() then w.route_image_url end,
				'suggested_by', g.suggested_by,
				'signups', coalesce((
					select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'created_at', s.created_at) order by s.created_at)
					from angels_signups s where s.walk_id = w.id
				), '[]'::jsonb),
				'tallies', coalesce((
					select jsonb_agg(jsonb_build_object('date', t.vote_date, 'votes', t.votes) order by t.vote_date)
					from (
						select d.vote_date, count(*)::int as votes
						from angels_date_votes d where d.walk_id = w.id and w.walk_date is null
						group by d.vote_date
					) t
				), '[]'::jsonb),
				'voters', (select count(distinct d.walker_email) from angels_date_votes d where d.walk_id = w.id)
			) as walk
		from angels_walks w
		left join angels_suggestions g on g.id = w.suggestion_id
		where w.walk_date is null or w.starts_at >= now() - interval '3 hours'
		order by coalesce(w.starts_at, w.walk_month::timestamptz)
		limit greatest(1, least(coalesce(p_max_walks, 2), 12))
	) x;

	select coalesce(jsonb_agg(jsonb_build_object(
		'id', r.id, 'title', r.title, 'details', r.details, 'created_at', r.created_at,
		'votes', r.votes, 'suggested_by', g.suggested_by
	) order by r.votes desc, r.created_at desc), '[]'::jsonb) into ideas
	from (
		select s.id, s.title, s.details, s.created_at,
			(select count(*) from angels_suggestion_votes v where v.suggestion_id = s.id)::int as votes
		from angels_suggestions s
		where not exists (select 1 from angels_walks w where w.suggestion_id = s.id and not w.cancelled)
	) r
	join angels_suggestions g on g.id = r.id;

	return jsonb_build_object('walks', walks, 'suggestions', ideas);
end;
$$;
revoke execute on function public.angels_walker_feed(text, text, int) from public;
grant execute on function public.angels_walker_feed(text, text, int) to anon, authenticated;
