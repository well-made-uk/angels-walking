-- Voting now closes 2 weeks (was 21 days) before the walk month starts.
-- Keep in sync with VOTE_LEAD_DAYS in src/lib/walks.ts.
create or replace function public.angels_vote_lead_days()
returns int
language sql
immutable
set search_path = ''
as $$ select 14 $$;

-- Move the deadline for walks still being voted on.
update public.angels_walks
set votes_close_at = ((walk_month - public.angels_vote_lead_days()) + time '00:00') at time zone 'Europe/London'
where walk_date is null and not cancelled;
