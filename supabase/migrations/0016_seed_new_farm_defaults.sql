-- 0016 — a new farm is born usable, not empty.
--
-- Until now create_farm_with_membership() inserted exactly two rows: the farm and
-- the creator's admin membership. Every master table was empty, so a self-serve
-- signup landed in an app with no activity types, no crops, no inventory — nothing
-- to actually record work against. This seeds the masters every farm needs.
--
-- Deliberately NOT seeded: buyers and partners. Those are real trade counterparties;
-- cloning the demo farm's into a stranger's account would leak business relationships.
-- Also not seeded: brand-specific chemicals and any real stock figures. Every seeded
-- inventory item starts at current_stock = 0 — the owner enters his own opening stock.

-- ---------------------------------------------------------------------------
-- PART 1 — farm-scope three UNIQUE constraints that were accidentally global.
--
-- These were written when the database had exactly one farm, so they never fired.
-- The moment a SECOND farm exists they become tenant-visible bugs:
--
--   activity_types (name)      -- farm A owns 'irrigation'; farm B can NEVER have it.
--                                 This one hard-blocks the seed below.
--   livestock_master (tag_id)  -- farm A tags a cow '101'; farm B can never use '101'.
--   public_holidays (date)     -- farm A adds Holi; farm B is refused — and RLS hides
--                                 the conflicting row, so the error looks like nonsense.
--
-- Safe to re-scope: no FK targets any of these columns (all FKs point at id), and no
-- table has duplicates within a farm today, so the new indexes build cleanly.
-- ---------------------------------------------------------------------------

alter table public.activity_types   drop constraint if exists activity_types_name_key;
alter table public.livestock_master drop constraint if exists livestock_master_tag_id_key;
alter table public.public_holidays  drop constraint if exists public_holidays_date_key;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'activity_types_farm_id_name_key') then
    alter table public.activity_types
      add constraint activity_types_farm_id_name_key unique (farm_id, name);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'livestock_master_farm_id_tag_id_key') then
    alter table public.livestock_master
      add constraint livestock_master_farm_id_tag_id_key unique (farm_id, tag_id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'public_holidays_farm_id_date_key') then
    alter table public.public_holidays
      add constraint public_holidays_farm_id_date_key unique (farm_id, date);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- PART 2 — seed_farm_defaults()
--
-- SECURITY DEFINER so it bypasses RLS: at the moment this runs the caller's
-- farm_memberships row may not be visible to the policies yet, and seeding is a
-- trusted system action either way. No policy changes are needed.
--
-- Idempotent: returns immediately if the farm already has masters, so a retry or a
-- manual second call cannot double-seed.
-- ---------------------------------------------------------------------------

create or replace function public.seed_farm_defaults(p_farm_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ratoon_id uuid;
  v_wheat_id     uuid;
  v_mustard_id   uuid;
  v_paddy_id     uuid;
  v_sugarcane_id uuid;
begin
  if p_farm_id is null then
    return;
  end if;

  -- already seeded? do nothing.
  if exists (select 1 from activity_types where farm_id = p_farm_id)
     or exists (select 1 from crops where farm_id = p_farm_id) then
    return;
  end if;

  -- -------------------------------------------------------------------------
  -- activity_types (11)
  -- -------------------------------------------------------------------------
  insert into activity_types (farm_id, name, label, emoji, is_system, is_active, sort_order)
  select p_farm_id, t.name, t.label, t.emoji, true, true, t.sort_order
  from (values
    ('irrigation',    'Irrigation',             '💧',  1),
    ('weeding',       'Weeding',                '🌿',  2),
    ('fertilizer',    'Fertilizer',             '🧪',  3),
    ('spray',         'Spray / Pesticide',      '🧴',  4),
    ('ploughing',     'Ploughing',              '🚜',  5),
    ('sowing',        'Sowing',                 '🌱',  6),
    ('harvesting',    'Harvesting',             '🌾',  7),
    ('intercultural', 'Intercultural Ops',      '🔧',  8),
    ('crop_ops',      'Other Crop Related Ops', '🌻',  9),
    ('events',        'Events',                 '📅', 10),
    ('other',         'Other',                  '📋', 11)
  ) as t(name, label, emoji, sort_order)
  on conflict (farm_id, name) do nothing;

  -- -------------------------------------------------------------------------
  -- crops (6)
  --
  -- Sugarcane.ratoon_crop_id points at Sugarcane Ratoon, so the ratoon row must be
  -- inserted first and its id captured. That self-reference dictates the order here.
  -- -------------------------------------------------------------------------
  insert into crops (farm_id, name, icon, color, season_type, duration_days,
                     price_per_qtl, yield_per_acre, harvest_window_days, residuals)
  values (p_farm_id, 'Sugarcane Ratoon', '🌾', '#E84393', 'rabi', 300, 400, 280, 30,
          '[{"name":"Sugarcane Tops (Hara Chara)","unit":"quintal","qty_per_acre":17,"expected_rate":180}]'::jsonb)
  returning id into v_ratoon_id;

  insert into crops (farm_id, name, icon, color, season_type, duration_days,
                     price_per_qtl, yield_per_acre, harvest_window_days, residuals, ratoon_crop_id)
  values (p_farm_id, 'Sugarcane', '🎋', '#1D9E75', 'rabi', 420, 400, 350, 30,
          '[{"name":"Sugarcane Tops (Hara Chara)","unit":"quintal","qty_per_acre":21,"expected_rate":180}]'::jsonb,
          v_ratoon_id)
  returning id into v_sugarcane_id;

  insert into crops (farm_id, name, icon, color, season_type, duration_days,
                     price_per_qtl, yield_per_acre, harvest_window_days, residuals)
  values (p_farm_id, 'Wheat', '🌾', '#FF6B6B', 'rabi', 140, 2200, 15, 20,
          '[{"name":"Wheat Straw (Bhoosa)","unit":"quintal","qty_per_acre":18,"expected_rate":150}]'::jsonb)
  returning id into v_wheat_id;

  insert into crops (farm_id, name, icon, color, season_type, duration_days,
                     price_per_qtl, yield_per_acre, harvest_window_days, residuals)
  values (p_farm_id, 'Mustard', '🌻', '#ba7517', 'rabi', 110, 6000, 5, 20,
          '[{"name":"Mustard Straw (Sarso Tori)","unit":"quintal","qty_per_acre":12,"expected_rate":80}]'::jsonb)
  returning id into v_mustard_id;

  insert into crops (farm_id, name, icon, color, season_type, duration_days,
                     price_per_qtl, yield_per_acre, harvest_window_days, residuals)
  values (p_farm_id, 'Paddy', '🌾', '#2AB5B5', 'kharif', 150, 1900, 25, 15,
          '[{"name":"Paddy Straw (Parali)","unit":"quintal","qty_per_acre":28,"expected_rate":100}]'::jsonb)
  returning id into v_paddy_id;

  insert into crops (farm_id, name, icon, color, season_type, duration_days,
                     price_per_qtl, yield_per_acre, harvest_window_days, residuals)
  values (p_farm_id, 'Chaini Paddy', '🌿', '#dcb428', 'kharif', 110, 1800, 35, 15,
          '[{"name":"Paddy Straw (Parali)","unit":"quintal","qty_per_acre":38,"expected_rate":100}]'::jsonb);

  -- -------------------------------------------------------------------------
  -- crop_activity_templates (42)
  --
  -- Sugarcane Ratoon and Chaini Paddy intentionally get none — the owner schedules
  -- those by hand, and the demo farm has none either.
  -- -------------------------------------------------------------------------
  insert into crop_activity_templates (farm_id, crop_id, day_offset, activity_type, label)
  select p_farm_id, v_wheat_id, t.day_offset, t.activity_type, t.label
  from (values
    (  0, 'sowing',     'Sowing — issue seeds to field'),
    (  7, 'irrigation', 'First irrigation after sowing'),
    ( 14, 'fertilizer', 'Basal dose — DAP'),
    ( 21, 'irrigation', 'Second irrigation'),
    ( 30, 'weeding',    'First weeding'),
    ( 35, 'irrigation', 'Crown root irrigation'),
    ( 45, 'fertilizer', 'Top dressing — Urea'),
    ( 55, 'irrigation', 'Jointing stage irrigation'),
    ( 65, 'spray',      'Pesticide spray (if needed)'),
    ( 75, 'irrigation', 'Heading stage irrigation'),
    ( 90, 'irrigation', 'Grain filling irrigation'),
    (110, 'irrigation', 'Pre-harvest irrigation'),
    (120, 'harvesting', 'Harvest')
  ) as t(day_offset, activity_type, label);

  insert into crop_activity_templates (farm_id, crop_id, day_offset, activity_type, label)
  select p_farm_id, v_mustard_id, t.day_offset, t.activity_type, t.label
  from (values
    (  0, 'sowing',     'Sowing'),
    ( 10, 'irrigation', 'First irrigation'),
    ( 20, 'fertilizer', 'Basal dose — DAP + Urea'),
    ( 30, 'irrigation', 'Second irrigation'),
    ( 40, 'weeding',    'Weeding'),
    ( 50, 'fertilizer', 'Top dressing — Urea'),
    ( 60, 'irrigation', 'Third irrigation'),
    ( 70, 'irrigation', 'Fourth irrigation (flowering)'),
    ( 80, 'spray',      'Aphid spray if needed'),
    (110, 'harvesting', 'Harvest')
  ) as t(day_offset, activity_type, label);

  insert into crop_activity_templates (farm_id, crop_id, day_offset, activity_type, label)
  select p_farm_id, v_paddy_id, t.day_offset, t.activity_type, t.label
  from (values
    (  0, 'sowing',     'Transplanting seedlings'),
    ( 10, 'fertilizer', 'Basal dose'),
    ( 20, 'weeding',    'First weeding'),
    ( 35, 'fertilizer', 'Urea first dose'),
    ( 50, 'spray',      'Pesticide spray'),
    ( 70, 'fertilizer', 'Urea second dose'),
    (100, 'irrigation', 'Flush irrigation (last)'),
    (130, 'harvesting', 'Harvest')
  ) as t(day_offset, activity_type, label);

  insert into crop_activity_templates (farm_id, crop_id, day_offset, activity_type, label)
  select p_farm_id, v_sugarcane_id, t.day_offset, t.activity_type, t.label
  from (values
    (  0, 'sowing',     'Planting setts'),
    ( 30, 'irrigation', 'Irrigation'),
    ( 45, 'fertilizer', 'Nitrogen — Urea first dose'),
    ( 60, 'weeding',    'Weeding + earthing up'),
    ( 90, 'irrigation', 'Irrigation'),
    (120, 'fertilizer', 'Potash + Urea second dose'),
    (150, 'irrigation', 'Irrigation'),
    (210, 'irrigation', 'Irrigation'),
    (240, 'fertilizer', 'Third fertilizer dose'),
    (300, 'irrigation', 'Irrigation'),
    (365, 'harvesting', 'Harvest — crush season')
  ) as t(day_offset, activity_type, label);

  -- -------------------------------------------------------------------------
  -- inventory_items (10 generic basics)
  --
  -- current_stock is ALWAYS 0 — these are the item definitions, not the owner's
  -- stock. cost_per_unit is an indicative starting price he is expected to edit.
  -- -------------------------------------------------------------------------
  insert into inventory_items (farm_id, name, unit, category, cost_per_unit, current_stock, min_threshold)
  select p_farm_id, t.name, t.unit, t.category, t.cost_per_unit, 0, t.min_threshold
  from (values
    ('Urea',            'bag (45 kg)', 'fertilizer',  325.00, 10),
    ('DAP',             'bag (50kg)',  'fertilizer', 1580.00,  5),
    ('Potash (MOP)',    'bag (50kg)',  'fertilizer', 1950.00,  2),
    ('Zinc Sulphate',   'kg',          'fertilizer',   65.00,  5),
    ('Diesel',          'litre',       'fuel',         96.15, 50),
    ('Engine Oil',      'litre',       'other',       180.00,  2),
    ('Wheat Seeds',     'kg',          'seed',         45.00,  0),
    ('Paddy Seeds',     'kg',          'seed',         55.00,  0),
    ('Mustard Seeds',   'kg',          'seed',        500.00,  0),
    ('Sugarcane Setts', 'kg',          'seed',          4.00,  0)
  ) as t(name, unit, category, cost_per_unit, min_threshold);
end;
$function$;

-- ---------------------------------------------------------------------------
-- PART 3 — call the seeder from farm creation.
--
-- Body is unchanged from 0000b_baseline_policies.sql apart from the single
-- `perform seed_farm_defaults(...)` line. Same transaction, so a farm can never
-- exist in a half-seeded state: if seeding raises, the farm insert rolls back too.
-- ---------------------------------------------------------------------------

create or replace function public.create_farm_with_membership(
  p_name text,
  p_location text default 'India'::text,
  p_total_acres double precision default 0,
  p_map_state jsonb default null::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_farm_id uuid;
  v_result  jsonb;
BEGIN
  -- Create farm (SECURITY DEFINER bypasses RLS, auth.uid() still works from JWT)
  INSERT INTO farms (name, location, total_acres, map_state, owner_id)
  VALUES (p_name, p_location, p_total_acres, p_map_state, auth.uid())
  RETURNING id INTO v_farm_id;

  -- Create admin membership atomically in the same transaction
  INSERT INTO farm_memberships (farm_id, user_id, role, status)
  VALUES (v_farm_id, auth.uid(), 'admin', 'active');

  -- Populate the masters so the farm is usable the moment the owner lands in it
  PERFORM seed_farm_defaults(v_farm_id);

  -- Return full farm row (SELECT also runs as postgres, bypasses RLS)
  SELECT to_jsonb(f) INTO v_result FROM farms f WHERE f.id = v_farm_id;
  RETURN v_result;
END;
$function$;
