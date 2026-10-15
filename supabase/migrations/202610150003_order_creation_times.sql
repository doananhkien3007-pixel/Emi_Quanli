alter table public.orders
add column if not exists order_created_at timestamptz;

create or replace function public.get_emi_order_creation_times(
  p_slug text,
  p_access_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform private.authorize_emi(p_access_token);

  select coalesce(jsonb_object_agg(o.order_code, o.order_created_at), '{}'::jsonb)
  into v_result
  from public.orders o
  join public.shops s on s.id = o.shop_id
  where s.slug = p_slug and o.order_created_at is not null;

  return v_result;
end;
$$;

create or replace function public.save_emi_shop_with_creation_times(
  p_slug text,
  p_expected_revision bigint,
  p_data jsonb,
  p_access_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid;
  v_result jsonb;
begin
  perform private.authorize_emi(p_access_token);

  select id into v_shop_id
  from public.shops
  where slug = p_slug;

  if not found then
    raise exception 'shop_not_found' using errcode = 'P0002';
  end if;

  v_result := public.save_emi_shop(p_slug, p_expected_revision, p_data, p_access_token);

  update public.orders o
  set order_created_at = source.created_at
  from (
    select
      value->>'id' as order_code,
      case
        when coalesce(value->>'created_at', '') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}'
          then (value->>'created_at')::timestamptz
        else null
      end as created_at
    from jsonb_array_elements(coalesce(p_data->'orders', '[]'::jsonb))
  ) source
  where o.shop_id = v_shop_id and o.order_code = source.order_code;

  return v_result;
end;
$$;

revoke all on function public.get_emi_order_creation_times(text, text) from public, authenticated;
revoke all on function public.save_emi_shop_with_creation_times(text, bigint, jsonb, text) from public, authenticated;
grant execute on function public.get_emi_order_creation_times(text, text) to anon;
grant execute on function public.save_emi_shop_with_creation_times(text, bigint, jsonb, text) to anon;
