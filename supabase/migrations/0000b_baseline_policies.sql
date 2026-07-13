-- Baseline part 2: functions, RLS, policies, triggers. Captured from the live
-- database on 2026-07-13. Companion to 0000_baseline_schema.sql.
--
-- This records what IS live, not what SHOULD be. Four policies below are marked
-- INSECURE: they were found during this capture and are genuine holes. They are
-- reproduced here faithfully so this file matches reality — see 0004 for the fix.
-- Do NOT treat this file as a model to copy from.

-- ---------------------------------------------------------------------------
-- FUNCTIONS
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_farm_member(fid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM farm_memberships
    WHERE farm_id = fid AND user_id = auth.uid() AND status = 'active'
  )
$function$;

CREATE OR REPLACE FUNCTION public.has_farm_role(fid uuid, required_role text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM farm_memberships
    WHERE farm_id = fid AND user_id = auth.uid() AND status = 'active'
      AND (
        (required_role = 'admin'     AND role = 'admin') OR
        (required_role = 'manager'   AND role IN ('admin', 'manager')) OR
        (required_role = 'view_only' AND role IN ('admin', 'manager', 'view_only'))
      )
  )
$function$;

CREATE OR REPLACE FUNCTION public.shares_farm_with(target_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from farm_memberships me
    join farm_memberships them on them.farm_id = me.farm_id
    where me.user_id   = auth.uid()   and me.status   = 'active'
      and them.user_id = target_user  and them.status = 'active'
  )
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.user_profiles (id, email, full_name, role, is_active)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), ''),
    'manager',   -- vestigial; real permissions live in farm_memberships.role
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_farm_with_membership(p_name text, p_location text DEFAULT 'India'::text, p_total_acres double precision DEFAULT 0, p_map_state jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_farm_id uuid;
  v_result  jsonb;
BEGIN
  INSERT INTO farms (name, location, total_acres, map_state, owner_id)
  VALUES (p_name, p_location, p_total_acres, p_map_state, auth.uid())
  RETURNING id INTO v_farm_id;

  INSERT INTO farm_memberships (farm_id, user_id, role, status)
  VALUES (v_farm_id, auth.uid(), 'admin', 'active');

  SELECT to_jsonb(f) INTO v_result FROM farms f WHERE f.id = v_farm_id;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_invite_preview(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'farm_name', f.name,
    'role',      i.role,
    'email',     i.email,
    'valid',     (i.accepted_at IS NULL AND i.expires_at > now())
  )
  INTO v_result
  FROM farm_invitations i
  JOIN farms f ON f.id = i.farm_id
  WHERE i.token = p_token;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_set_cycle_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_cycle_id uuid;
BEGIN
  IF NEW.cycle_id IS NULL AND NEW.plot_id IS NOT NULL THEN
    SELECT id INTO v_cycle_id
    FROM crop_cycles
    WHERE plot_id = NEW.plot_id AND status = 'active'
    ORDER BY sow_date DESC
    LIMIT 1;
    NEW.cycle_id := v_cycle_id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_inventory_stock()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_item_id uuid;
BEGIN
  v_item_id := COALESCE(NEW.item_id, OLD.item_id);
  UPDATE inventory_items
  SET current_stock = (
    COALESCE((SELECT SUM(quantity) FROM inventory_purchases WHERE item_id = v_item_id), 0)
    - COALESCE((SELECT SUM(quantity) FROM inventory_issues   WHERE item_id = v_item_id), 0)
  )
  WHERE id = v_item_id;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_livestock_count()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_livestock_id uuid;
BEGIN
  v_livestock_id := COALESCE(NEW.livestock_id, OLD.livestock_id);
  UPDATE livestock_master
  SET current_count = COALESCE((
    SELECT SUM(
      CASE WHEN change_type IN ('add', 'opening_balance', 'birth', 'transfer_in')
           THEN quantity ELSE -quantity END
    )
    FROM livestock_count_logs
    WHERE livestock_id = v_livestock_id
  ), 0)
  WHERE id = v_livestock_id;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- ---------------------------------------------------------------------------
-- ENABLE ROW LEVEL SECURITY  (all 43 tables)
-- ---------------------------------------------------------------------------

alter table public.activity_logs            enable row level security;
alter table public.activity_types           enable row level security;
alter table public.alerts                   enable row level security;
alter table public.attendance               enable row level security;
alter table public.buyers                   enable row level security;
alter table public.crop_activity_templates  enable row level security;
alter table public.crop_cycles              enable row level security;
alter table public.crop_health_logs         enable row level security;
alter table public.crop_residuals           enable row level security;
alter table public.crops                    enable row level security;
alter table public.daily_diary              enable row level security;
alter table public.diesel_logs              enable row level security;
alter table public.expense_payments         enable row level security;
alter table public.farm_assets              enable row level security;
alter table public.farm_expenses            enable row level security;
alter table public.farm_invitations         enable row level security;
alter table public.farm_memberships         enable row level security;
alter table public.farms                    enable row level security;
alter table public.harvest_sessions         enable row level security;
alter table public.inventory_bills          enable row level security;
alter table public.inventory_issues         enable row level security;
alter table public.inventory_items          enable row level security;
alter table public.inventory_purchases      enable row level security;
alter table public.labour_activity_rates    enable row level security;
alter table public.labour_logs              enable row level security;
alter table public.labour_master            enable row level security;
alter table public.livestock_count_logs     enable row level security;
alter table public.livestock_health_logs    enable row level security;
alter table public.livestock_master         enable row level security;
alter table public.livestock_revenue        enable row level security;
alter table public.machinery_master         enable row level security;
alter table public.media_files              enable row level security;
alter table public.owner_cash_entries       enable row level security;
alter table public.partners                 enable row level security;
alter table public.plots                    enable row level security;
alter table public.public_holidays          enable row level security;
alter table public.salary_advances          enable row level security;
alter table public.salary_payments          enable row level security;
alter table public.sales                    enable row level security;
alter table public.user_profiles            enable row level security;
alter table public.vendor_payments          enable row level security;
alter table public.vendors                  enable row level security;
alter table public.work_types               enable row level security;

-- ---------------------------------------------------------------------------
-- POLICIES — the standard farm-scoped set
--
-- select = any member; insert/update = manager+; delete = admin.
-- ---------------------------------------------------------------------------

-- activity_logs
create policy activity_logs_select on public.activity_logs for select using (is_farm_member(farm_id));
create policy activity_logs_insert on public.activity_logs for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy activity_logs_update on public.activity_logs for update using (has_farm_role(farm_id, 'manager'::text));
create policy activity_logs_delete on public.activity_logs for delete using (has_farm_role(farm_id, 'admin'::text));

-- activity_types
create policy activity_types_select on public.activity_types for select using (is_farm_member(farm_id));
create policy activity_types_insert on public.activity_types for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy activity_types_update on public.activity_types for update using (has_farm_role(farm_id, 'manager'::text));
create policy activity_types_delete on public.activity_types for delete using (has_farm_role(farm_id, 'admin'::text));

-- alerts
create policy alerts_select on public.alerts for select using (is_farm_member(farm_id));
create policy alerts_insert on public.alerts for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy alerts_update on public.alerts for update using (has_farm_role(farm_id, 'manager'::text));
create policy alerts_delete on public.alerts for delete using (has_farm_role(farm_id, 'admin'::text));

-- attendance
create policy attendance_select on public.attendance for select using (is_farm_member(farm_id));
create policy attendance_insert on public.attendance for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy attendance_update on public.attendance for update using (has_farm_role(farm_id, 'manager'::text));
create policy attendance_delete on public.attendance for delete using (has_farm_role(farm_id, 'admin'::text));

-- buyers
create policy buyers_select on public.buyers for select using (is_farm_member(farm_id));
create policy buyers_insert on public.buyers for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy buyers_update on public.buyers for update using (has_farm_role(farm_id, 'manager'::text));
create policy buyers_delete on public.buyers for delete using (has_farm_role(farm_id, 'admin'::text));

-- crop_activity_templates
create policy crop_activity_templates_select on public.crop_activity_templates for select using (is_farm_member(farm_id));
create policy crop_activity_templates_insert on public.crop_activity_templates for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy crop_activity_templates_update on public.crop_activity_templates for update using (has_farm_role(farm_id, 'manager'::text));
create policy crop_activity_templates_delete on public.crop_activity_templates for delete using (has_farm_role(farm_id, 'admin'::text));

-- crop_cycles
create policy crop_cycles_select on public.crop_cycles for select using (is_farm_member(farm_id));
create policy crop_cycles_insert on public.crop_cycles for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy crop_cycles_update on public.crop_cycles for update using (has_farm_role(farm_id, 'manager'::text));
create policy crop_cycles_delete on public.crop_cycles for delete using (has_farm_role(farm_id, 'admin'::text));

-- crop_health_logs  (added in 0003)
create policy crop_health_logs_select on public.crop_health_logs for select using (is_farm_member(farm_id));
create policy crop_health_logs_insert on public.crop_health_logs for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy crop_health_logs_update on public.crop_health_logs for update using (has_farm_role(farm_id, 'manager'::text));
create policy crop_health_logs_delete on public.crop_health_logs for delete using (has_farm_role(farm_id, 'admin'::text));

-- crop_residuals
create policy crop_residuals_select on public.crop_residuals for select using (is_farm_member(farm_id));
create policy crop_residuals_insert on public.crop_residuals for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy crop_residuals_update on public.crop_residuals for update using (has_farm_role(farm_id, 'manager'::text));
create policy crop_residuals_delete on public.crop_residuals for delete using (has_farm_role(farm_id, 'admin'::text));
-- !! INSECURE — permissive policies are OR'd, so this `true` defeats all four above.
-- !! crop_residuals is readable AND writable by any caller. Fixed in 0004.
create policy farm_members_all on public.crop_residuals for all using (true) with check (true);

-- crops
create policy crops_select on public.crops for select using (is_farm_member(farm_id));
create policy crops_insert on public.crops for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy crops_update on public.crops for update using (has_farm_role(farm_id, 'manager'::text));
create policy crops_delete on public.crops for delete using (has_farm_role(farm_id, 'admin'::text));

-- daily_diary  (added in 0003)
create policy daily_diary_select on public.daily_diary for select using (is_farm_member(farm_id));
create policy daily_diary_insert on public.daily_diary for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy daily_diary_update on public.daily_diary for update using (has_farm_role(farm_id, 'manager'::text));
create policy daily_diary_delete on public.daily_diary for delete using (has_farm_role(farm_id, 'admin'::text));

-- diesel_logs
create policy diesel_logs_select on public.diesel_logs for select using (is_farm_member(farm_id));
create policy diesel_logs_insert on public.diesel_logs for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy diesel_logs_update on public.diesel_logs for update using (has_farm_role(farm_id, 'manager'::text));
create policy diesel_logs_delete on public.diesel_logs for delete using (has_farm_role(farm_id, 'admin'::text));

-- expense_payments
create policy expense_payments_select on public.expense_payments for select using (is_farm_member(farm_id));
create policy expense_payments_insert on public.expense_payments for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy expense_payments_update on public.expense_payments for update using (has_farm_role(farm_id, 'manager'::text));
create policy expense_payments_delete on public.expense_payments for delete using (has_farm_role(farm_id, 'admin'::text));

-- farm_assets
create policy farm_assets_select on public.farm_assets for select using (is_farm_member(farm_id));
create policy farm_assets_insert on public.farm_assets for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy farm_assets_update on public.farm_assets for update using (has_farm_role(farm_id, 'manager'::text));
create policy farm_assets_delete on public.farm_assets for delete using (has_farm_role(farm_id, 'admin'::text));

-- farm_expenses
create policy farm_expenses_select on public.farm_expenses for select using (is_farm_member(farm_id));
create policy farm_expenses_insert on public.farm_expenses for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy farm_expenses_update on public.farm_expenses for update using (has_farm_role(farm_id, 'manager'::text));
create policy farm_expenses_delete on public.farm_expenses for delete using (has_farm_role(farm_id, 'admin'::text));

-- farm_invitations
-- !! INSECURE — `auth.uid() IS NOT NULL` means ANY logged-in user can read EVERY
-- !! invitation row in the database, including the token. A user of farm A can
-- !! lift a token for farm B and join it. Fixed in 0004.
create policy invitations_select on public.farm_invitations for select using ((has_farm_role(farm_id, 'admin'::text) OR (auth.uid() IS NOT NULL)));
create policy invitations_insert on public.farm_invitations for insert with check (has_farm_role(farm_id, 'admin'::text));
-- !! INSECURE — no USING clause, so it defaults to true: any logged-in user can
-- !! update any invitation row. Fixed in 0004.
create policy invitations_update on public.farm_invitations for update with check ((auth.uid() IS NOT NULL));
create policy invitations_delete on public.farm_invitations for delete using (has_farm_role(farm_id, 'admin'::text));

-- farm_memberships
create policy memberships_select on public.farm_memberships for select using (((user_id = auth.uid()) OR has_farm_role(farm_id, 'admin'::text)));
-- !! INSECURE — PRIVILEGE ESCALATION. Any logged-in user can insert a membership
-- !! row naming any farm_id and role 'admin'. has_farm_role() then returns true
-- !! for them and they own that farm. Fixed in 0004.
create policy memberships_insert on public.farm_memberships for insert with check ((auth.uid() IS NOT NULL));
create policy memberships_update on public.farm_memberships for update using (has_farm_role(farm_id, 'admin'::text));
create policy memberships_delete on public.farm_memberships for delete using ((has_farm_role(farm_id, 'admin'::text) OR (user_id = auth.uid())));

-- farms
create policy farms_select on public.farms for select using (is_farm_member(id));
create policy farms_insert on public.farms for insert with check ((auth.uid() IS NOT NULL));
create policy farms_update on public.farms for update using (has_farm_role(id, 'admin'::text));
create policy farms_delete on public.farms for delete using (has_farm_role(id, 'admin'::text));

-- harvest_sessions
create policy harvest_sessions_select on public.harvest_sessions for select using (is_farm_member(farm_id));
create policy harvest_sessions_insert on public.harvest_sessions for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy harvest_sessions_update on public.harvest_sessions for update using (has_farm_role(farm_id, 'manager'::text));
create policy harvest_sessions_delete on public.harvest_sessions for delete using (has_farm_role(farm_id, 'admin'::text));

-- inventory_bills
create policy inventory_bills_select on public.inventory_bills for select using (is_farm_member(farm_id));
create policy inventory_bills_insert on public.inventory_bills for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy inventory_bills_update on public.inventory_bills for update using (has_farm_role(farm_id, 'manager'::text));
create policy inventory_bills_delete on public.inventory_bills for delete using (has_farm_role(farm_id, 'admin'::text));

-- inventory_issues
create policy inventory_issues_select on public.inventory_issues for select using (is_farm_member(farm_id));
create policy inventory_issues_insert on public.inventory_issues for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy inventory_issues_update on public.inventory_issues for update using (has_farm_role(farm_id, 'manager'::text));
create policy inventory_issues_delete on public.inventory_issues for delete using (has_farm_role(farm_id, 'admin'::text));

-- inventory_items
create policy inventory_items_select on public.inventory_items for select using (is_farm_member(farm_id));
create policy inventory_items_insert on public.inventory_items for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy inventory_items_update on public.inventory_items for update using (has_farm_role(farm_id, 'manager'::text));
create policy inventory_items_delete on public.inventory_items for delete using (has_farm_role(farm_id, 'admin'::text));

-- inventory_purchases
create policy inventory_purchases_select on public.inventory_purchases for select using (is_farm_member(farm_id));
create policy inventory_purchases_insert on public.inventory_purchases for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy inventory_purchases_update on public.inventory_purchases for update using (has_farm_role(farm_id, 'manager'::text));
create policy inventory_purchases_delete on public.inventory_purchases for delete using (has_farm_role(farm_id, 'admin'::text));

-- labour_activity_rates
create policy labour_activity_rates_select on public.labour_activity_rates for select using (is_farm_member(farm_id));
create policy labour_activity_rates_insert on public.labour_activity_rates for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy labour_activity_rates_update on public.labour_activity_rates for update using (has_farm_role(farm_id, 'manager'::text));
create policy labour_activity_rates_delete on public.labour_activity_rates for delete using (has_farm_role(farm_id, 'admin'::text));

-- labour_logs
create policy labour_logs_select on public.labour_logs for select using (is_farm_member(farm_id));
create policy labour_logs_insert on public.labour_logs for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy labour_logs_update on public.labour_logs for update using (has_farm_role(farm_id, 'manager'::text));
create policy labour_logs_delete on public.labour_logs for delete using (has_farm_role(farm_id, 'admin'::text));

-- labour_master
create policy labour_master_select on public.labour_master for select using (is_farm_member(farm_id));
create policy labour_master_insert on public.labour_master for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy labour_master_update on public.labour_master for update using (has_farm_role(farm_id, 'manager'::text));
create policy labour_master_delete on public.labour_master for delete using (has_farm_role(farm_id, 'admin'::text));

-- livestock_count_logs
create policy livestock_count_logs_select on public.livestock_count_logs for select using (is_farm_member(farm_id));
create policy livestock_count_logs_insert on public.livestock_count_logs for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy livestock_count_logs_update on public.livestock_count_logs for update using (has_farm_role(farm_id, 'manager'::text));
create policy livestock_count_logs_delete on public.livestock_count_logs for delete using (has_farm_role(farm_id, 'admin'::text));

-- livestock_health_logs
create policy livestock_health_logs_select on public.livestock_health_logs for select using (is_farm_member(farm_id));
create policy livestock_health_logs_insert on public.livestock_health_logs for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy livestock_health_logs_update on public.livestock_health_logs for update using (has_farm_role(farm_id, 'manager'::text));
create policy livestock_health_logs_delete on public.livestock_health_logs for delete using (has_farm_role(farm_id, 'admin'::text));

-- livestock_master
create policy livestock_master_select on public.livestock_master for select using (is_farm_member(farm_id));
create policy livestock_master_insert on public.livestock_master for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy livestock_master_update on public.livestock_master for update using (has_farm_role(farm_id, 'manager'::text));
create policy livestock_master_delete on public.livestock_master for delete using (has_farm_role(farm_id, 'admin'::text));

-- livestock_revenue
create policy livestock_revenue_select on public.livestock_revenue for select using (is_farm_member(farm_id));
create policy livestock_revenue_insert on public.livestock_revenue for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy livestock_revenue_update on public.livestock_revenue for update using (has_farm_role(farm_id, 'manager'::text));
create policy livestock_revenue_delete on public.livestock_revenue for delete using (has_farm_role(farm_id, 'admin'::text));

-- machinery_master
create policy machinery_master_select on public.machinery_master for select using (is_farm_member(farm_id));
create policy machinery_master_insert on public.machinery_master for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy machinery_master_update on public.machinery_master for update using (has_farm_role(farm_id, 'manager'::text));
create policy machinery_master_delete on public.machinery_master for delete using (has_farm_role(farm_id, 'admin'::text));

-- media_files
create policy media_files_select on public.media_files for select using (is_farm_member(farm_id));
create policy media_files_insert on public.media_files for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy media_files_update on public.media_files for update using (has_farm_role(farm_id, 'manager'::text));
create policy media_files_delete on public.media_files for delete using (has_farm_role(farm_id, 'admin'::text));

-- owner_cash_entries
create policy owner_cash_entries_select on public.owner_cash_entries for select using (is_farm_member(farm_id));
create policy owner_cash_entries_insert on public.owner_cash_entries for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy owner_cash_entries_update on public.owner_cash_entries for update using (has_farm_role(farm_id, 'manager'::text));
create policy owner_cash_entries_delete on public.owner_cash_entries for delete using (has_farm_role(farm_id, 'admin'::text));

-- partners
create policy partners_select on public.partners for select using (is_farm_member(farm_id));
create policy partners_insert on public.partners for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy partners_update on public.partners for update using (has_farm_role(farm_id, 'manager'::text));
create policy partners_delete on public.partners for delete using (has_farm_role(farm_id, 'admin'::text));

-- plots
create policy plots_select on public.plots for select using (is_farm_member(farm_id));
create policy plots_insert on public.plots for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy plots_update on public.plots for update using (has_farm_role(farm_id, 'manager'::text));
create policy plots_delete on public.plots for delete using (has_farm_role(farm_id, 'admin'::text));

-- public_holidays
create policy public_holidays_select on public.public_holidays for select using (is_farm_member(farm_id));
create policy public_holidays_insert on public.public_holidays for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy public_holidays_update on public.public_holidays for update using (has_farm_role(farm_id, 'manager'::text));
create policy public_holidays_delete on public.public_holidays for delete using (has_farm_role(farm_id, 'admin'::text));

-- salary_advances
create policy salary_advances_select on public.salary_advances for select using (is_farm_member(farm_id));
create policy salary_advances_insert on public.salary_advances for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy salary_advances_update on public.salary_advances for update using (has_farm_role(farm_id, 'manager'::text));
create policy salary_advances_delete on public.salary_advances for delete using (has_farm_role(farm_id, 'admin'::text));

-- salary_payments
create policy salary_payments_select on public.salary_payments for select using (is_farm_member(farm_id));
create policy salary_payments_insert on public.salary_payments for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy salary_payments_update on public.salary_payments for update using (has_farm_role(farm_id, 'manager'::text));
create policy salary_payments_delete on public.salary_payments for delete using (has_farm_role(farm_id, 'admin'::text));

-- sales
create policy sales_select on public.sales for select using (is_farm_member(farm_id));
create policy sales_insert on public.sales for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy sales_update on public.sales for update using (has_farm_role(farm_id, 'manager'::text));
create policy sales_delete on public.sales for delete using (has_farm_role(farm_id, 'admin'::text));

-- user_profiles
create policy profiles_select on public.user_profiles for select using (((id = auth.uid()) OR shares_farm_with(id)));
create policy profiles_update on public.user_profiles for update using ((id = auth.uid())) with check ((id = auth.uid()));
-- !! INSECURE — these three `true` policies defeat profiles_select above. Every
-- !! user_profiles row (name, email, mobile, photo) is readable by anyone, across
-- !! every farm, and anyone can insert a profile row. Fixed in 0004.
create policy profiles_select_own on public.user_profiles for select using (true);
create policy "authenticated can read profiles" on public.user_profiles for select using (true);
create policy "authenticated can insert profiles" on public.user_profiles for insert with check (true);
create policy "admin can update profiles" on public.user_profiles for update using (((( SELECT user_profiles_1.role
   FROM user_profiles user_profiles_1
  WHERE (user_profiles_1.id = auth.uid())) = 'admin'::text) OR (id = auth.uid())));

-- vendor_payments
create policy vendor_payments_select on public.vendor_payments for select using (is_farm_member(farm_id));
create policy vendor_payments_insert on public.vendor_payments for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy vendor_payments_update on public.vendor_payments for update using (has_farm_role(farm_id, 'manager'::text));
create policy vendor_payments_delete on public.vendor_payments for delete using (has_farm_role(farm_id, 'admin'::text));

-- vendors
create policy vendors_select on public.vendors for select using (is_farm_member(farm_id));
create policy vendors_insert on public.vendors for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy vendors_update on public.vendors for update using (has_farm_role(farm_id, 'manager'::text));
create policy vendors_delete on public.vendors for delete using (has_farm_role(farm_id, 'admin'::text));

-- work_types
create policy work_types_select on public.work_types for select using (is_farm_member(farm_id));
create policy work_types_insert on public.work_types for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy work_types_update on public.work_types for update using (has_farm_role(farm_id, 'manager'::text));
create policy work_types_delete on public.work_types for delete using (has_farm_role(farm_id, 'admin'::text));

-- ---------------------------------------------------------------------------
-- TRIGGERS
-- ---------------------------------------------------------------------------

CREATE TRIGGER trg_issue_auto_cycle_id BEFORE INSERT OR UPDATE ON public.inventory_issues FOR EACH ROW EXECUTE FUNCTION auto_set_cycle_id();
CREATE TRIGGER trg_sync_stock_on_issue AFTER INSERT OR DELETE OR UPDATE ON public.inventory_issues FOR EACH ROW EXECUTE FUNCTION sync_inventory_stock();
CREATE TRIGGER trg_sync_stock_on_purchase AFTER INSERT OR DELETE OR UPDATE ON public.inventory_purchases FOR EACH ROW EXECUTE FUNCTION sync_inventory_stock();
CREATE TRIGGER trg_labour_auto_cycle_id BEFORE INSERT OR UPDATE ON public.labour_logs FOR EACH ROW EXECUTE FUNCTION auto_set_cycle_id();
CREATE TRIGGER trg_sync_livestock_count AFTER INSERT OR DELETE OR UPDATE ON public.livestock_count_logs FOR EACH ROW EXECUTE FUNCTION sync_livestock_count();

-- NOTE: the auth.users -> handle_new_user() trigger lives in the auth schema and
-- is defined in 0001_user_profile_autocreate.sql.
