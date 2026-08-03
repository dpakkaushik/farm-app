# Handoff — livestock tabs, plot card, expenses move

Written 2026-08-03 at the end of a long session. Everything below is either
**done and pushed** or **agreed and not built**. Nothing is half-built.

---

## Done in this session

| Commit | What |
|---|---|
| `2466059` | Plot detail card rewritten: crop rows, money + margin, trees, livestock. `livestock_master.plot_id` (migration 0021) + "Kept on plot" dropdown. Pallia data assigned (0022). |
| `104b39c` | Per-face revenue types — a flock no longer offers milk or wool. |
| *this one* | Expenses moved from Resources → Today, and Livestock's expense view links to it. |

### Decisions already made — do not re-litigate

1. **Livestock attaches to plots for birds and animals only, never pets.** A dog
   roams the farm. Owner's explicit call.
2. **Assignment happens on the livestock form**, not from the plot card. The plot
   card is read-only.
3. **A flock splits across plots as two `livestock_master` rows**, moved with
   `transfer_out` / `transfer_in` count logs — `trg_sync_livestock_count` already
   scores those as −/+, so the farm total holds and no fake sale or death is
   recorded. Purchase price is apportioned by head.
4. **Expenses lives on Today**, not Resources. Money entry is a daily act; the two
   Resources tabs are registers of things the farm owns.

---

## Pending — in the order I'd do it

### 1. Livestock tab restructure (agreed with owner, not started)

The owner's critique: Health should not be a top-level tab, and Expense/Revenue
should be. They are currently a **sub-toggle inside Finance**
(`livestock/finance.jsx`, the `sub` state), one level too deep to find.

Target shape — the faces diverge, which is consistent with how this screen is built:

| Face | Tabs |
|---|---|
| Birds | 🐓 Flocks · 💰 Revenue · 🧾 Expenses |
| Herd | 🐄 Herd · 💰 Revenue · 🧾 Expenses · 🩺 Health |
| Pets | 🐕 Pets · 🧾 Costs |

Work:

- `livestock/ui.jsx` — replace each `GROUPS` entry's `listTab` / `moneyTab` with a
  `tabs: [{key,label}]` array. Those two properties exist only to build the tab
  bar in `Livestock.jsx`, so they can go.
- `Livestock.jsx` — build the tab bar from `face.tabs`. Keep back-compat:
  `?tab=finance` from an old link must land on `revenue`, the same way `?group=`
  is still honoured after the three-page split.
- `livestock/finance.jsx` — take a `mode` prop (`'revenue' | 'expenses'`) and drop
  the internal sub-toggle. **Keep the Expenses / Revenue / Net strip on both
  modes** — Net is the number that answers "is this flock paying for itself", and
  splitting the tabs would otherwise lose it. Per-animal P&L table belongs on
  Revenue; the per-pet cost table on Costs.

### 2. Health onto the cards for Birds and Pets (Herd keeps its tab)

**Do not simply delete the Health tab.** Two things on it cannot live on a card,
and both were the answer to an earlier owner objection:

- the **All animals** scope toggle (`health.jsx:183-195`) — one vet trip covering
  the buffalo *and* the dog is a single entry from any page;
- **Checkups due** (`health.jsx:204-226`) — a due-date list is inherently
  cross-animal, and the banner above the tabs links into it.

So: Herd keeps the tab as the farm-wide surface. Birds and Pets get health on the
card instead, and the card must absorb the **visit history**, not just the status
pill, or the record becomes unreachable from those pages. Reuse the
expandable-panel pattern already on the flock card (tap the bird count → count
logs) in `livestock/animals.jsx`.

`AddHealthModal` in `health.jsx` already accepts a `preselect` prop that nothing
passes — that is the hook for a "Log visit" action on a card. It will need
exporting.

For birds, note that per-bird vet logs are the wrong model anyway. The real
answer is item 4.

### 3. Prefill the expense form from Livestock

`/today?tab=expenses` now exists and Livestock links to it, but `Expenses.jsx`
**reads no query params** — so the button lands you on a blank form. Worth adding
`&type=livestock&livestock=<id>` so the spend arrives pre-tagged to the flock or
animal you were looking at. `Expenses.jsx:33` already declares the livestock
expense type with the right categories (feed, veterinary, medicine, accessories,
livestock care), so this is wiring, not new UI.

### 4. Poultry batch tracking (bigger; own planning session)

Mortality %, FCR, weight sampling, egg production, age-based vaccination
schedules. **A batch wants the crop-cycle pattern, not the cattle pattern** — a
batch is a cycle with a start, a duration and a close. The Birds face is the
container. This is what makes item 2's bird half genuinely good rather than a
relocated per-animal log.

### 5. Milk yield log

Four of five cattle are female dairy animals. Milk currently enters only as a
`livestock_revenue` row, so the app knows milk *money* but never litres/day per
animal, and never sees milk drunk at home or taken by the calf. Needs a table plus
a fast daily-entry screen.

### 6. Breeding / lactation cycle

Insemination, pregnancy, due date, dry vs milking. Nothing in the schema supports
it. Biggest value for a dairy herd, most design work — worth it once the manager
logs reliably.

### 7. Owner data-entry task, not a code task

Pallia's crop opening-cost figures, entered via ProfileMenu → Opening balances.
Still outstanding from the 0018 work.

---

## Gotchas found the hard way

- **`git commit -m @'…'@` here-strings break** in this environment — PowerShell
  mangles them into pathspecs. Use `git commit -F <file>` or a `` `n ``-joined
  variable.
- **Plot card selection is a plot id, not a plot object.** It used to hold the
  object parsed out of the clicked map feature, which made the card a snapshot:
  tapping a second plot left the first one's numbers on screen. Keep it an id and
  look the row up in `livePlots` on render.
- **Map controls need explicit `z-30`.** The plot card's tap-to-close backdrop is
  `z-10`; anything interactive on the map without a z-index falls under it.
- **`livestock_count_logs` has no check constraint** on `change_type` / `reason`,
  but `sync_livestock_count()` only treats `add`, `opening_balance`, `birth`,
  `transfer_in` as positive. Everything else subtracts.
- **`REVENUE_TYPES` stays complete** even though faces now filter it — it is also
  the lookup that renders stored rows, including historical types a face no longer
  offers.
