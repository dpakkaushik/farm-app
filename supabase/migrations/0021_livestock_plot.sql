-- Livestock is kept somewhere. Until now the database had no way to say where.
--
-- An animal record had no link to land, so the Field map could tell you what was
-- growing on Plot B and nothing about the buffalo standing on it. Trees have had
-- tree_plantings.plot_id since 0008; this is the same idea for the herd and the
-- flocks, and it's what lets the plot card show "3 head · 22 birds here".
--
-- Nullable, and ON DELETE SET NULL, both deliberately:
--   * An animal with no plot is a normal, permanent state. Pets are never pinned
--     to a plot — a dog roams the farm — and stock can simply be unassigned.
--   * Deleting a plot must never delete the herd standing on it. The animals
--     survive the field and fall back to unassigned.
--
-- No new table, so the four RLS policies on livestock_master already cover this
-- column. Nothing to add.
alter table livestock_master
  add column if not exists plot_id uuid references plots(id) on delete set null;

-- The plot card reads this per plot on every open.
create index if not exists idx_livestock_master_plot_id
  on livestock_master(plot_id) where plot_id is not null;
