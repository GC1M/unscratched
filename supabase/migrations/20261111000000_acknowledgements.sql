-- Landlord acknowledgements of a report, keyed on its manifest hash (the hash behind the PDF's verification code).
-- The server learns the hash plus the name the landlord typed; nothing about the tenant.
create table public.acknowledgements (
  id uuid primary key default gen_random_uuid(),
  manifest_sha256 text not null check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  landlord_name text not null check (char_length(landlord_name) between 1 and 100),
  acknowledged_at timestamptz not null default now()
);

create index acknowledgements_manifest_idx on public.acknowledgements (manifest_sha256);

-- No policies and no grants: anon reaches the table only through the two functions below.
alter table public.acknowledgements enable row level security;
revoke all on table public.acknowledgements from anon, authenticated;

-- Only reports with a server receipt can be acknowledged, at most 5 times each, so one link cannot fill the table.
create function public.acknowledge_report(p_hash text, p_name text)
returns table (landlord_name text, acknowledged_at timestamptz)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_name text := btrim(p_name);
begin
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'p_hash must be 64 lowercase hex characters' using errcode = '22023';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 100 or v_name ~ '[[:cntrl:]]' then
    raise exception 'p_name must be 1 to 100 printable characters' using errcode = '22023';
  end if;
  if not exists (select 1 from public.receipts r where r.sha256 = p_hash) then
    raise exception 'no report with this hash' using errcode = 'P0002';
  end if;
  -- Serialize per hash so concurrent calls cannot overshoot the cap.
  perform pg_advisory_xact_lock(hashtext(p_hash));
  if (select count(*) from public.acknowledgements a where a.manifest_sha256 = p_hash) >= 5 then
    raise exception 'too many acknowledgements for this report' using errcode = '54000';
  end if;
  return query insert into public.acknowledgements as a (manifest_sha256, landlord_name)
    values (p_hash, v_name) returning a.landlord_name, a.acknowledged_at;
end;
$$;

-- Lookup needs the full hash (from the shared link), never a prefix.
create function public.lookup_acknowledgements(p_hash text)
returns table (landlord_name text, acknowledged_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'p_hash must be 64 lowercase hex characters' using errcode = '22023';
  end if;
  return query select a.landlord_name, a.acknowledged_at from public.acknowledgements a
    where a.manifest_sha256 = p_hash order by a.acknowledged_at;
end;
$$;

revoke all on function public.acknowledge_report(text, text) from public, anon, authenticated;
revoke all on function public.lookup_acknowledgements(text) from public, anon, authenticated;
grant execute on function public.acknowledge_report(text, text) to anon;
grant execute on function public.lookup_acknowledgements(text) to anon;
