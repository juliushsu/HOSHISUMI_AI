-- Phase F1: storefront theme preset schema (minimal contract-first)

alter table public.stores
  add column if not exists theme_key text not null default 'tw_classic_green',
  add column if not exists theme_overrides jsonb null;

alter table public.stores
  drop constraint if exists stores_theme_key_check,
  add constraint stores_theme_key_check
    check (
      theme_key in (
        'tw_classic_green',
        'tw_bright_green',
        'global_orange_white',
        'jp_fresh_green',
        'jp_deep_blue_gray',
        'luxury_black_gold',
        'warm_wood',
        'modern_cream',
        'urban_gray_green',
        'trust_blue'
      )
    ),
  drop constraint if exists stores_theme_overrides_is_object_check,
  add constraint stores_theme_overrides_is_object_check
    check (theme_overrides is null or jsonb_typeof(theme_overrides) = 'object');

create index if not exists idx_stores_theme_key on public.stores(theme_key);
