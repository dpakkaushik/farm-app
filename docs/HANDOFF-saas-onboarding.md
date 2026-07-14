# Handoff — SaaS onboarding (signup → farm → plots → seeded masters)

Written 2026-07-14 at the end of a long session, so the work can continue in a fresh
one without re-deriving anything. Read this file first; it is self-contained.

**Goal:** a brand-new farm owner signs up on his own, is walked through creating his
farm and its plots, becomes that farm's admin, and lands in an app that is *usable* —
i.e. pre-populated with the masters every farm needs. He can then invite his manager,
and promote anyone to admin.

---

## 1. What is already DONE and pushed

Three commits on `master`:

| Commit | What |
|---|---|
| `83e831f` | Today card: Issued rows grouped by item (unrelated to onboarding) |
| `7bc7688` | Self-serve signup + 3-step onboarding wizard |
| `e9b0f47` | Login redesign — signup promoted to a primary tab |

### The onboarding chain as it now works

```
Login "Create Account" tab   (frontend/src/pages/Login.jsx)
  -> supabase.auth.signUp(email, password, { data: { full_name } })
  -> handle_new_user() trigger auto-creates the user_profiles row
     (supabase/migrations/0001_user_profile_autocreate.sql — reads
      raw_user_meta_data->>'full_name', falls back to the email prefix)
  -> App.jsx:92   !user || !profile            -> <Login/>
  -> App.jsx:97   !full_name || !phone         -> <Profile mustComplete/>   (pre-existing)
  -> App.jsx:100  farms.length===0 || onboarding -> <FarmOnboarding/>
  -> FarmOnboarding step 1: farm  -> createFarm()
       -> rpc create_farm_with_membership  (SECURITY DEFINER)
       -> inserts farms row (owner_id = auth.uid())
       -> inserts farm_memberships row with role='admin'   <-- creator IS admin
  -> FarmOnboarding step 2: plots -> addPlot() per plot
  -> FarmOnboarding step 3: what's-next -> /field?newFarm=1
```

### Files touched

- `frontend/src/pages/Login.jsx` — added `signup` mode. Primary segmented control is
  now **Sign In / Create Account**; Password-vs-EmailLink demoted to a quiet sub-toggle
  inside Sign In. Handles the empty-`identities` decoy Supabase returns for an
  already-registered email (it does NOT error, to prevent account enumeration).
- `frontend/src/pages/FarmOnboarding.jsx` — rewritten as a 3-step wizard.
- `frontend/src/store/auth.js` — added an **`onboarding`** boolean + `setOnboarding`.
  **Why it must exist:** creating the farm flips `farms.length` 0 -> 1, and App.jsx
  gates the wizard on `farms.length === 0`. Without the flag the wizard is torn off
  the screen the instant the farm saves, before the user ever reaches the plots step.
- `frontend/src/App.jsx` — gate is now `farms.length === 0 || onboarding`.

### Roles / admin transfer — ALREADY WORKS, do not rebuild

- `frontend/src/pages/FarmSettings.jsx` (route `/settings`, admin-only) has
  **Invite Someone** (email -> `farm_invitations` row + magic link) and a **Members**
  list with an **Admin / Manager / View Only** dropdown.
- You cannot change your own role or remove yourself (`amAdmin && !isMe`), so a farm
  can never end up with zero admins.
- **Authorization is 100% `farm_memberships.role`.** `farms.owner_id` is written at
  creation and then never read by any policy or check (grepped — it appears nowhere in
  authz). Consequence: `owner_id` stays the original creator forever even after admin
  is handed to someone else. Decide, when billing arrives, whether "who pays" follows
  `owner_id` or the admin role.

---

## 2. THE BUG — a new farm is born completely empty

`create_farm_with_membership` inserts exactly **two** rows: the farm, and the
membership. Nothing else. Verified against a real signup (`deepak@eeetaxi.com`,
farm `5c07fc7f-97e9-4827-a6c3-d200188601ee`):

| Master | New farm | Demo farm |
|---|---|---|
| activity_types | **0** | 11 |
| crops | **0** | 6 |
| crop_activity_templates | **0** | 42 |
| inventory_items | **0** | 26 |
| buyers | 0 | 4 |

The Admin page already has all nine master tabs
(`Crops, Cycles, Inventory, Manpower, Activity, Plots, Users, Buyers, Partners`
— `Admin.jsx:8`). They are not missing; they are **empty**, because nothing seeds them.

Also confirmed by query, so don't re-investigate:
- **The wizard's plots DO save.** The test farm had 1 plot named "A". The complaint
  "plots aren't there" is really "plots have no shape" — see task B.
- **The Users master is not broken.** RLS `profiles_select` is
  `id = auth.uid() OR shares_farm_with(id)`, so the admin can see himself. It looked
  empty only in the general context of everything else being empty.
- **Do NOT seed buyers or partners.** Those are the demo farm's real trade
  counterparties; cloning them into a stranger's account leaks business relationships.
  The masters exist — a new user fills them himself.

---

## 3. TASK A — seed migration (next thing to build)

Create `supabase/migrations/0016_seed_new_farm_defaults.sql` (0015 is the current
highest). Per `supabase/README.md`: numbered, idempotent, never hand-edit the
dashboard.

Shape:
1. `create or replace function seed_farm_defaults(p_farm_id uuid)` — `security definer`,
   `set search_path = public`. Inserts the data below.
2. `create or replace function create_farm_with_membership(...)` — **recreate it
   preserving its existing body** (see `0000b_baseline_policies.sql:75-95`) and add a
   `perform seed_farm_defaults(v_farm_id);` before the `RETURN`.

Both are SECURITY DEFINER so RLS is bypassed during seeding — no policy work needed.
No backfill required (the only unseeded farm is the test one, which gets deleted).

### Column reference (exact)

- `activity_types` — `id, farm_id, name, label, emoji, is_system, is_active, sort_order`
- `crops` — `id, farm_id, name, icon, color, notes, residuals(jsonb), season_type
  ('rabi'|'kharif'|'zaid'), duration_days, price_per_qtl, ratoon_crop_id,
  yield_per_acre, variety_category, harvest_window_days, created_at`
- `crop_activity_templates` — `id, farm_id, crop_id, day_offset, activity_type, label`
- `inventory_items` — `id, farm_id, name, unit, notes, category
  ('seed'|'fertilizer'|'chemical'|'fuel'|'other'), cost_per_unit, current_stock,
  min_threshold`

### Data to seed — activity_types (11, all is_system=true)

| name | label | emoji | sort |
|---|---|---|---|
| irrigation | Irrigation | 💧 | 1 |
| weeding | Weeding | 🌿 | 2 |
| fertilizer | Fertilizer | 🧪 | 3 |
| spray | Spray / Pesticide | 🧴 | 4 |
| ploughing | Ploughing | 🚜 | 5 |
| sowing | Sowing | 🌱 | 6 |
| harvesting | Harvesting | 🌾 | 7 |
| intercultural | Intercultural Ops | 🔧 | 8 |
| crop_ops | Other Crop Related Ops | 🌻 | 9 |
| events | Events | 📅 | 10 |
| other | Other | 📋 | 11 |

### Data to seed — crops (6)

| name | icon | color | season | duration_days | price_per_qtl | yield_per_acre | harvest_window_days |
|---|---|---|---|---|---|---|---|
| Wheat | 🌾 | #FF6B6B | rabi | 140 | 2200 | 15 | 20 |
| Mustard | 🌻 | #ba7517 | rabi | 110 | 6000 | 5 | 20 |
| Paddy | 🌾 | #2AB5B5 | kharif | 150 | 1900 | 25 | 15 |
| Sugarcane | 🎋 | #1D9E75 | rabi | 420 | 400 | 350 | 30 |
| Sugarcane Ratoon | 🌾 | #E84393 | rabi | 300 | 400 | 280 | 30 |
| Chaini Paddy | 🌿 | #dcb428 | kharif | 110 | 1800 | 35 | 15 |

`residuals` (jsonb array, one entry each):

- Wheat: `[{"name":"Wheat Straw (Bhoosa)","unit":"quintal","qty_per_acre":18,"expected_rate":150}]`
- Mustard: `[{"name":"Mustard Straw (Sarso Tori)","unit":"quintal","qty_per_acre":12,"expected_rate":80}]`
- Paddy: `[{"name":"Paddy Straw (Parali)","unit":"quintal","qty_per_acre":28,"expected_rate":100}]`
- Sugarcane: `[{"name":"Sugarcane Tops (Hara Chara)","unit":"quintal","qty_per_acre":21,"expected_rate":180}]`
- Sugarcane Ratoon: `[{"name":"Sugarcane Tops (Hara Chara)","unit":"quintal","qty_per_acre":17,"expected_rate":180}]`
- Chaini Paddy: `[{"name":"Paddy Straw (Parali)","unit":"quintal","qty_per_acre":38,"expected_rate":100}]`

**`ratoon_crop_id`:** insert *Sugarcane Ratoon* first, capture its id, then set
Sugarcane's `ratoon_crop_id` to it. Every other crop's is null.

### Data to seed — crop_activity_templates (42)

Sugarcane Ratoon and Chaini Paddy deliberately have **none** (matches the demo farm).

**Wheat (13)** — `day_offset, activity_type, label`
```
0   sowing      Sowing — issue seeds to field
7   irrigation  First irrigation after sowing
14  fertilizer  Basal dose — DAP
21  irrigation  Second irrigation
30  weeding     First weeding
35  irrigation  Crown root irrigation
45  fertilizer  Top dressing — Urea
55  irrigation  Jointing stage irrigation
65  spray       Pesticide spray (if needed)
75  irrigation  Heading stage irrigation
90  irrigation  Grain filling irrigation
110 irrigation  Pre-harvest irrigation
120 harvesting  Harvest
```

**Mustard (10)**
```
0   sowing      Sowing
10  irrigation  First irrigation
20  fertilizer  Basal dose — DAP + Urea
30  irrigation  Second irrigation
40  weeding     Weeding
50  fertilizer  Top dressing — Urea
60  irrigation  Third irrigation
70  irrigation  Fourth irrigation (flowering)
80  spray       Aphid spray if needed
110 harvesting  Harvest
```

**Paddy (8)**
```
0   sowing      Transplanting seedlings
10  fertilizer  Basal dose
20  weeding     First weeding
35  fertilizer  Urea first dose
50  spray       Pesticide spray
70  fertilizer  Urea second dose
100 irrigation  Flush irrigation (last)
130 harvesting  Harvest
```

**Sugarcane (11)**
```
0   sowing      Planting setts
30  irrigation  Irrigation
45  fertilizer  Nitrogen — Urea first dose
60  weeding     Weeding + earthing up
90  irrigation  Irrigation
120 fertilizer  Potash + Urea second dose
150 irrigation  Irrigation
210 irrigation  Irrigation
240 fertilizer  Third fertilizer dose
300 irrigation  Irrigation
365 harvesting  Harvest — crush season
```

### Data to seed — inventory_items (10 generic basics, current_stock ALWAYS 0)

| name | unit | category | cost_per_unit | min_threshold |
|---|---|---|---|---|
| Urea | bag (45 kg) | fertilizer | 325 | 10 |
| DAP | bag (50kg) | fertilizer | 1580 | 5 |
| Potash (MOP) | bag (50kg) | fertilizer | 1950 | 2 |
| Zinc Sulphate | kg | fertilizer | 65 | 5 |
| Diesel | litre | fuel | 96.15 | 50 |
| Engine Oil | litre | other | 180 | 2 |
| Wheat Seeds | kg | seed | 45 | 0 |
| Paddy Seeds | kg | seed | 55 | 0 |
| Mustard Seeds | kg | seed | 500 | 0 |
| Sugarcane Setts | kg | seed | 4 | 0 |

**Explicitly EXCLUDED from the seed** (they are in the demo farm but must not be
copied): the owner's brand-specific chemicals — *Procline ema, ROLLON ULTRA, Hitlist,
Ved kamal h.acid, Alyster, Chempa, Super Fit, Agrowet plus sticker, Bolt tebu,
VED TAKAT GOLD, Vesgro nytrogen, Amrit zink, Zlux-p zink, VED SPEED, GRASS SEEDS,
Round Off* — and all real stock figures (105 urea bags, 314 L diesel, etc.).
Owner's decision, confirmed: "keep the basic data, user can add more and change unit
price as per his requirement."

---

## 4. TASK B — coordinate capture (the other real gap)

Nothing in the app currently captures coordinates, so the map has nothing to draw.
Confirmed: the test farm's `map_state` is `null` and its one plot has no corner points.

- **Farm centre** — `farms.map_state` is jsonb `{ center: [lng, lat], zoom: 15 }`.
  `createFarm()` in `store/auth.js` already accepts `lat`/`lng` and builds this;
  `FarmOnboarding`'s form still carries `lat`/`lng` fields — **there is just no UI to
  set them.** (There was a dead `pickMode` state in the original file, since removed.)
- **Plot corners** — `plots` has `point_a_lat/lng`, `point_b_*`, `point_c_*`,
  `point_d_*`. A plot is the rectangle **A→B, B→C, C→D, D→A**. `addPlot()`
  (`store/index.js:1996`) already accepts all eight and treats them as optional
  (`parseFloat(x) || null`), so no store change is needed — only UI.
- **The map is free.** `Field.jsx` uses **MapLibre GL** with **ESRI World_Imagery**
  raster tiles (`server.arcgisonline.com/.../World_Imagery/MapServer/tile/{z}/{y}/{x}`)
  — *no Mapbox token required*, despite what CLAUDE.md's tech-stack table says. Copy
  that style block (`Field.jsx` ~line 345).

**What to build:** a satellite map in the wizard — drop a pin for the farm centre in
step 1, then tap four corners per plot in step 2. The same picker should ideally be
reused in Admin → Plots (`Admin.jsx`, `PlotsMaster`, which today asks for the eight
lat/lngs as raw number inputs — `EMPTY_PLOT` at `Admin.jsx:1317`).

**Suggested opening prompt for the new session:**
> Read docs/HANDOFF-saas-onboarding.md. Then do Task A (the seed migration), then Task B
> (satellite-map coordinate capture in FarmOnboarding — farm centre pin, plus A/B/C/D
> corner tap per plot, reusing Field.jsx's MapLibre + ESRI setup).

---

## 5. TASK C — delete the test account

`deepak@eeetaxi.com` was created before email confirmation was switched on. The owner
wants it gone so he can re-signup cleanly and verify the confirmation email.

Order matters — `farms.owner_id` FKs to `auth.users` with **no** cascade:

```sql
delete from farms where id = '5c07fc7f-97e9-4827-a6c3-d200188601ee';  -- cascades ~37 FKs
delete from user_profiles where email = 'deepak@eeetaxi.com';
delete from auth.users   where email = 'deepak@eeetaxi.com';
```

---

## 6. Environment / dashboard state

- Supabase Auth → **Allow new users to sign up: ON**, **Confirm email: ON** (owner set
  these after the first test signup went through unverified). He should double-check
  the *Save changes* button was actually clicked.
- Auth → URL Configuration → Redirect URLs must contain
  `https://frontend-zeta-ten-64.vercel.app` (that's what `emailRedirectTo` uses).
- **The APK is Capacitor pointed at the live Vercel URL** (`frontend/capacitor.config.json`,
  `server.url`). So every email link — confirmation, invite, password reset — opens in
  **Chrome, not inside the app**. The user must return to the app and sign in with the
  password they chose. Not yet tested on a device.
- ⚠️ **Supabase's built-in email sender is rate-limited to ~2–3 messages/hour.** It will
  fall over on real signups and even during a demo with two signups. **Configure custom
  SMTP (Resend / SendGrid) before this is used for real.** Not done.

## 7. Untested

The signup → confirm-email → profile → farm → plots chain has been **built and
type/build-checked, but never executed end to end** by me. The one real-world run
(`deepak@eeetaxi.com`) happened while email confirmation was still off and before any
seeding existed. After Task A + C, drive the whole flow in a browser and verify.

## 8. Gotcha for whoever writes the next commit

Do not put backticks in a `git commit -m "..."` string in the Bash tool — bash performs
command substitution and silently eats the word. Use `git commit -F -` with a heredoc.
(Commit `7bc7688`'s body lost a word this way.)
