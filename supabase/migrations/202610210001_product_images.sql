alter table public.products
add column if not exists image_data text;

alter table public.products
add constraint products_image_data_valid check (
  image_data is null or (
    char_length(image_data) <= 240000
    and image_data ~ '^data:image/(jpeg|webp|png);base64,[A-Za-z0-9+/]+={0,2}$'
  )
);

create or replace function public.get_emi_product_images(
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

  select coalesce(jsonb_object_agg(p.name, p.image_data), '{}'::jsonb)
  into v_result
  from public.products p
  join public.shops s on s.id = p.shop_id
  where s.slug = p_slug and p.image_data is not null;

  return v_result;
end;
$$;

create or replace function public.save_emi_shop_with_product_images(
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

  v_result := public.save_emi_shop_with_creation_times(
    p_slug, p_expected_revision, p_data, p_access_token
  );

  update public.products p
  set image_data = nullif(source.value->>'image', '')
  from jsonb_array_elements(coalesce(p_data->'products', '[]'::jsonb)) source(value)
  where p.shop_id = v_shop_id and p.name = source.value->>'name';

  return v_result;
end;
$$;

revoke all on function public.get_emi_product_images(text, text) from public, authenticated;
revoke all on function public.save_emi_shop_with_product_images(text, bigint, jsonb, text) from public, authenticated;
grant execute on function public.get_emi_product_images(text, text) to anon;
grant execute on function public.save_emi_shop_with_product_images(text, bigint, jsonb, text) to anon;
