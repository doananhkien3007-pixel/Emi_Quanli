create table public.meta_ad_spend_daily (
  shop_id uuid not null references public.shops(id) on delete cascade,
  spend_date date not null,
  amount bigint not null check (amount >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  ad_fee_rate numeric(7,3) not null check (ad_fee_rate between 0 and 200),
  synced_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (shop_id, spend_date)
);

alter table public.meta_ad_spend_daily enable row level security;
revoke all on table public.meta_ad_spend_daily from public, anon, authenticated;

create or replace function public.get_emi_meta_ad_spend(
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

  select coalesce(jsonb_agg(jsonb_build_object(
    'date', spend.spend_date,
    'amount', spend.amount,
    'currency', spend.currency,
    'adFeeRate', spend.ad_fee_rate,
    'syncedAt', spend.synced_at
  ) order by spend.spend_date), '[]'::jsonb)
  into v_result
  from public.meta_ad_spend_daily spend
  join public.shops shop on shop.id = spend.shop_id
  where shop.slug = p_slug;

  return v_result;
end;
$$;

create or replace function public.upsert_emi_meta_ad_spend(
  p_slug text,
  p_rows jsonb,
  p_access_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid;
  v_synced_at timestamptz := now();
  v_updated integer := 0;
begin
  perform private.authorize_emi(p_access_token);

  select id into v_shop_id from public.shops where slug = p_slug;
  if not found then
    raise exception 'shop_not_found' using errcode = 'P0002';
  end if;

  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 31 then
    raise exception 'invalid_meta_spend_rows' using errcode = '22023';
  end if;

  insert into public.meta_ad_spend_daily (
    shop_id, spend_date, amount, currency, ad_fee_rate, synced_at, updated_at
  )
  select
    v_shop_id,
    (row->>'date')::date,
    round((row->>'amount')::numeric)::bigint,
    row->>'currency',
    shop.platform_rate + shop.card_rate,
    v_synced_at,
    v_synced_at
  from jsonb_array_elements(p_rows) row
  cross join public.shops shop
  where shop.id = v_shop_id
    and row->>'date' ~ '^\d{4}-\d{2}-\d{2}$'
    and row->>'currency' ~ '^[A-Z]{3}$'
    and (row->>'amount')::numeric >= 0
  on conflict (shop_id, spend_date) do update set
    amount = excluded.amount,
    currency = excluded.currency,
    synced_at = excluded.synced_at,
    updated_at = excluded.updated_at;

  get diagnostics v_updated = row_count;
  return jsonb_build_object('updated', v_updated, 'synced_at', v_synced_at);
end;
$$;

revoke all on function public.get_emi_meta_ad_spend(text, text) from public, authenticated;
revoke all on function public.upsert_emi_meta_ad_spend(text, jsonb, text) from public, authenticated;
grant execute on function public.get_emi_meta_ad_spend(text, text) to anon;
grant execute on function public.upsert_emi_meta_ad_spend(text, jsonb, text) to anon;
