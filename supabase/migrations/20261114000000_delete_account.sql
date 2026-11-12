-- Account deletion (App Store guideline 5.1.1(v), Google Play account deletion policy). The delete-account edge
-- function calls this with the caller's verified id, then removes the returned receipt photos through the Storage API
-- (storage rows cannot be deleted from SQL).
--
-- What happens to each group the account is in:
--   * No other signed-up member still in it (only placeholders or people who left): the whole group goes, with its
--     expenses, payments, comments and activity. Its receipt photos are returned for the caller to delete.
--   * Otherwise the group and its history stay, because the other members' balances depend on them. The account's
--     member row is re-keyed to a fresh random id (foreign keys cascade on update), renamed "Former member", and marked
--     as left, so nothing in the group points at the deleted account any more and it cannot be put in new splits.
--     Its recurring expenses stop. If it created the group, the longest-standing remaining member takes over.
-- Last, the auth.users row goes (with its sessions and identities).
create function public.delete_account(p_user uuid)
returns text[]
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  m public.group_members;
  ghost uuid;
  gone uuid[] := '{}';
  receipts text[] := '{}';
begin
  for m in select * from public.group_members where user_id = p_user loop
    if not exists (select 1 from public.group_members o
        where o.group_id = m.group_id and o.user_id <> p_user and not o.placeholder and o.left_at is null) then
      gone := gone || m.group_id;
      continue;
    end if;
    ghost := gen_random_uuid();
    delete from public.recurring_expenses where group_id = m.group_id and (payer_id = p_user or shares ? p_user::text);
    -- The activity log keeps names in JSON; drop this member's before its id changes.
    update public.group_activity set detail = jsonb_set(detail, '{name}', '"Former member"')
    where group_id = m.group_id and detail ->> 'user_id' = p_user::text and detail ? 'name';
    update public.group_members set user_id = ghost, display_name = 'Former member', left_at = coalesce(left_at, now())
    where group_id = m.group_id and user_id = p_user;
    -- Copies of the id that no foreign key reaches.
    update public.expenses set items = replace(items::text, p_user::text, ghost::text)::jsonb
    where group_id = m.group_id and items is not null and strpos(items::text, p_user::text) > 0;
    update public.expenses set created_by = ghost where group_id = m.group_id and created_by = p_user;
    update public.settlements set created_by = ghost where group_id = m.group_id and created_by = p_user;
    update public.recurring_expenses set created_by = ghost where group_id = m.group_id and created_by = p_user;
    update public.expense_groups set default_shares = default_shares - p_user::text
    where id = m.group_id and default_shares ? p_user::text;
    update public.group_activity set actor_id = ghost where group_id = m.group_id and actor_id = p_user;
    update public.group_activity set detail = replace(detail::text, p_user::text, ghost::text)::jsonb
    where group_id = m.group_id and strpos(detail::text, p_user::text) > 0;
    update public.expense_groups g set created_by = (
      select o.user_id from public.group_members o
      where o.group_id = g.id and not o.placeholder and o.left_at is null order by o.joined_at limit 1)
    where g.id = m.group_id and g.created_by = p_user;
  end loop;

  -- Storage is absent where Supabase runs without it (CI).
  if to_regclass('storage.objects') is not null and cardinality(gone) > 0 then
    select coalesce(array_agg(o.name), '{}') into receipts from storage.objects o
    where o.bucket_id = 'expense-receipts' and public.receipt_group(o.name) = any (gone);
  end if;
  delete from public.expense_groups where id = any (gone);
  delete from auth.users where id = p_user;
  return receipts;
end;
$$;

revoke all on function public.delete_account(uuid) from public, anon, authenticated;
grant execute on function public.delete_account(uuid) to service_role;
