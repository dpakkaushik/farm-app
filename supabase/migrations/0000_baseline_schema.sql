-- Baseline schema, captured from the live database on 2026-07-13.
--
-- Why this file exists: the schema was built by hand in the Supabase dashboard
-- and existed nowhere in version control -- 43 tables, of which the repo
-- described 14, wrongly. That gap has already cost four bugs; see
-- supabase/README.md.
--
-- This is a snapshot of what was ALREADY LIVE, not a change. Every statement is
-- idempotent, so running it against the current database is a no-op. Its real
-- job is to make the database rebuildable from scratch -- for a staging copy, or
-- after a loss.
--
-- Generated from pg_catalog, so it reflects reality rather than intent.
--
-- NOT included here: RLS policies, functions (is_farm_member, has_farm_role),
-- triggers, and RPCs. Those still live only in the dashboard. Capturing them is
-- the next job.
--
-- From here on: schema changes go in a numbered migration, never a dashboard click.


-- ---------------------------------------------------------------------------
-- TABLES
-- ---------------------------------------------------------------------------

create table if not exists public.activity_logs (
  id uuid default uuid_generate_v4() not null,
  cycle_id uuid,
  plot_id uuid,
  activity_template_id uuid,
  activity_type text not null,
  activity_name text not null,
  scheduled_date date,
  actual_date date,
  worker_count integer default 0,
  status text default 'done'::text not null,
  notes text,
  created_at timestamp with time zone default now(),
  regular_worker_ids jsonb default '[]'::jsonb not null,
  outside_labour_count integer default 0 not null,
  farm_id uuid
);
create table if not exists public.activity_types (
  id uuid default gen_random_uuid() not null,
  name text not null,
  label text not null,
  emoji text default '📋'::text not null,
  is_system boolean default false not null,
  is_active boolean default true not null,
  sort_order integer default 99 not null,
  farm_id uuid
);
create table if not exists public.alerts (
  id uuid default uuid_generate_v4() not null,
  alert_type text not null,
  severity text not null,
  title text not null,
  message text not null,
  entity_type text,
  entity_id uuid,
  is_read boolean default false,
  created_at timestamp with time zone default now(),
  farm_id uuid
);
create table if not exists public.attendance (
  id uuid default uuid_generate_v4() not null,
  labour_master_id uuid not null,
  attendance_date date not null,
  status text not null,
  notes text,
  farm_id uuid
);
create table if not exists public.buyers (
  id uuid default gen_random_uuid() not null,
  name text not null,
  address text,
  contact text,
  type text default 'mill'::text,
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  buys text[] default '{}'::text[] not null,
  farm_id uuid
);
create table if not exists public.crop_activity_templates (
  id uuid default uuid_generate_v4() not null,
  crop_id uuid not null,
  day_offset integer not null,
  activity_type text not null,
  label text not null,
  notify boolean default true,
  notes text,
  farm_id uuid
);
create table if not exists public.crop_cycles (
  id uuid default uuid_generate_v4() not null,
  plot_id uuid not null,
  crop_id uuid not null,
  season text not null,
  sow_date date not null,
  expected_harvest_start date,
  expected_harvest_end date,
  actual_harvest_start date,
  actual_harvest_end date,
  status text default 'active'::text not null,
  budget numeric(12,2),
  notes text,
  created_at timestamp with time zone default now(),
  parent_cycle_id uuid,
  mill_name text,
  grower_code text,
  farm_id uuid
);
create table if not exists public.crop_health_logs (
  id uuid default uuid_generate_v4() not null,
  cycle_id uuid not null,
  log_date date not null,
  health_rating text not null,
  issue_tags jsonb default '[]'::jsonb,
  notes text,
  created_at timestamp with time zone default now(),
  farm_id uuid not null
);
create table if not exists public.crop_residuals (
  id uuid default gen_random_uuid() not null,
  crop_cycle_id uuid not null,
  harvest_session_id uuid not null,
  product_name text not null,
  quantity numeric default 0 not null,
  unit text default 'quintal'::text not null,
  expected_rate numeric,
  expected_revenue numeric,
  status text default 'open'::text not null,
  sale_date date,
  buyer_name text,
  actual_rate numeric,
  actual_revenue numeric,
  payment_status text default 'pending'::text not null,
  notes text,
  created_at timestamp with time zone default now(),
  farm_id uuid
);
create table if not exists public.crops (
  id uuid default uuid_generate_v4() not null,
  name text not null,
  color text,
  icon text,
  duration_days integer not null,
  harvest_window_days integer default 14 not null,
  price_per_qtl numeric(10,2),
  yield_per_acre numeric(8,2),
  season_type text,
  notes text,
  ratoon_crop_id uuid,
  variety_category text,
  residuals jsonb default '[]'::jsonb,
  farm_id uuid
);
create table if not exists public.daily_diary (
  id uuid default uuid_generate_v4() not null,
  diary_date date not null,
  summary text,
  tomorrows_plan text,
  submitted_at timestamp with time zone default now(),
  farm_id uuid not null,
  logged_by uuid
);
create table if not exists public.diesel_logs (
  id uuid default uuid_generate_v4() not null,
  machinery_id uuid not null,
  fill_date date not null,
  quantity_litres numeric(8,2) not null,
  cost_per_litre numeric(6,2) not null,
  total_cost numeric(10,2) default (quantity_litres * cost_per_litre),
  odometer integer,
  purpose text,
  plot_id uuid,
  cycle_id uuid,
  notes text,
  farm_id uuid
);
create table if not exists public.expense_payments (
  id uuid default gen_random_uuid() not null,
  farm_id uuid,
  payment_date date default CURRENT_DATE not null,
  amount numeric(12,2) not null,
  expense_type text not null,
  reference_id uuid,
  payment_mode text default 'cash'::text not null,
  cash_entry_id uuid,
  notes text,
  created_by uuid,
  created_at timestamp with time zone default now() not null
);
create table if not exists public.farm_assets (
  id uuid default uuid_generate_v4() not null,
  name text not null,
  category text not null,
  purchase_date date,
  purchase_price numeric(12,2),
  current_value numeric(12,2),
  status text default 'in_use'::text not null,
  location text,
  notes text,
  quantity integer default 1 not null,
  is_active boolean default true not null,
  display_id text,
  disposal_type text,
  disposal_date date,
  disposal_amount numeric,
  disposal_buyer text,
  disposal_notes text,
  photo_url text,
  farm_id uuid
);
create table if not exists public.farm_expenses (
  id uuid default gen_random_uuid() not null,
  expense_date date not null,
  category text not null,
  amount numeric(10,2) not null,
  description text not null,
  attributed_to text,
  livestock_id uuid,
  payment_mode text,
  paid_to text,
  attachment_path text,
  notes text,
  created_at timestamp with time zone default now(),
  farm_id uuid
);
create table if not exists public.farm_invitations (
  id uuid default gen_random_uuid() not null,
  farm_id uuid not null,
  email text,
  role text not null,
  token uuid default gen_random_uuid() not null,
  invited_by uuid not null,
  expires_at timestamp with time zone default (now() + '7 days'::interval) not null,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  invitee_phone text
);
create table if not exists public.farm_memberships (
  id uuid default gen_random_uuid() not null,
  farm_id uuid not null,
  user_id uuid not null,
  role text not null,
  status text default 'active'::text not null,
  invited_by uuid,
  joined_at timestamp with time zone default now()
);
create table if not exists public.farms (
  id uuid default gen_random_uuid() not null,
  name text not null,
  location text default 'India'::text not null,
  total_acres double precision default 0 not null,
  owner_id uuid not null,
  geo_bounds jsonb,
  map_state jsonb,
  overlay_config jsonb,
  created_at timestamp with time zone default now()
);
create table if not exists public.harvest_sessions (
  id uuid default uuid_generate_v4() not null,
  cycle_id uuid not null,
  harvest_date date not null,
  quantity_kg numeric(10,2) not null,
  quality_grade text,
  storage_location text,
  harvested_by text,
  notes text,
  created_at timestamp with time zone default now(),
  parchi_number text,
  partner_id uuid,
  parchi_attachment_path text,
  farm_id uuid,
  moisture_pct numeric(5,2)
);
create table if not exists public.inventory_bills (
  id uuid default uuid_generate_v4() not null,
  bill_date date not null,
  vendor_name text not null,
  invoice_number text,
  notes text,
  bill_file_url text,
  total_amount numeric(12,2) default 0 not null,
  created_by uuid,
  created_at timestamp with time zone default now(),
  vendor_id uuid,
  farm_id uuid
);
create table if not exists public.inventory_issues (
  id uuid default uuid_generate_v4() not null,
  item_id uuid not null,
  cycle_id uuid,
  activity_log_id uuid,
  issue_date date not null,
  quantity numeric(10,2) not null,
  cost_per_unit numeric(10,2) not null,
  total_cost numeric(12,2) default (quantity * cost_per_unit),
  purpose text,
  plot_id uuid,
  stage text default 'active'::text not null,
  unit_cost_at_issue numeric,
  entry_date timestamp with time zone default now(),
  machinery_id uuid,
  livestock_id uuid,
  farm_id uuid
);
create table if not exists public.inventory_items (
  id uuid default uuid_generate_v4() not null,
  name text not null,
  category text not null,
  unit text not null,
  current_stock numeric(10,2) default 0 not null,
  min_threshold numeric(10,2),
  cost_per_unit numeric(10,2),
  notes text,
  farm_id uuid
);
create table if not exists public.inventory_purchases (
  id uuid default uuid_generate_v4() not null,
  item_id uuid not null,
  purchase_date date not null,
  quantity numeric(10,2) not null,
  unit_price numeric(10,2) not null,
  total_cost numeric(12,2) default (quantity * unit_price),
  vendor_name text,
  invoice_number text,
  notes text,
  entry_date timestamp with time zone default now(),
  invoice_date date,
  bill_image_path text,
  vendor_id uuid,
  bill_id uuid,
  farm_id uuid
);
create table if not exists public.labour_activity_rates (
  id uuid default uuid_generate_v4() not null,
  activity_type text not null,
  labour_type text not null,
  rate numeric(8,2) not null,
  rate_unit text not null,
  notes text,
  farm_id uuid
);
create table if not exists public.labour_logs (
  id uuid default uuid_generate_v4() not null,
  labour_type text not null,
  labour_master_id uuid,
  labour_name text not null,
  activity_log_id uuid,
  plot_id uuid,
  cycle_id uuid,
  work_type text not null,
  activity_date date not null,
  entry_date date default CURRENT_DATE not null,
  quantity numeric(8,2),
  quantity_unit text,
  base_rate numeric(8,2),
  extra_rate numeric(8,2) default 0,
  total_payment numeric(10,2),
  is_paid boolean default false,
  paid_date date,
  paid_via text,
  notes text,
  work_type_id uuid,
  contract_type text,
  contract_qty numeric,
  farm_id uuid
);
create table if not exists public.labour_master (
  id uuid default uuid_generate_v4() not null,
  name text not null,
  phone text,
  sub_type text not null,
  daily_base_rate numeric(8,2),
  status text default 'active'::text not null,
  photo_url text,
  join_date date,
  notes text,
  designation text,
  monthly_salary numeric default 0,
  opening_balance numeric default 0,
  monthly_holiday integer default 2 not null,
  farm_id uuid
);
create table if not exists public.livestock_count_logs (
  id uuid default gen_random_uuid() not null,
  livestock_id uuid not null,
  log_date date not null,
  change_type text not null,
  reason text not null,
  quantity integer not null,
  notes text,
  added_by text,
  entry_date timestamp with time zone default now(),
  farm_id uuid
);
create table if not exists public.livestock_health_logs (
  id uuid default uuid_generate_v4() not null,
  livestock_id uuid not null,
  log_date date not null,
  health_status text not null,
  symptoms text,
  treatment text,
  vet_name text,
  next_checkup date,
  notes text,
  farm_id uuid
);
create table if not exists public.livestock_master (
  id uuid default uuid_generate_v4() not null,
  tag_id text not null,
  name text,
  animal_type text not null,
  breed text,
  gender text not null,
  dob date,
  purchase_date date,
  purchase_price numeric(10,2),
  health_status text default 'healthy'::text not null,
  photo_url text,
  is_active boolean default true,
  notes text,
  species text,
  tracking_mode text default 'individual'::text not null,
  current_count integer,
  acquisition_type text default 'purchased'::text,
  status text default 'active'::text,
  sold_date date,
  farm_id uuid
);
create table if not exists public.livestock_revenue (
  id uuid default gen_random_uuid() not null,
  livestock_id uuid,
  revenue_date date not null,
  revenue_type text not null,
  quantity numeric(10,3),
  unit text,
  rate_per_unit numeric(10,2),
  amount numeric(10,2) not null,
  buyer_name text,
  payment_mode text,
  attachment_path text,
  notes text,
  is_sale boolean default false,
  created_at timestamp with time zone default now(),
  farm_id uuid
);
create table if not exists public.machinery_master (
  id uuid default uuid_generate_v4() not null,
  name text not null,
  machinery_type text not null,
  make text,
  model text,
  year integer,
  registration_no text,
  status text default 'in_use'::text not null,
  purchase_date date,
  purchase_price numeric(12,2),
  photo_url text,
  notes text,
  quantity integer default 1 not null,
  requires_diesel boolean default false not null,
  is_active boolean default true not null,
  display_id text,
  disposal_type text,
  disposal_date date,
  disposal_amount numeric,
  disposal_buyer text,
  disposal_notes text,
  farm_id uuid
);
create table if not exists public.media_files (
  id uuid default uuid_generate_v4() not null,
  entity_type text not null,
  entity_id uuid,
  file_type text not null,
  storage_path text not null,
  original_name text,
  file_size_bytes integer,
  mime_type text,
  uploaded_by text,
  created_at timestamp with time zone default now(),
  plot_id uuid,
  activity_type text,
  caption text,
  photo_date date,
  thumbnail_path text,
  farm_id uuid
);
create table if not exists public.owner_cash_entries (
  id uuid default gen_random_uuid() not null,
  farm_id uuid,
  entry_date date default CURRENT_DATE not null,
  amount numeric(12,2) not null,
  direction text not null,
  entry_type text default 'owner_capital'::text not null,
  reference_id uuid,
  notes text,
  created_by uuid,
  created_at timestamp with time zone default now() not null
);
create table if not exists public.partners (
  id uuid default gen_random_uuid() not null,
  name text not null,
  is_active boolean default true,
  farm_id uuid
);
create table if not exists public.plots (
  id uuid default uuid_generate_v4() not null,
  name text not null,
  area_acres numeric(6,2) not null,
  soil_type text,
  water_source text,
  geo_polygon jsonb,
  status text default 'active'::text not null,
  notes text,
  created_at timestamp with time zone default now(),
  point_a_lat double precision,
  point_a_lng double precision,
  point_b_lat double precision,
  point_b_lng double precision,
  point_c_lat double precision,
  point_c_lng double precision,
  point_d_lat double precision,
  point_d_lng double precision,
  farm_id uuid
);
create table if not exists public.public_holidays (
  id uuid default uuid_generate_v4() not null,
  date date not null,
  name text not null,
  created_at timestamp with time zone default now(),
  farm_id uuid
);
create table if not exists public.salary_advances (
  id uuid default uuid_generate_v4() not null,
  labourer_id uuid not null,
  advance_date date not null,
  amount numeric not null,
  reason text,
  given_by text,
  is_recovered boolean default false not null,
  recovery_month date,
  created_at timestamp with time zone default now(),
  payment_mode text default 'cash'::text,
  attachment_url text,
  farm_id uuid
);
create table if not exists public.salary_payments (
  id uuid default uuid_generate_v4() not null,
  labourer_id uuid not null,
  payment_month date not null,
  days_present numeric default 0,
  gross_salary numeric default 0,
  opening_balance numeric default 0,
  advances_total numeric default 0,
  net_payable numeric default 0,
  amount_paid numeric default 0,
  closing_balance numeric default 0,
  payment_date date,
  notes text,
  status text default 'draft'::text not null,
  created_by uuid,
  created_at timestamp with time zone default now(),
  given_by text,
  payment_mode text default 'cash'::text,
  attachment_url text,
  farm_id uuid
);
create table if not exists public.sales (
  id uuid default uuid_generate_v4() not null,
  cycle_id uuid not null,
  harvest_session_id uuid,
  sale_date date not null,
  buyer_name text not null,
  buyer_contact text,
  quantity_kg numeric(10,2) not null,
  rate_per_kg numeric(8,2) not null,
  total_amount numeric(12,2) default (quantity_kg * rate_per_kg),
  payment_method text,
  payment_status text default 'pending'::text not null,
  amount_received numeric(12,2),
  payment_date date,
  notes text,
  deductions numeric default 0,
  deductions_note text,
  buyer_id uuid,
  payment_attachment_path text,
  farm_id uuid,
  commission_per_qtl numeric(5,2),
  freight_charges numeric(12,2)
);
create table if not exists public.user_profiles (
  id uuid not null,
  email text not null,
  full_name text,
  role text default 'view_only'::text not null,
  phone text,
  is_active boolean default true not null,
  created_at timestamp with time zone default now(),
  is_super_admin boolean default false not null,
  avatar_url text
);
create table if not exists public.vendor_payments (
  id uuid default gen_random_uuid() not null,
  farm_id uuid,
  vendor_id uuid not null,
  payment_date date default CURRENT_DATE not null,
  amount numeric(12,2) not null,
  payment_mode text default 'cash'::text not null,
  notes text,
  cash_entry_id uuid,
  created_by uuid,
  created_at timestamp with time zone default now() not null
);
create table if not exists public.vendors (
  id uuid default gen_random_uuid() not null,
  name text not null,
  category text default 'other'::text not null,
  phone text,
  address text,
  credit_days integer default 0 not null,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  farm_id uuid
);
create table if not exists public.work_types (
  id uuid default gen_random_uuid() not null,
  name text not null,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  farm_id uuid
);

-- ---------------------------------------------------------------------------
-- CONSTRAINTS  (primary keys, foreign keys, unique, check)
-- ---------------------------------------------------------------------------

alter table activity_logs add constraint activity_logs_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
alter table activity_logs add constraint activity_logs_pkey PRIMARY KEY (id);
alter table activity_logs add constraint activity_logs_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES crop_cycles(id);
alter table activity_logs add constraint activity_logs_plot_id_fkey FOREIGN KEY (plot_id) REFERENCES plots(id);
alter table activity_logs add constraint activity_logs_activity_template_id_fkey FOREIGN KEY (activity_template_id) REFERENCES crop_activity_templates(id);
alter table activity_types add constraint activity_types_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
alter table activity_types add constraint activity_types_name_key UNIQUE (name);
alter table activity_types add constraint activity_types_pkey PRIMARY KEY (id);
alter table alerts add constraint alerts_pkey PRIMARY KEY (id);
alter table alerts add constraint alerts_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
alter table attendance add constraint attendance_pkey PRIMARY KEY (id);
alter table attendance add constraint attendance_labour_master_id_attendance_date_key UNIQUE (labour_master_id, attendance_date);
alter table attendance add constraint attendance_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
alter table attendance add constraint attendance_labour_master_id_fkey FOREIGN KEY (labour_master_id) REFERENCES labour_master(id);
alter table buyers add constraint buyers_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
alter table buyers add constraint buyers_pkey PRIMARY KEY (id);
alter table crop_activity_templates add constraint crop_activity_templates_crop_id_fkey FOREIGN KEY (crop_id) REFERENCES crops(id);
alter table crop_activity_templates add constraint crop_activity_templates_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
alter table crop_activity_templates add constraint crop_activity_templates_pkey PRIMARY KEY (id);
alter table crop_cycles add constraint crop_cycles_parent_cycle_id_fkey FOREIGN KEY (parent_cycle_id) REFERENCES crop_cycles(id);
alter table crop_cycles add constraint crop_cycles_pkey PRIMARY KEY (id);
alter table crop_cycles add constraint crop_cycles_plot_id_fkey FOREIGN KEY (plot_id) REFERENCES plots(id);
alter table crop_cycles add constraint crop_cycles_crop_id_fkey FOREIGN KEY (crop_id) REFERENCES crops(id);
alter table crop_cycles add constraint crop_cycles_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
alter table crop_health_logs add constraint crop_health_logs_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES crop_cycles(id);
alter table crop_health_logs add constraint crop_health_logs_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
alter table crop_health_logs add constraint crop_health_logs_pkey PRIMARY KEY (id);
alter table crop_residuals add constraint crop_residuals_harvest_session_id_fkey FOREIGN KEY (harvest_session_id) REFERENCES harvest_sessions(id) ON DELETE CASCADE;
alter table crop_residuals add constraint crop_residuals_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
alter table crop_residuals add constraint crop_residuals_crop_cycle_id_fkey FOREIGN KEY (crop_cycle_id) REFERENCES crop_cycles(id) ON DELETE CASCADE;
alter table crop_residuals add constraint crop_residuals_pkey PRIMARY KEY (id);
alter table crop_residuals add constraint crop_residuals_payment_status_check CHECK ((payment_status = ANY (ARRAY['pending'::text, 'received'::text])));
alter table crop_residuals add constraint crop_residuals_status_check CHECK ((status = ANY (ARRAY['open'::text, 'sold'::text])));
alter table crops add constraint crops_ratoon_crop_id_fkey FOREIGN KEY (ratoon_crop_id) REFERENCES crops(id);
alter table crops add constraint crops_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
alter table crops add constraint crops_pkey PRIMARY KEY (id);
alter table daily_diary add constraint daily_diary_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
alter table daily_diary add constraint daily_diary_pkey PRIMARY KEY (id);
alter table daily_diary add constraint daily_diary_logged_by_fkey FOREIGN KEY (logged_by) REFERENCES auth.users(id);
alter table diesel_logs add constraint diesel_logs_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
alter table diesel_logs add constraint diesel_logs_pkey PRIMARY KEY (id);
alter table diesel_logs add constraint diesel_logs_machinery_id_fkey FOREIGN KEY (machinery_id) REFERENCES machinery_master(id);
alter table diesel_logs add constraint diesel_logs_plot_id_fkey FOREIGN KEY (plot_id) REFERENCES plots(id);
alter table diesel_logs add constraint diesel_logs_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES crop_cycles(id);
alter table expense_payments add constraint expense_payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table expense_payments add constraint expense_payments_cash_entry_id_fkey FOREIGN KEY (cash_entry_id) REFERENCES owner_cash_entries(id) ON DELETE SET NULL;
alter table expense_payments add constraint expense_payments_pkey PRIMARY KEY (id);
alter table expense_payments add constraint expense_payments_amount_check CHECK ((amount > (0)::numeric));
alter table expense_payments add constraint expense_payments_expense_type_check CHECK ((expense_type = ANY (ARRAY['labour'::text, 'salary'::text, 'farm_expense'::text, 'other'::text])));
alter table expense_payments add constraint expense_payments_payment_mode_check CHECK ((payment_mode = ANY (ARRAY['cash'::text, 'bank_transfer'::text, 'cheque'::text, 'upi'::text])));
alter table farm_assets add constraint farm_assets_pkey PRIMARY KEY (id);
alter table farm_assets add constraint farm_assets_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
alter table farm_expenses add constraint farm_expenses_attributed_to_check CHECK ((attributed_to = ANY (ARRAY['livestock'::text, 'asset'::text, 'general'::text])));
alter table farm_expenses add constraint farm_expenses_payment_mode_check CHECK ((payment_mode = ANY (ARRAY['cash'::text, 'upi'::text, 'bank'::text, 'credit'::text])));
alter table farm_expenses add constraint farm_expenses_pkey PRIMARY KEY (id);
alter table farm_expenses add constraint farm_expenses_livestock_id_fkey FOREIGN KEY (livestock_id) REFERENCES livestock_master(id) ON DELETE SET NULL;
alter table farm_expenses add constraint farm_expenses_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
alter table farm_expenses add constraint farm_expenses_category_check CHECK ((category = ANY (ARRAY['feed'::text, 'veterinary'::text, 'livestock_care'::text, 'maintenance'::text, 'infrastructure'::text, 'utilities'::text, 'event'::text, 'administrative'::text, 'other'::text])));
alter table farm_invitations add constraint farm_invitations_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'manager'::text, 'view_only'::text])));
alter table farm_invitations add constraint farm_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id);
alter table farm_invitations add constraint farm_invitations_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
alter table farm_invitations add constraint farm_invitations_token_key UNIQUE (token);
alter table farm_invitations add constraint farm_invitations_pkey PRIMARY KEY (id);
alter table farm_memberships add constraint farm_memberships_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
alter table farm_memberships add constraint farm_memberships_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id);
alter table farm_memberships add constraint farm_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table farm_memberships add constraint farm_memberships_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'manager'::text, 'view_only'::text])));
alter table farm_memberships add constraint farm_memberships_status_check CHECK ((status = ANY (ARRAY['active'::text, 'pending'::text])));
alter table farm_memberships add constraint farm_memberships_pkey PRIMARY KEY (id);
alter table farm_memberships add constraint farm_memberships_farm_id_user_id_key UNIQUE (farm_id, user_id);
alter table farms add constraint farms_pkey PRIMARY KEY (id);
alter table farms add constraint farms_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id);
alter table harvest_sessions add constraint harvest_sessions_pkey PRIMARY KEY (id);
alter table harvest_sessions add constraint harvest_sessions_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES partners(id);
alter table harvest_sessions add constraint harvest_sessions_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
alter table harvest_sessions add constraint harvest_sessions_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES crop_cycles(id);
alter table inventory_bills add constraint inventory_bills_pkey PRIMARY KEY (id);
alter table inventory_bills add constraint inventory_bills_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
alter table inventory_bills add constraint inventory_bills_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES vendors(id);
alter table inventory_bills add constraint inventory_bills_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table inventory_issues add constraint inventory_issues_activity_log_id_fkey FOREIGN KEY (activity_log_id) REFERENCES activity_logs(id);
alter table inventory_issues add constraint inventory_issues_pkey PRIMARY KEY (id);
alter table inventory_issues add constraint inventory_issues_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
alter table inventory_issues add constraint inventory_issues_item_id_fkey FOREIGN KEY (item_id) REFERENCES inventory_items(id);
alter table inventory_issues add constraint inventory_issues_plot_id_fkey FOREIGN KEY (plot_id) REFERENCES plots(id);
alter table inventory_issues add constraint inventory_issues_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES crop_cycles(id);
alter table inventory_issues add constraint inventory_issues_machinery_id_fkey FOREIGN KEY (machinery_id) REFERENCES machinery_master(id);
alter table inventory_issues add constraint inventory_issues_livestock_id_fkey FOREIGN KEY (livestock_id) REFERENCES livestock_master(id) ON DELETE SET NULL;
alter table inventory_items add constraint inventory_items_pkey PRIMARY KEY (id);
alter table inventory_items add constraint inventory_items_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
alter table inventory_purchases add constraint inventory_purchases_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;
alter table inventory_purchases add constraint inventory_purchases_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES inventory_bills(id);
alter table inventory_purchases add constraint inventory_purchases_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
alter table inventory_purchases add constraint inventory_purchases_item_id_fkey FOREIGN KEY (item_id) REFERENCES inventory_items(id);
alter table inventory_purchases add constraint inventory_purchases_pkey PRIMARY KEY (id);
alter table labour_activity_rates add constraint labour_activity_rates_pkey PRIMARY KEY (id);
alter table labour_activity_rates add constraint labour_activity_rates_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
alter table labour_logs add constraint labour_logs_work_type_id_fkey FOREIGN KEY (work_type_id) REFERENCES activity_types(id) ON DELETE SET NULL;
alter table labour_logs add constraint labour_logs_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES crop_cycles(id);
alter table labour_logs add constraint labour_logs_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
alter table labour_logs add constraint labour_logs_activity_log_id_fkey FOREIGN KEY (activity_log_id) REFERENCES activity_logs(id);
alter table labour_logs add constraint labour_logs_plot_id_fkey FOREIGN KEY (plot_id) REFERENCES plots(id);
alter table labour_logs add constraint labour_logs_pkey PRIMARY KEY (id);
alter table labour_logs add constraint labour_logs_labour_master_id_fkey FOREIGN KEY (labour_master_id) REFERENCES labour_master(id);
alter table labour_master add constraint labour_master_pkey PRIMARY KEY (id);
alter table labour_master add constraint labour_master_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
alter table livestock_count_logs add constraint livestock_count_logs_livestock_id_fkey FOREIGN KEY (livestock_id) REFERENCES livestock_master(id);
alter table livestock_count_logs add constraint livestock_count_logs_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
alter table livestock_count_logs add constraint livestock_count_logs_pkey PRIMARY KEY (id);
alter table livestock_health_logs add constraint livestock_health_logs_livestock_id_fkey FOREIGN KEY (livestock_id) REFERENCES livestock_master(id);
alter table livestock_health_logs add constraint livestock_health_logs_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
alter table livestock_health_logs add constraint livestock_health_logs_pkey PRIMARY KEY (id);
alter table livestock_master add constraint livestock_master_tag_id_key UNIQUE (tag_id);
alter table livestock_master add constraint livestock_master_status_check CHECK ((status = ANY (ARRAY['active'::text, 'sold'::text, 'deceased'::text, 'culled'::text])));
alter table livestock_master add constraint livestock_master_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
alter table livestock_master add constraint livestock_master_pkey PRIMARY KEY (id);
alter table livestock_revenue add constraint livestock_revenue_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
alter table livestock_revenue add constraint livestock_revenue_pkey PRIMARY KEY (id);
alter table livestock_revenue add constraint livestock_revenue_livestock_id_fkey FOREIGN KEY (livestock_id) REFERENCES livestock_master(id) ON DELETE SET NULL;
alter table livestock_revenue add constraint livestock_revenue_payment_mode_check CHECK ((payment_mode = ANY (ARRAY['cash'::text, 'upi'::text, 'bank'::text, 'credit'::text])));
alter table livestock_revenue add constraint livestock_revenue_revenue_type_check CHECK ((revenue_type = ANY (ARRAY['milk'::text, 'egg'::text, 'meat'::text, 'sale'::text, 'dung'::text, 'wool'::text, 'other'::text])));
alter table machinery_master add constraint machinery_master_pkey PRIMARY KEY (id);
alter table machinery_master add constraint machinery_master_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
alter table media_files add constraint media_files_pkey PRIMARY KEY (id);
alter table media_files add constraint media_files_plot_id_fkey FOREIGN KEY (plot_id) REFERENCES plots(id);
alter table media_files add constraint media_files_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
alter table owner_cash_entries add constraint owner_cash_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table owner_cash_entries add constraint owner_cash_entries_amount_check CHECK ((amount > (0)::numeric));
alter table owner_cash_entries add constraint owner_cash_entries_direction_check CHECK ((direction = ANY (ARRAY['in'::text, 'out'::text])));
alter table owner_cash_entries add constraint owner_cash_entries_pkey PRIMARY KEY (id);
alter table partners add constraint partners_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
alter table partners add constraint partners_pkey PRIMARY KEY (id);
alter table plots add constraint plots_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
alter table plots add constraint plots_pkey PRIMARY KEY (id);
alter table public_holidays add constraint public_holidays_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
alter table public_holidays add constraint public_holidays_pkey PRIMARY KEY (id);
alter table public_holidays add constraint public_holidays_date_key UNIQUE (date);
alter table salary_advances add constraint salary_advances_pkey PRIMARY KEY (id);
alter table salary_advances add constraint salary_advances_amount_check CHECK ((amount > (0)::numeric));
alter table salary_advances add constraint salary_advances_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
alter table salary_advances add constraint salary_advances_labourer_id_fkey FOREIGN KEY (labourer_id) REFERENCES labour_master(id) ON DELETE CASCADE;
alter table salary_payments add constraint salary_payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table salary_payments add constraint salary_payments_labourer_id_fkey FOREIGN KEY (labourer_id) REFERENCES labour_master(id) ON DELETE CASCADE;
alter table salary_payments add constraint salary_payments_labourer_id_payment_month_key UNIQUE (labourer_id, payment_month);
alter table salary_payments add constraint salary_payments_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
alter table salary_payments add constraint salary_payments_pkey PRIMARY KEY (id);
alter table sales add constraint sales_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES buyers(id);
alter table sales add constraint sales_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES crop_cycles(id);
alter table sales add constraint sales_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
alter table sales add constraint sales_pkey PRIMARY KEY (id);
alter table sales add constraint sales_harvest_session_id_fkey FOREIGN KEY (harvest_session_id) REFERENCES harvest_sessions(id);
alter table user_profiles add constraint user_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table user_profiles add constraint user_profiles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'manager'::text, 'view_only'::text])));
alter table user_profiles add constraint user_profiles_pkey PRIMARY KEY (id);
alter table vendor_payments add constraint vendor_payments_payment_mode_check CHECK ((payment_mode = ANY (ARRAY['cash'::text, 'bank_transfer'::text, 'cheque'::text, 'upi'::text])));
alter table vendor_payments add constraint vendor_payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table vendor_payments add constraint vendor_payments_amount_check CHECK ((amount > (0)::numeric));
alter table vendor_payments add constraint vendor_payments_cash_entry_id_fkey FOREIGN KEY (cash_entry_id) REFERENCES owner_cash_entries(id) ON DELETE SET NULL;
alter table vendor_payments add constraint vendor_payments_pkey PRIMARY KEY (id);
alter table vendor_payments add constraint vendor_payments_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE RESTRICT;
alter table vendors add constraint vendors_pkey PRIMARY KEY (id);
alter table work_types add constraint work_types_pkey PRIMARY KEY (id);
alter table work_types add constraint work_types_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------

CREATE INDEX idx_attendance_date ON public.attendance USING btree (attendance_date);
CREATE INDEX crop_health_logs_farm_id_idx ON public.crop_health_logs USING btree (farm_id);
CREATE INDEX idx_crop_residuals_session ON public.crop_residuals USING btree (harvest_session_id);
CREATE INDEX idx_crop_residuals_status ON public.crop_residuals USING btree (status);
CREATE INDEX idx_crop_residuals_cycle ON public.crop_residuals USING btree (crop_cycle_id);
CREATE UNIQUE INDEX daily_diary_farm_id_diary_date_key ON public.daily_diary USING btree (farm_id, diary_date);
CREATE INDEX idx_expense_payments_type_ref ON public.expense_payments USING btree (expense_type, reference_id);
CREATE INDEX idx_issues_stage ON public.inventory_issues USING btree (stage);
CREATE INDEX idx_issues_date ON public.inventory_issues USING btree (issue_date);
CREATE INDEX idx_issues_plot ON public.inventory_issues USING btree (plot_id);
CREATE INDEX idx_inventory_purchases_bill_id ON public.inventory_purchases USING btree (bill_id);
CREATE INDEX idx_purchases_date ON public.inventory_purchases USING btree (purchase_date);
CREATE INDEX idx_owner_cash_entries_date ON public.owner_cash_entries USING btree (entry_date);
CREATE INDEX idx_public_holidays_date ON public.public_holidays USING btree (date);
CREATE INDEX idx_salary_advances_labour ON public.salary_advances USING btree (labourer_id);
CREATE INDEX idx_salary_payments_month ON public.salary_payments USING btree (payment_month);
CREATE INDEX idx_salary_payments_labourer ON public.salary_payments USING btree (labourer_id);
CREATE INDEX idx_salary_payments_labour ON public.salary_payments USING btree (labourer_id, payment_month);
CREATE INDEX idx_vendor_payments_vendor ON public.vendor_payments USING btree (vendor_id);
CREATE INDEX idx_vendor_payments_date ON public.vendor_payments USING btree (payment_date);
