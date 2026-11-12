-- More shared-expense features: people who have not signed up yet (placeholders a new member can claim), leaving and
-- removing members, several payers per expense, the adjustment split, notes and comments, expenses entered in another
-- currency, soft delete with restore, an activity log (also the realtime feed), per-group settings (simplify debts,
-- default split), deleting a group, and a fresh invite code.

-- Members -------------------------------------------------------------------------------------------------------------

-- A placeholder member has a random id that is not an account, so the auth foreign key goes. Every reference to a
-- member cascades on update: claiming a placeholder just rewrites its user_id to the claimer's. Members are only ever
-- removed softly (left_at), so the delete cascade only runs when a whole group is deleted.
alter table public.group_members drop constraint group_members_user_id_fkey;
alter table public.group_members
  add column placeholder boolean not null default false,
  add column left_at timestamptz;

alter table public.expenses drop constraint expenses_group_id_payer_id_fkey,
  add foreign key (group_id, payer_id) references public.group_members (group_id, user_id) on update cascade on delete cascade;
alter table public.expense_shares drop constraint expense_shares_group_id_user_id_fkey,
  add foreign key (group_id, user_id) references public.group_members (group_id, user_id) on update cascade on delete cascade;
alter table public.settlements drop constraint settlements_group_id_from_id_fkey,
  drop constraint settlements_group_id_to_id_fkey,
  add foreign key (group_id, from_id) references public.group_members (group_id, user_id) on update cascade on delete cascade,
  add foreign key (group_id, to_id) references public.group_members (group_id, user_id) on update cascade on delete cascade;
alter table public.recurring_expenses drop constraint recurring_expenses_group_id_payer_id_fkey,
  add foreign key (group_id, payer_id) references public.group_members (group_id, user_id) on update cascade on delete cascade;

-- Former members keep their history but lose access.
create or replace function public.is_member(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members m where m.group_id = p_group and m.user_id = auth.uid() and m.left_at is null
  );
$$;

-- Shares and payers may only name current members.
create or replace function public.check_shares(p_group uuid, p_amount bigint, p_shares jsonb)
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
  if exists (select 1 from jsonb_object_keys(p_shares) k where not exists (
      select 1 from public.group_members m where m.group_id = p_group and m.user_id::text = k and m.left_at is null)) then
    raise exception 'every share holder must be a member' using errcode = '22023';
  end if;
  select sum((s.value)::bigint) into v_sum from jsonb_each(p_shares) s;
  if v_sum <> p_amount then
    raise exception 'shares add up to % but the amount is %', v_sum, p_amount using errcode = '22023';
  end if;
end;
$$;

-- Expenses ------------------------------------------------------------------------------------------------------------

create table public.expense_payers (
  expense_id uuid not null references public.expenses (id) on delete cascade,
  group_id uuid not null,
  user_id uuid not null,
  amount_cents bigint not null check (amount_cents > 0),
  primary key (expense_id, user_id),
  foreign key (group_id, user_id) references public.group_members (group_id, user_id) on update cascade on delete cascade
);
insert into public.expense_payers (expense_id, group_id, user_id, amount_cents)
  select id, group_id, payer_id, amount_cents from public.expenses;

alter table public.expenses
  drop constraint expenses_split_mode_check,
  add constraint expenses_split_mode_check check (split_mode in ('equal', 'exact', 'percent', 'shares', 'adjust', 'itemized')),
  add column notes text check (notes is null or char_length(notes) <= 500),
  add column deleted_at timestamptz,
  -- Entered in another currency: what was typed. amount_cents is always in the group's currency.
  add column original_currency text check (original_currency ~ '^[A-Z]{3}$'),
  add column original_amount_cents bigint check (original_amount_cents > 0),
  add constraint expenses_original_check check ((original_currency is null) = (original_amount_cents is null));

create table public.expense_comments (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses (id) on delete cascade,
  group_id uuid not null,
  user_id uuid not null default auth.uid(),
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now(),
  foreign key (group_id, user_id) references public.group_members (group_id, user_id) on update cascade on delete cascade
);
create index expense_comments_expense_idx on public.expense_comments (expense_id, created_at);

-- Groups --------------------------------------------------------------------------------------------------------------

alter table public.expense_groups
  add column simplify_debts boolean not null default true,
  -- {user_id: weight} used to prefill new expenses as a split by shares.
  add column default_shares jsonb check (default_shares is null or jsonb_typeof(default_shares) = 'object');

-- Activity ------------------------------------------------------------------------------------------------------------

create table public.group_activity (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.expense_groups (id) on delete cascade,
  actor_id uuid,
  kind text not null,
  ref_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index group_activity_group_idx on public.group_activity (group_id, id desc);

-- Rows are written only by the triggers below. Cascading deletes of a whole group skip logging (the group is gone).
create function public.log_activity(p_group uuid, p_kind text, p_ref uuid, p_detail jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.expense_groups where id = p_group) then
    insert into public.group_activity (group_id, actor_id, kind, ref_id, detail) values (p_group, auth.uid(), p_kind, p_ref, p_detail);
  end if;
end;
$$;

create function public.expenses_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d jsonb := jsonb_build_object('description', new.description, 'amount_cents', new.amount_cents);
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(new.group_id, 'expense_added', new.id, d);
  elsif old.deleted_at is null and new.deleted_at is not null then
    perform public.log_activity(new.group_id, 'expense_deleted', new.id, d);
  elsif old.deleted_at is not null and new.deleted_at is null then
    perform public.log_activity(new.group_id, 'expense_restored', new.id, d);
  elsif new.updated_at <> old.updated_at then
    perform public.log_activity(new.group_id, 'expense_edited', new.id, d || jsonb_build_object('old_amount_cents', old.amount_cents));
  end if;
  return null;
end;
$$;
create trigger expenses_activity after insert or update on public.expenses
  for each row execute function public.expenses_activity();

create function public.settlements_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.settlements := case when tg_op = 'DELETE' then old else new end;
begin
  perform public.log_activity(s.group_id, case when tg_op = 'DELETE' then 'payment_deleted' else 'payment_added' end, s.id,
    jsonb_build_object('from_id', s.from_id, 'to_id', s.to_id, 'amount_cents', s.amount_cents));
  return null;
end;
$$;
create trigger settlements_activity after insert or delete on public.settlements
  for each row execute function public.settlements_activity();

create function public.members_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d jsonb := jsonb_build_object('user_id', new.user_id, 'name', new.display_name);
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(new.group_id, case when new.placeholder then 'member_added' else 'member_joined' end, null, d);
  elsif old.left_at is null and new.left_at is not null then
    perform public.log_activity(new.group_id, 'member_left', null, d);
  elsif old.left_at is not null and new.left_at is null then
    perform public.log_activity(new.group_id, 'member_joined', null, d);
  elsif old.placeholder and not new.placeholder then
    perform public.log_activity(new.group_id, 'member_claimed', null, d || jsonb_build_object('was', old.display_name));
  end if;
  return null;
end;
$$;
create trigger members_activity after insert or update on public.group_members
  for each row execute function public.members_activity();

create function public.comments_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.log_activity(new.group_id, 'comment_added', new.expense_id, jsonb_build_object('body', left(new.body, 80)));
  return null;
end;
$$;
create trigger comments_activity after insert on public.expense_comments
  for each row execute function public.comments_activity();

create function public.groups_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.name, new.currency, new.simplify_debts, new.default_shares, new.invite_code)
      is distinct from (old.name, old.currency, old.simplify_debts, old.default_shares, old.invite_code) then
    perform public.log_activity(new.id, 'group_updated', null, jsonb_build_object('name', new.name));
  end if;
  return null;
end;
$$;
create trigger groups_activity after update on public.expense_groups
  for each row execute function public.groups_activity();

-- Recurring changes also land in the feed so other phones refresh.
create function public.recurring_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.recurring_expenses := case when tg_op = 'DELETE' then old else new end;
begin
  if tg_op = 'UPDATE' then
    return null; -- next_on moving forward is bookkeeping, and the expenses it adds are logged themselves.
  end if;
  perform public.log_activity(r.group_id, case when tg_op = 'DELETE' then 'recurring_deleted' else 'recurring_added' end, r.id,
    jsonb_build_object('description', r.description, 'amount_cents', r.amount_cents, 'every', r.every));
  return null;
end;
$$;
create trigger recurring_activity after insert or delete on public.recurring_expenses
  for each row execute function public.recurring_activity();

-- Access --------------------------------------------------------------------------------------------------------------

alter table public.expense_payers enable row level security;
alter table public.expense_comments enable row level security;
alter table public.group_activity enable row level security;

revoke all on public.expense_payers, public.expense_comments, public.group_activity from anon, authenticated;
grant select on public.expense_payers, public.expense_comments, public.group_activity to authenticated;
grant insert (expense_id, group_id, body) on public.expense_comments to authenticated;
grant delete on public.expense_comments, public.expense_groups to authenticated;
grant update (simplify_debts, default_shares) on public.expense_groups to authenticated;
-- Expenses are deleted softly through delete_expense, so they can be restored.
revoke delete on public.expenses from authenticated;
drop policy "members delete expenses" on public.expenses;

create policy "members read payers" on public.expense_payers for select to authenticated using (public.is_member(group_id));
create policy "members read comments" on public.expense_comments for select to authenticated using (public.is_member(group_id));
create policy "members comment" on public.expense_comments for insert to authenticated
  with check (public.is_member(group_id) and user_id = auth.uid()
    and exists (select 1 from public.expenses e where e.id = expense_id and e.group_id = expense_comments.group_id));
create policy "authors delete comments" on public.expense_comments for delete to authenticated
  using (user_id = auth.uid() and public.is_member(group_id));
-- Former members cannot rename themselves or be paid or pay.
drop policy "members rename themselves" on public.group_members;
create policy "members rename themselves" on public.group_members for update to authenticated
  using (user_id = auth.uid() and public.is_member(group_id)) with check (user_id = auth.uid());
drop policy "members record settlements" on public.settlements;
create policy "members record settlements" on public.settlements for insert to authenticated
  with check (public.is_member(group_id) and not exists (
    select 1 from public.group_members m
    where m.group_id = settlements.group_id and m.user_id in (from_id, to_id) and m.left_at is not null));
create policy "members read activity" on public.group_activity for select to authenticated using (public.is_member(group_id));
create policy "creator deletes group" on public.expense_groups for delete to authenticated
  using (created_by = auth.uid() and public.is_member(id));

-- Functions -----------------------------------------------------------------------------------------------------------

-- Positive: the group owes this member. Deleted expenses do not count.
create function public.member_balance(p_group uuid, p_user uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select sum(p.amount_cents) from public.expense_payers p join public.expenses e on e.id = p.expense_id
      where p.group_id = p_group and p.user_id = p_user and e.deleted_at is null), 0)
    - coalesce((select sum(s.amount_cents) from public.expense_shares s join public.expenses e on e.id = s.expense_id
      where s.group_id = p_group and s.user_id = p_user and e.deleted_at is null), 0)
    + coalesce((select sum(amount_cents) from public.settlements where group_id = p_group and from_id = p_user), 0)
    - coalesce((select sum(amount_cents) from public.settlements where group_id = p_group and to_id = p_user), 0);
$$;

drop function public.save_expense(uuid, uuid, text, bigint, uuid, text, date, text, jsonb, jsonb, text);

-- Creates (p_id null) or replaces an expense, its payers ({user_id: cents}) and shares atomically.
create function public.save_expense(
  p_id uuid, p_group uuid, p_description text, p_amount bigint, p_payers jsonb, p_category text, p_spent_on date,
  p_split_mode text, p_shares jsonb, p_items jsonb default null, p_receipt_path text default null, p_notes text default null,
  p_original_currency text default null, p_original_amount bigint default null
)
returns public.expenses
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  e public.expenses;
  v_payer uuid;
begin
  if not public.is_member(p_group) then
    raise exception 'not a member of this group' using errcode = '42501';
  end if;
  if p_receipt_path is not null and split_part(p_receipt_path, '/', 1) <> p_group::text then
    raise exception 'receipt must be stored under the group' using errcode = '22023';
  end if;
  perform public.check_shares(p_group, p_amount, p_shares);
  perform public.check_shares(p_group, p_amount, p_payers);
  -- The biggest payer is the one shown on a one-line summary.
  select k::uuid into v_payer from jsonb_each_text(p_payers) as s(k, v) order by v::bigint desc, k limit 1;
  if p_id is null then
    insert into public.expenses (group_id, description, amount_cents, payer_id, category, spent_on, split_mode, items,
      receipt_path, notes, original_currency, original_amount_cents, created_by)
    values (p_group, btrim(p_description), p_amount, v_payer, p_category, coalesce(p_spent_on, current_date), p_split_mode,
      p_items, p_receipt_path, nullif(btrim(p_notes), ''), p_original_currency, p_original_amount, auth.uid())
    returning * into e;
  else
    update public.expenses set description = btrim(p_description), amount_cents = p_amount, payer_id = v_payer,
      category = p_category, spent_on = coalesce(p_spent_on, spent_on), split_mode = p_split_mode, items = p_items,
      receipt_path = p_receipt_path, notes = nullif(btrim(p_notes), ''), original_currency = p_original_currency,
      original_amount_cents = p_original_amount, updated_at = now()
    where id = p_id and group_id = p_group and deleted_at is null
    returning * into e;
    if not found then
      raise exception 'no such expense in this group' using errcode = 'P0002';
    end if;
    delete from public.expense_shares where expense_id = e.id;
    delete from public.expense_payers where expense_id = e.id;
  end if;
  insert into public.expense_shares (expense_id, group_id, user_id, amount_cents)
    select e.id, p_group, k::uuid, v::bigint from jsonb_each_text(p_shares) as s(k, v);
  insert into public.expense_payers (expense_id, group_id, user_id, amount_cents)
    select e.id, p_group, k::uuid, v::bigint from jsonb_each_text(p_payers) as s(k, v) where v::bigint > 0;
  return e;
end;
$$;

create function public.delete_expense(p_id uuid, p_restore boolean default false)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  -- Restoring an expense that names someone who has since left would give them a balance again.
  if p_restore and exists (
      select 1 from public.group_members m
      where m.left_at is not null and (m.group_id, m.user_id) in (
        select group_id, user_id from public.expense_shares where expense_id = p_id and amount_cents > 0
        union select group_id, user_id from public.expense_payers where expense_id = p_id)) then
    raise exception 'someone in this expense has left the group' using errcode = '22023';
  end if;
  update public.expenses set deleted_at = case when p_restore then null else now() end
  where id = p_id and public.is_member(group_id) and (deleted_at is null) = not p_restore;
  if not found then
    raise exception 'no such expense' using errcode = 'P0002';
  end if;
end;
$$;

-- Same as before, plus the payer row.
create or replace function public.materialize_recurring(p_group uuid)
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
        perform public.check_shares(p_group, r.amount_cents, jsonb_build_object(r.payer_id::text, r.amount_cents));
        insert into public.expenses (group_id, description, amount_cents, payer_id, category, spent_on, split_mode,
          recurring_id, created_by)
        values (p_group, r.description, r.amount_cents, r.payer_id, r.category, r.next_on, r.split_mode, r.id, r.created_by)
        returning id into e_id;
        insert into public.expense_shares (expense_id, group_id, user_id, amount_cents)
          select e_id, p_group, k::uuid, v::bigint from jsonb_each_text(r.shares) as s(k, v);
        insert into public.expense_payers (expense_id, group_id, user_id, amount_cents)
          values (e_id, p_group, r.payer_id, r.amount_cents);
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

-- Someone who has not signed up yet. Others can add expenses for them; they claim the spot when they join.
create function public.add_placeholder(p_group uuid, p_name text)
returns public.group_members
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  m public.group_members;
begin
  if not public.is_member(p_group) then
    raise exception 'not a member of this group' using errcode = '42501';
  end if;
  insert into public.group_members (group_id, user_id, display_name, placeholder)
  values (p_group, gen_random_uuid(), btrim(p_name), true)
  returning * into m;
  return m;
end;
$$;

-- What someone holding an invite code sees before joining: the group's name and the spots they could claim.
create function public.group_preview(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('id', g.id, 'name', g.name, 'currency', g.currency, 'placeholders', coalesce((
    select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'display_name', m.display_name) order by m.joined_at)
    from public.group_members m where m.group_id = g.id and m.placeholder and m.left_at is null), '[]'::jsonb))
  from public.expense_groups g
  where g.invite_code = upper(btrim(p_code)) and auth.uid() is not null;
$$;

drop function public.join_group(text, text);

-- Joins with an invite code, optionally taking over a placeholder (and all of its expenses and payments). Someone who
-- left comes back with their old history.
create function public.join_group(p_code text, p_display_name text, p_claim uuid default null)
returns public.expense_groups
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  g public.expense_groups;
  me uuid := auth.uid();
  v_name text := nullif(btrim(p_display_name), '');
begin
  if me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select * into g from public.expense_groups where invite_code = upper(btrim(p_code));
  if not found then
    raise exception 'no group with this invite code' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.group_members where group_id = g.id and user_id = me) then
    if p_claim is not null then
      raise exception 'you are already in this group' using errcode = '23505';
    end if;
    update public.group_members set left_at = null, display_name = coalesce(v_name, display_name)
    where group_id = g.id and user_id = me;
    return g;
  end if;
  if p_claim is null then
    insert into public.group_members (group_id, user_id, display_name) values (g.id, me, coalesce(v_name, '?'));
    return g;
  end if;
  update public.group_members set user_id = me, placeholder = false, display_name = coalesce(v_name, display_name)
  where group_id = g.id and user_id = p_claim and placeholder and left_at is null;
  if not found then
    raise exception 'that spot is no longer open' using errcode = 'P0002';
  end if;
  -- Foreign keys carried the id everywhere else; these copies live inside JSON.
  update public.recurring_expenses set shares = (shares - p_claim::text) || jsonb_build_object(me::text, shares -> p_claim::text)
  where group_id = g.id and shares ? p_claim::text;
  update public.expense_groups set default_shares = (default_shares - p_claim::text)
    || jsonb_build_object(me::text, default_shares -> p_claim::text)
  where id = g.id and default_shares ? p_claim::text;
  update public.expenses set items = replace(items::text, p_claim::text, me::text)::jsonb
  where group_id = g.id and items is not null and strpos(items::text, p_claim::text) > 0;
  return g;
end;
$$;

-- Leaves the group (p_user null) or removes another member. Only with a zero balance, so no money disappears.
create function public.remove_member(p_group uuid, p_user uuid default null)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := coalesce(p_user, auth.uid());
begin
  if not public.is_member(p_group) then
    raise exception 'not a member of this group' using errcode = '42501';
  end if;
  if public.member_balance(p_group, v_user) <> 0 then
    raise exception 'settle up first: this balance is not zero' using errcode = '23514';
  end if;
  update public.group_members set left_at = now() where group_id = p_group and user_id = v_user and left_at is null;
  if not found then
    raise exception 'not a member of this group' using errcode = 'P0002';
  end if;
  delete from public.recurring_expenses where group_id = p_group and (payer_id = v_user or shares ? v_user::text);
end;
$$;

create function public.reset_invite(p_group uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if not public.is_member(p_group) then
    raise exception 'not a member of this group' using errcode = '42501';
  end if;
  update public.expense_groups set invite_code = public.random_invite_code() where id = p_group returning invite_code into v_code;
  return v_code;
end;
$$;

revoke all on function public.log_activity(uuid, text, uuid, jsonb), public.member_balance(uuid, uuid),
  public.save_expense(uuid, uuid, text, bigint, jsonb, text, date, text, jsonb, jsonb, text, text, text, bigint),
  public.delete_expense(uuid, boolean), public.add_placeholder(uuid, text), public.group_preview(text),
  public.join_group(text, text, uuid), public.remove_member(uuid, uuid), public.reset_invite(uuid)
  from public, anon;
-- Supabase grants new functions to authenticated by default; these are internal.
revoke execute on function public.log_activity(uuid, text, uuid, jsonb), public.member_balance(uuid, uuid),
  public.check_shares(uuid, bigint, jsonb), public.random_invite_code() from authenticated;
grant execute on function public.save_expense(uuid, uuid, text, bigint, jsonb, text, date, text, jsonb, jsonb, text, text, text, bigint),
  public.delete_expense(uuid, boolean), public.add_placeholder(uuid, text), public.group_preview(text),
  public.join_group(text, text, uuid), public.remove_member(uuid, uuid), public.reset_invite(uuid)
  to authenticated;

-- Other phones refresh when a row lands in the activity feed. Skipped where realtime is not set up.
do $do$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.group_activity;
  end if;
end;
$do$;
