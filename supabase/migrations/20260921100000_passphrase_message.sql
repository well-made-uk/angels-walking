-- Reword the wrong-passphrase message (no "volunteer" wording).
create or replace function angels_private.check_passphrase(p_passphrase text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if lower(regexp_replace(coalesce(p_passphrase, ''), '[^[:alnum:]]', '', 'g'))
		is distinct from angels_private.setting('signup_passphrase') then
		raise exception 'That passphrase isn''t right - it''s in the WhatsApp group description, or ask the organiser.' using errcode = 'P0001';
	end if;
end;
$$;
revoke all on function angels_private.check_passphrase(text) from public, anon, authenticated;
