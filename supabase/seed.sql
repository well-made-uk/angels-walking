-- Example data for a local/test database: two walkers, a walk with a fixed
-- date, a walk whose date is being voted on, and a suggestion.
insert into public.angels_walkers (email, name) values
	('jane@example.com', 'Jane Smith'),
	('raj@example.com', 'Raj Patel');

insert into public.angels_walks (title, description, walk_date, start_time, meeting_point, distance_km, duration_mins, difficulty, max_people, notes)
values (
	'Autumn riverside stroll',
	'A gentle, flat loop along the river path and back through the park. Plenty of benches along the way.',
	current_date + 6, '10:00',
	'Village hall car park',
	4.5, 90, 'easy', 15,
	'Can be muddy after rain, so sensible shoes please. Café stop at the end for anyone who fancies it.'
);

insert into public.angels_signups (walk_id, name, walker_email)
select id, 'Raj Patel', 'raj@example.com' from public.angels_walks where title = 'Autumn riverside stroll';

insert into public.angels_walks (title, description, walk_month, start_time, meeting_point, distance_km, duration_mins, difficulty, max_people, notes)
values (
	'Hilltop views and woodland',
	'A steadier walk up to the viewpoint, returning through the beech woods.',
	(date_trunc('month', current_date) + interval '2 months')::date, '09:30',
	'Church lychgate',
	7.0, 150, 'moderate', 12,
	'One steep section of about 10 minutes. Bring water and a snack.'
);

insert into public.angels_suggestions (title, details, suggested_by, walker_email)
values ('Canal towpath to the lock café', 'Flat, pushchair- and wheelchair-friendly, about 5km there and back.', 'Jane Smith', 'jane@example.com');
