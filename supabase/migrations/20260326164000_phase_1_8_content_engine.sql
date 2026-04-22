-- Phase 1.8: content engine support (minimal)

alter table public.properties
  add column if not exists images jsonb not null default '[]'::jsonb,
  add column if not exists layout_image text null;

alter table public.properties
  drop constraint if exists properties_images_is_array,
  add constraint properties_images_is_array check (jsonb_typeof(images) = 'array');
