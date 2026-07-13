-- 0008 — Give every tree planting a location and a planting date.
--
-- 0007 seeded the register with plot_id null, boundary_sides '[]' and planted_on
-- null, because the handwritten sheet did not record them. That was too literal:
-- the owner asked for provisional values he could correct, and a blank map is
-- worse than an approximate one. So every boundary planting now names a plot and
-- the side(s) it runs along, and every planting has a date.
--
-- THESE ARE PROVISIONAL. They are marked as such in `notes`. The manager edits
-- them from the Trees page against what is actually on the ground.
--
-- Idempotent, and it only writes rows the manager has not already located
-- (plot_id is null) or dated (planted_on is null), so re-running it can never
-- overwrite a real correction with a guess.

do $$
declare
  v_farm_id uuid;
  v_note    text := 'Provisional location/date — confirm on the ground.';
  r         record;
begin
  select id into v_farm_id from farms where name = 'Pallia Farm' limit 1;
  if v_farm_id is null then
    raise notice '0008: no Pallia Farm — skipping';
    return;
  end if;

  -- species name_local -> (plot name, boundary sides, planted_on)
  for r in
    select * from (values
      ('सेमल',     'Plot B',  '["north","east"]', date '2015-07-15'),
      ('शीशम',     'Plot C',  '["west"]',         date '2016-07-10'),
      ('सफेदा',    'Plot D',  '["north"]',        date '2018-07-05'),
      ('सागवान',   'Plot E1', '["east"]',         date '2017-07-20'),
      ('आम',       'Plot F',  '["north","west"]', date '2012-07-08'),
      ('लीची',     'Plot G',  '["south"]',        date '2014-07-12'),
      ('आलूबुखारा', 'Plot H',  '["east"]',         date '2019-02-10'),
      ('शहतूत',    'Plot I',  '["north"]',        date '2016-08-01'),
      ('सेव',      'Plot J',  '["west"]',         date '2020-01-20'),
      ('अमरूद',    'Plot K',  '["south"]',        date '2018-08-15'),
      ('कटहल',     'Plot L',  '["east"]',         date '2015-08-05'),
      ('मीठा',     'Plot M',  '["north"]',        date '2019-08-10'),
      ('पपीता',    'Plot N',  '["south"]',        date '2023-03-15'),
      ('बड़हर',    'Plot O',  '["west"]',         date '2016-09-01'),
      ('आंवला',    'Plot P',  '["east"]',         date '2018-09-10'),
      ('नींबू',     'Plot B',  '["south"]',       date '2020-02-15'),
      ('नाशपाती',  'Plot C',  '["north"]',        date '2019-01-25'),
      ('जामुन',    'Plot D',  '["west"]',         date '2014-08-20'),
      ('चीकू',     'Plot E2', '["south"]',        date '2019-03-05'),
      ('आड़ू',     'Plot F',  '["east"]',         date '2020-01-15')
    ) as t(species_name, plot_name, sides, planted)
  loop
    update tree_plantings tp
    set plot_id        = coalesce(tp.plot_id, pl.id),
        boundary_sides = case when tp.plot_id is null then r.sides::jsonb else tp.boundary_sides end,
        planted_on     = coalesce(tp.planted_on, r.planted),
        notes          = coalesce(tp.notes, v_note)
    from tree_species ts, plots pl
    where tp.species_id      = ts.id
      and ts.farm_id         = v_farm_id
      and ts.name_local      = r.species_name
      and pl.farm_id         = v_farm_id
      and pl.name            = r.plot_name
      and tp.location_type   = 'boundary'
      and (tp.plot_id is null or tp.planted_on is null);
  end loop;

  -- The Plot A safeda nursery already has its plot. It only wants a date.
  update tree_plantings tp
  set planted_on = date '2024-07-01',
      notes      = coalesce(tp.notes, v_note)
  from tree_species ts
  where tp.species_id    = ts.id
    and ts.farm_id       = v_farm_id
    and ts.name_local    = 'सफेदा'
    and tp.location_type = 'plot'
    and tp.planted_on is null;

  -- The register is read in English, so every species needs an English label.
  -- मीठा has no translation worth inventing (it is not sweet lime, and guessing
  -- would put a wrong fruit in the owner's ledger), so it is transliterated.
  update tree_species
  set name_en = 'Meetha'
  where farm_id = v_farm_id and name_local = 'मीठा' and name_en is null;
end $$;
