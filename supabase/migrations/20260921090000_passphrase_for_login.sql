-- Log in now uses the group passphrase too (instead of "Which city do we
-- volunteer in?"), so there's one thing to remember, shared in the volunteer
-- WhatsApp group. p_answer keeps its name so the function signature is
-- unchanged; it now carries the passphrase.
create or replace function public.angels_login_walker(p_email text, p_answer text)
returns table (name text, token text)
language plpgsql
security definer
set search_path = public
as $$
declare
	e text := angels_norm_email(p_email);
	n text;
begin
	perform angels_private.check_passphrase(p_answer);
	update angels_walkers w set last_seen_at = now() where w.email = e returning w.name into n;
	return query select n, case when n is null then null else angels_private.token_for(e) end;
end;
$$;

-- The city question is no longer used.
drop function angels_private.check_answer(text);
delete from angels_private.settings where key = 'check_answer';
