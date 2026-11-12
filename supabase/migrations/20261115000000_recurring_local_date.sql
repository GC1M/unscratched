-- materialize_recurring used the server's current_date, which is UTC, so near midnight a copy could land a day early
-- or late for the phone. The app now passes its local date. It is clamped to within a day of the server date so a
-- client cannot pull later occurrences in early; older builds that send nothing get the server date as before.
-- Replacing the one-argument function (rather than adding an overload) keeps PostgREST from seeing two candidates.
drop function public.materialize_recurring(uuid);

create function public.materialize_recurring(p_group uuid, p_today date default null)
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
  today date := least(greatest(coalesce(p_today, current_date), current_date - 1), current_date + 1);
begin
  if not public.is_member(p_group) then
    raise exception 'not a member of this group' using errcode = '42501';
  end if;
  for r in select * from public.recurring_expenses where group_id = p_group and next_on <= today for update loop
    i := 0;
    while r.next_on <= today and i < 24 loop
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

revoke all on function public.materialize_recurring(uuid, date) from public, anon;
grant execute on function public.materialize_recurring(uuid, date) to authenticated;
