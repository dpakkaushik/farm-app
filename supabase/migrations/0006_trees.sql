-- Trees.
--
-- Why: the farm's ~217 standing trees and its eucalyptus nursery lived on one
-- handwritten page in a register. Nothing about them was in the app. Some are
-- fruit, some are timber, and the two earn money in completely different ways.
--
-- Why not crop_cycles: that table is built around sow_date -> expected_harvest
-- -> season. A mango tree has stood for twenty years and will stand twenty more;
-- a teak tree has exactly one "harvest", twenty-five years out. Neither has a
-- season. Forcing trees through crop_cycles would corrupt the P&L and the map.
--
-- The shape that does fit is livestock: counted in groups, born and dying over
-- time, producing revenue. These five tables mirror livestock_master /
-- livestock_count_logs / livestock_revenue.
--
-- Money: the farm sells fruit ON THE TREE to a thekedar for a lump sum -- he
-- harvests. So there is no per-kg harvest logging here, and there should not be.
-- A timber sale has the same shape (buyer, lump sum, payment status), so one
-- revenue table serves both.
--
-- Idempotent. Safe to re-run.

-- ---------------------------------------------------------------------------
-- TABLES
-- ---------------------------------------------------------------------------

-- The plant. Created once, then reused across plantings.
create table if not exists public.tree_species (
  id          uuid default gen_random_uuid() not null,
  farm_id     uuid not null,
  name_local  text not null,                 -- आम -- what the manager actually reads
  name_en     text,                          -- nullable: we do not invent translations
  purpose     text not null,                 -- 'fruit' | 'timber'
  notes       text,
  photo_path  text,
  created_at  timestamptz default now()
);

-- A batch of one species, in one place, put in the ground at one time.
--
-- This is the unit that matters, and the reason there is no flat "Eucalyptus: 1669"
-- row anywhere. 1657 saplings in the Plot A nursery and 12 on a boundary are
-- different ages, different places, different fates. Flattening them would destroy
-- exactly the information you need on the day 40 of them die.
create table if not exists public.tree_plantings (
  id             uuid default gen_random_uuid() not null,
  farm_id        uuid not null,
  species_id     uuid not null,
  planted_on     date,                            -- nullable: often genuinely unknown
  location_type  text not null,                   -- 'plot' | 'boundary'
  plot_id        uuid,                            -- required when location_type='plot'
  boundary_sides jsonb default '[]'::jsonb,       -- ['north','east'] -- only when boundary
  geo_points     jsonb,                           -- optional real GPS; null => map synthesizes dots
  current_count  integer default 0 not null,      -- DERIVED from tree_count_logs by trigger. Never write directly.
  notes          text,
  created_at     timestamptz default now()
);

-- The ledger the count is derived from.
--
-- quantity is SIGNED (+3 planted, -2 died) and current_count is SUM(quantity),
-- full stop. This is a deliberate deviation from livestock_count_logs, which
-- leaves the sign implicit in a CASE over change_type -- so adding a change_type
-- there and forgetting the CASE silently subtracts. Here a new change_type
-- cannot break the arithmetic.
--
-- This ledger is the entire point of the feature. A count a human rewrites each
-- year drifts. A count derived from a ledger cannot.
create table if not exists public.tree_count_logs (
  id          uuid default gen_random_uuid() not null,
  farm_id     uuid not null,
  planting_id uuid not null,
  log_date    date not null default current_date,
  change_type text not null,        -- opening_balance | planted | died | felled | transplanted | correction
  quantity    integer not null,     -- SIGNED
  reason      text,
  notes       text,
  added_by    uuid,
  created_at  timestamptz default now()
);

-- Money in. Fruit lease and timber sale are the same shape, so one table.
create table if not exists public.tree_revenue (
  id              uuid default gen_random_uuid() not null,
  farm_id         uuid not null,
  revenue_type    text not null,                  -- 'fruit_lease' | 'timber_sale'
  season_year     integer,
  buyer_id        uuid,                           -- the thekedar; reuses the existing buyers table
  buyer_name      text,                           -- fallback when he is not in buyers yet
  agreement_date  date,
  start_date      date,
  end_date        date,
  amount          numeric(12,2) not null,
  payment_status  text default 'pending' not null,-- pending | partial | paid
  amount_received numeric(12,2) default 0 not null,
  payment_date    date,
  attachment_path text,                           -- the agreement paper
  notes           text,
  created_at      timestamptz default now()
);

-- Which plantings a given lease or sale actually covered.
-- Without this you can answer "what did we lease last year" but never
-- "what has mango earned over four seasons".
create table if not exists public.tree_revenue_items (
  id          uuid default gen_random_uuid() not null,
  farm_id     uuid not null,
  revenue_id  uuid not null,
  planting_id uuid not null
);

-- ---------------------------------------------------------------------------
-- CONSTRAINTS
-- ---------------------------------------------------------------------------

do $$
begin
  -- tree_species
  if not exists (select 1 from pg_constraint where conname = 'tree_species_pkey') then
    alter table tree_species add constraint tree_species_pkey primary key (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tree_species_farm_id_fkey') then
    alter table tree_species add constraint tree_species_farm_id_fkey
      foreign key (farm_id) references farms(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tree_species_purpose_check') then
    alter table tree_species add constraint tree_species_purpose_check
      check (purpose in ('fruit', 'timber'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tree_species_farm_name_key') then
    alter table tree_species add constraint tree_species_farm_name_key
      unique (farm_id, name_local);
  end if;

  -- tree_plantings
  if not exists (select 1 from pg_constraint where conname = 'tree_plantings_pkey') then
    alter table tree_plantings add constraint tree_plantings_pkey primary key (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tree_plantings_farm_id_fkey') then
    alter table tree_plantings add constraint tree_plantings_farm_id_fkey
      foreign key (farm_id) references farms(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tree_plantings_species_id_fkey') then
    alter table tree_plantings add constraint tree_plantings_species_id_fkey
      foreign key (species_id) references tree_species(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tree_plantings_plot_id_fkey') then
    alter table tree_plantings add constraint tree_plantings_plot_id_fkey
      foreign key (plot_id) references plots(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tree_plantings_location_type_check') then
    alter table tree_plantings add constraint tree_plantings_location_type_check
      check (location_type in ('plot', 'boundary'));
  end if;
  -- A planting inside a plot must name the plot. A boundary planting need not:
  -- some trees sit on the farm's outer perimeter, against no plot at all.
  if not exists (select 1 from pg_constraint where conname = 'tree_plantings_plot_required_check') then
    alter table tree_plantings add constraint tree_plantings_plot_required_check
      check (location_type <> 'plot' or plot_id is not null);
  end if;

  -- tree_count_logs
  if not exists (select 1 from pg_constraint where conname = 'tree_count_logs_pkey') then
    alter table tree_count_logs add constraint tree_count_logs_pkey primary key (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tree_count_logs_farm_id_fkey') then
    alter table tree_count_logs add constraint tree_count_logs_farm_id_fkey
      foreign key (farm_id) references farms(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tree_count_logs_planting_id_fkey') then
    alter table tree_count_logs add constraint tree_count_logs_planting_id_fkey
      foreign key (planting_id) references tree_plantings(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tree_count_logs_change_type_check') then
    alter table tree_count_logs add constraint tree_count_logs_change_type_check
      check (change_type in ('opening_balance', 'planted', 'died', 'felled', 'transplanted', 'correction'));
  end if;

  -- tree_revenue
  if not exists (select 1 from pg_constraint where conname = 'tree_revenue_pkey') then
    alter table tree_revenue add constraint tree_revenue_pkey primary key (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tree_revenue_farm_id_fkey') then
    alter table tree_revenue add constraint tree_revenue_farm_id_fkey
      foreign key (farm_id) references farms(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tree_revenue_buyer_id_fkey') then
    alter table tree_revenue add constraint tree_revenue_buyer_id_fkey
      foreign key (buyer_id) references buyers(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tree_revenue_type_check') then
    alter table tree_revenue add constraint tree_revenue_type_check
      check (revenue_type in ('fruit_lease', 'timber_sale'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tree_revenue_payment_status_check') then
    alter table tree_revenue add constraint tree_revenue_payment_status_check
      check (payment_status in ('pending', 'partial', 'paid'));
  end if;

  -- tree_revenue_items
  if not exists (select 1 from pg_constraint where conname = 'tree_revenue_items_pkey') then
    alter table tree_revenue_items add constraint tree_revenue_items_pkey primary key (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tree_revenue_items_farm_id_fkey') then
    alter table tree_revenue_items add constraint tree_revenue_items_farm_id_fkey
      foreign key (farm_id) references farms(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tree_revenue_items_revenue_id_fkey') then
    alter table tree_revenue_items add constraint tree_revenue_items_revenue_id_fkey
      foreign key (revenue_id) references tree_revenue(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tree_revenue_items_planting_id_fkey') then
    alter table tree_revenue_items add constraint tree_revenue_items_planting_id_fkey
      foreign key (planting_id) references tree_plantings(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tree_revenue_items_unique') then
    alter table tree_revenue_items add constraint tree_revenue_items_unique
      unique (revenue_id, planting_id);
  end if;
end $$;

create index if not exists tree_species_farm_idx        on tree_species (farm_id);
create index if not exists tree_plantings_farm_idx      on tree_plantings (farm_id);
create index if not exists tree_plantings_species_idx   on tree_plantings (species_id);
create index if not exists tree_plantings_plot_idx      on tree_plantings (plot_id);
create index if not exists tree_count_logs_farm_idx     on tree_count_logs (farm_id);
create index if not exists tree_count_logs_planting_idx on tree_count_logs (planting_id);
create index if not exists tree_revenue_farm_idx        on tree_revenue (farm_id);
create index if not exists tree_revenue_items_rev_idx   on tree_revenue_items (revenue_id);

-- ---------------------------------------------------------------------------
-- COUNT TRIGGER  -- current_count is SUM(quantity), always
-- ---------------------------------------------------------------------------

-- search_path is pinned. Without it the function resolves table names against
-- the caller's search_path, which is a privilege vector. sync_livestock_count
-- and sync_inventory_stock both have this gap (Supabase advisor:
-- function_search_path_mutable); no reason to inherit it here.
create or replace function public.sync_tree_planting_count()
returns trigger
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_planting_id uuid;
begin
  v_planting_id := coalesce(new.planting_id, old.planting_id);
  update tree_plantings
  set current_count = coalesce(
    (select sum(quantity) from tree_count_logs where planting_id = v_planting_id), 0
  )
  where id = v_planting_id;
  return coalesce(new, old);
end;
$function$;

drop trigger if exists trg_sync_tree_planting_count on public.tree_count_logs;
create trigger trg_sync_tree_planting_count
  after insert or update or delete on public.tree_count_logs
  for each row execute function public.sync_tree_planting_count();

-- ---------------------------------------------------------------------------
-- SPECIES TOTALS VIEW
-- security_invoker so the base tables' farm-scoped RLS does the filtering.
-- (0005 exists because eight views were missing exactly this.)
-- ---------------------------------------------------------------------------

create or replace view public.v_tree_species_totals
with (security_invoker = on) as
select
  s.id         as species_id,
  s.farm_id,
  s.name_local,
  s.name_en,
  s.purpose,
  coalesce(sum(p.current_count), 0)::int as total_count,
  count(p.id)::int                       as planting_count
from tree_species s
left join tree_plantings p on p.species_id = s.id
group by s.id, s.farm_id, s.name_local, s.name_en, s.purpose;

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- A new table without these is readable by anon, whose key ships in the
-- frontend bundle. Not optional. (CLAUDE.md section 6.)
-- ---------------------------------------------------------------------------

alter table public.tree_species       enable row level security;
alter table public.tree_plantings     enable row level security;
alter table public.tree_count_logs    enable row level security;
alter table public.tree_revenue       enable row level security;
alter table public.tree_revenue_items enable row level security;

drop policy if exists tree_species_select on public.tree_species;
drop policy if exists tree_species_insert on public.tree_species;
drop policy if exists tree_species_update on public.tree_species;
drop policy if exists tree_species_delete on public.tree_species;
create policy tree_species_select on public.tree_species for select using (is_farm_member(farm_id));
create policy tree_species_insert on public.tree_species for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy tree_species_update on public.tree_species for update using (has_farm_role(farm_id, 'manager'::text));
create policy tree_species_delete on public.tree_species for delete using (has_farm_role(farm_id, 'admin'::text));

drop policy if exists tree_plantings_select on public.tree_plantings;
drop policy if exists tree_plantings_insert on public.tree_plantings;
drop policy if exists tree_plantings_update on public.tree_plantings;
drop policy if exists tree_plantings_delete on public.tree_plantings;
create policy tree_plantings_select on public.tree_plantings for select using (is_farm_member(farm_id));
create policy tree_plantings_insert on public.tree_plantings for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy tree_plantings_update on public.tree_plantings for update using (has_farm_role(farm_id, 'manager'::text));
create policy tree_plantings_delete on public.tree_plantings for delete using (has_farm_role(farm_id, 'admin'::text));

drop policy if exists tree_count_logs_select on public.tree_count_logs;
drop policy if exists tree_count_logs_insert on public.tree_count_logs;
drop policy if exists tree_count_logs_update on public.tree_count_logs;
drop policy if exists tree_count_logs_delete on public.tree_count_logs;
create policy tree_count_logs_select on public.tree_count_logs for select using (is_farm_member(farm_id));
create policy tree_count_logs_insert on public.tree_count_logs for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy tree_count_logs_update on public.tree_count_logs for update using (has_farm_role(farm_id, 'manager'::text));
create policy tree_count_logs_delete on public.tree_count_logs for delete using (has_farm_role(farm_id, 'admin'::text));

drop policy if exists tree_revenue_select on public.tree_revenue;
drop policy if exists tree_revenue_insert on public.tree_revenue;
drop policy if exists tree_revenue_update on public.tree_revenue;
drop policy if exists tree_revenue_delete on public.tree_revenue;
create policy tree_revenue_select on public.tree_revenue for select using (is_farm_member(farm_id));
create policy tree_revenue_insert on public.tree_revenue for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy tree_revenue_update on public.tree_revenue for update using (has_farm_role(farm_id, 'manager'::text));
create policy tree_revenue_delete on public.tree_revenue for delete using (has_farm_role(farm_id, 'admin'::text));

drop policy if exists tree_revenue_items_select on public.tree_revenue_items;
drop policy if exists tree_revenue_items_insert on public.tree_revenue_items;
drop policy if exists tree_revenue_items_update on public.tree_revenue_items;
drop policy if exists tree_revenue_items_delete on public.tree_revenue_items;
create policy tree_revenue_items_select on public.tree_revenue_items for select using (is_farm_member(farm_id));
create policy tree_revenue_items_insert on public.tree_revenue_items for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy tree_revenue_items_update on public.tree_revenue_items for update using (has_farm_role(farm_id, 'manager'::text));
create policy tree_revenue_items_delete on public.tree_revenue_items for delete using (has_farm_role(farm_id, 'admin'::text));
