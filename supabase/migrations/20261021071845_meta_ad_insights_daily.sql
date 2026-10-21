create table public.meta_ad_insights_daily (
  shop_id uuid not null references public.shops(id) on delete cascade,
  insight_date date not null,
  level text not null check (level in ('campaign', 'adset', 'ad')),
  entity_id text not null,
  entity_name text not null,
  campaign_id text not null,
  campaign_name text not null,
  adset_id text,
  adset_name text,
  ad_id text,
  ad_name text,
  status text not null,
  spend numeric(18, 2) not null default 0 check (spend >= 0),
  impressions bigint not null default 0 check (impressions >= 0),
  reach bigint not null default 0 check (reach >= 0),
  clicks bigint not null default 0 check (clicks >= 0),
  ctr numeric(12, 6) not null default 0 check (ctr >= 0),
  cpc numeric(18, 4) not null default 0 check (cpc >= 0),
  cpm numeric(18, 4) not null default 0 check (cpm >= 0),
  messages numeric(18, 4) not null default 0 check (messages >= 0),
  leads numeric(18, 4) not null default 0 check (leads >= 0),
  purchases numeric(18, 4) not null default 0 check (purchases >= 0),
  results numeric(18, 4) not null default 0 check (results >= 0),
  result_type text,
  cost_per_result numeric(18, 4) check (cost_per_result is null or cost_per_result >= 0),
  purchase_value numeric(18, 2) not null default 0 check (purchase_value >= 0),
  roas numeric(18, 6) check (roas is null or roas >= 0),
  creative_id text,
  creative_thumbnail_url text,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  synced_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (shop_id, insight_date, level, entity_id)
);

create index meta_ad_insights_daily_shop_level_date_idx
  on public.meta_ad_insights_daily (shop_id, level, insight_date desc);
create index meta_ad_insights_daily_shop_campaign_date_idx
  on public.meta_ad_insights_daily (shop_id, campaign_id, insight_date desc);

alter table public.meta_ad_insights_daily enable row level security;
revoke all on table public.meta_ad_insights_daily from public, anon, authenticated;

create or replace function public.get_emi_meta_ad_insights(
  p_slug text,
  p_since date,
  p_until date,
  p_level text,
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
  if p_level not in ('campaign', 'adset', 'ad')
    or p_since > p_until
    or p_until - p_since > 92 then
    raise exception 'invalid_meta_insights_range' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'date', insight.insight_date,
    'level', insight.level,
    'entityId', insight.entity_id,
    'entityName', insight.entity_name,
    'campaignId', insight.campaign_id,
    'campaignName', insight.campaign_name,
    'adsetId', insight.adset_id,
    'adsetName', insight.adset_name,
    'adId', insight.ad_id,
    'adName', insight.ad_name,
    'status', insight.status,
    'spend', insight.spend,
    'impressions', insight.impressions,
    'reach', insight.reach,
    'clicks', insight.clicks,
    'ctr', insight.ctr,
    'cpc', insight.cpc,
    'cpm', insight.cpm,
    'messages', insight.messages,
    'leads', insight.leads,
    'purchases', insight.purchases,
    'results', insight.results,
    'resultType', insight.result_type,
    'costPerResult', insight.cost_per_result,
    'purchaseValue', insight.purchase_value,
    'roas', insight.roas,
    'creativeId', insight.creative_id,
    'creativeThumbnailUrl', insight.creative_thumbnail_url,
    'currency', insight.currency,
    'syncedAt', insight.synced_at
  ) order by insight.insight_date, insight.spend desc, insight.entity_name), '[]'::jsonb)
  into v_result
  from public.meta_ad_insights_daily insight
  join public.shops shop on shop.id = insight.shop_id
  where shop.slug = p_slug
    and insight.level = p_level
    and insight.insight_date between p_since and p_until;

  return v_result;
end;
$$;

create or replace function public.sync_emi_meta_ads(
  p_slug text,
  p_since date,
  p_until date,
  p_spend_rows jsonb,
  p_insight_rows jsonb,
  p_access_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop public.shops%rowtype;
  v_synced_at timestamptz := now();
  v_spend_updated integer := 0;
  v_insights_updated integer := 0;
begin
  perform private.authorize_emi(p_access_token);

  select * into v_shop from public.shops where slug = p_slug;
  if not found then
    raise exception 'shop_not_found' using errcode = 'P0002';
  end if;
  if p_since > p_until
    or p_until - p_since > 31
    or jsonb_typeof(p_spend_rows) <> 'array'
    or jsonb_typeof(p_insight_rows) <> 'array'
    or jsonb_array_length(p_spend_rows) > 32
    or jsonb_array_length(p_insight_rows) > 20000 then
    raise exception 'invalid_meta_ads_payload' using errcode = '22023';
  end if;

  insert into public.meta_ad_spend_daily (
    shop_id, spend_date, amount, currency, ad_fee_rate, synced_at, updated_at
  )
  select
    v_shop.id,
    (row->>'date')::date,
    round((row->>'amount')::numeric)::bigint,
    row->>'currency',
    v_shop.platform_rate + v_shop.card_rate,
    v_synced_at,
    v_synced_at
  from jsonb_array_elements(p_spend_rows) row
  where (row->>'date')::date between p_since and p_until
    and row->>'date' ~ '^\d{4}-\d{2}-\d{2}$'
    and row->>'currency' ~ '^[A-Z]{3}$'
    and (row->>'amount')::numeric >= 0
  on conflict (shop_id, spend_date) do update set
    amount = excluded.amount,
    currency = excluded.currency,
    ad_fee_rate = excluded.ad_fee_rate,
    synced_at = excluded.synced_at,
    updated_at = excluded.updated_at;

  get diagnostics v_spend_updated = row_count;
  if v_spend_updated <> jsonb_array_length(p_spend_rows) then
    raise exception 'invalid_meta_spend_rows' using errcode = '22023';
  end if;

  delete from public.meta_ad_insights_daily
  where shop_id = v_shop.id
    and insight_date between p_since and p_until;

  insert into public.meta_ad_insights_daily (
    shop_id, insight_date, level, entity_id, entity_name,
    campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, status,
    spend, impressions, reach, clicks, ctr, cpc, cpm,
    messages, leads, purchases, results, result_type, cost_per_result,
    purchase_value, roas, creative_id, creative_thumbnail_url, currency,
    synced_at, updated_at
  )
  select
    v_shop.id,
    (row->>'date')::date,
    row->>'level',
    row->>'entityId',
    row->>'entityName',
    row->>'campaignId',
    row->>'campaignName',
    nullif(row->>'adsetId', ''),
    nullif(row->>'adsetName', ''),
    nullif(row->>'adId', ''),
    nullif(row->>'adName', ''),
    row->>'status',
    coalesce((row->>'spend')::numeric, 0),
    coalesce((row->>'impressions')::bigint, 0),
    coalesce((row->>'reach')::bigint, 0),
    coalesce((row->>'clicks')::bigint, 0),
    coalesce((row->>'ctr')::numeric, 0),
    coalesce((row->>'cpc')::numeric, 0),
    coalesce((row->>'cpm')::numeric, 0),
    coalesce((row->>'messages')::numeric, 0),
    coalesce((row->>'leads')::numeric, 0),
    coalesce((row->>'purchases')::numeric, 0),
    coalesce((row->>'results')::numeric, 0),
    nullif(row->>'resultType', ''),
    nullif(row->>'costPerResult', '')::numeric,
    coalesce((row->>'purchaseValue')::numeric, 0),
    nullif(row->>'roas', '')::numeric,
    nullif(row->>'creativeId', ''),
    nullif(row->>'creativeThumbnailUrl', ''),
    row->>'currency',
    v_synced_at,
    v_synced_at
  from jsonb_array_elements(p_insight_rows) row
  where (row->>'date')::date between p_since and p_until
    and row->>'date' ~ '^\d{4}-\d{2}-\d{2}$'
    and row->>'level' in ('campaign', 'adset', 'ad')
    and coalesce(row->>'entityId', '') <> ''
    and coalesce(row->>'entityName', '') <> ''
    and coalesce(row->>'campaignId', '') <> ''
    and coalesce(row->>'campaignName', '') <> ''
    and row->>'currency' ~ '^[A-Z]{3}$';

  get diagnostics v_insights_updated = row_count;
  if v_insights_updated <> jsonb_array_length(p_insight_rows) then
    raise exception 'invalid_meta_insight_rows' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'spend_updated', v_spend_updated,
    'insights_updated', v_insights_updated,
    'synced_at', v_synced_at
  );
end;
$$;

revoke all on function public.get_emi_meta_ad_insights(text, date, date, text, text) from public, authenticated;
revoke all on function public.sync_emi_meta_ads(text, date, date, jsonb, jsonb, text) from public, authenticated;
grant execute on function public.get_emi_meta_ad_insights(text, date, date, text, text) to anon;
grant execute on function public.sync_emi_meta_ads(text, date, date, jsonb, jsonb, text) to anon;
