-- Shared expenses between roommates: groups, members, expenses with per-member shares, settlements, and recurring
-- expenses. Signed-in users only (auth.uid()). Members read everything in their groups; every write that has to keep
-- money consistent (shares summing to the amount, payer and share holders being members) goes through a function.

create function public.random_invite_code()
returns text
language sql
volatile
as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, 8);
$$;

create table public.expense_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  -- 8 chars from an alphabet without 0/O/1/I, so it can be read out loud.
  invite_code text not null unique default public.random_invite_code(),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.expense_groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.expense_groups (id) on delete cascade,
  description text not null check (char_length(btrim(description)) between 1 and 120),
  amount_cents bigint not null check (amount_cents between 1 and 100000000000),
  payer_id uuid not null,
  category text not null default 'general'
    check (category in ('general', 'rent', 'utilities', 'groceries', 'household', 'internet', 'dining', 'transport', 'other')),
  spent_on date not null default current_date,
  split_mode text not null check (split_mode in ('equal', 'exact', 'percent', 'shares', 'itemized')),
  -- Itemized expenses keep their lines for display: [{name, cents, members[]}]. The shares table is the source of truth.
  items jsonb check (items is null or jsonb_typeof(items) = 'array'),
  receipt_path text check (receipt_path is null or char_length(receipt_path) <= 200),
  recurring_id uuid,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (group_id, payer_id) references public.group_members (group_id, user_id)
);
create index expenses_group_idx on public.expenses (group_id, spent_on desc);

create table public.expense_shares (
  expense_id uuid not null references public.expenses (id) on delete cascade,
  group_id uuid not null,
  user_id uuid not null,
  amount_cents bigint not null check (amount_cents >= 0),
  primary key (expense_id, user_id),
  foreign key (group_id, user_id) references public.group_members (group_id, user_id)
);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.expense_groups (id) on delete cascade,
  from_id uuid not null,
  to_id uuid not null,
  amount_cents bigint not null check (amount_cents between 1 and 100000000000),
  settled_on date not null default current_date,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  check (from_id <> to_id),
  foreign key (group_id, from_id) references public.group_members (group_id, user_id),
  foreign key (group_id, to_id) references public.group_members (group_id, user_id)
);
create index settlements_group_idx on public.settlements (group_id, settled_on desc);

create table public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.expense_groups (id) on delete cascade,
  description text not null check (char_length(btrim(description)) between 1 and 120),
  amount_cents bigint not null check (amount_cents between 1 and 100000000000),
  payer_id uuid not null,
  category text not null default 'general',
  split_mode text not null,
  shares jsonb not null, -- {user_id: cents}, validated by save_recurring
  every text not null check (every in ('weekly', 'monthly')),
  next_on date not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (group_id, payer_id) references public.group_members (group_id, user_id)
);

alter table public.expenses
  add foreign key (recurring_id) references public.recurring_expenses (id) on delete set null;


-- security definer so RLS policies can call it without recursing into group_members' own policy.
create function public.is_member(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.group_members m where m.group_id = p_group and m.user_id = auth.uid());
$$;

alter table public.expense_groups enable row level security;
alter table public.group_members enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_shares enable row level security;
alter table public.settlements enable row level security;
alter table public.recurring_expenses enable row level security;

revoke all on public.expense_groups, public.group_members, public.expenses, public.expense_shares, public.settlements,
  public.recurring_expenses from anon, authenticated;
grant select on public.expense_groups, public.group_members, public.expenses, public.expense_shares, public.settlements,
  public.recurring_expenses to authenticated;
grant insert (group_id, from_id, to_id, amount_cents, settled_on) on public.settlements to authenticated;
grant delete on public.expenses, public.settlements, public.recurring_expenses to authenticated;
grant update (name, currency) on public.expense_groups to authenticated;
grant update (display_name) on public.group_members to authenticated;

create policy "members read groups" on public.expense_groups for select to authenticated using (public.is_member(id));
create policy "members rename groups" on public.expense_groups for update to authenticated
  using (public.is_member(id)) with check (public.is_member(id));
create policy "members read members" on public.group_members for select to authenticated using (public.is_member(group_id));
create policy "members rename themselves" on public.group_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "members read expenses" on public.expenses for select to authenticated using (public.is_member(group_id));
create policy "members delete expenses" on public.expenses for delete to authenticated using (public.is_member(group_id));
create policy "members read shares" on public.expense_shares for select to authenticated using (public.is_member(group_id));
create policy "members read settlements" on public.settlements for select to authenticated using (public.is_member(group_id));
create policy "members record settlements" on public.settlements for insert to authenticated
  with check (public.is_member(group_id));
create policy "members delete settlements" on public.settlements for delete to authenticated using (public.is_member(group_id));
create policy "members read recurring" on public.recurring_expenses for select to authenticated using (public.is_member(group_id));
create policy "members delete recurring" on public.recurring_expenses for delete to authenticated
  using (public.is_member(group_id));

create function public.create_group(p_name text, p_currency text, p_display_name text)
returns public.expense_groups
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  g public.expense_groups;
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  insert into public.expense_groups (name, currency, created_by) values (btrim(p_name), upper(p_currency), auth.uid())
    returning * into g;
  insert into public.group_members (group_id, user_id, display_name) values (g.id, auth.uid(), btrim(p_display_name));
  return g;
end;
$$;

create function public.join_group(p_code text, p_display_name text)
returns public.expense_groups
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  g public.expense_groups;
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select * into g from public.expense_groups where invite_code = upper(btrim(p_code));
  if not found then
    raise exception 'no group with this invite code' using errcode = 'P0002';
  end if;
  insert into public.group_members (group_id, user_id, display_name) values (g.id, auth.uid(), btrim(p_display_name))
    on conflict (group_id, user_id) do nothing;
  return g;
end;
$$;

-- Checks {user_id: cents} against the group and the total. Raises on any mismatch.
create function public.check_shares(p_group uuid, p_amount bigint, p_shares jsonb)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sum bigint;
begin
  if p_shares is null or jsonb_typeof(p_shares) <> 'object' or p_shares = '{}'::jsonb then
    raise exception 'shares must be a non-empty object' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each(p_shares) s where jsonb_typeof(s.value) <> 'number' or (s.value)::numeric < 0
      or (s.value)::numeric <> trunc((s.value)::numeric)) then
    raise exception 'each share must be a whole number of cents >= 0' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(p_shares) k
      where not exists (select 1 from public.group_members m where m.group_id = p_group and m.user_id::text = k)) then
    raise exception 'every share holder must be a member' using errcode = '22023';
  end if;
  select sum((s.value)::bigint) into v_sum from jsonb_each(p_shares) s;
  if v_sum <> p_amount then
    raise exception 'shares add up to % but the amount is %', v_sum, p_amount using errcode = '22023';
  end if;
end;
$$;

-- Creates (p_id null) or replaces an expense and its shares atomically.
create function public.save_expense(
  p_id uuid, p_group uuid, p_description text, p_amount bigint, p_payer uuid, p_category text, p_spent_on date,
  p_split_mode text, p_shares jsonb, p_items jsonb default null, p_receipt_path text default null
)
returns public.expenses
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  e public.expenses;
begin
  if not public.is_member(p_group) then
    raise exception 'not a member of this group' using errcode = '42501';
  end if;
  if p_receipt_path is not null and split_part(p_receipt_path, '/', 1) <> p_group::text then
    raise exception 'receipt must be stored under the group' using errcode = '22023';
  end if;
  perform public.check_shares(p_group, p_amount, p_shares);
  if p_id is null then
    insert into public.expenses (group_id, description, amount_cents, payer_id, category, spent_on, split_mode, items,
      receipt_path, created_by)
    values (p_group, btrim(p_description), p_amount, p_payer, p_category, coalesce(p_spent_on, current_date), p_split_mode,
      p_items, p_receipt_path, auth.uid())
    returning * into e;
  else
    update public.expenses set description = btrim(p_description), amount_cents = p_amount, payer_id = p_payer,
      category = p_category, spent_on = coalesce(p_spent_on, spent_on), split_mode = p_split_mode, items = p_items,
      receipt_path = p_receipt_path, updated_at = now()
    where id = p_id and group_id = p_group
    returning * into e;
    if not found then
      raise exception 'no such expense in this group' using errcode = 'P0002';
    end if;
    delete from public.expense_shares where expense_id = e.id;
  end if;
  insert into public.expense_shares (expense_id, group_id, user_id, amount_cents)
    select e.id, p_group, k::uuid, v::bigint from jsonb_each_text(p_shares) as s(k, v);
  return e;
end;
$$;

create function public.save_recurring(
  p_group uuid, p_description text, p_amount bigint, p_payer uuid, p_category text, p_split_mode text,
  p_shares jsonb, p_every text, p_next_on date
)
returns public.recurring_expenses
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  r public.recurring_expenses;
begin
  if not public.is_member(p_group) then
    raise exception 'not a member of this group' using errcode = '42501';
  end if;
  perform public.check_shares(p_group, p_amount, p_shares);
  insert into public.recurring_expenses (group_id, description, amount_cents, payer_id, category, split_mode, shares,
    every, next_on, created_by)
  values (p_group, btrim(p_description), p_amount, p_payer, p_category, p_split_mode, p_shares, p_every, p_next_on,
    auth.uid())
  returning * into r;
  return r;
end;
$$;

-- Adds every due occurrence of the group's recurring expenses (up to 24 each, so a long-idle group cannot loop
-- forever). Called by the app when a group opens; returns how many expenses it added.
create function public.materialize_recurring(p_group uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  r public.recurring_expenses;
  e_id uuid;
  n integer := 0;
  i integer;
begin
  if not public.is_member(p_group) then
    raise exception 'not a member of this group' using errcode = '42501';
  end if;
  for r in select * from public.recurring_expenses where group_id = p_group and next_on <= current_date for update loop
    i := 0;
    while r.next_on <= current_date and i < 24 loop
      -- A member who left makes the stored shares invalid; skip the occurrence rather than fail the whole group.
      begin
        perform public.check_shares(p_group, r.amount_cents, r.shares);
        insert into public.expenses (group_id, description, amount_cents, payer_id, category, spent_on, split_mode,
          recurring_id, created_by)
        values (p_group, r.description, r.amount_cents, r.payer_id, r.category, r.next_on, r.split_mode, r.id, r.created_by)
        returning id into e_id;
        insert into public.expense_shares (expense_id, group_id, user_id, amount_cents)
          select e_id, p_group, k::uuid, v::bigint from jsonb_each_text(r.shares) as s(k, v);
        n := n + 1;
      exception when others then
        null;
      end;
      r.next_on := case r.every when 'weekly' then r.next_on + 7 else (r.next_on + interval '1 month')::date end;
      i := i + 1;
    end loop;
    update public.recurring_expenses set next_on = r.next_on where id = r.id;
  end loop;
  return n;
end;
$$;

revoke all on function public.random_invite_code(), public.is_member(uuid), public.check_shares(uuid, bigint, jsonb)
  from public, anon;
revoke all on function public.create_group(text, text, text), public.join_group(text, text),
  public.save_expense(uuid, uuid, text, bigint, uuid, text, date, text, jsonb, jsonb, text),
  public.save_recurring(uuid, text, bigint, uuid, text, text, jsonb, text, date), public.materialize_recurring(uuid)
  from public, anon;
grant execute on function public.is_member(uuid), public.create_group(text, text, text), public.join_group(text, text),
  public.save_expense(uuid, uuid, text, bigint, uuid, text, date, text, jsonb, jsonb, text),
  public.save_recurring(uuid, text, bigint, uuid, text, text, jsonb, text, date), public.materialize_recurring(uuid)
  to authenticated;

-- The group id a receipt path starts with, or null for anything that is not '<uuid>/...'.
create function public.receipt_group(p_name text)
returns uuid
language sql
immutable
as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_name, '/', 1)::uuid end;
$$;

-- Receipt photos: private bucket, one folder per group, members only. Skipped where the storage schema is absent
-- (CI starts Supabase without the storage service).
do $do$
begin
  if to_regclass('storage.buckets') is null then
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('expense-receipts', 'expense-receipts', false, 5242880, array['image/jpeg'])
  on conflict (id) do nothing;
  create policy "members read receipts" on storage.objects for select to authenticated
    using (bucket_id = 'expense-receipts' and public.is_member(public.receipt_group(name)));
  create policy "members upload receipts" on storage.objects for insert to authenticated
    with check (bucket_id = 'expense-receipts' and public.is_member(public.receipt_group(name)));
end;
$do$;
