-- Date voting, route images, promoting suggestions, and organiser access.
--
-- A walk either has a fixed `walk_date`, or (while `walk_date` is null) it is
-- "date to be decided": people vote on the weekend days of `walk_month`, and
-- once `votes_close_at` passes the most popular date is locked in.
--
-- Times are local to Europe/London; keep this in sync with TIME_ZONE in
-- src/lib/format.ts.

-- Walks ---------------------------------------------------------------------

alter table public.angels_walks
	alter column starts_at drop not null,
	add column walk_date        date,
	add column walk_month       date,
	add column start_time       time not null default '10:00',
	add column votes_close_at   timestamptz,
	add column route_image_path text,
	add column suggestion_id    uuid references public.angels_suggestions (id) on delete set null;

update public.angels_walks
set walk_date = (starts_at at time zone 'Europe/London')::date,
	start_time = (starts_at at time zone 'Europe/London')::time
where starts_at is not null;

update public.angels_walks set walk_month = date_trunc('month', walk_date)::date;

alter table public.angels_walks alter column walk_month set not null;

create index angels_walks_suggestion_id_idx on public.angels_walks (suggestion_id);

-- Date votes ----------------------------------------------------------------

create table public.angels_date_votes (
	walk_id      uuid not null references public.angels_walks (id) on delete cascade,
	vote_date    date not null,
	device_token uuid not null,
	created_at   timestamptz not null default now(),
	primary key (walk_id, vote_date, device_token)
);

alter table public.angels_date_votes enable row level security;
revoke all on public.angels_date_votes from anon, authenticated;

-- How many days before the walk month voting closes.
create or replace function public.angels_vote_lead_days()
returns int
language sql
immutable
as $$ select 21 $$;

-- Keep starts_at / walk_month / votes_close_at consistent with walk_date.
create or replace function public.angels_walks_prepare()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	if new.walk_date is not null then
		new.walk_month := date_trunc('month', new.walk_date)::date;
		new.starts_at := (new.walk_date + new.start_time) at time zone 'Europe/London';
	else
		if new.walk_month is null then
			raise exception 'A walk needs either a date or a month to vote on';
		end if;
		new.walk_month := date_trunc('month', new.walk_month)::date;
		new.starts_at := null;
		if tg_op = 'INSERT' or new.walk_month is distinct from old.walk_month or new.votes_close_at is null then
			new.votes_close_at :=
				((new.walk_month - angels_vote_lead_days()) + time '00:00') at time zone 'Europe/London';
		end if;
		-- Votes for a different month no longer make sense.
		if tg_op = 'UPDATE' and new.walk_month is distinct from old.walk_month then
			delete from angels_date_votes where walk_id = new.id;
		end if;
	end if;
	return new;
end;
$$;

create trigger angels_walks_prepare
before insert or update on public.angels_walks
for each row execute function public.angels_walks_prepare();

-- Organisers ----------------------------------------------------------------

create table public.angels_organisers (
	user_id    uuid primary key references auth.users (id) on delete cascade,
	created_at timestamptz not null default now()
);

alter table public.angels_organisers enable row level security;
revoke all on public.angels_organisers from anon, authenticated;
grant select on public.angels_organisers to authenticated;
create policy "organisers can see themselves" on public.angels_organisers
	for select to authenticated using (user_id = auth.uid());

create or replace function public.angels_is_organiser()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
	select exists (select 1 from angels_organisers where user_id = auth.uid());
$$;

create policy "organisers add walks" on public.angels_walks
	for insert to authenticated with check (public.angels_is_organiser());
create policy "organisers edit walks" on public.angels_walks
	for update to authenticated using (public.angels_is_organiser()) with check (public.angels_is_organiser());
create policy "organisers delete walks" on public.angels_walks
	for delete to authenticated using (public.angels_is_organiser());

create policy "organisers remove signups" on public.angels_signups
	for delete to authenticated using (public.angels_is_organiser());
grant delete on public.angels_signups to authenticated;

create policy "organisers remove suggestions" on public.angels_suggestions
	for delete to authenticated using (public.angels_is_organiser());
grant delete on public.angels_suggestions to authenticated;

-- Route images --------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('angels-routes', 'angels-routes', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "angels organisers upload route images" on storage.objects
	for insert to authenticated
	with check (bucket_id = 'angels-routes' and public.angels_is_organiser());
create policy "angels organisers update route images" on storage.objects
	for update to authenticated
	using (bucket_id = 'angels-routes' and public.angels_is_organiser());
create policy "angels organisers delete route images" on storage.objects
	for delete to authenticated
	using (bucket_id = 'angels-routes' and public.angels_is_organiser());

-- Suggestions: know which have become walks ---------------------------------

create or replace view public.angels_suggestions_ranked
with (security_invoker = true) as
select
	s.id,
	s.title,
	s.details,
	s.suggested_by,
	s.created_at,
	count(v.suggestion_id)::int as votes,
	exists (
		select 1 from public.angels_walks w where w.suggestion_id = s.id and not w.cancelled
	) as promoted
from public.angels_suggestions s
left join public.angels_suggestion_votes v on v.suggestion_id = s.id
group by s.id;

-- Functions -----------------------------------------------------------------

-- Joining now requires a decided date.
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
	if w.walk_date is null then
		raise exception 'The date hasn''t been decided yet - vote for the days you can make' using errcode = 'P0001';
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

-- Replace this device's date votes for a walk.
create or replace function public.angels_set_date_votes(p_walk_id uuid, p_dates date[], p_device uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
	w public.angels_walks;
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

	delete from public.angels_date_votes where walk_id = p_walk_id and device_token = p_device;
	insert into public.angels_date_votes (walk_id, vote_date, device_token)
	select distinct p_walk_id, d, p_device from unnest(coalesce(p_dates, '{}')) d;
end;
$$;

-- Vote counts for walks that are still being voted on.
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
		(select count(distinct x.device_token) from angels_date_votes x where x.walk_id = v.walk_id)::int
	from angels_date_votes v
	join angels_walks w on w.id = v.walk_id and w.walk_date is null
	group by v.walk_id, v.vote_date;
$$;

create or replace function public.angels_my_date_votes(p_device uuid)
returns table (walk_id uuid, vote_date date)
language sql
stable
security definer
set search_path = public
as $$
	select walk_id, vote_date from angels_date_votes where device_token = p_device;
$$;

-- Lock in the most popular date (ties go to the earliest). If nobody voted,
-- the first Saturday of the month is used. Anyone may trigger this once
-- voting has closed; organisers may force it early.
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

	if pick is null then
		pick := w.walk_month + ((6 - extract(isodow from w.walk_month)::int + 7) % 7);
	end if;

	update angels_walks set walk_date = pick where id = p_walk_id;
	return pick;
end;
$$;

-- Called whenever the walks page loads, so polls close on time without a
-- scheduled job.
create or replace function public.angels_lock_due_walks()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
	r record;
	n int := 0;
begin
	for r in
		select id from angels_walks
		where walk_date is null and not cancelled and votes_close_at <= now()
	loop
		perform angels_lock_walk(r.id);
		n := n + 1;
	end loop;
	return n;
end;
$$;

revoke execute on function
	public.angels_walks_prepare(),
	public.angels_is_organiser(),
	public.angels_set_date_votes(uuid, date[], uuid),
	public.angels_date_tallies(),
	public.angels_my_date_votes(uuid),
	public.angels_lock_walk(uuid, boolean),
	public.angels_lock_due_walks()
from public;

grant execute on function
	public.angels_is_organiser(),
	public.angels_set_date_votes(uuid, date[], uuid),
	public.angels_date_tallies(),
	public.angels_my_date_votes(uuid),
	public.angels_lock_walk(uuid, boolean),
	public.angels_lock_due_walks()
to anon, authenticated;
