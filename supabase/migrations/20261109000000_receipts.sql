-- Server receipts: the server only ever learns SHA-256 hex strings and when it first saw them.
create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  sha256 text unique not null check (sha256 ~ '^[0-9a-f]{64}$'),
  server_time timestamptz not null default now()
);

alter table public.receipts enable row level security;

-- Supabase grants everything on new public tables to anon and authenticated by default; anon gets INSERT only.
revoke all on table public.receipts from anon, authenticated;
grant insert on table public.receipts to anon;

create policy "anon can insert receipts" on public.receipts
  for insert to anon with check (true);

-- The only read path: look up one receipt by full hash or by a prefix of at least 12 hex chars.
create function public.lookup_receipt(p_hash text)
returns table (sha256 text, server_time timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_hash is null or p_hash !~ '^[0-9a-f]{12,64}$' then
    raise exception 'p_hash must be 12 to 64 lowercase hex characters' using errcode = '22023';
  end if;
  if length(p_hash) = 64 then
    return query select r.sha256, r.server_time from public.receipts r where r.sha256 = p_hash limit 1;
  else
    return query select r.sha256, r.server_time from public.receipts r
      where r.sha256 like p_hash || '%' order by r.server_time limit 1;
  end if;
end;
$$;

revoke all on function public.lookup_receipt(text) from public, anon, authenticated;
grant execute on function public.lookup_receipt(text) to anon;
