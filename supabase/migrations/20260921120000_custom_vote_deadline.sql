-- Organisers can set their own voting deadline (the last day people can
-- vote), e.g. for a walk planned at short notice. Left empty, voting closes
-- 2 weeks before the earliest day on offer, as before.

alter table public.angels_walks add column vote_deadline date;

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

	if new.vote_deadline is not null and new.vote_deadline >= first_option then
		raise exception 'The voting deadline needs to be before the first day on offer' using errcode = 'P0001';
	end if;

	-- Voting closes at midnight after the last voting day.
	new.votes_close_at :=
		((coalesce(new.vote_deadline, first_option - angels_vote_lead_days() - 1) + 1) + time '00:00')
		at time zone 'Europe/London';

	if tg_op = 'UPDATE' and new.vote_options is distinct from old.vote_options then
		delete from angels_date_votes where walk_id = new.id and not (vote_date = any (new.vote_options));
	end if;
	return new;
end;
$$;

revoke execute on function public.angels_walks_prepare() from public, anon, authenticated;
