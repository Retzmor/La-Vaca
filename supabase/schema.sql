-- =============================================================================
-- La Vaca — Esquema completo de Base de Datos para Supabase (PostgreSQL)
-- Ejecuta este script en el SQL Editor de tu proyecto en Supabase.
-- =============================================================================

create extension if not exists "pgcrypto";

-- 1. Tabla de Salas (rooms)
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  mode text not null check (mode in ('receipt', 'fixed')),
  payment_method text not null check (payment_method in ('bre-b', 'nequi', 'daviplata', 'bancolombia')),
  payment_key text not null,
  organizer_name text,
  total_amount integer not null default 0 check (total_amount >= 0),
  tax_amount integer not null default 0 check (tax_amount >= 0),
  tip_amount integer not null default 0 check (tip_amount >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_rooms_slug on public.rooms (slug);

-- 2. Tabla de Ítems de la factura (items)
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null,
  price integer not null check (price >= 0),
  quantity integer not null default 1 check (quantity >= 1),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_items_room_id on public.items (room_id);

-- 3. Tabla de Participantes (participants)
create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null,
  avatar_color text not null default '#0B875B',
  has_paid boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_participants_room_id on public.participants (room_id);

-- 4. Tabla de Ítems reclamados por participante (item_claims)
create table if not exists public.item_claims (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint item_claims_unique_item_participant unique (item_id, participant_id)
);

create index if not exists idx_item_claims_room_id on public.item_claims (room_id);
create index if not exists idx_item_claims_item_id on public.item_claims (item_id);
create index if not exists idx_item_claims_participant_id on public.item_claims (participant_id);

-- =============================================================================
-- Replica Identity FULL para que los eventos DELETE de Supabase Realtime
-- incluyan room_id, item_id y participant_id al filtrar por room_id.
-- =============================================================================
alter table public.rooms replica identity full;
alter table public.items replica identity full;
alter table public.participants replica identity full;
alter table public.item_claims replica identity full;

-- =============================================================================
-- Publicación Realtime (Supabase)
-- =============================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms'
  ) then
    alter publication supabase_realtime add table public.rooms;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'items'
  ) then
    alter publication supabase_realtime add table public.items;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'participants'
  ) then
    alter publication supabase_realtime add table public.participants;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'item_claims'
  ) then
    alter publication supabase_realtime add table public.item_claims;
  end if;
end $$;

-- =============================================================================
-- Row Level Security (RLS)
-- MVP sin registro obligatorio: cualquier persona con el enlace (slug) puede
-- leer y colaborar en la sala.
-- =============================================================================
alter table public.rooms enable row level security;
alter table public.items enable row level security;
alter table public.participants enable row level security;
alter table public.item_claims enable row level security;

-- Políticas para rooms
drop policy if exists "rooms_select_public" on public.rooms;
create policy "rooms_select_public" on public.rooms
  for select using (true);

drop policy if exists "rooms_insert_public" on public.rooms;
create policy "rooms_insert_public" on public.rooms
  for insert with check (true);

drop policy if exists "rooms_update_public" on public.rooms;
create policy "rooms_update_public" on public.rooms
  for update using (true) with check (true);

-- Políticas para items
drop policy if exists "items_select_public" on public.items;
create policy "items_select_public" on public.items
  for select using (true);

drop policy if exists "items_insert_public" on public.items;
create policy "items_insert_public" on public.items
  for insert with check (true);

drop policy if exists "items_update_public" on public.items;
create policy "items_update_public" on public.items
  for update using (true) with check (true);

drop policy if exists "items_delete_public" on public.items;
create policy "items_delete_public" on public.items
  for delete using (true);

-- Políticas para participants
drop policy if exists "participants_select_public" on public.participants;
create policy "participants_select_public" on public.participants
  for select using (true);

drop policy if exists "participants_insert_public" on public.participants;
create policy "participants_insert_public" on public.participants
  for insert with check (true);

drop policy if exists "participants_update_public" on public.participants;
create policy "participants_update_public" on public.participants
  for update using (true) with check (true);

drop policy if exists "participants_delete_public" on public.participants;
create policy "participants_delete_public" on public.participants
  for delete using (true);

-- Políticas para item_claims
drop policy if exists "item_claims_select_public" on public.item_claims;
create policy "item_claims_select_public" on public.item_claims
  for select using (true);

drop policy if exists "item_claims_insert_public" on public.item_claims;
create policy "item_claims_insert_public" on public.item_claims
  for insert with check (true);

drop policy if exists "item_claims_delete_public" on public.item_claims;
create policy "item_claims_delete_public" on public.item_claims
  for delete using (true);
