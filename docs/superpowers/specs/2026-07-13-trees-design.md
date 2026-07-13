# Trees — Design

**Date:** 2026-07-13
**Status:** Approved, pending implementation

## Problem

The farm has ~217 standing trees and a 1,657-sapling eucalyptus nursery. None of it is in
the app. It lives on one handwritten page in a register, where the count is rewritten by
hand and drifts. Some trees are fruit, some are timber, and the two earn money in
completely different ways.

## What trees are, and what they are not

A tree is **not a crop.** `crop_cycles` is built around `sow_date` → `expected_harvest_start`
→ season. A mango tree has been standing for twenty years and will stand for twenty more; a
teak tree has exactly one "harvest", twenty-five years out. Neither has a season. Forcing
trees through `crop_cycles` would corrupt the P&L math and the field map.

A tree **is** shaped like livestock: counted in groups, born and dying over time, producing
revenue. `livestock_master` + `livestock_count_logs` + `livestock_revenue` already solve this
shape. Trees copy that pattern rather than invent a new one.

## Money: the farm leases, it does not harvest

Fruit is sold **on the tree** to a thekedar for a lump sum. He harvests. This is the single
most important fact in this design, because it deletes an entire subsystem: there is no
per-kg harvest logging, no picking sessions, no grading. What matters is *which trees, which
season, which thekedar, how much, has he paid.*

Timber has the same shape — a buyer, a lump sum, a payment status — so **one revenue table
serves both**, distinguished by `revenue_type`. This mirrors `livestock_revenue`.

## Data model

Five tables. All carry `farm_id`, all get RLS with the four standard policies (CLAUDE.md §6).

### `tree_species` — the plant
`name_local` (आम — what the manager reads) · `name_en` · `purpose` (`fruit` | `timber`) ·
`notes` · `photo_path`

Created once, then reused. Pre-seeded so the manager picks from a list instead of typing
Hindi on a phone keyboard.

### `tree_plantings` — a batch of that plant, in one place, planted at one time
`species_id` · `planted_on` · `location_type` (`plot` | `boundary`) · `plot_id` ·
`boundary_sides` (jsonb: north/south/east/west, multi-select, only when boundary) · `notes`

**No quantity column.** See below.

A planting is a real object, and it is the unit that matters. 1,657 eucalyptus in the Plot A
nursery and 12 on a boundary are different ages, different places, different fates. Flattening
them into "Eucalyptus: 1669" would destroy exactly the information you need when 40 of them die.

### `tree_count_logs` — the ledger the count is derived from
`planting_id` · `log_date` · `change_type` (`planted` | `died` | `felled` | `transplanted` |
`correction`) · `quantity` (**signed**) · `reason` · `notes`

**The count is `sum(quantity)`, always. It is never stored and never typed in.** Creating a
planting writes its opening `planted` row automatically. This is the entire fix for the paper
register: a number a human rewrites will drift, a number derived from a ledger cannot.

Deliberate deviation from `livestock_count_logs`, which leaves the sign implicit in
`change_type`. Signed quantity makes `current = sum(quantity)` a single unbreakable rule and
lets `correction` work naturally in both directions.

`transplanted` exists from day one because those 1,657 saplings *will* leave the nursery: the
ledger moves them out of the nursery planting and into new plantings, and the species total
stays honest across the move.

### `tree_revenue` — money in
`revenue_type` (`fruit_lease` | `timber_sale`) · `season_year` · `buyer_id` (the thekedar —
reuses the existing `buyers` table) · `agreement_date` · `amount` · `payment_status` ·
`amount_received` · `attachment_path` (the agreement paper) · `notes`

### `tree_revenue_items` — which plantings a lease or sale covered
`revenue_id` · `planting_id`

This is what makes "what has mango earned over four seasons" answerable, instead of only
"what did we lease last year."

A timber sale also writes a `felled` row to the count ledger, so the register stays true to
the ground. Application logic, not a DB trigger — a farm can sell standing timber long before
anyone cuts it.

## Map

Trees render as small dots. **No GPS survey is required, and none should be implied.**

A planting already knows its species (colour), its count, and its location (a plot polygon, or
named sides of one). That is enough to synthesize dots: scattered inside the polygon for a
plot planting, spaced along the selected edges for a boundary planting. Which polygon edge is
"north" is computed from the corner coordinates the plot already stores.

Three rules:

- **Seeded from the planting id**, not random. Dots that jitter on every pan look broken.
- **Clustered above ~200.** 1,657 saplings as 1,657 dots is a brown smear, not information.
  Mapbox clusters natively.
- **Rendered as texture, not as pins.** Soft and translucent, reading the way a hatch pattern
  reads as "forest" on a survey map — deliberately a different visual language from the real
  GPS markers. A dot on a map *looks* like a fact. These dots are not facts. They say "17
  mangoes are somewhere along this boundary," never "this mango is here." The styling must not
  let anyone confuse the two.

`tree_plantings` gets an optional `geo_points` field, empty by default. If someone ever walks
the orchard tapping each tree, it fills in, and the renderer — which prefers real points and
falls back to synthetic from day one — upgrades itself with no schema change.

## UI

One new page, `Trees.jsx`, built like `Livestock.jsx`.

- Fruit / Timber filter. Species list with live totals in Hindi.
- Tap a species → its plantings, each with count, location, planted-on date.
- Tap a planting → its count ledger and lease history.
- Two actions, both ≤3 taps (CLAUDE.md rule 5): **update count** (planted/died/felled) and
  **record lease**.
- Every seeded species and planting is **editable**. The seed is a starting point, not a
  claim to be right.

## Seed data

From the handwritten register. 20 species; Safeda carries two plantings.

| Species | English | Qty | Type | Location |
|---|---|---|---|---|
| सेमल Semal | Silk cotton | 59 | Timber | boundary |
| शीशम Shisham | Indian rosewood | 18 | Timber | boundary |
| सफेदा Safeda | Eucalyptus | 12 | Timber | boundary |
| सागवान Sagwan | Teak | 3 | Timber | boundary |
| आम Aam | Mango | 43 | Fruit | boundary |
| लीची Litchi | Lychee | 26 | Fruit | boundary |
| आलूबुखारा Alubukhara | Plum | 11 | Fruit | boundary |
| शहतूत Shahtoot | Mulberry | 8 | Fruit | boundary |
| सेव Sev | Apple | 7 | Fruit | boundary |
| अमरूद Amrood | Guava | 6 | Fruit | boundary |
| कटहल Kathal | Jackfruit | 4 | Fruit | boundary |
| मीठा Mitha | Sweet lime | 4 | Fruit | boundary |
| पपीता Papita | Papaya | 3 | Fruit | boundary |
| बड़हर Badhar | Monkey jack | 3 | Fruit | boundary |
| आंवला Amla | Gooseberry | 2 | Fruit | boundary |
| नींबू Nimbu | Lemon | 2 | Fruit | boundary |
| नाशपाती Nashpati | Pear | 2 | Fruit | boundary |
| जामुन Jamun | Java plum | 2 | Fruit | boundary |
| चीकू Chikoo | Sapota | 1 | Fruit | boundary |
| आड़ू Aadu | Peach | 1 | Fruit | boundary |
| सफेदा Safeda | Eucalyptus (nursery) | 1657 | Timber | **Plot A** |

**217 standing trees + 1,657 nursery saplings.**

Mango is merged: the register's "आम का बड़ा पेड़ (17)" and "आम का छोटा (26)" are one species
with two plantings, not two species. Big-vs-small is age, and age belongs in `planted_on`, not
in the name.

Every seeded planting except the nursery gets `location_type = boundary` with **no side
selected** and **no planted-on date** — because we do not know them. The manager fills them in
from the field. Guessing a plausible-looking value and writing it to the database would be
worse than leaving it blank: a blank asks to be filled, a wrong value gets trusted.

## Not building (YAGNI)

- **Cost attribution to trees.** The manager will not reliably log which sack of DAP went to
  the litchi, and the money is small next to the field crops. The compliance cost exceeds the
  value. Revisit only if asked.
- **Per-kg harvest logging.** The farm leases. This is the thekedar's problem, not ours.
- **Individual tree tagging.** 217 trees do not need 217 rows.
- **Installment history on leases.** `payment_status` + `amount_received` records "partially
  paid." If per-payment history turns out to matter, it becomes an `expense_payments`-style
  child table — a clean addition, not a rewrite.

## Testing

- The ledger invariant: a planting's count equals `sum(quantity)` of its logs, across every
  sequence of planted/died/felled/transplanted/correction. This is the only real logic in the
  feature and the one thing that must not break.
- Transplant conserves trees: moving N saplings out of the nursery and into a new planting
  leaves the species total unchanged.
- RLS: farm B cannot see, insert, or update farm A's trees.

## Open

- **मीठा = sweet lime (मौसमी)?** Best guess from the register. Editable if wrong.
