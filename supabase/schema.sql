create table if not exists public.ptcgl_decks (
  id text primary key,
  name text not null,
  image_id text not null default '',
  image_url text not null default '',
  memo text not null default '',
  is_my_deck boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.ptcgl_deck_variants (
  id text primary key,
  deck_id text not null references public.ptcgl_decks(id) on delete cascade,
  name text not null,
  image_url text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.ptcgl_matches (
  id text primary key,
  played_at timestamptz not null default now(),
  player_name text not null default '',
  opponent_name text not null default '',
  my_deck_id text not null references public.ptcgl_decks(id) on delete cascade,
  my_variant_id text references public.ptcgl_deck_variants(id) on delete set null,
  opponent_deck_id text not null references public.ptcgl_decks(id) on delete cascade,
  opponent_variant_id text references public.ptcgl_deck_variants(id) on delete set null,
  result text not null check (result in ('win', 'loss', 'unknown')),
  turn_order text not null check (turn_order in ('first', 'second', 'unknown')),
  battle_log text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);

alter table public.ptcgl_decks enable row level security;
alter table public.ptcgl_deck_variants enable row level security;
alter table public.ptcgl_matches enable row level security;

create policy "ptcgl decks public read" on public.ptcgl_decks for select using (true);
create policy "ptcgl decks public insert" on public.ptcgl_decks for insert with check (true);
create policy "ptcgl decks public update" on public.ptcgl_decks for update using (true) with check (true);
create policy "ptcgl decks public delete" on public.ptcgl_decks for delete using (true);

create policy "ptcgl variants public read" on public.ptcgl_deck_variants for select using (true);
create policy "ptcgl variants public insert" on public.ptcgl_deck_variants for insert with check (true);
create policy "ptcgl variants public update" on public.ptcgl_deck_variants for update using (true) with check (true);
create policy "ptcgl variants public delete" on public.ptcgl_deck_variants for delete using (true);

create policy "ptcgl matches public read" on public.ptcgl_matches for select using (true);
create policy "ptcgl matches public insert" on public.ptcgl_matches for insert with check (true);
create policy "ptcgl matches public update" on public.ptcgl_matches for update using (true) with check (true);
create policy "ptcgl matches public delete" on public.ptcgl_matches for delete using (true);

alter publication supabase_realtime add table public.ptcgl_decks;
alter publication supabase_realtime add table public.ptcgl_deck_variants;
alter publication supabase_realtime add table public.ptcgl_matches;
