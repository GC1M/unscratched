-- Daily request counts for the suggest-note edge function's per-install rate limit.
-- Holds only a random install id, a day, and a count. Never any image data.
create table public.suggest_note_usage (
  install_id uuid not null,
  day date not null default current_date,
  count integer not null default 0,
  primary key (install_id, day)
);

-- RLS on with no policies, and no grants: anon and authenticated cannot touch it. Only the function (service role) can.
alter table public.suggest_note_usage enable row level security;
revoke all on table public.suggest_note_usage from anon, authenticated;

-- Atomically counts one request for today and returns today's total.
create function public.bump_suggest_note_usage(p_install_id uuid)
returns integer
language sql
volatile
security definer
set search_path = public
as $$
  insert into public.suggest_note_usage as u (install_id, day, count)
  values (p_install_id, current_date, 1)
  on conflict (install_id, day) do update set count = u.count + 1
  returning u.count;
$$;

revoke all on function public.bump_suggest_note_usage(uuid) from public, anon, authenticated;
grant execute on function public.bump_suggest_note_usage(uuid) to service_role;
