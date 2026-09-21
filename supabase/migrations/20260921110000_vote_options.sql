-- Organisers now pick exactly which days go to the vote (weekends and bank
-- holidays are pre-ticked in the form), instead of every weekend of a month.
--
-- * vote_options: the days on offer (sorted, no duplicates).
-- * walk_month becomes "the month of the earliest option" (used for sorting).
-- * Voting closes 2 weeks before the earliest option.
-- * Votes for days that are taken out of the vote are removed.

alter table public.angels_walks add column vote_options date[];

create or replace function public.angels_walks_prepare()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
	first_option date;
begin
	if new.walk_date is not null then
		new.walk_month := date_trunc('month', new.walk_date)::date;
		new.starts_at := (new.walk_date + new.start_time) at time zone 'Europe/London';
		return new;
	end if;

	-- Tidy the options: sorted, unique.
	select array_agg(distinct d order by d) into new.vote_options from unnest(new.vote_options) d where d is not null;
	if coalesce(cardinality(new.vote_options), 0) = 0 then
		raise exception 'Pick at least one day for people to vote on' using errcode = 'P0001';
	end if;
	if cardinality(new.vote_options) > 31 then
		raise exception 'That''s a lot of days - pick 31 or fewer' using errcode = 'P0001';
	end if;

	first_option := new.vote_options[1];
	new.walk_month := date_trunc('month', first_option)::date;
	new.starts_at := null;

	if tg_op = 'INSERT'
		or new.votes_close_at is null
		or new.vote_options is distinct from old.vote_options then
		new.votes_close_at := ((first_option - angels_vote_lead_days()) + time '00:00') at time zone 'Europe/London';
	end if;

	if tg_op = 'UPDATE' and new.vote_options is distinct from old.vote_options then
		delete from angels_date_votes where walk_id = new.id and not (vote_date = any (new.vote_options));
	end if;
	return new;
end;
$$;

revoke execute on function public.angels_walks_prepare() from public, anon, authenticated;

create or replace function public.angels_set_date_votes(p_walk_id uuid, p_dates date[], p_email text, p_token text)
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
	if exists (select 1 from unnest(coalesce(p_dates, '{}')) d where not (d = any (w.vote_options))) then
		raise exception 'Please pick from the days on offer' using errcode = 'P0001';
	end if;

	delete from public.angels_date_votes where walk_id = p_walk_id and walker_email = e;
	insert into public.angels_date_votes (walk_id, vote_date, walker_email)
	select distinct p_walk_id, d, e from unnest(coalesce(p_dates, '{}')) d;
end;
$$;

-- With no votes, the earliest day on offer is chosen.
create or replace function public.angels_lock_walk(p_walk_id uuid, p_force boolean default false)
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
	w angels_walks;
	pick date;
begin
	select * into w from angels_walks where id = p_walk_id for update;
	if not found or w.walk_date is not null then
		return w.walk_date;
	end if;
	if p_force then
		if not angels_is_organiser() then
			raise exception 'Only organisers can lock in a date early' using errcode = 'P0001';
		end if;
	elsif w.votes_close_at > now() then
		return null;
	end if;

	select vote_date into pick
	from angels_date_votes
	where walk_id = p_walk_id
	group by vote_date
	order by count(*) desc, vote_date
	limit 1;

	pick := coalesce(pick, w.vote_options[1]);
	update angels_walks set walk_date = pick where id = p_walk_id;
	return pick;
end;
$$;

-- The feed now includes the days on offer.
create or replace function public.angels_walker_feed(p_email text, p_token text, p_max_walks int default 2)
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
				'vote_options', w.vote_options,
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
