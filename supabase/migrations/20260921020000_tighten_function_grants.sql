-- Supabase grants EXECUTE on new public functions to the API roles by
-- default; the trigger function should never be called directly.
revoke execute on function public.angels_walks_prepare() from anon, authenticated;
alter function public.angels_vote_lead_days() set search_path = '';
