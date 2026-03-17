create table if not exists public.battlemap_assets (
  id uuid primary key,
  campaign_id text not null,
  scene_spec jsonb not null,
  image_url text not null,
  image_width_px integer not null,
  image_height_px integer not null,
  grid_overlay_config jsonb not null,
  traversal_grid jsonb not null,
  generation_audit jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists battlemap_assets_campaign_id_idx on public.battlemap_assets (campaign_id);

alter table public.battlemap_assets enable row level security;

drop policy if exists battlemap_assets_select_authenticated on public.battlemap_assets;
create policy battlemap_assets_select_authenticated
  on public.battlemap_assets
  for select
  to authenticated
  using (true);

drop policy if exists battlemap_assets_insert_authenticated on public.battlemap_assets;
create policy battlemap_assets_insert_authenticated
  on public.battlemap_assets
  for insert
  to authenticated
  with check (true);

drop policy if exists battlemap_assets_update_authenticated on public.battlemap_assets;
create policy battlemap_assets_update_authenticated
  on public.battlemap_assets
  for update
  to authenticated
  using (true)
  with check (true);

insert into storage.buckets (id, name, public)
values ('battlemap-images', 'battlemap-images', true)
on conflict (id) do nothing;

drop policy if exists battlemap_images_public_read on storage.objects;
create policy battlemap_images_public_read
  on storage.objects
  for select
  using (bucket_id = 'battlemap-images');

drop policy if exists battlemap_images_auth_insert on storage.objects;
create policy battlemap_images_auth_insert
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'battlemap-images');

drop policy if exists battlemap_images_auth_update on storage.objects;
create policy battlemap_images_auth_update
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'battlemap-images')
  with check (bucket_id = 'battlemap-images');

create or replace function public.set_updated_at_battlemap_assets()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_battlemap_assets_updated_at on public.battlemap_assets;
create trigger trg_battlemap_assets_updated_at
before update on public.battlemap_assets
for each row
execute function public.set_updated_at_battlemap_assets();
