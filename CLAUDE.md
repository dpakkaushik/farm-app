# Farm Management App — Project Bible

> This file is the single source of truth for the Farm Management App. Every architectural decision, UI design, database schema, and feature is documented here. When building any part of this app, refer to this file first.

---

## 0. Development Rules

- **After every code change, always commit and push to GitHub** (`git add` → `git commit` → `git push origin master`). Vercel deploys automatically on every push. Never leave changes uncommitted.
- **Git identity** — always use `git config user.name "dpakkaushik"` and `git config user.email "palliaclaudeai@gmail.com"` before committing if not already set.

---

## 1. Project Vision

A farm management system for **medium-sized farm owners (50–100 acres)** who do not live on the farm but want real-time visibility into all farm operations remotely.

**The core problem:** Farm operations are managed through phone calls and paper registers. Owners lack visibility into activities, inventory usage, crop performance, and profitability.

**Long-term vision:** Evolve into a commercial SaaS product supporting multiple farms per owner.

---

## 2. Tech Stack

### Backend (Python-heavy — use Python wherever possible)

| Layer | Technology |
|---|---|
| API Framework | **FastAPI** (Python) |
| Language | **Python 3.11+** |
| ORM | **SQLAlchemy 2.0** (async) |
| Data Validation | **Pydantic v2** (comes with FastAPI) |
| Database Driver | **asyncpg** |
| Auth | **Supabase Auth** + **python-jose** for JWT |
| File Storage | **Supabase Storage** via `supabase-py` |
| Background Tasks | **Celery** + Redis (for alerts, notifications) |
| Geospatial | **Shapely** + **GeoJSON** for plot boundaries |
| PDF Generation | **WeasyPrint** or **ReportLab** |
| WhatsApp Alerts | **Twilio** Python SDK |
| Testing | **pytest** + **pytest-asyncio** |
| SDK | **anthropic** Python SDK (for AI features later) |

### Frontend (minimal JS — only for UI)

| Layer | Technology |
|---|---|
| Framework | **React 18** + **Vite** |
| Styling | **Tailwind CSS** |
| Components | **shadcn/ui** |
| Map | **Mapbox GL JS** (satellite tiles + plot polygons) |
| State | **Zustand** |
| API Client | **Axios** |
| Charts | **Recharts** |

### Infrastructure

| Layer | Technology |
|---|---|
| Database | **Supabase** (PostgreSQL 15) |
| File Storage | **Supabase Storage** |
| Backend Hosting | **Railway** |
| Frontend Hosting | **Vercel** |
| Cache / Queue | **Upstash Redis** |

---

## 3. Project Structure

```
farm-app/
│
├── backend/                        # Python FastAPI backend
│   ├── main.py                     # FastAPI app entry point
│   ├── config.py                   # Settings via pydantic-settings
│   ├── database.py                 # Async SQLAlchemy engine + session
│   ├── dependencies.py             # FastAPI dependency injection
│   │
│   ├── models/                     # SQLAlchemy ORM models
│   │   ├── __init__.py
│   │   ├── farm.py
│   │   ├── plot.py
│   │   ├── crop.py
│   │   ├── activity.py
│   │   ├── inventory.py
│   │   ├── harvest.py
│   │   ├── sale.py
│   │   ├── diary.py
│   │   ├── alert.py
│   │   └── media.py
│   │
│   ├── schemas/                    # Pydantic request/response schemas
│   │   ├── __init__.py
│   │   ├── farm.py
│   │   ├── plot.py
│   │   ├── crop.py
│   │   ├── activity.py
│   │   ├── inventory.py
│   │   ├── harvest.py
│   │   ├── sale.py
│   │   ├── diary.py
│   │   └── alert.py
│   │
│   ├── routers/                    # FastAPI routers (one per domain)
│   │   ├── __init__.py
│   │   ├── auth.py
│   │   ├── farms.py
│   │   ├── plots.py
│   │   ├── crops.py
│   │   ├── activities.py
│   │   ├── inventory.py
│   │   ├── harvest.py
│   │   ├── sales.py
│   │   ├── diary.py
│   │   ├── alerts.py
│   │   ├── dashboard.py
│   │   └── media.py
│   │
│   ├── services/                   # Business logic layer (Python)
│   │   ├── __init__.py
│   │   ├── crop_service.py         # Auto-generate activities from templates
│   │   ├── inventory_service.py    # Stock management, cost attribution
│   │   ├── alert_service.py        # Alert generation logic
│   │   ├── cost_service.py         # P&L calculation
│   │   ├── notification_service.py # WhatsApp via Twilio
│   │   ├── storage_service.py      # Supabase Storage file handling
│   │   └── report_service.py       # PDF report generation
│   │
│   ├── tasks/                      # Celery background tasks
│   │   ├── __init__.py
│   │   ├── alert_tasks.py          # Scheduled alert checks
│   │   └── notification_tasks.py   # WhatsApp message sending
│   │
│   ├── migrations/                 # Alembic DB migrations
│   │   └── versions/
│   │
│   ├── tests/
│   │   ├── conftest.py
│   │   ├── test_crops.py
│   │   ├── test_inventory.py
│   │   └── test_cost.py
│   │
│   ├── alembic.ini
│   ├── requirements.txt
│   └── Dockerfile
│
└── frontend/                       # React frontend
    ├── src/
    │   ├── pages/
    │   │   ├── Field.jsx           # Map view
    │   │   ├── Dashboard.jsx       # Owner morning screen
    │   │   ├── PlotDetail.jsx
    │   │   ├── Inventory.jsx
    │   │   ├── Diary.jsx           # Manager daily log
    │   │   └── Reports.jsx
    │   ├── components/
    │   ├── hooks/
    │   ├── api/                    # Axios API calls to FastAPI
    │   └── store/                  # Zustand state
    ├── package.json
    └── vite.config.js
```

---

## 4. User Roles

| Feature | Farm Manager | Farm Owner |
|---|---|---|
| Submit daily diary | ✅ | ❌ |
| Log activities | ✅ | ❌ |
| Issue inventory | ✅ | ❌ |
| Record harvest | ✅ | ❌ |
| Record sales | ✅ | ❌ |
| Log crop health | ✅ | ❌ |
| View dashboard | ✅ | ✅ |
| View field map | ✅ | ✅ |
| View P&L reports | ✅ | ✅ |
| Receive alerts | ✅ | ✅ |
| Manage crop templates | ✅ | ❌ |
| Farm settings | ❌ | ✅ |

Roles are enforced at the FastAPI dependency layer using JWT claims from Supabase Auth.

---

## 5. App UI — Screen Design

### Navigation
Two main screens accessible via **tabs at the top**:
- `Field` tab — map-first view of the farm
- `Dashboard` tab — owner's morning briefing

### 5.1 Field View (default screen)

**What it shows:**
- Full satellite map (Mapbox) of the farm
- Translucent colored polygon overlays for each plot
- Plot label on each polygon: plot name, crop, status pill
- Color coding by crop health status:
  - 🟢 Green (`rgba(29,158,117,0.55)`) — Healthy
  - 🟡 Amber (`rgba(186,117,23,0.55)`) — Harvest soon
  - 🔴 Red (`rgba(226,75,74,0.5)`) — Concern / issue
  - ⬜ Gray (`rgba(136,135,128,0.35)`) — Fallow / inactive
- Map legend bottom-left (always visible)
- Farm name + total acreage top-left overlay
- Zoom controls top-right

**On plot tap:**
- Detail panel slides up from bottom
- Shows: crop progress bar, size, season cost, last activity, days to harvest
- Three action buttons: Activity Log, Inputs Used, Full Details

### 5.2 Dashboard View

**Sections (top to bottom):**

1. **Greeting + date** — "Good morning, [Owner Name]"
2. **Alert banner** — highlighted strip if any alerts exist
3. **4 metric cards** — Active plots, Season spend, Expected revenue, Manager last logged
4. **Plot overview card** — list of all plots with health status pills
5. **Alerts card** — detailed alert list with icons
6. **Yesterday's farm diary** — what manager logged, tomorrow's plan
7. **Inventory status** — items with stock levels, red if low
8. **Upcoming harvests** — timeline of harvest dates

### 5.3 Manager Daily Diary Screen

Simple mobile-first form. Manager fills every evening in 5–7 minutes:
- Which plots were worked on (multi-select)
- Activity type per plot (irrigation / weeding / spraying / fertilizer / other)
- Worker count + hours
- Any inputs used (select from inventory, enter quantity — auto-deducts stock)
- Crop health observation (Good / Average / Concern) + optional photo
- Free text notes
- Tomorrow's plan
- Submit button

### 5.4 Design System

- **Font:** System sans-serif, clean
- **Primary color:** `#1D9E75` (teal-green — farm feel)
- **Danger:** `#E24B4A`
- **Warning:** `#BA7517`
- **Cards:** White background, `border-radius: 12px`, `0.5px border`
- **Status pills:** Rounded, color-coded, 10-12px font
- **Mobile first** — manager uses on phone in the field
- **Offline support planned** — service worker for diary submission queue

---

## 6. Database Schema

### Storage Strategy

All files (images, PDFs, bills, receipts) go to **Supabase Storage**. The database stores only the file path. One `media_files` table handles all entities polymorphically.

**Supabase Storage Buckets:**
```
farm-photos/       → crop health photos, field photos
inventory-docs/    → purchase bills, vendor invoices (PDF/image)
harvest-docs/      → harvest photos, weighment slips
sales-docs/        → payment receipts, buyer contracts
diary-media/       → manager's daily photo attachments
```

**`media_files` table — polymorphic file store:**
```
entity_type          entity_id    file_type   use case
inventory_purchase   uuid         pdf         Vendor bill / invoice
inventory_purchase   uuid         image       Photo of receipt
crop_health_log      uuid         image       Yellowing leaf photo
harvest              uuid         image       Harvest quantity photo
sale                 uuid         pdf         Payment receipt
daily_diary          uuid         image       Field photo
```

---

### SQLAlchemy Models (Python)

#### `farms`
```python
class Farm(Base):
    __tablename__ = "farms"
    id: uuid (PK)
    name: str
    location: str
    total_acres: float
    owner_id: uuid (FK → auth.users)
    geo_bounds: dict  # GeoJSON polygon of entire farm
    created_at: datetime
```

#### `plots`
```python
class Plot(Base):
    __tablename__ = "plots"
    id: uuid (PK)
    farm_id: uuid (FK → farms)
    label: str           # "A", "B", "C" etc
    acres: float
    soil_type: str       # "loamy", "clay", "sandy"
    water_source: str    # "borewell", "canal", "rain-fed"
    geo_polygon: dict    # GeoJSON — drawn on Mapbox map
    status: str          # "active", "fallow", "preparation"
```

#### `crop_templates`
```python
class CropTemplate(Base):
    __tablename__ = "crop_templates"
    id: uuid (PK)
    farm_id: uuid (FK → farms)
    crop_name: str       # "Wheat", "Rice", "Mustard"
    duration_days: int   # 90, 120, 130
    activity_schedule: list[dict]
    # Example:
    # [
    #   {"day": 0,  "type": "irrigation",  "label": "First irrigation"},
    #   {"day": 7,  "type": "fertilizer",  "label": "Basal dose DAP"},
    #   {"day": 21, "type": "weeding",     "label": "First weeding"},
    #   {"day": 45, "type": "fertilizer",  "label": "Top dressing urea"},
    #   {"day": 85, "type": "harvest",     "label": "Harvest window"},
    # ]
    expected_yield_per_acre: float  # in kg
```

#### `crop_cycles`
```python
class CropCycle(Base):
    __tablename__ = "crop_cycles"
    id: uuid (PK)
    plot_id: uuid (FK → plots)
    template_id: uuid (FK → crop_templates)
    sow_date: date
    expected_harvest_date: date   # auto = sow_date + template.duration_days
    actual_harvest_date: date | None
    status: str                   # "active", "harvested", "failed"
    season: str                   # "kharif_2025", "rabi_2025"
    budget: float                 # planned spend for this cycle
```

#### `activities`
```python
class Activity(Base):
    __tablename__ = "activities"
    id: uuid (PK)
    crop_cycle_id: uuid (FK → crop_cycles)
    activity_type: str    # "irrigation", "weeding", "fertilizer", "spraying", "harvest"
    label: str            # human-readable name
    scheduled_date: date  # auto-generated from template
    completed_date: date | None
    worker_count: int | None
    labor_hours: float | None
    labor_cost: float | None
    notes: str | None
    status: str           # "pending", "done", "skipped"
```

#### `inventory_items`
```python
class InventoryItem(Base):
    __tablename__ = "inventory_items"
    id: uuid (PK)
    farm_id: uuid (FK → farms)
    name: str             # "DAP", "Urea", "Wheat Seeds", "Chlorpyrifos"
    category: str         # "seed", "fertilizer", "chemical", "fuel", "other"
    unit: str             # "kg", "bag", "litre", "bottle"
    current_stock: float  # auto-updated on purchase/issue
    min_threshold: float  # alert fires when current_stock < this
    cost_per_unit: float  # last purchase price (auto-updated)
```

#### `inventory_purchases`
```python
class InventoryPurchase(Base):
    __tablename__ = "inventory_purchases"
    id: uuid (PK)
    item_id: uuid (FK → inventory_items)
    purchase_date: date
    quantity: float
    unit_price: float
    total_cost: float     # quantity × unit_price
    vendor_name: str
    invoice_number: str | None
    notes: str | None
    # Bill/invoice PDF or image stored in Supabase Storage
    # Linked via media_files WHERE entity_type='inventory_purchase'
```

#### `inventory_issues`
```python
class InventoryIssue(Base):
    __tablename__ = "inventory_issues"
    id: uuid (PK)
    item_id: uuid (FK → inventory_items)
    crop_cycle_id: uuid (FK → crop_cycles)  # cost attribution
    activity_id: uuid | None (FK → activities)
    issue_date: date
    quantity: float
    total_cost: float     # quantity × item.cost_per_unit
    purpose: str          # "basal dose", "top dressing", "pest control"
    issued_by: uuid (FK → auth.users)
```

#### `harvests`
```python
class Harvest(Base):
    __tablename__ = "harvests"
    id: uuid (PK)
    crop_cycle_id: uuid (FK → crop_cycles)
    harvest_date: date
    quantity_kg: float
    quality_grade: str    # "A", "B", "C"
    storage_location: str | None
    notes: str | None
    # Photos linked via media_files WHERE entity_type='harvest'
```

#### `sales`
```python
class Sale(Base):
    __tablename__ = "sales"
    id: uuid (PK)
    harvest_id: uuid (FK → harvests)
    sale_date: date
    buyer_name: str
    buyer_contact: str | None
    quantity_sold: float
    rate_per_unit: float   # ₹ per kg/quintal
    total_revenue: float   # quantity_sold × rate_per_unit
    payment_status: str    # "pending", "partial", "received"
    payment_date: date | None
    notes: str | None
    # Payment receipt PDF linked via media_files WHERE entity_type='sale'
```

#### `crop_health_logs`
```python
class CropHealthLog(Base):
    __tablename__ = "crop_health_logs"
    id: uuid (PK)
    crop_cycle_id: uuid (FK → crop_cycles)
    log_date: date
    health_rating: str    # "good", "average", "concern"
    issue_tags: list[str] # ["yellowing", "pest_attack", "waterlogging", "drought"]
    notes: str | None
    logged_by: uuid (FK → auth.users)
    # Photos linked via media_files WHERE entity_type='crop_health_log'
```

#### `daily_diary`
```python
class DailyDiary(Base):
    __tablename__ = "daily_diary"
    id: uuid (PK)
    farm_id: uuid (FK → farms)
    diary_date: date
    logged_by: uuid (FK → auth.users)
    summary: str
    plot_activities: dict   # JSON: {plot_id: {activity, workers, notes}}
    tomorrows_plan: str | None
    submitted_at: datetime
    # Photos linked via media_files WHERE entity_type='daily_diary'
```

#### `alerts`
```python
class Alert(Base):
    __tablename__ = "alerts"
    id: uuid (PK)
    farm_id: uuid (FK → farms)
    alert_type: str     # "health_concern", "low_stock", "harvest_due",
                        #  "diary_missing", "budget_exceeded", "payment_pending"
    severity: str       # "info", "warning", "critical"
    message: str
    entity_type: str    # "crop_cycle", "inventory_item", "sale" etc
    entity_id: uuid     # tap to navigate directly to the record
    is_read: bool
    created_at: datetime
```

#### `media_files`
```python
class MediaFile(Base):
    __tablename__ = "media_files"
    id: uuid (PK)
    entity_type: str    # "inventory_purchase", "harvest", "sale",
                        #  "crop_health_log", "daily_diary"
    entity_id: uuid
    file_type: str      # "image", "pdf", "document"
    bucket: str         # Supabase Storage bucket name
    storage_path: str   # path within bucket
    original_name: str
    file_size_bytes: int
    mime_type: str
    uploaded_by: uuid (FK → auth.users)
    created_at: datetime
```

---

## 7. Core Business Logic (Python Services)

### 7.1 Seed Issue Trigger — `crop_service.py`

When manager issues seeds from inventory, this is the trigger for everything:

```python
async def start_crop_cycle(
    plot_id: UUID,
    template_id: UUID,
    sow_date: date,
    seed_item_id: UUID,
    seed_quantity: float,
    db: AsyncSession
) -> CropCycle:
    # 1. Create crop cycle
    cycle = CropCycle(plot_id=plot_id, template_id=template_id, sow_date=sow_date)
    cycle.expected_harvest_date = sow_date + timedelta(days=template.duration_days)

    # 2. Auto-generate all activities from template schedule
    for activity_def in template.activity_schedule:
        activity = Activity(
            crop_cycle_id=cycle.id,
            activity_type=activity_def["type"],
            scheduled_date=sow_date + timedelta(days=activity_def["day"]),
            label=activity_def["label"],
            status="pending"
        )
        db.add(activity)

    # 3. Issue seeds from inventory (reduces stock, attributes cost)
    await inventory_service.issue_item(
        item_id=seed_item_id,
        quantity=seed_quantity,
        crop_cycle_id=cycle.id,
        purpose="sowing"
    )

    # 4. Update plot status to active
    await plot_service.set_status(plot_id, "active")

    return cycle
```

### 7.2 P&L Calculation — `cost_service.py`

```python
async def get_crop_cycle_pnl(cycle_id: UUID, db: AsyncSession) -> dict:
    # Input costs from inventory issues
    input_cost = await db.scalar(
        select(func.sum(InventoryIssue.total_cost))
        .where(InventoryIssue.crop_cycle_id == cycle_id)
    ) or 0

    # Labor costs from activities
    labor_cost = await db.scalar(
        select(func.sum(Activity.labor_cost))
        .where(Activity.crop_cycle_id == cycle_id)
    ) or 0

    # Revenue from sales
    revenue = await db.scalar(
        select(func.sum(Sale.total_revenue))
        .join(Harvest)
        .where(Harvest.crop_cycle_id == cycle_id)
    ) or 0

    total_cost = input_cost + labor_cost
    return {
        "input_cost": input_cost,
        "labor_cost": labor_cost,
        "total_cost": total_cost,
        "revenue": revenue,
        "profit": revenue - total_cost,
        "margin_pct": round(((revenue - total_cost) / revenue * 100), 1) if revenue else 0
    }
```

### 7.3 Alert Engine — `alert_service.py`

Runs as a Celery scheduled task every morning at 6 AM:

```python
async def run_daily_alert_check(farm_id: UUID, db: AsyncSession):
    checks = [
        check_diary_missing,       # no diary submitted yesterday
        check_low_inventory,       # stock below min_threshold
        check_harvest_due,         # harvest within 10 days
        check_irrigation_gap,      # no irrigation logged for 5+ days
        check_budget_exceeded,     # cycle spend > budget by 20%
        check_pending_payments,    # payment_status=pending for 15+ days
        check_health_concerns,     # health_rating='concern' not followed up
    ]
    for check in checks:
        await check(farm_id, db)
```

### 7.4 File Upload — `storage_service.py`

```python
async def upload_file(
    file: UploadFile,
    entity_type: str,
    entity_id: UUID,
    uploaded_by: UUID,
    db: AsyncSession
) -> MediaFile:
    bucket = BUCKET_MAP[entity_type]  # maps entity to correct bucket
    path = f"{entity_type}/{entity_id}/{uuid4()}_{file.filename}"

    # Upload to Supabase Storage
    supabase.storage.from_(bucket).upload(path, await file.read())

    # Store reference in DB
    media = MediaFile(
        entity_type=entity_type,
        entity_id=entity_id,
        bucket=bucket,
        storage_path=path,
        original_name=file.filename,
        file_size_bytes=file.size,
        mime_type=file.content_type,
        uploaded_by=uploaded_by
    )
    db.add(media)
    return media

BUCKET_MAP = {
    "inventory_purchase": "inventory-docs",
    "crop_health_log": "farm-photos",
    "harvest": "harvest-docs",
    "sale": "sales-docs",
    "daily_diary": "diary-media",
}
```

---

## 8. API Endpoints (FastAPI)

### Auth
```
POST   /auth/login
POST   /auth/logout
GET    /auth/me
```

### Farm & Plots
```
GET    /farms/{farm_id}
GET    /farms/{farm_id}/plots
POST   /farms/{farm_id}/plots
PUT    /plots/{plot_id}
GET    /plots/{plot_id}/summary       # full status for map popup
```

### Crop Cycles
```
POST   /plots/{plot_id}/cycles/start  # triggers seed issue + auto-activities
GET    /plots/{plot_id}/cycles
GET    /cycles/{cycle_id}
GET    /cycles/{cycle_id}/pnl         # profit & loss
```

### Activities
```
GET    /cycles/{cycle_id}/activities
PUT    /activities/{id}/complete       # mark done + log workers/cost
```

### Inventory
```
GET    /farms/{farm_id}/inventory
POST   /inventory/items               # add new item to master
POST   /inventory/purchase            # record purchase + upload bill
POST   /inventory/issue               # issue to plot (reduces stock)
GET    /inventory/items/{id}/history  # all transactions
```

### Harvest & Sales
```
POST   /cycles/{cycle_id}/harvest     # record harvest + upload photo
POST   /harvests/{id}/sales           # record sale + upload receipt
GET    /harvests/{id}/sales
```

### Diary
```
POST   /diary                         # manager submits daily diary
GET    /farms/{farm_id}/diary         # owner views diary feed
GET    /diary/{date}                  # specific day
```

### Dashboard
```
GET    /farms/{farm_id}/dashboard     # all data for owner morning screen
GET    /farms/{farm_id}/alerts        # all unread alerts
PUT    /alerts/{id}/read
```

### Media
```
POST   /media/upload                  # upload any file, returns media_file record
GET    /media/{entity_type}/{entity_id}   # all files for an entity
DELETE /media/{id}
```

---

## 9. Features — Development Phases

### Phase 1 — Foundation
- [ ] FastAPI project setup with SQLAlchemy + Supabase
- [ ] Auth (login, JWT, roles)
- [ ] Farm + Plot CRUD
- [ ] Crop Templates
- [ ] Basic React shell with Field + Dashboard tabs
- [ ] Mapbox integration with static plot polygons

### Phase 2 — Core Operations
- [ ] Crop cycle start (seed issue trigger)
- [ ] Auto-activity generation from template
- [ ] Daily diary submission (manager)
- [ ] Inventory master + purchase recording
- [ ] File upload (bills, receipts, photos)
- [ ] Inventory issue + auto stock deduction

### Phase 3 — Visibility & Alerts
- [ ] Owner dashboard with all sections
- [ ] Crop health logging with photos
- [ ] Alert engine (Celery tasks)
- [ ] WhatsApp notifications via Twilio
- [ ] Real-time map overlay with plot status

### Phase 4 — Harvest & Financials
- [ ] Harvest recording
- [ ] Sales recording
- [ ] P&L per crop cycle
- [ ] Season summary reports (PDF via WeasyPrint)
- [ ] Budget vs actual tracking

### Phase 5 — Intelligence
- [ ] Season-over-season comparison
- [ ] Yield benchmarking by plot and crop
- [ ] Cost per quintal analysis
- [ ] AI chat agent to query farm data (Anthropic SDK)

### Phase 6 — SaaS
- [ ] Multi-farm support
- [ ] Subscription billing (Razorpay)
- [ ] Onboarding flow
- [ ] Hindi / regional language support for manager UI
- [ ] Offline diary mode with sync

---

## 10. Key Design Decisions

1. **Python everywhere possible** — FastAPI, SQLAlchemy, Pydantic, Celery, Shapely, ReportLab, Twilio SDK. Only React for UI.
2. **Seed issue is the trigger** — crop cycle, activities, and cost tracking all start when seeds are issued from inventory. Nothing starts before that.
3. **Media is polymorphic** — one `media_files` table handles all documents and photos. Never store files in the database.
4. **Costs are derived, not entered** — P&L is always calculated from actual inventory issues + labor logged. No manual cost entry.
5. **Manager UI must be ≤3 taps** — if logging something takes more than 3 taps, redesign it. Manager compliance is everything.
6. **Alerts are proactive** — the owner should never have to check. The app tells him when something needs attention.
7. **WhatsApp over email** — Indian farm owners check WhatsApp, not email. All critical alerts go to WhatsApp.
8. **GeoJSON for plots** — `geo_polygon` stored as GeoJSON. Rendered as Mapbox polygon layers. Shapely used for area calculations in Python.
9. **Row Level Security** — Supabase RLS policies enforce that owners only see their own farm data. FastAPI also enforces this at the service layer.
10. **Offline first (Phase 6)** — diary submissions queued locally if no internet, synced when connection returns.

---

## 11. Environment Variables

```bash
# Backend (.env)
DATABASE_URL=postgresql+asyncpg://...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=...
SUPABASE_ANON_KEY=...
JWT_SECRET=...
REDIS_URL=redis://...
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
ANTHROPIC_API_KEY=...            # for AI features in Phase 5

# Frontend (.env)
VITE_API_URL=https://api.yourfarm.app
VITE_MAPBOX_TOKEN=...
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

---

## 12. Python Requirements

```
# requirements.txt
fastapi==0.111.0
uvicorn[standard]==0.29.0
sqlalchemy[asyncio]==2.0.30
asyncpg==0.29.0
pydantic==2.7.1
pydantic-settings==2.2.1
python-jose[cryptography]==3.3.0
python-multipart==0.0.9
supabase==2.4.2
celery==5.4.0
redis==5.0.4
shapely==2.0.4
geojson==3.1.0
weasyprint==62.3
twilio==9.0.5
anthropic==0.26.0
alembic==1.13.1
pytest==8.2.0
pytest-asyncio==0.23.6
httpx==0.27.0
python-dotenv==1.0.1
```
