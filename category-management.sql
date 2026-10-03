-- Run once in Supabase SQL Editor. Requires the existing transactions/categories tables.
-- Category changes and transaction reassignment commit together or roll back together.
create or replace function public.manage_ledger_category(
  p_action text,
  p_type text,
  p_name text,
  p_target text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_name text := btrim(p_name);
  v_target text := nullif(btrim(p_target), '');
  v_defaults text[];
  v_hidden jsonb;
  v_hidden_type jsonb;
  v_meta jsonb;
  v_count bigint;
  v_target_exists boolean;
begin
  if v_user is null then raise exception 'Sign in to manage categories.'; end if;
  if p_action is null or p_action not in ('rename','delete') or p_type is null or p_type not in ('expense','income') then
    raise exception 'Invalid category operation.';
  end if;
  if v_name is null or v_name = '' then raise exception 'Invalid category name.'; end if;
  if v_target is not null and length(v_target)>80 then raise exception 'Use at most 80 characters.'; end if;

  -- Serialise category-management calls for this account.
  select coalesce(raw_user_meta_data,'{}'::jsonb) into v_meta
  from auth.users where id=v_user for update;
  v_hidden := coalesce(v_meta->'ledger_hidden_defaults','{}'::jsonb);
  if jsonb_typeof(v_hidden) <> 'object' then v_hidden := '{}'::jsonb; end if;
  v_hidden_type := coalesce(v_hidden->p_type,'[]'::jsonb);
  if jsonb_typeof(v_hidden_type) <> 'array' then v_hidden_type := '[]'::jsonb; end if;
  v_defaults := case when p_type='expense'
    then array['Food','Rent','Transport','Utilities','Health','Shopping','Entertainment','Other']
    else array['Salary','Freelance','Gift','Interest','Other'] end;

  if not (
    (v_name=any(v_defaults) and not (v_hidden_type ? v_name))
    or exists(select 1 from public.categories where user_id=v_user and type::text=p_type and name=v_name)
    or exists(select 1 from public.transactions where user_id=v_user and type::text=p_type and category=v_name)
  ) then raise exception 'Category no longer exists. Refresh and try again.'; end if;

  select count(*) into v_count from public.transactions
    where user_id=v_user and type::text=p_type and category=v_name;
  if v_target=v_name then raise exception 'Choose a different category name.'; end if;
  v_target_exists := v_target is not null and (
    (v_target=any(v_defaults) and not (v_hidden_type ? v_target))
    or exists(select 1 from public.categories where user_id=v_user and type::text=p_type and name=v_target)
  );
  if p_action='rename' then
    if v_target is null then raise exception 'Enter the new category name.'; end if;
    if v_target_exists then raise exception 'That category already exists. Use Delete to move entries into it.'; end if;
    -- Populate the record using the existing column types (text or enum).
    insert into public.categories(user_id,type,name)
      select r.user_id,r.type,r.name from jsonb_populate_record(null::public.categories,
        jsonb_build_object('user_id',v_user,'type',p_type,'name',v_target)) as r;
  elsif v_count>0 and not v_target_exists then
    raise exception 'Choose an existing replacement category for these entries.';
  end if;

  if v_count>0 then
    update public.transactions set category=v_target
      where user_id=v_user and type::text=p_type and category=v_name;
  end if;
  delete from public.categories where user_id=v_user and type::text=p_type and name=v_name;
  if v_name=any(v_defaults) and not (v_hidden_type ? v_name) then
    v_hidden_type := v_hidden_type || jsonb_build_array(v_name);
    v_hidden := jsonb_set(v_hidden,array[p_type],v_hidden_type,true);
    update auth.users set raw_user_meta_data=jsonb_set(v_meta,'{ledger_hidden_defaults}',v_hidden,true)
      where id=v_user;
  end if;
  return jsonb_build_object('affected_entries',v_count,'hidden_defaults',v_hidden);
end;
$$;
revoke all on function public.manage_ledger_category(text,text,text,text) from public,anon;
grant execute on function public.manage_ledger_category(text,text,text,text) to authenticated;
notify pgrst, 'reload schema';
