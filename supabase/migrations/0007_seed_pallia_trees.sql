-- Pallia Farm's tree register, transcribed from the handwritten page.
--
-- This is real data for one real farm, not a generic fixture -- which is why it
-- is a separate migration from 0006 (the portable schema). On any other farm it
-- is a no-op.
--
-- 20 species. 217 standing trees, plus 1,657 eucalyptus saplings in the Plot A
-- nursery. Safeda (eucalyptus) carries two plantings: 12 on a boundary and the
-- nursery -- exactly the case the species/planting split exists for.
--
-- The register's "आम का बड़ा पेड़ (17)" and "आम का छोटा (26)" are merged into one
-- Mango species with two plantings. Big-vs-small is age, and age belongs in
-- planted_on, not in the name.
--
-- WHAT IS DELIBERATELY LEFT BLANK: every boundary planting goes in with no side
-- selected and no planted_on date, because nobody knows them yet. Writing a
-- plausible-looking "north boundary, planted 2018" would be worse than a blank:
-- a blank asks to be filled, a fabricated value gets trusted forever. The manager
-- fills these in from the field.
--
-- Idempotent: guarded on the farm having no tree species yet, so re-running does
-- nothing.

do $$
declare
  v_farm_id   uuid;
  v_plot_a_id uuid;
  v_species   record;
  v_species_id uuid;
  v_planting_id uuid;
begin
  select id into v_farm_id from farms where name = 'Pallia Farm' limit 1;
  if v_farm_id is null then
    raise notice 'Pallia Farm not found -- skipping tree seed.';
    return;
  end if;

  if exists (select 1 from tree_species where farm_id = v_farm_id) then
    raise notice 'Pallia Farm already has tree species -- skipping seed.';
    return;
  end if;

  select id into v_plot_a_id from plots where farm_id = v_farm_id and name = 'Plot A' limit 1;
  if v_plot_a_id is null then
    raise exception 'Plot A not found for Pallia Farm -- the eucalyptus nursery has nowhere to go.';
  end if;

  -- Species, and the single boundary planting each one starts with.
  for v_species in
    select * from (values
      -- name_local,      name_en,               purpose,  qty
      ('सेमल',           'Semal (silk cotton)',  'timber',  59),
      ('शीशम',           'Shisham (rosewood)',   'timber',  18),
      ('सफेदा',          'Safeda (eucalyptus)',  'timber',  12),
      ('सागवान',         'Sagwan (teak)',        'timber',   3),
      ('आम',             'Mango',                'fruit',   43),
      ('लीची',           'Litchi',               'fruit',   26),
      ('आलूबुखारा',      'Plum',                 'fruit',   11),
      ('शहतूत',          'Mulberry',             'fruit',    8),
      ('सेव',            'Apple',                'fruit',    7),
      ('अमरूद',          'Guava',                'fruit',    6),
      ('कटहल',           'Jackfruit',            'fruit',    4),
      ('मीठा',           null,                   'fruit',    4),  -- name as written; no translation invented
      ('पपीता',          'Papaya',               'fruit',    3),
      ('बड़हर',          'Badhar (monkey jack)', 'fruit',    3),
      ('आंवला',          'Amla (gooseberry)',    'fruit',    2),
      ('नींबू',          'Lemon',                'fruit',    2),
      ('नाशपाती',        'Pear',                 'fruit',    2),
      ('जामुन',          'Jamun (java plum)',    'fruit',    2),
      ('चीकू',           'Chikoo (sapota)',      'fruit',    1),
      ('आड़ू',           'Peach',                'fruit',    1)
    ) as t(name_local, name_en, purpose, qty)
  loop
    insert into tree_species (farm_id, name_local, name_en, purpose)
    values (v_farm_id, v_species.name_local, v_species.name_en, v_species.purpose)
    returning id into v_species_id;

    insert into tree_plantings (farm_id, species_id, location_type, plot_id, boundary_sides, planted_on)
    values (v_farm_id, v_species_id, 'boundary', null, '[]'::jsonb, null)
    returning id into v_planting_id;

    insert into tree_count_logs (farm_id, planting_id, log_date, change_type, quantity, reason)
    values (v_farm_id, v_planting_id, current_date, 'opening_balance', v_species.qty,
            'Transcribed from the handwritten farm register');
  end loop;

  -- The eucalyptus nursery: a second planting of Safeda, in Plot A.
  select id into v_species_id from tree_species
    where farm_id = v_farm_id and name_local = 'सफेदा';

  insert into tree_plantings (farm_id, species_id, location_type, plot_id, boundary_sides, planted_on, notes)
  values (v_farm_id, v_species_id, 'plot', v_plot_a_id, '[]'::jsonb, null, 'Nursery')
  returning id into v_planting_id;

  insert into tree_count_logs (farm_id, planting_id, log_date, change_type, quantity, reason)
  values (v_farm_id, v_planting_id, current_date, 'opening_balance', 1657,
          'Transcribed from the handwritten farm register');

  raise notice 'Seeded Pallia Farm: 20 tree species, 21 plantings.';
end $$;
