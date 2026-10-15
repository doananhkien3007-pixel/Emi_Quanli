create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.app_secrets (
  name text primary key,
  token_sha256 text not null check (length(token_sha256) = 64),
  created_at timestamptz not null default now()
);

revoke all on table private.app_secrets from public, anon, authenticated;

insert into private.app_secrets (name, token_sha256)
values ('emi_web', '802ed5b002d84972ae5992990bb44a108d20e019a61c13bddb789ef18a92ec5a')
on conflict (name) do update set token_sha256 = excluded.token_sha256;

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  revision bigint not null default 1 check (revision >= 1),
  source_name text not null default '',
  shipping_fee bigint not null default 0 check (shipping_fee >= 0),
  return_shipping_fee bigint not null default 0 check (return_shipping_fee >= 0),
  platform_rate numeric(7,3) not null default 0 check (platform_rate between 0 and 100),
  card_rate numeric(7,3) not null default 0 check (card_rate between 0 and 100),
  return_rate_threshold numeric(7,3) not null default 15 check (return_rate_threshold between 0 and 100),
  undated_inbound bigint not null default 0 check (undated_inbound >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  default_price bigint not null default 0 check (default_price >= 0),
  default_cost bigint not null default 0 check (default_cost >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, name)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  order_code text not null,
  order_date date not null,
  created_on date not null,
  updated_on date,
  shipped_on date,
  delivered_on date,
  returned_on date,
  spx_code text,
  shipping_fee bigint,
  return_shipping_fee bigint,
  customer_name text not null,
  phone text not null default '',
  address text not null default '',
  product_summary text not null,
  size_summary text not null default '',
  quantity integer not null check (quantity > 0),
  sale_total bigint not null check (sale_total >= 0),
  cost_total bigint not null check (cost_total >= 0),
  status text not null,
  note text not null default '',
  source_row integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, order_code),
  unique (shop_id, id)
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  order_id uuid not null,
  order_code text not null,
  item_code text not null,
  line_no integer not null check (line_no > 0),
  product_name text not null,
  color text not null default '',
  size text not null default '',
  quantity integer not null check (quantity > 0),
  sale_price bigint not null check (sale_price >= 0),
  unit_cost bigint not null check (unit_cost >= 0),
  created_at timestamptz not null default now(),
  foreign key (shop_id, order_id) references public.orders(shop_id, id) on delete cascade,
  foreign key (shop_id, order_code) references public.orders(shop_id, order_code) on delete cascade,
  unique (shop_id, order_code, item_code),
  unique (shop_id, order_id, line_no)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  expense_code text not null,
  expense_date date not null,
  category text not null,
  name text not null,
  amount bigint not null check (amount >= 0),
  note text not null default '',
  ad_fee_rate numeric(7,3),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, expense_code)
);

create table public.inventory_return_receipts (
  shop_id uuid not null,
  order_code text not null,
  received_on date not null,
  primary key (shop_id, order_code),
  foreign key (shop_id, order_code) references public.orders(shop_id, order_code) on delete cascade
);

create table public.inventory_procurement_taken (
  shop_id uuid not null,
  order_code text not null,
  item_code text not null,
  variant text not null,
  quantity integer not null check (quantity > 0),
  taken_on date not null,
  primary key (shop_id, order_code, item_code),
  foreign key (shop_id, order_code, item_code) references public.order_items(shop_id, order_code, item_code) on delete cascade
);

create table public.inventory_allocations (
  shop_id uuid not null,
  order_code text not null,
  item_code text not null,
  variant text not null,
  quantity integer not null check (quantity > 0),
  primary key (shop_id, order_code, item_code),
  foreign key (shop_id, order_code, item_code) references public.order_items(shop_id, order_code, item_code) on delete cascade
);

create index orders_shop_date_idx on public.orders (shop_id, order_date desc);
create index orders_shop_status_idx on public.orders (shop_id, status);
create index order_items_shop_product_idx on public.order_items (shop_id, product_name);
create index expenses_shop_date_idx on public.expenses (shop_id, expense_date desc);

alter table public.shops enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.expenses enable row level security;
alter table public.inventory_return_receipts enable row level security;
alter table public.inventory_procurement_taken enable row level security;
alter table public.inventory_allocations enable row level security;

revoke all on table public.shops, public.products, public.orders, public.order_items,
  public.expenses, public.inventory_return_receipts, public.inventory_procurement_taken,
  public.inventory_allocations from public, anon, authenticated;

create or replace function private.authorize_emi(p_access_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_access_token is null or not exists (
    select 1
    from private.app_secrets
    where name = 'emi_web'
      and token_sha256 = encode(extensions.digest(p_access_token, 'sha256'), 'hex')
  ) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.authorize_emi(text) from public, anon, authenticated;

create or replace function public.get_emi_shop(p_slug text, p_access_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop public.shops%rowtype;
  v_data jsonb;
begin
  perform private.authorize_emi(p_access_token);

  select * into v_shop from public.shops where slug = p_slug;
  if not found then
    raise exception 'shop_not_found' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'orders', coalesce((
      select jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'id', o.order_code,
          'date', o.order_date,
          'created_at', o.created_on,
          'updated_at', o.updated_on,
          'shipped_at', o.shipped_on,
          'delivered_at', o.delivered_on,
          'returned_at', o.returned_on,
          'spxCode', o.spx_code,
          'shippingFee', o.shipping_fee,
          'returnShippingFee', o.return_shipping_fee,
          'customer', o.customer_name,
          'phone', o.phone,
          'address', o.address,
          'product', o.product_summary,
          'size', o.size_summary,
          'quantity', o.quantity,
          'price', o.sale_total,
          'cost', o.cost_total,
          'status', o.status,
          'note', o.note,
          'sourceRow', o.source_row,
          'items', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', i.item_code,
              'product', i.product_name,
              'color', i.color,
              'size', i.size,
              'quantity', i.quantity,
              'price', i.sale_price,
              'cost', i.unit_cost
            ) order by i.line_no)
            from public.order_items i
            where i.shop_id = v_shop.id and i.order_id = o.id
          ), '[]'::jsonb)
        )) order by o.order_date, o.source_row nulls last, o.order_code
      )
      from public.orders o where o.shop_id = v_shop.id
    ), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', e.expense_code,
        'date', e.expense_date,
        'category', e.category,
        'name', e.name,
        'amount', e.amount,
        'note', e.note,
        'adFeeRate', e.ad_fee_rate
      )) order by e.sort_order, e.expense_date, e.expense_code)
      from public.expenses e where e.shop_id = v_shop.id
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', p.name,
        'price', p.default_price,
        'cost', p.default_cost
      ) order by p.sort_order, p.name)
      from public.products p where p.shop_id = v_shop.id
    ), '[]'::jsonb),
    'settings', jsonb_build_object(
      'shipping', v_shop.shipping_fee,
      'returnShipping', v_shop.return_shipping_fee,
      'platformRate', v_shop.platform_rate,
      'cardRate', v_shop.card_rate,
      'returnRateThreshold', v_shop.return_rate_threshold
    ),
    'undatedInbound', v_shop.undated_inbound,
    'source', v_shop.source_name,
    'inventory', jsonb_build_object(
      'returnReceipts', coalesce((
        select jsonb_agg(jsonb_build_object('orderId', r.order_code, 'receivedAt', r.received_on) order by r.order_code)
        from public.inventory_return_receipts r where r.shop_id = v_shop.id
      ), '[]'::jsonb),
      'procurementTaken', coalesce((
        select jsonb_agg(jsonb_build_object(
          'orderId', t.order_code, 'itemId', t.item_code, 'variant', t.variant,
          'quantity', t.quantity, 'takenAt', t.taken_on
        ) order by t.order_code, t.item_code)
        from public.inventory_procurement_taken t where t.shop_id = v_shop.id
      ), '[]'::jsonb),
      'allocations', coalesce((
        select jsonb_agg(jsonb_build_object(
          'orderId', a.order_code, 'itemId', a.item_code, 'variant', a.variant, 'quantity', a.quantity
        ) order by a.order_code, a.item_code)
        from public.inventory_allocations a where a.shop_id = v_shop.id
      ), '[]'::jsonb)
    )
  ) into v_data;

  return jsonb_build_object('data', v_data, 'revision', v_shop.revision);
end;
$$;

create or replace function public.save_emi_shop(
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
  v_revision bigint;
  v_order jsonb;
  v_order_id uuid;
  v_line integer;
begin
  perform private.authorize_emi(p_access_token);

  select id, revision into v_shop_id, v_revision
  from public.shops
  where slug = p_slug
  for update;

  if not found then
    raise exception 'shop_not_found' using errcode = 'P0002';
  end if;
  if v_revision <> p_expected_revision then
    raise exception 'revision_conflict' using errcode = '40001';
  end if;

  update public.shops set
    source_name = coalesce(p_data->>'source', ''),
    shipping_fee = coalesce(round((p_data->'settings'->>'shipping')::numeric)::bigint, 0),
    return_shipping_fee = coalesce(round((p_data->'settings'->>'returnShipping')::numeric)::bigint, 0),
    platform_rate = coalesce((p_data->'settings'->>'platformRate')::numeric, 0),
    card_rate = coalesce((p_data->'settings'->>'cardRate')::numeric, 0),
    return_rate_threshold = coalesce((p_data->'settings'->>'returnRateThreshold')::numeric, 15),
    undated_inbound = coalesce(round((p_data->>'undatedInbound')::numeric)::bigint, 0),
    revision = revision + 1,
    updated_at = now()
  where id = v_shop_id;

  delete from public.products where shop_id = v_shop_id;
  delete from public.expenses where shop_id = v_shop_id;
  delete from public.orders where shop_id = v_shop_id;

  insert into public.products (shop_id, name, default_price, default_cost, sort_order)
  select v_shop_id, value->>'name',
    round((value->>'price')::numeric)::bigint,
    round((value->>'cost')::numeric)::bigint,
    ordinality::integer
  from jsonb_array_elements(coalesce(p_data->'products', '[]'::jsonb)) with ordinality;

  insert into public.expenses (shop_id, expense_code, expense_date, category, name, amount, note, ad_fee_rate, sort_order)
  select v_shop_id, value->>'id', (value->>'date')::date, value->>'category', value->>'name',
    round((value->>'amount')::numeric)::bigint, coalesce(value->>'note', ''),
    nullif(value->>'adFeeRate', '')::numeric, ordinality::integer
  from jsonb_array_elements(coalesce(p_data->'expenses', '[]'::jsonb)) with ordinality;

  for v_order in select value from jsonb_array_elements(coalesce(p_data->'orders', '[]'::jsonb))
  loop
    insert into public.orders (
      shop_id, order_code, order_date, created_on, updated_on, shipped_on, delivered_on, returned_on,
      spx_code, shipping_fee, return_shipping_fee, customer_name, phone, address, product_summary,
      size_summary, quantity, sale_total, cost_total, status, note, source_row
    ) values (
      v_shop_id,
      v_order->>'id',
      (v_order->>'date')::date,
      coalesce(nullif(v_order->>'created_at', '')::date, (v_order->>'date')::date),
      nullif(v_order->>'updated_at', '')::date,
      nullif(v_order->>'shipped_at', '')::date,
      nullif(v_order->>'delivered_at', '')::date,
      nullif(v_order->>'returned_at', '')::date,
      nullif(v_order->>'spxCode', ''),
      round(nullif(v_order->>'shippingFee', '')::numeric)::bigint,
      round(nullif(v_order->>'returnShippingFee', '')::numeric)::bigint,
      v_order->>'customer',
      coalesce(v_order->>'phone', ''),
      coalesce(v_order->>'address', ''),
      v_order->>'product',
      coalesce(v_order->>'size', ''),
      (v_order->>'quantity')::integer,
      round((v_order->>'price')::numeric)::bigint,
      round((v_order->>'cost')::numeric)::bigint,
      v_order->>'status',
      coalesce(v_order->>'note', ''),
      nullif(v_order->>'sourceRow', '')::integer
    ) returning id into v_order_id;

    v_line := 0;
    insert into public.order_items (
      shop_id, order_id, order_code, item_code, line_no, product_name, color, size, quantity, sale_price, unit_cost
    )
    select v_shop_id, v_order_id, v_order->>'id',
      coalesce(value->>'id', (v_order->>'id') || '-' || ordinality),
      ordinality::integer,
      value->>'product', coalesce(value->>'color', ''), coalesce(value->>'size', ''),
      (value->>'quantity')::integer,
      round((value->>'price')::numeric)::bigint,
      round((value->>'cost')::numeric)::bigint
    from jsonb_array_elements(coalesce(v_order->'items', '[]'::jsonb)) with ordinality;
  end loop;

  insert into public.inventory_return_receipts (shop_id, order_code, received_on)
  select v_shop_id, value->>'orderId', (value->>'receivedAt')::date
  from jsonb_array_elements(coalesce(p_data->'inventory'->'returnReceipts', '[]'::jsonb));

  insert into public.inventory_procurement_taken (shop_id, order_code, item_code, variant, quantity, taken_on)
  select v_shop_id, value->>'orderId', value->>'itemId', value->>'variant',
    (value->>'quantity')::integer, (value->>'takenAt')::date
  from jsonb_array_elements(coalesce(p_data->'inventory'->'procurementTaken', '[]'::jsonb));

  insert into public.inventory_allocations (shop_id, order_code, item_code, variant, quantity)
  select v_shop_id, value->>'orderId', value->>'itemId', value->>'variant', (value->>'quantity')::integer
  from jsonb_array_elements(coalesce(p_data->'inventory'->'allocations', '[]'::jsonb));

  return jsonb_build_object('data', p_data, 'revision', v_revision + 1);
end;
$$;

revoke all on function public.get_emi_shop(text, text) from public, authenticated;
revoke all on function public.save_emi_shop(text, bigint, jsonb, text) from public, authenticated;
grant execute on function public.get_emi_shop(text, text) to anon;
grant execute on function public.save_emi_shop(text, bigint, jsonb, text) to anon;

insert into public.shops (slug, name)
values ('emi-house', 'Emi House')
on conflict (slug) do nothing;
